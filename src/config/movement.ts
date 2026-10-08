// Movement tuning. Units: pixels and seconds, y-up. These are playtest
// hypotheses (see docs/STATUS.md), not final values. Bump
// MOVEMENT_RULES_VERSION whenever a change could affect run times so that
// local records stay comparable.

export const MOVEMENT_RULES_VERSION = 3;

export interface MovementConfig {
  /** Collision box (decorative hats/braids/floaties are not included). */
  width: number;
  height: number;
  rollWidth: number;
  rollHeight: number;
  /** Signed surface speed; drive stops adding speed above this target. */
  rollTargetSpeed: number;
  rollAccel: number;
  rollBrake: number;
  rollResistance: number;
  /** Actual gravity projected onto the surface tangent. */
  rollGravity: number;
  rollJumpSlopeInfluence: number;
  rollJumpMaxInfluence: number;
  pumpMinSpeed: number;
  pumpGoodWindow: number;
  pumpPerfectWindow: number;
  pumpGoodBonus: number;
  pumpPerfectBonus: number;
  pumpDeliveryTime: number;
  /** Maximum time between a physical release and its matching press. */
  pumpReleaseWindow: number;
  /** Must leave the complete valley region by this distance before rearming. */
  pumpExitMargin: number;

  runSpeed: number;
  /** Ground acceleration toward runSpeed while holding a direction. */
  groundAccel: number;
  /** Deceleration when pushing against current motion on the ground. */
  groundBrake: number;
  /** Deceleration with no input on the ground. */
  groundFriction: number;
  /** How quickly speed above runSpeed bleeds off on the ground when still holding forward. */
  groundOverspeedDecay: number;
  /** Same, with no input held. */
  groundOverspeedFriction: number;

  airAccel: number;
  airBrake: number;
  airFriction: number;
  airOverspeedDecay: number;

  gravityUp: number;
  /** Gravity multiplier while rising after releasing jump early. */
  jumpCutMultiplier: number;
  gravityDown: number;
  /** Gravity multiplier near the apex while jump is held (a little hang time). */
  apexGravityScale: number;
  apexThreshold: number;
  maxFall: number;
  jumpSpeed: number;

  coyoteTime: number;
  jumpBuffer: number;

  dashDuration: number;
  dashSpeed: number;
  dashGravityScale: number;
  /** Multipliers applied to vertical speed when a dash starts (never adds upward speed). */
  dashRiseDamping: number;
  dashFallDamping: number;
  /** A fresh dash command waits this long for takeoff, a refill or dash expiry. */
  dashPressBuffer: number;

  maxHorizontalSpeed: number;

  springSpeed: number;
  springBoostSpeed: number;
  /** A jump press within this window after a spring contact still upgrades the rebound. */
  springLateWindow: number;

  /** Corner forgiveness: max overlap (px) that is nudged around instead of blocking. */
  cornerNudge: number;
  ledgeNudge: number;
}

export const MOVEMENT: MovementConfig = {
  width: 10,
  height: 22,
  rollWidth: 10,
  rollHeight: 12,
  rollTargetSpeed: 230,
  rollAccel: 260,
  rollBrake: 650,
  rollResistance: 12,
  rollGravity: 880,
  rollJumpSlopeInfluence: 0.35,
  rollJumpMaxInfluence: 60,
  pumpMinSpeed: 60,
  pumpGoodWindow: 0.11,
  pumpPerfectWindow: 0.05,
  pumpGoodBonus: 8,
  pumpPerfectBonus: 16,
  pumpDeliveryTime: 0.1,
  pumpReleaseWindow: 0.28,
  pumpExitMargin: 12,

  runSpeed: 132,
  groundAccel: 640, // ≈0.21 s from standstill to run speed
  groundBrake: 1500,
  groundFriction: 1100,
  groundOverspeedDecay: 60,
  groundOverspeedFriction: 520,

  airAccel: 520,
  airBrake: 820,
  airFriction: 25,
  airOverspeedDecay: 30,

  gravityUp: 880,
  jumpCutMultiplier: 2.6,
  gravityDown: 1250,
  apexGravityScale: 0.55,
  apexThreshold: 32,
  maxFall: 340,
  jumpSpeed: 302,

  coyoteTime: 0.1,
  jumpBuffer: 0.12,

  dashDuration: 0.14,
  dashSpeed: 225, // ≈1.7 × runSpeed
  dashGravityScale: 0.12,
  dashRiseDamping: 0.45,
  dashFallDamping: 0.15,
  dashPressBuffer: 0.1,

  maxHorizontalSpeed: 300,

  springSpeed: 420,
  springBoostSpeed: 525,
  springLateWindow: 0.1,

  cornerNudge: 4,
  ledgeNudge: 4,
};

/** Optional assist; records are stored separately per assist mode. */
export type AssistMode = 'none' | 'gentle';

export function movementFor(assist: AssistMode): MovementConfig {
  if (assist === 'none') return MOVEMENT;
  return { ...MOVEMENT, coyoteTime: 0.16, jumpBuffer: 0.18, springLateWindow: 0.16 };
}

export const DOUBLE_TAP_DEFAULT_MS = 220;
export const DOUBLE_TAP_RANGE_MS: [number, number] = [140, 360];

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
