import type { Archetype, EnemyType, LevelDef, Palette, PickupKind } from './types';

// ponytail: tuneable balance table. All enemy stats live here so a balance
// pass is one-file. Armor reduces incoming damage; bruisers soak, rushers fold.
export const ARCHETYPES: Record<EnemyType, Archetype> = {
  punk: {
    maxHp: 24,
    speed: 2.7,
    attackDamage: 7,
    attackRange: 1.0,
    attackReach: 1.0,
    attackDuration: 0.46,
    attackWindup: 0.16,
    attackActive: 0.12,
    cooldown: 1.5,
    knockback: 4.5,
    knockbackResist: 0,
    radius: 0.42,
    armor: 0,
    scoreValue: 100,
    xpValue: 12,
  },
  rusher: {
    maxHp: 15,
    speed: 4.7,
    attackDamage: 5,
    attackRange: 0.9,
    attackReach: 0.9,
    attackDuration: 0.34,
    attackWindup: 0.1,
    attackActive: 0.1,
    cooldown: 0.95,
    knockback: 3.2,
    knockbackResist: 0,
    radius: 0.38,
    armor: 0,
    scoreValue: 150,
    xpValue: 14,
  },
  bruiser: {
    maxHp: 72,
    speed: 1.95,
    attackDamage: 13,
    attackRange: 1.25,
    attackReach: 1.2,
    attackDuration: 0.66,
    attackWindup: 0.26,
    attackActive: 0.16,
    cooldown: 2.1,
    knockback: 7,
    knockbackResist: 0.45,
    radius: 0.6,
    armor: 0.4,
    scoreValue: 320,
    xpValue: 30,
  },
  thrower: {
    maxHp: 20,
    speed: 2.3,
    attackDamage: 8,
    attackRange: 9,
    attackReach: 0,
    attackDuration: 0.7,
    attackWindup: 0.34,
    attackActive: 0.06,
    cooldown: 2.6,
    knockback: 2.5,
    knockbackResist: 0,
    radius: 0.42,
    armor: 0,
    scoreValue: 260,
    xpValue: 22,
  },
};

export const PALETTES: Record<EnemyType, Palette> = {
  punk: { primary: '#7b3fb0', secondary: '#2c2a33', skin: '#d9a87a', hair: '#3ed07a' },
  rusher: { primary: '#f5a623', secondary: '#1a1a1f', skin: '#c98a5e', hair: '#d83a3a' },
  bruiser: { primary: '#52585f', secondary: '#b03020', skin: '#caa278', hair: '#2a2a30' },
  thrower: { primary: '#2f7d5b', secondary: '#caa84e', skin: '#cda27a', hair: '#5a3a2a' },
};

export const PLAYER_PALETTE: Palette = {
  primary: '#e23b3b',
  secondary: '#f4f1ea',
  skin: '#f0c8a0',
  hair: '#ffce4a',
};

export const PICKUP_COLORS: Record<PickupKind, string> = {
  health: '#ff4d6d',
  score: '#ffd24a',
  rage: '#9b6bff',
  weapon: '#5ad1ff',
};

// Distinct layouts: streets = wide open, subway = narrow corridor, factory =
// mid width + cluttered. startZ is always the back (player spawn); endZ is the
// boss arena (most negative). Each level = 2 trash waves + 1 boss.
export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: '霓虹街区',
    subtitle: 'NEON STREETS',
    theme: {
      sky: '#160a26',
      fog: '#1a0e2e',
      fogNear: 16,
      fogFar: 46,
      floor: '#231634',
      floorAccent: '#2e1c46',
      floorLine: '#ff3ea5',
      ambient: 0.55,
      sunColor: '#ffb3d9',
      sunIntensity: 1.5,
      sunPosition: [-6, 11, 4],
      hemiSky: '#ff6fb0',
      hemiGround: '#1b0e2e',
      propColor: '#3a2358',
      accentGlow: '#ff3ea5',
    },
    halfWidth: 7,
    startZ: 2,
    endZ: -38,
    waves: [
      {
        gateZ: -12,
        spawns: [
          { type: 'punk', count: 2, sideBias: 0 },
          { type: 'rusher', count: 1, sideBias: 0.5 },
        ],
      },
      {
        gateZ: -24,
        spawns: [
          { type: 'punk', count: 1, sideBias: -0.5 },
          { type: 'rusher', count: 2, sideBias: 0.5 },
          { type: 'thrower', count: 1, sideBias: 0 },
        ],
      },
    ],
    boss: { type: 'street-king', hp: 220, name: '街头霸王 STREET KING' },
  },
  {
    id: 2,
    name: '午夜地铁',
    subtitle: 'MIDNIGHT SUBWAY',
    theme: {
      sky: '#0b1018',
      fog: '#0d141f',
      fogNear: 14,
      fogFar: 40,
      floor: '#15191f',
      floorAccent: '#1d2530',
      floorLine: '#ffb24a',
      ambient: 0.5,
      sunColor: '#ffd9a0',
      sunIntensity: 1.3,
      sunPosition: [4, 10, -3],
      hemiSky: '#7fb0d9',
      hemiGround: '#0d141f',
      propColor: '#2a3340',
      accentGlow: '#ffb24a',
    },
    halfWidth: 5,
    startZ: 2,
    endZ: -42,
    waves: [
      {
        gateZ: -13,
        spawns: [
          { type: 'rusher', count: 2, sideBias: -0.4 },
          { type: 'punk', count: 2, sideBias: 0.4 },
        ],
      },
      {
        gateZ: -27,
        spawns: [
          { type: 'bruiser', count: 1, sideBias: 0 },
          { type: 'rusher', count: 2, sideBias: 0.6 },
        ],
      },
    ],
    boss: { type: 'subway-brute', hp: 330, name: '钢铁暴徒 SUBWAY BRUTE' },
  },
  {
    id: 3,
    name: '地下工厂',
    subtitle: 'UNDERGROUND FACTORY',
    theme: {
      sky: '#0a120c',
      fog: '#0c160e',
      fogNear: 13,
      fogFar: 38,
      floor: '#141a14',
      floorAccent: '#1c241a',
      floorLine: '#7dff5a',
      ambient: 0.48,
      sunColor: '#c8ffb0',
      sunIntensity: 1.35,
      sunPosition: [-3, 11, 3],
      hemiSky: '#88d96a',
      hemiGround: '#0c160e',
      propColor: '#27331f',
      accentGlow: '#7dff5a',
    },
    halfWidth: 6,
    startZ: 2,
    endZ: -46,
    waves: [
      {
        gateZ: -14,
        spawns: [
          { type: 'bruiser', count: 1, sideBias: -0.5 },
          { type: 'thrower', count: 1, sideBias: 0.5 },
          { type: 'rusher', count: 1, sideBias: 0 },
        ],
      },
      {
        gateZ: -30,
        spawns: [
          { type: 'bruiser', count: 2, sideBias: 0.4 },
          { type: 'thrower', count: 1, sideBias: -0.5 },
          { type: 'rusher', count: 1, sideBias: 0 },
        ],
      },
    ],
    boss: { type: 'factory-overlord', hp: 470, name: '工厂领主 FACTORY OVERLORD' },
  },
];

// XP curve: leveling unlocks combo breadth + damage. Returned level is 1-based.
export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(level, 1.45));
}
