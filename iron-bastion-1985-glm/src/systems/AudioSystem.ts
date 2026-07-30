// All SFX synthesized with the Web Audio API — no external assets (every
// generator API key was MISSING in the credential probe). Sounds are short,
// pitch-varied, and gated behind a master mute and the AudioContext unlock.
type Wave = OscillatorType;

export class AudioSystem {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private unlocked = false;
  private muted = false;
  private rng: () => number = Math.random;

  constructor() {
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  setRng(rng: () => number): void {
    this.rng = rng;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.context = new Ctor();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.context.destination);
    this.noiseBuffer = this.makeNoise();
    this.unlocked = true;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.context!;
    const len = ctx.sampleRate * 1.0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ready(): boolean {
    return !!this.context && this.context.state === 'running';
  }

  private tone(
    freq: number,
    dur: number,
    type: Wave,
    gain = 0.5,
    sweepTo?: number,
    delay = 0,
  ): void {
    if (!this.ready()) return;
    const ctx = this.context!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.5, filterFreq = 1800, sweep = 400, delay = 0): void {
    if (!this.ready()) return;
    const ctx = this.context!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  firePlayer(): void {
    const v = 1 + (this.rng() - 0.5) * 0.1;
    this.tone(520 * v, 0.12, 'square', 0.28, 160);
  }
  fireEnemy(): void {
    const v = 1 + (this.rng() - 0.5) * 0.1;
    this.tone(300 * v, 0.12, 'sawtooth', 0.16, 110);
  }
  brickBreak(): void {
    this.noise(0.14, 0.32, 2600, 500);
  }
  steelPing(): void {
    this.tone(1400 + this.rng() * 200, 0.08, 'triangle', 0.16, 700);
    this.noise(0.05, 0.12, 4000, 2000);
  }
  explosion(): void {
    this.noise(0.5, 0.6, 1400, 120);
    this.tone(120, 0.45, 'sine', 0.5, 40);
    this.tone(70, 0.5, 'triangle', 0.3, 30);
  }
  playerHit(): void {
    this.explosion();
    this.tone(220, 0.3, 'sawtooth', 0.3, 60);
  }
  baseDestroyed(): void {
    this.explosion();
    this.tone(90, 0.9, 'sawtooth', 0.5, 30);
    this.noise(0.9, 0.5, 800, 60, 0.05);
  }
  powerup(): void {
    this.tone(440, 0.1, 'triangle', 0.3, 660);
    this.tone(660, 0.12, 'triangle', 0.3, 880, 0.08);
    this.tone(880, 0.14, 'triangle', 0.3, 1100, 0.16);
  }
  extraLife(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.25, undefined, i * 0.1));
  }
  freeze(): void {
    this.tone(1200, 0.4, 'sine', 0.25, 300);
    this.noise(0.4, 0.15, 6000, 1500);
  }
  grenade(): void {
    this.explosion();
    this.tone(160, 0.4, 'square', 0.3, 50);
  }
  uiClick(): void {
    this.tone(660, 0.05, 'square', 0.18, 880);
  }
  levelClear(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.28, undefined, i * 0.12));
  }
  gameOver(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.3, undefined, i * 0.22));
  }
  victory(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, 'square', 0.28, undefined, i * 0.15));
  }
  start(): void {
    this.tone(330, 0.1, 'square', 0.25, 660);
    this.tone(660, 0.14, 'square', 0.25, 990, 0.08);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
