import * as THREE from 'three';
import { TUNING } from '../game/types';

export class CameraRig {
  private readonly offset = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private shake = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.offset.set(0, TUNING.cameraHeight, TUNING.cameraDistance);
  }

  snapTo(target: THREE.Vector3) {
    this.desired.copy(target).add(this.offset);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(target.x, target.y + 0.6, target.z);
  }

  addShake(amount: number) {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  update(dt: number, target: THREE.Vector3, lag: number, hunted: boolean) {
    const hunt = hunted ? 1.06 : 1.0;
    this.desired.set(target.x * hunt, target.y + this.offset.y, target.z + this.offset.z);
    const a = 1 - Math.pow(lag, dt * 60);
    this.camera.position.lerp(this.desired, a);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(target.x, target.y + 0.6, target.z);
    if (hunted) this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, TUNING.cameraFov + 6, 0.08);
    else this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, TUNING.cameraFov, 0.08);
    this.camera.updateProjectionMatrix();
  }
}
