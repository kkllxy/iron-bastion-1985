// ponytail: all audio is procedural Web Audio (no asset files). Pitch-varied
// SFX + a lookahead-scheduled chiptune loop. Audio randomness uses Math.random
// because it never touches the seeded gameplay/visual simulation.

type Mood = 'menu' | 'streets' | 'subway' | 'factory';

const NOTE: Record<string, number> = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0, C4: 261.63, D4: 293.66,
  E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, E5: 659.25,
};

const PATTERNS: Record<Mood, { bpm: number; bass: string[]; lead: string[] }> = {
  menu: { bpm: 96, bass: ['A2', 'A2', 'E2', 'G2'], lead: ['A3', 'C4', 'E4', 'A4'] },
  streets: { bpm: 124, bass: ['A2', 'A2', 'C3', 'E3', 'G2', 'G2', 'B2', 'D3'], lead: ['A4', 'C5', 'E5', 'A4', 'G4', 'B2', 'D4', 'G4'] },
  subway: { bpm: 110, bass: ['D2', 'D2', 'F2', 'A2', 'C3', 'C3', 'E3', 'G3'], lead: ['D4', 'F2', 'A3', 'D4', 'C4', 'E3', 'G3', 'C4'] },
  factory: { bpm: 132, bass: ['E2', 'E2', 'G2', 'B2', 'D3', 'D3', 'C3', 'E3'], lead: ['E4', 'G4', 'B2', 'E5', 'D4', 'C4', 'E3', 'G4'] },
};

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;
  private duck = 1;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private mood: Mood = 'menu';
  private muted = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    // white-noise buffer for percussion / impact body
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    await this.ctx.resume();
    this.unlocked = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setDuck(value: number): void {
    this.duck = value;
    if (this.musicGain) this.musicGain.gain.value = 0.32 * value;
  }

  // --- SFX ---
  private blip(
    type: OscillatorType,
    freq0: number,
    freq1: number,
    dur: number,
    gain: number,
    pitchVar = 0.06,
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    const shift = 1 + (Math.random() - 0.5) * pitchVar;
    osc.frequency.setValueAtTime(freq0 * shift, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq1 * shift), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * this.duck, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, hp = 400): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * this.duck, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

  swing(): void {
    this.noise(0.08, 0.18, 1200);
  }
  hit(): void {
    this.blip('square', 220, 90, 0.12, 0.32);
    this.noise(0.09, 0.3, 600);
  }
  enemyHit(): void {
    this.blip('square', 320, 140, 0.1, 0.22);
    this.noise(0.07, 0.2, 900);
  }
  heavyHit(): void {
    this.blip('sawtooth', 160, 50, 0.18, 0.4);
    this.noise(0.14, 0.45, 300);
  }
  enemyDie(): void {
    this.blip('square', 420, 60, 0.28, 0.28);
    this.noise(0.2, 0.3, 500);
  }
  jump(): void {
    this.blip('square', 320, 720, 0.16, 0.22);
  }
  land(): void {
    this.noise(0.08, 0.22, 300);
    this.blip('sine', 140, 70, 0.1, 0.18);
  }
  special(): void {
    this.blip('sawtooth', 180, 900, 0.3, 0.3);
    this.noise(0.25, 0.3, 200);
  }
  grab(): void {
    this.blip('triangle', 200, 120, 0.12, 0.2);
  }
  throwFx(): void {
    this.blip('square', 300, 700, 0.18, 0.24);
  }
  pickup(): void {
    this.blip('triangle', 520, 980, 0.16, 0.22);
  }
  health(): void {
    this.blip('triangle', 480, 880, 0.12, 0.22);
    this.blip('triangle', 720, 1100, 0.16, 0.18);
  }
  hurt(): void {
    this.blip('sawtooth', 300, 120, 0.18, 0.3);
  }
  bossHit(): void {
    this.blip('square', 180, 90, 0.12, 0.18);
    this.noise(0.1, 0.25, 500);
  }
  bossDie(): void {
    this.blip('sawtooth', 220, 40, 0.7, 0.4);
    this.noise(0.6, 0.4, 200);
  }
  uiClick(): void {
    this.blip('square', 600, 600, 0.05, 0.18, 0);
  }
  levelStart(): void {
    this.blip('square', 392, 392, 0.1, 0.2, 0);
    window.setTimeout(() => this.blip('square', 523, 523, 0.1, 0.2, 0), 120);
    window.setTimeout(() => this.blip('square', 659, 659, 0.16, 0.2, 0), 240);
  }
  win(): void {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => window.setTimeout(() => this.blip('triangle', f, f, 0.18, 0.24, 0), i * 140));
  }
  lose(): void {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => window.setTimeout(() => this.blip('sawtooth', f, f * 0.98, 0.3, 0.26, 0), i * 180));
  }

  // --- BGM (lookahead scheduler) ---
  startMusic(mood: Mood): void {
    if (!this.ctx) return;
    this.mood = mood;
    if (this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduler(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  private scheduler(): void {
    if (!this.ctx || !this.musicGain) return;
    const pat = PATTERNS[this.mood];
    const spb = 60 / pat.bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(pat, this.step, this.nextNoteTime);
      this.nextNoteTime += spb;
      this.step = (this.step + 1) % pat.bass.length;
    }
  }

  private playStep(pat: { bass: string[]; lead: string[] }, step: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;
    const bassNote = pat.bass[step % pat.bass.length];
    const leadNote = pat.lead[step % pat.lead.length];
    if (step % 2 === 0) {
      // bass
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = NOTE[bassNote] ?? 110;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.5, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      osc.connect(g).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.24);
    }
    if (step % 1 === 0 && NOTE[leadNote]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = NOTE[leadNote] ?? 440;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.07, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      osc.connect(g).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.12);
    }
    if (step % 4 === 0) {
      // kick
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      osc.connect(g).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.16);
    }
    if (step % 4 === 2) {
      // hat
      if (!this.noiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      src.connect(f).connect(g).connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.06);
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
