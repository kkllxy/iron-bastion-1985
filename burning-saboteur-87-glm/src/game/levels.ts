// Authored level layouts for the three connected sectors.
// Grid legend (enemies are NOT in the grid; they live in `enemies[]`):
//   '#' wall   '.' floor   'P' player start   'X' exit door
//   '1','2' keycards   'r' ration   'e' explosive   'H' hostage
// world( col, row ): x = (col - cx) * CELL,  z = (row - cy) * CELL

import type { EnemyKind } from './types';
import { TUNING } from './types';

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  z: number;
  facing: number; // radians; 0 = +x (east), +pi/2 = +z (south)
  patrol?: [number, number][]; // world-space waypoints
  fov?: number;
  range?: number;
}

export interface LevelDef {
  index: number;
  name: string;
  subtitle: string;
  brief: string;
  grid: string[];
  enemies: EnemySpawn[];
  exitCardLevel: number; // keycard tier required to open the exit (99 = none)
}

export const CELL = TUNING.cell;

function dims(grid: string[]) {
  return { cols: grid[0].length, rows: grid.length };
}

export function gridToWorld(grid: string[], col: number, row: number) {
  const { cols, rows } = dims(grid);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  return { x: (col - cx) * CELL, z: (row - cy) * CELL };
}

export function gridSize(grid: string[]) {
  return dims(grid);
}

// 24 wide x 16 tall
const GRID_1 = [
  '########################', // 0
  '#......................#', // 1
  '#.P....................#', // 2
  '#......######..........#', // 3
  '#......#....#..........#', // 4
  '#......#.1..#..........#', // 5
  '#......#....#..........#', // 6
  '#......######..........#', // 7
  '#......................X', // 8  exit
  '#.............######...#', // 9
  '#.............#....#...#', // 10
  '#.............#..r.#...#', // 11
  '#.............#....#...#', // 12
  '#.............######...#', // 13
  '#......................#', // 14
  '########################', // 15
];

// 28 wide x 16 tall
const GRID_2 = [
  '############################', // 0
  '#..........#...............#', // 1
  '#.P........#...######......#', // 2
  '#..........#...#....#......#', // 3
  '#.....######...#.2..#......#', // 4
  '#.....#....#...#....#......#', // 5
  '#.....#......#...####......#', // 6  (pillar row, not a full room)
  '#.....######...............#', // 7
  '#..........................X', // 8  exit
  '#....######....######......#', // 9
  '#....#.H..#....#....#......#', // 10
  '#....#....#....#..r.#......#', // 11
  '#....#....#....#....#......#', // 12
  '#....######....######......#', // 13
  '#..........................#', // 14
  '############################', // 15
];

// 26 wide x 18 tall
const GRID_3 = [
  '##########################', // 0
  '#........................#', // 1
  '#........................#', // 2
  '#........................#', // 3
  '#..........#####.........#', // 4
  '#..........#...#.........#', // 5
  '#..e.......#...#.......e.#', // 6
  '#..........#####.........#', // 7
  '#........................#', // 8
  '#....P...................#', // 9   (player start; boss spawns at center)
  '#........................#', // 10
  '#..........#####.........#', // 11
  '#..........#...#.........#', // 12
  '#..........#...#.........#', // 13
  '#..e.......#...#.......e.#', // 14
  '#..........#####.........#', // 15
  '#........................#', // 16
  '##########################', // 17
];

function assertRectangular(grid: string[], name: string) {
  const w = grid[0].length;
  grid.forEach((row, i) => {
    if (row.length !== w) {
      throw new Error(`Level ${name} row ${i} width ${row.length} != ${w}`);
    }
  });
}

for (const [g, n] of [
  [GRID_1, '基地外围'],
  [GRID_2, '内部建筑'],
  [GRID_3, '地下核武库'],
] as const) {
  assertRectangular(g, n);
}

export const LEVELS: LevelDef[] = [
  {
    index: 0,
    name: '基地外围',
    subtitle: '第一区域 · 外围渗透',
    brief: '潜入铁幕军团外围据点。避开巡逻兵与监控摄像头的视线锥，找到 1 级钥匙卡，从东侧闸门撤离。',
    grid: GRID_1,
    exitCardLevel: 1,
    enemies: [
      { kind: 'soldier', x: 6, z: 6, facing: Math.PI / 2, patrol: [[-6, 6], [6, 6]] },
      { kind: 'soldier', x: -8, z: -1, facing: 0, patrol: [[-8, -1], [-8, 5], [-2, 5], [-2, -1]] },
      { kind: 'soldier', x: 2, z: 7, facing: -Math.PI / 2, patrol: [[2, 7], [2, -2], [10, -2]] },
      { kind: 'camera', x: 9, z: -4, facing: -Math.PI / 2, fov: Math.PI / 3.2, range: 11 },
      { kind: 'camera', x: -6, z: 1, facing: Math.PI / 2, fov: Math.PI / 3.2, range: 11 },
    ],
  },
  {
    index: 1,
    name: '内部建筑',
    subtitle: '第二区域 · 建筑内部',
    brief: '深入建筑内部。重装守卫难以制服，狙击手会锁定直线通道。救出俘虏、获取 2 级钥匙卡后前往地下入口。',
    grid: GRID_2,
    exitCardLevel: 2,
    enemies: [
      { kind: 'soldier', x: -3, z: 2, facing: Math.PI / 2, patrol: [[-3, 2], [-3, 6], [3, 6]] },
      { kind: 'heavy', x: 8, z: -3, facing: Math.PI, patrol: [[8, -3], [8, 3]] },
      { kind: 'sniper', x: 11, z: 6, facing: -Math.PI / 2 },
      { kind: 'camera', x: 6, z: -1, facing: Math.PI / 2, fov: Math.PI / 3.4, range: 12 },
      { kind: 'soldier', x: -3, z: 8, facing: 0, patrol: [[-3, 8], [8, 8]] },
    ],
  },
  {
    index: 2,
    name: '地下核武库',
    subtitle: '第三区域 · 最终决战',
    brief: '直面核武步行兵器「铁狱」。拾取场内炸药，依次摧毁两侧导弹荚与核心反应堆。注意它的弹幕与冲撞。',
    grid: GRID_3,
    exitCardLevel: 99,
    enemies: [
      { kind: 'camera', x: -9, z: -9, facing: Math.PI / 4, fov: Math.PI / 3, range: 12 },
      { kind: 'camera', x: 9, z: 9, facing: -3 * Math.PI / 4, fov: Math.PI / 3, range: 12 },
    ],
  },
];

export function bossAnchor() {
  const grid = LEVELS[2].grid;
  const { cols, rows } = dims(grid);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  return { x: (Math.floor(cols / 2) - cx) * CELL, z: (Math.floor(rows / 2) - cy) * CELL };
}
