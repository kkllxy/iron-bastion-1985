import * as THREE from 'three';
import { FIELD } from '../game/config';

const TRAUMA_MAX = 1;
const TRAUMA_DECAY = 1.5;
const MAX_OFFSET = 0.6;
const MAX_ROLL = 0.12;

function pseudoNoise(t: number, seed: number): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export class CameraRig {
  private trauma = 0;
  private time = 0;
  private readonly elevation = THREE.MathUtils.degToRad(62); // from horizon
  private readonly dir = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3(0, 0, 0);
  private distance = 24;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  // Frame the whole battlefield (square FIELD) inside the viewport, whatever
  // the aspect ratio. Portrait mobile is width-limited so we use the smaller FOV.
  fit(width: number, height: number, margin = 1.04): void {
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = width / height;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const half = (FIELD / 2) * margin;
    // Field depth foreshortens with the tilt, so width is the binding constraint
    // in portrait; height in landscape. Fit the field half-size into each FOV.
    const dW = half / Math.tan(fovH / 2);
    const dV = half / Math.tan(fovV / 2);
    this.distance = Math.max(dW, dV);
    this.dir.set(0, Math.sin(this.elevation), Math.cos(this.elevation)).normalize();
    this.applyBase();
  }

  snap(): void {
    this.applyBase();
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(TRAUMA_MAX, this.trauma + amount);
  }

  update(delta: number, reducedMotion: boolean): void {
    this.time += delta;
    this.applyBase();
    if (reducedMotion) return;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * delta);
    if (this.trauma <= 0) return;
    const shake = this.trauma * this.trauma;
    const freq = this.time * 30;
    this.camera.position.x += MAX_OFFSET * shake * pseudoNoise(freq, 1);
    this.camera.position.y += MAX_OFFSET * shake * pseudoNoise(freq, 2);
    this.camera.rotation.z += MAX_ROLL * shake * pseudoNoise(freq, 3);
  }

  private applyBase(): void {
    this.desired.copy(this.dir).multiplyScalar(this.distance);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.lookAt);
  }
}
