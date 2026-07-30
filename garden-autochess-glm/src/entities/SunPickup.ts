import * as THREE from 'three';

// 阳光掉落物：缓慢飘落并停留，玩家点击/自动收集。点击价值由 Game 处理。
export class SunPickup {
  readonly group = new THREE.Group();
  readonly value: number;
  alive = true;
  collected = false;
  private age = 0;
  private settleY = 0.6;
  private readonly mesh: THREE.Mesh;
  private readonly halo: THREE.Mesh;

  constructor(origin: THREE.Vector3, value: number, settleY = 0.6) {
    this.value = value;
    this.settleY = settleY;
    this.group.position.copy(origin);

    const geo = new THREE.SphereGeometry(0.26, 14, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffe24a'),
      emissive: new THREE.Color('#ffae00'),
      emissiveIntensity: 0.7,
      roughness: 0.4,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    const haloGeo = new THREE.RingGeometry(0.3, 0.46, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe24a'),
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(haloGeo, haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = -0.5;
    this.group.add(this.halo);
  }

  get worldX(): number {
    return this.group.position.x;
  }

  update(delta: number, clock: number): void {
    this.age += delta;
    // 下落到停留高度
    if (this.group.position.y > this.settleY) {
      this.group.position.y -= 1.4 * delta;
      if (this.group.position.y < this.settleY) this.group.position.y = this.settleY;
    }
    this.mesh.rotation.y += delta * 2;
    const pulse = 1 + Math.sin(clock * 4 + this.age) * 0.06;
    this.mesh.scale.setScalar(pulse);
    this.halo.scale.setScalar(1 + Math.sin(clock * 3) * 0.1);
    // 一段时间后自动消失
    if (this.age > 14) this.alive = false;
  }

  collect(): void {
    this.collected = true;
    this.alive = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.halo.geometry.dispose();
    (this.halo.material as THREE.Material).dispose();
  }
}
