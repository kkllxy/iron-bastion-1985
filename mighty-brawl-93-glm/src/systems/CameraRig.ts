import * as THREE from 'three';

export interface CameraBounds {
  readonly halfWidth: number;
  readonly startZ: number; // back
  readonly endZ: number; // front (boss arena, most negative)
}

// Beat'em-up camera: trails behind+above the player along the strip, clamped so
// the lens never reveals past the level start or the boss arena. Shake / FOV
// punch are applied by Game AFTER this writes the base transform.
export class CameraRig {
  readonly baseFov = 50;
  private readonly desired = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private bounds: CameraBounds = { halfWidth: 7, startZ: 2, endZ: -38 };
  private focus: THREE.Vector3 | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  setBounds(bounds: CameraBounds): void {
    this.bounds = bounds;
  }

  setFocus(point: THREE.Vector3 | null): void {
    this.focus = point ? point.clone() : null;
  }

  snapTo(target: THREE.Vector3): void {
    this.derive(target, this.desired);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.look);
  }

  update(delta: number, target: THREE.Vector3, lag: number): void {
    this.derive(target, this.desired);
    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag));
    this.camera.position.lerp(this.desired, factor);
    this.camera.lookAt(this.look);
  }

  private derive(target: THREE.Vector3, out: THREE.Vector3): void {
    const height = 10.5;
    const depth = 9.2;
    let tx = target.x;
    let tz = target.z;
    // boss focus blends the look toward the boss arena center
    if (this.focus) {
      tx = THREE.MathUtils.lerp(target.x, this.focus.x, 0.25);
    }
    const cx = THREE.MathUtils.clamp(tx, -this.bounds.halfWidth + 0.5, this.bounds.halfWidth - 0.5);
    const cz = THREE.MathUtils.clamp(tz + depth * 0.55, this.bounds.endZ + 5.5, this.bounds.startZ + 7.5);
    out.set(cx, height, cz);
    const lookZ = THREE.MathUtils.clamp(tz - 1.5, this.bounds.endZ + 1.5, this.bounds.startZ + 4);
    this.look.set(tx, 1.1, lookZ);
  }
}
