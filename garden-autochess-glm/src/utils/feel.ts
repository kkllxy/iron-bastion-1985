// Game-feel math in one file — TweenManager, ShakeRig, easing. Dependency-free.

import * as THREE from 'three';

export type Easing = (t: number) => number;

export const easeInQuad: Easing = (t) => t * t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface ActiveTween {
  elapsed: number;
  duration: number;
  easing: Easing;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export class TweenManager {
  private readonly tweens: ActiveTween[] = [];

  get count(): number {
    return this.tweens.length;
  }

  tween(
    durationSec: number,
    onUpdate: (value: number) => void,
    easing: Easing = easeOutCubic,
    onComplete?: () => void,
  ): void {
    this.tweens.push({ elapsed: 0, duration: durationSec, easing, onUpdate, onComplete });
  }

  update(delta: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const t = this.tweens[i];
      t.elapsed += delta;
      const k = Math.min(t.elapsed / t.duration, 1);
      t.onUpdate(t.easing(k));
      if (t.elapsed >= t.duration) {
        t.onComplete?.();
        this.tweens.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.tweens.length = 0;
  }
}

const TRAUMA_MAX = 1;
const TRAUMA_DECAY = 1.4;
const MAX_OFFSET = 0.5;
const MAX_ROLL = 0.09;

function pseudoNoise(t: number, seed: number): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// Drives camera shake; CameraRig re-derives base transform every frame so the
// additive offset here never accumulates across frames.
export class ShakeRig {
  private trauma = 0;
  private time = 0;
  private readonly offset = new THREE.Vector3();

  get intensity(): number {
    return this.trauma * this.trauma;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(TRAUMA_MAX, this.trauma + amount);
  }

  reset(): void {
    this.trauma = 0;
    this.offset.set(0, 0, 0);
  }

  update(delta: number, camera: THREE.PerspectiveCamera, reduced: boolean): void {
    this.time += delta;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * delta);
    this.offset.set(0, 0, 0);
    if (this.trauma <= 0 || reduced) return;
    const shake = this.trauma * this.trauma;
    const freq = this.time * 32;
    this.offset.set(
      MAX_OFFSET * shake * pseudoNoise(freq, 1),
      MAX_OFFSET * shake * pseudoNoise(freq, 2),
      0,
    );
    camera.position.add(this.offset);
    camera.rotation.z += MAX_ROLL * shake * pseudoNoise(freq, 3);
  }
}

// Additive FOV bump; decay toward 0 with ~200ms time constant.
export class FovPunch {
  private fovPunch = 0;

  punch(degrees: number): void {
    this.fovPunch = Math.min(10, this.fovPunch + degrees);
  }

  update(delta: number, camera: THREE.PerspectiveCamera, baseFov: number): void {
    if (this.fovPunch > 0.001) {
      this.fovPunch *= Math.exp(-delta / 0.2);
      if (this.fovPunch < 0.001) this.fovPunch = 0;
    }
    camera.fov = baseFov + this.fovPunch;
    camera.updateProjectionMatrix();
  }

  reset(): void {
    this.fovPunch = 0;
  }
}
