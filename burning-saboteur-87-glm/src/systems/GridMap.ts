// Grid map: wall storage, circle-vs-wall collision, and grid ray line-of-sight.
import { CELL } from '../game/levels';
import { gridToWorld } from '../game/levels';

export class GridMap {
  readonly cols: number;
  readonly rows: number;
  readonly cell = CELL;
  private readonly walls: Uint8Array; // 1 = solid
  readonly originX: number; // world x of cell (0,0) center... we store per-cell min corner
  readonly originZ: number;
  readonly halfCols: number;
  readonly halfRows: number;

  constructor(grid: string[]) {
    this.cols = grid[0].length;
    this.rows = grid.length;
    this.walls = new Uint8Array(this.cols * this.rows);
    this.halfCols = (this.cols - 1) / 2;
    this.halfRows = (this.rows - 1) / 2;
    this.originX = -this.halfCols * this.cell;
    this.originZ = -this.halfRows * this.cell;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = grid[r][c];
        this.walls[r * this.cols + c] = ch === '#' ? 1 : 0;
      }
    }
  }

  isWallCol(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true; // out of bounds = wall
    return this.walls[row * this.cols + col] === 1;
  }

  worldToCell(x: number, z: number): { col: number; row: number } {
    return {
      col: Math.floor((x - this.originX) / this.cell),
      row: Math.floor((z - this.originZ) / this.cell),
    };
  }

  cellCenter(col: number, row: number) {
    return { x: this.originX + (col + 0.5) * this.cell, z: this.originZ + (row + 0.5) * this.cell };
  }

  // Resolve a circle (radius r) at (x,z) against wall cells; returns corrected (x,z).
  resolveCircle(x: number, z: number, r: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    const col = Math.floor((px - this.originX) / this.cell);
    const row = Math.floor((pz - this.originZ) / this.cell);
    // check 3x3 neighbourhood
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const rr = row + dr;
        if (!this.isWallCol(c, rr)) continue;
        // cell AABB min/max
        const minX = this.originX + c * this.cell;
        const minZ = this.originZ + rr * this.cell;
        const maxX = minX + this.cell;
        const maxZ = minZ + this.cell;
        // closest point on AABB to circle center
        const cx = Math.max(minX, Math.min(px, maxX));
        const cz = Math.max(minZ, Math.min(pz, maxZ));
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          px += dx * push;
          pz += dz * push;
        } else if (d2 <= 1e-8) {
          // center inside cell: push out along smallest penetration axis
          const left = px - minX;
          const right = maxX - px;
          const top = pz - minZ;
          const bottom = maxZ - pz;
          const m = Math.min(left, right, top, bottom);
          if (m === left) px = minX - r;
          else if (m === right) px = maxX + r;
          else if (m === top) pz = minZ - r;
          else pz = maxZ + r;
        }
      }
    }
    return { x: px, z: pz };
  }

  // DDA raycast; returns true if a wall blocks the segment (a,b)->(c,d).
  segmentBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    // supercover DDA across cells
    const c0 = this.worldToCell(ax, az);
    const c1 = this.worldToCell(bx, bz);
    let x0 = c0.col;
    let y0 = c0.row;
    const x1 = c1.col;
    const y1 = c1.row;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    // include the target cell as boundary (we only care about blockers between)
    for (let guard = 0; guard < 4096; guard++) {
      if (x0 === x1 && y0 === y1) return false;
      // step to next cell; the cell we step INTO must not be a wall
      const e2 = 2 * err;
      let nx = x0;
      let ny = y0;
      if (e2 > -dy) {
        err -= dy;
        nx += sx;
      }
      if (e2 < dx) {
        err += dx;
        ny += sy;
      }
      if (this.isWallCol(nx, ny)) return true;
      x0 = nx;
      y0 = ny;
    }
    return false;
  }
}

export function buildMap(grid: string[]): GridMap {
  return new GridMap(grid);
}

export { gridToWorld };
