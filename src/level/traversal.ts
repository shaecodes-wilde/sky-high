import { SIM_DT, type MovementConfig } from '../config/movement';
import { groundUnder } from '../sim/collision';
import { NO_INPUT, type InputFrame } from '../sim/Player';
import { World, type WorldEvent } from '../sim/World';
import type { LevelData } from './types';

/** A recording is simulation-step based: renderer cadence never changes intent. */
export interface RecordedInput {
  step: number;
  /** Direction / held jump persist; press / dash are one-step commands. */
  move?: InputFrame['move'];
  jumpHeld?: boolean;
  jumpPressed?: boolean;
  dash?: InputFrame['dash'];
}

export interface TraversalState {
  step: number;
  time: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  surface: number | null;
  dashCharges: number;
  dashTimer: number;
  coyote: number;
  jumpBuffer: number;
  dashBuffer: number;
}

export interface TraversalLanding extends TraversalState {
  impact: number;
  /** The following takeoff (if any), with the actual carried exit velocity. */
  exit: TraversalState | null;
}

export interface TraversalResult {
  reason: 'goal' | 'target' | 'death' | 'timeout';
  final: TraversalState;
  landings: TraversalLanding[];
  events: { step: number; event: WorldEvent }[];
  /** Exact commands for deterministic replay and optional trajectory overlays. */
  recording: RecordedInput[];
  trail: TraversalState[];
  wallHits: number;
  peakSpeed: number;
  splits: (number | null)[];
  progressionComplete: boolean;
  progressionValid: boolean;
  runInvalidReason: World['runInvalidReason'];
}

export interface TraversalOptions {
  maxSteps?: number;
  /** Initial state only. No reset or teleport occurs during the traversal. */
  start?: { x: number; y: number; vx?: number; vy?: number; grounded?: boolean; dashCharges?: number };
  /** Section fixtures may begin after the reveal; whole-level runs leave this false. */
  paradeDone?: boolean;
  /** Optional end boundary for a phrase; all intervening geometry remains active. */
  stop?: (world: World) => boolean;
  /** 0 disables samples; events and landings are always retained. */
  trailEvery?: number;
}

export type TraversalInput = (world: World, step: number) => InputFrame;

export function replayInputs(recording: readonly RecordedInput[]): TraversalInput {
  let cursor = 0;
  let held = { ...NO_INPUT };
  for (let i = 0; i < recording.length; i++) {
    const step = recording[i].step;
    if (!Number.isInteger(step) || step < 0 || (i > 0 && step < recording[i - 1].step)) throw new Error('Input recording must use ordered non-negative simulation steps');
  }
  return (_world, step) => {
    const frame = { ...held, jumpPressed: false, dash: 0 } as InputFrame;
    while (cursor < recording.length && recording[cursor].step === step) {
      const cue = recording[cursor++];
      if (cue.move !== undefined) frame.move = cue.move;
      if (cue.jumpHeld !== undefined) frame.jumpHeld = cue.jumpHeld;
      frame.jumpPressed ||= cue.jumpPressed ?? false;
      if (cue.dash !== undefined) frame.dash = cue.dash;
    }
    held = frame;
    return frame;
  };
}

/** Position cues are small reusable phrase descriptions, not a replacement controller. */
export interface MovementCue {
  x: number;
  /** A fresh jump starts once this boundary is crossed with ground/coyote available. */
  jumpHoldSteps?: number;
  /** Delay commands from the cue's takeoff/contact, measured in fixed steps. */
  dashSteps?: readonly number[];
  /** For spring shaping, anchor the delay to the actual rebound rather than x. */
  spring?: boolean;
}

export function movementCues(cues: readonly MovementCue[], offsetX = 0): TraversalInput {
  let cursor = 0;
  let started = -1;
  let active: MovementCue | null = null;
  let dashIndex = 0;
  return (world, step) => {
    const p = world.player;
    const frame: InputFrame = { move: 1, jumpHeld: false, jumpPressed: false, dash: 0 };
    const next = cues[cursor];
    if (next && p.x >= next.x + offsetX && (!next.spring || p.ascent === 'spring') &&
      (next.jumpHoldSteps === undefined || p.grounded || p.coyote > 0 || (p.ascent === 'spring' && p.springLate > 0))) {
      active = next;
      cursor++;
      started = step;
      dashIndex = 0;
      frame.jumpPressed = next.jumpHoldSteps !== undefined;
    }
    if (active) {
      const age = step - started;
      frame.jumpHeld = age < (active.jumpHoldSteps ?? 0);
      if (active.dashSteps && dashIndex < active.dashSteps.length && age >= active.dashSteps[dashIndex]) {
        frame.dash = 1;
        dashIndex++;
      }
    }
    return frame;
  };
}

export function traversalState(world: World, step: number): TraversalState {
  const p = world.player;
  return {
    step, time: step * SIM_DT, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
    grounded: p.grounded, surface: p.grounded ? groundUnder(world.solids, p)?.id ?? null : null,
    dashCharges: p.dashCharges, dashTimer: p.dashTimer, coyote: p.coyote,
    jumpBuffer: p.jumpBuffer, dashBuffer: p.dashBuffer,
  };
}

/** Replay production World, including hazards, wind, refill state and parade timing. */
export function traverse(
  level: LevelData,
  cfg: MovementConfig,
  input: TraversalInput | readonly RecordedInput[],
  options: TraversalOptions = {},
): TraversalResult {
  const world = new World(level, cfg, 'timeTrial');
  if (options.paradeDone) {
    world.parade.set(true);
    // World syncs newly revealed solids at the beginning of the first step.
  }
  const p = world.player;
  if (options.start) {
    const s = options.start;
    p.reset(s.x, s.y);
    p.vx = s.vx ?? 0;
    p.vy = s.vy ?? 0;
    p.grounded = s.grounded ?? true;
    p.dashCharges = s.dashCharges ?? 1;
  }
  const landings: TraversalLanding[] = [];
  const events: TraversalResult['events'] = [];
  const recording: RecordedInput[] = [];
  const trail: TraversalState[] = [traversalState(world, 0)];
  const source = typeof input === 'function' ? input : replayInputs(input);
  let previous = { ...NO_INPUT };
  let wallHits = 0;
  let peakSpeed = Math.abs(p.vx);
  let pendingLanding: TraversalLanding | null = null;
  let reason: TraversalResult['reason'] = 'timeout';
  let step = 0;
  for (; step < (options.maxSteps ?? 60 * 120); step++) {
    const frame = source(world, step);
    if (frame.move !== previous.move || frame.jumpHeld !== previous.jumpHeld || frame.jumpPressed || frame.dash) {
      recording.push({ step, move: frame.move, jumpHeld: frame.jumpHeld, jumpPressed: frame.jumpPressed, dash: frame.dash });
    }
    previous = frame;
    world.step(frame);
    const state = traversalState(world, step + 1);
    peakSpeed = Math.max(peakSpeed, Math.abs(p.vx));
    for (const event of world.events) {
      events.push({ step: step + 1, event: { ...event } });
      if (event.type === 'wall') wallHits++;
      if (event.type === 'land') {
        // A same-step buffered jump has already left the surface: use contact geometry.
        const surface = world.solids.find(s => s.active && Math.abs(s.y + s.h - event.y) < 0.01 && event.x + p.w / 2 > s.x && event.x - p.w / 2 < s.x + s.w);
        pendingLanding = { ...state, x: event.x, y: event.y, vx: Math.sign(p.vx) * event.speed, surface: surface?.id ?? null, impact: event.impact, exit: null };
        landings.push(pendingLanding);
      }
      if ((event.type === 'jump' || event.type === 'spring') && pendingLanding) {
        pendingLanding.exit = state;
        pendingLanding = null;
      }
    }
    if (pendingLanding && !p.grounded) {
      // Walking off a cloud is also an exit; no jump event is required.
      pendingLanding.exit = state;
      pendingLanding = null;
    }
    if (options.trailEvery !== 0 && (step + 1) % (options.trailEvery ?? 1) === 0) trail.push(state);
    if (world.dead) { reason = 'death'; step++; break; }
    if (world.complete) { reason = 'goal'; step++; break; }
    if (options.stop?.(world)) { reason = 'target'; step++; break; }
  }
  return { reason, final: traversalState(world, step), landings, events, recording, trail, wallHits, peakSpeed,
    splits: [...world.splits], progressionComplete: world.progressionComplete,
    progressionValid: world.progressionValid, runInvalidReason: world.runInvalidReason };
}
