import * as THREE from 'three';
import {
  CELL,
  GRID,
  HALF,
  PALETTE,
  TILE_HEIGHTS,
  Tile,
  cellToWorldX,
  cellToWorldZ,
} from '../game/config';
import { parseMap, type ParsedLevel } from '../game/levels';
import type { Effects } from './Effects';

const TANK_SOLID = new Set<Tile>([Tile.Border, Tile.Brick, Tile.Steel, Tile.Water, Tile.Base]);

export type ShootResult =
  | 'pass' // water / tree / empty — bullet continues
  | 'brick' // brick destroyed, bullet dies
  | 'steelBlock' // steel/border stopped the bullet
  | 'steelBreak' // steel destroyed by max firepower
  | 'base'; // base destroyed

export class Field {
  readonly group = new THREE.Group();
  grid: Tile[][] = [];
  parsed!: ParsedLevel;
  baseAlive = true;

  private brickMesh?: THREE.InstancedMesh;
  private steelMesh?: THREE.InstancedMesh;
  private waterMaterial?: THREE.MeshStandardMaterial;
  private readonly brickIndex = new Map<string, number>();
  private readonly steelIndex = new Map<string, number>();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private reinforced = false;

  private baseGroup = new THREE.Group();
  private alarmRing?: THREE.Mesh;
  private baseCore?: THREE.MeshStandardMaterial;
  private sharedTextures: THREE.Texture[] = [];

  private static readonly WHITE = new THREE.Color('#ffffff');
  private static readonly STEEL_TINT = new THREE.Color('#9aa6c0');

  constructor() {
    this.group.add(this.baseGroup);
  }

  build(rows: string[]): void {
    this.disposeTiles();
    this.parsed = parseMap(rows);
    this.grid = this.parsed.grid.map((r) => r.slice());
    this.baseAlive = true;
    this.reinforced = false;

    this.group.add(this.makeFloor());
    this.buildBorder();
    this.buildBricks();
    this.buildSteel();
    this.buildWater();
    this.buildTrees();
    this.buildBase();
  }

  tileAt(col: number, row: number): Tile {
    if (col < 0 || row < 0 || col >= GRID || row >= GRID) return Tile.Border;
    return this.grid[row][col];
  }

  tankBoxBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
    const c0 = Math.floor((x0 + HALF) / CELL);
    const c1 = Math.floor((x1 + HALF) / CELL);
    const r0 = Math.floor((z0 + HALF) / CELL);
    const r1 = Math.floor((z1 + HALF) / CELL);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (TANK_SOLID.has(this.tileAt(c, r))) return true;
      }
    }
    return false;
  }

  // A bullet at (x,z) hits a cell. Mutates the grid + visuals, spawns VFX,
  // returns the resolution for the bullet.
  shootCell(col: number, row: number, destroysSteel: boolean, effects: Effects): ShootResult {
    const tile = this.tileAt(col, row);
    const x = cellToWorldX(col);
    const z = cellToWorldZ(row);
    switch (tile) {
      case Tile.Brick: {
        if (this.reinforced && this.isGuardCell(col, row)) {
          effects.spark(x, z, '#cfd6e6');
          return 'steelBlock';
        }
        this.clearCell(col, row, this.brickMesh, this.brickIndex);
        this.grid[row][col] = Tile.Empty;
        effects.debris(x, z, PALETTE.brick, 8);
        effects.spark(x, z, '#e6a06a');
        return 'brick';
      }
      case Tile.Steel: {
        if (destroysSteel) {
          this.clearCell(col, row, this.steelMesh, this.steelIndex);
          this.grid[row][col] = Tile.Empty;
          effects.debris(x, z, PALETTE.steel, 6);
          effects.spark(x, z, '#cfd6e6');
          return 'steelBreak';
        }
        effects.spark(x, z, '#dfe6f2');
        return 'steelBlock';
      }
      case Tile.Border:
        effects.spark(x, z, '#dfe6f2');
        return 'steelBlock';
      case Tile.Base:
        this.destroyBase(effects);
        return 'base';
      default:
        return 'pass'; // water / tree / empty
    }
  }

  // Shovel powerup: reinforce the base's brick guard ring so bullets can't
  // eat through it while active. Visual tint communicates the steel plating.
  bastion(on: boolean): void {
    this.reinforced = on;
    this.tintGuards(on);
  }

  private isGuardCell(col: number, row: number): boolean {
    const { col: bc, row: br } = this.parsed.base;
    return (
      (col === bc && row === br - 1) ||
      (row === br && (col === bc - 1 || col === bc + 1))
    );
  }

  private tintGuards(steel: boolean): void {
    if (!this.brickMesh) return;
    const color = steel ? Field.STEEL_TINT : Field.WHITE;
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (!this.isGuardCell(c, r)) continue;
        const idx = this.brickIndex.get(`${c},${r}`);
        if (idx !== undefined) this.brickMesh.setColorAt(idx, color);
      }
    }
    if (this.brickMesh.instanceColor) this.brickMesh.instanceColor.needsUpdate = true;
  }

  setAlarm(on: boolean): void {
    if (this.alarmRing) this.alarmRing.visible = on;
  }

  private clearCell(col: number, row: number, mesh: THREE.InstancedMesh | undefined, index: Map<string, number>): void {
    const key = `${col},${row}`;
    const i = index.get(key);
    if (i !== undefined && mesh) {
      mesh.setMatrixAt(i, this.zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private destroyBase(effects: Effects): void {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    this.baseGroup.visible = false;
    effects.explosion(cellToWorldX(this.parsed.base.col), cellToWorldZ(this.parsed.base.row), '#ff7a3c', 1.6);
    effects.explosion(cellToWorldX(this.parsed.base.col), cellToWorldZ(this.parsed.base.row), '#ffd66b', 1.1);
  }

  update(_delta: number, elapsed: number): void {
    if (this.waterMaterial) {
      const t = elapsed;
      this.waterMaterial.map!.offset.set((t * 0.03) % 1, (t * 0.02) % 1);
      this.waterMaterial.emissiveIntensity = 0.35 + Math.sin(t * 2.2) * 0.12;
    }
    if (this.alarmRing?.visible) {
      const m = this.alarmRing.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + Math.abs(Math.sin(elapsed * 7)) * 0.5;
    }
    if (this.baseCore && this.baseAlive) {
      this.baseCore.emissiveIntensity = 0.55 + Math.sin(elapsed * 3) * 0.18;
    }
  }

  private makeFloor(): THREE.Mesh {
    const tex = this.canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.floor;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = PALETTE.floorLine;
      ctx.lineWidth = 2;
      for (let i = 0; i <= s; i += s / GRID) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
      ctx.strokeStyle = PALETTE.floorTrim;
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, s - 6, s - 6);
      // subtle warm noise speckle for material life
      for (let i = 0; i < 140; i += 1) {
        ctx.fillStyle = `rgba(240,180,41,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    });
    const geo = new THREE.PlaneGeometry(GRID * CELL, GRID * CELL);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.04 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildBorder(): void {
    const cells: Array<{ col: number; row: number }> = [];
    for (let i = 0; i < GRID; i += 1) {
      cells.push({ col: i, row: 0 });
      cells.push({ col: i, row: GRID - 1 });
      cells.push({ col: 0, row: i });
      cells.push({ col: GRID - 1, row: i });
    }
    const geo = new THREE.BoxGeometry(CELL, TILE_HEIGHTS.border, CELL);
    const mat = this.steelMaterial(true);
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeTranslation(cellToWorldX(c.col), TILE_HEIGHTS.border / 2, cellToWorldZ(c.row));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  private buildBricks(): void {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (this.grid[r][c] === Tile.Brick) cells.push({ col: c, row: r });
      }
    }
    if (cells.length === 0) return;
    const geo = new THREE.BoxGeometry(CELL * 0.98, TILE_HEIGHTS.brick, CELL * 0.98);
    const mat = this.brickMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeTranslation(cellToWorldX(c.col), TILE_HEIGHTS.brick / 2, cellToWorldZ(c.row));
      mesh.setMatrixAt(i, m);
      this.brickIndex.set(`${c.col},${c.row}`, i);
    });
    mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < cells.length; i += 1) mesh.setColorAt(i, Field.WHITE);
    this.brickMesh = mesh;
    this.group.add(mesh);
  }

  private buildSteel(): void {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (this.grid[r][c] === Tile.Steel) cells.push({ col: c, row: r });
      }
    }
    if (cells.length === 0) return;
    const geo = new THREE.BoxGeometry(CELL * 0.98, TILE_HEIGHTS.steel, CELL * 0.98);
    const mat = this.steelMaterial(false);
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeTranslation(cellToWorldX(c.col), TILE_HEIGHTS.steel / 2, cellToWorldZ(c.row));
      mesh.setMatrixAt(i, m);
      this.steelIndex.set(`${c.col},${c.row}`, i);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.steelMesh = mesh;
    this.group.add(mesh);
  }

  private buildWater(): void {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (this.grid[r][c] === Tile.Water) cells.push({ col: c, row: r });
      }
    }
    if (cells.length === 0) return;
    const tex = this.canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(63,166,184,0.5)';
      ctx.lineWidth = 3;
      for (let y = 0; y < s; y += 16) {
        ctx.beginPath();
        for (let x = 0; x <= s; x += 4) {
          ctx.lineTo(x, y + Math.sin(x * 0.3) * 3);
        }
        ctx.stroke();
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BoxGeometry(CELL, TILE_HEIGHTS.water, CELL);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.water,
      map: tex,
      emissive: PALETTE.waterHi,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0.92,
    });
    this.waterMaterial = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeTranslation(cellToWorldX(c.col), TILE_HEIGHTS.water / 2, cellToWorldZ(c.row));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  private buildTrees(): void {
    const cells: Array<{ col: number; row: number }> = [];
    for (let r = 0; r < GRID; r += 1) {
      for (let c = 0; c < GRID; c += 1) {
        if (this.grid[r][c] === Tile.Tree) cells.push({ col: c, row: r });
      }
    }
    if (cells.length === 0) return;
    // a lumpy canopy: two stacked flattened icosahedra per cell
    const geo = new THREE.IcosahedronGeometry(CELL * 0.62, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.tree,
      emissive: PALETTE.treeHi,
      emissiveIntensity: 0.12,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length * 2);
    mesh.castShadow = true;
    mesh.renderOrder = 9; // drawn over tanks so forest hides them (classic mechanic)
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();
    cells.forEach((c, i) => {
      s.set(1, 0.7, 1);
      m.compose(new THREE.Vector3(cellToWorldX(c.col), 0.95, cellToWorldZ(c.row)), q, s);
      mesh.setMatrixAt(i * 2, m);
      s.set(0.7, 0.5, 0.7);
      m.compose(new THREE.Vector3(cellToWorldX(c.col) + 0.2, 1.35, cellToWorldZ(c.row) - 0.15), q, s);
      mesh.setMatrixAt(i * 2 + 1, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  private buildBase(): void {
    const { col, row } = this.parsed.base;
    const x = cellToWorldX(col);
    const z = cellToWorldZ(row);
    this.baseGroup.clear();
    this.baseGroup.position.set(x, 0, z);

    const tex = this.canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = PALETTE.baseBody;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(240,180,41,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, s - 12, s - 12);
      // emblem star
      ctx.fillStyle = PALETTE.baseEmblem;
      ctx.beginPath();
      const cx = s / 2;
      const cy = s / 2;
      const spikes = 5;
      const outer = s * 0.28;
      const inner = outer * 0.45;
      for (let i = 0; i < spikes * 2; i += 1) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.9, TILE_HEIGHTS.base, CELL * 0.9),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 }),
    );
    body.position.y = TILE_HEIGHTS.base / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.baseGroup.add(body);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({
        color: PALETTE.baseEmblem,
        emissive: PALETTE.baseEmblem,
        emissiveIntensity: 0.6,
      }),
    );
    core.position.y = TILE_HEIGHTS.base + 0.2;
    this.baseCore = core.material as THREE.MeshStandardMaterial;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: '#6b7080', metalness: 0.6, roughness: 0.4 }),
    );
    pole.position.y = TILE_HEIGHTS.base + 0.05;
    this.baseGroup.add(pole, core);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(CELL * 0.6, CELL * 0.72, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.danger, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    this.alarmRing = ring;
    this.baseGroup.add(ring);
  }

  private brickMaterial(): THREE.MeshStandardMaterial {
    const map = this.canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = PALETTE.brick;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = PALETTE.brickMortar;
      const rows = 5;
      const bh = s / rows;
      const bw = s / 3;
      for (let r = 0; r < rows; r += 1) {
        const offset = r % 2 === 0 ? 0 : bw / 2;
        ctx.fillRect(0, r * bh - 1, s, 2);
        for (let c = -1; c < 4; c += 1) {
          ctx.fillRect((c * bw + offset) % s - 1, r * bh, 2, bh);
        }
      }
      ctx.fillStyle = PALETTE.brick;
      for (let i = 0; i < 30; i += 1) {
        const sh = Math.random() * 0.15;
        ctx.fillStyle = `rgba(0,0,0,${sh})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 2);
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.0 });
  }

  private steelMaterial(border: boolean): THREE.MeshStandardMaterial {
    const map = this.canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = border ? '#5a6172' : PALETTE.steel;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = PALETTE.steelEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, s - 8, s - 8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s / 2, 6);
      ctx.lineTo(s / 2, s - 6);
      ctx.moveTo(6, s / 2);
      ctx.lineTo(s - 6, s / 2);
      ctx.stroke();
      // rivets
      ctx.fillStyle = border ? '#3a4050' : PALETTE.steelEdge;
      const rv = 3;
      const m = 12;
      ctx.beginPath();
      for (const [px, py] of [
        [m, m],
        [s - m, m],
        [m, s - m],
        [s - m, s - m],
      ]) {
        ctx.moveTo(px + rv, py);
        ctx.arc(px, py, rv, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(6, 6, s - 12, 4);
    });
    return new THREE.MeshStandardMaterial({
      map,
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.7,
    });
  }

  private canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.sharedTextures.push(tex);
    return tex;
  }

  private disposeTiles(): void {
    this.brickIndex.clear();
    this.steelIndex.clear();
    for (let i = this.group.children.length - 1; i >= 0; i -= 1) {
      const child = this.group.children[i];
      this.group.remove(child);
      this.disposeObject(child);
    }
    this.group.add(this.baseGroup);
    for (const t of this.sharedTextures) t.dispose();
    this.sharedTextures = [];
    this.brickMesh = undefined;
    this.steelMesh = undefined;
    this.waterMaterial = undefined;
    this.alarmRing = undefined;
    this.baseCore = undefined;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  dispose(): void {
    this.disposeTiles();
  }
}
