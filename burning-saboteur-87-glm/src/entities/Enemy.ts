import * as THREE from 'three';
import { GridMap } from '../systems/GridMap';
import { visibility, hearing } from '../game/Vision';
import type { EnemyKind } from '../game/types';

export interface EnemyContext {
  map: GridMap;
  playerX: number;
  playerZ: number;
  playerStealthed: boolean;
  playerBoxed: boolean;
  hunted: boolean;
  hasLastKnown: boolean;
  lastKnownX: number;
  lastKnownZ: number;
  dt: number;
  rng: () => number;
  fireBullet: (x: number, z: number, dirX: number, dirZ: number, speed: number, damage: number, fromPlayer: boolean) => void;
  noiseRadius: number; // player noise this frame (for hearing)
  noiseX: number;
  noiseZ: number;
}

export interface EnemySpawnShot {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  damage: number;
}

const KIND_CFG: Record<EnemyKind, { fov: number; range: number; hp: number; speed: number; hearing: number; fireCooldown: number; bulletDamage: number; color: string }> = {
  soldier: { fov: Math.PI / 2.4, range: 9, hp: 40, speed: 2.0, hearing: 7, fireCooldown: 1.3, bulletDamage: 12, color: '#5a6b3a' },
  camera: { fov: Math.PI / 3.2, range: 12, hp: 30, speed: 0, hearing: 0, fireCooldown: 99, bulletDamage: 0, color: '#2a2f36' },
  heavy: { fov: Math.PI / 2.8, range: 8, hp: 120, speed: 1.4, hearing: 6, fireCooldown: 1.8, bulletDamage: 20, color: '#3a3f4a' },
  sniper: { fov: Math.PI / 12, range: 22, hp: 35, speed: 0, hearing: 4, fireCooldown: 2.4, bulletDamage: 34, color: '#3d2f2a' },
};

function makeConeGeometry(fov: number, range: number): THREE.BufferGeometry {
  const segs = 18;
  const verts: number[] = [0, 0, 0];
  for (let i = 0; i <= segs; i++) {
    const t = -fov / 2 + (fov * i) / segs;
    verts.push(Math.cos(t) * range, 0, Math.sin(t) * range);
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    idx.push(0, i + 1, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Enemy {
  readonly group = new THREE.Group();
  readonly kind: EnemyKind;
  readonly pos = new THREE.Vector3();
  facing: number;
  fov: number;
  range: number;
  hp: number;
  maxHp: number;
  alive = true;
  stunned = 0; // tranq takedown stun timer
  private readonly cfg: typeof KIND_CFG.soldier;
  private readonly cone: THREE.Mesh;
  private readonly coneMat: THREE.MeshBasicMaterial;
  private readonly body: THREE.Group;
  private readonly patrol: [number, number][];
  private wpIndex = 0;
  private fireCd = 0;
  private sweepT = 0; // for cameras
  private laser?: THREE.Mesh;
  private lockTimer = 0;
  private hitFlash = 0;

  constructor(kind: EnemyKind, x: number, z: number, facing: number, fov?: number, range?: number, patrol?: [number, number][]) {
    this.kind = kind;
    this.cfg = KIND_CFG[kind];
    this.pos.set(x, 0, z);
    this.facing = facing;
    this.fov = fov ?? this.cfg.fov;
    this.range = range ?? this.cfg.range;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.patrol = patrol ?? [];
    this.group.position.copy(this.pos);
    this.body = this.buildBody(kind);
    this.group.add(this.body);
    this.coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#33e0a0'), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    this.cone = new THREE.Mesh(makeConeGeometry(this.fov, this.range), this.coneMat);
    this.cone.rotation.y = -Math.PI / 2; // align so cone local +x faces facing
    this.cone.position.y = 0.05;
    this.cone.rotation.order = 'YXZ';
    this.cone.rotation.y = 0;
    this.group.add(this.cone);
    if (kind === 'sniper') {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, this.range, 0, 0], 3));
      this.laser = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0 }));
      this.laser.position.y = 1.0;
      this.group.add(this.laser);
    }
    this.updateConeRotation();
  }

  private buildBody(kind: EnemyKind): THREE.Group {
    const g = new THREE.Group();
    const cfg = this.cfg;
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.65, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.5, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: '#d9a23a', roughness: 0.6, metalness: 0.3 });

    if (kind === 'camera') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 8), dark);
      pole.position.y = 1.0;
      g.add(pole);
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), mat);
      mount.position.y = 2.0;
      g.add(mount);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.2, metalness: 0.8, emissive: '#ff2222', emissiveIntensity: 0.5 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 2.0, 0.35);
      g.add(lens);
      return g;
    }

    const scale = kind === 'heavy' ? 1.3 : 1.0;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * scale, 0.6 * scale, 4, 10), mat);
    torso.position.y = 0.78 * scale;
    torso.castShadow = true;
    g.add(torso);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 16, 12), dark);
    helmet.position.y = 1.36 * scale;
    helmet.castShadow = true;
    g.add(helmet);
    if (kind === 'heavy') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.36), accent);
      plate.position.y = 0.9;
      plate.castShadow = true;
      g.add(plate);
    }
    if (kind === 'sniper') {
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), dark);
      rifle.position.set(0, 1.0, 0.5);
      g.add(rifle);
    } else {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.45), dark);
      gun.position.set(0.22, 0.86, 0.3);
      g.add(gun);
    }
    // visor stripe (enemy identifier)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.12), new THREE.MeshStandardMaterial({ color: '#ff5a3a', emissive: '#7a1a08', emissiveIntensity: 0.5 }));
    visor.position.set(0.04, 1.4 * scale, 0.16);
    g.add(visor);
    return g;
  }

  private updateConeRotation() {
    // cone is built facing +x; rotate group so +x aligns with facing (atan2(z,x))
    this.cone.rotation.y = -this.facing;
  }

  setAlertColor(level: 'hidden' | 'spotted' | 'hunted' | 'searching') {
    const c = level === 'hunted' ? '#ff2a2a' : level === 'spotted' || level === 'searching' ? '#ffcf33' : '#33e0a0';
    this.coneMat.color.set(c);
    this.coneMat.opacity = level === 'hidden' ? 0.14 : level === 'hunted' ? 0.28 : 0.22;
  }

  // returns visibility 0..1 contributed this frame, and may fire bullets
  update(ctx: EnemyContext): { visibility: number; noise: number; shot?: EnemySpawnShot } {
    let vis = 0;
    let noise = 0;
    if (!this.alive || this.stunned > 0) {
      if (this.stunned > 0) this.stunned -= ctx.dt;
      this.cone.visible = false;
      if (this.laser) (this.laser.material as THREE.MeshBasicMaterial).opacity = 0;
      return { visibility: 0, noise: 0 };
    }
    this.cone.visible = true;

    if (this.kind === 'camera') {
      // sweep
      this.sweepT += ctx.dt;
      this.facing = Math.sin(this.sweepT * 0.7) * 1.1 + this.facing0();
      this.updateConeRotation();
    }

    vis = visibility({
      map: ctx.map,
      eyeX: this.pos.x,
      eyeZ: this.pos.z,
      facing: this.facing,
      fov: this.fov,
      range: this.range,
      targetX: ctx.playerX,
      targetZ: ctx.playerZ,
      stealthed: ctx.playerStealthed,
      boxed: ctx.playerBoxed,
    });

    // hearing
    if (this.cfg.hearing > 0 && ctx.noiseRadius > 0) {
      const h = hearing(this.pos.x, this.pos.z, ctx.noiseX, ctx.noiseZ, Math.max(this.cfg.hearing, ctx.noiseRadius));
      if (h > 0.25) noise = h;
    }

    // movement
    if (this.cfg.speed > 0 && this.patrol.length > 0) {
      let target: [number, number];
      if (ctx.hunted && ctx.hasLastKnown) {
        target = [ctx.lastKnownX, ctx.lastKnownZ];
      } else {
        target = this.patrol[this.wpIndex];
      }
      const dx = target[0] - this.pos.x;
      const dz = target[1] - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        if (ctx.hunted && ctx.hasLastKnown) {
          // reached last known: pause (search handled globally)
        } else {
          this.wpIndex = (this.wpIndex + 1) % this.patrol.length;
        }
      } else {
        const sp = this.cfg.speed * (ctx.hunted ? 1.6 : 1) * dt60(ctx.dt);
        const nx = this.pos.x + (dx / d) * sp;
        const nz = this.pos.z + (dz / d) * sp;
        const res = ctx.map.resolveCircle(nx, nz, 0.4);
        this.pos.x = res.x;
        this.pos.z = res.z;
        if (!ctx.hunted) this.facing = Math.atan2(dz, dx);
        else this.facing = Math.atan2(ctx.playerZ - this.pos.z, ctx.playerX - this.pos.x);
        this.updateConeRotation();
      }
    }

    this.group.position.copy(this.pos);
    this.body.rotation.y = this.facing;

    // firing
    let shot: EnemySpawnShot | undefined;
    if (this.fireCd > 0) this.fireCd -= ctx.dt;
    const canShoot = this.kind !== 'camera';
    if (canShoot && vis > 0.15 && this.fireCd <= 0 && ctx.dt > 0) {
      if (this.kind === 'sniper') {
        this.lockTimer += ctx.dt;
        if (this.laser) (this.laser.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, this.lockTimer / 1.2) * 0.7;
        if (this.lockTimer > 1.1) {
          this.fireCd = this.cfg.fireCooldown;
          this.lockTimer = 0;
          if (this.laser) (this.laser.material as THREE.MeshBasicMaterial).opacity = 0;
          const dx = ctx.playerX - this.pos.x;
          const dz = ctx.playerZ - this.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          shot = { x: this.pos.x, z: this.pos.z, dirX: dx / d, dirZ: dz / d, speed: 30, damage: this.cfg.bulletDamage };
        }
      } else {
        this.fireCd = this.cfg.fireCooldown + ctx.rng() * 0.3;
        const dx = ctx.playerX - this.pos.x;
        const dz = ctx.playerZ - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const spread = (ctx.rng() - 0.5) * 0.18;
        const ca = Math.cos(spread);
        const sa = Math.sin(spread);
        const dirX = (dx / d) * ca - (dz / d) * sa;
        const dirZ = (dx / d) * sa + (dz / d) * ca;
        shot = { x: this.pos.x, z: this.pos.z, dirX, dirZ, speed: 18, damage: this.cfg.bulletDamage };
      }
    } else if (this.kind === 'sniper' && vis <= 0.05) {
      this.lockTimer = 0;
      if (this.laser) (this.laser.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= ctx.dt;
      (this.body.children[0] as THREE.Mesh).material instanceof THREE.MeshStandardMaterial &&
        ((this.body.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set('#551111');
    }
    return { visibility: vis, noise, shot };
  }

  private facing0(): number {
    return this._facing0;
  }
  private _facing0 = 0;
  setBaseFacing(f: number) {
    this._facing0 = f;
    this.facing = f;
    this.updateConeRotation();
  }

  damage(amount: number, silent: boolean): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.cone.visible = false;
      if (this.laser) (this.laser.material as THREE.MeshBasicMaterial).opacity = 0;
      this.group.rotation.z = Math.PI / 2; // topple
      this.group.position.y = 0.2;
      return true;
    }
    if (silent) {
      this.stunned = 6.0;
      this.cone.visible = false;
    }
    return false;
  }

  // takedown: silent KO if adjacent
  canTakeDown(px: number, pz: number, range: number): boolean {
    if (!this.alive || this.stunned > 0) return false;
    const d = Math.hypot(this.pos.x - px, this.pos.z - pz);
    return d <= range;
  }

  knockOut() {
    this.alive = false;
    this.cone.visible = false;
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y = 0.2;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}

function dt60(dt: number) {
  return dt * 60;
}
