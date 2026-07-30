import * as THREE from 'three';

// ponytail: arc projectile with a parabola; no physics engine for one lobbed bottle.
export class Projectile {
  readonly group = new THREE.Group();
  readonly damage: number;
  alive = true;
  private readonly velocity = new THREE.Vector3();
  private life = 0;
  private readonly maxLife: number;
  private readonly targetY: number;
  private readonly spin = new THREE.Vector3();
  private readonly material: THREE.MeshStandardMaterial;

  constructor(origin: THREE.Vector3, target: THREE.Vector3, damage: number, color = '#9ad36b') {
    this.damage = damage;
    this.targetY = Math.max(0.2, target.y);
    const flat = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
    const flightTime = Math.max(0.5, Math.min(1.6, flat.length() / 9));
    this.maxLife = flightTime + 0.2;
    this.velocity.set(flat.x / flightTime, this.arcVelocity(origin.y, this.targetY, flightTime), flat.z / flightTime);
    this.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);

    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 6, 10), this.material);
    body.castShadow = true;
    this.group.add(body);
    // neck for "bottle" read
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), this.material);
    neck.position.y = 0.24;
    this.group.add(neck);
    this.group.position.copy(origin);
  }

  private arcVelocity(y0: number, y1: number, t: number): number {
    // solve apex so projectile lands at y1 after time t: y = y0 + v*t - 0.5*g*t^2
    const g = 18;
    return (y1 - y0 + 0.5 * g * t * t) / t;
  }

  update(delta: number): void {
    this.life += delta;
    this.velocity.y -= 18 * delta;
    this.group.position.addScaledVector(this.velocity, delta);
    this.group.rotation.x += this.spin.x * delta;
    this.group.rotation.y += this.spin.y * delta;
    if (this.life >= this.maxLife || this.group.position.y <= 0.05) this.alive = false;
  }

  dispose(): void {
    (this.group.children[0] as THREE.Mesh).geometry.dispose();
    (this.group.children[1] as THREE.Mesh).geometry.dispose();
    this.material.dispose();
  }
}
