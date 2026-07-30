/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  phase: string;
  wave: number;
  sun: number;
  defenseHp: number;
  enemiesAlive: number;
  plantsAlive: number;
  starsOnBoard: number;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  /** Re-seed the game RNG; all gameplay randomness must flow through it. */
  seed(value: number): void;
  /** Jump to a named state: title | active-play | prep | battle | boss | complete. */
  setState(name: string): void;
  /** Freeze the simulation while continuing to render the current frame. */
  setPausedForScreenshot(paused: boolean): void;
  /** Freeze ambient/idle animation time so screenshots are stable. */
  setReducedMotion(enabled: boolean): void;
  /** Hide debug UI (lil-gui) before capturing. */
  hideDebugUi(hidden: boolean): void;
  /** 直接操作接口（机器人/测试用）：购买商店第 index 槽。 */
  testBuy(index: number): boolean;
  /** 刷新商店。 */
  testReroll(): boolean;
  /** 把备战台第 benchIndex 株放到 (lane, col)。 */
  testPlace(benchIndex: number, lane: number, col: number): boolean;
  /** 开始本波战斗。 */
  testStartBattle(): void;
  /** 在奖励阶段选择第 idx 张卡。 */
  testPickReward(idx: number): void;
  /** 出售备战台第 index 槽。 */
  testSell(index: number): boolean;
  /** 测试专用：直接在 (lane,col) 放置一株指定植物与星级。 */
  testInject(plantId: string, star: number, lane: number, col: number): boolean;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
