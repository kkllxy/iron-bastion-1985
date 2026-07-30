// Shared gameplay types and enums for the stealth action game.

export type GamePhase = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'gameover' | 'victory';

// Alert state machine: 潜伏 → 被发现 → 通缉 → 搜查 → 恢复(潜伏)
export type AlertLevel = 'hidden' | 'spotted' | 'hunted' | 'searching';

export type WeaponType = 'pistol' | 'tranq' | 'none';

export type ItemType = 'card1' | 'card2' | 'ration' | 'explosive';

export type EnemyKind = 'soldier' | 'camera' | 'heavy' | 'sniper';

export interface InputIntent {
  move: { x: number; y: number }; // normalized-ish movement vector (screen space: y+ = down/south)
  stealth: boolean; // hold to creep (Shift/Ctrl)
  fire: boolean; // J/X attack edge
  firePressed: boolean; // edge-triggered this frame
  interactPressed: boolean; // E/Space
  swapPressed: boolean; // Q/Tab
  boxPressed: boolean; // F/B toggle
}

export interface AlertConfig {
  spotRate: number; // detection per second at full visibility
  loseRate: number; // detection decay per second when unseen
  spottedThreshold: number; // 0..1 -> spotted
  huntedThreshold: number; // -> hunted
  searchTime: number; // seconds in searching before recovering
}

export interface Tuning {
  playerSpeed: number;
  stealthSpeedMul: number;
  playerRadius: number;
  playerMaxHp: number;
  startingLives: number;
  pistolDamage: number;
  pistolCooldown: number;
  pistolRange: number;
  tranqRange: number;
  tranqCooldown: number;
  bulletSpeed: number;
  enemyBulletSpeed: number;
  cameraLag: number;
  cameraHeight: number;
  cameraDistance: number;
  cameraFov: number;
  exposure: number;
  maxDpr: number;
  cell: number; // grid cell size in world units
  alert: AlertConfig;
}

export const TUNING: Tuning = {
  playerSpeed: 4.6,
  stealthSpeedMul: 0.52,
  playerRadius: 0.42,
  playerMaxHp: 100,
  startingLives: 3,
  pistolDamage: 34,
  pistolCooldown: 0.34,
  pistolRange: 26,
  tranqRange: 2.0,
  tranqCooldown: 0.7,
  bulletSpeed: 38,
  enemyBulletSpeed: 16,
  cameraLag: 0.14,
  cameraHeight: 16,
  cameraDistance: 11,
  cameraFov: 50,
  exposure: 1.0,
  maxDpr: 2,
  cell: 2,
  alert: {
    spotRate: 1.25,
    loseRate: 0.55,
    spottedThreshold: 0.34,
    huntedThreshold: 0.72,
    searchTime: 6.0,
  },
};

export const ALERT_LABEL: Record<AlertLevel, string> = {
  hidden: '潜伏',
  spotted: '被发现',
  hunted: '通缉',
  searching: '搜查',
};
