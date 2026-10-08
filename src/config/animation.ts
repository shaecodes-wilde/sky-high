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

export const ANIMS: Record<AnimName, AnimDef> = {
  idle: { frames: ['idle0', 'idle1', 'idle0', 'idle2'], fps: 2.5, loop: true },
  start: { frames: ['start'], fps: 1, loop: false },
  run: { frames: ['run0', 'run1', 'run2', 'run3', 'run4', 'run5'], fps: 13, loop: true },
  brake: { frames: ['brake'], fps: 1, loop: false },
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
