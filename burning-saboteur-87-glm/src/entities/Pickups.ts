import * as THREE from 'three';

export type PickupType = 'card1' | 'card2' | 'ration' | 'explosive' | 'hostage';

export interface Pickup {
  type: PickupType;
  pos: THREE.Vector3;
  collected: boolean;
  group: THREE.Group;
  spin: THREE.Mesh;
}

const COLORS: Record<PickupType, number> = {
  card1: 0xf5c542,
  card2: 0xff5a3a,
  ration: 0x4fd06a,
  explosive: 0xff3b3b,
  hostage: 0x9ad0ff,
};

export const PICKUP_LABEL: Record<PickupType, string> = {
  card1: '1 级钥匙卡',
  card2: '2 级钥匙卡',
  ration: '口粮（回血）',
  explosive: 'C4 炸药',
  hostage: '被囚人质',
};

export function makePickup(type: PickupType, x: number, z: number): Pickup {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  if (type === 'hostage') {
    const skin = new THREE.MeshStandardMaterial({ color: '#caa07a', roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#6a7488', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), cloth);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
    head.position.y = 0.95;
    group.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: COLORS[type] }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
    return { type, pos: group.position, collected: false, group, spin: ring as THREE.Mesh };
  }

  const color = new THREE.Color(COLORS[type]);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 });
  let geo: THREE.BufferGeometry;
  if (type === 'card1' || type === 'card2') geo = new THREE.BoxGeometry(0.5, 0.32, 0.04);
  else if (type === 'ration') geo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  else geo = new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.7;
  mesh.castShadow = true;
  group.add(mesh);

  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  group.add(halo);

  const light = new THREE.PointLight(color, 0.8, 3.5, 2);
  light.position.y = 0.8;
  group.add(light);

  return { type, pos: group.position, collected: false, group, spin: mesh };
}
