// Authored maps as ASCII grids. Each row is GRID wide. The border ring is '#'.
// Tiles: # border · floor B brick S steel W water T tree
// Spawns: 1/2/3 enemy spawn points  P player spawn  H base/HQ.
import { GRID, Tile, Dir } from './config';

export interface ParsedLevel {
  grid: Tile[][]; // [row][col]
  enemySpawns: Array<{ col: number; row: number }>;
  playerSpawn: { col: number; row: number };
  base: { col: number; row: number };
  brickCells: number;
}

// Map 1 — "Checkpoint": open field with a central water bar forcing flanks.
const MAP_1 = [
  '#############',
  '#1....2....3#',
  '#...........#',
  '#.B.......B.#',
  '#...........#',
  '#...........#',
  '#....WWW....#',
  '#...........#',
  '#...........#',
  '#.B.B...B.B.#',
  '#....BBB....#',
  '#...PBHBP...#',
  '#############',
];

// Map 2 — "Crossfire": pillar grid with a central lane; corridor firefights.
const MAP_2 = [
  '#############',
  '#1....2....3#',
  '#.B.B.B.B.B.#',
  '#.B.B.B.B.B.#',
  '#...........#',
  '#.B.B.B.B.B.#',
  '#.B.B...B.B.#',
  '#.B.B.B.B.B.#',
  '#...........#',
  '#.B.B.B.B.B.#',
  '#....BBB....#',
  '#...PBHBP...#',
  '#############',
];

// Map 3 — "Fortress": steel bunkers, water moats, forest ambush, center keep.
const MAP_3 = [
  '#############',
  '#1....2....3#',
  '#.S.S...S.S.#',
  '#..W.....W..#',
  '#..W.....W..#',
  '#.TT.....TT.#',
  '#.T..SSS..T.#',
  '#.TT.....TT.#',
  '#..W.....W..#',
  '#.S.S...S.S.#',
  '#....BBB....#',
  '#...PBHBP...#',
  '#############',
];

export const MAPS = [MAP_1, MAP_2, MAP_3];

export const LEVEL_NAMES = ['Checkpoint', 'Crossfire', 'Fortress'];

function tileFromChar(ch: string): Tile {
  switch (ch) {
    case '#':
      return Tile.Border;
    case 'B':
      return Tile.Brick;
    case 'S':
      return Tile.Steel;
    case 'W':
      return Tile.Water;
    case 'T':
      return Tile.Tree;
    case 'H':
      return Tile.Base;
    default:
      return Tile.Empty;
  }
}

export function parseMap(rows: string[]): ParsedLevel {
  if (rows.length !== GRID) throw new Error(`Map must have ${GRID} rows, got ${rows.length}`);
  const grid: Tile[][] = [];
  const enemySpawns: Array<{ col: number; row: number }> = [];
  let playerSpawn = { col: 5, row: GRID - 2 };
  let base = { col: Math.floor(GRID / 2), row: GRID - 2 };
  let brickCells = 0;

  for (let row = 0; row < GRID; row += 1) {
    const line = rows[row];
    if (line.length !== GRID) throw new Error(`Row ${row} must be ${GRID} wide, got ${line.length}`);
    const cells: Tile[] = [];
    for (let col = 0; col < GRID; col += 1) {
      const ch = line[col];
      if (ch === '1' || ch === '2' || ch === '3') {
        enemySpawns.push({ col, row });
        cells.push(Tile.Empty);
      } else if (ch === 'P') {
        playerSpawn = { col, row };
        cells.push(Tile.Empty);
      } else if (ch === 'H') {
        base = { col, row };
        cells.push(Tile.Base);
      } else {
        const tile = tileFromChar(ch);
        if (tile === Tile.Brick) brickCells += 1;
        cells.push(tile);
      }
    }
    grid.push(cells);
  }

  if (enemySpawns.length === 0) throw new Error('Map has no enemy spawn points');
  return { grid, enemySpawns, playerSpawn, base, brickCells };
}

// Direction from one cell to another, snapped to N/E/S/W (toward target).
export function dirToward(from: { col: number; row: number }, to: { col: number; row: number }): Dir {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Dir.E : Dir.W;
  return dy >= 0 ? Dir.S : Dir.N;
}
