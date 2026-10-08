import type { MovementConfig } from '../config/movement';
import { blocked, moveGrounded, surfaceContact, sweepX, sweepY, type Solid, type SurfaceContact } from './collision';

/** One fixed-step worth of player intent, produced by the input layer. */
export interface InputFrame {
  move: -1 | 0 | 1;
  jumpHeld: boolean;
  /** A fresh jump press happened since the last step (consumed once). */
  jumpPressed: boolean;
  /** A dash was requested this step in this direction (0 = none). */
  dash: -1 | 0 | 1;
  rollHeld?: boolean;
  directionPressed?: -1 | 0 | 1;
  directionReleased?: -1 | 0 | 1;
  /** Physical logical-direction edges, in order; seconds before this step's sample. */
  directionEvents?: { dir: -1 | 1; down: boolean; age: number }[];
}

/** Max height of a springcap surface above the feet that still triggers on run-in. */
const SPRING_STEP = 14;
/** Feedback window only: skimming adds no speed or jump height. */
const SKIM_WINDOW = 0.08;

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

interface ValleyTraversal {
  valley: NonNullable<SurfaceContact['valley']>;
  dir: -1 | 1;
  crossedAt: number | null;
  releaseAt: number | null;
  pulseAt: number | null;
  rewarded: boolean;
}

export type PlayerEvent =
  | { type: 'jump'; x: number; y: number }
  | { type: 'dash'; dir: -1 | 1; x: number; y: number }
  | { type: 'dashEnd'; reason: 'timer' | 'wall' | 'land' }
  | { type: 'land'; x: number; y: number; impact: number; speed: number }
  | { type: 'skim'; x: number; y: number; speed: number }
  | { type: 'spring'; spring: number; boosted: boolean; x: number; y: number }
  | { type: 'springBoost'; spring: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'brake'; x: number; y: number }
  | { type: 'curl' | 'uncurl' | 'launch'; x: number; y: number }
  | { type: 'pump'; x: number; y: number; quality: 'good' | 'perfect'; valley: string };

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
  rolling = false;
  rollAngle = 0;
  sinceCurl = 99;
  sinceUncurl = 99;
  sincePump = 99;
  pumpResult: 'none' | 'good' | 'perfect' = 'none';
  surface: SurfaceContact | null = null;
  readonly events: PlayerEvent[] = [];
  private dashBufferFromGround = false;
  private dashUsedThisFlight = false;
  private skimLanding = false;
  private time = 0;
  private previousMove: -1 | 0 | 1 = 0;
  private heldDirections = new Set<-1 | 1>();
  private valleys = new Map<string, ValleyTraversal>();
  private pumpRemaining = 0;
  private pumpRate = 0;
  private pumpDir: -1 | 1 = 1;

  constructor(public cfg: MovementConfig) {}

  get w(): number {
    return this.rolling ? this.cfg.rollWidth : this.cfg.width;
  }
  get h(): number {
    return this.rolling ? this.cfg.rollHeight : this.cfg.height;
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
    this.dashUsedThisFlight = false;
    this.skimLanding = false;
    this.braking = false;
    this.rolling = false;
    this.rollAngle = 0;
    this.sinceCurl = 99;
    this.sinceUncurl = 99;
    this.sincePump = 99;
    this.pumpResult = 'none';
    this.surface = null;
    this.time = 0;
    this.previousMove = 0;
    this.heldDirections.clear();
    this.valleys.clear();
    this.pumpRemaining = 0;
    this.pumpRate = 0;
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
    this.dashUsedThisFlight = true;
    this.events.push({ type: 'dash', dir, x: this.x, y: this.y });
    return true;
  }

  step(dt: number, input: InputFrame, solids: readonly Solid[], winds: readonly WindZone[]): void {
    const c = this.cfg;
    this.events.length = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    const stepStart = this.time;
    this.time += dt;

    // --- timers & buffered intent ---------------------------------------
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.springLate = Math.max(0, this.springLate - dt);
    this.sinceLand += dt;
    this.sinceSkim += dt;
    this.sinceCurl += dt;
    this.sinceUncurl += dt;
    this.sincePump += dt;
    this.updateCurl(input.rollHeld === true, solids);
    this.surface = this.grounded ? surfaceContact(solids, this) : null;
    this.prepareValley();
    this.directionalPulses(input, dt);
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
    let jumpFromCurve = false;
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !(this.grounded && this.springAhead(solids, input.move, dt))) {
      jumpFromCurve = Boolean(this.surface?.solid.terrain);
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
      if (this.grounded && this.rolling && this.surface) {
        const speed = this.vx / this.surface.tangent.x;
        const next = this.rollAccelerate(speed, input.move, this.surface, dt);
        this.vx = next * this.surface.tangent.x;
      } else {
        this.vx = this.accelerate(this.vx, input.move, dt);
        this.vx = this.deliverPump(this.vx, dt);
      }
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
    // Lift clear of the departure curve before the horizontal sweep. A
    // slope jump must not immediately collide with its own uphill surface.
    if (jumpFromCurve) {
      const up = sweepY(solids, this, this.vy * dt, c.cornerNudge);
      if (up.hit) { this.vy = 0; this.ascent = 'none'; }
    }
    // Flat, standing play retains the existing axis sweep. Curved contact
    // and rolling traverse the continuous support surface instead.
    const followSurface = this.grounded && this.surface && (this.rolling || this.surface.solid.terrain);
    const signedSpeed = this.surface ? this.vx / this.surface.tangent.x : this.vx;
    const groundMove = followSurface
      ? moveGrounded(solids, this, this.vx * dt, signedSpeed, this.rolling ? c.rollGravity : c.gravityDown, this.rolling)
      : null;
    const xr = groundMove ?? sweepX(solids, this, this.vx * dt, this.grounded ? 0 : c.ledgeNudge);
    if (groundMove?.separated) {
      this.grounded = false;
      this.coyote = c.coyoteTime;
      if (groundMove.contact) {
        this.vx = signedSpeed * groundMove.contact.tangent.x;
        this.vy = signedSpeed * groundMove.contact.tangent.y;
      }
      this.surface = null;
      if (this.rolling) this.events.push({ type: 'launch', x: this.x, y: this.y });
    } else if (groundMove?.contact) {
      this.surface = groundMove.contact;
      if (this.rolling) this.vx = signedSpeed * groundMove.contact.tangent.x;
    }
    if (xr.hit) {
      if (Math.abs(this.vx) > c.runSpeed * 0.8) this.events.push({ type: 'wall', x: this.x, y: this.y });
      this.vx = 0;
      this.dashBuffer = 0; // a wall ends this movement intent, not just the dash
      this.dashBufferFromGround = false;
      if (this.dashing) this.endDash('wall');
    }
    if ((!this.grounded || this.vy > 0) && !followSurface && !jumpFromCurve) {
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
      const g2 = surfaceContact(solids, this);
      this.surface = g2;
      if (!g2) {
        this.grounded = false;
        this.coyote = c.coyoteTime;
      } else if (g2.solid.kind === 'spring' && g2.solid.spring !== undefined) {
        this.bounce(g2.solid.spring);
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
    this.finishValley(stepStart, dt, wasGrounded);
    if (!this.grounded) this.surface = null;
    if (this.rolling) {
      const dx = this.x - this.prevX;
      const distance = wasGrounded && this.grounded ? Math.hypot(dx, this.y - this.prevY) : Math.abs(dx);
      this.rollAngle += Math.sign(dx) * distance / (c.rollHeight / 2);
    }
    if (this.grounded) {
      this.groundTime += dt;
      this.airTime = 0;
    } else {
      this.airTime += dt;
      this.groundTime = 0;
    }
    if (wasGrounded && !this.grounded && this.vy <= 0) this.ascent = 'none';
  }

  private updateCurl(held: boolean, solids: readonly Solid[]): void {
    if (held && !this.rolling) {
      this.rolling = true;
      this.sinceCurl = 0;
      this.events.push({ type: 'curl', x: this.x, y: this.y });
    } else if (!held && this.rolling && !blocked(solids, this.x, this.y, this.cfg.width, this.cfg.height)) {
      this.rolling = false;
      this.sinceUncurl = 0;
      this.events.push({ type: 'uncurl', x: this.x, y: this.y });
    }
  }

  private rollAccelerate(speed: number, move: -1 | 0 | 1, contact: SurfaceContact, dt: number): number {
    const c = this.cfg;
    let next = speed;
    if (move && Math.sign(speed) !== 0 && Math.sign(speed) !== move) {
      this.braking = Math.abs(speed) > c.pumpMinSpeed;
      // Stop first, then accelerate on a subsequent tick: brakes cannot
      // inject a large reverse impulse as speed crosses zero.
      next = Math.sign(speed) * Math.max(0, Math.abs(speed) - c.rollBrake * dt);
    } else if (move && Math.abs(speed) < c.rollTargetSpeed) {
      next = move * Math.min(c.rollTargetSpeed, Math.abs(speed) + c.rollAccel * dt);
    }
    next = Math.sign(next) * Math.max(0, Math.abs(next) - c.rollResistance * dt);
    next -= c.rollGravity * contact.tangent.y * dt;
    next = this.deliverPump(next, dt);
    return Math.max(-c.maxHorizontalSpeed, Math.min(c.maxHorizontalSpeed, next));
  }

  /** A rewarded pulse delivers finite earned speed over 100 ms, even through takeoff. */
  private deliverPump(speed: number, dt: number): number {
    if (this.pumpRemaining <= 0) return speed;
    const amount = Math.min(this.pumpRemaining, this.pumpRate * dt);
    this.pumpRemaining = Math.max(0, this.pumpRemaining - amount);
    // Reversal cancels the remaining forward force rather than fighting a
    // deliberate brake or granting a backward boost.
    if (Math.sign(speed) !== this.pumpDir) {
      this.pumpRemaining = 0;
      return speed;
    }
    return speed + this.pumpDir * amount;
  }

  private prepareValley(): void {
    const c = this.cfg;
    for (const [id, traversal] of this.valleys) {
      const v = traversal.valley;
      if (this.x < v.leftX - c.pumpExitMargin || this.x > v.rightX + c.pumpExitMargin) this.valleys.delete(id);
    }
    const contact = this.surface;
    const v = contact?.valley;
    if (!this.rolling || !this.grounded || !contact || !v || this.valleys.has(v.id)) return;
    const speed = this.vx / contact.tangent.x;
    const dir = Math.sign(speed) as -1 | 0 | 1;
    // Terrain owns geometric eligibility; the controller additionally
    // requires a real incoming downhill traversal, rather than spawning,
    // landing or rocking at the minimum to manufacture a reward.
    if (!dir || Math.abs(speed) < c.pumpMinSpeed || contact.slope * dir >= -0.025 || (this.x - v.x) * dir >= 0) return;
    this.valleys.set(v.id, { valley: v, dir, crossedAt: null, releaseAt: null, pulseAt: null, rewarded: false });
  }

  private currentValley(): ValleyTraversal | null {
    const contact = this.surface;
    if (!this.grounded || !this.rolling || !contact?.valley) return null;
    const traversal = this.valleys.get(contact.valley.id);
    if (!traversal || traversal.rewarded || Math.abs(this.vx / contact.tangent.x) < this.cfg.pumpMinSpeed || Math.sign(this.vx) !== traversal.dir) return null;
    return traversal;
  }

  private directionalPulses(input: InputFrame, dt: number): void {
    let edges = input.directionEvents;
    if (!edges) {
      edges = [];
      if (input.directionReleased) edges.push({ dir: input.directionReleased, down: false, age: 0 });
      if (input.directionPressed) edges.push({ dir: input.directionPressed, down: true, age: 0 });
      if (input.directionPressed === undefined && input.directionReleased === undefined && input.move !== this.previousMove) {
        if (this.previousMove) edges.push({ dir: this.previousMove, down: false, age: 0 });
        if (input.move) edges.push({ dir: input.move, down: true, age: 0 });
      }
    }
    const traversal = this.currentValley();
    for (const edge of edges) {
      const t = this.time - Math.max(0, Math.min(dt, Number.isFinite(edge.age) ? edge.age : 0));
      const held = this.heldDirections.has(edge.dir);
      if (edge.down) this.heldDirections.add(edge.dir);
      else this.heldDirections.delete(edge.dir);
      if (!traversal) continue;
      if (edge.dir !== traversal.dir) {
        if (edge.down) { traversal.releaseAt = null; traversal.pulseAt = null; }
        continue;
      }
      if (!edge.down && held) traversal.releaseAt = t;
      else if (edge.down && !held && traversal.releaseAt !== null) {
        if (t >= traversal.releaseAt && t - traversal.releaseAt <= this.cfg.pumpReleaseWindow + 1e-9) traversal.pulseAt = t;
        traversal.releaseAt = null;
      }
    }
    this.previousMove = input.move;
    if (!this.grounded || !this.rolling) {
      for (const state of this.valleys.values()) { state.releaseAt = null; state.pulseAt = null; }
    }
  }

  private finishValley(stepStart: number, dt: number, wasGrounded: boolean): void {
    const state = this.currentValley();
    if (!state || !wasGrounded) return;
    const v = state.valley;
    if (state.crossedAt === null && (this.prevX - v.x) * state.dir < 0 && (this.x - v.x) * state.dir >= 0) {
      const fraction = (v.x - this.prevX) / (this.x - this.prevX);
      state.crossedAt = stepStart + Math.max(0, Math.min(1, fraction)) * dt;
    }
    if (state.crossedAt === null || state.pulseAt === null) return;
    const timing = Math.abs(state.pulseAt - state.crossedAt);
    state.pulseAt = null;
    if (timing > this.cfg.pumpGoodWindow + 1e-9) return;
    const quality = timing <= this.cfg.pumpPerfectWindow + 1e-9 ? 'perfect' : 'good';
    state.rewarded = true;
    this.pumpResult = quality;
    this.sincePump = 0;
    this.pumpDir = state.dir;
    const bonus = quality === 'perfect' ? this.cfg.pumpPerfectBonus : this.cfg.pumpGoodBonus;
    // A second authored valley can extend delivery, but cannot multiply it
    // indefinitely: each valley traversal has its own consumed reward.
    this.pumpRemaining += bonus;
    this.pumpRate = this.pumpRemaining / this.cfg.pumpDeliveryTime;
    this.events.push({ type: 'pump', x: this.x, y: this.y, quality, valley: v.id });
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
    const slopeVelocity = this.rolling && this.surface ? this.vx * this.surface.slope : 0;
    const influence = Math.max(-this.cfg.rollJumpMaxInfluence, Math.min(this.cfg.rollJumpMaxInfluence, slopeVelocity * this.cfg.rollJumpSlopeInfluence));
    this.vy = this.cfg.jumpSpeed + influence;
    this.grounded = false;
    this.surface = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.ascent = 'jump';
    this.dashUsedThisFlight = false;
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
    this.skimLanding = (surface === 'cloud' || surface === 'petal') && this.dashUsedThisFlight;
    this.dashUsedThisFlight = false;
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
    this.surface = null;
    this.coyote = 0;
    this.vy = boosted ? c.springBoostSpeed : c.springSpeed;
    this.ascent = 'spring';
    this.dashUsedThisFlight = false;
    this.springLate = boosted ? 0 : c.springLateWindow;
    this.lastSpring = spring;
    this.dashCharges = 1;
    if (this.dashing) this.endDash('land');
    // Horizontal momentum is preserved.
    this.events.push({ type: 'spring', spring, boosted, x: this.x, y: this.y });
  }
}
