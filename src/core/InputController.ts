import * as THREE from 'three';

type PointerState = { active:boolean; id:number|null; centerX:number; centerY:number; radius:number };

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly pointerState:PointerState = { active:false,id:null,centerX:0,centerY:0,radius:1 };
  private fireHeld = false;
  private pauseQueued = false;
  private restartQueued = false;

  private readonly onKeyDown = (event:KeyboardEvent) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.code === 'Space') this.fireHeld = true;
    if (!event.repeat && (event.code === 'KeyP' || event.code === 'Escape')) this.pauseQueued = true;
    if (!event.repeat && event.code === 'KeyR') this.restartQueued = true;
  };
  private readonly onKeyUp = (event:KeyboardEvent) => { this.keys.delete(event.code); if(event.code==='Space') this.fireHeld=false; };
  private readonly clear = () => { this.keys.clear(); this.pointer.set(0,0); this.fireHeld=false; this.pointerState.active=false; this.updateKnob(); };
  private readonly onStickDown = (event:PointerEvent) => { event.preventDefault(); const rect=this.stick.getBoundingClientRect(); Object.assign(this.pointerState,{active:true,id:event.pointerId,centerX:rect.left+rect.width/2,centerY:rect.top+rect.height/2,radius:rect.width*.42}); try{this.stick.setPointerCapture(event.pointerId)}catch{} this.updatePointer(event.clientX,event.clientY); };
  private readonly onStickMove = (event:PointerEvent) => { if(!this.pointerState.active||event.pointerId!==this.pointerState.id)return; event.preventDefault(); this.updatePointer(event.clientX,event.clientY); };
  private readonly onStickUp = (event:PointerEvent) => { if(event.pointerId!==this.pointerState.id)return; event.preventDefault(); this.pointerState.active=false; this.pointerState.id=null; this.pointer.set(0,0); this.updateKnob(); };
  private readonly onFireDown = (event:PointerEvent) => { event.preventDefault(); this.fireHeld=true; };
  private readonly onFireUp = (event:PointerEvent) => { event.preventDefault(); this.fireHeld=false; };

  constructor(private readonly stick:HTMLElement,private readonly knob:HTMLElement,private readonly fireButton:HTMLElement){
    window.addEventListener('keydown',this.onKeyDown); window.addEventListener('keyup',this.onKeyUp); window.addEventListener('blur',this.clear);
    document.addEventListener('visibilitychange',this.clear);
    stick.addEventListener('pointerdown',this.onStickDown); stick.addEventListener('pointermove',this.onStickMove); stick.addEventListener('pointerup',this.onStickUp); stick.addEventListener('pointercancel',this.onStickUp); stick.addEventListener('lostpointercapture',this.onStickUp);
    fireButton.addEventListener('pointerdown',this.onFireDown); fireButton.addEventListener('pointerup',this.onFireUp); fireButton.addEventListener('pointercancel',this.onFireUp); fireButton.addEventListener('pointerleave',this.onFireUp);
  }
  readMovement(target:THREE.Vector2):THREE.Vector2 {
    this.keyVector.set(0,0); if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))this.keyVector.x-=1; if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))this.keyVector.x+=1; if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))this.keyVector.y-=1; if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))this.keyVector.y+=1;
    target.copy(this.keyVector).add(this.pointer); if(target.lengthSq()>1)target.normalize(); return target;
  }
  isFireHeld():boolean{return this.fireHeld}
  consumePause():boolean{const value=this.pauseQueued;this.pauseQueued=false;return value}
  consumeRestart():boolean{const value=this.restartQueued;this.restartQueued=false;return value}
  dispose():void{
    window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);window.removeEventListener('blur',this.clear);document.removeEventListener('visibilitychange',this.clear);
    this.stick.removeEventListener('pointerdown',this.onStickDown);this.stick.removeEventListener('pointermove',this.onStickMove);this.stick.removeEventListener('pointerup',this.onStickUp);this.stick.removeEventListener('pointercancel',this.onStickUp);this.stick.removeEventListener('lostpointercapture',this.onStickUp);
    this.fireButton.removeEventListener('pointerdown',this.onFireDown);this.fireButton.removeEventListener('pointerup',this.onFireUp);this.fireButton.removeEventListener('pointercancel',this.onFireUp);this.fireButton.removeEventListener('pointerleave',this.onFireUp);
  }
  private updatePointer(x:number,y:number):void{const dx=x-this.pointerState.centerX,dy=y-this.pointerState.centerY;this.pointer.set(dx/this.pointerState.radius,dy/this.pointerState.radius);if(this.pointer.lengthSq()>1)this.pointer.normalize();this.updateKnob()}
  private updateKnob():void{const d=38;this.knob.style.transform=`translate(calc(-50% + ${this.pointer.x*d}px), calc(-50% + ${this.pointer.y*d}px))`}
}
