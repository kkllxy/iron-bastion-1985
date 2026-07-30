import * as THREE from 'three';

interface Particle {
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

// Two InstancedMesh pools keep particle cost flat regardless of hit rate.
// Sparks use additive blending for glow; dust uses normal blending.
export class EffectsSystem {
  readonly group = new THREE.Group();
  private readonly sparks: Particle[] = [];
  private readonly dust: Particle[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly dustMesh: THREE.InstancedMesh;
  private readonly rings: Ring[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private readonly dustGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private readonly ringGeo = new THREE.RingGeometry(0.5, 0.8, 28);
  private readonly sparkMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly dustMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  private readonly ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private readonly sparkCapacity: number;
  private readonly dustCapacity: number;

  constructor(sparkPool = 480, dustPool = 220) {
    this.sparkCapacity = sparkPool;
    this.dustCapacity = dustPool;
    this.sparkMesh = new THREE.InstancedMesh(this.sparkGeo, this.sparkMat, sparkPool);
    this.sparkMesh.count = 0;
    this.sparkMesh.frustumCulled = false;
    this.dustMesh = new THREE.InstancedMesh(this.dustGeo, this.dustMat, dustPool);
    this.dustMesh.count = 0;
    this.dustMesh.frustumCulled = false;
    this.group.add(this.sparkMesh, this.dustMesh);
  }

  spawnSpark(position: THREE.Vector3, color: string, count: number, power: number): void {
    this.color.set(color);
    for (let i = 0; i < count; i += 1) {
      const p = this.nextParticle(this.sparks, this.sparkCapacity);
      if (!p) break;
      const ang = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random() * 2.2;
      const spd = (1.5 + Math.random() * 3) * power * 3;
      p.px = position.x;
      p.py = position.y;
      p.pz = position.z;
      p.vx = Math.cos(ang) * spd;
      p.vy = up * power * 3.5;
      p.vz = Math.sin(ang) * spd;
      p.life = p.maxLife = 0.3 + Math.random() * 0.25;
      p.size = 0.5 + Math.random() * 0.8;
      p.r = this.color.r;
      p.g = this.color.g;
      p.b = this.color.b;
      p.gravity = 14;
    }
  }

  spawnDust(position: THREE.Vector3, color: string): void {
    this.color.set(color);
    for (let i = 0; i < 7; i += 1) {
      const p = this.nextParticle(this.dust, this.dustCapacity);
      if (!p) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.6 + Math.random() * 1.4;
      p.px = position.x;
      p.py = 0.2;
      p.pz = position.z;
      p.vx = Math.cos(ang) * spd;
      p.vy = 0.6 + Math.random() * 1.2;
      p.vz = Math.sin(ang) * spd;
      p.life = p.maxLife = 0.4 + Math.random() * 0.3;
      p.size = 0.8 + Math.random() * 0.8;
      p.r = this.color.r;
      p.g = this.color.g;
      p.b = this.color.b;
      p.gravity = 3;
    }
  }

  spawnRing(position: THREE.Vector3, color: string, maxScale: number, duration: number): void {
    const mat = this.ringMat.clone();
    mat.color.set(color);
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    mesh.position.y = 0.08;
    mesh.scale.setScalar(0.2);
    this.group.add(mesh);
    this.rings.push({ mesh, life: duration, maxLife: duration, maxScale });
  }

  private nextParticle(pool: Particle[], capacity: number): Particle | null {
    if (pool.length < capacity) {
      const p: Particle = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, size: 1, r: 1, g: 1, b: 1, gravity: 0 };
      pool.push(p);
      return p;
    }
    // reuse the particle closest to death
    let oldest = pool[0];
    for (const p of pool) if (p.life < oldest.life) oldest = p;
    return oldest;
  }

  update(delta: number): void {
    this.updatePool(this.sparks, this.sparkMesh, delta, true);
    this.updatePool(this.dust, this.dustMesh, delta, false);

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      ring.life -= delta;
      const t = 1 - ring.life / ring.maxLife;
      const scale = THREE.MathUtils.lerp(0.2, ring.maxScale, t);
      ring.mesh.scale.setScalar(scale);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
      if (ring.life <= 0) {
        this.group.remove(ring.mesh);
        (ring.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  private updatePool(pool: Particle[], mesh: THREE.InstancedMesh, delta: number, additive: boolean): void {
    let write = 0;
    for (const p of pool) {
      p.life -= delta;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * delta;
      p.px += p.vx * delta;
      p.py += p.vy * delta;
      p.pz += p.vz * delta;
      if (p.py < 0.05) {
        p.py = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const t = p.life / p.maxLife;
      const scale = p.size * (additive ? t * 1.2 : 0.6 + t * 0.6);
      this.dummy.position.set(p.px, p.py, p.pz);
      this.dummy.scale.setScalar(scale);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(write, this.dummy.matrix);
      this.color.setRGB(p.r, p.g, p.b);
      mesh.setColorAt(write, this.color);
      write += 1;
    }
    mesh.count = write;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.sparks.length = 0;
    this.dust.length = 0;
    this.sparkMesh.count = 0;
    this.dustMesh.count = 0;
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings.length = 0;
  }

  dispose(): void {
    this.clear();
    this.sparkGeo.dispose();
    this.dustGeo.dispose();
    this.ringGeo.dispose();
    this.sparkMat.dispose();
    this.dustMat.dispose();
    this.ringMat.dispose();
    this.sparkMesh.dispose();
    this.dustMesh.dispose();
  }
}
