// WebAudio synthesized SFX + procedural tension BGM (no external assets).
type Sfx =
  | 'gunshot'
  | 'takedown'
  | 'pickup'
  | 'card'
  | 'alarm'
  | 'explosion'
  | 'hurt'
  | 'door'
  | 'bosshit'
  | 'victory'
  | 'defeat'
  | 'ui'
  | 'rescue'
  | 'box'
  | 'step';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private muted = false;
  private musicTimer = 0;
  private musicStep = 0;
  private bpm = 92;
  private playing = false;
  private intensity = 0; // 0 calm, 1 combat
  private lastAlarm = 0;

  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  isMuted() {
    return this.muted;
  }

  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  play(s: Sfx) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (s) {
      case 'gunshot':
        this.noiseBurst(0.16, 0.6, 1800, 0.5);
        this.tone(160, 0.1, 'square', 0.25, t);
        break;
      case 'takedown':
        this.tone(520, 0.08, 'sine', 0.3, t);
        this.tone(260, 0.12, 'sine', 0.2, t + 0.04);
        break;
      case 'pickup':
        this.tone(660, 0.07, 'triangle', 0.25, t);
        this.tone(990, 0.09, 'triangle', 0.2, t + 0.06);
        break;
      case 'card':
        this.tone(440, 0.08, 'square', 0.25, t);
        this.tone(880, 0.12, 'square', 0.2, t + 0.07);
        break;
      case 'rescue':
        this.tone(523, 0.1, 'triangle', 0.3, t);
        this.tone(659, 0.1, 'triangle', 0.3, t + 0.1);
        this.tone(784, 0.16, 'triangle', 0.3, t + 0.2);
        break;
      case 'alarm':
        if (t - this.lastAlarm < 0.3) return;
        this.lastAlarm = t;
        this.tone(880, 0.16, 'sawtooth', 0.22, t);
        this.tone(620, 0.16, 'sawtooth', 0.22, t + 0.18);
        break;
      case 'explosion':
        this.noiseBurst(0.5, 1.0, 600, 0.8);
        this.tone(80, 0.4, 'sine', 0.5, t);
        break;
      case 'hurt':
        this.tone(200, 0.12, 'sawtooth', 0.3, t);
        this.noiseBurst(0.1, 0.3, 1000, 0.3);
        break;
      case 'door':
        this.tone(120, 0.3, 'square', 0.3, t);
        this.tone(90, 0.25, 'square', 0.25, t + 0.05);
        break;
      case 'bosshit':
        this.tone(300, 0.06, 'square', 0.25, t);
        this.noiseBurst(0.08, 0.3, 2000, 0.3);
        break;
      case 'box':
        this.tone(140, 0.1, 'sine', 0.3, t);
        this.tone(110, 0.12, 'sine', 0.2, t + 0.05);
        break;
      case 'step':
        this.tone(90, 0.05, 'sine', 0.12, t);
        this.noiseBurst(0.04, 0.08, 500, 0.5);
        break;
      case 'ui':
        this.tone(440, 0.05, 'square', 0.2, t);
        break;
      case 'victory': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.3, t + i * 0.16));
        break;
      }
      case 'defeat': {
        const notes = [392, 330, 262, 196];
        notes.forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.28, t + i * 0.2));
        break;
      }
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, cutoff: number, q: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  // procedural BGM: pulsing low drone + sparse arpeggio; intensity raises pulse rate & filter
  updateMusic(dt: number) {
    if (!this.ctx) return;
    const target = this.playing ? 0.32 : 0;
    this.musicGain.gain.value = THREE_lerp(this.musicGain.gain.value, target, 0.05);
    this.musicTimer -= dt;
    const interval = this.intensity > 0.5 ? 60 / (this.bpm * 2) : 60 / this.bpm;
    if (this.musicTimer <= 0 && this.playing) {
      this.musicTimer = interval;
      const t = this.ctx.currentTime;
      const step = this.musicStep % 8;
      // bass pulse
      const bassFreq = [55, 55, 73, 55][step % 4] * (this.intensity > 0.5 ? 1 : 1);
      this.musicTone(bassFreq, interval * 0.9, 'sawtooth', 0.18, t, 320);
      // tension arpeggio
      if (step % 2 === 0) {
        const scale = [220, 261, 311, 349, 392, 311, 261, 220];
        this.musicTone(scale[step], interval * 0.8, 'triangle', 0.06, t, 1400);
      }
      if (this.intensity > 0.5 && step % 2 === 1) {
        this.musicTone(110, interval * 0.5, 'square', 0.05, t, 500);
      }
      this.musicStep++;
    }
  }

  private musicTone(freq: number, dur: number, type: OscillatorType, gain: number, when: number, cutoff: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  startMusic() {
    this.init();
    this.playing = true;
  }
  stopMusic() {
    this.playing = false;
  }

  dispose() {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}

function THREE_lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
