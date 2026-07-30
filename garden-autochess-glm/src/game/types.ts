import type * as THREE from 'three';

// ============================================================================
// 末日花园自走棋 — 类型定义
// 5 条横向路线：植物守左(防线)，怪物从右涌入。所有战斗自动结算。
// ============================================================================

// --- 网格 / 世界坐标 ---
export const LANES = 5;
export const COLS = 9;
export const CELL_W = 1.6; // 列间距（X）
export const CELL_D = 1.75; // 路线间距（Z）

export function cellToWorldX(col: number): number {
  return (col - (COLS - 1) / 2) * CELL_W;
}
export function laneToWorldZ(lane: number): number {
  return (lane - (LANES - 1) / 2) * CELL_D;
}
export function worldXToCell(x: number): number {
  return Math.round(x / CELL_W + (COLS - 1) / 2);
}
export function worldZToLane(z: number): number {
  return Math.round(z / CELL_D + (LANES - 1) / 2);
}
export const HOME_X = cellToWorldX(0) - 1.4; // 怪物越过此线 = 突破防线
export const SPAWN_X = cellToWorldX(COLS - 1) + 3.2; // 怪物出生点（右侧）
export const GRID_CENTER_X = 0;
export const GRID_CENTER_Z = 0;

// --- 伤害类型 / 角色 / 状态 ---
export type DamageType = 'phys' | 'fire' | 'ice' | 'poison' | 'elec';
export type PlantRole = 'sun' | 'shooter' | 'wall' | 'lobber' | 'aura';
export type StatusType = 'burn' | 'slow' | 'poison' | 'shock';

export type PlantTag = 'mushroom' | 'fire' | 'ice' | 'sun' | 'vine' | 'wall' | 'graft';
export type EnemyTag = 'armored' | 'fast' | 'flyer' | 'summoner' | 'poisonous';

export type PlantId =
  | 'sunflower'
  | 'peashooter'
  | 'firepepper'
  | 'icemoss'
  | 'nutwall'
  | 'vine'
  | 'toadstool'
  | 'sporeshroom'
  | 'aloezap'
  | 'onionpult'
  | 'steamdande'
  | 'sunpumpkin';

export type EnemyId =
  | 'slime'
  | 'spider'
  | 'bucket'
  | 'smogger'
  | 'toxic'
  | 'flea'
  | 'brute'
  | 'flagbearer';

export type BossId = 'colossus' | 'wraith' | 'dragon';

// --- 星级 ---
export type Star = 1 | 2 | 3;

export interface StarScaling {
  damage: number;
  hp: number;
  sun: number;
}

export function starScaling(star: Star): StarScaling {
  switch (star) {
    case 1:
      return { damage: 1, hp: 1, sun: 1 };
    case 2:
      return { damage: 1.6, hp: 1.8, sun: 1.5 };
    case 3:
      return { damage: 2.6, hp: 3.0, sun: 2.2 };
  }
}

// --- 投射物 ---
export type ProjectileKind = 'pea' | 'fireball' | 'ice' | 'poison' | 'lob' | 'beam' | 'steam';

export interface ProjectileSpawn {
  origin: THREE.Vector3;
  lane: number;
  speed: number;
  damage: number;
  type: ProjectileKind;
  damageType: DamageType;
  mode?: 'line' | 'lob';
  aoeCells?: number; // 爆炸半径（格）
  status?: StatusApplier;
  pierce?: boolean;
  color: string;
  targetX?: number; // lob 落点
}

export interface StatusApplier {
  type: StatusType;
  duration: number; // 秒
  dps?: number; // burn/poison 每秒伤害
  stacks?: number;
  magnitude?: number; // slow 速度倍率 / shock 眩晕时长
}

// --- 植物定义 ---
export interface PlantDef {
  id: PlantId;
  name: string;
  role: PlantRole;
  cost: number;
  damageType: DamageType | 'none';
  hp: number;
  // 攻击参数（shooter/lobber）
  damage: number;
  cooldown: number; // 秒
  rangeCells: number; // 攻击距离（格），-1=全路线
  projectile: ProjectileKind;
  aoeCells?: number;
  status?: StatusApplier;
  shotsPerVolley?: number; // 每次攻击发射数
  chain?: number; // 闪电连锁目标数
  // 阳光产出（sun）
  sunInterval?: number;
  sunValue?: number;
  // 光环（aura）
  auraCells?: number;
  auraDps?: number;
  thornReflect?: number; // 反伤比例
  // 标签
  tags: PlantTag[];
  isGraft: boolean;
  desc: string;
}

// --- 敌人定义 ---
export type EnemySpecial = 'lanehop' | 'poisontrail' | 'split' | 'aurabuff' | 'none';

export interface EnemyDef {
  id: EnemyId | BossId;
  name: string;
  hp: number;
  speed: number; // 格/秒，向 -X 推进
  eatDps: number; // 啃咬植物 Dps
  armor: Partial<Record<DamageType, number>>; // 各伤害类型倍率（1 正常 / 0.5 抗 / 1.7 弱）
  radius: number;
  score: number;
  sunBounty: number; // 击杀掉落阳光概率基础
  breach: number; // 突破防线造成的伤害
  special: EnemySpecial;
  isBoss: boolean;
  color: string;
  accent: string;
  scale: number;
}

// --- 嫁接配方 ---
export interface GraftRecipe {
  a: PlantId;
  b: PlantId;
  result: PlantId;
}

// --- 变异（3★ 二选一）---
export interface MutationOption {
  id: string;
  name: string;
  desc: string;
  damageMult?: number;
  cooldownMult?: number;
  sunMult?: number;
  hpMult?: number;
  shotsPerVolley?: number;
  rangeCells?: number;
  pierce?: boolean;
  aoeCells?: number;
  chainBonus?: number;
  extraStatusStacks?: number;
  thornReflect?: number;
  auraMult?: number;
  statusMag?: number;
  statusDur?: number;
}

// --- 联动 ---
export type SynergyId = 'photosynth' | 'steam' | 'mycelium' | 'thorns';

// --- 遗物 ---
export type RelicId =
  | 'suncore'
  | 'gear'
  | 'revive'
  | 'thornheart'
  | 'overgrowth'
  | 'frostshard'
  | 'ember';

export interface RelicDef {
  id: RelicId;
  name: string;
  desc: string;
  icon: string;
}

// --- 天气 ---
export type WeatherId = 'clear' | 'sunny' | 'rain' | 'fog';
export interface WeatherDef {
  id: WeatherId;
  name: string;
  desc: string;
  icon: string;
}

// --- 奖励卡 ---
export type RewardKind = 'fertilizer' | 'weather' | 'relic' | 'mutation';

// --- 波次 ---
export interface SpawnDef {
  enemy: EnemyId;
  count: number;
  laneBias?: number; // -1 顶 .. 1 底，0 均匀
  delay?: number; // 出场延迟（秒）
  gap?: number; // 个体间隔（秒）
}

export interface WaveDef {
  wave: number;
  spawns: readonly SpawnDef[];
  boss?: BossId;
  label: string;
}

// --- 游戏阶段 / 状态 ---
export type Phase = 'title' | 'prep' | 'battle' | 'reward' | 'paused' | 'win' | 'gameover';

// --- 放置槽（备战台）---
export interface BenchSlot {
  uid: number;
  plantId: PlantId;
  star: Star;
  mutationId?: string;
}

export type ModalKind = 'title' | 'paused' | 'reward' | 'gameover' | 'win';

export interface ModalOptions {
  eyebrow?: string;
  title: string;
  copy: string;
  action: string;
  hint?: string;
}

// --- 战斗特效回调（解耦）---
export interface HitFx {
  hitstop(seconds: number, scale?: number): void;
  addTrauma(amount: number): void;
  punchFov(degrees: number): void;
  spawnSpark(position: THREE.Vector3, color: string, count: number, power: number): void;
  spawnDust(position: THREE.Vector3, color: string): void;
  spawnRing(position: THREE.Vector3, color: string, maxScale: number, duration: number): void;
  spawnBeam(position: THREE.Vector3, color: string, height: number, duration: number): void;
  whiteFlash(strength: number): void;
}
