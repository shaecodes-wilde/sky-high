import type { AnimName } from '../config/animation';
import type { World, WorldEvent } from '../sim/World';

// The presentation adapter: the ONLY place the renderer reads player/controller
// internals. Everything visual (poses, trails, VFX, sky energy) consumes these
// semantic signals instead of raw velocities or tuning constants, so the
// movement branch can retune or restructure the controller and only this file
// needs to follow. Strictly read-only: nothing here feeds back into the sim.
//
// Speeds are normalised against the controller's *own* configuration
// (runSpeed, jumpSpeed, maxFall, maxHorizontalSpeed), never hardcoded numbers.

export type AirPhase = 'grounded' | 'rising' | 'apex' | 'falling';

/** Expressive mood tiers from GAME_IDENTITY.md §8 (continuous 0..3). */
export type MoodName = 'quiet' | 'stirring' | 'singing' | 'spectacular';

export interface MotionSignals {
  /** |vx| / runSpeed. 1 = cruising, >1 = carrying momentum. */
  speed: number;
  /** 0..1, how far above run speed toward the horizontal cap. */
  overdrive: number;
  /** 0..1 smoothed "flow energy" for trails, wind and parallax response. */
  energy: number;
  facing: -1 | 1;
  /** Signed horizontal travel direction (0 when nearly still). */
  travel: -1 | 0 | 1;
  air: AirPhase;
  /** Vertical velocity / jumpSpeed (+ up). */
  rise: number;
  dashing: boolean;
  braking: boolean;
  /** Rising from a springcap or rebound. */
  rebounding: boolean;
  /** Seconds since the last landing. */
  sinceLand: number;
  /** Seconds the player has been grounded continuously. */
  groundTime: number;
  dead: boolean;
  complete: boolean;

  // One-shot pulses accumulated since the previous rendered frame.
  dashStarted: boolean;
  dashEnded: boolean;
  /** 0 = no landing this frame, otherwise landing intensity 0..1 (impact / maxFall). */
  landed: number;
  jumped: boolean;
  sprung: boolean;
  ringRefill: boolean;

  /** Smoothed Bloom 0..1 and its hysteresis tier. */
  bloom: number;
  bloomTier: 0 | 1 | 2;
  /** Continuous mood 0..3 combining Bloom and the authored Parade. */
  mood: number;
  moodName: MoodName;
  parade: { anticipation: number; reveal: number; intensity: number; bridgeAlpha: number; active: boolean };
}

export class PresentationSignals {
  readonly s: MotionSignals = {
    speed: 0,
    overdrive: 0,
    energy: 0,
    facing: 1,
    travel: 0,
    air: 'grounded',
    rise: 0,
    dashing: false,
    braking: false,
    rebounding: false,
    sinceLand: 99,
    groundTime: 0,
    dead: false,
    complete: false,
    dashStarted: false,
    dashEnded: false,
    landed: 0,
    jumped: false,
    sprung: false,
    ringRefill: false,
    bloom: 0,
    bloomTier: 0,
    mood: 0,
    moodName: 'quiet',
    parade: { anticipation: 0, reveal: 0, intensity: 0, bridgeAlpha: 0, active: false },
  };
  private pending = { dashStarted: false, dashEnded: false, landed: 0, jumped: false, sprung: false, ring: false };

  /** Feed every simulation step's events (called from GameRenderer.onEvents). */
  ingest(events: readonly WorldEvent[], world: World): void {
    const maxFall = Math.max(1, world.player.cfg.maxFall);
    const q = this.pending;
    for (const e of events) {
      if (e.type === 'dash') q.dashStarted = true;
      else if (e.type === 'dashEnd') q.dashEnded = true;
      else if (e.type === 'land') q.landed = Math.max(q.landed, Math.min(1, Math.max(0.05, e.impact / maxFall)));
      else if (e.type === 'jump') q.jumped = true;
      else if (e.type === 'spring' || e.type === 'springBoost') q.sprung = true;
      else if (e.type === 'ring') q.ring = true;
    }
  }

  /** Recomputes continuous signals once per rendered frame and latches pulses. */
  update(world: World, dt: number): MotionSignals {
    const s = this.s;
    const p = world.player;
    const c = p.cfg;
    const run = Math.max(1, c.runSpeed);
    const ax = Math.abs(p.vx);
    s.speed = ax / run;
    s.overdrive = clamp01((ax - run) / Math.max(1, c.maxHorizontalSpeed - run));
    s.facing = p.facing;
    s.travel = ax < run * 0.1 ? 0 : p.vx > 0 ? 1 : -1;
    s.rise = p.vy / Math.max(1, c.jumpSpeed);
    s.dashing = p.dashing;
    s.braking = p.braking;
    s.rebounding = !p.grounded && p.ascent === 'spring' && p.vy > 0;
    s.sinceLand = p.sinceLand;
    s.groundTime = p.groundTime;
    s.dead = world.dead;
    s.complete = world.complete;
    // Apex band scales with jump strength, so a retuned jump keeps a readable hang pose.
    const apexBand = 0.23;
    s.air = p.grounded ? 'grounded' : s.rise > apexBand ? 'rising' : s.rise > -apexBand ? 'apex' : 'falling';

    const q = this.pending;
    s.dashStarted = q.dashStarted;
    s.dashEnded = q.dashEnded;
    s.landed = q.landed;
    s.jumped = q.jumped;
    s.sprung = q.sprung;
    s.ringRefill = q.ring;
    q.dashStarted = q.dashEnded = q.jumped = q.sprung = q.ring = false;
    q.landed = 0;

    // Energy: eases toward a target built from speed, dashing and rebounds.
    const target = clamp01(Math.max(0, s.speed - 0.35) * 0.75 + s.overdrive * 0.5 + (s.dashing ? 0.6 : 0) + (s.rebounding ? 0.3 : 0));
    const rate = target > s.energy ? 6 : 1.6;
    s.energy += (target - s.energy) * (1 - Math.exp(-rate * dt));
    if (s.dead) s.energy = 0;

    s.bloom = world.bloom.visual;
    s.bloomTier = world.bloom.tier;
    const pr = world.parade;
    s.parade.anticipation = pr.anticipation;
    s.parade.reveal = pr.reveal;
    s.parade.intensity = pr.intensity;
    s.parade.bridgeAlpha = pr.bridgeAlpha;
    s.parade.active = pr.state === 'active';
    // Quiet (0) → stirring (1) → singing (2) via Bloom; spectacular (3) is reserved for authored moments.
    s.mood = Math.max(s.bloom * 2.2, pr.intensity * 3, world.complete ? 2.6 : 0);
    s.moodName = s.mood >= 2.6 ? 'spectacular' : s.mood >= 1.6 ? 'singing' : s.mood >= 0.7 ? 'stirring' : 'quiet';
    return s;
  }

  /** Clears pulses and energy (restart / respawn / title). */
  reset(): void {
    const q = this.pending;
    q.dashStarted = q.dashEnded = q.jumped = q.sprung = q.ring = false;
    q.landed = 0;
    this.s.energy = 0;
  }
}

/** Pose selection from semantic state (no raw velocity thresholds). */
export function chooseAnim(s: MotionSignals): AnimName {
  if (s.dead) return 'fail';
  if (s.complete) return s.air === 'grounded' ? 'cheer' : 'fall';
  if (s.dashing) return 'dash';
  if (s.air !== 'grounded') {
    if (s.rebounding && s.rise > 0.4) return 'rebound';
    if (s.air === 'rising') return 'jump';
    if (s.air === 'apex') return 'apex';
    return 'fall';
  }
  if (s.sinceLand < 0.08) return 'land';
  if (s.braking) return 'brake';
  if (s.speed > 0.09) return s.groundTime < 0.1 && s.speed < 0.5 ? 'start' : 'run';
  return 'idle';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
