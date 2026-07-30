import * as THREE from 'three';
import {
  DIR_VEC,
  DIR_YAW,
  Dir,
  ENEMY_DEFS,
  PALETTE,
  TANK,
  TILE_HEIGHTS,
  type EnemyKind,
  nearestLane,
} from '../game/config';
import type { Field } from './Field';

export interface MoveCtx {
  field: Field;
  rng: () => number;
  // true if another tank occupies the circle around (x,z)
  blockedByTank: (self: Tank, x: number, z: number) => void | boolean;
  playerPos: () => { x: number; z: number };
  basePos: () => { x: number; z: number };
}

// Shared geometries (one set for all tanks) to keep memory/draw cost low.
let GEO: {
  body: THREE.BoxGeometry;
  turret: THREE.BoxGeometry;
  barrel: THREE.CylinderGeometry;
  tread: THREE.BoxGeometry;
  ring: THREE.TorusGeometry;
} | null = null;

function ensureGeo(): NonNullable<typeof GEO> {
  if (!GEO) {
    GEO = {
      body: new THREE.BoxGeometry(1, 0.42, 1.3),
      turret: new THREE.BoxGeometry(0.7, 0.34, 0.7),
      barrel: new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8),
      tread: new THREE.BoxGeometry(0.26, 0.34, 1.42),
      ring: new THREE.TorusGeometry(0.78, 0.05, 8, 28),
    };
  }
  return GEO;
}

export abstract class Tank {
  readonly group = new THREE.Group();
  x = 0;
  z = 0;
  dir = Dir.N;
  speed = TANK.playerSpeed;
  hp = 1;
  maxHp = 1;
  alive = true;
  half = TANK.half;
  invincible = 0;
  frozen = 0;
  fireCooldown = 0;
  fireRequested = false;
  spawnAnim = 0;
  hitFlash = 0;
  readonly isPlayer: boolean;
  readonly kind: EnemyKind | 'player';
  bonus = false;

  protected bodyMat!: THREE.MeshStandardMaterial;
  protected trimMat!: THREE.MeshStandardMaterial;
  private shieldRing!: THREE.Mesh;
  private shieldMat!: THREE.MeshBasicMaterial;
  private lightMat!: THREE.MeshStandardMaterial;
  private readonly mats: THREE.Material[] = [];

  constructor(kind: EnemyKind | 'player', isPlayer: boolean) {
    this.kind = kind;
    this.isPlayer = isPlayer;
    this.buildMesh(kind);
  }

  protected abstract aiUpdate(dt: number, ctx: MoveCtx, elapsed: number): Dir | null;

  reset(x: number, z: number, dir: Dir): void {
    this.x = x;
    this.z = z;
    this.dir = dir;
    this.alive = true;
    this.invincible = TANK.respawnInvincible;
    this.spawnAnim = TANK.spawnAnim;
    this.fireCooldown = 0.6;
    this.hp = this.maxHp;
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.face(dir);
    this.group.scale.setScalar(1);
  }

  face(dir: Dir): void {
    this.dir = dir;
    this.group.rotation.y = DIR_YAW[dir];
  }

  damage(amount: number): boolean {
    if (!this.alive || this.invincible > 0 || this.spawnAnim > 0) return false;
    this.hp -= amount;
    this.hitFlash = 0.14;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  update(dt: number, ctx: MoveCtx, elapsed: number): void {
    if (!this.alive) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.spawnAnim > 0) this.spawnAnim -= dt;

    const frozen = this.frozen > 0;
    if (frozen) this.frozen -= dt;

    const desired = frozen ? null : this.aiUpdate(dt, ctx, elapsed);
    if (desired !== null) {
      this.face(desired);
      this.stepMovement(dt, ctx);
    }
    this.updateVisuals(dt, elapsed, frozen);
  }

  private stepMovement(dt: number, ctx: MoveCtx): void {
    const [vx, vz] = DIR_VEC[this.dir];
    const step = this.speed * dt;
    if (vx !== 0) {
      const nx = this.x + vx * step;
      if (!this.blocked(nx, this.z, ctx)) this.x = nx;
      const target = nearestLane(this.z);
      const nz = this.z + (target - this.z) * (1 - Math.exp(-TANK.turnSnapRate * dt));
      if (!this.blocked(this.x, nz, ctx)) this.z = nz;
    } else if (vz !== 0) {
      const nz = this.z + vz * step;
      if (!this.blocked(this.x, nz, ctx)) this.z = nz;
      const target = nearestLane(this.x);
      const nx = this.x + (target - this.x) * (1 - Math.exp(-TANK.turnSnapRate * dt));
      if (!this.blocked(nx, this.z, ctx)) this.x = nx;
    }
    this.group.position.x = this.x;
    this.group.position.z = this.z;
  }

  protected blocked(x: number, z: number, ctx: MoveCtx): boolean {
    if (ctx.field.tankBoxBlocked(x - this.half, z - this.half, x + this.half, z + this.half)) return true;
    if (ctx.blockedByTank(this, x, z)) return true;
    return false;
  }

  private updateVisuals(_dt: number, elapsed: number, frozen: boolean): void {
    // spawn scale-in
    if (this.spawnAnim > 0) {
      const k = 1 - this.spawnAnim / TANK.spawnAnim;
      this.group.scale.setScalar(THREE.MathUtils.clamp(k * 1.1, 0.1, 1));
    } else {
      this.group.scale.setScalar(1);
    }
    // hit flash
    const flash = this.hitFlash > 0 ? 1 : 0;
    this.bodyMat.emissive.setRGB(flash, flash, flash);
    this.bodyMat.emissiveIntensity = flash * 2.4;
    // bonus carrier strobe
    if (this.bonus) {
      const s = 0.5 + 0.5 * Math.sin(elapsed * 12);
      this.lightMat.emissiveIntensity = 1.0 + s * 2.0;
      this.lightMat.color.setRGB(1, 1, 1);
    } else {
      this.lightMat.emissiveIntensity = 0.8;
    }
    if (frozen) {
      this.bodyMat.color.lerp(new THREE.Color('#bfe6ff'), 0.4);
    }
    // shield ring
    const shieldOn = this.invincible > 0 || this.spawnAnim > 0;
    this.shieldRing.visible = shieldOn;
    if (shieldOn) {
      this.shieldRing.rotation.z = elapsed * 3;
      this.shieldMat.opacity = 0.4 + 0.3 * Math.sin(elapsed * 10);
    }
  }

  private buildMesh(kind: EnemyKind | 'player'): void {
    const geo = ensureGeo();
    let bodyColor: string;
    let trimColor: string;
    let barrelColor: string;
    if (kind === 'player') {
      bodyColor = PALETTE.player;
      trimColor = PALETTE.playerTrim;
      barrelColor = PALETTE.playerBarrel;
    } else {
      const def = ENEMY_DEFS[kind];
      bodyColor = def.body;
      trimColor = def.trim;
      barrelColor = def.barrel;
    }
    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.35 });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.4,
      metalness: 0.4,
      emissive: trimColor,
      emissiveIntensity: 0.15,
    });
    const barrelMat = new THREE.MeshStandardMaterial({ color: barrelColor, roughness: 0.5, metalness: 0.5 });
    const treadMat = new THREE.MeshStandardMaterial({ color: '#1c1f26', roughness: 0.7, metalness: 0.3 });

    const body = new THREE.Mesh(geo.body, this.bodyMat);
    body.position.y = 0.32;
    body.castShadow = true;
    body.receiveShadow = true;

    const turret = new THREE.Mesh(geo.turret, this.trimMat);
    turret.position.y = 0.62;
    turret.castShadow = true;

    const barrel = new THREE.Mesh(geo.barrel, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.6, -0.6);
    barrel.castShadow = true;

    const treadL = new THREE.Mesh(geo.tread, treadMat);
    treadL.position.set(-0.55, 0.2, 0);
    const treadR = treadL.clone();
    treadR.position.x = 0.55;
    treadL.castShadow = true;
    treadR.castShadow = true;

    this.lightMat = new THREE.MeshStandardMaterial({
      color: '#ff5a3c',
      emissive: '#ff7a3c',
      emissiveIntensity: 0.8,
      roughness: 0.4,
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.12), this.lightMat);
    tail.position.set(0, 0.4, 0.62);

    this.shieldMat = new THREE.MeshBasicMaterial({
      color: '#48baa7',
      transparent: true,
      opacity: 0.5,
    });
    this.shieldRing = new THREE.Mesh(geo.ring, this.shieldMat);
    this.shieldRing.rotation.x = Math.PI / 2;
    this.shieldRing.position.y = 0.5;
    this.shieldRing.visible = false;

    this.group.add(body, turret, barrel, treadL, treadR, tail, this.shieldRing);
    this.group.position.y = 0;
    this.mats.push(this.bodyMat, this.trimMat, barrelMat, treadMat, this.lightMat, this.shieldMat);
  }

  dispose(): void {
    // geometries are shared module singletons; dispose per-instance materials.
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}

export class PlayerTank extends Tank {
  firepower = 0; // 0..3
  private inputDir: Dir | null = null;
  private fireHeld = false;
  activeBullets = 0;

  constructor() {
    super('player', true);
    this.maxHp = 1;
    this.hp = 1;
    this.speed = TANK.playerSpeed;
  }

  setInput(dir: Dir | null, fire: boolean): void {
    this.inputDir = dir;
    this.fireHeld = fire;
  }

  maxBullets(): number {
    return this.firepower >= 2 ? 2 : 1;
  }

  bulletSpeed(): number {
    return this.firepower >= 1 ? TANK.bulletSpeed * 1.15 : TANK.bulletSpeed;
  }

  protected aiUpdate(_dt: number, _ctx: MoveCtx, _elapsed: number): Dir | null {
    if (this.fireHeld && this.fireCooldown <= 0 && this.activeBullets < this.maxBullets()) {
      this.fireRequested = true;
      this.fireCooldown = TANK.playerFireCooldown;
    }
    return this.inputDir;
  }

  upgradeFirepower(): boolean {
    if (this.firepower >= 3) return false;
    this.firepower += 1;
    return true;
  }
}

export class EnemyTank extends Tank {
  private decisionTimer = 0;
  private readonly def;
  private lastDir: Dir;

  constructor(kind: EnemyKind, bonus: boolean) {
    super(kind, false);
    this.def = ENEMY_DEFS[kind];
    this.bonus = bonus;
    this.maxHp = this.def.hp;
    this.hp = this.def.hp;
    this.speed = this.def.speed;
    this.lastDir = Dir.S;
  }

  protected aiUpdate(dt: number, ctx: MoveCtx, _elapsed: number): Dir | null {
    this.decisionTimer -= dt;
    const headBlocked = this.blocked(this.x + DIR_VEC[this.dir][0] * 0.2, this.z + DIR_VEC[this.dir][1] * 0.2, ctx);
    if (this.decisionTimer <= 0 || headBlocked) {
      this.dir = this.chooseDir(ctx);
      this.decisionTimer = 0.5 + ctx.rng() * 1.4;
    }
    // fire
    if (this.fireCooldown <= 0) {
      if (ctx.rng() < 0.5 || this.alignedWithTarget(ctx)) {
        this.fireRequested = true;
        this.fireCooldown = this.def.fireInterval * (0.7 + ctx.rng() * 0.7);
      } else {
        this.fireCooldown = this.def.fireInterval * 0.4;
      }
    }
    this.lastDir = this.dir;
    return this.dir;
  }

  bulletSpeed(): number {
    return this.def.bulletSpeed;
  }

  private alignedWithTarget(ctx: MoveCtx): boolean {
    const p = ctx.playerPos();
    const sameCol = Math.abs(this.x - p.x) < 0.7;
    const sameRow = Math.abs(this.z - p.z) < 0.7;
    if (this.dir === Dir.N || this.dir === Dir.S) return sameCol && p.z < this.z === (this.dir === Dir.N);
    return sameRow && p.x < this.x === (this.dir === Dir.W);
  }

  private chooseDir(ctx: MoveCtx): Dir {
    const dirs = [Dir.N, Dir.E, Dir.S, Dir.W];
    const free = dirs.filter((d) => {
      if (d === ((this.lastDir + 2) % 4)) return false; // avoid immediate reverse unless only option
      const nx = this.x + DIR_VEC[d][0] * 0.4;
      const nz = this.z + DIR_VEC[d][1] * 0.4;
      return !this.blocked(nx, nz, ctx);
    });
    const options = free.length > 0 ? free : dirs.filter((d) => {
      const nx = this.x + DIR_VEC[d][0] * 0.4;
      const nz = this.z + DIR_VEC[d][1] * 0.4;
      return !this.blocked(nx, nz, ctx);
    });
    if (options.length === 0) return this.lastDir;
    // bias toward target with probability `smart`
    if (ctx.rng() < this.def.smart) {
      const target = ctx.rng() < 0.5 ? ctx.basePos() : ctx.playerPos();
      let best = options[0];
      let bestDist = Infinity;
      for (const d of options) {
        const nx = this.x + DIR_VEC[d][0];
        const nz = this.z + DIR_VEC[d][1];
        const dist = (nx - target.x) ** 2 + (nz - target.z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      return best;
    }
    return options[Math.floor(ctx.rng() * options.length)];
  }
}

export function muzzleOffset(tank: Tank): { x: number; z: number; y: number } {
  const [vx, vz] = DIR_VEC[tank.dir];
  return { x: tank.x + vx * (tank.half + 0.15), z: tank.z + vz * (tank.half + 0.15), y: TILE_HEIGHTS.brick * 0.6 };
}
