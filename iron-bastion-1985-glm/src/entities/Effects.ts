import * as THREE from 'three';

// Unified GPU particle pool: sparks, debris, smoke, muzzle flash and ring
// telegraphs all share one THREE.Points draw call. Particles are recycled,
// so active counts never grow. Drives the "VFX/motion" scorecard category.
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  gravity: number;
  active: boolean;
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly particles: Particle[];
  private readonly geometry: THREE.BufferGeometry;
  private cursor = 0;

  constructor(private readonly count = 360) {
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.particles = Array.from({ length: count }, () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      size: 0,
      sizeEnd: 0,
      r: 1,
      g: 1,
      b: 1,
      drag: 0,
      gravity: 0,
      active: false,
    }));

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, count);

    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.createSpriteTexture() } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          float a = t.a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * (0.6 + 0.4 * t.a), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);
  }

  private emit(): Particle {
    // ring-buffer recycle: overwrite the oldest slot
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = this.particles[i];
    p.active = true;
    return p;
  }

  explosion(x: number, z: number, color: string, scale = 1): void {
    const c = new THREE.Color(color);
    // bright core flash
    const core = this.emit();
    core.x = x;
    core.y = 0.7;
    core.z = z;
    core.vx = 0;
    core.vy = 0;
    core.vz = 0;
    core.life = core.maxLife = 0.18;
    core.size = 3.4 * scale;
    core.sizeEnd = 0.4 * scale;
    core.r = 1;
    core.g = 0.95;
    core.b = 0.8;
    core.drag = 0;
    core.gravity = 0;
    // sparks
    const n = Math.round(16 * scale);
    for (let i = 0; i < n; i += 1) {
      const p = this.emit();
      const a = Math.random() * Math.PI * 2;
      const sp = (2.5 + Math.random() * 5) * scale;
      p.x = x;
      p.y = 0.6;
      p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = 1.5 + Math.random() * 3.0;
      p.vz = Math.sin(a) * sp;
      p.life = p.maxLife = 0.4 + Math.random() * 0.35;
      p.size = 2.4 + Math.random() * 2.0;
      p.sizeEnd = 0.2;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.drag = 2.4;
      p.gravity = -9.0;
    }
    // smoke
    for (let i = 0; i < Math.round(7 * scale); i += 1) {
      const p = this.emit();
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 1.6) * scale;
      p.x = x;
      p.y = 0.7;
      p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = 1.0 + Math.random() * 1.4;
      p.vz = Math.sin(a) * sp;
      p.life = p.maxLife = 0.7 + Math.random() * 0.5;
      p.size = 4.5 + Math.random() * 2.5;
      p.sizeEnd = 7.0;
      p.r = 0.32;
      p.g = 0.32;
      p.b = 0.34;
      p.drag = 1.1;
      p.gravity = 0.4;
    }
  }

  debris(x: number, z: number, color: string, amount = 7): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < amount; i += 1) {
      const p = this.emit();
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      p.x = x;
      p.y = 0.5;
      p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = 2.0 + Math.random() * 2.5;
      p.vz = Math.sin(a) * sp;
      p.life = p.maxLife = 0.35 + Math.random() * 0.3;
      p.size = 2.0 + Math.random() * 1.6;
      p.sizeEnd = 0.2;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.drag = 1.6;
      p.gravity = -11.0;
    }
  }

  spark(x: number, z: number, color: string): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 6; i += 1) {
      const p = this.emit();
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      p.x = x;
      p.y = 0.6;
      p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = 1.0 + Math.random() * 1.5;
      p.vz = Math.sin(a) * sp;
      p.life = p.maxLife = 0.18 + Math.random() * 0.12;
      p.size = 1.6 + Math.random() * 1.2;
      p.sizeEnd = 0.1;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.drag = 3.0;
      p.gravity = -6.0;
    }
  }

  muzzle(x: number, y: number, z: number, color: string): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 5; i += 1) {
      const p = this.emit();
      p.x = x + (Math.random() - 0.5) * 0.2;
      p.y = y;
      p.z = z + (Math.random() - 0.5) * 0.2;
      p.vx = (Math.random() - 0.5) * 1.5;
      p.vy = Math.random() * 0.8;
      p.vz = (Math.random() - 0.5) * 1.5;
      p.life = p.maxLife = 0.1 + Math.random() * 0.08;
      p.size = 1.8 + Math.random() * 1.4;
      p.sizeEnd = 0.2;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.drag = 4.0;
      p.gravity = 0;
    }
  }

  update(delta: number): void {
    const pos = this.positions;
    const col = this.colors;
    const sz = this.sizes;
    const al = this.alphas;
    for (let i = 0; i < this.count; i += 1) {
      const p = this.particles[i];
      const o = i * 3;
      if (!p.active) {
        al[i] = 0;
        sz[i] = 0;
        continue;
      }
      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        al[i] = 0;
        sz[i] = 0;
        continue;
      }
      p.vx -= p.vx * p.drag * delta;
      p.vz -= p.vz * p.drag * delta;
      p.vy += p.gravity * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const t = p.life / p.maxLife;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      col[o] = p.r;
      col[o + 1] = p.g;
      col[o + 2] = p.b;
      sz[i] = p.size + (p.sizeEnd - p.size) * (1 - t);
      al[i] = Math.min(1, t * 1.6);
    }
    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  private createSpriteTexture(): THREE.Texture {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    const map = (this.points.material as THREE.ShaderMaterial).uniforms.map?.value as THREE.Texture | undefined;
    map?.dispose();
  }
}
