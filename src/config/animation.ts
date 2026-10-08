// Animation metadata shared by both characters. Frames are 24×32 with the
// feet resting on the bottom row; the collision box (10×22) is centred on x
// and does not include hats, braids or floaties.

export const FRAME_W = 24;
export const FRAME_H = 32;

export type AnimName =
  | 'idle'
  | 'start'
  | 'run'
  | 'brake'
  | 'curl'
  | 'uncurl'
  | 'rollIdle'
  | 'rollSlow'
  | 'rollMedium'
  | 'rollFast'
  | 'rollPump'
  | 'rollPerfect'
  | 'rollBrake'
  | 'rollJump'
  | 'rollLand'
  | 'jump'
  | 'launch'
  | 'apex'
  | 'fall'
  | 'dash'
  | 'land'
  | 'rebound'
  | 'fail'
  | 'cheer';

export interface AnimDef {
  frames: string[];
  fps: number;
  loop: boolean;
}

/** Art-frame phase comes from travelled distance, never a free-running timer. */
export const ROLL_PHASES = 16;
export const ROLL_VISUAL = {
  curlSeconds: 0.12,
  uncurlSeconds: 0.12,
  landingSeconds: 0.1,
  pumpCompressionSeconds: 0.07,
  pumpReleaseSeconds: 0.19,
  idleSpeed: 6,
  mediumSpeed: 110,
  fastSpeed: 210,
  mint: '#9ff0d0',
  mintLight: '#ddfff1',
} as const;

const spin = (prefix: string): AnimDef => ({
  frames: Array.from({ length: ROLL_PHASES }, (_, i) => `${prefix}${i}`),
  fps: 0,
  loop: true,
});

export const ANIMS: Record<AnimName, AnimDef> = {
  idle: { frames: ['idle0', 'idle1', 'idle0', 'idle2'], fps: 2.5, loop: true },
  start: { frames: ['start'], fps: 1, loop: false },
  run: { frames: ['run0', 'run1', 'run2', 'run3', 'run4', 'run5'], fps: 13, loop: true },
  brake: { frames: ['brake'], fps: 1, loop: false },
  curl: { frames: ['curl0', 'curl1', 'curl2', 'curl3'], fps: 4 / ROLL_VISUAL.curlSeconds, loop: false },
  uncurl: { frames: ['curl3', 'curl2', 'curl1', 'curl0'], fps: 4 / ROLL_VISUAL.uncurlSeconds, loop: false },
  rollIdle: spin('roll'),
  rollSlow: spin('roll'),
  rollMedium: spin('rollMedium'),
  rollFast: spin('rollFast'),
  rollPump: spin('rollPump'),
  rollPerfect: spin('rollPerfect'),
  rollBrake: spin('rollBrake'),
  rollJump: spin('rollJump'),
  rollLand: spin('rollLand'),
  jump: { frames: ['jump'], fps: 1, loop: false },
  // Visual anticipation only: physics responds immediately on the input step.
  launch: { frames: ['land', 'jump'], fps: 60, loop: false },
  apex: { frames: ['apex'], fps: 1, loop: false },
  fall: { frames: ['fall0', 'fall1'], fps: 8, loop: true },
  dash: { frames: ['dash'], fps: 1, loop: false },
  land: { frames: ['land'], fps: 1, loop: false },
  rebound: { frames: ['rebound'], fps: 1, loop: false },
  fail: { frames: ['fail'], fps: 1, loop: false },
  cheer: { frames: ['cheer0', 'cheer1'], fps: 3, loop: true },
};

export const FRAME_NAMES = [...new Set(Object.values(ANIMS).flatMap((a) => a.frames))];

/** Run cadence scales with speed (relative to run speed), within bounds. */
export const RUN_FPS_RANGE: [number, number] = [9, 18];

/** Read-only seam: old controllers omit Skyflow fields until integration. */
export interface SkyflowVisualSource {
  readonly vx: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly braking: boolean;
  readonly sinceLand: number;
  readonly rolling?: boolean;
  readonly rollAngle?: number;
  readonly sinceCurl?: number;
  readonly sinceUncurl?: number;
  readonly sincePump?: number;
  readonly pumpResult?: 'none' | 'good' | 'perfect';
}

export interface SkyflowVisualState {
  readonly rolling: boolean;
  readonly angle: number;
  readonly curlAge: number;
  readonly uncurlAge: number;
  readonly pumpAge: number;
  readonly pumpResult: 'none' | 'good' | 'perfect';
  readonly speed: number;
  readonly grounded: boolean;
  readonly braking: boolean;
  readonly landAge: number;
}

export function readSkyflowVisual(p: SkyflowVisualSource): SkyflowVisualState {
  return {
    rolling: p.rolling ?? false,
    angle: p.rollAngle ?? 0,
    curlAge: p.sinceCurl ?? 99,
    uncurlAge: p.sinceUncurl ?? 99,
    pumpAge: p.sincePump ?? 99,
    pumpResult: p.pumpResult ?? 'none',
    speed: Math.hypot(p.vx, p.grounded ? p.vy : 0),
    grounded: p.grounded,
    braking: p.braking,
    landAge: p.sinceLand,
  };
}

/** Returns null when the ordinary upright animation should own the frame. */
export function chooseSkyflowAnim(s: SkyflowVisualState): AnimName | null {
  if (!s.rolling) return s.uncurlAge < ROLL_VISUAL.uncurlSeconds ? 'uncurl' : null;
  if (!s.grounded) return 'rollJump';
  if (s.pumpResult !== 'none' && s.pumpAge < ROLL_VISUAL.pumpCompressionSeconds) return 'rollPump';
  if (s.pumpResult === 'perfect' && s.pumpAge < ROLL_VISUAL.pumpReleaseSeconds) return 'rollPerfect';
  if (s.landAge < ROLL_VISUAL.landingSeconds) return 'rollLand';
  if (s.curlAge < ROLL_VISUAL.curlSeconds) return 'curl';
  if (s.braking) return 'rollBrake';
  if (s.speed < ROLL_VISUAL.idleSpeed) return 'rollIdle';
  if (s.speed < ROLL_VISUAL.mediumSpeed) return 'rollSlow';
  if (s.speed < ROLL_VISUAL.fastSpeed) return 'rollMedium';
  return 'rollFast';
}

/** Signed world travel gives clockwise/right and counter-clockwise/left spin. */
export function rollFrameIndex(angle: number, facing: -1 | 1): number {
  const phase = Math.round(angle * facing / (Math.PI * 2) * ROLL_PHASES);
  return ((phase % ROLL_PHASES) + ROLL_PHASES) % ROLL_PHASES;
}

/** Animation event ages are authoritative, so skipped render frames do not restart a transition. */
export function skyflowFrame(name: AnimName, s: SkyflowVisualState, facing: -1 | 1): string | null {
  const def = ANIMS[name];
  if (name.startsWith('roll')) return def.frames[rollFrameIndex(s.angle, facing)];
  if (name === 'curl' || name === 'uncurl') {
    const age = name === 'curl' ? s.curlAge : s.uncurlAge;
    return def.frames[Math.min(def.frames.length - 1, Math.max(0, Math.floor(age * def.fps)))];
  }
  return null;
}
