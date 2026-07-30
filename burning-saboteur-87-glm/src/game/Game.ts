import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Player } from '../entities/Player';
import { Enemy, type EnemyContext } from '../entities/Enemy';
import { Boss, type BossPart } from '../entities/Boss';
import { Projectiles } from '../entities/Projectiles';
import { Effects } from '../entities/Effects';
import { makePickup, PICKUP_LABEL, type Pickup, type PickupType } from '../entities/Pickups';
import { buildWorld } from '../assets/World';
import { disposeMaterials } from '../assets/Materials';
import { GridMap } from '../systems/GridMap';
import { CameraRig } from '../systems/CameraRig';
import { Hud, type ScreenName } from '../systems/Hud';
import { AudioSystem } from '../systems/AudioSystem';
import { DebugTools } from '../systems/DebugTools';
import { AlertSystem } from '../game/AlertSystem';
import { LEVELS, gridToWorld, bossAnchor } from '../game/levels';
import { TUNING, type InputIntent, type AlertLevel, type WeaponType } from '../game/types';
import { createSeededRandom } from '../utils/random';

type ItemSlot = WeaponType | 'ration' | 'explosive';
const SLOT_ORDER: ItemSlot[] = ['pistol', 'tranq', 'ration', 'explosive'];
const SLOT_LABEL: Record<ItemSlot, string> = { pistol: '手枪', tranq: '镇静针', ration: '口粮', none: '徒手', explosive: 'C4 炸药' };

interface LevelRuntime {
  map: GridMap;
  enemies: Enemy[];
  pickups: Pickup[];
  exit: THREE.Vector3;
  exitCardLevel: number;
  worldGroup: THREE.Group;
  lights: THREE.Object3D[];
  hasBoss: boolean;
}

const ATMOSPHERE = [
  { bg: '#10130f', fog: '#10130f', fogNear: 18, fogFar: 46, hemi: 0x9fb0a0, hemiGround: 0x2a2e26, sun: 0xfff0c8, sunInt: 2.0 },
  { bg: '#0c0e12', fog: '#0c0e12', fogNear: 14, fogFar: 38, hemi: 0x8a93a8, hemiGround: 0x20242c, sun: 0xcfd6ff, sunInt: 1.3 },
  { bg: '#070608', fog: '#070608', fogNear: 12, fogFar: 34, hemi: 0x6a5a6a, hemiGround: 0x140a10, sun: 0xff6a4a, sunInt: 0.9 },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(TUNING.cameraFov, 1, 0.1, 120);
  private readonly input: InputController;
  private readonly player = new Player();
  private readonly projectiles = new Projectiles();
  private readonly effects = new Effects();
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera);
  private readonly alert = new AlertSystem(TUNING.alert);
  private readonly debug = new DebugTools(TUNING);
  private boss: Boss | null = null;
  private level: LevelRuntime | null = null;
  private levelIndex = 0;
  private slotIndex = 0; // active item slot
  private phase: ScreenName = 'menu';
  private elapsed = 0;
  private frame = 0;
  private transitionTimer = 0;
  private transitionTo: 'next' | 'victory' | null = null;
  private deadTimer = 0;
  private footstepTimer = 0;
  private rng = createSeededRandom(1);
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private totalScore = 0;
  private totalRescued = 0;
  private totalTime = 0;

  private readonly loop = new Loop(
    (dt, t) => this.update(dt, t),
    () => this.render(),
  );

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = TUNING.exposure;

    const stick = this.req('#touch-stick');
    const knob = this.req('#touch-knob');
    this.input = new InputController(stick, knob, {
      fire: document.getElementById('btn-fire'),
      interact: document.getElementById('btn-interact'),
      swap: document.getElementById('btn-swap'),
      box: document.getElementById('btn-box'),
      pause: document.getElementById('btn-pause'),
      confirm: document.getElementById('btn-confirm'),
    }, document.getElementById('btn-stealth'));

    this.scene.add(this.player.group);
    this.scene.add(this.projectiles.group);
    this.scene.add(this.effects.group);
    this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0));
    resizeRenderer(this.renderer, this.camera, TUNING.maxDpr);

    this.bindUiButtons();
    this.hud.showScreen('menu');
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start() {
    this.loop.start();
  }

  resumeAudio() {
    this.audio.resume();
  }

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.clearLevel();
    this.player.dispose();
    this.projectiles.dispose();
    this.effects.clear();
    disposeMaterials();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private req(sel: string): HTMLElement {
    const e = document.querySelector<HTMLElement>(sel);
    if (!e) throw new Error(`Missing element ${sel}`);
    return e;
  }

  private bindUiButtons() {
    const start = () => this.startNewGame();
    document.getElementById('btn-start')?.addEventListener('click', start);
    document.getElementById('btn-restart')?.addEventListener('click', start);
    document.getElementById('btn-resume')?.addEventListener('click', () => this.togglePause(false));
    document.getElementById('btn-menu')?.addEventListener('click', () => this.toMenu());
    document.getElementById('btn-mute')?.addEventListener('click', () => this.toggleMute());
    document.querySelectorAll<HTMLElement>('[data-action="confirm"]').forEach((b) =>
      b.addEventListener('click', () => this.handleConfirm()),
    );
  }

  private handleConfirm() {
    if (this.phase === 'menu') this.startNewGame();
    else if (this.phase === 'briefing') this.beginPlay();
    else if (this.phase === 'dead') this.respawnOrContinue();
    else if (this.phase === 'gameover') this.startNewGame();
    else if (this.phase === 'victory') this.toMenu();
  }

  // ---------- level lifecycle ----------
  private clearLevel() {
    if (this.level) {
      this.scene.remove(this.level.worldGroup);
      this.level.worldGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      for (const e of this.level.enemies) e.dispose();
      for (const p of this.level.pickups) {
        p.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else if (mat) mat.dispose();
        });
      }
      for (const l of this.level.lights) this.scene.remove(l);
    }
    if (this.boss) {
      this.scene.remove(this.boss.group);
      this.boss.dispose();
      this.boss = null;
    }
    this.projectiles.clear();
    this.effects.clear();
    this.level = null;
  }

  private loadLevel(index: number, resetPlayer: boolean) {
    this.clearLevel();
    this.levelIndex = index;
    const def = LEVELS[index];
    const map = new GridMap(def.grid);
    const built = buildWorld(def.grid, map);
    const worldGroup = built.group;
    this.scene.add(worldGroup);

    // atmosphere
    const at = ATMOSPHERE[index] ?? ATMOSPHERE[0];
    this.scene.background = new THREE.Color(at.bg);
    this.scene.fog = new THREE.Fog(at.fog, at.fogNear, at.fogFar);
    const lights: THREE.Object3D[] = [];
    const hemi = new THREE.HemisphereLight(at.hemi, at.hemiGround, 1.1);
    this.scene.add(hemi);
    lights.push(hemi);
    const sun = new THREE.DirectionalLight(at.sun, at.sunInt);
    sun.position.set(-6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    const span = Math.max(map.cols, map.rows) * map.cell;
    sun.shadow.camera.left = -span / 2;
    sun.shadow.camera.right = span / 2;
    sun.shadow.camera.top = span / 2;
    sun.shadow.camera.bottom = -span / 2;
    this.scene.add(sun);
    lights.push(sun);
    if (index === 2) {
      const red = new THREE.PointLight('#ff3a2a', 1.2, 26, 2);
      red.position.set(0, 6, 0);
      this.scene.add(red);
      lights.push(red);
    }

    // enemies
    const enemies = def.enemies.map((s) => {
      const e = new Enemy(s.kind, s.x, s.z, s.facing, s.fov, s.range, s.patrol);
      e.setBaseFacing(s.facing);
      worldGroup.add(e.group);
      return e;
    });

    // pickups from grid
    const pickups: Pickup[] = [];
    for (let r = 0; r < def.grid.length; r++) {
      for (let c = 0; c < def.grid[r].length; c++) {
        const ch = def.grid[r][c];
        let type: PickupType | null = null;
        if (ch === '1') type = 'card1';
        else if (ch === '2') type = 'card2';
        else if (ch === 'r') type = 'ration';
        else if (ch === 'e') type = 'explosive';
        else if (ch === 'H') type = 'hostage';
        if (type) {
          const w = gridToWorld(def.grid, c, r);
          const p = makePickup(type, w.x, w.z);
          pickups.push(p);
          worldGroup.add(p.group);
        }
      }
    }

    // boss
    let hasBoss = false;
    if (index === 2) {
      const a = bossAnchor();
      this.boss = new Boss(a.x, a.z);
      worldGroup.add(this.boss.group);
      hasBoss = true;
    }

    this.level = { map, enemies, pickups, exit: built.exitPosition, exitCardLevel: def.exitCardLevel, worldGroup, lights, hasBoss };

    if (resetPlayer) {
      this.player.reset(built.playerStart);
      this.alert.reset();
    } else {
      this.player.group.position.copy(built.playerStart);
      this.alert.reset();
    }
    this.cameraRig.snapTo(this.player.group.position);
    this.projectiles.clear();
  }

  // ---------- flow ----------
  private startNewGame() {
    this.audio.resume();
    this.audio.startMusic();
    this.totalScore = 0;
    this.totalRescued = 0;
    this.totalTime = 0;
    this.player.reset(new THREE.Vector3(0, 0, 0));
    this.player.state.lives = TUNING.startingLives;
    this.loadLevel(0, true);
    this.phase = 'briefing';
    const def = LEVELS[0];
    this.hud.showScreen('briefing', { title: def.name, subtitle: def.subtitle, detail: this.controlHelp() + `<p class="obj">${def.brief}</p>` });
  }

  private beginPlay() {
    this.phase = 'playing';
    this.hud.showScreen('playing');
  }

  private controlHelp(): string {
    return `<ul class="keys">
      <li>移动：WASD / 方向键</li>
      <li>攻击/使用：J / X（当前 ${SLOT_LABEL[this.activeSlot()]}）</li>
      <li>切换武器与道具：Q / Tab</li>
      <li>潜行（贴墙/蹲伏）：Shift / Ctrl</li>
      <li>互动（开门/拾取/救援）：E / 空格</li>
      <li>纸箱伪装：F / B</li>
      <li>暂停：P / Esc</li>
    </ul>`;
  }

  private activeSlot(): ItemSlot {
    return SLOT_ORDER[this.slotIndex];
  }

  private cycleSlot() {
    // skip explosive slot if none held and not boss; skip ration if none
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      this.slotIndex = (this.slotIndex + 1) % SLOT_ORDER.length;
      const s = this.activeSlot();
      if (s === 'ration' && this.player.state.rations <= 0) continue;
      if (s === 'explosive' && this.player.state.explosives <= 0) continue;
      this.audio.play('ui');
      return;
    }
    this.audio.play('ui');
  }

  private togglePause(force?: boolean) {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.hud.showScreen('paused');
      this.audio.setIntensity(0);
    } else if (this.phase === 'paused' && force !== true) {
      this.beginPlay();
    }
  }

  private toMenu() {
    this.clearLevel();
    this.phase = 'menu';
    this.audio.stopMusic();
    this.hud.showScreen('menu');
  }

  private toggleMute() {
    this.audio.setMuted(!this.audio.isMuted());
    const b = document.getElementById('btn-mute');
    if (b) b.textContent = this.audio.isMuted() ? '🔇' : '🔊';
  }

  // ---------- update ----------
  private update(dt: number, _elapsed: number) {
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    resizeRenderer(this.renderer, this.camera, TUNING.maxDpr);

    const edges = this.input.consumeEdges();
    // global edges
    if (edges.pause) {
      if (this.phase === 'playing' || this.phase === 'paused') this.togglePause();
    }
    if (edges.confirm) this.handleConfirm();

    if (this.phase !== 'playing') {
      this.audio.updateMusic(dt);
      // keep rendering the scene subtly (idle) without advancing sim
      this.publishDiagnostics();
      return;
    }

    this.elapsed += dt;
    this.totalTime += dt;

    // build intent
    const move = new THREE.Vector2();
    this.input.readMovement(move);
    const intent: InputIntent = {
      move: { x: move.x, y: move.y },
      stealth: this.input.isStealthHeld(),
      fire: edges.fire || this.input.isFireHeld(),
      firePressed: edges.fire,
      interactPressed: edges.interact,
      swapPressed: edges.swap,
      boxPressed: edges.box,
    };
    if (edges.swap) this.cycleSlot();
    if (edges.box) {
      const on = this.player.toggleBox();
      this.audio.play('box');
      void on;
    }

    const animDt = this.reducedMotion ? 0 : dt;
    // spin pickups
    if (this.level) {
      for (const p of this.level.pickups) {
        if (!p.collected) p.spin.rotation.y += animDt * 1.6;
      }
    }

    // player
    const pout = { fired: false, muzzle: false, takedown: false, noise: 0, rationUsed: false };
    const slot = this.activeSlot();
    if (slot === 'ration') {
      // use ration on fire
      if (edges.fire && this.player.state.rations > 0 && this.player.state.hp < this.player.state.maxHp) {
        this.player.state.rations -= 1;
        this.player.state.hp = Math.min(this.player.state.maxHp, this.player.state.hp + 50);
        this.audio.play('pickup');
        this.effects.hitSpark(this.player.position.x, this.player.position.z, '#4fd06a');
        if (this.player.state.rations <= 0) this.cycleSlot();
      }
      intent.fire = false;
    } else if (slot === 'explosive') {
      if (edges.fire && this.player.state.explosives > 0) {
        this.tryPlaceExplosive();
      }
      intent.fire = false;
    } else {
      this.player.state.weapon = slot;
    }

    if (!this.level) return;
    this.player.update(dt, intent, this.level.map, pout);

    // footsteps while moving (silent when in box)
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    if (speed > 1.2 && !this.player.state.boxed && !this.reducedMotion) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.audio.play('step');
        this.footstepTimer = intent.stealth ? 0.5 : 0.34;
      }
    } else {
      this.footstepTimer = 0.05;
    }

    if (pout.muzzle) {
      this.effects.hitSpark(
        this.player.position.x + Math.cos(this.player.state.facing) * 0.6,
        this.player.position.z + Math.sin(this.player.state.facing) * 0.6,
        '#ffe27a',
      );
    }
    if (pout.fired) {
      this.firePlayerBullet();
      this.audio.play('gunshot');
      this.cameraRig.addShake(0.06);
      // gunfire alerts everyone
      this.alert.reactToNoise(this.player.position.x, this.player.position.z);
    }
    if (pout.takedown) {
      this.tryTakedown();
    }

    // noise for hearing
    const noiseRadius = pout.noise;

    // enemies
    let maxVis = 0;
    const ectx: EnemyContext = {
      map: this.level.map,
      playerX: this.player.position.x,
      playerZ: this.player.position.z,
      playerStealthed: intent.stealth,
      playerBoxed: this.player.state.boxed,
      hunted: this.alert.level === 'hunted' || this.alert.level === 'spotted',
      hasLastKnown: this.alert.hasLastKnown,
      lastKnownX: this.alert.lastKnown.x,
      lastKnownZ: this.alert.lastKnown.z,
      dt,
      rng: this.rng,
      noiseRadius,
      noiseX: this.player.position.x,
      noiseZ: this.player.position.z,
      fireBullet: (x, z, dx, dz, sp, dmg) => this.projectiles.spawn(x, z, dx, dz, sp, dmg, false),
    };
    for (const e of this.level.enemies) {
      const r = e.update(ectx);
      if (r.visibility > maxVis) maxVis = r.visibility;
      if (r.shot) {
        this.projectiles.spawn(r.shot.x, r.shot.z, r.shot.dirX, r.shot.dirZ, r.shot.speed, r.shot.damage, false);
        this.audio.play('gunshot');
      }
      e.setAlertColor(this.alert.level);
    }

    // alert
    const prevLevel = this.alert.level;
    this.alert.observe(maxVis, this.player.position.x, this.player.position.z, dt);
    this.alert.update(dt);
    if (this.alert.level === 'hunted' && prevLevel !== 'hunted') {
      this.audio.play('alarm');
    } else if (this.alert.level === 'hunted' && this.frame % 60 === 0) {
      this.audio.play('alarm');
    }
    this.audio.setIntensity(
      this.alert.level === 'hunted' ? 1 : this.alert.level === 'spotted' || this.alert.level === 'searching' ? 0.6 : 0.2,
    );

    // boss
    if (this.boss && this.boss.alive) {
      this.boss.update(
        {
          map: this.level.map,
          playerX: this.player.position.x,
          playerZ: this.player.position.z,
          dt,
          rng: this.rng,
          fireBullet: (x, z, dx, dz, sp, dmg) => this.projectiles.spawn(x, z, dx, dz, sp, dmg, false),
        },
      );
      // boss ram
      if (this.boss.isCharging) {
        const d = Math.hypot(this.boss.pos.x - this.player.position.x, this.boss.pos.z - this.player.position.z);
        if (d < 1.6) {
          this.damagePlayer(this.boss.ramDamage);
          this.cameraRig.addShake(0.3);
        }
      }
    }

    // bullets
    const live = this.projectiles.update(dt, this.level.map);
    for (const b of live) {
      if (b.fromPlayer) {
        // check enemies
        let hit = false;
        for (const e of this.level.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - b.mesh.position.x, e.pos.z - b.mesh.position.z);
          if (d < 0.55) {
            const killed = e.damage(TUNING.pistolDamage, false);
            this.effects.hitSpark(b.mesh.position.x, b.mesh.position.z, '#ff7a2a');
            this.audio.play('hurt');
            if (killed) {
              this.totalScore += 100;
              this.effects.explosion(e.pos.x, e.pos.z, 0.7);
            }
            this.projectiles.kill(b);
            hit = true;
            break;
          }
        }
        if (!hit && this.boss && this.boss.alive) {
          const part = this.bossRayHit(b);
          if (part) {
            const core = this.boss.damagePart(part.part, TUNING.pistolDamage);
            this.effects.hitSpark(b.mesh.position.x, b.mesh.position.z, '#39d0ff');
            this.audio.play('bosshit');
            if (this.boss.parts[part.part].destroyed) {
              this.effects.explosion(this.boss.pos.x, this.boss.pos.z, 1.4);
              this.audio.play('explosion');
              this.cameraRig.addShake(0.25);
            }
            if (core) {
              this.onBossDefeated();
            }
            this.projectiles.kill(b);
          }
        }
      } else {
        // enemy bullet vs player
        const d = Math.hypot(this.player.position.x - b.mesh.position.x, this.player.position.z - b.mesh.position.z);
        if (d < TUNING.playerRadius + 0.12) {
          this.damagePlayer(b.damage);
          this.effects.hitSpark(b.mesh.position.x, b.mesh.position.z, '#ff5a3a');
          this.projectiles.kill(b);
        }
      }
    }

    // pickups / interactions
    this.handleInteractions(edges.interact);

    // exit / transition
    this.handleExit();

    // effects & camera & audio
    this.effects.update(dt);
    this.cameraRig.update(dt, this.player.group.position, TUNING.cameraLag, this.alert.level === 'hunted');
    this.audio.updateMusic(dt);

    // transitions
    if (this.transitionTo && this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        if (this.transitionTo === 'next') this.advanceLevel();
        else if (this.transitionTo === 'victory') this.onVictory();
        this.transitionTo = null;
      }
    }

    // dead delay
    if (this.deadTimer > 0) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0 && this.phase === 'playing') {
        this.enterDead();
      }
    }

    this.updateHudAndMinimap();
    this.publishDiagnostics();
  }

  private firePlayerBullet() {
    const dir = this.player.aimDir();
    const d = Math.hypot(dir.x, dir.y) || 1;
    const dx = dir.x / d;
    const dz = dir.y / d;
    const muzzle = new THREE.Vector3();
    this.player.muzzleWorld(muzzle);
    this.projectiles.spawn(muzzle.x, muzzle.z, dx, dz, TUNING.bulletSpeed, TUNING.pistolDamage, true);
  }

  private bossRayHit(b: { mesh: THREE.Mesh; vx: number; vz: number }) {
    if (!this.boss) return null;
    const dir = Math.atan2(b.vz, b.vx);
    return this.boss.hitTest(b.mesh.position.x, b.mesh.position.z, Math.cos(dir), Math.sin(dir), TUNING.pistolRange);
  }

  private tryTakedown() {
    if (!this.level) return;
    let best: Enemy | null = null;
    let bestD = TUNING.tranqRange;
    for (const e of this.level.enemies) {
      if (!e.alive || e.kind === 'camera') continue;
      if (e.canTakeDown(this.player.position.x, this.player.position.z, TUNING.tranqRange)) {
        const d = Math.hypot(e.pos.x - this.player.position.x, e.pos.z - this.player.position.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    if (best) {
      best.knockOut();
      this.totalScore += 150;
      this.effects.hitSpark(best.pos.x, best.pos.z, '#9ad0ff');
      this.audio.play('takedown');
    }
  }

  private tryPlaceExplosive() {
    if (!this.boss || !this.boss.alive) return;
    // damage nearest intact part within range
    const parts: BossPart[] = ['podL', 'podR', 'core'];
    let best: { part: BossPart; d: number } | null = null;
    for (const p of parts) {
      if (this.boss.parts[p].destroyed) continue;
      const px = p === 'podL' ? this.boss.pos.x - 1.15 : p === 'podR' ? this.boss.pos.x + 1.15 : this.boss.pos.x;
      const pz = p === 'core' ? this.boss.pos.z + 0.6 : this.boss.pos.z;
      const d = Math.hypot(px - this.player.position.x, pz - this.player.position.z);
      if (d < 3.0 && (!best || d < best.d)) best = { part: p, d };
    }
    if (!best) return;
    this.player.state.explosives -= 1;
    const core = this.boss.damagePart(best.part, 80);
    this.effects.explosion(this.boss.pos.x, this.boss.pos.z, 1.8);
    this.audio.play('explosion');
    this.cameraRig.addShake(0.35);
    this.alert.reactToNoise(this.player.position.x, this.player.position.z);
    if (this.boss.parts[best.part].destroyed) {
      this.totalScore += 500;
    }
    if (core) this.onBossDefeated();
    if (this.player.state.explosives <= 0 && this.activeSlot() === 'explosive') this.cycleSlot();
  }

  private handleInteractions(interact: boolean) {
    if (!this.level) return;
    let hint: string | null = null;
    for (const p of this.level.pickups) {
      if (p.collected) continue;
      const d = Math.hypot(p.pos.x - this.player.position.x, p.pos.z - this.player.position.z);
      if (d < 1.4) {
        hint = `按 E / 空格：拾取 ${PICKUP_LABEL[p.type]}`;
        if (interact) this.collectPickup(p);
      }
    }
    this.hud.setInteractHint(hint);
  }

  private collectPickup(p: Pickup) {
    p.collected = true;
    p.group.visible = false;
    const st = this.player.state;
    switch (p.type) {
      case 'card1':
        st.cardLevel = Math.max(st.cardLevel, 1);
        this.totalScore += 300;
        this.audio.play('card');
        break;
      case 'card2':
        st.cardLevel = Math.max(st.cardLevel, 2);
        this.totalScore += 400;
        this.audio.play('card');
        break;
      case 'ration':
        st.rations += 1;
        this.totalScore += 100;
        this.audio.play('pickup');
        break;
      case 'explosive':
        st.explosives += 1;
        this.totalScore += 150;
        this.audio.play('pickup');
        break;
      case 'hostage':
        st.rescued += 1;
        this.totalRescued += 1;
        this.totalScore += 800;
        this.player.state.hp = Math.min(st.maxHp, st.hp + 25);
        this.audio.play('rescue');
        break;
    }
  }

  private handleExit() {
    if (!this.level || this.transitionTo) return;
    const d = Math.hypot(this.level.exit.x - this.player.position.x, this.level.exit.z - this.player.position.z);
    if (d < 1.6) {
      if (this.player.state.cardLevel >= this.level.exitCardLevel) {
        this.transitionTo = this.levelIndex >= LEVELS.length - 1 ? 'victory' : 'next';
        this.transitionTimer = 0.4;
        this.audio.play('door');
      } else {
        this.hud.setInteractHint(`需要 ${this.level.exitCardLevel} 级钥匙卡才能开启此门`);
      }
    }
  }

  private advanceLevel() {
    const next = this.levelIndex + 1;
    if (next >= LEVELS.length) {
      this.onVictory();
      return;
    }
    this.loadLevel(next, false);
    this.player.healStartForRun();
    const def = LEVELS[next];
    this.phase = 'briefing';
    this.hud.showScreen('briefing', { title: def.name, subtitle: def.subtitle, detail: this.controlHelp() + `<p class="obj">${def.brief}</p>` });
  }

  private damagePlayer(amount: number) {
    if (this.deadTimer > 0) return;
    const dead = this.player.damage(amount);
    this.audio.play('hurt');
    this.cameraRig.addShake(0.12);
    if (dead) {
      this.deadTimer = 0.5;
    }
  }

  private enterDead() {
    this.player.state.lives -= 1;
    if (this.player.state.lives <= 0) {
      this.phase = 'gameover';
      this.audio.play('defeat');
      this.audio.stopMusic();
      this.hud.showScreen('gameover', { title: '潜入失败', subtitle: '任务终止', detail: `<p>最终得分：${this.totalScore}</p><p>救出人质：${this.totalRescued} 人</p>` });
    } else {
      this.phase = 'dead';
      this.audio.play('defeat');
      this.hud.showScreen('dead', { title: '被击倒', subtitle: `剩余命数：${this.player.state.lives}`, detail: '<p>按 回车 / 确认 在当前区域重生</p>' });
    }
  }

  private respawnOrContinue() {
    if (this.phase === 'dead') {
      this.loadLevel(this.levelIndex, true);
      this.beginPlay();
    } else if (this.phase === 'gameover') {
      this.startNewGame();
    }
  }

  private onBossDefeated() {
    if (this.transitionTo) return;
    this.transitionTo = 'victory';
    this.transitionTimer = 1.0;
    this.effects.explosion(this.boss!.pos.x, this.boss!.pos.z, 2.4);
    this.audio.play('explosion');
    this.cameraRig.addShake(0.5);
  }

  private onVictory() {
    this.phase = 'victory';
    this.audio.play('victory');
    this.audio.stopMusic();
    this.hud.showScreen('victory', {
      title: '任务完成',
      subtitle: '核武步行兵器已被摧毁',
      detail: `<p>最终得分：${this.totalScore + this.player.state.score}</p><p>救出人质：${this.totalRescued} 人</p><p>用时：${formatTime(this.totalTime)}</p>`,
    });
  }

  private updateHudAndMinimap() {
    if (!this.level) return;
    const def = LEVELS[this.levelIndex];
    const objective = this.level.hasBoss
      ? '摧毁步行兵器「铁狱」：先破坏两侧导弹荚，再摧毁核心反应堆（拾取炸药效果更佳）'
      : this.player.state.cardLevel >= this.level.exitCardLevel
        ? `已获取钥匙卡，前往闸门撤离（区域 ${this.levelIndex + 1}）`
        : `寻找 ${this.level.exitCardLevel} 级钥匙卡后从闸门撤离`;
    this.hud.updateHud({
      hp: this.player.state.hp,
      maxHp: this.player.state.maxHp,
      lives: this.player.state.lives,
      weapon: this.activeSlot() === 'pistol' || this.activeSlot() === 'tranq' ? (this.activeSlot() as WeaponType) : this.player.state.weapon,
      cardLevel: this.player.state.cardLevel,
      exitCardLevel: this.level.exitCardLevel,
      rations: this.player.state.rations,
      explosives: this.player.state.explosives,
      score: this.totalScore,
      alert: this.alert.level,
      areaName: def.name,
      areaIndex: this.levelIndex,
      areaCount: LEVELS.length,
      objective,
      bossProgress: this.boss ? this.boss.progress : undefined,
      time: this.elapsed,
    });
    this.hud.drawMinimap(
      this.level.map,
      { x: this.player.position.x, z: this.player.position.z, facing: this.player.state.facing },
      this.level.enemies,
      this.level.pickups,
      { x: this.level.exit.x, z: this.level.exit.z },
      this.boss ? { x: this.boss.pos.x, z: this.boss.pos.z } : undefined,
    );
  }

  private render() {
    // alarm / hurt screen tint via renderer exposure pulse + fog handled in scene
    const flash = Math.max(this.alert.flash, this.player.hurtFlash * 0.5);
    this.renderer.toneMappingExposure = TUNING.exposure + flash * 0.25;
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- test hooks & diagnostics ----------
  private installTestHooks() {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (v: number) => {
        this.rng = createSeededRandom(v);
      },
      setState: (name: string) => {
        switch (name) {
          case 'menu':
            this.toMenu();
            break;
          case 'active-play':
            this.startNewGame();
            this.beginPlay();
            break;
          case 'briefing':
            this.startNewGame();
            break;
          case 'boss':
            this.totalScore = 0;
            this.totalRescued = 0;
            this.totalTime = 0;
            this.player.reset(new THREE.Vector3(0, 0, 0));
            this.player.state.lives = TUNING.startingLives;
            this.player.state.explosives = 4;
            this.loadLevel(2, true);
            // test convenience: buffer HP so the bot survives to demonstrate damage
            this.player.state.hp = 800;
            this.player.state.maxHp = 800;
            this.beginPlay();
            break;
          case 'victory':
            this.onVictory();
            break;
          case 'gameover':
            this.phase = 'gameover';
            this.hud.showScreen('gameover', { title: '潜入失败', subtitle: '任务终止', detail: '' });
            break;
          case 'hunted':
            if (this.phase !== 'playing') {
              this.startNewGame();
              this.beginPlay();
            }
            this.alert.level = 'hunted';
            this.alert.meter = 1;
            break;
          default:
            console.warn(`Unknown test state: ${name}`);
        }
      },
      setPausedForScreenshot: (p: boolean) => {
        this.pausedForScreenshot = p;
      },
      setReducedMotion: (r: boolean) => {
        this.reducedMotion = r;
      },
      hideDebugUi: (h: boolean) => {
        this.debug.setHidden(h);
        document.body.classList.toggle('hide-debug', h);
      },
      getPhase: () => this.phase,
    };
  }

  private publishDiagnostics() {
    const info = this.renderer.info;
    const lvl = this.level;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      phase: this.phase,
      levelIndex: this.levelIndex,
      alert: this.alert.level as AlertLevel,
      player: {
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
        },
        speed: this.player.velocity.length(),
        hp: this.player.state.hp,
        lives: this.player.state.lives,
        boxed: this.player.state.boxed,
      },
      score: this.totalScore,
      enemiesAlive: lvl ? lvl.enemies.filter((e) => e.alive).length : 0,
      bossProgress: this.boss ? this.boss.progress : null,
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
        dpr: Math.min(window.devicePixelRatio || 1, TUNING.maxDpr),
      },
    };
  }
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
