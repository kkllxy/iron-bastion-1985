import * as THREE from 'three';
import type { DamageType, ProjectileKind, StatusApplier } from '../game/types';

// 投射物沿 +X 飞行（线型），或抛物线落到目标 X（lob）。命中由 CombatSystem 解析。
export class Projectile {
  readonly group = new THREE.Group();
  readonly lane: number;
  readonly mode: 'line' | 'lob';
  readonly speed: number;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly aoeCells: number;
  readonly status: StatusApplier | undefined;
  readonly pierce: boolean;
  readonly color: string;
  readonly kind: ProjectileKind;
  alive = true;
  // lob 落点
  readonly targetX: number;
  private readonly originX: number;
  private t = 0;
  private readonly dur: number;
  private readonly mesh: THREE.Mesh;

  constructor(opts: {
    origin: THREE.Vector3;
    lane: number;
    speed: number;
    damage: number;
    type: ProjectileKind;
    damageType: DamageType;
    mode: 'line' | 'lob';
    aoeCells?: number;
    status?: StatusApplier;
    pierce?: boolean;
    color: string;
    targetX?: number;
  }) {
    this.lane = opts.lane;
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.damageType = opts.damageType;
    this.kind = opts.type;
    this.mode = opts.mode;
    this.aoeCells = opts.aoeCells ?? 0;
    this.status = opts.status;
    this.pierce = opts.pierce ?? false;
    this.color = opts.color;
    this.targetX = opts.targetX ?? 999;
    this.group.position.copy(opts.origin);
    this.originX = opts.origin.x;
    const dist = Math.max(1, Math.abs(this.targetX - this.originX));
    this.dur = dist / Math.max(1, opts.speed);

    const geo = this.kind === 'lob' ? new THREE.SphereGeometry(0.22, 10, 8) : new THREE.SphereGeometry(0.16, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.color) });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.group.add(this.mesh);
  }

  update(delta: number): void {
    if (this.mode === 'line') {
      this.group.position.x += this.speed * delta;
      // 小幅浮动让飞行有动感
      this.t += delta;
      this.mesh.position.y = 0.55 + Math.sin(this.t * 18) * 0.04;
    } else {
      this.t += delta;
      const k = Math.min(1, this.t / this.dur);
      this.group.position.x = THREE.MathUtils.lerp(this.originX, this.targetX, k);
      // 抛物线弧高
      this.mesh.position.y = 0.4 + Math.sin(k * Math.PI) * 1.6;
      if (k >= 1) {
        // 落地，交给 CombatSystem 做爆炸；标记到达
        this.alive = false;
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
