// Procedural material library: cold military palette, canvas-generated textures.
import * as THREE from 'three';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  return { c, ctx };
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, size: number, alpha: number, grain: number) {
  for (let i = 0; i < size * size * grain; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = Math.random() * 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export function makeConcreteTexture(): THREE.Texture {
  const size = 256;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#2a2d31';
  ctx.fillRect(0, 0, size, size);
  // expansion joints
  ctx.strokeStyle = 'rgba(15,17,19,0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,124,128,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i + 1, 0);
    ctx.lineTo(i + 1, size);
    ctx.moveTo(0, i + 1);
    ctx.lineTo(size, i + 1);
    ctx.stroke();
  }
  noise(ctx, size, 0.05, 0.5);
  // stains
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,12,14,0.5)');
    g.addColorStop(1, 'rgba(10,12,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c);
}

export function makeMetalPanelTexture(): THREE.Texture {
  const size = 256;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#3a3f44';
  ctx.fillRect(0, 0, size, size);
  // panels
  ctx.strokeStyle = 'rgba(18,20,22,0.95)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, size - 12, size - 12);
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, size - 36, size - 36);
  // rivets
  ctx.fillStyle = 'rgba(20,22,24,0.9)';
  const rivets = [16, size - 16];
  for (const rx of rivets) for (const ry of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(150,155,160,0.5)';
  for (const rx of rivets) for (const ry of rivets) {
    ctx.beginPath();
    ctx.arc(rx - 1, ry - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // vertical brushed streaks
  for (let i = 0; i < size; i += 2) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 20},${95 + Math.random() * 20},${100 + Math.random() * 20},0.05)`;
    ctx.fillRect(i, 0, 1, size);
  }
  noise(ctx, size, 0.04, 0.3);
  return tex(c);
}

export function makeHazardTexture(): THREE.Texture {
  const size = 128;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#1c1d20';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#c9a227';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  for (let i = -size; i < size; i += 26) {
    ctx.fillRect(i, -size, 13, size * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  return tex(c);
}

let cache: {
  concrete: THREE.Texture;
  metal: THREE.Texture;
  hazard: THREE.Texture;
  matConcrete: THREE.MeshStandardMaterial;
  matWall: THREE.MeshStandardMaterial;
  matMetal: THREE.MeshStandardMaterial;
  matHazard: THREE.MeshStandardMaterial;
  matDark: THREE.MeshStandardMaterial;
  matFloor: THREE.MeshStandardMaterial;
} | null = null;

export function materials() {
  if (cache) return cache;
  const concrete = makeConcreteTexture();
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  const metal = makeMetalPanelTexture();
  metal.wrapS = metal.wrapT = THREE.RepeatWrapping;
  const hazard = makeHazardTexture();
  hazard.wrapS = hazard.wrapT = THREE.RepeatWrapping;
  cache = {
    concrete,
    metal,
    hazard,
    matConcrete: new THREE.MeshStandardMaterial({ color: '#6a6f74', roughness: 0.9, metalness: 0.05 }),
    matWall: new THREE.MeshStandardMaterial({ color: '#4a4f55', map: metal.clone(), roughness: 0.62, metalness: 0.45 }),
    matMetal: new THREE.MeshStandardMaterial({ color: '#7c828a', map: metal, roughness: 0.5, metalness: 0.7 }),
    matHazard: new THREE.MeshStandardMaterial({ color: '#d9b53a', map: hazard, roughness: 0.7, metalness: 0.2 }),
    matDark: new THREE.MeshStandardMaterial({ color: '#22262a', roughness: 0.8, metalness: 0.3 }),
    matFloor: new THREE.MeshStandardMaterial({ color: '#3b3f44', map: concrete, roughness: 0.85, metalness: 0.08 }),
  };
  return cache;
}

export function disposeMaterials() {
  if (!cache) return;
  for (const m of Object.values(cache)) {
    if (m instanceof THREE.MeshStandardMaterial) m.dispose();
    else if (m instanceof THREE.Texture) m.dispose();
  }
  cache = null;
}
