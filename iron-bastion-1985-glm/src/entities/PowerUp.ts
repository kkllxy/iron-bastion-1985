import * as THREE from 'three';
import { POWER_DEFS, cellToWorldX, cellToWorldZ, type PowerKind } from '../game/config';

export class PowerUp {
  readonly group = new THREE.Group();
  readonly kind: PowerKind;
  readonly x: number;
  readonly z: number;
  readonly radius = 0.7;
  alive = true;
  private life = 13;
  private readonly disc: THREE.Mesh;
  private readonly icon: THREE.Mesh;
  private readonly ring: THREE.Mesh;

  constructor(kind: PowerKind, col: number, row: number) {
    this.kind = kind;
    const def = POWER_DEFS[kind];
    this.x = cellToWorldX(col);
    this.z = cellToWorldZ(row);
    this.group.position.set(this.x, 0.6, this.z);

    const discMat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.4,
      transparent: true,
      opacity: 0.9,
    });
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 6), discMat);
    this.disc.castShadow = true;
    this.group.add(this.disc);

    const iconTex = createIconTexture(def.glyph, def.color);
    this.icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false }),
    );
    this.icon.rotation.x = -Math.PI / 2;
    this.icon.position.y = 0.08;
    this.group.add(this.icon);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.7 }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);
  }

  update(dt: number, elapsed: number): void {
    if (!this.alive) return;
    this.life -= dt;
    this.group.rotation.y += dt * 1.6;
    this.group.position.y = 0.6 + Math.sin(elapsed * 3) * 0.12;
    const blink = this.life < 4 ? 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 12)) : 1;
    this.group.visible = blink > 0.3;
    if (this.life <= 0) this.alive = false;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * Math.abs(Math.sin(elapsed * 5));
  }

  dispose(): void {
    this.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      const map = (mat as THREE.MeshBasicMaterial)?.map;
      map?.dispose();
      mat?.dispose();
    });
  }
}

function createIconTexture(glyph: string, color: string): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = `bold ${size * 0.7}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillText(glyph, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
