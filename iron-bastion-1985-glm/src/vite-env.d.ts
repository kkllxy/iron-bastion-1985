/// <reference types="vite/client" />

interface DiagnosticsPlayer {
  x: number;
  z: number;
  dir: number;
  firepower: number;
  alive: boolean;
}

interface DiagnosticsEnemy {
  x: number;
  z: number;
  kind: string;
  bonus: boolean;
}

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  fps: number;
  score: number;
  level: number;
  lives: number;
  state: string;
  complete: boolean;
  baseAlive: boolean;
  enemiesRemaining: number;
  enemiesTotal: number;
  enemiesOnField: number;
  player: DiagnosticsPlayer;
  enemies: DiagnosticsEnemy[];
  powerups: Array<{ kind: string; x: number; z: number }>;
  activePowers: Array<{ kind: string; remaining: number; duration: number }>;
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
  /** Jump to a named state for baselines: title | play | active-play |
   *  play-l2 | play-l3 | levelclear | gameover | victory. */
  setState(name: string): void;
  /** Freeze the simulation while continuing to render the current frame. */
  setPausedForScreenshot(paused: boolean): void;
  /** Freeze ambient/idle animation time so screenshots are stable. */
  setReducedMotion(enabled: boolean): void;
  /** Hide debug UI before capturing (no-op when no debug GUI is mounted). */
  hideDebugUi(hidden: boolean): void;
  /** Toggle enemy spawning (used by calm screenshots and bot runs). */
  setEnemySpawnEnabled(enabled: boolean): void;
  /** Make the player invincible (used by bot playtests to avoid softlocks). */
  setInvincible(enabled: boolean): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
