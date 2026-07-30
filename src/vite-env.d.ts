/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame:number;elapsed:number;score:number;targetScore:number;complete:boolean;failed:boolean;
  mode:'playing'|'paused'|'levelComplete'|'victory'|'defeat';level:number;levelName:string;wave:number;enemiesAlive:number;baseAlive:boolean;
  player:{position:{x:number;y:number;z:number};speed:number;lives:number};
  renderer:{calls:number;triangles:number;geometries:number;textures:number;materials:number};
  canvas:{clientWidth:number;clientHeight:number;width:number;height:number;dpr:number};
}
interface ThreeGameTestHooks { seed(value:number):void;setState(name:string):void;setPausedForScreenshot(paused:boolean):void;setReducedMotion(enabled:boolean):void;hideDebugUi(hidden:boolean):void; }
interface Window { __THREE_GAME_DIAGNOSTICS__?:ThreeGameDiagnostics;__THREE_GAME_TEST_HOOKS__?:ThreeGameTestHooks; }
