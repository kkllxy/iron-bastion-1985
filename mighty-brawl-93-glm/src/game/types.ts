import type * as THREE from 'three';

// Fighter FSM states. Combat + animation branch on these; never add a state
// without handling it in Character.update() and CombatSystem.
export type FighterState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'jump'
  | 'hurt'
  | 'grabbed'
  | 'grab'
  | 'down'
  | 'special'
  | 'victory'
  | 'dead';

export type EnemyType = 'punk' | 'rusher' | 'bruiser' | 'thrower';

export type PickupKind = 'health' | 'score' | 'rage' | 'weapon';

export type BossType = 'street-king' | 'subway-brute' | 'factory-overlord';

export interface Archetype {
  readonly maxHp: number;
  readonly speed: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackReach: number; // forward distance of the hit point
  readonly attackDuration: number; // total swing seconds
  readonly attackWindup: number; // seconds before hit active
  readonly attackActive: number; // active-hit seconds after windup
  readonly cooldown: number;
  readonly knockback: number;
  readonly knockbackResist: number;
  readonly radius: number;
  readonly armor: number; // 0..0.8 damage reduction
  readonly scoreValue: number;
  readonly xpValue: number;
}

export interface Palette {
  readonly primary: string; // suit / clothing
  readonly secondary: string; // accent / trim
  readonly skin: string;
  readonly hair: string;
}

export interface SpawnDef {
  readonly type: EnemyType;
  readonly count: number;
  readonly sideBias: number; // -1 left .. 1 right, 0 centered
}

export interface WaveDef {
  readonly gateZ: number; // forward clamp until this wave is cleared
  readonly spawns: readonly SpawnDef[];
}

export interface BossDef {
  readonly type: BossType;
  readonly hp: number;
  readonly name: string;
}

export interface LevelTheme {
  readonly sky: string;
  readonly fog: string;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly floor: string;
  readonly floorAccent: string;
  readonly floorLine: string;
  readonly ambient: number;
  readonly sunColor: string;
  readonly sunIntensity: number;
  readonly sunPosition: [number, number, number];
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly propColor: string;
  readonly accentGlow: string; // neon emissive
}

export interface LevelDef {
  readonly id: number;
  readonly name: string;
  readonly subtitle: string;
  readonly theme: LevelTheme;
  readonly halfWidth: number;
  readonly startZ: number; // player spawn z (back, larger value)
  readonly endZ: number; // boss arena z (front, most negative)
  readonly waves: readonly WaveDef[];
  readonly boss: BossDef;
}

// Callbacks the Game exposes so combat/VFX code stays decoupled from the
// orchestrator. Every heavy contact routes through these.
export interface HitFx {
  hitstop(seconds: number, scale?: number): void;
  addTrauma(amount: number): void;
  punchFov(degrees: number): void;
  spawnSpark(position: THREE.Vector3, color: string, count: number, power: number): void;
  spawnDust(position: THREE.Vector3, color: string): void;
  spawnHitNumber(position: THREE.Vector3, amount: number, crit: boolean): void;
  whiteFlash(strength: number): void;
  rumble(strong: number, weak: number, ms: number): void;
}

export const FORWARD = { x: 0, z: -1 } as const;
