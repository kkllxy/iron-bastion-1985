import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Effects } from '../entities/Effects';
import { Field } from '../entities/Field';
import { Bullet } from '../entities/Projectile';
import { PowerUp } from '../entities/PowerUp';
import { EnemyTank, muzzleOffset, PlayerTank, Tank, type MoveCtx } from '../entities/Tank';
import {
  CELL,
  Dir,
  ENEMY_DEFS,
  GRID,
  LEVELS,
  PALETTE,
  POWER_DEFS,
  TANK,
  type EnemyKind,
  type PowerKind,
  cellToWorldX,
  cellToWorldZ,
} from './config';
import { MAPS } from './levels';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { Hud, type ActivePower, type Screen } from '../systems/Hud';
import { createSeededRandom } from '../utils/random';

type GameState = 'title' | 'playing' | 'paused' | 'levelclear' | 'gameover' | 'victory';

interface TimedPower {
  kind: 'shield' | 'shovel' | 'freeze';
  remaining: number;
  duration: number;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud: Hud;
  private readonly cameraRig: CameraRig;
  private readonly effects = new Effects();
  private readonly field: Field;
  private readonly player = new PlayerTank();
  private readonly tanksGroup = new THREE.Group();
  private readonly bulletsGroup = new THREE.Group();
  private readonly powerupsGroup = new THREE.Group();

  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private enemies: EnemyTank[] = [];
  private bullets: Bullet[] = [];
  private powerups: PowerUp[] = [];
  private timed: TimedPower[] = [];

  private rng = createSeededRandom(1);
  private state: GameState = 'title';
  private levelIndex = 0;
  private score = 0;
  private lives = 3;
  private enemiesRemaining = 0;
  private spawnIndex = 0;
  private spawnTimer = 0;
  private transitionTimer = 0;

  private frame = 0;
  private runElapsed = 0;
  private hitstop = 0;
  private timeScale = 1;
  private fps = 60;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private spawnEnabled = true;
  private invincibleTest = false;

  private readonly moveCtx: MoveCtx;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.25;

    this.input = new InputController(
      document.querySelector('#touch-stick'),
      document.querySelector('#touch-knob'),
      document.querySelector('#fire-button'),
      document.querySelector('#pause-button'),
      null,
    );
    this.hud = new Hud();
    this.cameraRig = new CameraRig(this.camera);
    this.field = new Field();

    this.moveCtx = {
      field: this.field,
      rng: () => this.rng(),
      blockedByTank: (self, x, z) => this.blockedByTank(self, x, z),
      playerPos: () => ({ x: this.player.x, z: this.player.z }),
      basePos: () => ({
        x: cellToWorldX(this.field.parsed.base.col),
        z: cellToWorldZ(this.field.parsed.base.row),
      }),
    };

    this.scene.add(this.tanksGroup, this.bulletsGroup, this.powerupsGroup, this.effects.group);
    this.buildScene();
    this.tanksGroup.add(this.player.group);
    this.beginLevel(0, true);
    this.setState('title');

    resizeRenderer(this.renderer, this.camera, 2);
    this.cameraRig.fit(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    this.audio.setRng(this.rng);
    this.wireButtons();
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.clearActors();
    this.field.dispose();
    this.effects.dispose();
    this.player.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ---- scene ----
  private buildScene(): void {
    this.scene.background = this.makeBackground();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 34, 78);

    const hemi = new THREE.HemisphereLight('#9fb0d0', '#2a2218', 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d0', 2.2);
    sun.position.set(6, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = GRID * CELL;
    sun.shadow.camera.left = -s / 2 - 2;
    sun.shadow.camera.right = s / 2 + 2;
    sun.shadow.camera.top = s / 2 + 2;
    sun.shadow.camera.bottom = -s / 2 - 2;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#5a7fb0', 0.5);
    fill.position.set(-8, 8, -6);
    this.scene.add(fill);

    this.scene.add(this.makeApron());
    this.scene.add(this.field.group);
  }

  // Large textured platform under the battlefield so the field is framed on an
  // intentional surface instead of a flat void — fixes the low-contrast metric
  // and gives the camera somewhere to sit on widescreen/portrait.
  private makeApron(): THREE.Mesh {
    const size = GRID * CELL * 2.6;
    const tex = this.canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#1a1e27';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(120,140,170,0.08)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= s; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(240,180,41,0.10)';
      ctx.lineWidth = 6;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0.05 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.06;
    mesh.receiveShadow = true;
    return mesh;
  }

  private makeBackground(): THREE.Texture {
    const tex = this.canvasTexture(16, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, PALETTE.bgTop);
      g.addColorStop(1, PALETTE.bgBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    return tex;
  }

  private canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- level lifecycle ----
  private beginLevel(index: number, keepScore: boolean): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    if (!keepScore) this.score = 0;
    this.clearActors();
    this.timed = [];
    this.field.build(MAPS[this.levelIndex]);
    this.scene.add(this.field.group);

    const spawn = this.field.parsed.playerSpawn;
    this.player.reset(cellToWorldX(spawn.col), cellToWorldZ(spawn.row), Dir.N);
    if (this.invincibleTest) this.player.invincible = 9999;

    const cfg = LEVELS[this.levelIndex];
    this.enemiesRemaining = cfg.roster;
    this.spawnIndex = 0;
    this.spawnTimer = 1.0;
    this.setState('playing');
  }

  private startNewGame(): void {
    this.score = 0;
    this.lives = 3;
    this.beginLevel(0, true);
    this.audio.start();
  }

  private clearActors(): void {
    for (const e of this.enemies) {
      this.tanksGroup.remove(e.group);
      e.dispose();
    }
    this.enemies = [];
    for (const b of this.bullets) {
      this.bulletsGroup.remove(b.group);
      b.dispose();
    }
    this.bullets = [];
    for (const p of this.powerups) {
      this.powerupsGroup.remove(p.group);
      p.dispose();
    }
    this.powerups = [];
    this.timed = [];
  }

  // ---- main update ----
  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    this.fps = this.fps * 0.9 + (1 / Math.max(delta, 0.0001)) * 0.1;

    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    const resized = resizeRenderer(this.renderer, this.camera, 2);
    if (this.frame === 1 || resized) {
      this.cameraRig.fit(this.canvas.clientWidth, this.canvas.clientHeight);
    }

    // hitstop decays in real time; gameplay reads the scaled delta
    if (this.hitstop > 0) {
      this.hitstop -= delta;
      if (this.hitstop <= 0) this.timeScale = 1;
    }
    const gameplayDelta = delta * this.timeScale;
    const animDelta = this.reducedMotion ? 0 : gameplayDelta;

    this.handleMetaInput();

    if (this.state === 'playing') {
      this.runElapsed += delta;
      this.updatePlaying(gameplayDelta, animDelta, elapsed);
    } else if (this.state === 'levelclear') {
      this.transitionTimer -= delta;
      if (this.transitionTimer <= 0) {
        if (this.levelIndex + 1 >= LEVELS.length) this.triggerVictory();
        else this.beginLevel(this.levelIndex + 1, true);
      }
    }

    this.effects.update(this.reducedMotion ? 0 : delta);
    this.field.update(animDelta, elapsed);
    this.cameraRig.update(delta, this.reducedMotion);
    this.publishDiagnostics();
  }

  private updatePlaying(gameplayDelta: number, animDelta: number, elapsed: number): void {
    // input → player intent
    this.player.setInput(this.input.moveDir(), this.input.fireHeld());
    this.player.activeBullets = this.bullets.reduce((n, b) => n + (b.owner === 'player' && b.alive ? 1 : 0), 0);

    // spawn
    this.updateSpawning(gameplayDelta);

    // tanks
    this.player.update(gameplayDelta, this.moveCtx, elapsed);
    for (const e of this.enemies) e.update(animDelta, this.moveCtx, elapsed);

    // firing
    this.handleFiring(elapsed);

    // bullets
    this.updateBullets(gameplayDelta, elapsed);

    // bullet vs bullet
    this.resolveBulletCollisions();

    // powerups
    for (const p of this.powerups) p.update(animDelta, elapsed);
    this.collectPowerups();
    this.powerups = this.powerups.filter((p) => {
      if (!p.alive) {
        this.powerupsGroup.remove(p.group);
        p.dispose();
        return false;
      }
      return true;
    });

    // timed powers
    for (const t of this.timed) t.remaining -= gameplayDelta;
    const expired = this.timed.filter((t) => t.remaining <= 0);
    for (const e of expired) {
      if (e.kind === 'shovel') this.field.bastion(false);
      if (e.kind === 'shield') this.player.invincible = Math.min(this.player.invincible, TANK.respawnInvincible);
    }
    this.timed = this.timed.filter((t) => t.remaining > 0);

    // base alarm readability cue
    this.field.setAlarm(this.baseExposed());

    // remove dead enemies
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) {
        this.tanksGroup.remove(e.group);
        e.dispose();
        return false;
      }
      return true;
    });

    // win/lose
    if (!this.field.baseAlive) {
      this.triggerGameOver();
      return;
    }
    if (this.enemiesRemaining <= 0 && this.enemies.length === 0) {
      this.triggerLevelClear();
    }
  }

  private updateSpawning(dt: number): void {
    if (!this.spawnEnabled) return;
    const cfg = LEVELS[this.levelIndex];
    this.spawnTimer -= dt;
    if (this.enemies.length >= cfg.concurrent) return;
    if (this.enemiesRemaining <= 0) return;
    if (this.spawnTimer > 0) return;

    const point = this.freeSpawnPoint();
    if (!point) {
      this.spawnTimer = 0.3;
      return;
    }
    const kind = cfg.mix[this.spawnIndex % cfg.mix.length];
    this.spawnIndex += 1;
    const bonus = this.spawnIndex % cfg.bonusEvery === 0;
    this.spawnEnemy(kind, bonus, point.col, point.row);
    this.enemiesRemaining -= 1;
    this.spawnTimer = cfg.spawnInterval * (0.8 + this.rng() * 0.5);
  }

  private spawnEnemy(kind: EnemyKind, bonus: boolean, col: number, row: number): void {
    const tank = new EnemyTank(kind, bonus);
    tank.reset(cellToWorldX(col), cellToWorldZ(row), Dir.S);
    this.enemies.push(tank);
    this.tanksGroup.add(tank.group);
    this.effects.explosion(cellToWorldX(col), cellToWorldZ(row), '#7fb2e0', 0.5);
  }

  private freeSpawnPoint(): { col: number; row: number } | null {
    const points = this.field.parsed.enemySpawns;
    for (let attempt = 0; attempt < points.length; attempt += 1) {
      const p = points[(this.spawnIndex + attempt) % points.length];
      const x = cellToWorldX(p.col);
      const z = cellToWorldZ(p.row);
      const blocked =
        this.field.tankBoxBlocked(x - TANK.half, z - TANK.half, x + TANK.half, z + TANK.half) ||
        this.enemies.some((e) => Math.abs(e.x - x) < 1 && Math.abs(e.z - z) < 1);
      if (!blocked) return p;
    }
    return null;
  }

  private handleFiring(elapsed: number): void {
    const fireFrom = (tank: Tank, owner: 'player' | 'enemy') => {
      const m = muzzleOffset(tank);
      const speed = tank.isPlayer ? (tank as PlayerTank).bulletSpeed() : (tank as EnemyTank).bulletSpeed();
      const destroysSteel = tank.isPlayer && (tank as PlayerTank).firepower >= 3;
      const color = owner === 'player' ? PALETTE.bulletPlayer : PALETTE.bulletEnemy;
      const bullet = new Bullet(owner, m.x, m.z, tank.dir, speed, destroysSteel, color);
      this.bullets.push(bullet);
      this.bulletsGroup.add(bullet.group);
      this.effects.muzzle(m.x, m.y, m.z, color);
      if (owner === 'player') this.audio.firePlayer();
      else this.audio.fireEnemy();
      tank.fireRequested = false;
    };
    if (this.player.fireRequested) fireFrom(this.player, 'player');
    for (const e of this.enemies) {
      if (e.fireRequested) fireFrom(e, 'enemy');
    }
    void elapsed;
  }

  private updateBullets(dt: number, _elapsed: number): void {
    const tanks: Tank[] = [this.player, ...this.enemies];
    this.bullets = this.bullets.filter((b) => {
      if (!b.alive) {
        this.bulletsGroup.remove(b.group);
        b.dispose();
        return false;
      }
      const outcome = b.update(dt, this.field, tanks, this.effects);
      if (!outcome) return true;
      this.handleBulletOutcome(b, outcome);
      if (!b.alive) {
        this.bulletsGroup.remove(b.group);
        b.dispose();
        return false;
      }
      return true;
    });
  }

  private handleBulletOutcome(b: Bullet, o: { result: string; tank?: Tank; x: number; z: number }): void {
    switch (o.result) {
      case 'tank': {
        if (o.tank?.isPlayer) {
          this.onPlayerHit();
        } else if (o.tank) {
          const died = o.tank.damage(1);
          if (died) this.killEnemy(o.tank as EnemyTank);
          else {
            this.effects.spark(o.x, o.z, '#ffd0a0');
            this.audio.steelPing();
          }
        }
        break;
      }
      case 'brick':
        this.audio.brickBreak();
        this.cameraRig.addTrauma(0.08);
        break;
      case 'steelBlock':
        this.audio.steelPing();
        break;
      case 'steelBreak':
        this.audio.brickBreak();
        this.cameraRig.addTrauma(0.12);
        break;
      case 'base':
        this.triggerBaseDestroyed(o.x, o.z);
        break;
      default:
        break;
    }
    void b;
  }

  private resolveBulletCollisions(): void {
    for (let i = 0; i < this.bullets.length; i += 1) {
      const a = this.bullets[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bullets.length; j += 1) {
        const c = this.bullets[j];
        if (!c.alive) continue;
        if (Math.abs(a.x - c.x) < 0.3 && Math.abs(a.z - c.z) < 0.3) {
          a.alive = false;
          a.group.visible = false;
          c.alive = false;
          c.group.visible = false;
          this.effects.spark((a.x + c.x) / 2, (a.z + c.z) / 2, '#ffe9a8');
        }
      }
    }
  }

  private killEnemy(e: EnemyTank): void {
    const def = ENEMY_DEFS[e.kind as EnemyKind];
    this.effects.explosion(e.x, e.z, def.body, 1.0);
    this.audio.explosion();
    this.cameraRig.addTrauma(0.32);
    this.hud.flash(0.25, this.reducedMotion);
    this.addScore(def.score);
    if (e.bonus) this.spawnPowerUp();
    e.alive = false;
  }

  private onPlayerHit(): void {
    if (!this.player.alive) return;
    if (this.player.invincible > 0) {
      this.effects.spark(this.player.x, this.player.z, '#9fe9ff');
      return;
    }
    this.player.alive = false;
    this.effects.explosion(this.player.x, this.player.z, PALETTE.player, 1.3);
    this.audio.playerHit();
    this.cameraRig.addTrauma(0.6);
    this.hud.flash(0.7, this.reducedMotion);
    this.applyHitstop(0.09, 0.05);
    this.lives -= 1;
    if (this.lives <= 0) {
      this.triggerGameOver();
    } else {
      // respawn after a beat
      const spawn = this.field.parsed.playerSpawn;
      this.player.reset(cellToWorldX(spawn.col), cellToWorldZ(spawn.row), Dir.N);
      if (this.invincibleTest) this.player.invincible = 9999;
    }
  }

  private triggerBaseDestroyed(x: number, z: number): void {
    this.effects.explosion(x, z, '#ff7a3c', 1.8);
    this.effects.explosion(x, z, '#ffd66b', 1.2);
    this.audio.baseDestroyed();
    this.cameraRig.addTrauma(0.85);
    this.hud.flash(0.9, this.reducedMotion);
    this.applyHitstop(0.14, 0.04);
    this.field.baseAlive = false;
    this.triggerGameOver();
  }

  private triggerLevelClear(): void {
    this.setState('levelclear', {
      banner: this.levelIndex + 1 >= LEVELS.length ? 'FINAL SECTOR CLEAR' : 'SECTOR CLEAR',
      sub: this.levelIndex + 1 >= LEVELS.length ? '' : `Next: ${LEVELS[this.levelIndex + 1].name}`,
    });
    this.transitionTimer = 2.0;
    this.audio.levelClear();
    this.addScore(this.lives * 200 + 500);
  }

  private triggerVictory(): void {
    this.setState('victory');
    this.audio.victory();
  }

  private triggerGameOver(): void {
    if (this.state === 'gameover') return;
    this.setState('gameover');
    this.audio.gameOver();
  }

  private applyHitstop(duration: number, scale: number): void {
    this.hitstop = Math.max(this.hitstop, duration);
    this.timeScale = scale;
  }

  private addScore(amount: number): void {
    this.score += amount;
    this.hud.pulseScore();
  }

  // ---- powerups ----
  private spawnPowerUp(): void {
    const empty = this.emptyCells();
    if (empty.length === 0) return;
    const cell = empty[Math.floor(this.rng() * empty.length)];
    const kinds: PowerKind[] = ['star', 'shield', 'life', 'shovel', 'grenade', 'freeze'];
    const kind = kinds[Math.floor(this.rng() * kinds.length)];
    const p = new PowerUp(kind, cell.col, cell.row);
    this.powerups.push(p);
    this.powerupsGroup.add(p.group);
  }

  private emptyCells(): Array<{ col: number; row: number }> {
    const out: Array<{ col: number; row: number }> = [];
    for (let r = 2; r < GRID - 2; r += 1) {
      for (let c = 1; c < GRID - 1; c += 1) {
        const t = this.field.tileAt(c, r);
        if (t !== 0) continue; // Tile.Empty
        const x = cellToWorldX(c);
        const z = cellToWorldZ(r);
        if (this.enemies.some((e) => Math.abs(e.x - x) < 1 && Math.abs(e.z - z) < 1)) continue;
        if (Math.abs(this.player.x - x) < 1 && Math.abs(this.player.z - z) < 1) continue;
        out.push({ col: c, row: r });
      }
    }
    return out;
  }

  private collectPowerups(): void {
    for (const p of this.powerups) {
      if (!p.alive) continue;
      if (Math.abs(this.player.x - p.x) < TANK.half + 0.5 && Math.abs(this.player.z - p.z) < TANK.half + 0.5) {
        this.applyPowerUp(p.kind);
        p.alive = false;
      }
    }
  }

  private applyPowerUp(kind: PowerKind): void {
    this.audio.powerup();
    this.addScore(500);
    this.effects.explosion(this.player.x, this.player.z, POWER_DEFS[kind].color, 0.7);
    switch (kind) {
      case 'star':
        this.player.upgradeFirepower();
        break;
      case 'shield':
        this.player.invincible = 9;
        this.addTimed('shield', 9);
        break;
      case 'life':
        this.lives = Math.min(9, this.lives + 1);
        this.audio.extraLife();
        break;
      case 'shovel':
        this.field.bastion(true);
        this.addTimed('shovel', 12);
        break;
      case 'grenade':
        for (const e of this.enemies) {
          this.effects.explosion(e.x, e.z, ENEMY_DEFS[e.kind as EnemyKind].body, 0.8);
          this.addScore(ENEMY_DEFS[e.kind as EnemyKind].score);
          e.alive = false;
        }
        this.cameraRig.addTrauma(0.5);
        this.audio.grenade();
        break;
      case 'freeze':
        for (const e of this.enemies) e.frozen = 8;
        this.addTimed('freeze', 8);
        this.audio.freeze();
        break;
    }
  }

  private addTimed(kind: TimedPower['kind'], duration: number): void {
    const existing = this.timed.find((t) => t.kind === kind);
    if (existing) {
      existing.remaining = duration;
      existing.duration = duration;
    } else {
      this.timed.push({ kind, remaining: duration, duration });
    }
  }

  private baseExposed(): boolean {
    const { col, row } = this.field.parsed.base;
    const guards = [
      this.field.tileAt(col, row - 1),
      this.field.tileAt(col - 1, row),
      this.field.tileAt(col + 1, row),
    ];
    return guards.every((t) => t === 0); // all destroyed → base exposed
  }

  // ---- collisions / helpers ----
  private blockedByTank(self: Tank, x: number, z: number): boolean {
    if (self !== this.player && this.player.alive) {
      if (Math.abs(x - this.player.x) < TANK.half * 2 - 0.05 && Math.abs(z - this.player.z) < TANK.half * 2 - 0.05) return true;
    }
    for (const e of this.enemies) {
      if (e === self || !e.alive) continue;
      if (Math.abs(x - e.x) < TANK.half * 2 - 0.05 && Math.abs(z - e.z) < TANK.half * 2 - 0.05) return true;
    }
    return false;
  }

  // ---- meta input / screens ----
  private handleMetaInput(): void {
    if (this.input.consumePause()) {
      if (this.state === 'playing') {
        this.setState('paused');
        this.audio.uiClick();
      } else if (this.state === 'paused') {
        this.setState('playing');
        this.audio.uiClick();
      }
    }
    if (this.input.consumeConfirm()) {
      if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory') {
        this.startNewGame();
      } else if (this.state === 'paused') {
        this.setState('playing');
      }
    }
  }

  private setState(screen: Screen, opts?: { banner?: string; sub?: string }): void {
    this.state = screen;
    this.hud.setScreen(screen, opts);
  }

  private wireButtons(): void {
    const bind = (sel: string, fn: () => void) => {
      const el = document.querySelector<HTMLElement>(sel);
      el?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
    };
    bind('#btn-start', () => this.startNewGame());
    bind('#btn-restart', () => this.startNewGame());
    bind('#btn-resume', () => {
      if (this.state === 'paused') this.setState('playing');
    });
    bind('#btn-menu', () => {
      this.clearActors();
      this.beginLevel(0, true);
      this.setState('title');
    });
    bind('#btn-mute', () => {
      this.audio.setMuted(!this.audio.isMuted());
      const el = document.querySelector<HTMLElement>('#btn-mute');
      if (el) el.dataset.on = this.audio.isMuted() ? 'false' : 'true';
    });
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ---- diagnostics + test hooks ----
  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const activePowers: ActivePower[] = this.timed.map((t) => ({
      kind: t.kind,
      remaining: t.remaining,
      duration: t.duration,
    }));
    if (this.player.invincible > TANK.respawnInvincible && !activePowers.some((p) => p.kind === 'shield')) {
      activePowers.push({ kind: 'shield', remaining: this.player.invincible, duration: 9 });
    }
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.runElapsed,
      fps: Math.round(this.fps),
      score: this.score,
      level: this.levelIndex + 1,
      lives: this.lives,
      state: this.state,
      complete: this.state === 'victory',
      baseAlive: this.field.baseAlive,
      enemiesRemaining: this.enemiesRemaining + this.enemies.length,
      enemiesTotal: LEVELS[this.levelIndex].roster,
      enemiesOnField: this.enemies.length,
      player: {
        x: this.player.x,
        z: this.player.z,
        dir: this.player.dir,
        firepower: this.player.firepower,
        alive: this.player.alive,
      },
      enemies: this.enemies.map((e) => ({ x: e.x, z: e.z, kind: e.kind, bonus: e.bonus })),
      powerups: this.powerups.map((p) => ({ kind: p.kind, x: p.x, z: p.z })),
      activePowers,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      },
    };
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.audio.setRng(this.rng);
      },
      setState: (name: string) => {
        switch (name) {
          case 'title':
            this.setState('title');
            break;
          case 'active-play':
          case 'play':
            this.startNewGame();
            break;
          case 'play-l2':
            this.startNewGame();
            this.beginLevel(1, true);
            break;
          case 'play-l3':
            this.startNewGame();
            this.beginLevel(2, true);
            break;
          case 'levelclear':
            this.triggerLevelClear();
            break;
          case 'gameover':
            this.triggerGameOver();
            break;
          case 'victory':
            this.triggerVictory();
            break;
          default:
            console.warn(`Unknown test state: ${name}`);
        }
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: (_hidden: boolean) => {
        /* no debug GUI in release; kept for scaffold compat */
      },
      setEnemySpawnEnabled: (enabled: boolean) => {
        this.spawnEnabled = enabled;
      },
      setInvincible: (enabled: boolean) => {
        this.invincibleTest = enabled;
        this.player.invincible = enabled ? 9999 : TANK.respawnInvincible;
      },
    };
  }
}
