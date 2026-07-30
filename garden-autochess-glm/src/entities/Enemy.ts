import * as THREE from 'three';
import type { DamageType, EnemyDef, HitFx, StatusApplier } from '../game/types';
import { HOME_X, laneToWorldZ } from '../game/types';
import { makeEnemyMesh } from './meshes';
import type { Plant } from './Plant';

export interface EnemyContext {
  rng: () => number;
  /** 本路线上、位于 enemyX 前方（更大 X）最近的可啃咬植物；无则 null。 */
  blockingPlant(lane: number, enemyX: number): Plant | null;
  fx: HitFx;
  onBreach(dmg: number, lane: number): void;
  spawnSlime(lane: number, x: number, count: number): void;
  spawnAdd(id: 'toxic' | 'smogger', lane: number, x: number): void;
  poisonTrail(lane: number, x: number, dps: number): void;
  buffNearby(x: number, z: number, radius: number, mult: number): void;
  fogSpeedMult: number; // 浓雾天气的全局减速
}

interface HitFlash {
  t: number;
}

export class Enemy {
  readonly group: THREE.Group;
  readonly def: EnemyDef;
  lane: number;
  hp: number;
  maxHp: number;
  alive = true;
  x: number;
  z: number;
  speedBoost = 1; // 来自抢旗兵/树灵的光环
  private readonly body: THREE.Object3D;
  private walk = 0;
  private readonly hit: HitFlash = { t: 0 };

  // 状态效果计时器
  private burnT = 0;
  private burnDps = 0;
  private poisonT = 0;
  private poisonDps = 0;
  private poisonStacks = 0;
  private slowT = 0;
  private slowMag = 0;
  private shockT = 0;

  // 特殊技能计时
  private hopT = 2 + Math.random() * 2;
  private trailT = 0;
  private buffT = 0;
  private splitUsed = 0;

  private eatingPlant: Plant | null = null;

  constructor(def: EnemyDef, lane: number, x: number) {
    this.def = def;
    this.lane = lane;
    this.x = x;
    this.group = makeEnemyMesh(def);
    this.z = laneToWorldZ(lane);
    this.group.position.set(x, 0, this.z);
    this.body = (this.group.userData.body as THREE.Object3D) ?? this.group;
    this.maxHp = def.hp;
    this.hp = def.hp;
  }

  applyStatus(s: StatusApplier): void {
    switch (s.type) {
      case 'burn':
        this.burnT = Math.max(this.burnT, s.duration);
        this.burnDps = Math.max(this.burnDps, s.dps ?? 0);
        break;
      case 'poison':
        this.poisonT = Math.max(this.poisonT, s.duration);
        this.poisonDps = s.dps ?? this.poisonDps;
        this.poisonStacks = Math.min(8, this.poisonStacks + (s.stacks ?? 1));
        break;
      case 'slow':
        this.slowT = Math.max(this.slowT, s.duration);
        this.slowMag = Math.max(this.slowMag, s.magnitude ?? 0.5);
        break;
      case 'shock':
        this.shockT = Math.max(this.shockT, s.duration);
        break;
    }
  }

  get slowed(): boolean {
    return this.slowT > 0;
  }

  takeDamage(amount: number, type: DamageType): number {
    if (!this.alive) return 0;
    const mult = this.def.armor[type] ?? 1;
    this.hp -= amount * mult;
    this.hit.t = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return 1;
    }
    return 0;
  }

  update(delta: number, ctx: EnemyContext): void {
    if (!this.alive) return;

    // DoT
    const dot = this.burnDps * (this.burnT > 0 ? 1 : 0) + this.poisonDps * this.poisonStacks * (this.poisonT > 0 ? 1 : 0);
    if (dot > 0) {
      this.hp -= dot * delta;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        return;
      }
    }
    this.burnT = Math.max(0, this.burnT - delta);
    this.poisonT = Math.max(0, this.poisonT - delta);
    this.slowT = Math.max(0, this.slowT - delta);
    this.slowMag = this.slowT > 0 ? this.slowMag : 0;
    this.shockT = Math.max(0, this.shockT - delta);

    // 动画
    this.walk += delta * 6;
    this.body.position.y = Math.abs(Math.sin(this.walk)) * 0.06;
    this.hit.t = Math.max(0, this.hit.t - delta);
    if (this.hit.t > 0) {
      (this.body as THREE.Mesh).scale?.setScalar(1 + this.hit.t * 1.2);
    }

    const stunned = this.shockT > 0;

    if (!stunned) {
      // 啃咬 / 推进
      const plant = ctx.blockingPlant(this.lane, this.x);
      const inEatRange = plant && this.x <= plant.x + 0.55 + this.def.radius * 0.5;
      if (plant && inEatRange) {
        this.eatingPlant = plant;
        const bite = this.def.eatDps * delta;
        const died = plant.takeDamage(bite);
        // 反伤
        if (plant.eff.thornReflect > 0) {
          this.takeDamage(bite * plant.eff.thornReflect, 'phys');
        }
        if (died) {
          this.eatingPlant = null;
        }
      } else {
        this.eatingPlant = null;
        const slowMult = this.slowT > 0 ? 1 - this.slowMag : 1;
        const speed = this.def.speed * slowMult * this.speedBoost * ctx.fogSpeedMult;
        this.x -= speed * delta;
        this.group.position.x = this.x;
      }
    }

    // 特殊技能
    this.tickSpecials(delta, ctx);

    // 突破防线
    if (this.x <= HOME_X) {
      ctx.onBreach(this.def.breach, this.lane);
      this.alive = false;
      return;
    }

    // z 跟随 lane（跳蚤换道）
    this.z = laneToWorldZ(this.lane);
    this.group.position.z = this.z;
  }

  private tickSpecials(delta: number, ctx: EnemyContext): void {
    if (!this.def.special || this.def.special === 'none') return;
    switch (this.def.special) {
      case 'lanehop': {
        if (this.eatingPlant) return;
        this.hopT -= delta;
        if (this.hopT <= 0) {
          this.hopT = 3 + ctx.rng() * 3;
          const dir = ctx.rng() < 0.5 ? -1 : 1;
          const nl = THREE.MathUtils.clamp(this.lane + dir, 0, 4);
          if (nl !== this.lane) {
            this.lane = nl;
            ctx.fx.spawnDust(this.group.position, this.def.color);
          }
        }
        break;
      }
      case 'poisontrail': {
        this.trailT -= delta;
        if (this.trailT <= 0) {
          this.trailT = 0.7;
          ctx.poisonTrail(this.lane, this.x - 0.4, 14);
        }
        break;
      }
      case 'aurabuff': {
        this.buffT -= delta;
        if (this.buffT <= 0) {
          this.buffT = 1.0;
          const mult = this.def.isBoss ? 1.25 : 1.35;
          const r = this.def.isBoss ? 4 : 2.2;
          ctx.buffNearby(this.x, this.z, r, mult);
        }
        break;
      }
      case 'split': {
        const thresholds = [0.66, 0.33];
        const frac = this.hp / this.maxHp;
        if (this.splitUsed < thresholds.length && frac <= thresholds[this.splitUsed]) {
          this.splitUsed += 1;
          ctx.spawnSlime(this.lane, this.x + 0.5, 2);
          ctx.fx.spawnRing(this.group.position.clone().setY(0.1), this.def.color, 3, 0.4);
        }
        break;
      }
      default:
        break;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (mat) {
        const arr = Array.isArray(mat) ? mat : [mat];
        for (const x of arr) x.dispose();
      }
    });
  }
}
