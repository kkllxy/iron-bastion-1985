import * as THREE from 'three';
import { GridMap } from '../systems/GridMap';

export interface Bullet {
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
  damage: number;
  fromPlayer: boolean;
  life: number;
  alive: boolean;
}

const PLAYER_BULLET_COLOR = new THREE.Color('#ffe27a');
const ENEMY_BULLET_COLOR = new THREE.Color('#ff5a3a');

export class Projectiles {
  readonly group = new THREE.Group();
  private readonly pool: Bullet[] = [];
  private readonly geo = new THREE.SphereGeometry(0.12, 8, 6);

  spawn(x: number, z: number, dirX: number, dirZ: number, speed: number, damage: number, fromPlayer: boolean) {
    let b = this.pool.find((p) => !p.alive);
    if (!b) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(this.geo, mat);
      this.group.add(mesh);
      b = { mesh, vx: 0, vz: 0, damage: 0, fromPlayer: false, life: 0, alive: false };
      this.pool.push(b);
    }
    b.alive = true;
    b.vx = dirX * speed;
    b.vz = dirZ * speed;
    b.damage = damage;
    b.fromPlayer = fromPlayer;
    b.life = 2.5;
    (b.mesh.material as THREE.MeshBasicMaterial).color.copy(fromPlayer ? PLAYER_BULLET_COLOR : ENEMY_BULLET_COLOR);
    b.mesh.position.set(x, 1.0, z);
    b.mesh.visible = true;
  }

  // returns bullets that need hit-checks (alive, fromPlayer / enemy)
  update(dt: number, map: GridMap): Bullet[] {
    const live: Bullet[] = [];
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.life -= dt;
      const px = b.mesh.position.x;
      const pz = b.mesh.position.z;
      const nx = px + b.vx * dt;
      const nz = pz + b.vz * dt;
      if (b.life <= 0 || map.segmentBlocked(px, pz, nx, nz)) {
        b.alive = false;
        b.mesh.visible = false;
        continue;
      }
      b.mesh.position.set(nx, 1.0, nz);
      live.push(b);
    }
    return live;
  }

  kill(b: Bullet) {
    b.alive = false;
    b.mesh.visible = false;
  }

  clear() {
    for (const b of this.pool) {
      b.alive = false;
      b.mesh.visible = false;
    }
  }

  dispose() {
    for (const b of this.pool) {
      (b.mesh.material as THREE.Material).dispose();
    }
    this.geo.dispose();
  }
}
