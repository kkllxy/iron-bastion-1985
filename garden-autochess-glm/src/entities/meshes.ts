import * as THREE from 'three';
import type { EnemyDef, PlantId } from '../game/types';

// 程序化 Q 版模型：用基本几何体堆出有辨识度的变异植物与污染怪物，不依赖外部素材。
// 全部返回 THREE.Group；颜色与形变按 id 区分，保证联动/升星时一眼可认。

export interface PlantPalette {
  body: string;
  accent: string;
  glow: string;
}

export const PLANT_PALETTE: Record<PlantId, PlantPalette> = {
  sunflower: { body: '#ffd23a', accent: '#7a4a14', glow: '#ffe680' },
  peashooter: { body: '#5fbf3a', accent: '#2c6a18', glow: '#bfff80' },
  firepepper: { body: '#ff5a2a', accent: '#7a1a06', glow: '#ffb060' },
  icemoss: { body: '#6ad0ff', accent: '#1a5a8a', glow: '#bfeeff' },
  nutwall: { body: '#caa46a', accent: '#7a5a2a', glow: '#ffe2a8' },
  vine: { body: '#3aa55a', accent: '#1a5a2a', glow: '#9be8a0' },
  toadstool: { body: '#d83a3a', accent: '#fff0d0', glow: '#ff8a8a' },
  sporeshroom: { body: '#9a5ad8', accent: '#e8d8ff', glow: '#c8a0ff' },
  aloezap: { body: '#4ac08a', accent: '#ffe24a', glow: '#a0ffe0' },
  onionpult: { body: '#b87adb', accent: '#5a2a7a', glow: '#e8c0ff' },
  steamdande: { body: '#e8f4ff', accent: '#9ad0ff', glow: '#ffffff' },
  sunpumpkin: { body: '#ff8a2a', accent: '#6a3a0a', glow: '#ffd080' },
};

function pot(accent: string): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a4a2a'), roughness: 0.9 }),
  );
  base.position.y = 0.11;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.05, 8, 16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.7 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  g.add(ring);
  return g;
}

function eye(color = '#15110a'): THREE.Group {
  const g = new THREE.Group();
  const w = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffffff'), roughness: 0.4 }),
  );
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
  );
  p.position.z = 0.05;
  g.add(w, p);
  return g;
}

export function makePlantMesh(id: PlantId, star: number): THREE.Group {
  const pal = PLANT_PALETTE[id];
  const g = new THREE.Group();
  g.add(pot(pal.accent));
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.body), roughness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.accent), roughness: 0.6 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.glow),
    emissive: new THREE.Color(pal.glow),
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  const starScale = 0.85 + star * 0.16;

  const head = new THREE.Group();
  head.name = 'head';

  const placeEyes = (y: number, z: number, sep: number) => {
    const le = eye();
    const re = eye();
    le.position.set(-sep, y, z);
    re.position.set(sep, y, z);
    head.add(le, re);
  };

  switch (id) {
    case 'sunflower': {
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.26 * starScale, 14, 12), accentMat);
      center.position.y = 0.5;
      head.add(center);
      const petalGeo = new THREE.ConeGeometry(0.12, 0.3, 8);
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, bodyMat);
        petal.position.set(Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28);
        petal.rotation.z = -Math.cos(a) * 0.5;
        petal.rotation.x = Math.sin(a) * 0.5;
        head.add(petal);
      }
      placeEyes(0.5, 0.22, 0.09);
      break;
    }
    case 'peashooter':
    case 'firepepper':
    case 'icemoss': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28 * starScale, 14, 12), bodyMat);
      dome.position.y = 0.5;
      dome.scale.y = 1.1;
      head.add(dome);
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.22, 10), bodyMat);
      snout.rotation.z = Math.PI / 2;
      snout.position.set(0.22, 0.52, 0);
      head.add(snout);
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), accentMat);
      hole.position.set(0.33, 0.52, 0);
      head.add(hole);
      if (id === 'firepepper') {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), glowMat);
        flame.position.set(0, 0.78, 0);
        head.add(flame);
      } else if (id === 'icemoss') {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), glowMat);
        shard.position.set(0, 0.8, 0);
        head.add(shard);
      }
      placeEyes(0.54, 0.24, 0.08);
      break;
    }
    case 'nutwall': {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.36 * starScale, 16, 14), bodyMat);
      nut.position.y = 0.5;
      nut.scale.y = 1.05;
      head.add(nut);
      placeEyes(0.52, 0.3, 0.11);
      // 嘴
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 10), accentMat);
      mouth.position.set(0, 0.4, 0.34);
      head.add(mouth);
      break;
    }
    case 'vine': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8), bodyMat);
      stalk.position.y = 0.5;
      head.add(stalk);
      const leafGeo = new THREE.SphereGeometry(0.14, 10, 8);
      for (let i = 0; i < 4; i += 1) {
        const leaf = new THREE.Mesh(leafGeo, bodyMat);
        leaf.scale.set(1, 0.5, 1);
        const a = (i / 4) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.16, 0.55 + i * 0.08, Math.sin(a) * 0.16);
        head.add(leaf);
      }
      const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), accentMat);
      thorn.position.set(0.12, 0.78, 0);
      thorn.rotation.z = -0.6;
      head.add(thorn);
      break;
    }
    case 'toadstool':
    case 'sporeshroom': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0e6d0'), roughness: 0.7 }));
      stalk.position.y = 0.42;
      head.add(stalk);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3 * starScale, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
      cap.position.y = 0.58;
      cap.scale.y = 0.8;
      head.add(cap);
      // 蘑菇斑点
      const dotMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.accent), roughness: 0.5 });
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dotMat);
        dot.position.set(Math.cos(a) * 0.18, 0.66, Math.sin(a) * 0.18);
        head.add(dot);
      }
      placeEyes(0.4, 0.11, 0.06);
      break;
    }
    case 'aloezap': {
      const leafGeo = new THREE.ConeGeometry(0.1, 0.5, 6);
      for (let i = 0; i < 6; i += 1) {
        const leaf = new THREE.Mesh(leafGeo, bodyMat);
        const a = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.12, 0.45, Math.sin(a) * 0.12);
        leaf.rotation.z = Math.cos(a) * 0.5;
        leaf.rotation.x = Math.sin(a) * 0.5;
        head.add(leaf);
      }
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMat);
      spark.position.y = 0.7;
      head.add(spark);
      placeEyes(0.32, 0.1, 0.06);
      break;
    }
    case 'onionpult': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8), accentMat);
      stalk.position.set(-0.1, 0.5, 0);
      stalk.rotation.z = 0.3;
      head.add(stalk);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), accentMat);
      arm.position.set(0.08, 0.72, 0);
      arm.rotation.z = -0.2;
      head.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22 * starScale, 14, 12), bodyMat);
      bulb.position.y = 0.46;
      head.add(bulb);
      const ammo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bodyMat);
      ammo.position.set(0.22, 0.74, 0);
      head.add(ammo);
      placeEyes(0.46, 0.18, 0.08);
      break;
    }
    case 'steamdande': {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28 * starScale, 16, 14), glowMat);
      puff.position.y = 0.56;
      head.add(puff);
      // 蒸汽丝
      const wispMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeaff'), transparent: true, opacity: 0.7 });
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), wispMat);
        w.position.set(Math.cos(a) * 0.26, 0.7, Math.sin(a) * 0.26);
        head.add(w);
      }
      placeEyes(0.5, 0.24, 0.08);
      break;
    }
    case 'sunpumpkin': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.36 * starScale, 18, 14), bodyMat);
      body.position.y = 0.5;
      body.scale.y = 0.9;
      head.add(body);
      // 南瓜棱
      const ribMat = accentMat;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 12, Math.PI), ribMat);
        rib.position.set(Math.cos(a) * 0.33, 0.5, Math.sin(a) * 0.33);
        rib.rotation.y = a;
        rib.rotation.x = Math.PI / 2;
        head.add(rib);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a6a2a') }));
      stem.position.y = 0.82;
      head.add(stem);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat);
      halo.position.y = 0.92;
      head.add(halo);
      placeEyes(0.5, 0.3, 0.11);
      break;
    }
  }

  head.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) {
      m.castShadow = true;
    }
  });
  g.add(head);
  g.userData.head = head;
  return g;
}

export function makeEnemyMesh(def: EnemyDef): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), roughness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.accent), roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 16, 14), bodyMat);
  body.position.y = def.radius * 0.8;
  body.scale.y = 0.85;
  body.castShadow = true;
  g.add(body);

  // 怪物眼睛（污染感）
  const eyeWhite = new THREE.MeshStandardMaterial({ color: new THREE.Color('#dfffe0'), roughness: 0.3 });
  const eyePupil = new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a0a0a') });
  const eyeCount = def.isBoss ? 3 : 2;
  for (let i = 0; i < eyeCount; i += 1) {
    const a = (i / eyeCount) * Math.PI * 1.1 - Math.PI * 0.55;
    const ex = Math.cos(a) * def.radius * 0.5;
    const ez = Math.sin(a) * def.radius * 0.5;
    const w = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 0.22, 10, 8), eyeWhite);
    w.position.set(ex, def.radius * 0.95, ez + def.radius * 0.6);
    g.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 0.1, 8, 6), eyePupil);
    p.position.set(ex, def.radius * 0.95, ez + def.radius * 0.85);
    g.add(p);
  }

  // 嘴/尖刺
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(def.radius * 0.3, def.radius * 0.08, 6, 12, Math.PI), accentMat);
  mouth.position.set(0, def.radius * 0.55, def.radius * 0.85);
  mouth.rotation.x = Math.PI;
  g.add(mouth);

  // 头顶污染突起
  const hornGeo = new THREE.ConeGeometry(def.radius * 0.18, def.radius * 0.5, 6);
  for (let i = 0; i < (def.isBoss ? 4 : 2); i += 1) {
    const a = (i / (def.isBoss ? 4 : 2)) * Math.PI * 2 + 0.5;
    const horn = new THREE.Mesh(hornGeo, accentMat);
    horn.position.set(Math.cos(a) * def.radius * 0.5, def.radius * 1.4, Math.sin(a) * def.radius * 0.5);
    horn.rotation.z = Math.cos(a) * 0.3;
    horn.rotation.x = Math.sin(a) * 0.3;
    g.add(horn);
  }

  g.scale.setScalar(def.scale);
  g.userData.body = body;
  g.userData.mouth = mouth;
  return g;
}
