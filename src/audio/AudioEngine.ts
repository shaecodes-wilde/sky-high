import { BPM, CHORDS, FORM, MIX, SECTIONS, STEM_LEVELS, STEP_SECONDS, STEPS_PER_BAR, type Section } from '../config/audio';
import type { CharacterId } from '../render/characters';

// Web Audio engine: one context, fixed bus graph, a look-ahead scheduler
// running against the audio clock, and rate-limited sound effects.
// Gameplay never waits on music: effects play immediately; only the
// arrangement changes (stem fades, section cues) snap to bar boundaries.

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export type Sfx =
  | 'jump'
  | 'land'
  | 'dash'
  | 'skim'
  | 'curl'
  | 'uncurl'
  | 'pumpGood'
  | 'pumpPerfect'
  | 'rollLand'
  | 'rollJump'
  | 'rollBrake'
  | 'spring'
  | 'springBoost'
  | 'ring'
  | 'seed'
  | 'fragment'
  | 'keepsake'
  | 'checkpoint'
  | 'death'
  | 'respawn'
  | 'wall'
  | 'parade'
  | 'goal'
  | 'uiMove'
  | 'uiSelect';

const RATE_LIMIT: Partial<Record<Sfx | 'squeak' | 'bells', number>> = {
  land: 0.08,
  jump: 0.05,
  skim: 0.16,
  curl: 0.18,
  uncurl: 0.18,
  pumpGood: 0.12,
  pumpPerfect: 0.12,
  rollLand: 0.1,
  rollJump: 0.05,
  rollBrake: 0.22,
  ring: 0.1,
  wall: 0.25,
  seed: 0.03,
  squeak: 0.9,
  bells: 0.35,
  uiMove: 0.05,
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type MusicMode = 'off' | 'title' | 'play';

export class AudioEngine {
  ctx: AudioContext | null = null;
  status: 'idle' | 'running' | 'blocked' | 'unsupported' = 'idle';
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private stems: GainNode[] = [];
  private reverbIn!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private last = new Map<string, number>();

  private mode: MusicMode = 'off';
  private nextTime = 0;
  private stepInBar = 0;
  private section: Section = SECTIONS.intro;
  private barInSection = 0;
  private formIndex = -1;
  private pending: Section['name'] | null = null;
  private tier = 0;
  private fragments = 0;
  private character: CharacterId = 'poppy';
  private chord = CHORDS.Fmaj7;
  private paused = false;

  musicVolume: number = MIX.musicDefault;
  sfxVolume: number = MIX.sfxDefault;
  muted = false;

  /** Must be called from a user gesture (the Start button / key). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.status = 'unsupported';
        return;
      }
      this.ctx = new Ctor();
      this.build();
    }
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch {
      /* handled below */
    }
    this.status = this.ctx.state === 'running' ? 'running' : 'blocked';
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = MIX.reverbSend;
    this.reverbIn.connect(reverb);
    reverb.connect(this.musicBus);
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicBus);
      this.stems.push(g);
    }
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : MIX.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicVolume, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.03);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  // ── transport ──────────────────────────────────────────────────────────
  pause(): void {
    if (!this.ctx || this.paused) return;
    this.paused = true;
    void this.ctx.suspend();
  }

  resume(): void {
    if (!this.ctx || !this.paused) return;
    this.paused = false;
    void this.ctx.resume().then(() => {
      this.status = this.ctx!.state === 'running' ? 'running' : 'blocked';
    });
  }

  /** Starts (or retargets) the score. Idempotent: never stacks a second track. */
  playMusic(mode: 'title' | 'play'): void {
    if (!this.ctx) return;
    if (this.mode === 'off') {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.stepInBar = 0;
      this.section = SECTIONS.intro;
      this.barInSection = 0;
      this.formIndex = -1;
      this.firstBar = true;
    }
    this.mode = mode;
    if (mode === 'title') this.tier = 0;
  }

  /** Back to the opening phrase at the next bar (full restart / title). */
  restartArrangement(): void {
    this.pending = 'intro';
    this.formIndex = -1;
  }

  setTier(t: number): void {
    this.tier = this.mode === 'title' ? 0 : t;
  }

  setFragments(n: number): void {
    this.fragments = n;
  }

  setCharacter(c: CharacterId): void {
    this.character = c;
  }

  cue(section: 'parade' | 'ending'): void {
    this.pending = section;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off' || this.paused) return;
    // If the tab stalled, skip ahead rather than bursting a backlog of notes.
    if (this.nextTime < ctx.currentTime - 0.25) {
      this.nextTime = ctx.currentTime + 0.05;
      this.stepInBar = 0;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.nextTime);
      this.nextTime += STEP_SECONDS;
      this.stepInBar = (this.stepInBar + 1) % STEPS_PER_BAR;
    }
  }

  private advanceBar(): void {
    this.barInSection++;
    const len = this.section.chords.length;
    if (this.pending) {
      this.section = SECTIONS[this.pending];
      this.barInSection = 0;
      this.pending = null;
      return;
    }
    if (this.barInSection < len) return;
    this.barInSection = 0;
    if (this.section.name === 'ending') {
      this.section = SECTIONS.intro;
      return;
    }
    this.formIndex = (this.formIndex + 1) % FORM.length;
    this.section = SECTIONS[FORM[this.formIndex]];
  }

  private scheduleStep(t: number): void {
    const k = this.stepInBar;
    if (k === 0) {
      if (this.firstBar) this.firstBar = false;
      else this.advanceBar();
      this.applyArrangement(t);
    }
    const s = this.section;
    const bar = this.barInSection;
    const chord = CHORDS[s.chords[bar % s.chords.length]];
    this.chord = chord;
    const barDur = STEP_SECONDS * STEPS_PER_BAR;

    // Stem 0: atmosphere & harmony.
    if (k === 0) this.pad(chord.pad, t, barDur * 1.02);
    if (k === 6 || k === 14) this.musicBox(chord.pad[(bar + k) % 4] + 24, t, 0.05, this.stems[0]);

    // Stem 1: melody (fragments add an octave sparkle and an echo).
    for (const [step, midi, len] of s.melody[bar % s.melody.length] ?? []) {
      if (step !== k) continue;
      this.celesta(midi, t, len * STEP_SECONDS, 0.16);
      if (this.fragments >= 1) this.musicBox(midi + 12, t, 0.035, this.stems[1]);
      if (this.fragments >= 2) this.celesta(midi, t + STEP_SECONDS * 3, len * STEP_SECONDS, 0.05);
    }

    // Stem 2: plucked bass + light percussion.
    const half = s.halfTime;
    const bassSteps = half ? [0, 8, 11] : [0, 6, 10, 14];
    const bassNotes = half ? [0, 12, 7] : [0, 12, 7, 12];
    const bi = bassSteps.indexOf(k);
    if (bi >= 0) this.bass(chord.root + bassNotes[bi], t);
    if (k % 4 === 2) this.shaker(t, 0.05);
    if (k === 0 || (!half && k === 8)) this.kick(t, 0.35, this.stems[2]);

    // Stem 3: fuller breakbeat + mallet countermelody.
    const kicks = half ? [0, 6] : [0, 10];
    const snares = half ? [8] : [4, 12];
    if (kicks.includes(k)) this.kick(t, 0.6, this.stems[3]);
    if (snares.includes(k)) this.snare(t, 0.32);
    if (!half && (k === 7 || k === 15)) this.snare(t, 0.08);
    if (k % 2 === 0) this.hat(t, k % 4 === 0 ? 0.07 : 0.045);
    const arp = [0, 3, 6, 8, 11, 14].indexOf(k);
    if (arp >= 0) this.mallet(chord.pad[arp % 4] + 12 + (arp >= 4 ? 12 : 0), t, 0.07);
  }

  private firstBar = true;

  private applyArrangement(t: number): void {
    let tier = this.tier;
    if (this.section.name === 'parade') tier = 2;
    if (this.section.name === 'ending') tier = 1;
    const levels = STEM_LEVELS[tier];
    this.stems.forEach((g, i) => g.gain.setTargetAtTime(levels[i], t, 0.25));
  }

  // ── instruments ────────────────────────────────────────────────────────
  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private celesta(midi: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.stems[1]);
    g.connect(this.reverbIn);
    const decay = Math.min(1.6, 0.5 + len);
    this.env(g, t, vol, 0.005, decay);
    this.osc('sine', mtof(midi), t, decay, g);
    const g2 = ctx.createGain();
    g2.connect(g);
    g2.gain.setValueAtTime(0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    this.osc('sine', mtof(midi) * 4, t, 0.3, g2);
  }

  private musicBox(midi: number, t: number, vol: number, dest: AudioNode): void {
    const g = this.ctx!.createGain();
    g.connect(dest);
    g.connect(this.reverbIn);
    this.env(g, t, vol, 0.003, 0.7);
    this.osc('triangle', mtof(midi), t, 0.75, g);
    const g2 = this.ctx!.createGain();
    g2.gain.value = 0.25;
    g2.connect(g);
    this.osc('sine', mtof(midi) * 5.04, t, 0.2, g2);
  }

  private mallet(midi: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.connect(this.stems[3]);
    const g = ctx.createGain();
    g.connect(f);
    this.env(g, t, vol, 0.004, 0.32);
    this.osc('triangle', mtof(midi), t, 0.35, g);
  }

  private pad(notes: number[], t: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 + this.tier * 350;
    f.Q.value = 0.4;
    f.connect(this.stems[0]);
    f.connect(this.reverbIn);
    const g = ctx.createGain();
    g.connect(f);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.35);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = this.osc('sawtooth', mtof(n), t, dur + 0.3, g);
        o.detune.value = det;
      }
    }
  }

  private bass(midi: number, t: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.22);
    f.connect(this.stems[2]);
    const g = ctx.createGain();
    g.connect(f);
    this.env(g, t, 0.22, 0.004, 0.32);
    this.osc('square', mtof(midi), t, 0.36, g);
    this.osc('sine', mtof(midi), t, 0.36, g);
  }

  private noiseHit(t: number, vol: number, type: BiquadFilterType, freq: number, decay: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    this.env(g, t, vol, 0.002, decay);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  private kick(t: number, vol: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(dest);
    this.env(g, t, vol, 0.002, 0.28);
    const o = this.osc('sine', 130, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
  }

  private snare(t: number, vol: number): void {
    this.noiseHit(t, vol, 'bandpass', 1900, 0.16, this.stems[3]);
    const g = this.ctx!.createGain();
    g.connect(this.stems[3]);
    this.env(g, t, vol * 0.5, 0.002, 0.08);
    this.osc('triangle', 190, t, 0.1, g);
  }

  private hat(t: number, vol: number): void {
    this.noiseHit(t, vol, 'highpass', 7500, 0.04, this.stems[3]);
  }

  private shaker(t: number, vol: number): void {
    this.noiseHit(t, vol, 'bandpass', 5200, 0.06, this.stems[2]);
  }

  // ── effects ────────────────────────────────────────────────────────────
  private allow(key: string): boolean {
    const ctx = this.ctx;
    if (!ctx || this.status !== 'running' || this.paused || this.muted || this.sfxVolume <= 0) return false;
    const lim = RATE_LIMIT[key as Sfx] ?? 0.02;
    const now = ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < lim) return false;
    this.last.set(key, now);
    return true;
  }

  private blip(freq: number, to: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const g = ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, vol, 0.004, dur);
    const o = this.osc(type, freq, t, dur, g);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
  }

  private chordTone(i: number, octave = 1): number {
    const tones = this.chord.pad;
    return tones[i % tones.length] + 12 * (octave + Math.floor(i / tones.length));
  }

  play(name: Sfx, opt: { chain?: number; index?: number; impact?: number; speed?: number } = {}): void {
    if (!this.allow(name)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    switch (name) {
      case 'curl':
        this.blip(380, 240, 0.055, 0.025, 'triangle');
        break;
      case 'uncurl':
        this.blip(260, 420, 0.055, 0.02, 'triangle');
        break;
      case 'pumpGood':
        this.blip(520, 740, 0.075, 0.035);
        this.musicBoxSfx(this.chordTone(1, 1), 0.025, 0.015);
        break;
      case 'pumpPerfect':
        this.blip(540, 920, 0.1, 0.04);
        this.musicBoxSfx(this.chordTone(2, 2), 0.035, 0.025);
        break;
      case 'rollLand': {
        const k = Math.min(1, (opt.impact ?? 150) / 340);
        this.noiseHit(t, 0.035 + 0.035 * k, 'lowpass', 360, 0.065, this.sfxBus);
        this.blip(180, 130, 0.055, 0.025, 'triangle');
        break;
      }
      case 'rollJump':
        this.blip(350, 640, 0.09, 0.06);
        break;
      case 'rollBrake':
        this.noiseHit(t, 0.035, 'lowpass', 720, 0.08, this.sfxBus);
        break;
      case 'jump':
        this.blip(420, 760, 0.12, 0.08);
        this.flavour('jump');
        break;
      case 'land': {
        const k = Math.min(1, (opt.impact ?? 150) / 340);
        this.noiseHit(t, 0.05 + 0.08 * k, 'lowpass', 500, 0.08, this.sfxBus);
        this.flavour('land');
        break;
      }
      case 'dash':
        this.noiseHit(t, 0.12, 'bandpass', 1200, 0.18, this.sfxBus);
        this.blip(300, 900, 0.16, 0.05, 'triangle');
        break;
      case 'skim':
        this.musicBoxSfx(this.chordTone(2, 2), 0.035, 0);
        this.blip(650, 850 + Math.min(300, opt.speed ?? 225), 0.09, 0.025, 'sine');
        break;
      case 'spring':
      case 'springBoost': {
        const boosted = name === 'springBoost';
        const g = ctx.createGain();
        g.connect(this.sfxBus);
        this.env(g, t, 0.12, 0.005, boosted ? 0.4 : 0.3);
        const o = this.osc('sine', 220, t, 0.4, g);
        o.frequency.exponentialRampToValueAtTime(boosted ? 880 : 620, t + 0.2);
        if (boosted) this.musicBoxSfx(this.chordTone(2, 2), 0.06, 0.05);
        this.flavour('spring');
        break;
      }
      case 'ring':
        this.musicBoxSfx(this.chordTone(0, 2), 0.08, 0);
        this.musicBoxSfx(this.chordTone(2, 2), 0.06, 0.06);
        break;
      case 'seed':
        this.musicBoxSfx(this.chordTone(Math.min(7, (opt.chain ?? 1) - 1), 1), 0.05, 0);
        break;
      case 'fragment':
        [0, 1, 2, 3].forEach((i) => this.musicBoxSfx(this.chordTone(i + (opt.index ?? 0), 1), 0.09, i * 0.09));
        break;
      case 'keepsake':
        [0, 2, 4].forEach((i) => this.musicBoxSfx(this.chordTone(i, 1), 0.07, i * 0.05));
        break;
      case 'checkpoint':
        this.musicBoxSfx(77, 0.07, 0);
        this.musicBoxSfx(84, 0.06, 0.12);
        break;
      case 'death':
        this.noiseHit(t, 0.14, 'lowpass', 900, 0.35, this.sfxBus);
        this.blip(500, 160, 0.3, 0.06, 'triangle');
        break;
      case 'respawn':
        this.blip(500, 900, 0.18, 0.05);
        break;
      case 'wall':
        this.noiseHit(t, 0.06, 'lowpass', 700, 0.06, this.sfxBus);
        break;
      case 'parade':
        for (let i = 0; i < 8; i++) this.musicBoxSfx(65 + [0, 4, 7, 11, 12, 16, 19, 24][i], 0.05, 1.3 + i * 0.07);
        this.noiseHit(t + 1.2, 0.08, 'highpass', 3000, 1.2, this.sfxBus);
        break;
      case 'goal':
        [65, 69, 72, 76, 77].forEach((m, i) => this.musicBoxSfx(m + 12, 0.08, i * 0.12));
        break;
      case 'uiMove':
        this.blip(700, 760, 0.05, 0.04, 'triangle');
        break;
      case 'uiSelect':
        this.musicBoxSfx(84, 0.06, 0);
        this.musicBoxSfx(91, 0.05, 0.06);
        break;
    }
  }

  private musicBoxSfx(midi: number, vol: number, delay: number): void {
    const t = this.ctx!.currentTime + delay;
    this.musicBox(midi, t, vol, this.sfxBus);
  }

  /** Character personality: Poppy's tiny bells, Sir Puddlewick's duck squeak (rate-limited, varied). */
  private flavour(kind: 'jump' | 'land' | 'spring'): void {
    if (this.character === 'poppy') {
      if (kind === 'land' || !this.allow('bells')) return;
      const pent = [0, 2, 4, 7, 9];
      this.musicBoxSfx(84 + pent[Math.floor(Math.random() * pent.length)], 0.025, 0.02);
    } else {
      if (kind === 'jump' || Math.random() < 0.4 || !this.allow('squeak')) return;
      const ctx = this.ctx!;
      const t = ctx.currentTime + 0.02;
      const g = ctx.createGain();
      g.connect(this.sfxBus);
      this.env(g, t, 0.05, 0.01, 0.16);
      const base = 850 + Math.random() * 200;
      const o = this.osc('sine', base, t, 0.18, g);
      o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.06);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 0.16);
    }
  }

  get bpm(): number {
    return BPM;
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
