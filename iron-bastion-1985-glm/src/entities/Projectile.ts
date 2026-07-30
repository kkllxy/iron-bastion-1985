import * as THREE from 'three';
import { DIR_VEC, Dir, TANK } from '../game/config';
import { worldToCell } from '../game/config';
import type { Effects } from './Effects';
import type { Field, ShootResult } from './Field';
import type { Tank } from './Tank';

export interface BulletOutcome {
  result: ShootResult | 'tank' | 'bullet';
  tank?: Tank;
  x: number;
  z: number;
}

export class Bullet {
  readonly group = new THREE.Group();
  x: number;
  z: number;
  readonly dir: Dir;
  readonly speed: number;
  readonly power: number; // 0 normal, 1+ can be used for steel-break flag
  readonly owner: 'player' | 'enemy';
  alive = true;
  private life = TANK.bulletLife;
  private readonly core: THREE.Mesh;
  private readonly coreMat: THREE.MeshStandardMaterial;

  constructor(
    owner: 'player' | 'enemy',
    x: number,
    z: number,
    dir: Dir,
    speed: number,
    destroysSteel: boolean,
    color: string,
  ) {
    this.owner = owner;
    this.x = x;
    this.z = z;
    this.dir = dir;
    this.speed = speed;
    this.power = destroysSteel ? 1 : 0;
    this.coreMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.4,
      roughness: 0.3,
    });
    this.core = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), this.coreMat);
    // orient along travel direction (capsule axis is Y by default)
    this.core.rotation.z = Math.PI / 2;
    this.group.add(this.core);
    this.group.position.set(x, 0.55, z);
    this.group.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
  }

  update(dt: number, field: Field, tanks: Tank[], effects: Effects): BulletOutcome | null {
    if (!this.alive) return null;
    const [vx, vz] = DIR_VEC[this.dir];
    const travel = this.speed * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.28));
    const stepLen = travel / steps;
    for (let i = 0; i < steps; i += 1) {
      this.x += vx * stepLen;
      this.z += vz * stepLen;
      this.group.position.x = this.x;
      this.group.position.z = this.z;
      // field cell
      const { col, row } = worldToCell(this.x, this.z);
      const result = field.shootCell(col, row, this.power >= 1, effects);
      if (result !== 'pass') {
        this.kill();
        return { result, x: this.x, z: this.z };
      }
      // tanks
      for (const tank of tanks) {
        if (!tank.alive || tank === undefined) continue;
        if (tank.isPlayer && this.owner !== 'enemy') continue;
        if (!tank.isPlayer && this.owner !== 'player') continue;
        if (this.hits(tank)) {
          this.kill();
          return { result: 'tank', tank, x: this.x, z: this.z };
        }
      }
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return { result: 'pass', x: this.x, z: this.z };
    }
    return null;
  }

  private hits(tank: Tank): boolean {
    // ignore during spawn/invincible spawn window so bullets don't pop on shields
    if (tank.spawnAnim > 0) return false;
    const dx = Math.abs(this.x - tank.x);
    const dz = Math.abs(this.z - tank.z);
    return dx < tank.half + 0.1 && dz < tank.half + 0.1;
  }

  private kill(): void {
    this.alive = false;
    this.group.visible = false;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMat.dispose();
  }
}
