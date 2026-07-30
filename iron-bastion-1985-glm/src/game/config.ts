// Iron Bastion 1985 — game configuration, tile/direction model, tuning,
// enemy/powerup definitions, and the cohesive art palette. Pure data + helpers,
// no THREE import so it stays cheap to reason about.

export const GRID = 13; // cells per side (classic Battle City field width)
export const CELL = 1.7; // world units per cell
export const FIELD = GRID * CELL;
export const HALF = FIELD / 2;
export const CENTER = (GRID - 1) / 2; // center cell index

export enum Tile {
  Empty = 0,
  Brick = 1,
  Steel = 2,
  Water = 3,
  Tree = 4,
  Base = 5,
  Border = 6,
}

export enum Dir {
  N = 0,
  E = 1,
  S = 2,
  W = 3,
}

// Unit vectors in world space. x = right, z = down (toward player base).
export const DIR_VEC: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N — toward enemy spawn (top)
  [1, 0], // E
  [0, 1], // S — toward base (bottom)
  [-1, 0], // W
];

// Barrel mesh points along -Z locally; these yaw rotations face each direction.
export const DIR_YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

export const oppositeDir = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export function cellToWorldX(col: number): number {
  return (col - CENTER) * CELL;
}
export function cellToWorldZ(row: number): number {
  return (row - CENTER) * CELL;
}
export function worldToCell(x: number, z: number): { col: number; row: number } {
  return {
    col: Math.round(x / CELL + CENTER),
    row: Math.round(z / CELL + CENTER),
  };
}
// Nearest cell-center coordinate on an axis (used for lane snapping).
export function nearestLane(world: number): number {
  return (Math.round(world / CELL + CENTER) - CENTER) * CELL;
}

// Visual heights for each tile type (world units). Collision is grid-based
// and ignores these; they only place the 3D meshes.
export const TILE_HEIGHTS = {
  brick: 0.8,
  steel: 0.95,
  border: 1.1,
  water: 0.12,
  base: 0.85,
};

export const TANK = {
  half: 0.6, // collision half-extent (< CELL/2 = 0.85 so corridors are passable)
  playerSpeed: 5.0,
  turnSnapRate: 16, // lane alignment speed
  bulletSpeed: 12.5,
  bulletLife: 2.4,
  playerFireCooldown: 0.42,
  respawnInvincible: 2.6,
  spawnAnim: 1.0,
};

export type EnemyKind = 'scout' | 'hunter' | 'heavy' | 'berserker';

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;
  fireInterval: number; // seconds between shots
  bulletSpeed: number;
  score: number;
  body: string;
  trim: string;
  barrel: string;
  smart: number; // 0..1 bias toward player/base when choosing direction
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  scout: {
    kind: 'scout',
    hp: 1,
    speed: 3.0,
    fireInterval: 1.7,
    bulletSpeed: 8.5,
    score: 100,
    body: '#6fae4e',
    trim: '#3f6e2c',
    barrel: '#23311a',
    smart: 0.25,
  },
  hunter: {
    kind: 'hunter',
    hp: 1,
    speed: 3.9,
    fireInterval: 1.15,
    bulletSpeed: 10.5,
    score: 200,
    body: '#5b7fb0',
    trim: '#33475f',
    barrel: '#1a2230',
    smart: 0.5,
  },
  heavy: {
    kind: 'heavy',
    hp: 3,
    speed: 2.7,
    fireInterval: 1.5,
    bulletSpeed: 9.5,
    score: 300,
    body: '#c9c3b6',
    trim: '#b53030',
    barrel: '#3a3833',
    smart: 0.4,
  },
  berserker: {
    kind: 'berserker',
    hp: 1,
    speed: 5.1,
    fireInterval: 1.0,
    bulletSpeed: 11.5,
    score: 200,
    body: '#d98a2b',
    trim: '#7a3d0a',
    barrel: '#2a1c08',
    smart: 0.35,
  },
};

export type PowerKind = 'star' | 'shield' | 'life' | 'shovel' | 'grenade' | 'freeze';

export interface PowerDef {
  kind: PowerKind;
  label: string;
  color: string;
  glyph: string;
}

export const POWER_DEFS: Record<PowerKind, PowerDef> = {
  star: { kind: 'star', label: 'Firepower', color: '#f0b429', glyph: '★' },
  shield: { kind: 'shield', label: 'Shield', color: '#48baa7', glyph: '◈' },
  life: { kind: 'life', label: 'Extra Tank', color: '#e76f51', glyph: '◭' },
  shovel: { kind: 'shovel', label: 'Bastion', color: '#b0b8c4', glyph: '▣' },
  grenade: { kind: 'grenade', label: 'Clear', color: '#e5436b', glyph: '✺' },
  freeze: { kind: 'freeze', label: 'Freeze', color: '#7fb2e0', glyph: '❄' },
};

export interface LevelConfig {
  index: number;
  name: string;
  roster: number; // total enemies in the level
  concurrent: number; // max on field
  spawnInterval: number;
  bonusEvery: number; // every Nth enemy is a bonus carrier
  mix: EnemyKind[]; // weighted roster mix (cycled)
  intro: string;
}

export const LEVELS: LevelConfig[] = [
  {
    index: 1,
    name: 'Checkpoint',
    roster: 12,
    concurrent: 3,
    spawnInterval: 2.4,
    bonusEvery: 4,
    mix: ['scout', 'scout', 'scout', 'hunter', 'scout', 'hunter'],
    intro: 'Hold the line at Checkpoint.',
  },
  {
    index: 2,
    name: 'Crossfire',
    roster: 16,
    concurrent: 4,
    spawnInterval: 2.0,
    bonusEvery: 4,
    mix: ['scout', 'hunter', 'hunter', 'heavy', 'scout', 'hunter', 'berserker'],
    intro: 'Pillars and gunfire. Watch the lanes.',
  },
  {
    index: 3,
    name: 'Fortress',
    roster: 20,
    concurrent: 4,
    spawnInterval: 1.7,
    bonusEvery: 4,
    mix: ['hunter', 'heavy', 'berserker', 'hunter', 'heavy', 'berserker', 'scout'],
    intro: 'Steel, water, and forest. The last stand.',
  },
];

export const PALETTE = {
  bgTop: '#0d1016',
  bgBottom: '#1b2028',
  fog: '#13171f',
  floor: '#272b34',
  floorLine: 'rgba(120,140,170,0.10)',
  floorTrim: 'rgba(240,180,41,0.18)',
  brick: '#b5532f',
  brickMortar: '#5e2a1a',
  steel: '#8a93a4',
  steelEdge: '#3c4452',
  water: '#1f5d68',
  waterHi: '#3fa6b8',
  tree: '#3f6b3a',
  treeHi: '#6f9a4a',
  baseBody: '#2a2f3a',
  baseEmblem: '#f0b429',
  player: '#f0b429',
  playerTrim: '#caa233',
  playerBarrel: '#5a4514',
  bulletPlayer: '#ffd66b',
  bulletEnemy: '#ff5a4a',
  hud: '#f6f1df',
  accent: '#f0b429',
  accent2: '#48baa7',
  danger: '#e5436b',
};
