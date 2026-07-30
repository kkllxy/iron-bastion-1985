import * as THREE from 'three';
import type {
  DamageType,
  HitFx,
  MutationOption,
  PlantDef,
  ProjectileKind,
  ProjectileSpawn,
  Star,
  StatusApplier,
} from '../game/types';
import { cellToWorldX, laneToWorldZ, starScaling } from '../game/types';
import { makePlantMesh, PLANT_PALETTE } from './meshes';
import { MUTATIONS } from '../game/content';

export interface GlobalMods {
  gearCdMult: number; // 加速齿轮
  overgrowthHpMult: number; // 疯长剂
  frostMult: number; // 霜碎碎片（冰伤）
  emberMult: number; // 余烬（火伤）
  sunnySunMult: number; // 烈日天气
  rainRegen: number; // 暴雨天气 每秒回血
}

export interface PlantMods {
  myceliumCdMult: number; // 菌丝网络攻速
  steamDmgMult: number; // 蒸汽联动伤害
  thornReflect: number; // 反伤（来自变异/遗物荆棘之心/联动）
}

export interface PlantContext {
  rng: () => number;
  frontmost(lane: number, fromX: number, rangeCells: number): { x: number; alive: boolean } | null;
  spawnProjectile(opts: ProjectileSpawn): void;
  dropSun(x: number, z: number, value: number): void;
  dealAura(x: number, z: number, radiusCells: number, dps: number, type: DamageType, status?: StatusApplier): void;
  chainZap(originX: number, lane: number, count: number, dmg: number, status: StatusApplier | undefined, color: string): void;
  fx: HitFx;
}

export interface EffStats {
  role: PlantDef['role'];
  damageType: DamageType | 'none';
  hp: number;
  damage: number;
  cooldown: number;
  rangeCells: number;
  projectile: ProjectileKind;
  aoeCells: number;
  status: StatusApplier | undefined;
  shotsPerVolley: number;
  chain: number;
  pierce: boolean;
  sunInterval: number;
  sunValue: number;
  auraCells: number;
  auraDps: number;
  thornReflect: number;
}

const PROJECTILE_SPEED: Record<ProjectileKind, number> = {
  pea: 9,
  fireball: 7,
  ice: 9,
  poison: 8,
  lob: 6,
  beam: 0,
  steam: 7,
};

const PROJECTILE_COLOR: Record<ProjectileKind, string> = {
  pea: '#9be85a',
  fireball: '#ff6a2a',
  ice: '#9be8ff',
  poison: '#c0e83a',
  lob: '#d0a0e8',
  beam: '#fff080',
  steam: '#eaf6ff',
};

export class Plant {
  readonly group: THREE.Group;
  readonly def: PlantDef;
  readonly col: number;
  readonly lane: number;
  star: Star;
  mutationId?: string;
  eff: EffStats;
  hp: number;
  alive = true;
  photosynth = false; // 光合联动：相邻向日葵使攻击附带阳光

  private cdTimer = 0;
  private sunTimer = 0;
  private auraTimer = 0;
  private readonly head: THREE.Object3D;
  private recoil = 0;
  private bob = 0;

  constructor(def: PlantDef, col: number, lane: number, star: Star, mutationId?: string) {
    this.def = def;
    this.col = col;
    this.lane = lane;
    this.star = star;
    this.mutationId = mutationId;
    this.group = makePlantMesh(def.id, star);
    this.group.position.set(cellToWorldX(col), 0, laneToWorldZ(lane));
    this.head = (this.group.userData.head as THREE.Object3D) ?? this.group;
    // 初始计时器小幅随机，避免同路线植物同步开火
    this.cdTimer = Math.random() * 0.3;
    this.sunTimer = Math.random() * 1.5;
    this.eff = this.computeEmpty();
    this.hp = this.eff.hp;
  }

  private computeEmpty(): EffStats {
    return {
      role: this.def.role,
      damageType: this.def.damageType,
      hp: this.def.hp,
      damage: this.def.damage,
      cooldown: this.def.cooldown,
      rangeCells: this.def.rangeCells,
      projectile: this.def.projectile,
      aoeCells: this.def.aoeCells ?? 0,
      status: this.def.status,
      shotsPerVolley: this.def.shotsPerVolley ?? 1,
      chain: this.def.chain ?? 0,
      pierce: false,
      sunInterval: this.def.sunInterval ?? 0,
      sunValue: this.def.sunValue ?? 0,
      auraCells: this.def.auraCells ?? 0,
      auraDps: this.def.auraDps ?? 0,
      thornReflect: 0,
    };
  }

  recompute(global: GlobalMods, mods: PlantMods): void {
    const scale = starScaling(this.star);
    const mut = this.mutationId ? this.findMutation() : undefined;
    const d = this.def;

    const typeDmgMult = this.def.damageType === 'ice' ? global.frostMult : this.def.damageType === 'fire' ? global.emberMult : 1;

    const damage = d.damage * scale.damage * (mut?.damageMult ?? 1) * typeDmgMult * mods.steamDmgMult;
    const cooldown = d.cooldown * (mut?.cooldownMult ?? 1) * global.gearCdMult * mods.myceliumCdMult;
    const hp = d.hp * scale.hp * global.overgrowthHpMult * (mut?.hpMult ?? 1);
    const sunValue = (d.sunValue ?? 0) * scale.sun * global.sunnySunMult * (mut?.sunMult ?? 1);
    const sunInterval = (d.sunInterval ?? 0) / (mut?.sunMult ?? 1);
    const aoeCells = d.aoeCells ? d.aoeCells * (mut?.aoeCells ?? 1) : (mut?.aoeCells ?? 0);
    const auraCells = (d.auraCells ?? 0) * (mut?.auraMult ?? 1);
    const auraDps = (d.auraDps ?? 0) * (mut?.auraMult ?? 1);
    const chain = (d.chain ?? 0) + (mut?.chainBonus ?? 0);
    const shotsPerVolley = mut?.shotsPerVolley ?? d.shotsPerVolley ?? 1;
    const pierce = mut?.pierce ?? false;
    const rangeCells = mut?.rangeCells ?? d.rangeCells;
    const thornReflect = Math.max(mods.thornReflect, mut?.thornReflect ?? 0);

    // 状态：克隆基础并按变异调整
    let status: StatusApplier | undefined = d.status ? { ...d.status } : undefined;
    if (status && mut) {
      if (mut.statusMag !== undefined) status = { ...status, magnitude: mut.statusMag };
      if (mut.statusDur !== undefined) status = { ...status, duration: mut.statusDur };
      if (mut.extraStatusStacks) status = { ...status, stacks: (status.stacks ?? 1) + mut.extraStatusStacks };
    }

    const prevMax = this.eff.hp;
    this.eff = {
      role: d.role,
      damageType: d.damageType,
      hp,
      damage,
      cooldown,
      rangeCells,
      projectile: d.projectile,
      aoeCells,
      status,
      shotsPerVolley,
      chain,
      pierce,
      sunInterval,
      sunValue,
      auraCells,
      auraDps,
      thornReflect,
    };
    // 满血（首次放置/升星/变异时）；其它重算保持比例
    if (prevMax <= 0) this.hp = hp;
    else this.hp = Math.min(hp, this.hp * (hp / prevMax));
  }

  private findMutation(): MutationOption | undefined {
    const list = MUTATIONS[this.def.id];
    if (!list) return undefined;
    return list.find((m) => m.id === this.mutationId);
  }

  get x(): number {
    return this.group.position.x;
  }
  get z(): number {
    return this.group.position.z;
  }

  update(delta: number, clock: number, ctx: PlantContext): void {
    if (!this.alive) return;
    // 雨天回血
    // (globalMods.rainRegen applied externally by Game to avoid passing mods each frame)

    // 动画
    this.recoil = Math.max(0, this.recoil - delta * 6);
    this.bob += delta;
    const head = this.head;
    head.position.y = Math.sin(this.bob * 2 + this.col) * 0.03;
    head.position.x = -this.recoil * 0.18;
    void clock;

    const role = this.eff.role;
    if (role === 'sun') {
      this.tickSun(delta, ctx);
    } else if (role === 'shooter') {
      this.tickShooter(delta, ctx);
    } else if (role === 'lobber') {
      this.tickLobber(delta, ctx);
    } else if (role === 'aura') {
      this.tickAura(delta, ctx);
      if (this.def.damage > 0) this.tickShooter(delta, ctx);
    }
    // wall: 无主动行为
  }

  private tickSun(delta: number, ctx: PlantContext): void {
    if (this.eff.sunInterval <= 0) return;
    this.sunTimer += delta;
    if (this.sunTimer >= this.eff.sunInterval) {
      this.sunTimer = 0;
      const vol = this.eff.shotsPerVolley;
      for (let i = 0; i < vol; i += 1) {
        ctx.dropSun(this.x + (Math.random() - 0.5) * 0.6, this.z + (Math.random() - 0.5) * 0.6, this.eff.sunValue);
      }
      this.recoil = 1;
    }
  }

  private tickShooter(delta: number, ctx: PlantContext): void {
    this.cdTimer -= delta;
    if (this.cdTimer > 0) return;
    const target = ctx.frontmost(this.lane, this.x, this.eff.rangeCells);
    if (!target) {
      this.cdTimer = 0.15; // 没目标时短轮询，避免空转
      return;
    }
    this.cdTimer = this.eff.cooldown;
    this.recoil = 1;
    if (this.eff.projectile === 'beam') {
      // 闪电：瞬时连锁
      ctx.chainZap(this.x + 0.3, this.lane, this.eff.chain, this.eff.damage, this.eff.status, PROJECTILE_COLOR.beam);
    } else {
      const color = PROJECTILE_COLOR[this.eff.projectile];
      for (let i = 0; i < this.eff.shotsPerVolley; i += 1) {
        ctx.spawnProjectile({
          origin: new THREE.Vector3(this.x + 0.32 - i * 0.12, 0.55, this.z),
          lane: this.lane,
          speed: PROJECTILE_SPEED[this.eff.projectile],
          damage: this.eff.damage,
          type: this.eff.projectile,
          damageType: this.eff.damageType as DamageType,
          aoeCells: this.eff.aoeCells,
          status: this.eff.status,
          pierce: this.eff.pierce,
          color,
        });
      }
    }
  }

  private tickLobber(delta: number, ctx: PlantContext): void {
    this.cdTimer -= delta;
    if (this.cdTimer > 0) return;
    const target = ctx.frontmost(this.lane, this.x, this.eff.rangeCells);
    if (!target) {
      this.cdTimer = 0.2;
      return;
    }
    this.cdTimer = this.eff.cooldown;
    this.recoil = 1;
    ctx.spawnProjectile({
      origin: new THREE.Vector3(this.x + 0.2, 0.7, this.z),
      lane: this.lane,
      speed: PROJECTILE_SPEED.lob,
      damage: this.eff.damage,
      type: 'lob',
      damageType: this.eff.damageType as DamageType,
      mode: 'lob',
      aoeCells: this.eff.aoeCells,
      status: this.eff.status,
      color: PLANT_PALETTE[this.def.id].body,
      targetX: target.x,
    });
  }

  private tickAura(delta: number, ctx: PlantContext): void {
    if (this.eff.auraDps <= 0) return;
    this.auraTimer += delta;
    if (this.auraTimer >= 0.5) {
      const elapsed = this.auraTimer;
      this.auraTimer = 0;
      ctx.dealAura(this.x, this.z, this.eff.auraCells, this.eff.auraDps * elapsed, this.eff.damageType as DamageType, this.eff.status);
    }
  }

  takeDamage(amount: number): number {
    if (!this.alive) return 0;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return 1;
    }
    return 0;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.eff.hp, this.hp + amount);
  }

  setStar(star: Star, mutationId?: string): void {
    this.star = star;
    this.mutationId = mutationId;
    // 重建网格以反映星级外观
    const head = this.group.userData.head as THREE.Object3D | undefined;
    void head;
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
