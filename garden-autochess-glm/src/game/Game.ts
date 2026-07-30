import * as THREE from 'three';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { createSeededRandom, randInt } from '../utils/random';
import { disposeObject3D } from '../utils/dispose';
import { ShakeRig, FovPunch, TweenManager } from '../utils/feel';
import { CameraRig } from '../systems/CameraRig';
import { AudioSystem } from '../systems/AudioSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud, PLANT_EMOJI, type BenchSlotView, type RewardCardView, type ShopSlotView } from '../systems/Hud';
import {
  BENCH_SIZE,
  BOSSES,
  ENEMIES,
  findGraft,
  MUTATIONS,
  PLANTS,
  PREP_SUN,
  RELIC_IDS,
  RELICS,
  REROLL_COST,
  SHOP_SIZE,
  SELL_RATIO,
  shopWeights,
  START_DEFENSE_HP,
  START_SUN,
  TOTAL_WAVES,
  WAVES,
  WEATHERS,
} from './content';
import {
  CELL_D,
  CELL_W,
  cellToWorldX,
  COLS,
  HOME_X,
  laneToWorldZ,
  LANES,
  SPAWN_X,
  type BenchSlot,
  type BossId,
  type EnemyDef,
  type EnemyId,
  type HitFx,
  type ModalKind,
  type MutationOption,
  type Phase,
  type PlantId,
  type ProjectileSpawn,
  type RelicId,
  type SpawnDef,
  type Star,
  type WeatherId,
} from './types';
import { Plant, type GlobalMods, type PlantContext, type PlantMods } from '../entities/Plant';
import { Enemy, type EnemyContext } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { SunPickup } from '../entities/SunPickup';

interface PendingSpawn {
  enemy: EnemyId;
  lane: number;
  at: number; // 触发时间（秒，battle 内）
}

export class Game {
  private static nextId = 1;
  readonly gameId = Game.nextId++;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private readonly effects = new EffectsSystem();
  private readonly audio = new AudioSystem();
  private readonly hud: Hud;
  private readonly cameraRig: CameraRig;
  private readonly shake = new ShakeRig();
  private readonly fovPunch = new FovPunch();
  private readonly tweens = new TweenManager();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );
  private readonly sun = new THREE.DirectionalLight('#fff4d0', 1.4);
  private readonly tuning: DebugTuning = { exposure: 1.05, maxDpr: 2, timeScale: 1 };
  private readonly debugTools: DebugTools;

  private lawn: THREE.Group | null = null;
  private rng = createSeededRandom(1);

  // --- 游戏状态 ---
  private phase: Phase = 'title';
  private sunAmount = START_SUN;
  private defenseHp = START_DEFENSE_HP;
  private maxDefenseHp = START_DEFENSE_HP;
  private score = 0;
  private waveIndex = 0;
  private bench: (BenchSlot | null)[] = new Array(BENCH_SIZE).fill(null);
  private shop: (PlantId | null)[] = new Array(SHOP_SIZE).fill(null);
  private shopLocked = false;
  private grid = new Map<number, Plant>(); // key = lane*COLS+col
  private plants: Plant[] = [];
  private enemies: Enemy[] = [];
  private boss: Enemy | null = null;
  private projectiles: Projectile[] = [];
  private pickups: SunPickup[] = [];
  private relics = new Set<RelicId>();
  private weather: WeatherId = 'clear';
  private shovelCharges = 3;
  private fertCharges = 2;
  private activeTool: 'shovel' | 'fert' | null = null;
  private pendingSpawns: PendingSpawn[] = [];
  private battleTime = 0;
  private spawnCursor = 0;
  private reviveUsed = false;
  private uidCounter = 1;
  private pendingMutationUid: number | null = null;
  private pendingBoss: BossId | null = null;
  private bossAt = 0;
  private bossPending = false;

  // 选择 / 拖拽
  private sel: { kind: 'bench'; index: number } | { kind: 'grid'; lane: number; col: number } | null = null;
  private dragging: { source: 'bench' | 'grid'; benchIndex?: number; lane?: number; col?: number; plantId: PlantId; star: number } | null = null;

  // 渲染/调试
  private frame = 0;
  private elapsed = 0;
  private animClock = 0;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private timeScale = 1;
  private hitstopRemaining = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;
    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.setCenter(new THREE.Vector3(0, 0, 0));
    this.hud = new Hud(this.camera);
    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.scene.add(this.effects.group);
    this.buildLawn();
    this.cameraRig.snapTo();

    this.hud.updateSun(this.sunAmount);
    this.hud.updateHp(this.defenseHp, this.maxDefenseHp);
    this.hud.updateWave(1, TOTAL_WAVES, 0);
    this.hud.updateScore(0);
    this.hud.updateTools(this.shovelCharges, this.fertCharges, false, false);

    this.showModal('title', {
      eyebrow: '末日花园 · 变异植物抵抗污染怪物',
      title: '末日花园自走棋',
      copy: '买种子、摆花园、合植物构筑阵容，让植物自动抵挡 15 波污染怪物潮。',
      action: '开始游戏',
      hint: '回车 / 点击按钮 开始',
    });

    this.attachListeners();
    this.installTestHooks();
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.audio.dispose();
    this.debugTools.dispose();
    this.clearEntities();
    this.effects.dispose();
    if (this.lawn) {
      disposeObject3D(this.lawn);
      this.scene.remove(this.lawn);
      this.lawn = null;
    }
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ========================================================================
  // 主循环
  // ========================================================================
  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    void elapsed;

    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    if (this.hitstopRemaining > 0) {
      this.hitstopRemaining -= delta;
      if (this.hitstopRemaining <= 0) this.timeScale = 1;
    }
    const gameDelta = delta * this.timeScale * this.tuning.timeScale;
    this.audio.setDuck(this.hitstopRemaining > 0 ? 0.55 : 1);

    if (!this.reducedMotion) this.animClock += delta;

    if (this.phase === 'battle') {
      this.updateBattle(gameDelta);
      this.elapsed += delta;
    } else if (this.phase === 'prep' || this.phase === 'reward' || this.phase === 'title') {
      // 备战/结算期：植物保持轻微待机动画
      for (const p of this.plants) p.update(0, this.animClock, this.idlePlantCtx());
      for (const pk of this.pickups) pk.update(delta, this.animClock);
      this.collectSunPickups();
    }

    // 相机/反馈始终按真实时间
    this.cameraRig.update(delta);
    this.shake.update(delta, this.camera, this.reducedMotion);
    this.fovPunch.update(delta, this.camera, this.cameraRig.baseFov);
    this.effects.update(delta);
    this.tweens.update(delta);
    this.hud.tickFloats(delta);
    this.hud.tickStatus(delta);
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ========================================================================
  // 战斗更新
  // ========================================================================
  private updateBattle(delta: number): void {
    this.battleTime += delta;

    // 1. 出怪
    this.advanceSpawns();

    // 2. 重置光环增益（由抢旗兵/树灵重新施加）
    for (const e of this.enemies) e.speedBoost = 1;

    // 3. 构建路线索引
    const enemiesByLane = new Map<number, Enemy[]>();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      let arr = enemiesByLane.get(e.lane);
      if (!arr) {
        arr = [];
        enemiesByLane.set(e.lane, arr);
      }
      arr.push(e);
    }
    const plantsByLane = new Map<number, Plant[]>();
    for (const p of this.plants) {
      if (!p.alive) continue;
      let arr = plantsByLane.get(p.lane);
      if (!arr) {
        arr = [];
        plantsByLane.set(p.lane, arr);
      }
      arr.push(p);
    }

    // 4. 施加光环增益（抢旗兵 / 毒雾树灵）
    for (const e of this.enemies) {
      if (!e.alive || e.def.special !== 'aurabuff') continue;
      const mult = e.def.isBoss ? 1.25 : 1.35;
      const r = e.def.isBoss ? 4 : 2.2;
      for (const other of this.enemies) {
        if (!other.alive || other === e) continue;
        const dx = other.x - e.x;
        const dz = other.z - e.z;
        if (dx * dx + dz * dz <= r * r) other.speedBoost = Math.max(other.speedBoost, mult);
      }
    }

    // 5. 植物开火
    const pctx = this.plantCtx(enemiesByLane);
    for (const p of this.plants) {
      if (p.alive) p.update(delta, this.animClock, pctx);
    }

    // 6. 投射物
    for (const proj of this.projectiles) proj.update(delta);
    this.resolveProjectiles(enemiesByLane);

    // 7. 敌人推进 / 啃咬 / 状态
    const ectx = this.enemyCtx(plantsByLane);
    for (const e of this.enemies) {
      if (e.alive) e.update(delta, ectx);
    }

    // 8. 雨天回血
    if (this.weather === 'rain') {
      for (const p of this.plants) {
        if (p.alive) p.heal(6 * delta);
      }
    }

    // 9. 阳光拾取
    for (const pk of this.pickups) pk.update(delta, this.animClock);
    this.collectSunPickups();

    // 10. 清理
    this.cleanupDead(delta);

    // 11. BOSS 死亡
    if (this.boss && !this.boss.alive) {
      this.onBossDefeated();
    }

    // 12. 波次结束判定（出怪游标走完 + 场上无敌人 + 无待出 BOSS）
    if (
      this.spawnCursor >= this.pendingSpawns.length &&
      this.enemies.length === 0 &&
      !this.bossPending &&
      (!this.boss || !this.boss.alive)
    ) {
      this.onWaveCleared();
    }

    // 13. 防线失守
    if (this.defenseHp <= 0) {
      this.gameLose();
    }

    this.hud.updateSun(this.sunAmount);
    this.hud.updateHp(this.defenseHp, this.maxDefenseHp);
    this.hud.updateWave(this.waveIndex + 1, TOTAL_WAVES, this.waveProgress());
    this.hud.updateScore(this.score);
    if (this.boss && this.boss.alive) {
      this.hud.updateBoss(this.boss.hp / this.boss.maxHp);
    }
  }

  private advanceSpawns(): void {
    while (this.spawnCursor < this.pendingSpawns.length) {
      const s = this.pendingSpawns[this.spawnCursor];
      if (s.at <= this.battleTime) {
        this.spawnEnemy(s.enemy, s.lane);
        this.spawnCursor += 1;
      } else {
        break;
      }
    }
    // BOSS 按确定性时间出场
    if (this.pendingBoss && this.battleTime >= this.bossAt && !this.boss) {
      this.spawnBoss(this.pendingBoss);
      this.pendingBoss = null;
      this.bossPending = false;
    }
  }

  private waveProgress(): number {
    const total = this.pendingSpawns.length;
    const done = this.spawnCursor;
    const spawnFrac = total > 0 ? done / total : 1;
    const enemyFrac = total > 0 ? 0 : 1 - Math.min(1, this.enemies.length / 8);
    return Math.max(spawnFrac, enemyFrac);
  }

  // ========================================================================
  // 上下文工厂
  // ========================================================================
  private plantCtx(enemiesByLane: Map<number, Enemy[]>): PlantContext {
    return {
      rng: this.rng,
      frontmost: (lane, fromX, rangeCells) => {
        const arr = enemiesByLane.get(lane);
        if (!arr) return null;
        let best: Enemy | null = null;
        const maxDist = rangeCells < 0 ? Infinity : rangeColsToWorld(rangeCells);
        for (const e of arr) {
          if (!e.alive) continue;
          if (e.x < fromX - 0.2) continue; // 已越过植物（在后方）不打
          if (e.x - fromX > maxDist) continue;
          if (!best || e.x < best.x) best = e;
        }
        return best ? { x: best.x, alive: best.alive } : null;
      },
      spawnProjectile: (opts) => this.spawnProjectile(opts),
      dropSun: (x, z, value) => this.spawnSunPickup(x, z, value),
      dealAura: (x, z, radiusCells, dps, type, status) => {
        const rWorld = radiusColsToWorld(radiusCells);
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz <= rWorld * rWorld) {
            if (e.takeDamage(dps, type) > 0) this.onEnemyKilled(e);
            if (status) e.applyStatus(status);
          }
        }
      },
      chainZap: (originX, lane, count, dmg, status, color) => {
        const arr = enemiesByLane.get(lane) ?? [];
        const targets = arr
          .filter((e) => e.alive && e.x >= originX - 0.2)
          .sort((a, b) => a.x - b.x)
          .slice(0, Math.max(1, count));
        let prevY = 0.6;
        for (const t of targets) {
          if (t.takeDamage(dmg, 'elec') > 0) this.onEnemyKilled(t);
          if (status) t.applyStatus(status);
          this.effects.spawnBeam(new THREE.Vector3(t.x, 0, t.z), color, 1.4, 0.16);
          prevY = 0.6;
        }
        void prevY;
        if (targets.length > 0) {
          this.effects.spawnSpark(new THREE.Vector3(originX, 0.6, laneToWorldZ(lane)), color, 6, 0.3);
          this.audio.zap();
        }
      },
      fx: this.fx,
    };
  }

  private enemyCtx(plantsByLane: Map<number, Plant[]>): EnemyContext {
    return {
      rng: this.rng,
      blockingPlant: (lane, enemyX) => {
        const arr = plantsByLane.get(lane);
        if (!arr) return null;
        let best: Plant | null = null;
        for (const p of arr) {
          if (!p.alive) continue;
          if (p.x > enemyX + 0.6) continue; // 植物在敌人前方（更靠近出生点）才挡路？不对：敌人在 +X，植物在 -X。挡路的植物 = 在敌人前进方向上、X 小于敌人但最近。
          if (!best || p.x > best.x) best = p;
        }
        return best;
      },
      fx: this.fx,
      onBreach: (dmg, lane) => this.onBreach(dmg, lane),
      spawnSlime: (lane, x, count) => {
        for (let i = 0; i < count; i += 1) {
          this.spawnRawEnemy('slime', lane, x + i * 0.6);
        }
        this.audio.bossHit();
      },
      spawnAdd: (id, lane, x) => {
        this.spawnRawEnemy(id, lane, x);
      },
      poisonTrail: (lane, x, dps) => {
        const arr = plantsByLane.get(lane);
        if (!arr) return;
        for (const p of arr) {
          if (p.alive && Math.abs(p.x - x) < 0.9) {
            if (p.takeDamage(dps * 0.5) > 0) this.fx.spawnDust(p.group.position, '#b6e83a');
          }
        }
      },
      buffNearby: () => {
        // 由 Game 的光环预扫描处理；此处空实现
      },
      fogSpeedMult: this.weather === 'fog' ? 0.85 : 1,
    };
  }

  private idlePlantCtx(): PlantContext {
    return {
      rng: this.rng,
      frontmost: () => null,
      spawnProjectile: () => {},
      dropSun: () => {},
      dealAura: () => {},
      chainZap: () => {},
      fx: this.fx,
    };
  }

  private readonly fx: HitFx = {
    hitstop: (seconds, scale = 0.05) => {
      this.hitstopRemaining = Math.max(this.hitstopRemaining, seconds);
      this.timeScale = scale;
    },
    addTrauma: (a) => this.shake.addTrauma(a),
    punchFov: (d) => this.fovPunch.punch(d),
    spawnSpark: (pos, color, count, power) => this.effects.spawnSpark(pos, color, count, power),
    spawnDust: (pos, color) => this.effects.spawnDust(pos, color),
    spawnRing: (pos, color, maxScale, duration) => this.effects.spawnRing(pos, color, maxScale, duration),
    spawnBeam: (pos, color, height, duration) => this.effects.spawnBeam(pos, color, height, duration),
    whiteFlash: (strength) => this.hud.flash(strength),
  };

  // ========================================================================
  // 生成 / 投射物 / 阳光
  // ========================================================================
  private spawnEnemy(id: EnemyId, lane: number): void {
    this.spawnRawEnemy(id, lane, SPAWN_X + this.rng() * 1.2);
  }

  private spawnRawEnemy(id: EnemyId | BossId, lane: number, x: number): void {
    const def: EnemyDef | undefined = (BOSSES as Record<string, EnemyDef>)[id] ?? (ENEMIES as Record<string, EnemyDef>)[id];
    if (!def) return;
    const e = new Enemy(def, lane, x);
    this.enemies.push(e);
    this.scene.add(e.group);
    this.effects.spawnDust(e.group.position, def.color);
  }

  private spawnBoss(id: BossId): void {
    const def = BOSSES[id];
    const lane = 2;
    const boss = new Enemy(def, lane, SPAWN_X + 2);
    this.boss = boss;
    this.scene.add(boss.group);
    this.hud.showBoss(def.name);
    this.fx.addTrauma(0.5);
    this.fx.whiteFlash(0.4);
    this.audio.bossHit();
    this.hud.setStatus(`BOSS 来袭 · ${def.name}`, '☠');
  }

  private spawnProjectile(opts: ProjectileSpawn): void {
    const proj = new Projectile({
      origin: opts.origin,
      lane: opts.lane,
      speed: opts.speed,
      damage: opts.damage,
      type: opts.type,
      damageType: opts.damageType,
      mode: opts.mode ?? 'line',
      aoeCells: opts.aoeCells,
      status: opts.status,
      pierce: opts.pierce,
      color: opts.color,
      targetX: opts.targetX ?? 999,
    });
    this.projectiles.push(proj);
    this.scene.add(proj.group);
  }

  private resolveProjectiles(enemiesByLane: Map<number, Enemy[]>): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i];
      if (!proj.alive) {
        // lob 落地或越界 → 爆炸
        this.explode(proj);
        this.scene.remove(proj.group);
        proj.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }
      const arr = enemiesByLane.get(proj.lane) ?? [];
      // 越界（飞过出生点）
      if (proj.group.position.x > SPAWN_X + 1.5) {
        this.scene.remove(proj.group);
        proj.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const e of arr) {
        if (!e.alive) continue;
        if (e.x < proj.group.position.x - 0.25) continue;
        if (e.x > proj.group.position.x + 0.4) continue;
        // 命中
        this.applyProjectileHit(proj, e);
        hit = true;
        if (!proj.pierce) break;
      }
      if (hit && !proj.pierce) {
        this.scene.remove(proj.group);
        proj.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private explode(proj: Projectile): void {
    if (proj.mode !== 'lob' && proj.aoeCells <= 0) return;
    const radius = proj.aoeCells > 0 ? radiusColsToWorld(proj.aoeCells) : 1.2;
    const cx = proj.group.position.x;
    const cz = proj.group.position.z;
    this.effects.spawnRing(new THREE.Vector3(cx, 0.1, cz), proj.color, radius * 1.4, 0.35);
    this.effects.spawnSpark(new THREE.Vector3(cx, 0.4, cz), proj.color, 12, 0.4);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      if (dx * dx + dz * dz <= radius * radius) {
        if (e.takeDamage(proj.damage, proj.damageType) > 0) this.onEnemyKilled(e);
        if (proj.status) e.applyStatus(proj.status);
      }
    }
  }

  private applyProjectileHit(proj: Projectile, e: Enemy): void {
    const died = e.takeDamage(proj.damage, proj.damageType);
    if (proj.status) e.applyStatus(proj.status);
    if (proj.aoeCells > 0) {
      // 范围投射物命中即爆
      this.explode(proj);
    } else {
      this.effects.spawnSpark(proj.group.position.clone(), proj.color, 5, 0.3);
    }
    // 光合联动：投射物命中时附带阳光
    const owner = this.findPlantByLaneNear(proj.lane, proj.group.position.x - 0.5);
    if (owner && owner.photosynth) {
      this.sunAmount += 4;
      this.hud.spawnFloatSun(e.group.position.clone().setY(1.2), 4);
    }
    if (died > 0) this.onEnemyKilled(e);
  }

  private findPlantByLaneNear(lane: number, x: number): Plant | null {
    let best: Plant | null = null;
    for (const p of this.plants) {
      if (!p.alive || p.lane !== lane) continue;
      if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    }
    return best;
  }

  private spawnSunPickup(x: number, z: number, value: number): void {
    const pk = new SunPickup(new THREE.Vector3(x, 2.4, z), value);
    this.pickups.push(pk);
    this.scene.add(pk.group);
    this.audio.sun();
  }

  private collectSunPickups(): void {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pk = this.pickups[i];
      if (!pk.alive) {
        this.scene.remove(pk.group);
        pk.dispose();
        this.pickups.splice(i, 1);
        continue;
      }
      // 落地后自动收集（auto-battler，无需点击）
      if (pk.group.position.y <= 0.62) {
        this.sunAmount += pk.value;
        this.hud.updateSun(this.sunAmount);
        this.hud.spawnFloatSun(pk.group.position.clone().setY(0.8), pk.value);
        this.effects.spawnSpark(pk.group.position.clone().setY(0.5), '#ffd23a', 6, 0.3);
        this.audio.pickup();
        pk.collect();
        this.scene.remove(pk.group);
        pk.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }

  // ========================================================================
  // 事件回调
  // ========================================================================
  private onEnemyKilled(e: Enemy): void {
    this.score += e.def.score;
    this.hud.pulseScore();
    this.fx.spawnSpark(e.group.position.clone().setY(0.6), e.def.color, 10, 0.4);
    this.fx.spawnRing(e.group.position.clone().setY(0.1), e.def.color, 1.6, 0.35);
    this.audio.enemyDie();
    // 阳光掉落
    if (this.rng() < e.def.sunBounty) {
      this.spawnSunPickup(e.x, e.z, 25);
    }
    if (e === this.boss) {
      // BOSS 死亡在 updateBattle 统一处理
    }
  }

  private onBreach(dmg: number, lane: number): void {
    this.defenseHp -= dmg;
    // 复活种子遗物：首次突破自动回血
    if (this.defenseHp <= 0 && this.relics.has('revive') && !this.reviveUsed) {
      this.reviveUsed = true;
      this.defenseHp = Math.max(this.defenseHp, 0) + 40;
      this.hud.setStatus('复活种子触发！防线恢复 40', '✦');
      this.fx.whiteFlash(0.6);
    }
    this.fx.addTrauma(0.5);
    this.fx.whiteFlash(0.35);
    this.audio.hurt();
    this.hud.setStatus(`第 ${lane + 1} 路线被突破！防线 -${Math.round(dmg)}`, '⚠');
    void dmg;
  }

  private onBossDefeated(): void {
    const def = this.boss!.def;
    this.score += def.score;
    this.hud.pulseScore();
    this.fx.hitstop(0.18, 0.03);
    this.fx.whiteFlash(0.7);
    this.fx.addTrauma(0.7);
    this.audio.bossDie();
    this.hud.hideBoss();
    this.hud.setStatus(`击败 ${def.name}！`, '★');
    this.boss = null;
  }

  // ========================================================================
  // 清理
  // ========================================================================
  private cleanupDead(delta: number): void {
    void delta;
    // 植物
    for (let i = this.plants.length - 1; i >= 0; i -= 1) {
      const p = this.plants[i];
      if (!p.alive) {
        this.fx.spawnDust(p.group.position, '#7a5a2a');
        this.scene.remove(p.group);
        p.dispose();
        this.grid.delete(this.cellKey(p.lane, p.col));
        this.plants.splice(i, 1);
      }
    }
    // 敌人
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.scene.remove(e.group);
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    // 投射物已在 resolveProjectiles 处理
  }

  private clearEntities(): void {
    for (const p of this.plants) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.plants.length = 0;
    this.grid.clear();
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
    for (const pr of this.projectiles) {
      this.scene.remove(pr.group);
      pr.dispose();
    }
    this.projectiles.length = 0;
    for (const pk of this.pickups) {
      this.scene.remove(pk.group);
      pk.dispose();
    }
    this.pickups.length = 0;
    this.effects.clear();
    this.tweens.clear();
    this.shake.reset();
    this.fovPunch.reset();
    this.hud.hideBoss();
  }

  // ========================================================================
  // 阶段流转
  // ========================================================================
  private startRun(): void {
    this.score = 0;
    this.elapsed = 0;
    this.sunAmount = START_SUN;
    this.defenseHp = START_DEFENSE_HP;
    this.maxDefenseHp = START_DEFENSE_HP;
    this.waveIndex = 0;
    this.relics.clear();
    this.weather = 'clear';
    this.reviveUsed = false;
    this.shovelCharges = 3;
    this.fertCharges = 2;
    this.activeTool = null;
    this.sel = null;
    this.clearEntities();
    this.hud.updateRelics([]);
    this.hud.hideModal();
    this.audio.startMusic('prep');
    this.enterPrep();
  }

  private enterPrep(): void {
    this.phase = 'prep';
    this.shopLocked = false;
    this.rerollShop();
    // 备战阳光 + 阳光核心遗物
    let gain = PREP_SUN;
    if (this.relics.has('suncore')) gain += 20;
    this.sunAmount += gain;
    this.shovelCharges = 3;
    this.fertCharges = 2;
    this.activeTool = null;
    this.recomputeAllPlants();
    this.hud.showPrep(true);
    this.hud.updateSun(this.sunAmount);
    this.hud.updateHp(this.defenseHp, this.maxDefenseHp);
    this.hud.updateWave(this.waveIndex + 1, TOTAL_WAVES, 0);
    this.hud.updateTools(this.shovelCharges, this.fertCharges, false, false);
    this.refreshPrepUi();
    this.hud.setStatus(`第 ${this.waveIndex + 1} 波 · ${WAVES[this.waveIndex].label}（备战）`, '🌱');
    this.audio.setMood('prep');
  }

  private startBattle(): void {
    if (this.phase !== 'prep') return;
    if (this.pendingMutationUid !== null) return; // 变异未选
    this.phase = 'battle';
    this.battleTime = 0;
    this.spawnCursor = 0;
    const wave = WAVES[this.waveIndex];
    this.pendingSpawns = this.expandWave(wave);
    this.pendingBoss = wave.boss ?? null;
    this.bossPending = wave.boss != null;
    if (wave.boss) {
      const lastAt = this.pendingSpawns.length > 0 ? this.pendingSpawns[this.pendingSpawns.length - 1].at : 0;
      this.bossAt = Math.max(8, lastAt + 5);
    }
    this.sel = null;
    this.hud.showPrep(false);
    this.hud.setStatus(`第 ${this.waveIndex + 1} 波 · 战斗开始！`, '⚔');
    this.audio.waveStart();
    this.audio.setMood('battle');
  }

  private expandWave(wave: { spawns: readonly SpawnDef[] }): PendingSpawn[] {
    const out: PendingSpawn[] = [];
    for (const s of wave.spawns) {
      const gap = s.gap ?? 2.5;
      const delay = s.delay ?? 0;
      const bias = s.laneBias ?? 0;
      for (let i = 0; i < s.count; i += 1) {
        const lane = this.pickLane(bias);
        out.push({ enemy: s.enemy, lane, at: delay + i * gap });
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  private pickLane(bias: number): number {
    // bias: -1 顶 .. 1 底；映射到路线偏好
    const base = ((bias + 1) / 2) * (LANES - 1);
    const jitter = (this.rng() - 0.5) * 2.4;
    return Math.max(0, Math.min(LANES - 1, Math.round(base + jitter)));
  }

  private onWaveCleared(): void {
    this.score += 200 + this.waveIndex * 50;
    this.hud.pulseScore();
    if (this.waveIndex >= TOTAL_WAVES - 1) {
      this.gameWin();
      return;
    }
    // 进入奖励阶段
    this.enterReward();
  }

  private enterReward(): void {
    this.phase = 'reward';
    this.hud.showPrep(false);
    this.audio.setMood('prep');
    const cards = this.rollRewardCards();
    this.hud.showRewards(cards, (card) => this.pickReward(card));
    this.hud.setStatus('选择一项奖励', '🎁');
  }

  private rollRewardCards(): RewardCardView[] {
    const cards: RewardCardView[] = [];
    const pool: Array<() => RewardCardView> = [
      () => ({
        kind: 'fertilizer',
        icon: '💩',
        name: '紧急肥料',
        desc: '立即获得 75 阳光',
        payload: { sun: 75 },
      }),
      () => {
        const w = this.randomWeather();
        return { kind: 'weather' as const, icon: WEATHERS[w].icon, name: WEATHERS[w].name, desc: `下波生效：${WEATHERS[w].desc}`, payload: { weather: w } };
      },
      () => {
        const r = this.randomRelic();
        return { kind: 'relic' as const, icon: RELICS[r].icon, name: RELICS[r].name, desc: RELICS[r].desc, payload: { relic: r } };
      },
      () => ({
        kind: 'mutation',
        icon: '🧬',
        name: '强化肥料',
        desc: '随机提升一株场上植物的星级（最高 2★）',
        payload: { upgrade: true },
      }),
    ];
    const picked = new Set<number>();
    while (cards.length < 3 && picked.size < pool.length) {
      const idx = randInt(this.rng, pool.length);
      if (picked.has(idx)) continue;
      picked.add(idx);
      cards.push(pool[idx]());
    }
    return cards;
  }

  private pickReward(card: RewardCardView): void {
    const p = card.payload as { sun?: number; weather?: WeatherId; relic?: RelicId; upgrade?: boolean };
    if (p.sun) {
      this.sunAmount += p.sun;
      this.hud.setStatus(`获得 ${p.sun} 阳光`, '☀');
    } else if (p.weather) {
      this.weather = p.weather;
      this.hud.setStatus(`天气：${WEATHERS[p.weather].name}`, WEATHERS[p.weather].icon);
    } else if (p.relic) {
      this.relics.add(p.relic);
      this.hud.updateRelics([...this.relics].map((id) => RELICS[id].icon));
      this.hud.setStatus(`获得遗物：${RELICS[p.relic].name}`, RELICS[p.relic].icon);
      this.fx.whiteFlash(0.3);
    } else if (p.upgrade) {
      const candidates = this.plants.filter((pl) => pl.alive && pl.star < 2);
      if (candidates.length > 0) {
        const target = candidates[randInt(this.rng, candidates.length)];
        target.setStar(Math.min(2, target.star + 1) as Star);
        this.recomputePlant(target);
        this.fx.spawnRing(target.group.position.clone().setY(0.2), '#ffd23a', 2, 0.5);
        this.hud.setStatus(`${target.def.name} 升至 ${target.star}★`, '★');
      } else {
        this.sunAmount += 50;
        this.hud.setStatus('无植物可强化，获得 50 阳光', '☀');
      }
    }
    this.audio.buy();
    this.hud.hideRewards();
    this.waveIndex += 1;
    this.enterPrep();
  }

  private gameWin(): void {
    this.phase = 'win';
    this.audio.setMood('win');
    this.audio.win();
    this.hud.showPrep(false);
    this.showModal('win', {
      eyebrow: 'VICTORY',
      title: '花园保卫成功！',
      copy: `击退全部 15 波污染怪物 · 得分 ${this.score}`,
      action: '再玩一次',
      hint: '回车 / R 重新开始',
    });
  }

  private gameLose(): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.audio.lose();
    this.hud.showPrep(false);
    this.showModal('gameover', {
      eyebrow: 'GAME OVER',
      title: '花园沦陷',
      copy: `撑到第 ${this.waveIndex + 1} 波 · 得分 ${this.score}`,
      action: '重新挑战',
      hint: '回车 / R 重新开始',
    });
  }

  // ========================================================================
  // 商店
  // ========================================================================
  private rerollShop(): void {
    if (this.shopLocked) return;
    const weights = shopWeights(this.waveIndex + 1);
    for (let i = 0; i < SHOP_SIZE; i += 1) {
      this.shop[i] = this.weightedPick(weights);
    }
  }

  private weightedPick(items: { id: PlantId; weight: number }[]): PlantId {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = this.rng() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it.id;
    }
    return items[items.length - 1].id;
  }

  private buyShop(index: number): boolean {
    if (this.phase !== 'prep') return false;
    const id = this.shop[index];
    if (!id) return false;
    const cost = PLANTS[id].cost;
    if (this.sunAmount < cost) {
      this.hud.setStatus('阳光不足', '⚠');
      return false;
    }
    const free = this.bench.findIndex((s) => s === null);
    if (free < 0) {
      this.hud.setStatus('备战台已满', '⚠');
      return false;
    }
    this.sunAmount -= cost;
    this.bench[free] = { uid: this.uidCounter++, plantId: id, star: 1 };
    // 购买后清空该槽（除非锁定）
    if (!this.shopLocked) this.shop[index] = null;
    this.audio.buy();
    this.reconcileBench();
    this.refreshPrepUi();
    this.hud.updateSun(this.sunAmount);
    return true;
  }

  private reroll(): boolean {
    if (this.phase !== 'prep') return false;
    if (this.sunAmount < REROLL_COST) {
      this.hud.setStatus('阳光不足', '⚠');
      return false;
    }
    this.sunAmount -= REROLL_COST;
    this.rerollShop();
    this.audio.reroll();
    this.refreshPrepUi();
    this.hud.updateSun(this.sunAmount);
    return true;
  }

  private toggleLock(): void {
    if (this.phase !== 'prep') return;
    this.shopLocked = !this.shopLocked;
    this.hud.setStatus(this.shopLocked ? '商店已锁定' : '商店已解锁', this.shopLocked ? '🔒' : '🔓');
    this.refreshPrepUi();
  }

  private sellBench(index: number): void {
    if (this.phase !== 'prep') return;
    const slot = this.bench[index];
    if (!slot) return;
    const refund = Math.floor(PLANTS[slot.plantId].cost * SELL_RATIO * slot.star);
    this.sunAmount += refund;
    this.bench[index] = null;
    this.audio.sell();
    this.hud.setStatus(`出售 ${PLANTS[slot.plantId].name} +${refund}`, '☀');
    this.refreshPrepUi();
    this.hud.updateSun(this.sunAmount);
  }

  // ========================================================================
  // 备战台 / 合成 / 嫁接
  // ========================================================================
  private reconcileBench(): void {
    let changed = true;
    let guard = 0;
    while (changed && guard < 20) {
      changed = false;
      guard += 1;
      // 三合一升星
      const groups = new Map<string, number[]>();
      for (let i = 0; i < this.bench.length; i += 1) {
        const s = this.bench[i];
        if (!s) continue;
        const key = `${s.plantId}@${s.star}`;
        let arr = groups.get(key);
        if (!arr) {
          arr = [];
          groups.set(key, arr);
        }
        arr.push(i);
      }
      for (const [key, idxs] of groups) {
        if (idxs.length >= 3) {
          const [plantId, starStr] = key.split('@');
          const star = Number(starStr) as Star;
          if (star >= 3) continue;
          // 移除三个，新增一个升星
          for (let k = 0; k < 3; k += 1) this.bench[idxs[k]] = null;
          const free = this.bench.findIndex((s) => s === null);
          const newStar = (star + 1) as Star;
          const slot: BenchSlot = { uid: this.uidCounter++, plantId: plantId as PlantId, star: newStar };
          if (free >= 0) this.bench[free] = slot;
          this.audio.merge();
          this.fx.whiteFlash(0.2);
          this.hud.setStatus(`${PLANTS[slot.plantId].name} 升至 ${newStar}★`, '★');
          // 升到 3★ 触发变异
          if (newStar === 3 && MUTATIONS[slot.plantId] && !slot.mutationId) {
            this.pendingMutationUid = slot.uid;
            this.offerMutation(slot.plantId);
          }
          changed = true;
          break;
        }
      }
      if (changed) continue;
      // 嫁接
      const graft = findGraft(this.bench.filter((s): s is BenchSlot => s !== null));
      if (graft) {
        const a = this.bench[graft.aIndex];
        const b = this.bench[graft.bIndex];
        const result = graft.recipe.result;
        this.bench[graft.aIndex] = null;
        this.bench[graft.bIndex] = null;
        const free = this.bench.findIndex((s) => s === null);
        const slot: BenchSlot = { uid: this.uidCounter++, plantId: result, star: 1 };
        if (free >= 0) this.bench[free] = slot;
        this.audio.graft();
        this.fx.whiteFlash(0.3);
        this.hud.setStatus(`嫁接成功！获得 ${PLANTS[result].name}`, '🌼');
        void a;
        void b;
        changed = true;
      }
    }
  }

  private offerMutation(plantId: PlantId): void {
    const opts = MUTATIONS[plantId];
    if (!opts) return;
    this.hud.showMutation(PLANTS[plantId].name, opts, (opt) => this.pickMutation(opt));
  }

  private pickMutation(opt: MutationOption): void {
    if (this.pendingMutationUid === null) return;
    for (let i = 0; i < this.bench.length; i += 1) {
      const s = this.bench[i];
      if (s && s.uid === this.pendingMutationUid) {
        s.mutationId = opt.id;
        break;
      }
    }
    this.pendingMutationUid = null;
    this.hud.hideModal();
    this.hud.setStatus(`变异：${opt.name}`, '🧬');
    this.refreshPrepUi();
  }

  // ========================================================================
  // 摆放
  // ========================================================================
  private placeBench(benchIndex: number, lane: number, col: number): boolean {
    if (this.phase !== 'prep') return false;
    if (lane < 0 || lane >= LANES || col < 0 || col >= COLS) return false;
    const slot = this.bench[benchIndex];
    if (!slot) return false;
    const key = this.cellKey(lane, col);
    if (this.grid.has(key)) return false;
    const plant = new Plant(PLANTS[slot.plantId], col, lane, slot.star, slot.mutationId);
    this.grid.set(key, plant);
    this.plants.push(plant);
    this.scene.add(plant.group);
    this.bench[benchIndex] = null;
    this.recomputePlant(plant);
    this.computeSynergies();
    this.audio.uiClick();
    this.refreshPrepUi();
    return true;
  }

  private uprootPlant(lane: number, col: number): boolean {
    if (this.phase !== 'prep') return false;
    const key = this.cellKey(lane, col);
    const plant = this.grid.get(key);
    if (!plant) return false;
    const free = this.bench.findIndex((s) => s === null);
    if (free >= 0) {
      this.bench[free] = { uid: this.uidCounter++, plantId: plant.def.id, star: plant.star, mutationId: plant.mutationId };
    } else {
      // 备战台满 → 出售
      const refund = Math.floor(plant.def.cost * SELL_RATIO * plant.star);
      this.sunAmount += refund;
      this.hud.setStatus(`备战台已满，出售 +${refund}`, '☀');
      this.hud.updateSun(this.sunAmount);
    }
    this.scene.remove(plant.group);
    plant.dispose();
    this.grid.delete(key);
    const idx = this.plants.indexOf(plant);
    if (idx >= 0) this.plants.splice(idx, 1);
    this.computeSynergies();
    this.audio.sell();
    this.refreshPrepUi();
    return true;
  }

  private useShovel(lane: number, col: number): void {
    if (this.phase !== 'battle') return;
    if (this.shovelCharges <= 0) {
      this.hud.setStatus('铲子次数用完', '⚠');
      return;
    }
    const key = this.cellKey(lane, col);
    const plant = this.grid.get(key);
    if (!plant) return;
    this.scene.remove(plant.group);
    plant.dispose();
    this.grid.delete(key);
    const idx = this.plants.indexOf(plant);
    if (idx >= 0) this.plants.splice(idx, 1);
    this.shovelCharges -= 1;
    this.activeTool = null;
    this.hud.updateTools(this.shovelCharges, this.fertCharges, false, false);
    this.audio.sell();
    this.hud.setStatus('已铲除植物', '🪏');
    this.computeSynergies();
  }

  private useFertilizer(lane: number, col: number): void {
    if (this.phase !== 'battle' && this.phase !== 'prep') return;
    if (this.fertCharges <= 0) {
      this.hud.setStatus('肥料次数用完', '⚠');
      return;
    }
    const key = this.cellKey(lane, col);
    const plant = this.grid.get(key);
    if (!plant) return;
    // 临时增益：满血 + 短时双倍伤害（通过 tweens 计时还原）
    plant.hp = plant.eff.hp;
    const origDmg = plant.eff.damage;
    plant.eff.damage = origDmg * 2;
    this.fx.spawnRing(plant.group.position.clone().setY(0.2), '#8aff4a', 1.6, 0.6);
    this.fertCharges -= 1;
    this.activeTool = null;
    this.hud.updateTools(this.shovelCharges, this.fertCharges, false, false);
    this.audio.pickup();
    this.hud.setStatus(`${plant.def.name} 施肥！双倍伤害 6 秒`, '💩');
    this.tweens.tween(
      6,
      (t) => {
        if (t >= 1) plant.eff.damage = origDmg;
      },
      (t) => t,
      () => {
        plant.eff.damage = origDmg;
      },
    );
  }

  // ========================================================================
  // 联动 / 重算
  // ========================================================================
  private globalMods(): GlobalMods {
    return {
      gearCdMult: this.relics.has('gear') ? 0.85 : 1,
      overgrowthHpMult: this.relics.has('overgrowth') ? 1.25 : 1,
      frostMult: this.relics.has('frostshard') ? 1.25 : 1,
      emberMult: this.relics.has('ember') ? 1.25 : 1,
      sunnySunMult: this.weather === 'sunny' ? 1.5 : 1,
      rainRegen: this.weather === 'rain' ? 6 : 0,
    };
  }

  private computeSynergies(): void {
    const g = this.globalMods();
    // 预扫描每个植物的邻居
    for (const p of this.plants) {
      const mods: PlantMods = { myceliumCdMult: 1, steamDmgMult: 1, thornReflect: this.relics.has('thornheart') && p.def.tags.includes('wall') ? 0.3 : 0 };
      p.photosynth = false;
      const neighbors = this.neighbors(p.lane, p.col);
      // 光合：攻击型相邻向日葵
      if (p.def.role === 'shooter' || p.def.role === 'lobber') {
        for (const n of neighbors) {
          if (n.def.tags.includes('sun')) {
            p.photosynth = true;
            break;
          }
        }
      }
      // 蒸汽：火系相邻冰系
      const isFire = p.def.tags.includes('fire') || p.def.damageType === 'fire';
      const isIce = p.def.tags.includes('ice') || p.def.damageType === 'ice';
      if (isFire || isIce) {
        for (const n of neighbors) {
          const nFire = n.def.tags.includes('fire') || n.def.damageType === 'fire';
          const nIce = n.def.tags.includes('ice') || n.def.damageType === 'ice';
          if ((isFire && nIce) || (isIce && nFire)) {
            mods.steamDmgMult = 1.25;
            break;
          }
        }
      }
      // 菌丝：蘑菇相邻 >=2 蘑菇
      if (p.def.tags.includes('mushroom')) {
        let mc = 0;
        for (const n of neighbors) if (n.def.tags.includes('mushroom')) mc += 1;
        if (mc >= 2) mods.myceliumCdMult = 0.6;
      }
      // 荆棘反伤：墙后方（col-1）有藤蔓
      if (p.def.tags.includes('wall')) {
        const behind = this.grid.get(this.cellKey(p.lane, p.col - 1));
        if (behind && behind.def.tags.includes('vine')) {
          mods.thornReflect = Math.max(mods.thornReflect, 0.6);
        }
      }
      p.recompute(g, mods);
    }
  }

  private neighbors(lane: number, col: number): Plant[] {
    const out: Plant[] = [];
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dl, dc] of dirs) {
      const nl = lane + dl;
      const nc = col + dc;
      if (nl < 0 || nl >= LANES || nc < 0 || nc >= COLS) continue;
      const p = this.grid.get(this.cellKey(nl, nc));
      if (p) out.push(p);
    }
    return out;
  }

  private recomputePlant(plant: Plant): void {
    this.computeSynergies();
    void plant;
  }

  private recomputeAllPlants(): void {
    this.computeSynergies();
  }

  // ========================================================================
  // 场景构建
  // ========================================================================
  private buildLawn(): void {
    const group = new THREE.Group();
    const sky = new THREE.Color('#1a2a1c');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog('#16221a', 22, 48);

    // 光照
    const hemi = new THREE.HemisphereLight('#bfe6a0', '#2a3a1c', 0.85);
    group.add(hemi);
    const ambient = new THREE.AmbientLight('#6a8a5a', 0.35);
    group.add(ambient);
    this.sun.color = new THREE.Color('#fff2c0');
    this.sun.intensity = 1.4;
    this.sun.position.set(-6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 50;
    this.sun.shadow.camera.left = -14;
    this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 12;
    this.sun.shadow.camera.bottom = -12;
    this.sun.shadow.bias = -0.0004;
    group.add(this.sun);
    group.add(this.sun.target);

    // 草坪：5 路线 × 9 列
    const grassTex = this.makeGrassTexture();
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(COLS, LANES);
    const fieldW = COLS * CELL_W + 1.5;
    const fieldD = LANES * CELL_D + 1.5;
    const fieldCx = 0;
    const fieldCz = 0;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(fieldW, fieldD),
      new THREE.MeshStandardMaterial({ color: '#3f7a32', map: grassTex, roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(fieldCx, 0, fieldCz);
    grass.receiveShadow = true;
    group.add(grass);

    // 路线分隔与格子高亮
    const cellGeo = new THREE.PlaneGeometry(CELL_W * 0.94, CELL_D * 0.94);
    const cellMat = new THREE.MeshBasicMaterial({ color: '#5fae4a', transparent: true, opacity: 0.16, depthWrite: false });
    for (let lane = 0; lane < LANES; lane += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = new THREE.Mesh(cellGeo, cellMat);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(cellToWorldX(col), 0.02, laneToWorldZ(lane));
        cell.userData.lane = lane;
        cell.userData.col = col;
        group.add(cell);
      }
    }

    // 防线（左侧）墙
    const wallMat = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.9 });
    const homeWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, fieldD), wallMat);
    homeWall.position.set(HOME_X - 0.6, 0.7, fieldCz);
    homeWall.castShadow = true;
    homeWall.receiveShadow = true;
    group.add(homeWall);
    // 防线发光条
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffd23a' });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, fieldD), lineMat);
    line.position.set(HOME_X, 0.9, fieldCz);
    group.add(line);

    // 出生区（右侧）污染地
    const spawn = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, fieldD),
      new THREE.MeshStandardMaterial({ color: '#3a2a3a', roughness: 1 }),
    );
    spawn.rotation.x = -Math.PI / 2;
    spawn.position.set(SPAWN_X + 1, 0.01, fieldCz);
    spawn.receiveShadow = true;
    group.add(spawn);

    // 装饰：远处枯树/污染柱
    this.scatterDecor(group, wallMat);

    this.lawn = group;
    this.scene.add(group);
  }

  private scatterDecor(group: THREE.Group, mat: THREE.Material): void {
    const glowMat = new THREE.MeshStandardMaterial({ color: '#7a3a8a', emissive: '#5a2a6a', emissiveIntensity: 0.5, roughness: 0.6 });
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = (i / 8) * 12 - 6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6), mat);
      trunk.position.set(side * (COLS * CELL_W * 0.5 + 1.6), 0.8, z);
      trunk.castShadow = true;
      group.add(trunk);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), glowMat);
      cap.position.set(side * (COLS * CELL_W * 0.5 + 1.6), 1.7, z);
      group.add(cap);
    }
  }

  private makeGrassTexture(): THREE.CanvasTexture {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('grass ctx');
    ctx.fillStyle = '#3f7a32';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? '#4f9240' : '#356a28';
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillRect(x, y, 2, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ========================================================================
  // 工具
  // ========================================================================
  private cellKey(lane: number, col: number): number {
    return lane * COLS + col;
  }

  private randomRelic(): RelicId {
    const avail = RELIC_IDS.filter((r) => !this.relics.has(r));
    const pool = avail.length > 0 ? avail : RELIC_IDS;
    return pool[randInt(this.rng, pool.length)];
  }

  private randomWeather(): WeatherId {
    const pool: WeatherId[] = ['sunny', 'rain', 'fog'];
    return pool[randInt(this.rng, pool.length)];
  }

  private refreshPrepUi(): void {
    // 商店
    const shopViews: ShopSlotView[] = this.shop.map((id) => {
      if (!id) return { id: null, name: '', cost: 0, emoji: '', desc: '' };
      const def = PLANTS[id];
      return { id, name: def.name, cost: def.cost, emoji: PLANT_EMOJI[id], desc: def.desc };
    });
    this.hud.refreshShop(shopViews, (cost) => this.sunAmount >= cost);
    // 备战台
    const benchViews: (BenchSlotView | null)[] = this.bench.map((s) => {
      if (!s) return null;
      return {
        uid: s.uid,
        plantId: s.plantId,
        name: PLANTS[s.plantId].name,
        emoji: PLANT_EMOJI[s.plantId],
        star: s.star,
        mutationId: s.mutationId,
        mergeable: false,
        graftable: false,
      };
    });
    // 标记可合成/嫁接
    this.markBenchFlags(benchViews);
    this.hud.refreshBench(benchViews);
    // 按钮状态
    const rerollBtn = document.querySelector<HTMLElement>('#reroll-btn');
    if (rerollBtn) rerollBtn.classList.toggle('cant', this.sunAmount < REROLL_COST);
    const lockBtn = document.querySelector<HTMLElement>('#lock-btn');
    if (lockBtn) {
      lockBtn.classList.toggle('locked', this.shopLocked);
      lockBtn.textContent = this.shopLocked ? '🔒 锁定中' : '🔓 锁定';
    }
  }

  private markBenchFlags(views: (BenchSlotView | null)[]): void {
    // 三合一可合成
    const counts = new Map<string, number>();
    for (const s of this.bench) {
      if (!s) continue;
      const key = `${s.plantId}@${s.star}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const graft = findGraft(this.bench.filter((s): s is BenchSlot => s !== null));
    for (let i = 0; i < this.bench.length; i += 1) {
      const s = this.bench[i];
      const v = views[i];
      if (!s || !v) continue;
      const key = `${s.plantId}@${s.star}`;
      if ((counts.get(key) ?? 0) >= 3 && s.star < 3) v.mergeable = true;
      if (graft && (i === graft.aIndex || i === graft.bIndex)) v.graftable = true;
    }
  }

  // ========================================================================
  // 输入
  // ========================================================================
  private attachListeners(): void {
    // 模态按钮
    this.hud.modalActionButton.addEventListener('click', () => this.onModalAction());
    // 静音/暂停
    document.querySelector<HTMLElement>('#mute-button')?.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.isMuted());
      const btn = document.querySelector<HTMLElement>('#mute-button');
      if (btn) btn.textContent = this.audio.isMuted() ? '🔇' : '🔊';
    });
    document.querySelector<HTMLElement>('#pause-button')?.addEventListener('click', () => this.togglePause());
    // 备战面板按钮
    document.querySelector<HTMLElement>('#reroll-btn')?.addEventListener('click', () => this.reroll());
    document.querySelector<HTMLElement>('#lock-btn')?.addEventListener('click', () => this.toggleLock());
    document.querySelector<HTMLElement>('#start-wave-btn')?.addEventListener('click', () => this.startBattle());
    document.querySelector<HTMLElement>('#shovel-btn')?.addEventListener('click', () => this.toggleTool('shovel'));
    document.querySelector<HTMLElement>('#fertilizer-btn')?.addEventListener('click', () => this.toggleTool('fert'));

    // 商店/备战台点击（委托）
    this.hud.shop.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.shop-slot') as HTMLElement | null;
      if (!slot) return;
      const idx = Array.from(this.hud.shop.children).indexOf(slot);
      if (idx >= 0) this.buyShop(idx);
    });
    this.hud.bench.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.bench-slot') as HTMLElement | null;
      if (!slot) return;
      const idx = Number(slot.dataset.bench);
      this.onBenchClick(idx);
    });

    // 拖拽（指针事件，桌面+触控）
    this.hud.bench.addEventListener('pointerdown', (e) => this.onDragStart(e, 'bench'));

    // 画布点击：放置 / 工具 / 选择格子
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));

    // 拖拽移动/结束（全局）
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', (e) => this.onDragEnd(e));
    window.addEventListener('pointercancel', (e) => this.onDragEnd(e));

    // 键盘
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private onBenchClick(idx: number): void {
    if (this.phase !== 'prep') return;
    const slot = this.bench[idx];
    if (!slot) {
      this.sel = null;
      return;
    }
    if (this.sel && this.sel.kind === 'bench' && this.sel.index === idx) {
      this.sel = null;
    } else {
      this.sel = { kind: 'bench', index: idx };
    }
  }

  private toggleTool(tool: 'shovel' | 'fert'): void {
    if (tool === 'shovel' && this.shovelCharges <= 0) return;
    if (tool === 'fert' && this.fertCharges <= 0) return;
    this.activeTool = this.activeTool === tool ? null : tool;
    this.hud.updateTools(this.shovelCharges, this.fertCharges, this.activeTool === 'shovel', this.activeTool === 'fert');
  }

  private onCanvasClick(e: MouseEvent): void {
    const cell = this.pickCell(e.clientX, e.clientY);
    if (!cell) return;
    const { lane, col } = cell;
    // 工具优先
    if (this.activeTool === 'shovel') {
      this.useShovel(lane, col);
      return;
    }
    if (this.activeTool === 'fert') {
      this.useFertilizer(lane, col);
      return;
    }
    if (this.phase === 'prep') {
      if (this.sel && this.sel.kind === 'bench') {
        this.placeBench(this.sel.index, lane, col);
        this.sel = null;
      } else {
        // 选择/移除场上植物
        const key = this.cellKey(lane, col);
        if (this.grid.has(key)) {
          // 拔回到备战台
          this.uprootPlant(lane, col);
        }
      }
    }
  }

  private pickCell(clientX: number, clientY: number): { lane: number; col: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const col = Math.round(hit.x / CELL_W + (COLS - 1) / 2);
    const lane = Math.round(hit.z / CELL_D + (LANES - 1) / 2);
    if (lane < 0 || lane >= LANES || col < 0 || col >= COLS) return null;
    return { lane, col };
  }

  // --- 拖拽（指针）---
  private onDragStart(e: PointerEvent, source: 'bench' | 'grid'): void {
    if (this.phase !== 'prep') return;
    if (source === 'bench') {
      const slot = (e.target as HTMLElement).closest('.bench-slot') as HTMLElement | null;
      if (!slot) return;
      const idx = Number(slot.dataset.bench);
      const s = this.bench[idx];
      if (!s) return;
      this.dragging = { source: 'bench', benchIndex: idx, plantId: s.plantId, star: s.star };
      this.hud.showGhost(PLANT_EMOJI[s.plantId], e.clientX, e.clientY);
      e.preventDefault();
    }
  }

  private onDragMove(e: PointerEvent): void {
    if (!this.dragging) return;
    this.hud.moveGhost(e.clientX, e.clientY);
  }

  private onDragEnd(e: PointerEvent): void {
    if (!this.dragging) return;
    const cell = this.pickCell(e.clientX, e.clientY);
    if (cell) {
      if (this.dragging.source === 'bench' && this.dragging.benchIndex !== undefined) {
        this.placeBench(this.dragging.benchIndex, cell.lane, cell.col);
      }
    } else if (this.dragging.source === 'bench' && this.dragging.benchIndex !== undefined) {
      // 拖出网格 = 出售
      this.sellBench(this.dragging.benchIndex);
    }
    this.dragging = null;
    this.hud.hideGhost();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (['Space', 'KeyR', 'KeyL', 'KeyQ', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Enter') {
      if (this.phase === 'title' || this.phase === 'gameover' || this.phase === 'win') this.startRun();
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      this.togglePause();
      return;
    }
    if (this.phase === 'prep') {
      if (e.code === 'Space') this.startBattle();
      else if (e.code === 'KeyR') this.reroll();
      else if (e.code === 'KeyL') this.toggleLock();
      else if (e.code === 'KeyQ') this.toggleTool('shovel');
      else if (e.code === 'KeyE') this.toggleTool('fert');
      else if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5)) - 1;
        if (n >= 0 && n < SHOP_SIZE) this.buyShop(n);
      }
    } else if (this.phase === 'gameover' || this.phase === 'win') {
      if (e.code === 'KeyR') this.startRun();
    }
  }

  private togglePause(): void {
    if (this.phase === 'battle' || this.phase === 'prep' || this.phase === 'reward') {
      this.previousPhase = this.phase;
      this.phase = 'paused';
      this.audio.setMood('prep');
      this.showModal('paused', {
        eyebrow: 'PAUSED',
        title: '暂停',
        copy: '花园已冻结',
        action: '继续',
        hint: 'P / Esc 继续',
      });
    } else if (this.phase === 'paused') {
      this.phase = this.previousPhase ?? 'prep';
      this.hud.hideModal();
      if (this.phase === 'prep') this.hud.showPrep(true);
    }
  }
  private previousPhase: Phase = 'prep';

  private onModalAction(): void {
    this.audio.uiClick();
    if (this.phase === 'title' || this.phase === 'gameover' || this.phase === 'win') {
      this.startRun();
    } else if (this.phase === 'paused') {
      this.phase = this.previousPhase ?? 'prep';
      this.hud.hideModal();
      if (this.phase === 'prep') this.hud.showPrep(true);
    }
  }

  private showModal(kind: ModalKind, opts: { eyebrow?: string; title: string; copy: string; action: string; hint?: string }): void {
    this.hud.showModal(kind, opts);
  }

  // ========================================================================
  // 测试钩子 + 诊断
  // ========================================================================
  private installTestHooks(): void {
    const hooks = {
      _gameId: this.gameId,
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: (name: string) => this.setTestState(name),
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
      },
      // 直接操作接口（bot 用）
      testBuy: (index: number) => this.buyShop(index),
      testReroll: () => this.reroll(),
      testPlace: (benchIndex: number, lane: number, col: number) => this.placeBench(benchIndex, lane, col),
      testStartBattle: () => this.startBattle(),
      testPickReward: (idx: number) => {
        const cards = Array.from(this.hud.rewardCards.querySelectorAll('.reward-card'));
        (cards[idx] as HTMLElement | undefined)?.click();
      },
      testSell: (index: number) => {
        this.sellBench(index);
        return true;
      },
      testInject: (plantId: string, star: number, lane: number, col: number) =>
        this.testInject(plantId as PlantId, star as Star, lane, col),
    };
    // 用 getter 锁定：任何对 window.__THREE_GAME_TEST_HOOKS__ 的覆盖都会被忽略，
    // 读取始终返回本游戏的钩子对象，彻底杜绝外部覆盖导致的空对象。
    try {
      Object.defineProperty(window, '__THREE_GAME_TEST_HOOKS__', {
        get: () => hooks,
        set: () => {
          /* ignore external clobbering */
        },
        configurable: true,
      });
    } catch {
      window.__THREE_GAME_TEST_HOOKS__ = hooks;
    }
  }

  private setTestState(name: string): void {
    switch (name) {
      case 'title':
        this.phase = 'title';
        this.clearEntities();
        this.hud.showPrep(false);
        this.showModal('title', {
          eyebrow: '末日花园',
          title: '末日花园自走棋',
          copy: '变异植物抵抗污染怪物',
          action: '开始游戏',
          hint: '',
        });
        break;
      case 'active-play':
        this.setupPopulatedBattle();
        break;
      case 'prep':
        this.startRun();
        break;
      case 'battle':
        this.startRun();
        this.startBattle();
        break;
      case 'complete':
      case 'win':
        this.startRun();
        this.waveIndex = TOTAL_WAVES - 1;
        this.phase = 'win';
        this.gameWin();
        break;
      case 'boss':
        this.setupBossBattle();
        break;
      default:
        console.warn(`Unknown test state: ${name}`);
    }
  }

  // 视觉基线 / 机器人用：摆出一个有植物的场面并开战
  private setupPopulatedBattle(): void {
    this.startRun();
    this.injectBench([
      { plantId: 'sunflower', star: 1 },
      { plantId: 'peashooter', star: 1 },
      { plantId: 'nutwall', star: 1 },
      { plantId: 'peashooter', star: 1 },
    ]);
    this.placeBench(0, 2, 1);
    this.placeBench(1, 2, 4);
    this.placeBench(2, 2, 0);
    this.placeBench(3, 1, 4);
    this.startBattle();
  }

  private setupBossBattle(): void {
    this.startRun();
    this.waveIndex = 4; // 第 5 波 = 污泥巨像
    this.enterPrep();
    this.injectBench([
      { plantId: 'nutwall', star: 2 },
      { plantId: 'peashooter', star: 2 },
      { plantId: 'sunflower', star: 1 },
      { plantId: 'firepepper', star: 1 },
    ]);
    this.placeBench(0, 2, 0);
    this.placeBench(1, 2, 3);
    this.placeBench(2, 1, 1);
    this.placeBench(3, 0, 4);
    this.startBattle();
    this.bossAt = 0.01; // 立即召唤 BOSS
  }

  private injectBench(items: { plantId: PlantId; star: Star }[]): void {
    for (let i = 0; i < items.length && i < BENCH_SIZE; i += 1) {
      this.bench[i] = { uid: this.uidCounter++, plantId: items[i].plantId, star: items[i].star };
    }
  }

  /** 测试专用：直接在网格放置一株植物（不走商店/备战台），用于确定性验证。 */
  private testInject(plantId: PlantId, star: Star, lane: number, col: number): boolean {
    if (this.phase !== 'prep' && this.phase !== 'battle') return false;
    const key = this.cellKey(lane, col);
    if (this.grid.has(key)) return false;
    const plant = new Plant(PLANTS[plantId], col, lane, star);
    this.grid.set(key, plant);
    this.plants.push(plant);
    this.scene.add(plant.group);
    this.computeSynergies();
    return true;
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.score,
      targetScore: this.enemies.length + (this.boss ? 1 : 0),
      complete: this.phase === 'win',
      phase: this.phase,
      wave: this.waveIndex + 1,
      sun: Math.floor(this.sunAmount),
      defenseHp: Math.ceil(this.defenseHp),
      enemiesAlive: this.enemies.length,
      plantsAlive: this.plants.filter((p) => p.alive).length,
      starsOnBoard: this.plants.reduce((acc, p) => acc + p.star, 0),
      player: {
        position: { x: 0, y: 0, z: 0 },
        speed: 0,
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
}

// --- 网格换算辅助 ---
function rangeColsToWorld(cells: number): number {
  return cells * CELL_W;
}
function radiusColsToWorld(cells: number): number {
  return cells * ((CELL_W + CELL_D) / 2);
}
