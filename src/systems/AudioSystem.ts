type ToneOptions={frequency:number;endFrequency?:number;duration:number;type?:OscillatorType;volume?:number;delay?:number};

export class AudioSystem {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private unlocked=false;
  private muted=false;
  private ambience:OscillatorNode|null=null;
  private readonly unlockHandler=()=>{void this.unlock()};

  constructor(){window.addEventListener('pointerdown',this.unlockHandler,{once:true});window.addEventListener('keydown',this.unlockHandler,{once:true})}

  async unlock():Promise<void>{
    if(this.unlocked){if(this.context?.state==='suspended')await this.context.resume();return}
    const AudioContextClass=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AudioContextClass)return;
    this.context=new AudioContextClass();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.55;this.master.connect(this.context.destination);await this.context.resume();this.unlocked=true;this.startAmbience();
  }
  shoot(enemy=false):void{this.tone({frequency:enemy?150:220,endFrequency:enemy?75:95,duration:.11,type:'square',volume:enemy?.035:.07});this.noise(.06,enemy?.025:.055,850)}
  explosion(large=false):void{this.noise(large?.55:.3,large?.18:.11,large?420:650);this.tone({frequency:large?78:110,endFrequency:38,duration:large?.42:.22,type:'sawtooth',volume:large?.12:.07})}
  impact(metal=false):void{this.tone({frequency:metal?820:310,endFrequency:metal?390:170,duration:metal?.08:.11,type:metal?'square':'triangle',volume:.045})}
  powerup(type:'shield'|'rapid'):void{const base=type==='shield'?330:440;[0,.07,.14].forEach((delay,index)=>this.tone({frequency:base*(1+index*.25),duration:.12,type:'triangle',volume:.045,delay}))}
  lifeLost():void{[0,.12,.24].forEach((delay,index)=>this.tone({frequency:210-index*45,endFrequency:90-index*10,duration:.2,type:'sawtooth',volume:.06,delay}))}
  victory():void{[0,.1,.2,.36].forEach((delay,index)=>this.tone({frequency:[262,330,392,523][index],duration:.22,type:'square',volume:.045,delay}))}
  ui():void{this.tone({frequency:520,endFrequency:680,duration:.05,type:'square',volume:.025})}
  setMuted(muted:boolean):void{this.muted=muted;if(this.master&&this.context)this.master.gain.setTargetAtTime(muted?0:.55,this.context.currentTime,.03)}
  dispose():void{window.removeEventListener('pointerdown',this.unlockHandler);window.removeEventListener('keydown',this.unlockHandler);this.ambience?.stop();void this.context?.close();this.context=null;this.master=null}

  private startAmbience():void{if(!this.context||!this.master||this.ambience)return;const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sawtooth';osc.frequency.value=43;gain.gain.value=.012;osc.connect(gain).connect(this.master);osc.start();this.ambience=osc}
  private tone(options:ToneOptions):void{if(!this.context||!this.master||this.context.state!=='running')return;const now=this.context.currentTime+(options.delay??0),osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=options.type??'square';osc.frequency.setValueAtTime(options.frequency,now);if(options.endFrequency)osc.frequency.exponentialRampToValueAtTime(Math.max(20,options.endFrequency),now+options.duration);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(options.volume??.06,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+options.duration);osc.connect(gain).connect(this.master);osc.start(now);osc.stop(now+options.duration+.02)}
  private noise(duration:number,volume:number,cutoff:number):void{if(!this.context||!this.master||this.context.state!=='running')return;const frames=Math.floor(this.context.sampleRate*duration),buffer=this.context.createBuffer(1,frames,this.context.sampleRate),data=buffer.getChannelData(0);let seed=1985;for(let i=0;i<frames;i+=1){seed=(seed*1664525+1013904223)>>>0;data[i]=((seed/4294967296)*2-1)*(1-i/frames)}const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.value=volume;source.buffer=buffer;source.connect(filter).connect(gain).connect(this.master);source.start()}
}
