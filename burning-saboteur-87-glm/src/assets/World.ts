// Builds level geometry (floor, instanced walls, exit pad) from a GridMap.
import * as THREE from 'three';
import { materials } from './Materials';
import { GridMap } from '../systems/GridMap';
import { gridToWorld } from '../game/levels';

export interface BuiltWorld {
  group: THREE.Group;
  exitPosition: THREE.Vector3;
  exitCell: { col: number; row: number };
  playerStart: THREE.Vector3;
}

export function findChar(grid: string[], ch: string): { col: number; row: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf(ch);
    if (c >= 0) return { col: c, row: r };
  }
  return null;
}

export function buildWorld(grid: string[], map: GridMap): BuiltWorld {
  const group = new THREE.Group();
  const mat = materials();

  // --- floor ---
  const cols = map.cols;
  const rows = map.rows;
  const width = cols * map.cell;
  const depth = rows * map.cell;
  const floorTex = mat.concrete.clone();
  floorTex.needsUpdate = true;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(cols / 2, rows / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#3b3f44',
    map: floorTex,
    roughness: 0.88,
    metalness: 0.08,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // grid lines overlay (subtle tactical look)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2f6f76, transparent: true, opacity: 0.12 });
  const linePts: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const x = map.originX + c * map.cell;
    linePts.push(x, 0.02, map.originZ, x, 0.02, map.originZ + depth);
  }
  for (let r = 0; r <= rows; r++) {
    const z = map.originZ + r * map.cell;
    linePts.push(map.originX, 0.02, z, map.originX + width, 0.02, z);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  // --- walls (instanced) ---
  const wallCells: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map.isWallCol(c, r)) wallCells.push({ col: c, row: r });
    }
  }
  const wallH = 2.6;
  const wallGeo = new THREE.BoxGeometry(map.cell, wallH, map.cell);
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#4a4f55',
    map: mat.metal.clone(),
    roughness: 0.62,
    metalness: 0.5,
  });
  (wallMat.map as THREE.Texture).repeat.set(1, 1);
  const inst = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < wallCells.length; i++) {
    const { col, row } = wallCells[i];
    const center = map.cellCenter(col, row);
    dummy.position.set(center.x, wallH / 2, center.z);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);

  // --- perimeter trim (hazard baseboards) for flavor, thin instanced boxes along outer walls ---
  // (kept light; skip if too many)
  // --- exit door ---
  const exitCell = findChar(grid, 'X') ?? { col: cols - 1, row: Math.floor(rows / 2) };
  const exitCenter = map.cellCenter(exitCell.col, exitCell.row);
  const exitPos = new THREE.Vector3(exitCenter.x, 0, exitCenter.z);

  const doorMat = new THREE.MeshStandardMaterial({ color: '#1b6e3a', emissive: '#0c5', emissiveIntensity: 0.0, roughness: 0.5, metalness: 0.4 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(map.cell * 0.9, wallH * 0.92, 0.3), doorMat);
  door.position.set(exitCenter.x, wallH * 0.46, exitCenter.z);
  door.castShadow = true;
  door.userData.isExit = true;
  group.add(door);

  const padGeo = new THREE.RingGeometry(map.cell * 0.28, map.cell * 0.46, 40);
  const padMat = new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(exitCenter.x, 0.04, exitCenter.z);
  pad.userData.isExitPad = true;
  group.add(pad);

  // --- player start ---
  const startCell = findChar(grid, 'P') ?? { col: 2, row: 2 };
  const startCenter = gridToWorld(grid, startCell.col, startCell.row);
  const playerStart = new THREE.Vector3(startCenter.x, 0, startCenter.z);

  return { group, exitPosition: exitPos, exitCell, playerStart };
}
