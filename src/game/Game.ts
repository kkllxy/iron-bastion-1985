import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { AudioSystem } from '../systems/AudioSystem';
import { Hud, type HudState } from '../systems/Hud';
import { createSeededRandom } from '../utils/random';

type Team='player'|'enemy';
type Direction=0|1|2|3;
type EnemyVariant='scout'|'assault'|'fortress';
type BlockType='brick'|'steel'|'water'|'foliage'|'base';
type GameMode='playing'|'paused'|'levelComplete'|'victory'|'defeat';
type PowerType='shield'|'rapid';
type LevelDefinition={name:string;map:string[];targetKills:number;maxActiveDesktop:number;maxActiveMobile:number;spawnDelay:[number,number];enemySpeedScale:number;enemyPattern:EnemyVariant[]};

type Tank={id:number;group:THREE.Group;team:Team;variant:EnemyVariant|'hero';direction:Direction;speed:number;fireCooldown:number;aiTimer:number;hp:number;alive:boolean;invulnerable:number;trackPhase:number};
type Bullet={group:THREE.Group;team:Team;velocity:THREE.Vector3;life:number;owner:number};
type Block={root:THREE.Object3D;type:BlockType;box:THREE.Box3;tankSolid:boolean;bulletSolid:boolean;hp:number;alive:boolean};
type Powerup={root:THREE.Group;type:PowerType;life:number;phase:number};
type DebrisEffect={root:THREE.Group;parts:THREE.Mesh[];velocities:THREE.Vector3[];life:number;maxLife:number;ring?:THREE.Mesh};

const TILE=2;
const HALF_ARENA=13;
const DIR_VECTORS=[new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(-1,0,0)] as const;
const LEVELS:LevelDefinition[]=[
  {name:'边境壁垒',targetKills:8,maxActiveDesktop:3,maxActiveMobile:3,spawnDelay:[1.35,2.05],enemySpeedScale:1,enemyPattern:['scout','assault','scout','scout','fortress'],map:[
    '.............','...b.....b...','..b.w.w.b....','.ss...b...ss.','...bbb.bbb...',
    '.b...fff...b.','.b.s.....s.b.','...bb...bb...','.w...s.s...w.','..bbb...bbb..',
    '...b.....b...','....bb.bb....','.....beb.....',
  ]},
  {name:'钢铁水网',targetKills:10,maxActiveDesktop:4,maxActiveMobile:3,spawnDelay:[1.05,1.7],enemySpeedScale:1.06,enemyPattern:['scout','assault','assault','scout','fortress'],map:[
    '.............','...w.....w...','..bw..b..wb..','.s.w.....w.s.','...w.b.b.w...',
    '.bbw...w.bb..','...w.s.s.w...','.s.w.....w.s.','...w.b.b.w...','..bbb...bbb..',
    '.b.........b.','....bb.bb....','.....beb.....',
  ]},
  {name:'熔炉围城',targetKills:12,maxActiveDesktop:4,maxActiveMobile:3,spawnDelay:[.85,1.4],enemySpeedScale:1.12,enemyPattern:['assault','scout','fortress','assault','fortress','scout'],map:[
    '.............','...s.....s...','..b..b.b..b..','.b.s.....s.b.','...bbbbbbb...',
    '.s.b.....b.s.','...b.fff.b...','.bbb.....bbb.','...s.b.b.s...','.bb..s.s..bb.',
    '..b.......b..','....bb.bb....','.....beb.....',
  ]},
];

export class Game {
  private readonly renderer:THREE.WebGLRenderer;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(46,1,.1,100);
  private readonly input:InputController;
  private readonly audio=new AudioSystem();
  private readonly hud:Hud;
  private readonly loop=new Loop((delta,elapsed)=>this.update(delta,elapsed),()=>this.render());
  private readonly levelRoot=new THREE.Group();
  private readonly dynamicRoot=new THREE.Group();
  private readonly vfxRoot=new THREE.Group();
  private readonly moveIntent=new THREE.Vector2();
  private readonly blocks:Block[]=[];
  private readonly enemies:Tank[]=[];
  private readonly bullets:Bullet[]=[];
  private readonly powerups:Powerup[]=[];
  private readonly effects:DebrisEffect[]=[];
  private readonly materials=this.createMaterialKit();
  private readonly geometries={
    bullet:new THREE.CapsuleGeometry(.09,.24,3,6),
    debris:new THREE.TetrahedronGeometry(.16),
    blastRing:new THREE.TorusGeometry(.34,.055,6,24),
    muzzle:new THREE.OctahedronGeometry(.18),
    brickBlock:new THREE.BoxGeometry(1.76,.86,1.76,2,1,2),
  };
  private player!:Tank;
  private baseBlock!:Block;
  private rng=createSeededRandom(1985);
  private nextId=1;
  private frame=0;
  private elapsed=0;
  private kills=0;
  private lives=3;
  private currentLevel=0;
  private levelTransitionTimer=0;
  private spawned=0;
  private spawnTimer=.8;
  private respawnTimer=0;
  private shieldTime=0;
  private rapidTime=0;
  private mode:GameMode='playing';
  private trauma=0;
  private hitstop=0;
  private pausedForScreenshot=false;
  private reducedMotion=false;
  private lastStatus='守住雄鹰基地 · 消灭全部敌军';
  private readonly tuning={playerSpeed:6.4,enemySpeed:3.2,bulletSpeed:17,playerCooldown:.36,enemyCooldown:1.25,maxDpr:1.75};

  constructor(private readonly canvas:HTMLCanvasElement){
    this.renderer=createRenderer(canvas);this.renderer.toneMappingExposure=1.12;
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.scene.environment=pmrem.fromScene(new RoomEnvironment(),.035).texture;this.scene.environmentIntensity=.7;pmrem.dispose();
    this.input=new InputController(this.get('#touch-stick'),this.get('#touch-knob'),this.get('#fire-button'));
    this.hud=new Hud(()=>this.onModalAction(),()=>this.togglePause());
    this.scene.add(this.levelRoot,this.dynamicRoot,this.vfxRoot);this.createScene();this.resetRun();this.installTestHooks();this.publishDiagnostics();
  }
  start():void{this.loop.start()}
  dispose():void{this.loop.stop();this.input.dispose();this.audio.dispose();this.renderer.dispose();window.__THREE_GAME_DIAGNOSTICS__=undefined;window.__THREE_GAME_TEST_HOOKS__=undefined}

  private update(deltaRaw:number,elapsedRaw:number):void{
    this.frame+=1;resizeRenderer(this.renderer,this.camera,this.tuning.maxDpr);this.updateCameraBase();
    if(this.input.consumeRestart())this.mode==='victory'?this.resetRun():this.loadLevel(this.currentLevel);if(this.input.consumePause())this.togglePause();
    if(this.pausedForScreenshot){this.publishDiagnostics();return}
    const realDelta=Math.min(deltaRaw,.05);if(this.mode==='paused'){this.updateHud();this.publishDiagnostics();return}
    if(this.mode!=='playing'){this.updateEffects(realDelta);if(this.mode==='levelComplete'){this.levelTransitionTimer-=realDelta;if(this.levelTransitionTimer<=0)this.advanceLevel()}this.applyCameraShake(realDelta,elapsedRaw);this.updateHud();this.publishDiagnostics();return}
    this.elapsed+=realDelta;
    if(this.hitstop>0)this.hitstop=Math.max(0,this.hitstop-realDelta);const delta=this.hitstop>0?realDelta*.08:realDelta;
    this.shieldTime=Math.max(0,this.shieldTime-realDelta);this.rapidTime=Math.max(0,this.rapidTime-realDelta);
    this.updatePlayer(delta);this.updateEnemies(delta);this.updateBullets(delta);this.updatePowerups(delta,elapsedRaw);this.updateEffects(realDelta);this.updateSpawning(delta);this.updateRespawn(delta);this.checkVictory();this.applyCameraShake(realDelta,elapsedRaw);this.updateHud();this.publishDiagnostics();
  }

  private render():void{this.renderer.render(this.scene,this.camera)}

  private createScene():void{
    this.scene.background=new THREE.Color('#11130d');this.scene.fog=new THREE.FogExp2('#12140e',.018);
    const hemi=new THREE.HemisphereLight('#fff0c5','#252719',1.55);this.scene.add(hemi);
    const sun=new THREE.DirectionalLight('#ffd89a',3.1);sun.position.set(-8,18,10);sun.castShadow=true;const shadowSize=window.innerWidth<=760?1024:2048;sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.camera.near=2;sun.shadow.camera.far=50;sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=17;sun.shadow.camera.bottom=-17;sun.shadow.bias=-.0004;this.scene.add(sun);
    const rim=new THREE.DirectionalLight('#8aa4ff',.7);rim.position.set(12,7,-10);this.scene.add(rim);
    this.createGroundAndBorder();
  }

  private get level():LevelDefinition{return LEVELS[this.currentLevel]}

  private resetRun():void{this.loadLevel(0)}

  private loadLevel(index:number):void{
    this.clearGroup(this.levelRoot);this.clearGroup(this.dynamicRoot);this.clearGroup(this.vfxRoot);this.blocks.length=0;this.enemies.length=0;this.bullets.length=0;this.powerups.length=0;this.effects.length=0;
    this.currentLevel=index;this.validateLevel(this.level);this.rng=createSeededRandom(1985+index*997);this.nextId=1;this.elapsed=0;this.kills=0;this.lives=3;this.spawned=0;this.spawnTimer=.9;this.respawnTimer=0;this.shieldTime=0;this.rapidTime=0;this.mode='playing';this.levelTransitionTimer=0;this.trauma=0;this.hitstop=0;this.lastStatus=`第 ${index+1} 关 · ${this.level.name}`;
    this.createLevel(this.level.map);this.player=this.createTank('player','hero',new THREE.Vector3(0,.35,9.2));this.dynamicRoot.add(this.player.group);this.spawnEnemy(-8);this.spawnEnemy(8);this.hud.announce(this.lastStatus);this.updateHud();
  }

  private createGroundAndBorder():void{
    const groundTex=this.createGroundTexture();groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping;groundTex.repeat.set(7,7);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(38,38),new THREE.MeshStandardMaterial({color:'#3b3d2e',map:groundTex,roughness:.93,metalness:0}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.03;this.scene.add(ground);
    const borderMat=this.materials.border;const longGeo=new THREE.BoxGeometry(29,.8,.85),shortGeo=new THREE.BoxGeometry(.85,.8,29);
    const borderPieces:Array<[THREE.BufferGeometry,number,number]>=[[longGeo,0,-13.6],[longGeo,0,13.6],[shortGeo,-13.6,0],[shortGeo,13.6,0]];borderPieces.forEach(([geo,x,z])=>{const mesh=new THREE.Mesh(geo,borderMat);mesh.position.set(x,.4,z);mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh)});
    const mobile=window.matchMedia('(max-width: 760px)').matches;if(!mobile){const towerPositions=[[-15,-15],[15,-15],[-15,15],[15,15]];for(const [x,z] of towerPositions)this.scene.add(this.createWatchTower(x,z));for(let i=-12;i<=12;i+=4){const marker=new THREE.Mesh(new THREE.BoxGeometry(.55,.05,.18),this.materials.signal);marker.position.set(i,.015,-12.72);this.scene.add(marker)}}
  }

  private validateLevel(level:LevelDefinition):void{if(level.map.length!==13||level.map.some(row=>row.length!==13)||level.map.join('').split('e').length!==2)throw new Error(`Invalid level map: ${level.name}`)}

  private createLevel(map:string[]):void{
    for(let row=0;row<map.length;row+=1){for(let col=0;col<map[row].length;col+=1){const token=map[row][col];if(token==='.')continue;const pos=new THREE.Vector3((col-6)*TILE,0,(row-6)*TILE);if(token==='b')this.addBlock(this.createBrick(pos));if(token==='s')this.addBlock(this.createSteel(pos));if(token==='w')this.addBlock(this.createWater(pos));if(token==='f')this.addBlock(this.createFoliage(pos));if(token==='e'){this.baseBlock=this.createBase(pos);this.addBlock(this.baseBlock)}}}
    const spawnPositions=[-8,0,8];for(const x of spawnPositions){const pad=this.createSpawnPad(new THREE.Vector3(x,.02,-11.8));this.levelRoot.add(pad)}
  }

  private addBlock(block:Block):void{this.blocks.push(block);this.levelRoot.add(block.root)}

  private updatePlayer(delta:number):void{
    if(!this.player.alive)return;this.player.fireCooldown=Math.max(0,this.player.fireCooldown-delta);this.player.invulnerable=Math.max(0,this.player.invulnerable-delta);
    this.input.readMovement(this.moveIntent);if(this.moveIntent.lengthSq()>.04){let dir:Direction;if(Math.abs(this.moveIntent.x)>Math.abs(this.moveIntent.y))dir=this.moveIntent.x>0?1:3;else dir=this.moveIntent.y>0?2:0;this.player.direction=dir;this.player.group.rotation.y=this.directionRotation(dir);this.tryMoveTank(this.player,DIR_VECTORS[dir].clone().multiplyScalar(this.tuning.playerSpeed*delta));this.animateTracks(this.player,delta*this.tuning.playerSpeed)}
    if(this.input.isFireHeld()&&this.player.fireCooldown<=0){this.fire(this.player);this.player.fireCooldown=this.rapidTime>0?.16:this.tuning.playerCooldown}
    this.player.group.visible=this.player.invulnerable<=0||Math.floor(this.player.invulnerable*12)%2===0;
  }

  private updateEnemies(delta:number):void{
    for(const enemy of this.enemies){if(!enemy.alive)continue;enemy.fireCooldown-=delta;enemy.aiTimer-=delta;
      if(enemy.aiTimer<=0){enemy.aiTimer=.45+this.rng()*1.3;const towardBase=this.rng()<.46;enemy.direction=towardBase?2:(Math.floor(this.rng()*4) as Direction);enemy.group.rotation.y=this.directionRotation(enemy.direction)}
      const moved=this.tryMoveTank(enemy,DIR_VECTORS[enemy.direction].clone().multiplyScalar(enemy.speed*delta));if(!moved){enemy.direction=Math.floor(this.rng()*4) as Direction;enemy.group.rotation.y=this.directionRotation(enemy.direction);enemy.aiTimer=.12}
      this.animateTracks(enemy,delta*enemy.speed);
      const aligned=Math.abs(enemy.group.position.x-this.player.group.position.x)<1.1||Math.abs(enemy.group.position.z-this.player.group.position.z)<1.1;
      if(enemy.fireCooldown<=0&&(aligned||this.rng()<.012)){this.fire(enemy);enemy.fireCooldown=this.tuning.enemyCooldown+this.rng()*.9}
    }
  }

  private updateBullets(delta:number):void{
    for(let i=this.bullets.length-1;i>=0;i-=1){const bullet=this.bullets[i];bullet.life-=delta;bullet.group.position.addScaledVector(bullet.velocity,delta);bullet.group.rotation.y+=delta*9;
      if(bullet.life<=0||Math.abs(bullet.group.position.x)>HALF_ARENA||Math.abs(bullet.group.position.z)>HALF_ARENA){this.removeBullet(i);continue}
      const block=this.blocks.find(item=>item.alive&&item.bulletSolid&&item.box.distanceToPoint(bullet.group.position)<.18);if(block){this.hitBlock(block,bullet);this.removeBullet(i);continue}
      if(bullet.team==='player'){const enemy=this.enemies.find(t=>t.alive&&t.group.position.distanceToSquared(bullet.group.position)<.7);if(enemy){this.damageEnemy(enemy);this.removeBullet(i);continue}}
      else if(this.player.alive&&this.player.group.position.distanceToSquared(bullet.group.position)<.72){this.hitPlayer();this.removeBullet(i);continue}
    }
  }

  private updatePowerups(delta:number,elapsed:number):void{
    for(let i=this.powerups.length-1;i>=0;i-=1){const item=this.powerups[i];item.life-=delta;item.phase+=delta;item.root.rotation.y+=delta*1.8;item.root.position.y=.5+Math.sin((this.reducedMotion?0:elapsed)*3+item.phase)*.14;
      if(item.life<=0){this.dynamicRoot.remove(item.root);this.powerups.splice(i,1);continue}
      if(this.player.alive&&item.root.position.distanceToSquared(this.player.group.position)<1.5){if(item.type==='shield'){this.shieldTime=10;this.lastStatus='反应装甲已上线 · 10 秒';}else{this.rapidTime=10;this.lastStatus='装填加速 · 射速提升 10 秒';}this.audio.powerup(item.type);this.hud.announce(this.lastStatus);this.spawnExplosion(item.root.position,item.type==='shield'?'#5dd6d5':'#ff9d3c',.65);this.dynamicRoot.remove(item.root);this.powerups.splice(i,1)}
    }
  }

  private updateSpawning(delta:number):void{if(this.spawned>=this.level.targetKills)return;this.spawnTimer-=delta;const maxActive=window.innerWidth<=760?this.level.maxActiveMobile:this.level.maxActiveDesktop;if(this.spawnTimer<=0&&this.enemies.filter(e=>e.alive).length<maxActive){const slots=[-8,0,8];this.spawnEnemy(slots[Math.floor(this.rng()*slots.length)]);const [min,max]=this.level.spawnDelay;this.spawnTimer=min+this.rng()*(max-min)}}
  private updateRespawn(delta:number):void{if(this.respawnTimer<=0)return;this.respawnTimer-=delta;if(this.respawnTimer<=0&&this.lives>0){this.player.alive=true;this.player.group.visible=true;this.player.group.position.set(0,.35,9.2);this.player.direction=0;this.player.group.rotation.y=0;this.player.invulnerable=2.4;this.lastStatus='重新部署 · 短暂无敌';this.hud.announce(this.lastStatus)}}

  private tryMoveTank(tank:Tank,deltaPos:THREE.Vector3):boolean{
    const previous=tank.group.position.clone();tank.group.position.add(deltaPos);tank.group.position.x=THREE.MathUtils.clamp(tank.group.position.x,-12.1,12.1);tank.group.position.z=THREE.MathUtils.clamp(tank.group.position.z,-12.1,12.1);
    const center=tank.group.position,half=.72;const hitBlock=this.blocks.some(b=>b.alive&&b.tankSolid&&this.boxIntersectsCircle(b.box,center,half));
    const opponents=tank.team==='player'?this.enemies:[this.player,...this.enemies.filter(e=>e!==tank)];const hitTank=opponents.some(other=>other.alive&&other.group.position.distanceToSquared(center)<1.75);
    if(hitBlock||hitTank){tank.group.position.copy(previous);return false}return true;
  }

  private fire(tank:Tank):void{
    if(!tank.alive)return;const dir=DIR_VECTORS[tank.direction];const group=new THREE.Group();const shell=new THREE.Mesh(this.geometries.bullet,tank.team==='player'?this.materials.playerShell:this.materials.enemyShell);shell.rotation.x=Math.PI/2;const glow=new THREE.PointLight(tank.team==='player'?'#ffd35f':'#ff4c35',.8,2.2);group.add(shell,glow);group.position.copy(tank.group.position).addScaledVector(dir,1.15);group.position.y=.66;group.rotation.y=this.directionRotation(tank.direction);this.dynamicRoot.add(group);this.bullets.push({group,team:tank.team,velocity:dir.clone().multiplyScalar(this.tuning.bulletSpeed),life:2.2,owner:tank.id});this.audio.shoot(tank.team==='enemy');this.spawnMuzzle(group.position,dir,tank.team==='player'?'#ffd35f':'#ff4c35')
  }

  private hitBlock(block:Block,bullet:Bullet):void{
    if(block.type==='brick'){block.hp-=1;this.audio.impact(false);this.spawnExplosion(bullet.group.position,'#d66b36',.36);if(block.hp<=0){block.alive=false;block.root.visible=false;this.lastStatus='砖墙已击穿'}}
    else if(block.type==='base'){block.alive=false;block.root.visible=false;this.audio.explosion(true);this.spawnExplosion(block.root.position,'#ff9a3c',1.5);this.trauma=Math.min(1,this.trauma+.85);this.mode='defeat';this.lastStatus='雄鹰基地被摧毁';this.hud.flash()}
    else{this.audio.impact(true);this.spawnSparks(bullet.group.position,'#dbe5e7')}
  }

  private damageEnemy(enemy:Tank):void{enemy.hp-=1;this.hitstop=.035;this.trauma=Math.min(1,this.trauma+.18);if(enemy.hp>0){this.audio.impact(true);this.flashTank(enemy);return}enemy.alive=false;enemy.group.visible=false;this.kills+=1;this.audio.explosion(enemy.variant==='fortress');this.spawnExplosion(enemy.group.position,enemy.variant==='fortress'?'#ff5b31':'#ff9b3d',enemy.variant==='fortress'?1.2:.85);this.lastStatus=`敌装甲击毁 · ${this.kills}/${this.level.targetKills}`;if(this.kills%3===0)this.spawnPowerup(enemy.group.position,this.kills%6===0?'rapid':'shield')}

  private hitPlayer():void{
    if(this.player.invulnerable>0)return;if(this.shieldTime>0){this.shieldTime=Math.max(0,this.shieldTime-2.5);this.audio.impact(true);this.spawnSparks(this.player.group.position,'#5dd6d5');this.trauma=Math.min(1,this.trauma+.15);this.lastStatus='反应装甲吸收命中';return}
    this.lives-=1;this.player.alive=false;this.player.group.visible=false;this.audio.lifeLost();this.spawnExplosion(this.player.group.position,'#ffd35f',1.15);this.trauma=Math.min(1,this.trauma+.75);this.hitstop=.09;this.hud.flash();if(this.lives<=0){this.mode='defeat';this.lastStatus='最后一辆守卫坦克被击毁'}else{this.respawnTimer=1.05;this.lastStatus=`坦克损失 · 剩余 ${this.lives} 辆`}
  }

  private checkVictory():void{if(this.mode!=='playing'||this.kills<this.level.targetKills||this.enemies.some(e=>e.alive))return;this.audio.victory();this.spawnExplosion(new THREE.Vector3(0,.5,-2),'#ffd35f',1.8);if(this.currentLevel<LEVELS.length-1){this.mode='levelComplete';this.levelTransitionTimer=2;this.lastStatus=`${this.level.name} 已肃清 · 准备转进`}else{this.mode='victory';this.lastStatus='三大战区肃清 · 雄鹰基地安全'}}

  private advanceLevel():void{if(this.currentLevel<LEVELS.length-1)this.loadLevel(this.currentLevel+1)}

  private spawnEnemy(x:number):void{if(this.spawned>=this.level.targetKills)return;const variant=this.level.enemyPattern[this.spawned%this.level.enemyPattern.length];const enemy=this.createTank('enemy',variant,new THREE.Vector3(x,.35,-11.4));enemy.speed*=this.level.enemySpeedScale;enemy.direction=2;enemy.group.rotation.y=Math.PI;this.enemies.push(enemy);this.dynamicRoot.add(enemy.group);this.spawned+=1;this.spawnSparks(enemy.group.position,'#ff5b31')}

  private createTank(team:Team,variant:EnemyVariant|'hero',position:THREE.Vector3):Tank{
    const root=new THREE.Group();root.position.copy(position);root.name=`${team}-${variant}-tank`;
    const mobile=window.innerWidth<=760;
    const isHero=team==='player',bodyMat=isHero?this.materials.heroBody:variant==='scout'?this.materials.scout:variant==='assault'?this.materials.assault:this.materials.fortress;
    const trackMat=this.materials.track,trim=isHero?this.materials.heroTrim:this.materials.enemyTrim;
    if(mobile){const track=new THREE.Mesh(new THREE.BoxGeometry(1.26,.3,1.38,2,1,7),trackMat);track.position.y=.2;track.castShadow=true;track.name='track';root.add(track)}else{const trackGeo=new THREE.BoxGeometry(.38,.32,1.42,1,1,7);for(const side of [-1,1]){const track=new THREE.Mesh(trackGeo,trackMat);track.position.set(side*.58,.22,0);track.castShadow=true;track.name='track';root.add(track)}}
    const hullShape=new THREE.Shape();hullShape.moveTo(-.56,-.68);hullShape.lineTo(.56,-.68);hullShape.lineTo(.72,-.34);hullShape.lineTo(.62,.62);hullShape.lineTo(.32,.78);hullShape.lineTo(-.32,.78);hullShape.lineTo(-.62,.62);hullShape.closePath();
    const hullGeo=new THREE.ExtrudeGeometry(hullShape,{depth:.38,bevelEnabled:true,bevelSize:.06,bevelThickness:.05,bevelSegments:1});hullGeo.rotateX(Math.PI/2);hullGeo.translate(0,.35,0);const hull=new THREE.Mesh(hullGeo,bodyMat);hull.castShadow=true;root.add(hull);
    const turret=new THREE.Mesh(variant==='fortress'?new THREE.CylinderGeometry(.58,.7,.38,8):new THREE.CylinderGeometry(.46,.58,.36,8),bodyMat);turret.position.y=.72;turret.castShadow=true;root.add(turret);
    const barrelLength=variant==='fortress'?1.22:.96;const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.075,.105,barrelLength,8),trim);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.78,-.65);root.add(barrel);
    if(!mobile){const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.2,8),trackMat);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.78,-1.15);root.add(muzzle);const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.24,.28,.12,8),trim);hatch.position.y=.98;root.add(hatch);const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.014,.025,.65,6),this.materials.metal);antenna.position.set(.34,1.18,.16);antenna.rotation.z=-.08;root.add(antenna);const light=new THREE.Mesh(new THREE.BoxGeometry(.34,.13,.07),isHero?this.materials.signal:this.materials.hazard);light.position.set(0,.57,-.81);root.add(light)}
    if(variant==='assault'&&!mobile){for(const side of [-1,1]){const plate=new THREE.Mesh(new THREE.BoxGeometry(.18,.42,.86),this.materials.enemyTrim);plate.position.set(side*.76,.44,.08);plate.rotation.z=side*.13;root.add(plate)}}
    if(variant==='fortress'){for(const side of [-1,1]){const pod=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.58,8),this.materials.hazard);pod.rotation.x=Math.PI/2;pod.position.set(side*.47,.66,-.12);root.add(pod)}}
    if(isHero){const pennant=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape().moveTo(0,0).lineTo(.38,.13).lineTo(0,.25)),this.materials.signal);pennant.position.set(.34,1.36,.16);pennant.rotation.y=-Math.PI/2;root.add(pennant)}
    root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}});
    const hp=variant==='fortress'?3:variant==='assault'?2:1;return{id:this.nextId++,group:root,team,variant,direction:0,speed:variant==='scout'?3.7:variant==='assault'?3.15:2.5,fireCooldown:.5+this.rng(),aiTimer:.3+this.rng(),hp,alive:true,invulnerable:0,trackPhase:0};
  }

  private animateTracks(tank:Tank,amount:number):void{tank.trackPhase+=amount;for(const child of tank.group.children){if(child.name==='track')child.rotation.z=Math.sin(tank.trackPhase*5)*.008}}

  private createBrick(pos:THREE.Vector3):Block{const group=new THREE.Group();group.position.copy(pos);const brick=new THREE.Mesh(this.geometries.brickBlock,this.materials.brick);brick.position.y=.43;brick.castShadow=brick.receiveShadow=true;group.add(brick);return this.makeBlock(group,'brick',true,true,1,.9)}
  private createSteel(pos:THREE.Vector3):Block{const group=new THREE.Group();group.position.copy(pos);const core=new THREE.Mesh(new THREE.BoxGeometry(1.74,.78,1.74,2,1,2),this.materials.steel);core.position.y=.39;core.castShadow=core.receiveShadow=true;group.add(core);return this.makeBlock(group,'steel',true,true,999,.9)}
  private createWater(pos:THREE.Vector3):Block{const group=new THREE.Group();group.position.copy(pos);const water=new THREE.Mesh(new THREE.BoxGeometry(1.84,.12,1.84),this.materials.water);water.position.y=.02;group.add(water);return this.makeBlock(group,'water',true,false,999,.9)}
  private createFoliage(pos:THREE.Vector3):Block{const group=new THREE.Group();group.position.copy(pos);const bush=new THREE.Mesh(new THREE.DodecahedronGeometry(.92,1),this.materials.foliage);bush.position.y=.48;bush.scale.set(1,.62,.92);bush.rotation.y=(pos.x+pos.z)*.13;bush.castShadow=true;group.add(bush);group.renderOrder=4;return this.makeBlock(group,'foliage',false,false,999,.9)}
  private createBase(pos:THREE.Vector3):Block{const group=new THREE.Group();group.position.copy(pos);const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.78,.94,.4,8),this.materials.base);pedestal.position.y=.2;group.add(pedestal);const crest=new THREE.Mesh(new THREE.CylinderGeometry(.38,.52,.38,8),this.materials.metal);crest.position.y=.56;group.add(crest);const wingGeo=new THREE.ExtrudeGeometry(new THREE.Shape().moveTo(0,0).lineTo(.92,.38).lineTo(.38,.46).lineTo(.18,.84).lineTo(0,.54),{depth:.12,bevelEnabled:true,bevelSize:.03,bevelThickness:.02,bevelSegments:1});for(const side of [-1,1]){const wing=new THREE.Mesh(wingGeo,this.materials.signal);wing.scale.x=side;wing.position.set(0,.64,0);wing.rotation.x=-Math.PI/2;group.add(wing)}const core=new THREE.Mesh(new THREE.OctahedronGeometry(.22),this.materials.hazard);core.position.y=.78;group.add(core);group.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true});return this.makeBlock(group,'base',true,true,1,.86)}
  private makeBlock(root:THREE.Object3D,type:BlockType,tankSolid:boolean,bulletSolid:boolean,hp:number,half:number):Block{const center=root.position;return{root,type,box:new THREE.Box3(new THREE.Vector3(center.x-half,0,center.z-half),new THREE.Vector3(center.x+half,1.4,center.z+half)),tankSolid,bulletSolid,hp,alive:true}}

  private createSpawnPad(pos:THREE.Vector3):THREE.Group{const group=new THREE.Group();group.position.copy(pos);const ring=new THREE.Mesh(new THREE.RingGeometry(.68,.9,24),this.materials.hazard);ring.rotation.x=-Math.PI/2;group.add(ring);for(let i=0;i<4;i+=1){const tooth=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.42),this.materials.steel);const a=i*Math.PI/2;tooth.position.set(Math.cos(a)*.9,.09,Math.sin(a)*.9);tooth.rotation.y=-a;group.add(tooth)}return group}
  private createWatchTower(x:number,z:number):THREE.Group{const group=new THREE.Group();group.position.set(x,0,z);const base=new THREE.Mesh(new THREE.CylinderGeometry(.55,.9,2.5,6),this.materials.border);base.position.y=1.25;const cabin=new THREE.Mesh(new THREE.CylinderGeometry(.95,.72,.65,8),this.materials.steel);cabin.position.y=2.7;const lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),this.materials.signal);lamp.position.y=3.15;group.add(base,cabin,lamp);return group}

  private spawnPowerup(position:THREE.Vector3,type:PowerType):void{const root=new THREE.Group();root.position.copy(position);root.position.y=.55;if(type==='shield'){const outer=new THREE.Mesh(new THREE.TorusGeometry(.46,.12,8,20),this.materials.shield);outer.rotation.x=Math.PI/2;const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.25,0),this.materials.shield);root.add(outer,core)}else{for(let i=-1;i<=1;i+=1){const shell=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.32,3,6),this.materials.reward);shell.rotation.x=Math.PI/2;shell.position.x=i*.22;root.add(shell)}const bracket=new THREE.Mesh(new THREE.BoxGeometry(.82,.12,.22),this.materials.metal);root.add(bracket)}this.dynamicRoot.add(root);this.powerups.push({root,type,life:12,phase:this.rng()*6})}

  private spawnExplosion(position:THREE.Vector3,color:string,scale:number):void{const root=new THREE.Group();root.position.copy(position);const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});const parts:THREE.Mesh[]=[],velocities:THREE.Vector3[]=[];const count=window.innerWidth<=760?5:14;for(let i=0;i<count;i+=1){const part=new THREE.Mesh(this.geometries.debris,mat);part.scale.setScalar(scale*(.65+this.rng()*.7));root.add(part);parts.push(part);const a=this.rng()*Math.PI*2,speed=(1.5+this.rng()*3)*scale;velocities.push(new THREE.Vector3(Math.cos(a)*speed,1.2+this.rng()*2.8,Math.sin(a)*speed))}const ring=new THREE.Mesh(this.geometries.blastRing,mat);ring.scale.setScalar(scale);ring.rotation.x=Math.PI/2;ring.position.y=.35;root.add(ring);this.vfxRoot.add(root);this.effects.push({root,parts,velocities,life:.55,maxLife:.55,ring})}
  private spawnSparks(position:THREE.Vector3,color:string):void{this.spawnExplosion(position,color,.35)}
  private spawnMuzzle(position:THREE.Vector3,dir:THREE.Vector3,color:string):void{const root=new THREE.Group();root.position.copy(position).addScaledVector(dir,.22);const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});const flash=new THREE.Mesh(this.geometries.muzzle,mat);root.add(flash);this.vfxRoot.add(root);this.effects.push({root,parts:[flash],velocities:[dir.clone().multiplyScalar(1.4)],life:.1,maxLife:.1})}
  private updateEffects(delta:number):void{for(let i=this.effects.length-1;i>=0;i-=1){const effect=this.effects[i];effect.life-=delta;for(let p=0;p<effect.parts.length;p+=1){effect.velocities[p].y-=5.8*delta;effect.parts[p].position.addScaledVector(effect.velocities[p],delta);effect.parts[p].rotation.x+=delta*7;effect.parts[p].rotation.z+=delta*5}if(effect.ring)effect.ring.scale.multiplyScalar(1+delta*5);effect.root.scale.setScalar(Math.max(.01,effect.life/effect.maxLife));if(effect.life<=0){this.vfxRoot.remove(effect.root);this.effects.splice(i,1)}}}
  private flashTank(tank:Tank):void{tank.group.scale.set(1.12,.88,1.12);setTimeout(()=>tank.group.scale.set(1,1,1),90)}
  private removeBullet(index:number):void{this.dynamicRoot.remove(this.bullets[index].group);this.bullets.splice(index,1)}
  private boxIntersectsCircle(box:THREE.Box3,center:THREE.Vector3,radius:number):boolean{return box.distanceToPoint(center)<radius}
  private directionRotation(direction:Direction):number{return [0,-Math.PI/2,Math.PI,Math.PI/2][direction]}

  private updateCameraBase():void{const portrait=this.canvas.clientHeight>this.canvas.clientWidth*1.1;this.camera.fov=portrait?49:46;this.camera.position.set(0,portrait?37:29,portrait?18:23);this.camera.lookAt(0,0,portrait?0:1);this.camera.updateProjectionMatrix()}
  private applyCameraShake(delta:number,elapsed:number):void{this.trauma=Math.max(0,this.trauma-delta*1.7);if(this.reducedMotion||this.trauma<=0)return;const amount=this.trauma*this.trauma;this.camera.position.x+=Math.sin(elapsed*67)*.35*amount;this.camera.position.y+=Math.sin(elapsed*53+2)*.22*amount;this.camera.lookAt(0,0,1)}

  private getWave():number{return Math.min(3,Math.floor(this.spawned/Math.ceil(this.level.targetKills/3))+1)}
  private updateHud():void{const active=this.enemies.filter(e=>e.alive).length;const wave=this.getWave();let status=this.lastStatus;if(this.mode==='playing'&&this.spawned<this.level.targetKills)status=`${this.level.name} · 第 ${wave} 波 · 战场敌军 ${active}`;const state:HudState={level:this.currentLevel+1,levelName:this.level.name,nextLevelName:LEVELS[this.currentLevel+1]?.name,lives:this.lives,kills:this.kills,target:this.level.targetKills,wave,baseAlive:this.baseBlock?.alive??false,shield:this.shieldTime,rapid:this.rapidTime,status,mode:this.mode};this.hud.update(state)}
  private togglePause():void{if(this.mode==='victory'||this.mode==='defeat'||this.mode==='levelComplete')return;this.mode=this.mode==='paused'?'playing':'paused';this.audio.ui();this.updateHud()}
  private onModalAction():void{this.audio.ui();if(this.mode==='paused'){this.mode='playing';this.updateHud()}else if(this.mode==='levelComplete')this.advanceLevel();else if(this.mode==='defeat')this.loadLevel(this.currentLevel);else this.resetRun()}

  private createMaterialKit(){return{
    heroBody:new THREE.MeshPhysicalMaterial({color:'#d6aa35',roughness:.48,metalness:.42,clearcoat:.25}),heroTrim:new THREE.MeshStandardMaterial({color:'#4b5635',roughness:.62,metalness:.34}),track:new THREE.MeshStandardMaterial({color:'#151712',roughness:.82,metalness:.5}),
    scout:new THREE.MeshStandardMaterial({color:'#789b43',roughness:.56,metalness:.35}),assault:new THREE.MeshStandardMaterial({color:'#b66b32',roughness:.5,metalness:.42}),fortress:new THREE.MeshStandardMaterial({color:'#8c3c32',roughness:.47,metalness:.5}),enemyTrim:new THREE.MeshStandardMaterial({color:'#332e24',roughness:.65,metalness:.55}),
    brick:new THREE.MeshStandardMaterial({color:'#b4512c',map:this.createBrickTexture(),roughness:.84,metalness:.02}),steel:new THREE.MeshStandardMaterial({color:'#687279',map:this.createSteelTexture(),roughness:.32,metalness:.83}),metal:new THREE.MeshStandardMaterial({color:'#b7aa78',roughness:.4,metalness:.72}),border:new THREE.MeshStandardMaterial({color:'#2d3129',roughness:.7,metalness:.55}),
    signal:new THREE.MeshStandardMaterial({color:'#ffd15a',emissive:'#ff9b25',emissiveIntensity:1.3,roughness:.35}),hazard:new THREE.MeshStandardMaterial({color:'#e3482f',emissive:'#8c130c',emissiveIntensity:.7,roughness:.48}),reward:new THREE.MeshStandardMaterial({color:'#ffad3d',emissive:'#b74313',emissiveIntensity:1.2,metalness:.4}),shield:new THREE.MeshStandardMaterial({color:'#5dd6d5',emissive:'#1a8794',emissiveIntensity:1.4,metalness:.3}),
    water:new THREE.MeshPhysicalMaterial({color:'#225f69',map:this.createWaterTexture(),roughness:.2,metalness:.08,transparent:true,opacity:.82,clearcoat:1}),waterLine:new THREE.MeshBasicMaterial({color:'#67d1cc',transparent:true,opacity:.65}),foliage:new THREE.MeshStandardMaterial({color:'#526c36',roughness:.9,flatShading:true}),foliageDark:new THREE.MeshStandardMaterial({color:'#2f492b',roughness:.92}),base:new THREE.MeshStandardMaterial({color:'#594934',roughness:.62,metalness:.44}),
    playerShell:new THREE.MeshBasicMaterial({color:'#ffe47a'}),enemyShell:new THREE.MeshBasicMaterial({color:'#ff5338'}),
  }}

  private createGroundTexture():THREE.CanvasTexture{const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');if(!ctx)throw new Error('ground texture context unavailable');ctx.fillStyle='#3b3d2e';ctx.fillRect(0,0,size,size);for(let i=0;i<150;i+=1){const x=(i*73)%size,y=(i*127)%size,a=.04+(i%5)*.012;ctx.fillStyle=`rgba(230,218,170,${a})`;ctx.fillRect(x,y,1+(i%3),1+(i%2))}ctx.strokeStyle='rgba(255,213,113,.08)';ctx.lineWidth=2;for(let i=0;i<=size;i+=64){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke()}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture}
  private createBrickTexture():THREE.CanvasTexture{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');if(!ctx)throw new Error('brick texture context unavailable');ctx.fillStyle='#b4512c';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#612719';ctx.lineWidth=5;for(let y=0;y<=128;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();const offset=(y/32)%2?16:0;for(let x=offset;x<=128;x+=32){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke()}}ctx.fillStyle='rgba(255,190,100,.15)';for(let y=4;y<128;y+=32)ctx.fillRect(0,y,128,3);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);texture.magFilter=THREE.NearestFilter;return texture}
  private createSteelTexture():THREE.CanvasTexture{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');if(!ctx)throw new Error('steel texture context unavailable');ctx.fillStyle='#727b80';ctx.fillRect(0,0,64,64);ctx.strokeStyle='#3d4447';ctx.lineWidth=3;ctx.strokeRect(2,2,60,60);for(const x of [8,56])for(const y of [8,56]){ctx.fillStyle='#d9bd68';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#4a452f';ctx.stroke()}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;return texture}
  private createWaterTexture():THREE.CanvasTexture{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');if(!ctx)throw new Error('water texture context unavailable');ctx.fillStyle='#286873';ctx.fillRect(0,0,64,64);ctx.strokeStyle='rgba(126,229,222,.62)';ctx.lineWidth=2;for(let y=12;y<64;y+=16){ctx.beginPath();for(let x=0;x<=64;x+=4){const yy=y+Math.sin(x*.22+y)*3;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy)}ctx.stroke()}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;return texture}
  private clearGroup(group:THREE.Group):void{while(group.children.length)group.remove(group.children[0])}
  private get<T extends HTMLElement=HTMLElement>(selector:string):T{const el=document.querySelector<T>(selector);if(!el)throw new Error(`Missing element ${selector}`);return el}

  private installTestHooks():void{window.__THREE_GAME_TEST_HOOKS__={seed:(value:number)=>{this.rng=createSeededRandom(value)},setState:(name:string)=>{if(name==='active-play'){this.loadLevel(0);this.decorateTestBattle()}else if(name==='level-2'){this.loadLevel(1);this.decorateTestBattle()}else if(name==='level-3'){this.loadLevel(2);this.decorateTestBattle()}else if(name==='level-complete'){this.loadLevel(0);this.kills=this.level.targetKills;for(const enemy of this.enemies){enemy.alive=false;enemy.group.visible=false}this.checkVictory();this.updateHud()}else if(name==='fail'){this.loadLevel(0);this.lives=0;this.player.alive=false;this.player.group.visible=false;this.mode='defeat';this.lastStatus='最后一辆守卫坦克被击毁';this.updateHud()}else if(name==='reckless'){this.loadLevel(0);this.lives=1;this.player.invulnerable=0;this.hitPlayer();this.updateHud()}else if(name==='bot-play'){this.loadLevel(0);this.spawnTimer=99;const targets=this.enemies.filter(e=>e.alive);targets[0].group.position.set(0,.35,1);targets[0].speed=0;targets[0].aiTimer=99;targets[0].direction=2;targets[1].group.position.set(0,.35,-5);targets[1].speed=0;targets[1].aiTimer=99;targets[1].direction=2;this.updateHud()}else if(name==='victory'){this.loadLevel(2);this.kills=this.level.targetKills;for(const enemy of this.enemies){enemy.alive=false;enemy.group.visible=false}this.checkVictory();this.updateHud()}else if(name==='stress'){this.loadLevel(2);this.spawnEnemy(0);if(window.innerWidth>760)this.spawnEnemy(6);this.spawnExplosion(new THREE.Vector3(-3,.4,-2),'#ff7a32',1)}else console.warn(`Unknown test state: ${name}`)},setPausedForScreenshot:(paused:boolean)=>{this.pausedForScreenshot=paused},setReducedMotion:(enabled:boolean)=>{this.reducedMotion=enabled},hideDebugUi:()=>{}}}
  private decorateTestBattle():void{this.spawnPowerup(new THREE.Vector3(-3,.5,3),'shield');this.spawnPowerup(new THREE.Vector3(3,.5,3),'rapid');if(window.innerWidth>760){const fortress=this.createTank('enemy','fortress',new THREE.Vector3(0,.35,-6));fortress.direction=2;fortress.group.rotation.y=Math.PI;this.enemies.push(fortress);this.dynamicRoot.add(fortress.group)}this.updateHud()}
  private publishDiagnostics():void{const info=this.renderer.info;window.__THREE_GAME_DIAGNOSTICS__={frame:this.frame,elapsed:this.elapsed,score:this.kills,targetScore:this.level.targetKills,complete:this.mode==='victory',failed:this.mode==='defeat',mode:this.mode,level:this.currentLevel+1,levelName:this.level.name,wave:this.getWave(),enemiesAlive:this.enemies.filter(e=>e.alive).length,baseAlive:this.baseBlock?.alive??false,player:{position:{x:this.player?.group.position.x??0,y:this.player?.group.position.y??0,z:this.player?.group.position.z??0},speed:this.player?.alive?this.tuning.playerSpeed:0,lives:this.lives},renderer:{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,materials:new Set([...this.scene.children].flatMap(root=>{const result:THREE.Material[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];result.push(...mats)}});return result})).size},canvas:{clientWidth:this.canvas.clientWidth,clientHeight:this.canvas.clientHeight,width:this.canvas.width,height:this.canvas.height,dpr:this.renderer.getPixelRatio()}}}
}
