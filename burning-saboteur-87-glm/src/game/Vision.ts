// Vision cone detection + line-of-sight, operating on a GridMap.
import { GridMap } from '../systems/GridMap';

export interface VisionInput {
  map: GridMap;
  eyeX: number;
  eyeZ: number;
  facing: number; // radians
  fov: number; // full cone angle (radians)
  range: number;
  targetX: number;
  targetZ: number;
  stealthed: boolean; // creeping -> reduced effective range
  boxed: boolean; // in box -> ignored unless very close
}

// Returns 0..1 visibility factor (0 = unseen). Uses angle + range + LOS raycast.
export function visibility(v: VisionInput): number {
  const dx = v.targetX - v.eyeX;
  const dz = v.targetZ - v.eyeZ;
  const dist = Math.hypot(dx, dz);
  if (dist > v.range || dist < 1e-3) return 0;
  const ang = Math.atan2(dz, dx);
  let diff = ang - v.facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const half = v.fov / 2;
  if (Math.abs(diff) > half) {
    // outside cone; only peripheral awareness when very close
    if (dist > 2.2) return 0;
    return 0;
  }
  if (v.map.segmentBlocked(v.eyeX, v.eyeZ, v.targetX, v.targetZ)) return 0;
  let factor = 1 - dist / v.range; // closer = stronger
  factor *= 0.5 + 0.5 * (1 - Math.abs(diff) / half); // center of cone stronger
  if (v.stealthed) factor *= 0.42;
  if (v.boxed) {
    // box disguise: ignored unless point-blank
    if (dist > 1.8) return 0;
    factor *= 0.35;
  }
  return Math.max(0, Math.min(1, factor));
}

// Hearing: distance-based, louder when running/firing.
export function hearing(
  earX: number,
  earZ: number,
  sourceX: number,
  sourceZ: number,
  noiseRadius: number,
): number {
  const d = Math.hypot(sourceX - earX, sourceZ - earZ);
  if (d > noiseRadius) return 0;
  return 1 - d / noiseRadius;
}
