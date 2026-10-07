export type Sfx =
  | 'jump' | 'doubleJump' | 'dash' | 'land' | 'collect' | 'enemyDefeat' | 'hurt'
  | 'checkpoint' | 'portal' | 'complete' | 'node' | 'click' | 'splash' | 'zap' | 'alert'
  | 'coreNear' | 'step' | 'pulse' | 'unlock' | 'relic' | 'secret' | 'blip' | 'chirp' | 'windup'
  | 'break' | 'door' | 'stun' | 'mission' | 'beam' | 'skid' | 'hardLand' | 'ghost';

/**
 * Procedural sound effects + a light Afrobeats-flavoured music loop, all synthesised
 * with WebAudio so no audio assets are required.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicOn = true;
  private musicVol = 0.7;
  private sfxVol = 0.9;
  private collectStreak = 0;
  private lastCollect = 0;
  private nextStepTime = 0;
  private step = 0;
  private timer: number | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.4 * this.musicVol;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    this.applyMusic();
    return this.musicOn;
  }

  /** 0..1 volumes from Settings. */
  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.applyMusic();
  }

  private ducked = false;
  private applyMusic() {
    if (!this.ctx) return;
    const v = this.musicOn ? 0.4 * this.musicVol * (this.ducked ? 0.3 : 1) : 0;
    this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  /** Duck/unduck music (pause menu, dialogue, discoveries). */
  setMusicDuck(duck: boolean) {
    this.ducked = duck;
    this.applyMusic();
  }

  // ---------- primitives ----------
  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; delay?: number; attack?: number; bus?: GainNode } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    const v = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(opts.bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; delay?: number; bus?: GainNode; at?: number } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = opts.at ?? ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  play(name: Sfx) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone(320, 0.16, { type: 'square', vol: 0.09, slide: 720 });
        this.tone(640, 0.12, { type: 'sine', vol: 0.12, slide: 1100 });
        break;
      case 'doubleJump':
        this.tone(480, 0.2, { type: 'square', vol: 0.08, slide: 1200 });
        this.tone(960, 0.18, { type: 'sine', vol: 0.1, slide: 1800, delay: 0.04 });
        this.noise(0.18, { vol: 0.12, freq: 3000, sweep: 6000 });
        break;
      case 'dash':
        this.noise(0.28, { vol: 0.35, freq: 600, sweep: 4000, q: 0.8 });
        this.tone(180, 0.2, { type: 'sawtooth', vol: 0.06, slide: 90 });
        break;
      case 'land':
        this.noise(0.08, { vol: 0.15, freq: 300, type: 'lowpass' });
        break;
      case 'collect': {
        // Pitch climbs with quick successive pickups — very satisfying in a row
        const now = this.ctx.currentTime;
        this.collectStreak = now - this.lastCollect < 2.2 ? Math.min(this.collectStreak + 1, 8) : 0;
        this.lastCollect = now;
        const up = Math.pow(2, (this.collectStreak * 2) / 12);
        const notes = [880, 1108.7, 1318.5, 1760];
        notes.forEach((n, i) => this.tone(n * up, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.045 }));
        this.tone(2637 * up, 0.4, { type: 'sine', vol: 0.05, delay: 0.18 });
        break;
      }
      case 'ghost':
        this.tone(1320, 0.18, { type: 'sine', vol: 0.05 });
        break;
      case 'coreNear':
        this.tone(1760 + Math.random() * 200, 0.5, { type: 'sine', vol: 0.025, attack: 0.05 });
        this.tone(2637, 0.6, { type: 'sine', vol: 0.015, delay: 0.08, attack: 0.05 });
        break;
      case 'step':
        this.noise(0.05, { vol: 0.05, freq: 900 + Math.random() * 400, q: 1.5 });
        break;
      case 'skid':
        this.noise(0.22, { vol: 0.12, freq: 2200, sweep: 900, q: 2 });
        break;
      case 'hardLand':
        this.tone(120, 0.22, { type: 'sine', vol: 0.35, slide: 45 });
        this.noise(0.18, { vol: 0.2, freq: 400, type: 'lowpass' });
        break;
      case 'pulse':
        this.tone(160, 0.6, { type: 'sine', vol: 0.4, slide: 55 });
        this.tone(640, 0.45, { type: 'triangle', vol: 0.12, slide: 1600 });
        this.noise(0.5, { vol: 0.18, freq: 1200, sweep: 6000, q: 1.2 });
        break;
      case 'unlock': {
        const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        seq.forEach((n, i) => { this.tone(n, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.09 }); this.tone(n * 2, 0.3, { type: 'sine', vol: 0.04, delay: i * 0.09 }); });
        [261.63, 392, 523.25].forEach((n) => this.tone(n, 1.8, { type: 'sine', vol: 0.09, delay: 0.45, attack: 0.1 }));
        this.noise(1.2, { vol: 0.08, freq: 5000, delay: 0.4 });
        break;
      }
      case 'relic':
        [392, 466.16, 587.33, 698.46, 932.33].forEach((n, i) => this.tone(n, 1.2, { type: 'sine', vol: 0.09, delay: i * 0.14, attack: 0.04 }));
        this.tone(98, 2, { type: 'triangle', vol: 0.12, attack: 0.3 });
        break;
      case 'secret':
        [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((n, i) => this.tone(n, 0.3, { type: 'square', vol: 0.04, delay: i * 0.07 }));
        this.tone(1975, 0.6, { type: 'sine', vol: 0.06, delay: 0.38 });
        break;
      case 'blip':
        this.tone(620 + Math.random() * 120, 0.04, { type: 'square', vol: 0.025 });
        break;
      case 'chirp': {
        const b = 1200 + Math.random() * 600;
        this.tone(b, 0.07, { type: 'square', vol: 0.025, slide: b * 1.5 });
        this.tone(b * 1.2, 0.07, { type: 'square', vol: 0.02, delay: 0.09, slide: b * 0.9 });
        break;
      }
      case 'windup':
        this.tone(300, 0.4, { type: 'sawtooth', vol: 0.04, slide: 900 });
        break;
      case 'break':
        this.noise(0.5, { vol: 0.4, freq: 700, sweep: 150, q: 0.7 });
        this.tone(90, 0.3, { type: 'sine', vol: 0.3, slide: 40 });
        for (let i = 0; i < 4; i++) this.noise(0.08, { vol: 0.12, freq: 2000 + Math.random() * 2000, delay: 0.05 + i * 0.07 });
        break;
      case 'door':
        this.tone(110, 0.9, { type: 'sawtooth', vol: 0.06, slide: 440 });
        this.noise(0.9, { vol: 0.12, freq: 3000, sweep: 300, q: 2 });
        break;
      case 'stun':
        this.tone(1400, 0.35, { type: 'square', vol: 0.03, slide: 300 });
        break;
      case 'mission':
        [784, 988, 1175].forEach((n, i) => this.tone(n, 0.28, { type: 'triangle', vol: 0.09, delay: i * 0.08 }));
        break;
      case 'beam':
        this.tone(1800, 1.6, { type: 'sine', vol: 0.06, slide: 220, attack: 0.05 });
        this.noise(1.6, { vol: 0.12, freq: 6000, sweep: 400, q: 3 });
        break;
      case 'enemyDefeat':
        this.tone(600, 0.25, { type: 'square', vol: 0.1, slide: 120 });
        this.noise(0.25, { vol: 0.25, freq: 1800, sweep: 300 });
        this.tone(1200, 0.1, { type: 'sine', vol: 0.12, delay: 0.12, slide: 1600 });
        break;
      case 'hurt':
        this.tone(300, 0.3, { type: 'sawtooth', vol: 0.12, slide: 80 });
        this.noise(0.2, { vol: 0.2, freq: 500 });
        break;
      case 'checkpoint': {
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.08 }));
        this.noise(0.6, { vol: 0.06, freq: 6000, delay: 0.25 });
        break;
      }
      case 'node':
        this.tone(220, 0.6, { type: 'sawtooth', vol: 0.06, slide: 880 });
        [659.25, 987.77].forEach((n, i) => this.tone(n, 0.4, { type: 'triangle', vol: 0.12, delay: 0.25 + i * 0.1 }));
        break;
      case 'portal':
        this.tone(110, 1.6, { type: 'sine', vol: 0.25, slide: 880, attack: 0.3 });
        this.noise(1.6, { vol: 0.2, freq: 400, sweep: 8000, q: 2 });
        for (let i = 0; i < 8; i++) this.tone(800 + i * 220, 0.25, { type: 'sine', vol: 0.05, delay: 0.3 + i * 0.12 });
        break;
      case 'complete': {
        const seq: [number, number][] = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [987.77, 0.6], [1046.5, 0.72], [1318.5, 0.84]];
        seq.forEach(([n, d]) => { this.tone(n, 0.35, { type: 'square', vol: 0.06, delay: d }); this.tone(n, 0.45, { type: 'triangle', vol: 0.1, delay: d }); });
        [261.63, 329.63, 392].forEach((n) => this.tone(n, 1.6, { type: 'triangle', vol: 0.08, delay: 0.84, attack: 0.05 }));
        break;
      }
      case 'click':
        this.tone(900, 0.06, { type: 'square', vol: 0.05 });
        break;
      case 'splash':
        this.noise(0.6, { vol: 0.35, freq: 900, sweep: 200, q: 0.6 });
        break;
      case 'zap':
        this.tone(90, 0.25, { type: 'sawtooth', vol: 0.12, slide: 60 });
        this.noise(0.25, { vol: 0.2, freq: 5000, q: 3 });
        break;
      case 'alert':
        this.tone(1400, 0.08, { type: 'square', vol: 0.05 });
        this.tone(1800, 0.1, { type: 'square', vol: 0.05, delay: 0.08 });
        break;
    }
  }

  // ---------- music: a 2-bar groove at 108 BPM ----------
  private startMusic() {
    if (this.timer !== null || !this.ctx) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = this.ctx; if (!ctx) return;
    const stepDur = 60 / 108 / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step % 32, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private playStep(s: number, t: number) {
    const ctx = this.ctx!;
    const bus = this.musicBus;
    const at = (n: number, dur: number, type: OscillatorType, vol: number, slide?: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(n, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
    };
    const beat = s % 16;
    // Kick: four-on-the-floor-ish with a skip
    if (beat === 0 || beat === 6 || beat === 8 || beat === 12) at(140, 0.18, 'sine', 0.9, 42);
    // Clap/snare on 2 & 4
    if (beat === 4 || beat === 12) this.noise(0.14, { vol: 0.35, freq: 1500, q: 0.9, at: t, bus });
    // Shaker 16ths with accents
    this.noise(0.04, { vol: beat % 4 === 2 ? 0.16 : 0.07, freq: 8000, type: 'highpass', at: t, bus });
    // Log-drum bass (amapiano-ish pitch drop)
    const bass = [55, 0, 0, 55, 0, 0, 65.4, 0, 0, 0, 73.4, 0, 65.4, 0, 0, 0, 49, 0, 0, 49, 0, 0, 55, 0, 0, 0, 65.4, 0, 73.4, 0, 82.4, 0];
    if (bass[s]) at(bass[s] * 2, 0.32, 'sine', 0.55, bass[s] * 1.4);
    // Bright marimba-like pentatonic riff
    const mel = [0, 880, 0, 784, 659, 0, 784, 0, 587, 0, 659, 0, 0, 523, 0, 587, 0, 880, 0, 784, 659, 0, 1047, 0, 880, 0, 784, 0, 659, 0, 587, 0];
    if (mel[s]) { at(mel[s], 0.22, 'triangle', 0.12); at(mel[s] * 2, 0.08, 'sine', 0.05); }
    // Guitar-ish highlife chops on the off-beats
    if (beat % 4 === 2) {
      const chord = s < 16 ? [440, 554, 659] : [392, 494, 587];
      chord.forEach((n) => at(n, 0.09, 'square', 0.025));
    }
  }
}
