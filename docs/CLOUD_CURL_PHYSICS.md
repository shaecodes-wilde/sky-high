# Cloud Curl physics

This is the authoritative simulation specification. Read [movement design](MOVEMENT_DESIGN.md) for player intent, [level standards](LEVEL_DESIGN_STANDARD.md) for authoring, and [Laboratory](SKYFLOW_LABORATORY.md) for repeatable acceptance. Code defaults below are tuning hypotheses, not human-approved feel. Source: `src/config/movement.ts`, `src/sim/Player.ts`, `src/sim/terrain.ts`, `src/sim/collision.ts`, `src/input/Input.ts`, `src/sim/World.ts` and `src/core/FixedLoop.ts`.

## Coordinates and invariants

- Pixels and seconds, y-up. Player x is horizontal centre; y is feet. The collision body is an axis-aligned box. Body dimensions are getters and must be read explicitly when making probes; spreading a Player loses them.
- World steps at 60 Hz (`SIM_DT = 1/60`). Rendering interpolates between states; it must never integrate movement, manufacture a pump, alter collision, or choose a different step size.
- Curl changes dimensions around the same feet anchor. Curl entry adds no speed. Release stands only when the full standing box has clearance against active two-way solids. One-way clouds do not block standing.
- One Player/controller/collision implementation serves both characters. Bloom and visual presets do not enter the movement configuration. Gentle **assist** deliberately changes three timing windows and has separate records; Gentle visual preset does not.
- Continuous routes carry velocity, dash charge/buffers, valley traversal state, ring arming, hazards, progression and Parade state. Initialization is allowed before a fixture; reset, teleport or refill forcing between contacts invalidates route evidence.
- Rules version is currently `3`; bump it for physics or route geometry changes affecting comparable times. Record schema version is separate. Do not alter unrelated settings keys.

## Authored geometry and support

`LevelData.terrain?: TerrainDef[]`. Each definition has finite, strictly increasing knots `{x,y,slope}`, a bottom below **every** surface extremum, kind `island` (two-way) or `cloud` (one-way), unique authored `id`, and optional `pump`, `recovery`, `parade`. Treat definitions and knots as immutable: cached geometry is keyed by definition identity.

For adjacent knots with span `L`, local `t=(x-x0)/L`, endpoints `y0,y1` and slopes `m0,m1`:

```text
a = 2y0 - 2y1 + L(m0+m1)
b = -3y0 + 3y1 - L(2m0+m1)
c = Lm0; d = y0
y = at³ + bt² + ct + d
m = (3at² + 2bt + c)/L
y'' = (6at + 2b)/L²
T = (1,m)/sqrt(1+m²)
N = (-m,1)/sqrt(1+m²)
kappa = y''/(1+m²)^(3/2)
```

Positive curvature is a valley; negative is a crest. `terrainSupport` finds the highest real curve point within the full foot span, including analytic derivative roots. Contact x can therefore differ from body-centre x. Broad bounds include interior extrema and serve broad-phase rejection only. `surfaceContact` accepts support within 0.01px of feet. Pump crossing uses body-centre x and the valley's geometric minimum, not the broad box top or support x.

World assigns runtime solid IDs by insertion order (platforms, terrain, springs). Authored terrain IDs remain in `solid.terrain.id` and in valley keys such as `901:valley:0.000000`. Telemetry records both identities; do not compare an authored terrain ID with a runtime platform index.

## Grounded rolling integration

Signed surface speed `u = vx / T.x`. Each fixed step applies, in order:

1. Opposite input reduces `|u|` toward zero by `rollBrake*dt`; reversal starts on a subsequent tick. Forward input accelerates toward `rollTargetSpeed` by `rollAccel*dt`; existing overspeed is retained.
2. Resistance approaches zero by `rollResistance*dt`.
3. Tangent gravity: `u -= rollGravity*T.y*dt`. Downhill motion accelerates; uphill motion loses speed in either travel direction.
4. Deliver the finite remaining pump bonus, then bound signed rolling speed to ±`maxHorizontalSpeed`. Set `vx=u*T.x`.
5. Apply ordinary bounded wind if present; reapply the rolling tangent cap and horizontal ±300px/s cap. `moveGrounded` advances along actual support geometry. It changes position only. On supported continuation, the controller converts the carried signed speed using the new tangent.

Grounded rolling caps signed surface speed before and after wind. The global invariant is the horizontal cap; it does not impose a 300px/s airborne vector-magnitude cap. Ordinary standing ground/air controls remain separate and preserve earned overspeed with decay rather than clamping it to run speed.

Ground following subdivides horizontal/vertical motion to at most `max(0.05,min(0.5,w/4,h/4))` px and resolves blocking boundaries by bisection. Adjacent surfaces join only at matching x endpoints (1e-4px tolerance) and heights (0.01px). No gap or step is repaired by arbitrary route snapping. Airborne movement with curved solids uses the production diagonal sweep; flat-only scenes retain the legacy axis path. Curved contact must be tested as a complete moving-body landing, including two-way uphill contact.

## Pumps: geometry, gesture, reward

An authored `pump:true` curve yields valleys only if local derivative signs change downhill-to-uphill, depth to the lower neighbouring crest is at least 6px, and sampled flanks reach slope ≤−0.08 and ≥+0.08 (33 samples per flank). These are eligibility thresholds, not promises of readable or comfortable terrain. Flat terrain, tiny ripples and opt-out curves cannot reward a pump.

A traversal is armed while grounded and rolling, approaching the minimum from downhill: signed speed magnitude ≥60px/s, actual slope × travel direction <−0.025, centre on the incoming side. Landing at the bottom or rocking there does not arm a traversal. Directional edges track real held state; a genuine release and same-direction fresh press within 0.28s can become a pulse. Backward press cancels pending forward intent. Airborne/uncurled state cancels pending gestures.

The bottom crossing time is interpolated within the fixed tick. Edge time is `playerTime - clamp(age,0,dt)`. Compare absolute press/crossing difference:

| Timing | Finite reward |
| --- | ---: |
| ≤0.05s | Perfect: 16px/s |
| >0.05s and ≤0.11s | Good: 8px/s |
| Outside | Ordinary rolling; no artificial penalty |

Reward is consumed once per valley traversal, not once per tap or cooldown. A valley is rearmed only after leaving its whole `[leftX,rightX]` region by more than 12px. Different valleys have separate traversal keys. Finite bonus delivery lasts 0.1s: per tick add `min(remaining,rate*dt)` in the earned direction; then reduce remaining. Reversal cancels remaining delivery. Delivery continues across legitimate takeoff/dash transitions and still obeys the cap. Capped bonuses can be clipped: an accepted event does **not** establish useful speed gain. Compare success/no-pump/partial routes at matching entry state.

`directionEvents` preserves chronological logical edges, including a release/repress inside one tick. `directionPressed`/`directionReleased` are fallback edges; when neither is present the controller infers edges from movement changes. An explicit empty event array suppresses inference on that tick. Recording must retain that distinction on command/change ticks and never hold an edge into the next step.

## Launches, jumps and aerial chaining

Natural separation is enabled for rolling and occurs when `rollGravity*N.y + u²*kappa < -1e-4`. The controller carries the departure tangent into `(vx,vy)=u*T`; collision creates no velocity. A low-speed crest can stay supported while a faster pass separates. Ordinary standing traversal suppresses this curvature launch. Edges also lose support and retain coyote time.

Roll jump starts with the normal 302px/s baseline plus `clamp(vx*slope*0.35,-60,60)` vertical influence, then applies the ordinary per-tick gravity. Horizontal momentum follows normal airborne decay. The departure-curve sweep lifts clear before horizontal movement so an uphill jump does not hit its own surface.

Ordinary aerial gravity: rising 880px/s², falling 1250px/s²; releasing a jump multiplies rising gravity by 2.6. Holding jump near the ±32px/s apex multiplies gravity by 0.55. Terminal fall speed is −340px/s. Dash uses 0.12× rising gravity; starting a dash damps rising/falling vertical speed by 0.45/0.15 and never adds lift. Same-direction dash keeps earned horizontal speed above its 225px/s baseline, up to 300.

A fresh dash waits at most 0.1s for takeoff/refill/active-dash expiry. It consumes once. Airborne dash intent cancels on landing/wall contact. Grounded rolling directional pulses clear double-tap history and cannot seed a phantom air dash; explicit Shift remains available after takeoff. Ordinary airborne double taps use physical press timestamps.

Landing refills one dash, preserves valid horizontal speed, ends active dash and consumes a buffered jump on the contact step. Spring rebounds likewise refill and preserve horizontal momentum. Rings activate only with a spent dash and rearm only after a 1s cooldown **and** exit. A dash-used flight landing on a cloud/petal can emit skim feedback when jumping within 0.08s at overspeed; skim adds no speed or jump height.

## Complete default tuning inventory

All values are from `MOVEMENT`; px, px/s, px/s² and seconds as applicable. Tuning can change; update this table and regenerate evidence with the rules version.

| Variables | Defaults |
| --- | --- |
| width / height; rollWidth / rollHeight | 10 / 22; 10 / 12 px |
| rollTargetSpeed / rollAccel / rollBrake / rollResistance / rollGravity | 230 / 260 / 650 / 12 / 880 |
| rollJumpSlopeInfluence / rollJumpMaxInfluence | 0.35 / 60 |
| pumpMinSpeed / pumpGoodWindow / pumpPerfectWindow | 60 / 0.11 / 0.05 |
| pumpGoodBonus / pumpPerfectBonus / pumpDeliveryTime | 8 / 16 / 0.1 |
| pumpReleaseWindow / pumpExitMargin | 0.28s / 12px |
| runSpeed / groundAccel / groundBrake / groundFriction | 132 / 640 / 1500 / 1100 |
| groundOverspeedDecay / groundOverspeedFriction | 60 / 520 |
| airAccel / airBrake / airFriction / airOverspeedDecay | 520 / 820 / 25 / 30 |
| gravityUp / jumpCutMultiplier / gravityDown | 880 / 2.6 / 1250 |
| apexGravityScale / apexThreshold / maxFall / jumpSpeed | 0.55 / 32 / 340 / 302 |
| coyoteTime / jumpBuffer | 0.1 / 0.12s |
| dashDuration / dashSpeed / dashGravityScale | 0.14s / 225 / 0.12 |
| dashRiseDamping / dashFallDamping / dashPressBuffer | 0.45 / 0.15 / 0.1s |
| maxHorizontalSpeed | 300 |
| springSpeed / springBoostSpeed / springLateWindow | 420 / 525 / 0.1s |
| cornerNudge / ledgeNudge | 4 / 4px |

Gentle assist overrides only coyoteTime 0.16s, jumpBuffer 0.18s and springLateWindow 0.16s. Input double-tap default is 220ms, configurable 140–360ms. Spring run-in step tolerance is 14px; springs are 18px wide with their top contact 12px above authored `top`.

## Evidence boundary

`traverse` creates one production World and records all controls, contacts and world events. `traversePhysical` delivers timestamped events in render-frame batches, samples each authoritative tick, and uses the actual FixedLoop. It checks the frame-end-minus-remaining mapping against canonical integer tick time. 30/60/144 fps equality means simulation/input cadence independence, not physical-display latency or browser performance. Frame hitches beyond 0.1s or catch-up limits intentionally discard time and are outside equal-duration comparisons.

Use the [route evidence](evidence/skyflow-route-comparison.json), runnable generator and tests in [Laboratory](SKYFLOW_LABORATORY.md). Isolated controller/terrain checks establish bounded cases; only uninterrupted phrase results establish route reachability. Human comfort, tuning approval, keyboard/device feel and visual readability require separate playtesting.
