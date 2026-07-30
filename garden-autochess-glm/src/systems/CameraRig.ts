import * as THREE from 'three';

// Fixed angled "garden cam": looks down the lawn from the home side (left) so
// every lane + every column is visible at once. Plants defend on the left, the
// monster horde enters from the right. A small lag toward the wave front keeps
// late-column action readable. Shake / FOV punch are applied by Game AFTER this
// writes the base transform.
export class CameraRig {
  readonly baseFov = 42;
  private readonly desired = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private center = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  setCenter(center: THREE.Vector3): void {
    this.center.copy(center);
  }

  snapTo(): void {
    this.derive(this.desired);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.look);
  }

  update(delta: number): void {
    this.derive(this.desired);
    // tiny stabilisation only; the lawn view is intentionally steady
    const factor = 1 - Math.exp(-delta / 0.4);
    this.camera.position.lerp(this.desired, factor);
    this.camera.lookAt(this.look);
  }

  private derive(out: THREE.Vector3): void {
    // high and toward the home (left) side, looking down the lanes toward spawn
    const cx = this.center.x - 2.5;
    const cz = this.center.z;
    out.set(cx, 13.5, cz + 8.6);
    this.look.set(this.center.x + 1.5, 0.6, cz);
  }
}
