/// <reference types="vite/client" />

type ThreeGamePhase =
  | 'menu'
  | 'briefing'
  | 'playing'
  | 'paused'
  | 'dead'
  | 'gameover'
  | 'victory';

type ThreeGameAlertLevel = 'hidden' | 'spotted' | 'hunted' | 'searching';

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  phase: ThreeGamePhase;
  levelIndex: number;
  alert: ThreeGameAlertLevel;
  score: number;
  enemiesAlive: number;
  bossProgress: string | null;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
    hp: number;
    lives: number;
    boxed: boolean;
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
  /** Jump to a named state for baselines/playtests. */
  setState(name: string): void;
  /** Freeze the simulation while continuing to render the current frame. */
  setPausedForScreenshot(paused: boolean): void;
  /** Freeze ambient/idle animation time so screenshots are stable. */
  setReducedMotion(enabled: boolean): void;
  /** Hide debug UI before capturing. */
  hideDebugUi(hidden: boolean): void;
  /** Current game phase (for assertions). */
  getPhase(): ThreeGamePhase;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
