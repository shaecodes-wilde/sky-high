import type { MovementConfig } from '../config/movement';
import { groundUnder, sweepX, sweepY, type Solid } from './collision';

/** One fixed-step worth of player intent, produced by the input layer. */
export interface InputFrame {
  move: -1 | 0 | 1;
  jumpHeld: boolean;
  /** A fresh jump press happened since the last step (consumed once). */
  jumpPressed: boolean;
  /** A dash was requested this step in this direction (0 = none). */
  dash: -1 | 0 | 1;
}

/** Max height of a springcap surface above the feet that still triggers on run-in. */
const SPRING_STEP = 14;
/** Feedback window only: skimming adds no speed or jump height. */
const SKIM_WINDOW = 0.08;
const SKIM_DASH_WINDOW = 0.35;

export const NO_INPUT: InputFrame = { move: 0, jumpHeld: false, jumpPressed: false, dash: 0 };

export interface WindZone {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: -1 | 1;
  /** Bounded target speed the ribbon pushes toward. */
  speed: number;
  accel: number;
}

export type AscentKind = 'none' | 'jump' | 'spring';

export type PlayerEvent =
  | { type: 'jump'; x: number; y: number }
  | { type: 'dash'; dir: -1 | 1; x: number; y: number }
  | { type: 'dashEnd'; reason: 'timer' | 'wall' | 'land' }
  | { type: 'land'; x: number; y: number; impact: number; speed: number }
  | { type: 'skim'; x: number; y: number; speed: number }
  | { type: 'spring'; spring: number; boosted: boolean; x: number; y: number }
  | { type: 'springBoost'; spring: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'brake'; x: number; y: number };

export class Player {
  x = 0;
  y = 0;
  /** Position at the start of the latest step, for render interpolation. */
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  facing: -1 | 1 = 1;
  grounded = false;
  /** Seconds since the player last stood on ground (0 while grounded). */
  airTime = 0;
  groundTime = 0;
  coyote = 0;
  jumpBuffer = 0;
  dashBuffer = 0;
  dashBufferDir: -1 | 1 = 1;
  dashCharges = 1;
  dashTimer = 0;
  dashDir: -1 | 1 = 1;
  ascent: AscentKind = 'none';
  springLate = 0;
  lastSpring = -1;
  /** Seconds since the most recent landing (for animation and land-jump flow). */
  sinceLand = 99;
  /** Seconds since the most recent cloud-skim rebound (presentation only). */
  sinceSkim = 99;
  braking = false;
  readonly events: PlayerEvent[] = [];
  private dashBufferFromGround = false;
  private sinceDash = 99;
  private skimLanding = false;

  constructor(public cfg: MovementConfig) {}

  get w(): number {
    return this.cfg.width;
  }
  get h(): number {
    return this.cfg.height;
  }
  get dashing(): boolean {
    return this.dashTimer > 0;
  }

  reset(x: number, y: number, facing: -1 | 1 = 1): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.grounded = false;
    this.airTime = 0;
    this.groundTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dashBuffer = 0;
    this.dashBufferFromGround = false;
    this.dashCharges = 1;
    this.dashTimer = 0;
    this.ascent = 'none';
    this.springLate = 0;
    this.lastSpring = -1;
    this.sinceLand = 99;
    this.sinceSkim = 99;
    this.sinceDash = 99;
    this.skimLanding = false;
    this.braking = false;
    this.events.length = 0;
  }

  /** Restores the single air dash (springs, dewdrop rings, landing). Returns true if it was spent. */
  refillDash(): boolean {
    if (this.dashCharges > 0) return false;
    this.dashCharges = 1;
    return true;
  }

  /**
   * Resolves a fresh command when its air dash becomes available. World calls
   * this after ring contacts so refills can respond in the same fixed step.
   * Existing events are retained; a consumed request cannot fire again.
   */
  resolveBufferedDash(): boolean {
    if (this.dashBuffer <= 0 || this.grounded || this.dashCharges <= 0 || this.dashing) return false;
    const c = this.cfg;
    const dir = this.dashBufferDir;
    this.dashBuffer = 0;
    this.dashBufferFromGround = false;
    this.dashCharges = 0;
    this.dashTimer = c.dashDuration;
    this.dashDir = dir;
    this.facing = dir;
    // Never slow a faster same-direction player down to dash speed.
    const along = this.vx * dir;
    this.vx = dir * Math.min(Math.max(c.dashSpeed, along), c.maxHorizontalSpeed);
    // Dashing softens vertical motion but never launches upward.
    this.vy *= this.vy > 0 ? c.dashRiseDamping : c.dashFallDamping;
    this.ascent = 'none';
    this.sinceDash = 0;
    this.events.push({ type: 'dash', dir, x: this.x, y: this.y });
    return true;
  }

  step(dt: number, input: InputFrame, solids: readonly Solid[], winds: readonly WindZone[]): void {
    const c = this.cfg;
    this.events.length = 0;
    this.prevX = this.x;
    this.prevY = this.y;

    // --- timers & buffered intent ---------------------------------------
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.springLate = Math.max(0, this.springLate - dt);
    this.sinceLand += dt;
    this.sinceSkim += dt;
    this.sinceDash += dt;
    if (input.jumpPressed) this.jumpBuffer = c.jumpBuffer;
    if (input.dash !== 0) {
      this.dashBuffer = c.dashPressBuffer;
      this.dashBufferDir = input.dash;
      this.dashBufferFromGround = this.grounded;
    }
    if (input.move !== 0 && !this.dashing) this.facing = input.move;

    // A jump pressed just after a spring contact still upgrades the rebound.
    if (input.jumpPressed && this.springLate > 0 && this.ascent === 'spring' && this.vy > 0) {
      this.vy = Math.max(this.vy, c.springBoostSpeed - (c.springSpeed - this.vy));
      this.springLate = 0;
      this.jumpBuffer = 0;
      this.events.push({ type: 'springBoost', spring: this.lastSpring });
    }

    // --- jump ------------------------------------------------------------
    // Only a spring contact imminent in this step reserves the press for a
    // boosted rebound. Being nearby must not suppress a deliberate jump.
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !(this.grounded && this.springAhead(solids, input.move, dt))) {
      this.jump();
    }

    // --- air dash --------------------------------------------------------
    this.resolveBufferedDash();

    // --- horizontal ------------------------------------------------------
    const wasBraking = this.braking;
    this.braking = false;
    if (this.dashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.endDash('timer');
        // A refill acquired during the active dash can answer a timely new
        // press at expiry, without adding a one-step delay or losing its dir.
        if (this.resolveBufferedDash()) this.dashTimer -= dt;
      }
    } else {
      this.vx = this.accelerate(this.vx, input.move, dt);
      if (this.braking && !wasBraking) this.events.push({ type: 'brake', x: this.x, y: this.y });
    }
    for (const wz of winds) {
      if (this.x > wz.x && this.x < wz.x + wz.w && this.y + this.h > wz.y && this.y < wz.y + wz.h) {
        const along = this.vx * wz.dir;
        if (along < wz.speed) this.vx += wz.dir * Math.min(wz.accel * dt, wz.speed - along);
      }
    }
    this.vx = Math.max(-c.maxHorizontalSpeed, Math.min(c.maxHorizontalSpeed, this.vx));

    // --- vertical --------------------------------------------------------
    let g: number;
    if (this.dashing) g = c.gravityUp * c.dashGravityScale;
    else if (this.vy > 0) {
      const cut = this.ascent === 'jump' && !input.jumpHeld;
      g = c.gravityUp * (cut ? c.jumpCutMultiplier : 1);
      if (!cut && input.jumpHeld && this.vy < c.apexThreshold) g *= c.apexGravityScale;
    } else {
      g = c.gravityDown;
      if (input.jumpHeld && this.vy > -c.apexThreshold && this.ascent !== 'none') g *= c.apexGravityScale;
    }
    if (!this.grounded) this.vy = Math.max(this.vy - g * dt, -c.maxFall);
    if (this.vy <= 0 && this.ascent !== 'none' && this.vy < -c.apexThreshold) this.ascent = 'none';

    // --- move & collide --------------------------------------------------
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vy;
    const xr = sweepX(solids, this, this.vx * dt, this.grounded ? 0 : c.ledgeNudge);
    if (xr.hit) {
      if (Math.abs(this.vx) > c.runSpeed * 0.8) this.events.push({ type: 'wall', x: this.x, y: this.y });
      this.vx = 0;
      this.dashBuffer = 0; // a wall ends this movement intent, not just the dash
      this.dashBufferFromGround = false;
      if (this.dashing) this.endDash('wall');
    }
    if (!this.grounded || this.vy > 0) {
      const yr = sweepY(solids, this, this.vy * dt, c.cornerNudge);
      if (yr.landed && yr.hit) {
        if (yr.hit.kind === 'spring' && yr.hit.spring !== undefined) this.bounce(yr.hit.spring);
        else this.land(fallSpeed, yr.hit.kind);
      } else if (yr.hit) {
        this.vy = 0; // ceiling
        if (this.ascent === 'jump') this.ascent = 'none';
      }
    }

    // --- ground maintenance ----------------------------------------------
    if (this.grounded) {
      const g2 = groundUnder(solids, this);
      if (!g2) {
        this.grounded = false;
        this.coyote = c.coyoteTime;
      } else if (g2.kind === 'spring' && g2.spring !== undefined) {
        this.bounce(g2.spring);
      }
    }
    if (this.grounded) {
      // Running into a springcap bounces automatically.
      const sp = this.springAt(solids, 0);
      if (sp && sp.spring !== undefined) this.bounce(sp.spring);
    }
    // Rebound at the actual landing boundary rather than waiting for the
    // next step to apply ground acceleration/friction to the earned speed.
    if (this.grounded && this.jumpBuffer > 0) this.jump();
    if (this.grounded) {
      this.groundTime += dt;
      this.airTime = 0;
    } else {
      this.airTime += dt;
      this.groundTime = 0;
    }
    if (wasGrounded && !this.grounded && this.vy <= 0) this.ascent = 'none';
  }

  private accelerate(vx: number, move: -1 | 0 | 1, dt: number, markBrake = true): number {
    const c = this.cfg;
    const ground = this.grounded;
    const speed = Math.abs(vx);
    const dir = Math.sign(vx);
    if (move !== 0) {
      if (dir === 0 || dir === move) {
        if (speed < c.runSpeed) return move * Math.min(c.runSpeed, speed + (ground ? c.groundAccel : c.airAccel) * dt);
        // Above run speed: keep the boost and let it bleed off gradually.
        const decay = ground ? c.groundOverspeedDecay : c.airOverspeedDecay;
        return move * Math.max(c.runSpeed, speed - decay * dt);
      }
      // Pushing against motion: deliberate braking/turning.
      if (markBrake) this.braking = ground && speed > c.runSpeed * 0.5;
      const next = vx + move * (ground ? c.groundBrake : c.airBrake) * dt;
      return next;
    }
    if (speed === 0) return 0;
    let fr: number;
    if (ground) fr = speed > c.runSpeed ? c.groundOverspeedFriction : c.groundFriction;
    else fr = speed > c.runSpeed ? c.airOverspeedDecay : c.airFriction;
    return dir * Math.max(0, speed - fr * dt);
  }

  /** A springcap low enough to run onto, overlapping the body shifted by `ahead` px. */
  private springAt(solids: readonly Solid[], ahead: number): Solid | null {
    const left = this.x - this.w / 2 + Math.min(0, ahead);
    const right = this.x + this.w / 2 + Math.max(0, ahead);
    for (const s of solids) {
      if (s.kind !== 'spring' || !s.active) continue;
      const rise = s.y + s.h - this.y;
      if (rise > 0 && rise <= SPRING_STEP && s.x < right && s.x + s.w > left) return s;
    }
    return null;
  }

  private springAhead(solids: readonly Solid[], move: -1 | 0 | 1, dt: number): boolean {
    const reach = this.accelerate(this.vx, move, dt, false) * dt;
    return this.springAt(solids, reach) !== null;
  }

  private jump(): void {
    const skim = this.grounded && this.skimLanding && this.sinceLand <= SKIM_WINDOW && Math.abs(this.vx) > this.cfg.runSpeed;
    this.vy = this.cfg.jumpSpeed;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.ascent = 'jump';
    this.skimLanding = false;
    if (this.dashing) this.endDash('land');
    this.events.push({ type: 'jump', x: this.x, y: this.y });
    if (skim) {
      this.sinceSkim = 0;
      this.events.push({ type: 'skim', x: this.x, y: this.y, speed: Math.abs(this.vx) });
    }
  }

  private endDash(reason: 'timer' | 'wall' | 'land'): void {
    this.dashTimer = 0;
    this.events.push({ type: 'dashEnd', reason });
  }

  private land(fallSpeed: number, surface: Solid['kind']): void {
    this.grounded = true;
    this.vy = 0;
    this.coyote = 0;
    this.ascent = 'none';
    this.dashCharges = 1;
    this.sinceLand = 0;
    this.skimLanding = (surface === 'cloud' || surface === 'petal') && this.sinceDash <= SKIM_DASH_WINDOW;
    // Airborne intent expires on landing, even if a buffered jump rebounds
    // immediately. A fresh grounded press still retains takeoff buffering.
    if (!this.dashBufferFromGround) this.dashBuffer = 0;
    // Landing mid-dash keeps the horizontal speed it earned (still capped).
    if (this.dashing) this.endDash('land');
    this.events.push({ type: 'land', x: this.x, y: this.y, impact: fallSpeed, speed: Math.abs(this.vx) });
  }

  private bounce(spring: number): void {
    const c = this.cfg;
    const boosted = this.jumpBuffer > 0;
    this.jumpBuffer = 0;
    this.grounded = false;
    this.coyote = 0;
    this.vy = boosted ? c.springBoostSpeed : c.springSpeed;
    this.ascent = 'spring';
    this.springLate = boosted ? 0 : c.springLateWindow;
    this.lastSpring = spring;
    this.dashCharges = 1;
    if (this.dashing) this.endDash('land');
    // Horizontal momentum is preserved.
    this.events.push({ type: 'spring', spring, boosted, x: this.x, y: this.y });
  }
}
