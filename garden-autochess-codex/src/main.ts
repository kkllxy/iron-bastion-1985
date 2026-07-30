import * as THREE from 'three';
import './styles.css';
import {ENEMIES,GRAFTS,MUTATIONS,PLANTS,SHOP_IDS,WAVES,type EnemyId,type PlantId} from './data';

type Phase='title'|'prep'|'battle'|'reward'|'paused'|'gameover'|'win';
type Unit={uid:number;id:PlantId;star:1|2|3;mutation?:0|1;col?:number;lane?:number;mesh?:THREE.Group;hp:number;cd:number;sunCd:number;fert:number};
type Foe={uid:number;id?:EnemyId;name:string;group:THREE.Group;lane:number;x:number;hp:number;maxHp:number;speed:number;damage:number;reward:number;score:number;boss:boolean;slow:number;attackCd:number};
type Shot={mesh:THREE.Mesh;lane:number;x:number;damage:number;slow:number;area:number;color:string;sunLink:boolean};
type Reward={kind:'遗物'|'天气'|'补给';icon:string;name:string;desc:string;apply:()=>void};

const LANES=5,COLS=9,CELL_X=1.52,CELL_Z=1.38,SPAWN_X=8.4,HOME_X=-7.2;
const wx=(c:number)=>(c-4)*CELL_X,wz=(l:number)=>(l-2)*CELL_Z,key=(c:number,l:number)=>`${c}:${l}`;
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene();scene.background=new THREE.Color('#22271d');scene.fog=new THREE.FogExp2('#303329',.024);
const camera=new THREE.PerspectiveCamera(39,1,.1,100);camera.position.set(-2.8,13.2,10.8);camera.lookAt(.5,0,-.3);
scene.add(new THREE.HemisphereLight('#ffeab4','#253123',2.2));
const sunLight=new THREE.DirectionalLight('#ffd59b',3.7);sunLight.position.set(-7,13,6);sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-12;sunLight.shadow.camera.right=12;sunLight.shadow.camera.top=10;sunLight.shadow.camera.bottom=-10;scene.add(sunLight);
const rim=new THREE.DirectionalLight('#8bcfa5',1.25);rim.position.set(8,6,-8);scene.add(rim);

const dom={sun:q('#sun'),hp:q('#hp'),score:q('#score'),wave:q('#wave'),phase:q('#phase'),progress:q('#progress'),shop:q('#shop'),bench:q('#bench'),prep:q('#prep'),toast:q('#toast'),synergy:q('#synergy-list'),weather:q('#weather'),relics:q('#relics'),bossHud:q('#boss-hud'),bossName:q('#boss-name'),bossHp:q('#boss-hp'),rewards:q('#rewards'),rewardCards:q('#reward-cards'),mutation:q('#mutation'),mutationCards:q('#mutation-cards'),mutationTitle:q('#mutation-title'),modal:q('#modal'),modalKicker:q('#modal-kicker'),modalTitle:q('#modal-title'),modalCopy:q('#modal-copy'),modalAction:q('#modal-action'),modalHint:q('#modal-hint'),drag:q('#drag-ghost')};
function q(sel:string){const e=document.querySelector<HTMLElement>(sel);if(!e)throw new Error(`缺少界面元素 ${sel}`);return e}

let seed=1985,rng=mulberry(seed),phase:Phase='title',resumePhase:Phase='prep',wave=1,sun=220,defense=100,score=0,locked=false,uid=1,selectedBench=-1,tool:''|'shovel'='';
let shop:(PlantId|null)[]=[],bench:(Unit|null)[]=Array(8).fill(null),board=new Map<string,Unit>(),foes:Foe[]=[],shots:Shot[]=[],spawnQueue:{at:number,id?:EnemyId,boss?:true}[]=[],battleClock=0,totalSpawn=0,deadSpawn=0;
let relics:string[]=[],weather:'晴朗'|'烈日'|'暴雨'|'浓雾'='晴朗',shovels=3,fertilizers=2,timeScale=1,last=performance.now(),toastTimer=0,shake=0,mutating:Unit|null=null;
const combatRoot=new THREE.Group();scene.add(combatRoot);
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hitPoint=new THREE.Vector3();
let audio:AudioContext|null=null,muted=false;

buildWorld();resize();addEventListener('resize',resize);bindUI();renderShop();renderBench();refreshHud();animate(performance.now());showTitle();

function buildWorld(){
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(27,18),new THREE.MeshStandardMaterial({color:'#34372b',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.12,0);ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.Group();
  for(let l=0;l<LANES;l++)for(let c=0;c<COLS;c++){
    const tile=new THREE.Mesh(new THREE.BoxGeometry(1.43,.12,1.28),new THREE.MeshStandardMaterial({color:new THREE.Color((c+l)%2?'#58613d':'#4c5738'),roughness:.92}));
    tile.position.set(wx(c),-.02,wz(l));tile.receiveShadow=true;tile.userData.cell={c,l};grid.add(tile);
    if(rng()<.22){const weed=new THREE.Mesh(new THREE.ConeGeometry(.03,.18,4),new THREE.MeshStandardMaterial({color:'#80904b'}));weed.position.set(wx(c)+(rng()-.5)*1.1,.1,wz(l)+(rng()-.5)*.9);grid.add(weed)}
  }
  scene.add(grid);
  const wallMat=new THREE.MeshStandardMaterial({color:'#65533c',roughness:.95});
  for(let i=0;i<13;i++){const post=new THREE.Mesh(new THREE.BoxGeometry(.18,1.1+rng()*.65,.18),wallMat);post.position.set(-9+i*1.55,.55,-4.5);post.rotation.z=(rng()-.5)*.12;post.castShadow=true;scene.add(post)}
  const pipeMat=new THREE.MeshStandardMaterial({color:'#4d5b53',roughness:.7,metalness:.45});
  for(let l=0;l<5;l++){const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,1.1,8),pipeMat);pipe.rotation.z=Math.PI/2;pipe.position.set(SPAWN_X-.2,.3,wz(l));scene.add(pipe)}
  const silo=new THREE.Mesh(new THREE.CylinderGeometry(1,1.12,3.1,16),new THREE.MeshStandardMaterial({color:'#5b6249',roughness:.75,metalness:.18}));silo.position.set(-8.5,1.4,-3.2);silo.castShadow=true;scene.add(silo);
  for(let i=0;i<16;i++){const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.12+rng()*.16),new THREE.MeshStandardMaterial({color:i%2?'#69624a':'#45493b'}));stone.position.set((rng()-.5)*18,.05,(rng()-.5)*10);stone.rotation.set(rng()*3,rng()*3,0);scene.add(stone)}
}

function makePlant(u:Unit){
  const d=PLANTS[u.id],g=new THREE.Group(),s=.88+(u.star-1)*.16;
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(.32,.39,.3,10),new THREE.MeshStandardMaterial({color:'#5b3825',roughness:.9}));pot.position.y=.15;pot.castShadow=true;g.add(pot);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,.45,8),new THREE.MeshStandardMaterial({color:'#4a8b45'}));stem.position.y=.52;g.add(stem);
  const mat=new THREE.MeshStandardMaterial({color:d.color,roughness:.55,emissive:d.tags.includes('电')?d.color:'#000000',emissiveIntensity:d.tags.includes('电')?.28:0});
  if(d.role==='wall'){
    const body=new THREE.Mesh(new THREE.DodecahedronGeometry(.43*s,1),mat);body.scale.y=1.2;body.position.y=.68;body.castShadow=true;g.add(body);addEyes(g,.25,.78,.37);
  }else if(d.tags.includes('菌')){
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.43*s,14,10,0,Math.PI*2,0,Math.PI/2),mat);cap.position.y=.72;cap.scale.y=.65;cap.castShadow=true;g.add(cap);addEyes(g,.22,.53,.18);
  }else{
    const head=new THREE.Mesh(new THREE.SphereGeometry(.33*s,14,12),mat);head.position.y=.72;head.castShadow=true;g.add(head);addEyes(g,.22,.77,.27);
    if(d.role==='shooter'||d.role==='lobber'){
      const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,.3,10),mat);nozzle.rotation.z=Math.PI/2;nozzle.position.set(.3,.73,0);g.add(nozzle)
    }
    if(d.tags.includes('火')){const flame=new THREE.Mesh(new THREE.ConeGeometry(.11,.35,8),new THREE.MeshStandardMaterial({color:'#ffd262',emissive:'#ff6428',emissiveIntensity:1.5}));flame.position.y=1.18;g.add(flame)}
    if(d.tags.includes('冰'))for(let i=0;i<4;i++){const ice=new THREE.Mesh(new THREE.ConeGeometry(.06,.26,6),new THREE.MeshStandardMaterial({color:'#c7f4ff',emissive:'#70cde7',emissiveIntensity:.6}));ice.position.set((i-1.5)*.12,1.06,0);g.add(ice)}
  }
  if(u.star>1)for(let i=0;i<u.star;i++){const star=new THREE.Mesh(new THREE.OctahedronGeometry(.055),new THREE.MeshBasicMaterial({color:'#ffe36a'}));star.position.set((i-(u.star-1)/2)*.18,1.28,0);g.add(star)}
  g.scale.setScalar(.95);g.userData.unit=u;return g;
}
function addEyes(g:THREE.Group,sep:number,y:number,z:number){for(const x of[-sep/2,sep/2]){const e=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),new THREE.MeshStandardMaterial({color:'#f8f0d3'}));e.position.set(x,y,z);const p=new THREE.Mesh(new THREE.SphereGeometry(.026,6,6),new THREE.MeshBasicMaterial({color:'#171914'}));p.position.set(0,0,.047);e.add(p);g.add(e)}}

function makeFoe(id?:EnemyId,boss=false){
  const d=id?ENEMIES[id]:null,color=boss?(WAVES[wave-1].boss?.color??'#884333'):(d?.color??'#667744');
  const g=new THREE.Group(),scale=boss?1.6:(d?.id==='drumcan'||d?.id==='crusher'?1.2:1);
  const mat=new THREE.MeshStandardMaterial({color,roughness:.75,metalness:id==='drumcan' ? .45 : .05});
  const body=new THREE.Mesh(new THREE.DodecahedronGeometry(.46*scale,1),mat);body.position.y=.58*scale;body.scale.y=1.13;body.castShadow=true;g.add(body);
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(.14*scale,.035*scale,6,12,Math.PI),new THREE.MeshStandardMaterial({color:'#251912'}));mouth.rotation.z=Math.PI;mouth.position.set(-.29*scale,.52*scale,0);mouth.rotation.y=Math.PI/2;g.add(mouth);
  for(const z of[-.16,.16]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.095*scale,9,7),new THREE.MeshStandardMaterial({color:'#f1e2a0'}));eye.position.set(-.27*scale,.73*scale,z*scale);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.04*scale,6,6),new THREE.MeshBasicMaterial({color:'#1d1710'}));pupil.position.x=-.08*scale;eye.add(pupil);g.add(eye)}
  for(const z of[-.25,.25])for(const x of[-.2,.2]){const foot=new THREE.Mesh(new THREE.SphereGeometry(.12*scale,7,6),mat);foot.position.set(x*scale,.13,z*scale);g.add(foot)}
  if(boss){const crown=new THREE.Mesh(new THREE.TorusKnotGeometry(.16,.05,32,7),new THREE.MeshStandardMaterial({color:'#dba94b',metalness:.6}));crown.position.y=1.45;g.add(crown)}
  return g;
}

function bindUI(){
  dom.modalAction.addEventListener('click',()=>{tone(420,.1);if(phase==='title'||phase==='gameover'||phase==='win')newGame();else if(phase==='paused')togglePause()});
  q('#reroll').addEventListener('click',reroll);q('#lock').addEventListener('click',()=>{locked=!locked;renderShop();toast(locked?'商店已锁定':'商店已解锁')});q('#graft').addEventListener('click',graft);q('#sell').addEventListener('click',sellSelected);q('#start-wave').addEventListener('click',startWave);
  q('#pause').addEventListener('click',togglePause);q('#audio').addEventListener('click',()=>{muted=!muted;q('#audio').textContent=muted?'×':'♪'});
  q('#shovel').addEventListener('click',()=>selectTool('shovel'));q('#fertilizer').addEventListener('click',useFertilizer);
  dom.shop.addEventListener('click',e=>{const card=(e.target as HTMLElement).closest<HTMLElement>('[data-shop]');if(card)buy(Number(card.dataset.shop))});
  dom.bench.addEventListener('pointerdown',e=>{const slot=(e.target as HTMLElement).closest<HTMLElement>('[data-bench]');if(!slot)return;const i=Number(slot.dataset.bench);if(!bench[i])return;selectedBench=i;renderBench();dom.drag.textContent=PLANTS[bench[i]!.id].icon;dom.drag.style.display='block';moveGhost(e)});
  addEventListener('pointermove',e=>{if(dom.drag.style.display==='block')moveGhost(e)});
  addEventListener('pointerup',e=>{if(dom.drag.style.display==='block'){dom.drag.style.display='none';if(e.target===canvas)placeAtPointer(e)}});
  canvas.addEventListener('click',e=>{if(dom.drag.style.display!=='none')return;placeAtPointer(e)});
  addEventListener('keydown',e=>{if(e.repeat)return;if(e.key==='r'||e.key==='R')reroll();if(e.key==='l'||e.key==='L'){locked=!locked;renderShop()}if(['1','2','3','4','5'].includes(e.key))buy(Number(e.key)-1);if(e.key==='q'||e.key==='Q')selectTool('shovel');if(e.key==='e'||e.key==='E')useFertilizer();if(e.code==='Space'){e.preventDefault();startWave()}if(e.key==='Escape')togglePause()});
}
function moveGhost(e:PointerEvent){dom.drag.style.left=`${e.clientX}px`;dom.drag.style.top=`${e.clientY}px`}
function screenCell(e:PointerEvent|MouseEvent){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(pointer,camera);if(!ray.ray.intersectPlane(groundPlane,hitPoint))return null;const c=Math.round(hitPoint.x/CELL_X+4),l=Math.round(hitPoint.z/CELL_Z+2);return c>=0&&c<COLS&&l>=0&&l<LANES?{c,l}:null}
function placeAtPointer(e:PointerEvent|MouseEvent){if(phase!=='prep')return;const cell=screenCell(e);if(!cell)return;const k=key(cell.c,cell.l),existing=board.get(k);
  if(tool==='shovel'){if(existing&&shovels>0){removeBoard(existing);shovels--;tool='';toast(`${PLANTS[existing.id].name} 已回收到培育盘`);renderAll()}return}
  if(selectedBench<0||!bench[selectedBench])return;if(existing){toast('该地块已有植物');return}const u=bench[selectedBench]!;bench[selectedBench]=null;u.col=cell.c;u.lane=cell.l;u.mesh=makePlant(u);u.mesh.position.set(wx(cell.c),0,wz(cell.l));combatRoot.add(u.mesh);board.set(k,u);selectedBench=-1;tone(320,.08);renderAll();
}

function showTitle(){phase='title';dom.modal.classList.remove('hidden')}
function newGame(){clearCombat();seed=1985;rng=mulberry(seed);phase='prep';wave=1;sun=220;defense=100;score=0;locked=false;relics=[];weather='晴朗';shovels=3;fertilizers=2;bench=Array(8).fill(null);board.clear();shop=[];rollShop();dom.modal.classList.add('hidden');dom.prep.classList.remove('hidden');toast('从种子商队购买植物，拖入草坪布阵');refreshHud();renderAll()}
function rollShop(){if(locked&&shop.some(Boolean))return;shop=Array.from({length:5},()=>weightedPlant())}
function weightedPlant(){const cap=Math.min(SHOP_IDS.length,4+Math.floor(wave/2));return SHOP_IDS[Math.floor(rng()*cap)]}
function reroll(){if(phase!=='prep'||sun<10)return;if(locked){toast('商店已锁定，先解锁才能刷新');return}sun-=10;rollShop();tone(660,.07);renderAll()}
function buy(i:number){if(phase!=='prep')return;const id=shop[i];if(!id)return;const d=PLANTS[id],slot=bench.findIndex(x=>!x);if(sun<d.cost){toast('阳光不足');return}if(slot<0){toast('培育盘已满');return}sun-=d.cost;bench[slot]=createUnit(id);shop[i]=null;tone(520,.08);toast(`购入 ${d.name}`);tryMerge(id,1);renderAll()}
function createUnit(id:PlantId,star:1|2|3=1):Unit{return{uid:uid++,id,star,hp:PLANTS[id].hp*Math.pow(1.8,star-1),cd:rng()*.5,sunCd:PLANTS[id].rate,fert:0}}
function allUnits(){return [...bench.filter((x):x is Unit=>!!x),...board.values()]}
function tryMerge(id:PlantId,star:1|2){const matches=allUnits().filter(u=>u.id===id&&u.star===star);if(matches.length<3)return;const used=matches.slice(0,3);used.forEach(removeUnit);const upgraded=createUnit(id,(star+1) as 2|3);const slot=bench.findIndex(x=>!x);if(slot>=0)bench[slot]=upgraded;else{const old=used.find(u=>u.col!==undefined);if(old){upgraded.col=old.col;upgraded.lane=old.lane;upgraded.mesh=makePlant(upgraded);upgraded.mesh.position.set(wx(old.col!),0,wz(old.lane!));board.set(key(old.col!,old.lane!),upgraded);combatRoot.add(upgraded.mesh)}}tone(820,.14);toast(`${PLANTS[id].name} 合成为 ${star+1}★`);if(star===2)showMutation(upgraded);else tryMerge(id,2)}
function removeUnit(u:Unit){const bi=bench.indexOf(u);if(bi>=0)bench[bi]=null;if(u.col!==undefined&&u.lane!==undefined)board.delete(key(u.col,u.lane));if(u.mesh){combatRoot.remove(u.mesh);disposeObject(u.mesh);u.mesh=undefined}u.col=undefined;u.lane=undefined}
function removeBoard(u:Unit){if(u.col===undefined||u.lane===undefined)return;const slot=bench.findIndex(x=>!x);if(slot<0){toast('培育盘没有空位');return}board.delete(key(u.col,u.lane));if(u.mesh){combatRoot.remove(u.mesh);disposeObject(u.mesh)}u.mesh=undefined;u.col=undefined;u.lane=undefined;bench[slot]=u}
function graft(){if(phase!=='prep')return;for(const[a,b,result]of GRAFTS){const ia=bench.findIndex(x=>x?.id===a),ib=bench.findIndex((x,i)=>i!==ia&&x?.id===b);if(ia>=0&&ib>=0){bench[ia]=createUnit(result);bench[ib]=null;tone(740,.16);toast(`嫁接成功：${PLANTS[result].name}`);renderAll();return}}toast('培育盘中没有可嫁接组合')}
function sellSelected(){if(phase!=='prep'||selectedBench<0||!bench[selectedBench]){toast('先选择培育盘中的植物');return}const u=bench[selectedBench]!,value=Math.max(10,Math.round((PLANTS[u.id].cost||160)*.5*Math.pow(2,u.star-1)));bench[selectedBench]=null;sun+=value;selectedBench=-1;tone(260,.08);toast(`出售 ${PLANTS[u.id].name}，返还 ${value} 阳光`);renderAll()}
function showMutation(u:Unit){mutating=u;dom.mutationTitle.textContent=`${PLANTS[u.id].name} · 选择变异方向`;dom.mutationCards.innerHTML='';MUTATIONS[u.id].forEach((m,i)=>{const c=document.createElement('button');c.className='reward-card mutation';c.innerHTML=`<small>变异 ${i+1}</small><div class="glyph">${i?'✣':'✦'}</div><b>${m.name}</b><p>${m.desc}</p>`;c.onclick=()=>{u.mutation=i as 0|1;u.hp*=m.hp;dom.mutation.classList.add('hidden');mutating=null;toast(`${PLANTS[u.id].name} 已觉醒：${m.name}`);renderAll()};dom.mutationCards.append(c)});dom.mutation.classList.remove('hidden')}

function startWave(){if(phase!=='prep'||mutating)return;if(!board.size){toast('至少先把一株植物放入草坪');return}phase='battle';battleClock=0;deadSpawn=0;spawnQueue=[];const def=WAVES[wave-1];let t=.5;for(const id of def.enemies){spawnQueue.push({at:t,id});t+=1.2+rng()*.55}if(def.boss)spawnQueue.push({at:t+1,boss:true});totalSpawn=spawnQueue.length;dom.prep.classList.add('hidden');toast(`第 ${wave} 波 · ${def.label}`);tone(190,.2);refreshHud()}
function spawnFoe(item:{id?:EnemyId,boss?:true}){const d=item.id?ENEMIES[item.id]:null,b=WAVES[wave-1].boss;const lane=Math.floor(rng()*LANES),group=makeFoe(item.id,!!item.boss),hp=(item.boss?b!.hp:d!.hp)*(1+(wave-1)*.055);const f:Foe={uid:uid++,id:item.id,name:item.boss?b!.name:d!.name,group,lane,x:SPAWN_X+rng()*.4,hp,maxHp:hp,speed:item.boss?b!.speed:d!.speed,damage:item.boss?b!.damage:d!.damage,reward:item.boss?60:d!.reward,score:item.boss?1800:d!.score,boss:!!item.boss,slow:0,attackCd:0};group.position.set(f.x,0,wz(lane));combatRoot.add(group);foes.push(f)}
function updateBattle(dt:number){battleClock+=dt;while(spawnQueue.length&&spawnQueue[0].at<=battleClock)spawnFoe(spawnQueue.shift()!);updatePlants(dt);updateShots(dt);updateFoes(dt);if(weather==='暴雨')for(const u of board.values())u.hp=Math.min(maxHp(u),u.hp+3*dt);if(!spawnQueue.length&&!foes.length)finishWave()}
function updatePlants(dt:number){const syn=synergies();for(const u of board.values()){
  const d=PLANTS[u.id],m=u.mutation===undefined?null:MUTATIONS[u.id][u.mutation],rate=d.rate*(m?.rate??1)*(syn.mushroom.has(u.uid)?.72:1),damage=d.damage*Math.pow(1.65,u.star-1)*(m?.damage??1)*(u.fert>0?1.7:1);u.cd-=dt;u.sunCd-=dt;u.fert=Math.max(0,u.fert-dt);
  if((d.role==='sun'||d.sun)&&u.sunCd<=0){u.sunCd=rate;const gain=Math.round((d.sun??18)*Math.pow(1.45,u.star-1)*(weather==='烈日'?1.5:1));sun+=gain;score+=gain;floatText(`+${gain}`,u.mesh!.position,'#ffd158');tone(780,.035)}
  if(d.role==='aura'&&u.cd<=0){u.cd=rate;for(const f of foes)if(Math.abs(f.lane-u.lane!)<=1&&Math.abs(f.x-u.mesh!.position.x)<(d.area??2.2)){damageFoe(f,damage*.7,'#b477d2')}}
  if((d.role==='shooter'||d.role==='lobber')&&u.cd<=0){const target=foes.filter(f=>f.lane===u.lane&&f.x>u.mesh!.position.x-.3).sort((a,b)=>a.x-b.x)[0];if(target){u.cd=rate;const steam=syn.steam.has(u.uid);const geo=d.role==='lobber'?new THREE.IcosahedronGeometry(.16):new THREE.SphereGeometry(.11,8,7),mat=new THREE.MeshBasicMaterial({color:steam?'#e8fbf6':d.color});const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(u.mesh!.position).add(new THREE.Vector3(.35,.75,0));combatRoot.add(mesh);shots.push({mesh,lane:u.lane!,x:mesh.position.x,damage:damage*(steam?1.35:1),slow:d.slow??(steam ? .22 : 0),area:steam?Math.max(1,d.area??0):(d.area??0),color:steam?'#dff9f5':d.color,sunLink:syn.solar.has(u.uid)});tone(d.tags.includes('火')?250:d.tags.includes('冰')?700:480,.035)}}
  u.mesh!.rotation.z=Math.sin(battleClock*2+u.uid)*.015;
 }}
function updateShots(dt:number){for(let i=shots.length-1;i>=0;i--){const s=shots[i],from=s.x;s.x+=7.5*dt;s.mesh.position.x=s.x;s.mesh.rotation.x+=dt*7;const hit=foes.filter(f=>f.lane===s.lane&&f.x>=from-.34&&f.x<=s.x+.34).sort((a,b)=>a.x-b.x)[0];if(hit){if(s.area>0){for(const f of [...foes]){if(Math.abs(f.x-hit.x)<s.area&&Math.abs(f.lane-hit.lane)<=1)damageFoe(f,s.damage*(f===hit?1:.55),s.color,s.slow)}}else{damageFoe(hit,s.damage,s.color,s.slow)}if(s.sunLink&&rng()<.22){sun+=3;floatText('+3',s.mesh.position,'#ffd158')}removeShot(i)}else if(s.x>SPAWN_X+2)removeShot(i)}}
function removeShot(i:number){const s=shots[i];combatRoot.remove(s.mesh);s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();shots.splice(i,1)}
function damageFoe(f:Foe,amount:number,color:string,slow=0){f.hp-=amount*(f.id==='drumcan'?.72:1);f.slow=Math.max(f.slow,slow?1.8:0);pulse(f.group,color);if(f.hp<=0)killFoe(f)}
function updateFoes(dt:number){const syn=synergies();for(let i=foes.length-1;i>=0;i--){const f=foes[i];if(f.hp<=0)continue;f.attackCd-=dt;f.slow=Math.max(0,f.slow-dt);const blockers=[...board.values()].filter(u=>u.lane===f.lane&&u.mesh!.position.x<f.x+.1).sort((a,b)=>b.mesh!.position.x-a.mesh!.position.x);const b=blockers[0];if(b&&f.x-b.mesh!.position.x<.72){if(f.attackCd<=0){f.attackCd=.7;b.hp-=f.damage*.7;if(syn.thorns.has(b.uid))f.hp-=f.damage*.35;shake=Math.min(.35,shake+.05);if(b.hp<=0){toast(`${PLANTS[b.id].name} 被污染物摧毁`);removeUnit(b)}}}else{f.x-=f.speed*(f.slow>0?.55:1)*(weather==='浓雾'?.85:1)*dt;f.group.position.x=f.x;f.group.position.y=Math.abs(Math.sin(battleClock*5+f.uid))*.05}if(f.x<HOME_X){defense-=f.boss?100:14;toast(`${f.name} 突破防线！`);removeFoe(f);shake=.3;if(defense<=0){defense=0;gameOver();return}}}
}
function killFoe(f:Foe){sun+=f.reward;score+=f.score;deadSpawn++;for(let n=0;n<7;n++)spark(f.group.position,f.group.children[0] instanceof THREE.Mesh?`#${(f.group.children[0].material as THREE.MeshStandardMaterial).color.getHexString()}`:'#8fa050');removeFoe(f);tone(f.boss?90:130,f.boss?.35:.08)}
function removeFoe(f:Foe){const i=foes.indexOf(f);if(i>=0)foes.splice(i,1);combatRoot.remove(f.group);disposeObject(f.group)}
function finishWave(){if(phase!=='battle')return;score+=wave*250;sun+=55+(relics.includes('日核')?20:0);if(wave>=15){winGame();return}phase='reward';showRewards();refreshHud()}
function showRewards(){const rewards:Reward[]=[
  {kind:'补给',icon:'▰',name:'高浓度肥料',desc:'获得 2 份肥料，并立刻补充 35 阳光。',apply:()=>{fertilizers+=2;sun+=35}},
  randomRelic(),randomWeather()
];dom.rewardCards.innerHTML='';rewards.forEach(r=>{const c=document.createElement('button');c.className='reward-card';c.innerHTML=`<small>${r.kind}</small><div class="glyph">${r.icon}</div><b>${r.name}</b><p>${r.desc}</p>`;c.onclick=()=>{r.apply();dom.rewards.classList.add('hidden');wave++;phase='prep';if(!locked)rollShop();dom.prep.classList.remove('hidden');resetPlants();toast(`进入第 ${wave} 波备战`);renderAll()};dom.rewardCards.append(c)});dom.rewards.classList.remove('hidden')}
function randomRelic():Reward{const pool=[['日核','☀','每波额外获得 20 阳光'],['齿轮花粉','⚙','植物攻击伤害提高 15%'],['荆棘之心','✣','甲壳根反伤联动更强'],['疯长剂','❀','全体植物最大生命提高 20%'],['余烬瓶','♨','火焰与蒸汽伤害提高']];const r=pool[Math.floor(rng()*pool.length)];return{kind:'遗物',name:r[0],icon:r[1],desc:r[2],apply:()=>{if(!relics.includes(r[0]))relics.push(r[0])}}}
function randomWeather():Reward{const pool:[typeof weather,string,string][]=[['烈日','☀','下一波阳光产量提高 50%'],['暴雨','☂','下一波植物持续恢复生命'],['浓雾','≈','下一波敌人移动速度降低 15%']];const r=pool[Math.floor(rng()*pool.length)];return{kind:'天气',name:r[0],icon:r[1],desc:r[2],apply:()=>{weather=r[0]}}}
function resetPlants(){for(const u of board.values()){u.hp=maxHp(u);u.cd=.3;u.sunCd=PLANTS[u.id].rate}}
function maxHp(u:Unit){const m=u.mutation===undefined?1:MUTATIONS[u.id][u.mutation].hp;return PLANTS[u.id].hp*Math.pow(1.8,u.star-1)*m*(relics.includes('疯长剂')?1.2:1)}
function useFertilizer(){if(phase!=='battle'||fertilizers<=0){toast(phase==='battle'?'肥料已用完':'肥料只能在战斗中使用');return}fertilizers--;for(const u of board.values()){u.fert=7;u.cd=0}tone(600,.18);toast('全园施肥：7 秒内攻击强化');refreshHud()}
function selectTool(t:'shovel'){if(phase!=='prep')return;if(shovels<=0){toast('铲子已用完');return}tool=tool===t?'':t;toast(tool==='shovel'?'点击草坪植物回收':'工具已取消');refreshHud()}
function togglePause(){if(phase==='title'||phase==='gameover'||phase==='win')return;if(phase==='paused'){phase=resumePhase;dom.modal.classList.add('hidden')}else{resumePhase=phase;phase='paused';setModal('花园暂停','时间静止','检查阵容与联动，准备好后继续。','继续守园','按 Esc 继续')}refreshHud()}
function gameOver(){phase='gameover';dom.prep.classList.add('hidden');setModal('防线失守','花圃陷落',`你守到了第 ${wave} 波，最终积分 ${score}。重新规划邻接与嫁接组合，再试一次。`,'重新播种','固定种子将复现商店与敌人路线')}
function winGame(){phase='win';score+=10000;dom.prep.classList.add('hidden');setModal('十五波肃清','花园重燃',`污染潮已退去。最终积分 ${score}，最后的绿地迎来了黎明。`,'再守一局','已完成商店、摆阵、合成、战斗、奖励与通关闭环');tone(880,.5)}
function setModal(kicker:string,title:string,copy:string,action:string,hint:string){dom.modalKicker.textContent=kicker;dom.modalTitle.textContent=title;dom.modalCopy.textContent=copy;dom.modalAction.textContent=action;dom.modalHint.textContent=hint;dom.modal.classList.remove('hidden')}

function synergies(){const solar=new Set<number>(),steam=new Set<number>(),mushroom=new Set<number>(),thorns=new Set<number>(),units=[...board.values()];for(const u of units){const adj=units.filter(v=>v!==u&&Math.abs(v.col!-u.col!)+Math.abs(v.lane!-u.lane!)===1);if(PLANTS[u.id].role==='shooter'&&adj.some(v=>PLANTS[v.id].tags.includes('日光')))solar.add(u.uid);if((PLANTS[u.id].tags.includes('火')&&adj.some(v=>PLANTS[v.id].tags.includes('冰')))||(PLANTS[u.id].tags.includes('冰')&&adj.some(v=>PLANTS[v.id].tags.includes('火'))))steam.add(u.uid);if(PLANTS[u.id].tags.includes('菌')&&adj.filter(v=>PLANTS[v.id].tags.includes('菌')).length>=2)mushroom.add(u.uid);if(PLANTS[u.id].tags.includes('墙')&&units.some(v=>v.lane===u.lane&&v.col!<u.col!&&PLANTS[v.id].tags.includes('藤')))thorns.add(u.uid)}return{solar,steam,mushroom,thorns}}
function renderAll(){renderShop();renderBench();refreshHud();renderSynergy()}
function renderShop(){dom.shop.innerHTML='';shop.forEach((id,i)=>{const c=document.createElement('button');c.className=`shop-card${!id?' empty':''}${id&&sun<PLANTS[id].cost?' disabled':''}`;c.dataset.shop=String(i);if(id){const d=PLANTS[id];c.style.setProperty('--plant',d.color);c.innerHTML=`<span class="plant-icon">${d.icon}</span><b>${d.name}</b><small>${d.desc}</small><span class="cost">✹ ${d.cost}</span>`}else c.innerHTML='<b>已售出</b>';dom.shop.append(c)});q('#lock').textContent=locked?'L 已锁定':'L 锁定'}
function renderBench(){dom.bench.innerHTML='';bench.forEach((u,i)=>{const s=document.createElement('div');s.className=`bench-slot${u?' filled':''}${selectedBench===i?' selected':''}`;s.dataset.bench=String(i);if(u){s.title=`${PLANTS[u.id].name} ${'★'.repeat(u.star)}`;s.innerHTML=`<span style="color:${PLANTS[u.id].color}">${PLANTS[u.id].icon}</span><i>${'★'.repeat(u.star)}</i>`}dom.bench.append(s)})}
function renderSynergy(){const s=synergies(),out=[];if(s.solar.size)out.push(`☀ 光合弹药 ×${s.solar.size}`);if(s.steam.size)out.push(`☁ 蒸汽共振 ×${s.steam.size}`);if(s.mushroom.size)out.push(`♣ 菌丝环网 ×${s.mushroom.size}`);if(s.thorns.size)out.push(`✣ 根藤反伤 ×${s.thorns.size}`);dom.synergy.textContent=out.join('\n')||'等待布阵'}
function refreshHud(){dom.sun.textContent=String(Math.floor(sun));dom.hp.textContent=String(Math.ceil(defense));dom.score.textContent=String(Math.floor(score)).padStart(6,'0');dom.wave.textContent=`第 ${wave} / 15 波`;dom.phase.textContent=phase==='prep'?'备战':phase==='battle'?'来袭':phase==='reward'?'奖励':phase==='paused'?'暂停':phase==='win'?'通关':'待命';const progress=phase==='battle'?(deadSpawn/(Math.max(1,totalSpawn)))*100:(wave-1)/15*100;dom.progress.style.width=`${Math.min(100,progress)}%`;dom.weather.textContent=`${weather==='晴朗'?'○':weather==='烈日'?'☀':weather==='暴雨'?'☂':'≈'} ${weather}`;dom.relics.innerHTML=relics.map(x=>`<span class="relic-chip" title="${x}">${x.slice(0,1)}</span>`).join('');const boss=foes.find(f=>f.boss);dom.bossHud.classList.toggle('show',!!boss);if(boss){dom.bossName.textContent=boss.name;dom.bossHp.style.width=`${Math.max(0,boss.hp/boss.maxHp)*100}%`}q('#shovel').innerHTML=`Q 铲子 <i>${shovels}</i>`;q('#fertilizer').innerHTML=`E 肥料 <i>${fertilizers}</i>`;q('#shovel').classList.toggle('active',tool==='shovel')}

function animate(now:number){requestAnimationFrame(animate);const scaled=Math.min(.05,(now-last)/1000)*timeScale;last=now;if(phase==='battle'){let remaining=scaled;while(remaining>0&&phase==='battle'){const step=Math.min(.035,remaining);updateBattle(step);remaining-=step}}animateWorld(Math.min(.05,scaled),now/1000);refreshHud();renderer.render(scene,camera)}
function animateWorld(dt:number,t:number){for(const f of foes){f.group.rotation.z=Math.sin(t*4+f.uid)*.025}if(shake>0){camera.position.x=-2.8+(rng()-.5)*shake;camera.position.y=13.2+(rng()-.5)*shake;shake=Math.max(0,shake-dt*1.8)}else{camera.position.x+=( -2.8-camera.position.x)*.1;camera.position.y+=(13.2-camera.position.y)*.1}if(toastTimer>0){toastTimer-=dt/timeScale;if(toastTimer<=0)dom.toast.classList.remove('show')}}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<700?52:39;camera.updateProjectionMatrix()}
function toast(msg:string){dom.toast.textContent=msg;dom.toast.classList.add('show');toastTimer=2.1}
function tone(freq:number,dur:number){if(muted)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{/* 音频不可用时静默降级 */}}
function pulse(g:THREE.Group,color:string){const ring=new THREE.Mesh(new THREE.RingGeometry(.2,.3,16),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.copy(g.position);ring.position.y=.08;combatRoot.add(ring);const start=performance.now();const tick=()=>{const p=(performance.now()-start)/260;ring.scale.setScalar(1+p*2);(ring.material as THREE.MeshBasicMaterial).opacity=1-p;if(p<1)requestAnimationFrame(tick);else{combatRoot.remove(ring);ring.geometry.dispose();(ring.material as THREE.Material).dispose()}};tick()}
function spark(pos:THREE.Vector3,color:string){const m=new THREE.Mesh(new THREE.TetrahedronGeometry(.07),new THREE.MeshBasicMaterial({color}));m.position.copy(pos);m.position.add(new THREE.Vector3((rng()-.5)*.7,.4+rng()*.7,(rng()-.5)*.7));combatRoot.add(m);const vy=.8+rng(),vx=(rng()-.5)*2,vz=(rng()-.5)*2;let life=.5;const run=()=>{const d=.016;life-=d;m.position.add(new THREE.Vector3(vx*d,vy*d,vz*d));m.rotation.x+=.2;m.scale.setScalar(Math.max(0,life*2));if(life>0)requestAnimationFrame(run);else{combatRoot.remove(m);m.geometry.dispose();(m.material as THREE.Material).dispose()}};run()}
function floatText(text:string,pos:THREE.Vector3,color:string){const e=document.createElement('div');e.textContent=text;e.style.cssText=`position:absolute;z-index:30;color:${color};font-weight:900;pointer-events:none;text-shadow:0 2px 3px #000`;document.body.append(e);const v=pos.clone().project(camera),x=(v.x*.5+.5)*innerWidth,y=(-v.y*.5+.5)*innerHeight;e.style.left=`${x}px`;e.style.top=`${y}px`;e.animate([{transform:'translate(-50%,0)',opacity:1},{transform:'translate(-50%,-45px)',opacity:0}],{duration:900}).onfinish=()=>e.remove()}
function disposeObject(o:THREE.Object3D){o.traverse(x=>{if(x instanceof THREE.Mesh){x.geometry.dispose();const mats=Array.isArray(x.material)?x.material:[x.material];mats.forEach(m=>m.dispose())}})}
function clearCombat(){for(const u of board.values())if(u.mesh){combatRoot.remove(u.mesh);disposeObject(u.mesh)}for(const f of foes){combatRoot.remove(f.group);disposeObject(f.group)}while(shots.length)removeShot(shots.length-1);foes=[];spawnQueue=[];board.clear()}
function mulberry(s:number){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function testState(){const syn=synergies();return{phase,wave,sun,defense,score,deadSpawn,totalSpawn,enemyCount:foes.length,queued:spawnQueue.length,shotCount:shots.length,shots:shots.map(s=>({lane:s.lane,x:s.x,damage:s.damage})),battleClock,foes:foes.map(f=>({lane:f.lane,x:f.x,hp:f.hp})),bench:bench.filter(Boolean).map(u=>({id:u!.id,star:u!.star})),board:[...board.values()].map(u=>({id:u.id,star:u.star,col:u.col,lane:u.lane,cd:u.cd})),shop:[...shop],synergies:{solar:syn.solar.size,steam:syn.steam.size,mushroom:syn.mushroom.size,thorns:syn.thorns.size},weather,relics:[...relics]}}
function testSeed(s:number){seed=s;rng=mulberry(s);if(phase==='prep'){shop=[];rollShop();renderAll()}}
function testAdd(id:PlantId,star:1|2|3=1){const i=bench.findIndex(x=>!x);if(i<0)return false;bench[i]=createUnit(id,star);if(star<3)tryMerge(id,star as 1|2);renderAll();return true}
function testPlace(index:number,col:number,lane:number){const u=bench[index];if(!u||board.has(key(col,lane)))return false;bench[index]=null;u.col=col;u.lane=lane;u.mesh=makePlant(u);u.mesh.position.set(wx(col),0,wz(lane));combatRoot.add(u.mesh);board.set(key(col,lane),u);renderAll();return true}
function forceWaveClear(){if(phase!=='battle')return false;spawnQueue=[];for(const f of [...foes])removeFoe(f);finishWave();return true}
declare global{interface Window{__GARDEN_TEST__:{state:()=>ReturnType<typeof testState>;seed:(s:number)=>void;newGame:()=>void;add:(id:PlantId,star?:1|2|3)=>boolean;place:(index:number,col:number,lane:number)=>boolean;startWave:()=>void;forceWaveClear:()=>boolean;pickReward:(index:number)=>void;setTimeScale:(n:number)=>void}}}
window.__GARDEN_TEST__={state:testState,seed:testSeed,newGame,add:testAdd,place:testPlace,startWave,forceWaveClear,pickReward:(i:number)=>(dom.rewardCards.children[i] as HTMLElement)?.click(),setTimeScale:(n:number)=>{timeScale=Math.max(1,Math.min(30,n))}};
