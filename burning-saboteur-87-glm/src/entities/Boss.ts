import * as THREE from 'three';
import { GridMap } from '../systems/GridMap';

export type BossPart = 'podL' | 'podR' | 'core';

export interface BossContext {
  map: GridMap;
  playerX: number;
  playerZ: number;
  dt: number;
  rng: () => number;
  fireBullet: (x: number, z: number, dirX: number, dirZ: number, speed: number, damage: number, fromPlayer: boolean) => void;
}

const PART_HP: Record<BossPart, number> = { podL: 100, podR: 100, core: 140 };

export class Boss {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  alive = true;
  readonly parts: Record<BossPart, { hp: number; max: number; destroyed: boolean }> = {
    podL: { hp: PART_HP.podL, max: PART_HP.podL, destroyed: false },
    podR: { hp: PART_HP.podR, max: PART_HP.podR, destroyed: false },
    core: { hp: PART_HP.core, max: PART_HP.core, destroyed: false },
  };
  private phase = 1;
  private fireCd = 1.2;
  private chargeCd = 4;
  private charging = false;
  private chargeDir = new THREE.Vector3();
  private chargeTime = 0;
  private readonly meshMap: Record<BossPart, THREE.Object3D> = {} as never;
  private readonly coreLight: THREE.PointLight;
  private hurtTimer = 0;
  facing = 0;

  constructor(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.group.position.copy(this.pos);
    const steel = new THREE.MeshStandardMaterial({ color: '#52585f', roughness: 0.5, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.6, metalness: 0.6 });
    const hazard = new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.7, metalness: 0.3 });

    // legs
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.7), steel);
      leg.position.set(s * 0.7, 0.8, 0);
      leg.castShadow = true;
      this.group.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 1.0), dark);
      foot.position.set(s * 0.7, 0.15, 0.1);
      foot.castShadow = true;
      this.group.add(foot);
    }
    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 1.2), steel);
    torso.position.y = 2.1;
    torso.castShadow = true;
    this.group.add(torso);
    // head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), dark);
    head.position.set(0, 3.2, 0.1);
    head.castShadow = true;
    this.group.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff0000', emissiveIntensity: 1 }));
    eye.position.set(0, 3.25, 0.4);
    this.group.add(eye);

    // missile pods
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 12), hazard);
      pod.position.set(s * 1.15, 2.6, 0);
      pod.castShadow = true;
      this.group.add(pod);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 12), dark);
      cap.position.set(s * 1.15, 3.1, 0);
      this.group.add(cap);
      this.meshMap[s < 0 ? 'podL' : 'podR'] = pod;
    }
    // core reactor
    const coreMat = new THREE.MeshStandardMaterial({ color: '#39d0ff', emissive: '#0aa0ff', emissiveIntensity: 1.4, roughness: 0.3 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), coreMat);
    core.position.set(0, 2.2, 0.62);
    this.group.add(core);
    this.meshMap.core = core;
    this.coreLight = new THREE.PointLight('#39d0ff', 2.2, 8, 2);
    this.coreLight.position.set(0, 2.2, 0.8);
    this.group.add(this.coreLight);
  }

  reset(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.alive = true;
    this.phase = 1;
    this.fireCd = 1.2;
    this.chargeCd = 4;
    this.charging = false;
    this.hurtTimer = 0;
    for (const k of ['podL', 'podR', 'core'] as BossPart[]) {
      this.parts[k].hp = this.parts[k].max;
      this.parts[k].destroyed = false;
      this.meshMap[k].visible = true;
    }
  }

  get dead(): boolean {
    return this.parts.core.destroyed;
  }

  get progress(): string {
    const rem = (this.parts.podL.destroyed ? 0 : 1) + (this.parts.podR.destroyed ? 0 : 1) + (this.parts.core.destroyed ? 0 : 1);
    return `${3 - rem}/3`;
  }

  // hit test for a world point; returns the part hit if any (prefers nearest facing part)
  hitTest(originX: number, originZ: number, dirX: number, dirZ: number, maxDist: number): { part: BossPart; dist: number } | null {
    const candidates: { part: BossPart; x: number; z: number; r: number }[] = [];
    if (!this.parts.podL.destroyed) candidates.push({ part: 'podL', x: this.pos.x - 1.15, z: this.pos.z, r: 0.75 });
    if (!this.parts.podR.destroyed) candidates.push({ part: 'podR', x: this.pos.x + 1.15, z: this.pos.z, r: 0.75 });
    if (!this.parts.core.destroyed) candidates.push({ part: 'core', x: this.pos.x, z: this.pos.z + 0.6, r: 0.8 });
    let best: { part: BossPart; dist: number } | null = null;
    for (const c of candidates) {
      // ray-circle intersection in XZ
      const lx = c.x - originX;
      const lz = c.z - originZ;
      const proj = lx * dirX + lz * dirZ;
      if (proj < 0 || proj > maxDist) continue;
      const perp = Math.hypot(lx - proj * dirX, lz - proj * dirZ);
      if (perp <= c.r) {
        if (!best || proj < best.dist) best = { part: c.part, dist: proj };
      }
    }
    return best;
  }

  damagePart(part: BossPart, amount: number): boolean {
    if (this.parts[part].destroyed) return false;
    this.parts[part].hp -= amount;
    this.hurtTimer = 0.12;
    if (this.parts[part].hp <= 0) {
      this.parts[part].destroyed = true;
      this.meshMap[part].visible = false;
      if (part === 'core') {
        this.alive = false;
        return true;
      }
      if (this.parts.podL.destroyed && this.parts.podR.destroyed) this.phase = 2;
    }
    return false;
  }

  update(ctx: BossContext): void {
    if (!this.alive) return;
    // face player
    const dx = ctx.playerX - this.pos.x;
    const dz = ctx.playerZ - this.pos.z;
    this.facing = Math.atan2(dz, dx);
    this.group.rotation.y = this.facing;

    this.fireCd -= ctx.dt;
    this.chargeCd -= ctx.dt;
    if (this.hurtTimer > 0) this.hurtTimer -= ctx.dt;

    // charge attack
    if (!this.charging && this.chargeCd <= 0 && this.phase === 2) {
      this.charging = true;
      this.chargeTime = 0.9;
      const d = Math.hypot(dx, dz) || 1;
      this.chargeDir.set(dx / d, 0, dz / d);
      this.chargeCd = 5;
    }
    if (this.charging) {
      this.chargeTime -= ctx.dt;
      const sp = 9 * ctx.dt;
      const nx = this.pos.x + this.chargeDir.x * sp;
      const nz = this.pos.z + this.chargeDir.z * sp;
      const res = ctx.map.resolveCircle(nx, nz, 0.9);
      this.pos.x = res.x;
      this.pos.z = res.z;
      this.group.position.copy(this.pos);
      if (this.chargeTime <= 0) this.charging = false;
    }

    // shooting
    if (this.fireCd <= 0) {
      if (this.phase === 1) {
        // alternating pod volleys
        const useL = !this.parts.podL.destroyed;
        const useR = !this.parts.podR.destroyed;
        if (useL || useR) {
          for (let i = -1; i <= 1; i++) {
            const baseAng = Math.atan2(dz, dx) + i * 0.18;
            const px = useL ? this.pos.x - 1.15 : this.pos.x + 1.15;
            ctx.fireBullet(px, this.pos.z, Math.cos(baseAng), Math.sin(baseAng), 12, 14, false);
          }
        }
        this.fireCd = 1.5;
      } else {
        // core spread
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(dz, dx) + (i - (n - 1) / 2) * 0.22;
          ctx.fireBullet(this.pos.x, this.pos.z, Math.cos(a), Math.sin(a), 14, 16, false);
        }
        this.fireCd = 1.2;
      }
    }

    if (this.coreLight) {
      this.coreLight.intensity = this.parts.core.destroyed ? 0 : 1.8 + Math.sin(performance.now() * 0.006) * 0.6;
    }
  }

  // ram damage when charging into player
  get isCharging(): boolean {
    return this.charging;
  }

  get ramDamage(): number {
    return 22;
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
