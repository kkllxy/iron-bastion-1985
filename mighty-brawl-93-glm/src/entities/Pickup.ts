import * as THREE from 'three';
import type { PickupKind } from '../game/types';
import { PICKUP_COLORS } from '../game/levels';

export class Pickup {
  readonly group = new THREE.Group();
  readonly radius = 0.55;
  readonly kind: PickupKind;
  active = true;

  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(kind: PickupKind, position: THREE.Vector3) {
    this.kind = kind;
    const color = PICKUP_COLORS[kind];
    this.geometry = kind === 'health' ? new THREE.SphereGeometry(0.26, 14, 10) : new THREE.IcosahedronGeometry(0.28, 0);
    this.material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    this.group.add(mesh);
    // glow halo
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.5, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.3;
    this.group.add(halo);
    this.group.position.copy(position);
    this.group.position.y = 0.7;
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.group.rotation.y += delta * 2.2;
    this.group.position.y = 0.7 + Math.sin(elapsed * 3 + this.kind.length) * 0.14;
  }

  collect(): void {
    this.active = false;
    this.group.visible = false;
  }

  reset(): void {
    this.active = true;
    this.group.visible = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    (this.group.children[1] as THREE.Mesh).geometry.dispose();
    ((this.group.children[1] as THREE.Mesh).material as THREE.Material).dispose();
  }
}
