import { SIM_DT, type MovementConfig } from '../config/movement';
import { FixedLoop } from '../core/FixedLoop';
import { surfaceContact, type SurfaceContact } from '../sim/collision';
import { NO_INPUT, type InputFrame } from '../sim/Player';
import { World, type WorldEvent } from '../sim/World';
import type { LevelData } from './types';

/** A recording is simulation-step based: renderer cadence never changes intent. */
export interface RecordedInput {
  step: number;
  /** Direction / held jump persist; press / dash are one-step commands. */
  move?: InputFrame['move'];
  jumpHeld?: boolean;
  rollHeld?: boolean;
  jumpPressed?: boolean;
  dash?: InputFrame['dash'];
  directionPressed?: InputFrame['directionPressed'];
  directionReleased?: InputFrame['directionReleased'];
  /** Ordered physical edges, with age in seconds before the sampling boundary. */
  directionEvents?: InputFrame['directionEvents'];
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
  /** Authored identity is distinct from World's runtime solid index. */
  terrain: number | null;
  dashCharges: number;
  dashTimer: number;
  coyote: number;
  jumpBuffer: number;
  dashBuffer: number;
  rolling: boolean;
  rollAngle: number;
  slope: number | null;
  curvature: number | null;
  tangentSpeed: number | null;
  valley: string | null;
  pumpResult: World['player']['pumpResult'];
  sincePump: number;
  recovery: boolean;
}

export interface TraversalLanding extends TraversalState {
  impact: number;
  /** The following takeoff (if any), with the actual carried exit velocity. */
  exit: TraversalState | null;
}

export interface TraversalResult {
  reason: 'goal' | 'target' | 'death' | 'timeout';
  final: TraversalState;
  entry: TraversalState;
  /** Fixed-step occupancy, including takeoff ticks; not interpolated flight time. */
  airTime: number;
  rollTime: number;
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
  fragments: number;
  paradeTriggered: boolean;
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
  /** Tests actual catch-up batching; inputs still sample fixed-step boundaries. */
  renderFps?: number;
  /** Deliver physical events in render-frame batches before catch-up. */
  beforeRender?: (elapsedSeconds: number) => void;
}

export type TraversalInput = (world: World, step: number) => InputFrame;

export function replayInputs(recording: readonly RecordedInput[]): TraversalInput {
  let cursor = 0;
  let held = { ...NO_INPUT };
  for (let i = 0; i < recording.length; i++) {
    const step = recording[i].step;
    if (!Number.isInteger(step) || step < 0 || (i > 0 && step < recording[i - 1].step)) throw new Error('Input recording must use ordered non-negative simulation steps');
    const edges = recording[i].directionEvents;
    if (edges?.some((e, n) => (e.dir !== -1 && e.dir !== 1) || typeof e.down !== 'boolean' || !Number.isFinite(e.age) || e.age < 0 || e.age > SIM_DT || (n > 0 && e.age > edges[n - 1].age))) {
      throw new Error('Directional edges must be ordered within the fixed-step interval');
    }
  }
  return (_world, step) => {
    const frame = { ...held, jumpPressed: false, dash: 0 } as InputFrame;
    while (cursor < recording.length && recording[cursor].step === step) {
      const cue = recording[cursor++];
      if (cue.move !== undefined) frame.move = cue.move;
      if (cue.jumpHeld !== undefined) frame.jumpHeld = cue.jumpHeld;
      if (cue.rollHeld !== undefined) frame.rollHeld = cue.rollHeld;
      frame.jumpPressed ||= cue.jumpPressed ?? false;
      if (cue.dash !== undefined) frame.dash = cue.dash;
      if (cue.directionPressed !== undefined) frame.directionPressed = cue.directionPressed;
      if (cue.directionReleased !== undefined) frame.directionReleased = cue.directionReleased;
      if (cue.directionEvents !== undefined) frame.directionEvents = [...(frame.directionEvents ?? []), ...cue.directionEvents.map(e => ({ ...e }))];
    }
    // Edges and commands are never held into the following step. Keep absent
    // optional fields absent so legacy tapes retain controller edge fallback.
    held = { move: frame.move, jumpHeld: frame.jumpHeld, jumpPressed: false, dash: 0,
      ...(frame.rollHeld === undefined ? {} : { rollHeld: frame.rollHeld }) };
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
  const contact = p.grounded ? p.surface ?? surfaceContact(world.solids, p) : null;
  return {
    step, time: step * SIM_DT, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
    grounded: p.grounded, surface: contact?.solid.id ?? null,
    dashCharges: p.dashCharges, dashTimer: p.dashTimer, coyote: p.coyote,
    jumpBuffer: p.jumpBuffer, dashBuffer: p.dashBuffer,
    rolling: p.rolling, rollAngle: p.rollAngle, ...contactTelemetry(world, contact, p.vx),
    pumpResult: p.pumpResult, sincePump: p.sincePump,
  };
}

function contactTelemetry(world: World, contact: SurfaceContact | null, vx: number) {
  return { terrain: contact?.solid.terrain?.id ?? null, slope: contact?.slope ?? null, curvature: contact?.curvature ?? null,
    tangentSpeed: contact ? vx / contact.tangent.x : null, valley: contact?.valley?.id ?? null,
    recovery: contact ? Boolean(contact.solid.terrain?.recovery ?? world.level.platforms[contact.solid.id]?.recovery) : false };
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
  const entry = trail[0];
  const source = typeof input === 'function' ? input : replayInputs(input);
  let previous = { ...NO_INPUT };
  let hasRoll = false;
  let wallHits = 0;
  let peakSpeed = Math.abs(p.vx);
  let airSteps = 0;
  let rollSteps = 0;
  let pendingLanding: TraversalLanding | null = null;
  let reason: TraversalResult['reason'] = 'timeout';
  let step = 0;
  const limit = options.maxSteps ?? 60 * 120;
  const tick = () => {
    if (step >= limit || reason !== 'timeout') return;
    const frame = source(world, step);
    const newRollField = !hasRoll && frame.rollHeld !== undefined;
    hasRoll ||= frame.rollHeld !== undefined;
    if (frame.move !== previous.move || frame.jumpHeld !== previous.jumpHeld || Boolean(frame.rollHeld) !== Boolean(previous.rollHeld) || newRollField || frame.jumpPressed || frame.dash || frame.directionPressed || frame.directionReleased || frame.directionEvents?.length) {
      recording.push({ step, move: frame.move, jumpHeld: frame.jumpHeld, jumpPressed: frame.jumpPressed, dash: frame.dash,
        ...(hasRoll ? { rollHeld: Boolean(frame.rollHeld) } : {}),
        ...(frame.directionPressed === undefined ? {} : { directionPressed: frame.directionPressed }),
        ...(frame.directionReleased === undefined ? {} : { directionReleased: frame.directionReleased }),
        ...(frame.directionEvents === undefined ? {} : { directionEvents: frame.directionEvents.map(e => ({ ...e })) }) });
    }
    previous = { ...frame, ...(hasRoll ? { rollHeld: Boolean(frame.rollHeld) } : {}) };
    world.step(frame);
    if (!p.grounded) airSteps++;
    if (p.rolling) rollSteps++;
    const state = traversalState(world, step + 1);
    peakSpeed = Math.max(peakSpeed, Math.abs(p.vx));
    for (const event of world.events) {
      events.push({ step: step + 1, event: { ...event } });
      if (event.type === 'wall') wallHits++;
      if (event.type === 'land') {
        // A same-step buffered jump has already left the surface: use contact geometry.
        const contact = surfaceContact(world.solids, { x: event.x, y: event.y, w: p.w, h: p.h });
        const vx = Math.sign(p.vx) * event.speed;
        pendingLanding = { ...state, grounded: true, x: event.x, y: event.y, vx, vy: 0,
          surface: contact?.solid.id ?? null, ...contactTelemetry(world, contact, vx), impact: event.impact, exit: null };
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
    step++;
    if (world.dead) reason = 'death';
    else if (world.complete) reason = 'goal';
    else if (options.stop?.(world)) reason = 'target';
  };
  if (options.renderFps !== undefined) {
    const fps = options.renderFps;
    if (!Number.isFinite(fps) || fps < 10) throw new Error('Render fps must be finite and at least 10 (no dropped simulation time)');
    const loop = new FixedLoop(SIM_DT);
    for (let frame = 1; step < limit && reason === 'timeout'; frame++) {
      options.beforeRender?.(frame / fps);
      loop.advance(1 / fps, remaining => {
        // Verify the same frame-end-to-boundary mapping Game uses. Use the
        // integer tick as canonical physical time to avoid float age drift.
        const boundary = frame / fps - remaining;
        if (step < limit && reason === 'timeout' && Math.abs(boundary - (step + 1) * SIM_DT) > 1e-7) throw new Error('FixedLoop input boundary drift');
        tick();
      });
    }
  } else {
    while (step < limit && reason === 'timeout') tick();
  }
  return { reason, entry, final: traversalState(world, step), airTime: airSteps * SIM_DT, rollTime: rollSteps * SIM_DT, landings, events, recording, trail, wallHits, peakSpeed,
    splits: [...world.splits], progressionComplete: world.progressionComplete,
    progressionValid: world.progressionValid, runInvalidReason: world.runInvalidReason,
    fragments: world.fragmentsTaken.filter(Boolean).length, paradeTriggered: world.parade.state !== 'dormant' };
}
