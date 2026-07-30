import type {
  BossId,
  EnemyDef,
  EnemyId,
  GraftRecipe,
  MutationOption,
  PlantDef,
  PlantId,
  RelicDef,
  RelicId,
  WeatherDef,
  WeatherId,
  WaveDef,
} from './types';

// ============================================================================
// 植物（12 种：产阳光 / 攻击 / 防御 / 辅助 / 嫁接品种）
// ============================================================================

export const PLANTS: Record<PlantId, PlantDef> = {
  sunflower: {
    id: 'sunflower',
    name: '向日葵',
    role: 'sun',
    cost: 50,
    damageType: 'none',
    hp: 60,
    damage: 0,
    cooldown: 1,
    rangeCells: 0,
    projectile: 'pea',
    sunInterval: 6,
    sunValue: 25,
    tags: ['sun'],
    isGraft: false,
    desc: '每 6 秒产出 25 阳光，是花园经济的基础。',
  },
  peashooter: {
    id: 'peashooter',
    name: '豌豆射手',
    role: 'shooter',
    cost: 100,
    damageType: 'phys',
    hp: 120,
    damage: 24,
    cooldown: 1.3,
    rangeCells: -1,
    projectile: 'pea',
    shotsPerVolley: 1,
    tags: [],
    isGraft: false,
    desc: '沿本路线射出豌豆，物理伤害，稳扎稳打。',
  },
  firepepper: {
    id: 'firepepper',
    name: '火辣椒',
    role: 'shooter',
    cost: 175,
    damageType: 'fire',
    hp: 110,
    damage: 30,
    cooldown: 1.8,
    rangeCells: -1,
    projectile: 'fireball',
    status: { type: 'burn', duration: 3, dps: 12 },
    tags: ['fire'],
    isGraft: false,
    desc: '掷出火球并附加持续燃烧，克制污泥与雾霭。',
  },
  icemoss: {
    id: 'icemoss',
    name: '寒冰苔',
    role: 'shooter',
    cost: 175,
    damageType: 'ice',
    hp: 110,
    damage: 16,
    cooldown: 1.6,
    rangeCells: -1,
    projectile: 'ice',
    status: { type: 'slow', duration: 2, magnitude: 0.5 },
    tags: ['ice'],
    isGraft: false,
    desc: '冰锥减速敌人 50%，尤其克制跳蚤。',
  },
  nutwall: {
    id: 'nutwall',
    name: '坚果墙',
    role: 'wall',
    cost: 50,
    damageType: 'none',
    hp: 600,
    damage: 0,
    cooldown: 1,
    rangeCells: 0,
    projectile: 'pea',
    tags: ['wall'],
    isGraft: false,
    desc: '高血量肉盾，阻挡整条路线。后方放藤蔓可触发反伤。',
  },
  vine: {
    id: 'vine',
    name: '荆棘藤',
    role: 'shooter',
    cost: 125,
    damageType: 'phys',
    hp: 130,
    damage: 14,
    cooldown: 1.6,
    rangeCells: -1,
    projectile: 'pea',
    tags: ['vine'],
    isGraft: false,
    desc: '甩出荆棘攻击。放在坚果墙后方时，坚果被啃咬会反伤。',
  },
  toadstool: {
    id: 'toadstool',
    name: '毒蟾蜍',
    role: 'shooter',
    cost: 150,
    damageType: 'poison',
    hp: 100,
    damage: 12,
    cooldown: 1.5,
    rangeCells: -1,
    projectile: 'poison',
    status: { type: 'poison', duration: 4, dps: 10, stacks: 1 },
    tags: ['mushroom'],
    isGraft: false,
    desc: '喷吐毒液，毒素可叠加。蘑菇围圈可共享攻速。',
  },
  sporeshroom: {
    id: 'sporeshroom',
    name: '孢子菇',
    role: 'aura',
    cost: 150,
    damageType: 'poison',
    hp: 100,
    damage: 0,
    cooldown: 1,
    rangeCells: 0,
    projectile: 'pea',
    auraCells: 1.5,
    auraDps: 6,
    status: { type: 'poison', duration: 2, dps: 6 },
    tags: ['mushroom'],
    isGraft: false,
    desc: '散发孢子毒雾持续伤害周围怪物，蘑菇围圈核心。',
  },
  aloezap: {
    id: 'aloezap',
    name: '闪电芦荟',
    role: 'shooter',
    cost: 200,
    damageType: 'elec',
    hp: 100,
    damage: 18,
    cooldown: 1.0,
    rangeCells: -1,
    projectile: 'beam',
    chain: 3,
    status: { type: 'shock', duration: 0.4, magnitude: 0.4 },
    tags: [],
    isGraft: false,
    desc: '闪电连锁击中本路线最多 3 个目标，克制铁桶怪。',
  },
  onionpult: {
    id: 'onionpult',
    name: '洋葱投手',
    role: 'lobber',
    cost: 250,
    damageType: 'phys',
    hp: 110,
    damage: 28,
    cooldown: 2.2,
    rangeCells: -1,
    projectile: 'lob',
    aoeCells: 1.0,
    tags: [],
    isGraft: false,
    desc: '抛投越过坚果墙，落点范围溅射，专破集群。',
  },
  steamdande: {
    id: 'steamdande',
    name: '蒸汽蒲公英',
    role: 'shooter',
    cost: 0,
    damageType: 'fire',
    hp: 130,
    damage: 35,
    cooldown: 2.0,
    rangeCells: -1,
    projectile: 'steam',
    aoeCells: 1.2,
    status: { type: 'burn', duration: 2, dps: 10 },
    tags: ['fire', 'ice', 'graft'],
    isGraft: true,
    desc: '【嫁接·火+冰】蒸汽爆裂，范围伤害并附带冰火双效。',
  },
  sunpumpkin: {
    id: 'sunpumpkin',
    name: '烈阳南瓜',
    role: 'wall',
    cost: 0,
    damageType: 'none',
    hp: 700,
    damage: 0,
    cooldown: 1,
    rangeCells: 0,
    projectile: 'pea',
    sunInterval: 8,
    sunValue: 25,
    tags: ['sun', 'wall', 'graft'],
    isGraft: true,
    desc: '【嫁接·向日葵+坚果】既能产出阳光，又是坚固肉盾。',
  },
};

export const PLANT_ORDER: PlantId[] = [
  'sunflower',
  'peashooter',
  'firepepper',
  'icemoss',
  'nutwall',
  'vine',
  'toadstool',
  'sporeshroom',
  'aloezap',
  'onionpult',
  'steamdande',
  'sunpumpkin',
];

// 可在商店刷出的基础植物（嫁接品种不入商店，靠合成获得）
export const SHOP_POOL: PlantId[] = [
  'sunflower',
  'peashooter',
  'firepepper',
  'icemoss',
  'nutwall',
  'vine',
  'toadstool',
  'sporeshroom',
  'aloezap',
  'onionpult',
];

// ============================================================================
// 敌人（8 种）—— 不同路线 / 速度 / 特性 / 伤害抗性
// armor: 1 正常 / <1 抗 / >1 弱
// ============================================================================

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  slime: {
    id: 'slime',
    name: '污泥怪',
    hp: 70,
    speed: 0.38,
    eatDps: 24,
    armor: { poison: 0.5, phys: 1.0 },
    radius: 0.42,
    score: 50,
    sunBounty: 0.18,
    breach: 15,
    special: 'none',
    isBoss: false,
    color: '#6fae3a',
    accent: '#2c5a14',
    scale: 1,
  },
  spider: {
    id: 'spider',
    name: '尖刺蛛',
    hp: 60,
    speed: 0.78,
    eatDps: 18,
    armor: { fire: 1.7, phys: 1.0 },
    radius: 0.36,
    score: 80,
    sunBounty: 0.12,
    breach: 12,
    special: 'none',
    isBoss: false,
    color: '#8a2be2',
    accent: '#2a0a40',
    scale: 0.9,
  },
  bucket: {
    id: 'bucket',
    name: '铁桶怪',
    hp: 340,
    speed: 0.3,
    eatDps: 30,
    armor: { phys: 0.5, elec: 1.8, fire: 0.8 },
    radius: 0.5,
    score: 160,
    sunBounty: 0.25,
    breach: 20,
    special: 'none',
    isBoss: false,
    color: '#9aa3ad',
    accent: '#3a4148',
    scale: 1.1,
  },
  smogger: {
    id: 'smogger',
    name: '雾霭鬼',
    hp: 90,
    speed: 0.5,
    eatDps: 22,
    armor: { phys: 0.6, fire: 1.5, ice: 1.2 },
    radius: 0.4,
    score: 120,
    sunBounty: 0.16,
    breach: 14,
    special: 'none',
    isBoss: false,
    color: '#5b6470',
    accent: '#1c2230',
    scale: 0.95,
  },
  toxic: {
    id: 'toxic',
    name: '毒囊虫',
    hp: 150,
    speed: 0.42,
    eatDps: 26,
    armor: { poison: 0.4, fire: 1.3 },
    radius: 0.44,
    score: 140,
    sunBounty: 0.2,
    breach: 16,
    special: 'poisontrail',
    isBoss: false,
    color: '#b6d334',
    accent: '#46540a',
    scale: 1.0,
  },
  flea: {
    id: 'flea',
    name: '跳蚤',
    hp: 70,
    speed: 0.68,
    eatDps: 20,
    armor: { ice: 1.7, phys: 1.0 },
    radius: 0.34,
    score: 110,
    sunBounty: 0.15,
    breach: 12,
    special: 'lanehop',
    isBoss: false,
    color: '#e85d2a',
    accent: '#4a1606',
    scale: 0.85,
  },
  brute: {
    id: 'brute',
    name: '重锤怪',
    hp: 520,
    speed: 0.26,
    eatDps: 60,
    armor: { phys: 0.6, fire: 1.1, elec: 1.2 },
    radius: 0.56,
    score: 240,
    sunBounty: 0.3,
    breach: 24,
    special: 'none',
    isBoss: false,
    color: '#7a4a2a',
    accent: '#2c160a',
    scale: 1.2,
  },
  flagbearer: {
    id: 'flagbearer',
    name: '抢旗兵',
    hp: 130,
    speed: 0.5,
    eatDps: 24,
    armor: { phys: 1.0, ice: 1.2 },
    radius: 0.42,
    score: 150,
    sunBounty: 0.2,
    breach: 16,
    special: 'aurabuff',
    isBoss: false,
    color: '#d83a3a',
    accent: '#3a0808',
    scale: 1.0,
  },
};

export const ENEMY_IDS: EnemyId[] = [
  'slime',
  'spider',
  'bucket',
  'smogger',
  'toxic',
  'flea',
  'brute',
  'flagbearer',
];

// ============================================================================
// BOSS（3 个）—— 第 5 / 10 / 15 波
// ============================================================================

export const BOSSES: Record<BossId, EnemyDef> = {
  colossus: {
    id: 'colossus',
    name: '污泥巨像',
    hp: 3000,
    speed: 0.22,
    eatDps: 80,
    armor: { poison: 0.6, phys: 1.0, fire: 1.2 },
    radius: 0.9,
    score: 1500,
    sunBounty: 1,
    breach: 60,
    special: 'split',
    isBoss: true,
    color: '#5a8a2a',
    accent: '#16330a',
    scale: 1.8,
  },
  wraith: {
    id: 'wraith',
    name: '毒雾树灵',
    hp: 6000,
    speed: 0.2,
    eatDps: 100,
    armor: { poison: 0.4, fire: 1.3, elec: 1.1 },
    radius: 1.0,
    score: 3000,
    sunBounty: 1,
    breach: 80,
    special: 'aurabuff',
    isBoss: true,
    color: '#8a6a3a',
    accent: '#241608',
    scale: 2.0,
  },
  dragon: {
    id: 'dragon',
    name: '末日巨龙',
    hp: 12000,
    speed: 0.26,
    eatDps: 140,
    armor: { phys: 0.7, fire: 0.5, ice: 1.5, elec: 1.2 },
    radius: 1.1,
    score: 6000,
    sunBounty: 1,
    breach: 100,
    special: 'none',
    isBoss: true,
    color: '#a83030',
    accent: '#340606',
    scale: 2.2,
  },
};

// ============================================================================
// 嫁接配方（两种植物 → 新品种）
// ============================================================================

export const GRAFT_RECIPES: GraftRecipe[] = [
  { a: 'firepepper', b: 'icemoss', result: 'steamdande' },
  { a: 'sunflower', b: 'nutwall', result: 'sunpumpkin' },
];

/** 在备战台里查找可嫁接的一对，返回配方与对应槽下标（找不到返回 null）。 */
export function findGraft(slots: { plantId: PlantId }[]): { recipe: GraftRecipe; aIndex: number; bIndex: number } | null {
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      for (const recipe of GRAFT_RECIPES) {
        const match =
          (slots[i].plantId === recipe.a && slots[j].plantId === recipe.b) ||
          (slots[i].plantId === recipe.b && slots[j].plantId === recipe.a);
        if (match) return { recipe, aIndex: i, bIndex: j };
      }
    }
  }
  return null;
}

// ============================================================================
// 变异（3★ 二选一）—— 每株到达 3★ 时在两个方向中选一个
// ============================================================================

export const MUTATIONS: Partial<Record<PlantId, [MutationOption, MutationOption]>> = {
  sunflower: [
    { id: 'bloom', name: '盛放', desc: '阳光产量 +80%', sunMult: 1.8 },
    { id: 'twin', name: '双生', desc: '每次产出两份阳光', shotsPerVolley: 2 },
  ],
  peashooter: [
    { id: 'rapid', name: '急速射手', desc: '攻击间隔 -45%', cooldownMult: 0.55 },
    { id: 'triple', name: '三连射', desc: '每次发射 3 颗豌豆', shotsPerVolley: 3 },
  ],
  firepepper: [
    { id: 'inferno', name: '烈焰', desc: '伤害 +70%，燃烧更猛', damageMult: 1.7, extraStatusStacks: 1 },
    { id: 'spread', name: '溅射火球', desc: '火球范围爆炸', aoeCells: 1.1 },
  ],
  icemoss: [
    { id: 'permafrost', name: '永冻', desc: '减速增至 75%，时长 +2s', statusMag: 0.25, statusDur: 4 },
    { id: 'shatter', name: '碎冰', desc: '伤害 +80%', damageMult: 1.8 },
  ],
  nutwall: [
    { id: 'spiked', name: '尖刺甲', desc: '反伤 50%', thornReflect: 0.5 },
    { id: 'titan', name: '巨像', desc: '生命 +80%', hpMult: 1.8 },
  ],
  vine: [
    { id: 'barbed', name: '倒钩', desc: '相邻坚果反伤 +80%', thornReflect: 0.8 },
    { id: 'lash', name: '长鞭', desc: '伤害 +60%', damageMult: 1.6 },
  ],
  toadstool: [
    { id: 'venom', name: '剧毒', desc: '毒素层数 +2', extraStatusStacks: 2 },
    { id: 'plague', name: '瘟疫', desc: '毒液范围溅射', aoeCells: 1.0 },
  ],
  sporeshroom: [
    { id: 'network', name: '菌丝网', desc: '光环范围与伤害 +60%', auraMult: 1.6 },
    { id: 'sporeburst', name: '孢子爆', desc: '光环范围翻倍', auraMult: 2.0 },
  ],
  aloezap: [
    { id: 'overload', name: '过载', desc: '连锁目标 +3', chainBonus: 3 },
    { id: 'storm', name: '风暴', desc: '攻击间隔 -40%', cooldownMult: 0.6 },
  ],
  onionpult: [
    { id: 'bigger', name: '重磅', desc: '范围与伤害提升', aoeCells: 1.8, damageMult: 1.3 },
    { id: 'rapid', name: '连投', desc: '攻击间隔 -40%', cooldownMult: 0.6 },
  ],
  steamdande: [
    { id: 'supercritical', name: '超临界', desc: '伤害 +60%，范围更大', damageMult: 1.6, aoeCells: 1.6 },
    { id: 'drench', name: '浸没', desc: '减速更强', statusMag: 0.3 },
  ],
  sunpumpkin: [
    { id: 'solar', name: '日轮', desc: '阳光 +80%，生命 +40%', sunMult: 1.8, hpMult: 1.4 },
    { id: 'briar', name: '荆棘壳', desc: '反伤 50%', thornReflect: 0.5 },
  ],
};

// ============================================================================
// 遗物（永久被动）
// ============================================================================

export const RELICS: Record<RelicId, RelicDef> = {
  suncore: { id: 'suncore', name: '阳光核心', desc: '每波开始额外 +20 阳光', icon: '☀' },
  gear: { id: 'gear', name: '加速齿轮', desc: '全体植物攻击速度 +15%', icon: '⚙' },
  revive: { id: 'revive', name: '复活种子', desc: '防线被突破时自动恢复 40 点（每局一次）', icon: '✦' },
  thornheart: { id: 'thornheart', name: '荆棘之心', desc: '所有坚果墙反伤 30%', icon: '☘' },
  overgrowth: { id: 'overgrowth', name: '疯长剂', desc: '所有植物生命 +25%', icon: '❀' },
  frostshard: { id: 'frostshard', name: '霜碎碎片', desc: '冰系伤害 +25%', icon: '❄' },
  ember: { id: 'ember', name: '余烬', desc: '火系伤害 +25%', icon: '🔥' },
};

export const RELIC_IDS: RelicId[] = ['suncore', 'gear', 'revive', 'thornheart', 'overgrowth', 'frostshard', 'ember'];

// ============================================================================
// 天气（每波效果）
// ============================================================================

export const WEATHERS: Record<WeatherId, WeatherDef> = {
  clear: { id: 'clear', name: '晴朗', desc: '无额外效果', icon: '○' },
  sunny: { id: 'sunny', name: '烈日', desc: '向日葵阳光产量 +50%', icon: '☀' },
  rain: { id: 'rain', name: '暴雨', desc: '植物每秒回复少量生命', icon: '☂' },
  fog: { id: 'fog', name: '浓雾', desc: '所有敌人速度 -15%', icon: '≈' },
};

// ============================================================================
// 15 波 — 难度递增，第 5/10/15 波为 BOSS
// ============================================================================

export const WAVES: readonly WaveDef[] = [
  {
    wave: 1,
    label: '污泥来袭',
    spawns: [
      { enemy: 'slime', count: 3, gap: 3.4 },
    ],
  },
  {
    wave: 2,
    label: '蛛群突袭',
    spawns: [
      { enemy: 'slime', count: 3, gap: 2.4 },
      { enemy: 'spider', count: 3, gap: 2.0, delay: 4 },
    ],
  },
  {
    wave: 3,
    label: '铁桶先锋',
    spawns: [
      { enemy: 'slime', count: 4, gap: 2.2 },
      { enemy: 'bucket', count: 1, laneBias: 0, delay: 5 },
      { enemy: 'spider', count: 2, gap: 2.0, delay: 8 },
    ],
  },
  {
    wave: 4,
    label: '毒雾弥漫',
    spawns: [
      { enemy: 'smogger', count: 3, gap: 2.4 },
      { enemy: 'toxic', count: 2, gap: 3.0, delay: 4 },
      { enemy: 'slime', count: 3, gap: 2.0, delay: 6 },
    ],
  },
  {
    wave: 5,
    label: '污泥巨像',
    spawns: [{ enemy: 'slime', count: 4, gap: 2.0 }],
    boss: 'colossus',
  },
  {
    wave: 6,
    label: '跳蚤群',
    spawns: [
      { enemy: 'flea', count: 5, gap: 1.8 },
      { enemy: 'spider', count: 3, gap: 2.0, delay: 5 },
    ],
  },
  {
    wave: 7,
    label: '重锤压境',
    spawns: [
      { enemy: 'brute', count: 2, gap: 5.0, laneBias: -0.5 },
      { enemy: 'bucket', count: 2, gap: 3.0, delay: 3 },
      { enemy: 'toxic', count: 3, gap: 2.2, delay: 6 },
    ],
  },
  {
    wave: 8,
    label: '抢旗冲锋',
    spawns: [
      { enemy: 'flagbearer', count: 3, gap: 3.0 },
      { enemy: 'slime', count: 5, gap: 1.6, delay: 2 },
      { enemy: 'spider', count: 4, gap: 1.6, delay: 6 },
    ],
  },
  {
    wave: 9,
    label: '混合编队',
    spawns: [
      { enemy: 'bucket', count: 3, gap: 3.0 },
      { enemy: 'brute', count: 1, delay: 4 },
      { enemy: 'smogger', count: 4, gap: 2.0, delay: 6 },
      { enemy: 'flea', count: 3, gap: 1.8, delay: 8 },
    ],
  },
  {
    wave: 10,
    label: '毒雾树灵',
    spawns: [
      { enemy: 'toxic', count: 4, gap: 2.4 },
      { enemy: 'bucket', count: 2, gap: 3.0, delay: 4 },
    ],
    boss: 'wraith',
  },
  {
    wave: 11,
    label: '毒雾围城',
    spawns: [
      { enemy: 'smogger', count: 6, gap: 1.8 },
      { enemy: 'toxic', count: 4, gap: 2.0, delay: 5 },
      { enemy: 'brute', count: 1, delay: 8 },
    ],
  },
  {
    wave: 12,
    label: '铁桶洪流',
    spawns: [
      { enemy: 'bucket', count: 5, gap: 2.4 },
      { enemy: 'flagbearer', count: 3, gap: 3.0, delay: 4 },
      { enemy: 'spider', count: 5, gap: 1.6, delay: 6 },
    ],
  },
  {
    wave: 13,
    label: '跳蚤风暴',
    spawns: [
      { enemy: 'flea', count: 8, gap: 1.3 },
      { enemy: 'brute', count: 2, gap: 5.0, delay: 4 },
      { enemy: 'smogger', count: 4, gap: 2.0, delay: 6 },
    ],
  },
  {
    wave: 14,
    label: '终末前奏',
    spawns: [
      { enemy: 'brute', count: 3, gap: 4.0 },
      { enemy: 'bucket', count: 4, gap: 2.4, delay: 3 },
      { enemy: 'flagbearer', count: 4, gap: 2.4, delay: 6 },
      { enemy: 'toxic', count: 4, gap: 2.0, delay: 8 },
    ],
  },
  {
    wave: 15,
    label: '末日巨龙',
    spawns: [
      { enemy: 'brute', count: 2, gap: 4.0 },
      { enemy: 'smogger', count: 4, gap: 2.0, delay: 4 },
      { enemy: 'flea', count: 5, gap: 1.6, delay: 6 },
    ],
    boss: 'dragon',
  },
];

export const TOTAL_WAVES = WAVES.length;

// ============================================================================
// 经济 / 数值常量
// ============================================================================

export const START_SUN = 300;
export const PREP_SUN = 70; // 每波备战阶段基础阳光
export const REROLL_COST = 10;
export const SHOP_SIZE = 5;
export const BENCH_SIZE = 8;
export const START_DEFENSE_HP = 100;
export const SELL_RATIO = 0.5; // 出售返还比例（按花费）

// 商店按波次的稀有度权重（越后期越可能刷到贵植物）
export function shopWeights(wave: number): { id: PlantId; weight: number }[] {
  const cheap: PlantId[] = ['sunflower', 'peashooter', 'nutwall'];
  const mid: PlantId[] = ['vine', 'toadstool', 'sporeshroom'];
  const pricey: PlantId[] = ['firepepper', 'icemoss', 'aloezap', 'onionpult'];
  const cheapW = Math.max(2, 6 - Math.floor(wave / 3));
  const midW = 3 + Math.floor(wave / 3);
  const priceW = 1 + Math.floor(wave / 2);
  const out: { id: PlantId; weight: number }[] = [];
  for (const id of cheap) out.push({ id, weight: cheapW });
  for (const id of mid) out.push({ id, weight: midW });
  for (const id of pricey) out.push({ id, weight: priceW });
  return out;
}
