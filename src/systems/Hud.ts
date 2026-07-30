export type HudState={level:number;levelName:string;nextLevelName?:string;lives:number;kills:number;target:number;wave:number;baseAlive:boolean;shield:number;rapid:number;status:string;mode:'playing'|'paused'|'levelComplete'|'victory'|'defeat'};

export class Hud {
  private readonly lifePips=this.get('#life-pips');private readonly kills=this.get('#kills-value');private readonly target=this.get('#target-value');private readonly level=this.get('#level-value');private readonly wave=this.get('#wave-value');private readonly base=this.get('#base-light');private readonly status=this.get('#status-line');private readonly statusIcon=this.get('#status-icon');private readonly shield=this.get('#shield-meter');private readonly rapid=this.get('#rapid-meter');private readonly modal=this.get('#game-modal');private readonly eyebrow=this.get('#modal-eyebrow');private readonly title=this.get('#modal-title');private readonly copy=this.get('#modal-copy');private readonly action=this.get<HTMLButtonElement>('#modal-action');private readonly pause=this.get<HTMLButtonElement>('#pause-button');

  constructor(onAction:()=>void,onPause:()=>void){this.action.addEventListener('click',onAction);this.pause.addEventListener('click',onPause)}
  update(state:HudState):void{
    this.lifePips.innerHTML=[0,1,2].map(i=>`<i class="${i>=state.lives?'off':''}"></i>`).join('');
    this.kills.textContent=String(state.kills).padStart(2,'0');this.target.textContent=String(state.target);this.level.textContent=String(state.level).padStart(2,'0');this.wave.textContent=String(state.wave).padStart(2,'0');
    this.base.classList.toggle('danger',!state.baseAlive);this.status.textContent=state.status;this.statusIcon.textContent=state.baseAlive?'◆':'!';
    this.setMeter(this.shield,state.shield);this.setMeter(this.rapid,state.rapid);
    if(state.mode==='playing'){this.modal.classList.add('is-hidden');this.pause.textContent='Ⅱ';return}
    this.modal.classList.remove('is-hidden');this.pause.textContent=state.mode==='paused'?'▶':'Ⅱ';
    if(state.mode==='paused'){this.eyebrow.textContent='TACTICAL HOLD';this.title.textContent='暂停';this.copy.textContent='战场已冻结，随时返回火线';this.action.textContent='继续作战'}
    if(state.mode==='levelComplete'){this.eyebrow.textContent=`SECTOR ${state.level} SECURED`;this.title.textContent='战区肃清';this.copy.textContent=`下一关：${state.nextLevelName??'最终战区'} · 2 秒后自动转进`;this.action.textContent='立即转进'}
    if(state.mode==='victory'){this.eyebrow.textContent='MISSION COMPLETE';this.title.textContent='守卫成功';this.copy.textContent='敌军装甲纵队已被全数击溃';this.action.textContent='再战一局'}
    if(state.mode==='defeat'){this.eyebrow.textContent='MISSION FAILED';this.title.textContent=state.baseAlive?'全军覆没':'基地失守';this.copy.textContent='调整路线与射击节奏，再夺战场';this.action.textContent='重新部署'}
  }
  announce(text:string):void{this.status.animate([{transform:'translateY(0)',color:'#ded6ba'},{transform:'translateY(-3px)',color:'#ffca55'},{transform:'translateY(0)',color:'#ded6ba'}],{duration:240,easing:'ease-out'});this.status.textContent=text}
  flash():void{const app=document.querySelector('#app');app?.classList.remove('impact-flash');void(app as HTMLElement)?.offsetWidth;app?.classList.add('impact-flash')}
  private setMeter(element:HTMLElement,value:number):void{element.classList.toggle('active',value>0);element.style.setProperty('--fill',`${Math.min(100,value*10)}%`)}
  private get<T extends HTMLElement=HTMLElement>(selector:string):T{const el=document.querySelector<T>(selector);if(!el)throw new Error(`Missing HUD element: ${selector}`);return el}
}
