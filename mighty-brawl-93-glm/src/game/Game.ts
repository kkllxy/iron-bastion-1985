import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Boss, bossProfile, type BossContext } from '../entities/Boss';
import { createEnemy, Enemy, type EnemyContext } from '../entities/Enemy';
import { Pickup } from '../entities/Pickup';
import { Player, type PlayerContext } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { CombatSystem } from '../systems/CombatSystem';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { EffectsSystem } from '../systems/EffectsSystem';
import { Hud, type HudState, type ModalKind } from '../systems/Hud';
import { LEVELS, PICKUP_COLORS, PLAYER_PALETTE, xpForLevel } from './levels';
import type { HitFx, LevelDef, PickupKind, WaveDef } from './types';
import { createSeededRandom } from '../utils/random';
import { disposeObject3D } from '../utils/dispose';
import { FovPunch, ShakeRig, TweenManager } from '../utils/feel';

type GameState = 'title' | 'playing' | 'paused' | 'transition' | 'win' | 'gameover';

const MOODS = ['streets', 'subway', 'factory'] as const;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly input: InputController;
  private readonly player: Player;
  private readonly enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private readonly projectiles: Projectile[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly effects = new EffectsSystem();
  private readonly audio = new AudioSystem();
  private readonly hud: Hud;
  private readonly cameraRig: CameraRig;
  private readonly combat = new CombatSystem();
  private readonly shake = new ShakeRig();
  private readonly fovPunch = new FovPunch();
  private readonly tweens = new TweenManager();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.5);

  private readonly tuning: DebugTuning = { cameraLag: 0.14, exposure: 1.08, maxDpr: 2 };
  private readonly debugTools: DebugTools;

  private levelGroup: THREE.Group | null = null;
  private currentLevel: LevelDef = LEVELS[0];
  private rng = createSeededRandom(1);

  private state: GameState = 'title';
  private levelIndex = 0;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private bestCombo = 0;

  private activeWaveIndex = 0;
  private gateZ = 0;
  private bossActive = false;
  private transitionTimer = 0;
  private respawnTimer = 0;
  private dramaTimer = 0;
  private animClock = 0;

  private timeScale = 1;
  private hitstopRemaining = 0;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private frame = 0;
  private elapsed = 0;
  private nextLevelQueued = -1;
  private wasBossAlive = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    this.player = new Player(PLAYER_PALETTE);

    const stick = this.getElement('#touch-stick');
    const knob = this.getElement('#touch-knob');
    const attackBtn = this.getElement('#attack-button');
    const jumpBtn = this.getElement('#jump-button');
    const specialBtn = this.getElement('#special-button');
    const grabBtn = this.getElement('#grab-button');
    this.input = new InputController(stick, knob, attackBtn, jumpBtn, specialBtn, grabBtn);

    this.cameraRig = new CameraRig(this.camera);
    this.hud = new Hud(this.camera);
    this.hud.setLivesPipCount(this.player.lives);
    this.hud.setActionHandler((kind) => this.onModalAction(kind));

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.scene.add(this.effects.group);
    this.scene.add(this.player.group);
    this.buildLevel(LEVELS[0]);
    this.cameraRig.setBounds({ halfWidth: LEVELS[0].halfWidth, startZ: LEVELS[0].startZ, endZ: LEVELS[0].endZ });
    this.cameraRig.snapTo(this.player.group.position);

    this.hud.showModal('title', {
      eyebrow: 'NEON CITY · 199X',
      title: 'MIGHTY BRAWL',
      copy: '清剿三区黑帮，拯救霓虹之城',
      action: '开始游戏',
      hint: '回车 / 点击按钮 开始',
    });

    this.attachButtons();
    this.installTestHooks();
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.clearLevelEntities();
    this.effects.dispose();
    this.player.dispose();
    if (this.levelGroup) {
      disposeObject3D(this.levelGroup);
      this.scene.remove(this.levelGroup);
      this.levelGroup = null;
    }
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // --- main loop ---
  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    void elapsed;

    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    this.handleMetaInput();

    // hitstop decays in REAL time; gameplay reads the scaled delta
    if (this.hitstopRemaining > 0) {
      this.hitstopRemaining -= delta;
      if (this.hitstopRemaining <= 0) this.timeScale = 1;
    }
    const gameplayDelta = delta * this.timeScale;
    this.audio.setDuck(this.hitstopRemaining > 0 ? 0.55 : 1);

    const realDelta = this.reducedMotion ? 0 : delta;
    if (!this.reducedMotion) this.animClock += delta;
    if (this.state === 'playing') this.elapsed += delta;

    if (this.state === 'playing' || this.state === 'transition') {
      this.updatePlaying(gameplayDelta, realDelta);
    } else {
      // idle breathing on menus so the scene stays alive
      this.player.updateIdle(realDelta);
      for (const p of this.pickups) p.update(realDelta, this.animClock);
    }

    // camera + feedback always on real time
    const focus = this.bossActive && this.boss ? this.boss.group.position : null;
    this.cameraRig.setFocus(focus);
    this.cameraRig.update(realDelta, this.player.group.position, this.tuning.cameraLag);
    this.shake.update(realDelta, this.camera, this.reducedMotion);
    this.fovPunch.update(realDelta, this.camera, this.cameraRig.baseFov);
    this.effects.update(realDelta);
    this.tweens.update(realDelta);

    this.updateHud(realDelta);
    this.followSun();
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlaying(gameplayDelta: number, realDelta: number): void {
    // transition / drama timers
    if (this.transitionTimer > 0) {
      this.transitionTimer -= realDelta;
      if (this.transitionTimer <= 0 && this.nextLevelQueued >= 0) {
        const idx = this.nextLevelQueued;
        this.nextLevelQueued = -1;
        this.loadLevel(idx);
      }
    }
    if (this.respawnTimer > 0) {
      this.respawnTimer -= realDelta;
      if (this.respawnTimer <= 0) this.respawnPlayer();
    }
    if (this.dramaTimer > 0) {
      this.dramaTimer -= realDelta;
      if (this.dramaTimer <= 0) this.finishBossKill();
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= realDelta;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    const bounds = this.playerBounds();

    // player
    const pctx: PlayerContext = { enemies: this.enemies, fx: this.fx };
    if (this.player.alive) {
      const wasLevel = this.player.level;
      this.player.update(gameplayDelta, this.input, bounds, pctx);
      if (this.player.level > wasLevel) {
        this.audio.levelStart();
        this.hud.setStatus(`LEVEL UP · LV.${this.player.level}`, '★');
        this.fx.whiteFlash(0.35);
      }
      if (this.player.isSpecialActive() && this.player.stateTimer < 0.05) {
        this.effects.spawnRing(this.player.group.position, '#9b6bff', 4, 0.45);
      }
    } else if (this.respawnTimer <= 0 && this.state === 'playing') {
      this.onPlayerKilled();
    }

    // enemies
    const ectx: EnemyContext = {
      player: this.player,
      fx: this.fx,
      rng: this.rng,
      bounds: { halfWidth: this.currentLevel.halfWidth, minZ: this.currentLevel.endZ, maxZ: this.currentLevel.startZ + 1.5 },
      spawnProjectile: (o, t, d) => this.spawnProjectile(o, t, d),
    };
    for (const e of this.enemies) e.update(gameplayDelta, ectx);

    // boss
    if (this.boss) {
      const bctx: BossContext = {
        player: this.player,
        fx: this.fx,
        rng: this.rng,
        bounds: { halfWidth: this.currentLevel.halfWidth, minZ: this.currentLevel.endZ, maxZ: this.currentLevel.startZ },
        spawnProjectile: (o, t, d) => this.spawnProjectile(o, t, d),
        spawnAdd: (type) => this.spawnAdd(type),
      };
      this.boss.update(gameplayDelta, bctx);
      this.hud.updateBoss(this.boss.hp / this.boss.maxHp);
    }

    // projectiles
    for (const p of this.projectiles) p.update(gameplayDelta);

    // pickups
    for (const p of this.pickups) p.update(realDelta, this.animClock);

    // combat
    const melee = this.combat.resolveMelee(this.player, this.enemies, this.boss, this.fx, this.rng);
    if (melee.playerLandHits > 0) {
      this.combo += melee.playerLandHits;
      this.comboTimer = 1.3;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      if (melee.playerLandHits > 1 || melee.heavyLandings > 0) this.audio.heavyHit();
      else this.audio.hit();
      this.hud.showCombo();
    }
    if (melee.playerKills > 0) this.onEnemiesKilled(melee.playerKills);
    if (melee.playerGotHit && this.player.alive) this.audio.hurt();

    const projHits = this.combat.resolveProjectiles(this.projectiles, this.player, this.fx);
    if (projHits > 0) this.audio.hurt();

    // boss death detection
    if (this.boss && this.wasBossAlive && !this.boss.alive) {
      this.dramaTimer = 1.6;
      this.audio.bossDie();
      this.fx.hitstop(0.12, 0.03);
      this.fx.whiteFlash(0.7);
    }
    this.wasBossAlive = this.boss ? this.boss.alive : false;

    // player death
    if (!this.player.alive && this.respawnTimer <= 0 && this.dramaTimer <= 0 && this.state === 'playing') {
      this.onPlayerKilled();
    }

    // entity cleanup
    this.removeDeadEntities(realDelta);
    this.cleanupProjectiles();

    // wave progression
    if (this.state === 'playing' && this.transitionTimer <= 0) this.progressLevel();

    // pickup collection
    this.collectPickups();
  }

  private playerBounds() {
    return { halfWidth: this.currentLevel.halfWidth, minZ: this.gateZ, maxZ: this.currentLevel.startZ };
  }

  // --- level / spawn director ---
  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.currentLevel = LEVELS[index];
    this.buildLevel(this.currentLevel);
    this.cameraRig.setBounds({ halfWidth: this.currentLevel.halfWidth, startZ: this.currentLevel.startZ, endZ: this.currentLevel.endZ });
    this.clearLevelEntities();
    this.player.group.position.set(0, 0, this.currentLevel.startZ);
    this.player.velocity.set(0, 0, 0);
    this.player.faceDirection(new THREE.Vector3(0, 0, -1));
    this.cameraRig.snapTo(this.player.group.position);
    this.gateZ = this.currentLevel.waves[0].gateZ;
    this.activeWaveIndex = 0;
    this.bossActive = false;
    this.boss = null;
    this.wasBossAlive = false;
    this.hud.hideBoss();
    this.spawnWave(this.currentLevel.waves[0]);
    this.audio.setMood(MOODS[index]);
    this.audio.levelStart();
    this.hud.setStatus(`${this.currentLevel.name} · ${this.currentLevel.subtitle}`, '▶');
    this.state = 'playing';
    this.hud.hideModal();
  }

  private spawnWave(wave: WaveDef): void {
    const hw = this.currentLevel.halfWidth;
    for (const spawn of wave.spawns) {
      for (let i = 0; i < spawn.count; i += 1) {
        const x = spawn.sideBias * (hw - 1.2) + (this.rng() - 0.5) * 2.4;
        const z = wave.gateZ + 1.2 + this.rng() * 2.0;
        const enemy = createEnemy(spawn.type, new THREE.Vector3(x, 0, z));
        enemy.faceDirection(new THREE.Vector3(0, 0, 1));
        this.enemies.push(enemy);
        this.scene.add(enemy.group);
        this.fx.spawnDust(enemy.group.position, this.currentLevel.theme.floorAccent);
      }
    }
  }

  private spawnBoss(): void {
    const def = this.currentLevel.boss;
    const profile = bossProfile(def.type, def.hp, def.name);
    const boss = new Boss(profile, new THREE.Vector3(0, 0, this.currentLevel.endZ + 1.5));
    this.boss = boss;
    this.wasBossAlive = true;
    this.bossActive = true;
    this.scene.add(boss.group);
    this.gateZ = this.currentLevel.endZ + 3;
    this.hud.showBoss(def.name);
    this.audio.bossHit();
    this.fx.addTrauma(0.5);
    this.hud.setStatus(`关底 BOSS · ${def.name}`, '☠');
  }

  private spawnAdd(type: Parameters<BossContext['spawnAdd']>[0]): void {
    if (this.enemies.length >= 8) return;
    const hw = this.currentLevel.halfWidth;
    const x = (this.rng() - 0.5) * (hw - 1) * 2;
    const z = this.boss ? this.boss.group.position.z + 2 + this.rng() * 2 : this.gateZ;
    const enemy = createEnemy(type, new THREE.Vector3(x, 0, z));
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    this.fx.spawnDust(enemy.group.position, this.currentLevel.theme.floorAccent);
  }

  private spawnProjectile(origin: THREE.Vector3, target: THREE.Vector3, damage: number): void {
    const color = this.currentLevel.theme.accentGlow;
    const proj = new Projectile(origin, target, damage, color);
    this.projectiles.push(proj);
    this.scene.add(proj.group);
  }

  private progressLevel(): void {
    if (this.bossActive) {
      return; // boss handled separately
    }
    if (this.enemies.length > 0) return; // current wave not cleared
    // wave cleared -> advance
    if (this.activeWaveIndex < this.currentLevel.waves.length - 1) {
      this.activeWaveIndex += 1;
      const wave = this.currentLevel.waves[this.activeWaveIndex];
      this.gateZ = wave.gateZ;
      this.spawnWave(wave);
      this.hud.setStatus(`推进 · ZONE ${this.levelIndex + 1}`, '▶');
    } else {
      // all waves cleared -> boss
      this.spawnBoss();
    }
  }

  private onEnemiesKilled(count: number): void {
    this.audio.enemyDie();
    for (const e of this.enemies) {
      if (!e.alive && !(e as Enemy & { _scored?: boolean })._scored) {
        (e as Enemy & { _scored?: boolean })._scored = true;
        const mult = 1 + this.combo * 0.05;
        this.score += Math.round(e.archetype.scoreValue * mult);
        this.player.addXp(e.archetype.xpValue);
        this.player.addRage(8);
        this.hud.pulseScore();
        this.effects.spawnRing(e.group.position.clone().setY(0.1), '#ffd24a', 1.6, 0.4);
        this.maybeDropPickup(e.group.position);
      }
    }
    void count;
  }

  private maybeDropPickup(pos: THREE.Vector3): void {
    if (this.rng() > 0.2) return;
    const r = this.rng();
    let kind: PickupKind = 'score';
    if (r < 0.28) kind = 'health';
    else if (r < 0.5) kind = 'rage';
    else if (r < 0.62) kind = 'weapon';
    const pickup = new Pickup(kind, new THREE.Vector3(pos.x, 0, pos.z));
    this.pickups.push(pickup);
    this.scene.add(pickup.group);
  }

  private collectPickups(): void {
    const pp = this.player.group.position;
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      const dx = pp.x - pickup.group.position.x;
      const dz = pp.z - pickup.group.position.z;
      const r = this.player.radius + pickup.radius;
      if (dx * dx + dz * dz <= r * r) {
        pickup.collect();
        this.applyPickup(pickup.kind);
      }
    }
  }

  private applyPickup(kind: PickupKind): void {
    switch (kind) {
      case 'health':
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
        this.audio.health();
        this.hud.setStatus('回血 +30', '♥');
        break;
      case 'score':
        this.score += 500;
        this.audio.pickup();
        this.hud.pulseScore();
        break;
      case 'rage':
        this.player.addRage(40);
        this.audio.pickup();
        this.hud.setStatus('怒气 +40', '✦');
        break;
      case 'weapon':
        this.player.activateWeapon();
        this.audio.pickup();
        this.hud.setStatus('武器强化', '⚔');
        break;
    }
    this.fx.spawnSpark(this.player.group.position.clone().setY(1), PICKUP_COLORS[kind], 12, 0.5);
    this.fx.addTrauma(0.15);
  }

  private removeDeadEntities(realDelta: number): void {
    void realDelta;
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (!e.alive && e.state === 'dead' && e.stateTimer > 0.6) {
        this.scene.remove(e.group);
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      if (!this.pickups[i].active && !this.pickups[i].group.visible) {
        // keep collected pickups pooled briefly; remove when invisible + inactive
      }
      if (!this.pickups[i].active) {
        const p = this.pickups[i];
        this.scene.remove(p.group);
        p.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }

  private cleanupProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.fx.spawnSpark(p.group.position, '#9ad36b', 8, 0.4);
        this.fx.spawnDust(p.group.position.clone().setY(0.1), this.currentLevel.theme.floorAccent);
        this.scene.remove(p.group);
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private clearLevelEntities(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    if (this.boss) {
      this.scene.remove(this.boss.group);
      this.boss.dispose();
      this.boss = null;
    }
    for (const p of this.projectiles) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.projectiles.length = 0;
    for (const p of this.pickups) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.pickups.length = 0;
    this.effects.clear();
    this.tweens.clear();
    this.shake.reset();
    this.fovPunch.reset();
    this.bossActive = false;
  }

  // --- player life / death ---
  private onPlayerKilled(): void {
    this.player.lives -= 1;
    this.hud.setLivesPipCount(Math.max(0, this.player.lives));
    this.fx.whiteFlash(0.6);
    this.fx.addTrauma(0.6);
    this.audio.lose();
    if (this.player.lives <= 0) {
      this.state = 'gameover';
      this.hud.showModal('game-over', {
        eyebrow: 'GAME OVER',
        title: '挑战失败',
        copy: `得分 ${this.score} · 最高连击 ${this.bestCombo}`,
        action: '重新挑战',
        hint: '回车 / R 重开',
      });
    } else {
      this.respawnTimer = 1.2;
      this.hud.setStatus(`剩余 ${this.player.lives} 命 · 准备复活`, '↻');
    }
  }

  private respawnPlayer(): void {
    const pos = new THREE.Vector3(0, 0, Math.min(this.currentLevel.startZ, this.gateZ + 4));
    this.player.reviveAt(pos);
    this.effects.spawnRing(pos.clone().setY(0.1), '#5ad1ff', 2.4, 0.5);
    this.audio.levelStart();
    this.hud.setStatus('继续战斗！', '▶');
  }

  private finishBossKill(): void {
    this.score += this.currentLevel.boss.hp; // boss score bonus
    if (this.boss) {
      this.scene.remove(this.boss.group);
      this.boss.dispose();
      this.boss = null;
    }
    this.bossActive = false;
    this.hud.hideBoss();
    if (this.levelIndex >= LEVELS.length - 1) {
      this.state = 'win';
      this.player.state = 'victory';
      this.player.stateTimer = 0;
      this.audio.win();
      this.hud.showModal('win', {
        eyebrow: 'VICTORY',
        title: '通关！',
        copy: `霓虹之城已解放 · 得分 ${this.score}`,
        action: '再玩一次',
        hint: '回车 / R 重新开始',
      });
    } else {
      this.state = 'transition';
      this.transitionTimer = 1.8;
      this.nextLevelQueued = this.levelIndex + 1;
      this.hud.showModal('level-clear', {
        eyebrow: `ZONE ${this.levelIndex + 1} CLEAR`,
        title: '区域清剿完成',
        copy: `进入 ${LEVELS[this.levelIndex + 1].name}`,
        action: '继续',
        hint: '自动进入下一关…',
      });
      this.audio.levelStart();
    }
  }

  // --- input / flow ---
  private handleMetaInput(): void {
    if (this.input.consumeStart()) {
      if (this.state === 'title' || this.state === 'gameover' || this.state === 'win') {
        this.startRun();
      }
    }
    if (this.input.consumePause()) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
  }

  private onModalAction(kind: ModalKind): void {
    this.audio.uiClick();
    switch (kind) {
      case 'title':
      case 'game-over':
      case 'win':
        this.startRun();
        break;
      case 'paused':
        this.resume();
        break;
      case 'level-clear':
        // auto-advances; button is a no-op skip
        break;
    }
  }

  private startRun(): void {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.elapsed = 0;
    this.player.lives = 3;
    this.player.rage = 0;
    this.player.xp = 0;
    this.player.level = 1;
    this.player.hp = this.player.maxHp;
    this.hud.setLivesPipCount(this.player.lives);
    this.respawnTimer = 0;
    this.dramaTimer = 0;
    this.transitionTimer = 0;
    this.nextLevelQueued = -1;
    this.loadLevel(0);
    this.audio.startMusic(MOODS[0]);
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showModal('paused', {
      eyebrow: 'PAUSED',
      title: '暂停',
      copy: '战场已冻结',
      action: '继续作战',
      hint: 'P / Esc 继续 · R 重开本关',
    });
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hideModal();
  }

  // retry current level (R)
  retryCurrentLevel(): void {
    this.player.lives = 3;
    this.player.hp = this.player.maxHp;
    this.player.rage = 0;
    this.hud.setLivesPipCount(this.player.lives);
    this.loadLevel(this.levelIndex);
  }

  // --- scene building ---
  private buildLevel(level: LevelDef): void {
    if (this.levelGroup) {
      disposeObject3D(this.levelGroup);
      this.scene.remove(this.levelGroup);
    }
    const theme = level.theme;
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

    const group = new THREE.Group();

    // lights
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.9);
    group.add(hemi);
    const ambient = new THREE.AmbientLight(theme.floorLine, theme.ambient * 0.25);
    group.add(ambient);
    this.sun.color = new THREE.Color(theme.sunColor);
    this.sun.intensity = theme.sunIntensity;
    this.sun.position.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 40;
    this.sun.shadow.camera.left = -9;
    this.sun.shadow.camera.right = 9;
    this.sun.shadow.camera.top = 10;
    this.sun.shadow.camera.bottom = -12;
    this.sun.shadow.bias = -0.0004;
    group.add(this.sun);
    group.add(this.sun.target);

    // floor strip
    const length = level.startZ - level.endZ + 6;
    const centerZ = (level.startZ + level.endZ) / 2;
    const floorTex = this.makeFloorTexture(theme);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(level.halfWidth, length / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(level.halfWidth * 2, length, 1, 1),
      new THREE.MeshStandardMaterial({ color: theme.floor, map: floorTex, roughness: 0.8, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = centerZ;
    floor.receiveShadow = true;
    group.add(floor);

    // neon side strips (emissive rails)
    const railMat = new THREE.MeshStandardMaterial({
      color: theme.propColor,
      emissive: theme.accentGlow,
      emissiveIntensity: 0.8,
      roughness: 0.5,
    });
    const railGeo = new THREE.BoxGeometry(0.3, 0.5, length);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(sx * (level.halfWidth + 0.4), 0.25, centerZ);
      rail.castShadow = true;
      group.add(rail);
    }

    // back wall + front gate wall (closes the strip visually)
    const wallMat = new THREE.MeshStandardMaterial({ color: theme.propColor, roughness: 0.85 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(level.halfWidth * 2 + 1, 3.4, 0.6), wallMat);
    backWall.position.set(0, 1.6, level.startZ + 3);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(level.halfWidth * 2 + 1, 3.4, 0.6), wallMat);
    frontWall.position.set(0, 1.6, level.endZ - 2);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    group.add(frontWall);

    // neon signage strip on back wall
    const signMat = new THREE.MeshBasicMaterial({ color: theme.accentGlow });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(level.halfWidth * 1.4, 0.3, 0.1), signMat);
    sign.position.set(0, 2.8, level.startZ + 2.65);
    group.add(sign);

    this.scatterProps(group, level, wallMat, theme);

    this.levelGroup = group;
    this.scene.add(group);
  }

  private scatterProps(group: THREE.Group, level: LevelDef, mat: THREE.Material, theme: LevelDef['theme']): void {
    const glowMat = new THREE.MeshStandardMaterial({
      color: theme.propColor,
      emissive: theme.accentGlow,
      emissiveIntensity: 0.7,
      roughness: 0.5,
    });
    const isPillar = level.id === 2;
    for (let z = level.startZ - 3; z > level.endZ + 1; z -= 6) {
      const t = (this.rng() - 0.5) * 2;
      const baseX = level.halfWidth + 0.9;
      const height = isPillar ? 3.2 + Math.abs(t) : 3.2;
      for (const sx of [-1, 1]) {
        const geo: THREE.BufferGeometry = isPillar
          ? new THREE.BoxGeometry(0.7, height, 0.7)
          : new THREE.CylinderGeometry(0.18, 0.22, height, 8);
        const prop = new THREE.Mesh(geo, mat);
        prop.position.set(sx * baseX, height / 2, z + t * 0.5);
        prop.castShadow = true;
        prop.receiveShadow = true;
        group.add(prop);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glowMat);
        cap.position.set(sx * baseX, height + 0.1, z + t * 0.5);
        group.add(cap);
      }
    }
  }

  private makeFloorTexture(theme: LevelDef['theme']): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('floor ctx');
    ctx.fillStyle = theme.floor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = theme.floorAccent;
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.strokeStyle = theme.floorLine;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, size - 12, size - 12);
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private followSun(): void {
    // keep the shadow frustum centered on the action
    const p = this.player.group.position;
    this.sun.position.set(p.x - 5, 11, p.z + 5);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }

  // --- HUD ---
  private updateHud(realDelta: number): void {
    const totalWaves = this.currentLevel.waves.length;
    const clearedFrac =
      (this.activeWaveIndex + (this.enemies.length === 0 && !this.bossActive ? 1 : 0)) / (totalWaves + 1) +
      (this.bossActive ? 0.5 / (totalWaves + 1) : 0);
    const state: HudState = {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      lives: this.player.lives,
      score: this.score,
      rage: this.player.rage,
      maxRage: this.player.maxRage,
      xp: this.player.xp,
      xpNext: xpForLevel(this.player.level),
      level: this.player.level,
      levelIndex: this.levelIndex + 1,
      levelCount: LEVELS.length,
      levelName: this.currentLevel.name,
      zoneProgress: Math.max(0, Math.min(1, clearedFrac)),
      combo: this.combo,
      hasWeapon: this.player.hasWeapon,
    };
    this.hud.update(state, realDelta);
  }

  // --- HitFx implementation ---
  private readonly fx: HitFx = {
    hitstop: (seconds, scale = 0.05) => {
      this.hitstopRemaining = Math.max(this.hitstopRemaining, seconds);
      this.timeScale = scale;
    },
    addTrauma: (a) => this.shake.addTrauma(a),
    punchFov: (d) => this.fovPunch.punch(d),
    spawnSpark: (pos, color, count, power) => this.effects.spawnSpark(pos, color, count, power),
    spawnDust: (pos, color) => this.effects.spawnDust(pos, color),
    spawnHitNumber: (pos, amount, crit) => this.hud.spawnHitNumber(pos, amount, crit),
    whiteFlash: (strength) => this.hud.flash(strength),
    rumble: (strong, weak, ms) => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        const actuator = pad?.vibrationActuator;
        if (!actuator) continue;
        void actuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      }
    },
  };

  private attachButtons(): void {
    const pauseBtn = document.querySelector<HTMLElement>('#pause-button');
    pauseBtn?.addEventListener('click', () => {
      this.audio.uiClick();
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
    const muteBtn = document.querySelector<HTMLElement>('#mute-button');
    muteBtn?.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.isMuted());
      muteBtn.textContent = this.audio.isMuted() ? '🔇' : '🔊';
    });
    const retryBtn = document.querySelector<HTMLElement>('#retry-button');
    retryBtn?.addEventListener('click', () => {
      if (this.state === 'paused') this.retryCurrentLevel();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && (this.state === 'paused' || this.state === 'gameover')) {
        if (this.state === 'gameover') this.startRun();
        else this.retryCurrentLevel();
      }
    });
  }

  // --- test hooks + diagnostics ---
  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: (name: string) => {
        if (name === 'active-play') this.testActivePlay();
        else if (name === 'complete') this.testComplete();
        else if (name === 'boss') this.testBoss();
        else if (name === 'title') {
          this.state = 'title';
          this.hud.showModal('title', {
            eyebrow: 'NEON CITY · 199X', title: 'MIGHTY BRAWL', copy: '清剿三区黑帮', action: '开始游戏', hint: '',
          });
        } else console.warn(`Unknown test state: ${name}`);
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
      },
    };
  }

  private testActivePlay(): void {
    this.startRun();
  }

  private testBoss(): void {
    this.startRun();
    this.clearLevelEntities();
    this.activeWaveIndex = this.currentLevel.waves.length - 1;
    this.spawnBoss();
    this.state = 'playing';
    this.hud.hideModal();
  }

  private testComplete(): void {
    this.startRun();
    this.levelIndex = LEVELS.length - 1;
    this.currentLevel = LEVELS[this.levelIndex];
    this.buildLevel(this.currentLevel);
    this.clearLevelEntities();
    this.player.group.position.set(0, 0, this.currentLevel.startZ);
    this.cameraRig.setBounds({ halfWidth: this.currentLevel.halfWidth, startZ: this.currentLevel.startZ, endZ: this.currentLevel.endZ });
    this.cameraRig.snapTo(this.player.group.position);
    this.state = 'win';
    this.player.state = 'victory';
    this.hud.showModal('win', {
      eyebrow: 'VICTORY', title: '通关！', copy: '霓虹之城已解放', action: '再玩一次', hint: '',
    });
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const remaining = this.enemies.length + (this.boss ? 1 : 0);
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.score,
      targetScore: remaining,
      complete: this.state === 'win',
      player: {
        position: {
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
        },
        speed: this.player.velocity.length(),
      },
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
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
