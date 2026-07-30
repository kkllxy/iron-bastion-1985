import * as THREE from 'three';

interface Effect {
  group: THREE.Group;
  update: (dt: number) => boolean; // returns false when done
}

// Lightweight pooled VFX: expanding ring + flash + debris sprites.
export class Effects {
  readonly group = new THREE.Group();
  private readonly active: Effect[] = [];

  explosion(x: number, z: number, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0.6, z);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.4 * scale, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ffd86a', transparent: true, opacity: 1 }),
    );
    g.add(flash);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    const light = new THREE.PointLight('#ffb24a', 6 * scale, 8 * scale, 2);
    light.position.y = 0.8;
    g.add(light);
    // debris
    const debris: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff8a3a' : '#3a3a3a' }),
      );
      const a = (i / 8) * Math.PI * 2;
      d.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3);
      g.add(d);
      debris.push(d);
    }
    this.group.add(g);
    let t = 0;
    this.active.push({
      group: g,
      update: (dt) => {
        t += dt;
        const p = t / 0.6;
        flash.scale.setScalar(1 + p * 5);
        (flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p);
        ring.scale.setScalar(1 + p * 7);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - p);
        light.intensity = Math.max(0, 6 * scale * (1 - p));
        for (const d of debris) {
          d.position.y += dt * 4 * (1 - p);
          d.position.x += dt * 2 * (Math.random() - 0.5);
        }
        return p < 1;
      },
    });
  }

  hitSpark(x: number, z: number, color = '#ffe27a') {
    const g = new THREE.Group();
    g.position.set(x, 1.0, z);
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    g.add(s);
    this.group.add(g);
    let t = 0;
    this.active.push({
      group: g,
      update: (dt) => {
        t += dt;
        const p = t / 0.18;
        s.scale.setScalar(1 + p * 3);
        (s.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p);
        return p < 1;
      },
    });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.update(dt)) {
        this.group.remove(e.group);
        e.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else if (mat) mat.dispose();
        });
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.active) {
      this.group.remove(e.group);
      e.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    }
    this.active.length = 0;
  }
}
