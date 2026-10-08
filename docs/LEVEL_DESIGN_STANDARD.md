# Momentum level-design standard

This is the permanent authoring and acceptance guide for movement-heavy Sky High levels. [Physics](CLOUD_CURL_PHYSICS.md) defines simulation; [movement design](MOVEMENT_DESIGN.md) defines player intent; [Laboratory](SKYFLOW_LABORATORY.md) supplies runnable recipes and measured reference geometry. Change geometry against the current rules version and regenerate complete-route evidence. Preserve independent art work and existing gameplay.

## Three interwoven route roles

| Role | Access and reward | Risk and rejoin |
| --- | --- | --- |
| Garden Trail | Standard steering/jumps, no required pump; readable progression and story access | Broad receivers and recovery; minimum skill requirement belongs here |
| Flow Line | Earned rolling momentum and intermediate aerial control; measurably faster than Garden | Less room or more timing, with a forward lower catch |
| Skyway | Deliberate pump/launch/dash/ring/skim phrase; elevated visibility and further measurable time savings | Optional challenge, naturally drops to Flow/Garden and rejoins without an imposed stop |

These are design roles, not three mandatory literal paths in every encounter. Every legitimate route must still cross ordered forward progression gates, access required collectibles/story triggers, and finish. Use geometry and real movement resources to select routes; never add invisible speed gates or scripts that overwrite velocity.

## Author the actual terrain format

Terrain is piecewise cubic Hermite data with explicit dy/dx slopes. The following **tested production-World fixture** is the valley used by `tests/skyflow-recording.test.ts`; its full continuous physical-tape runs include approach, pump and exit at 132/180/225/260px/s and 30/60/144fps. It establishes these sampled cases, not an interchangeable comfortable beginner bowl.

```ts
const valley: TerrainDef = {
  id: 901, kind: 'island', bottom: -100, pump: true,
  knots: [
    { x: -120, y: 60, slope: -1 },
    { x: 0, y: 0, slope: 0 },
    { x: 120, y: 60, slope: 1 },
  ],
};
```

This second measured fixture accepts a 225px/s descending curled arrival with spent dash; it lands on real sloping support, preserves speed subject to ordinary air decay, and refills one dash:

```ts
const receiver: TerrainDef = {
  id: 990, kind: 'cloud', bottom: -100, recovery: true,
  knots: [
    { x: -100, y: 50, slope: -0.2 },
    { x: 250, y: -20, slope: -0.2 },
  ],
};
```

Definitions must be finite and immutable, with strictly increasing x and at least two knots. Place `bottom` below analytic interior minima, not just the knot heights. World uses runtime indices for collision solids and authored terrain IDs for valley identity: use unique authored IDs and retain both in evidence. Arrays of flat platforms retain the existing `{id,kind,x0,x1,top,bottom,recovery?,parade?}` format. Add slopes without replacing ordinary routes or required content.

## Tested constraints, not guessed universal gaps

| Subject | Implemented boundary | Authoring consequence |
| --- | --- | --- |
| Surface join | Endpoints meet horizontally within 1e-4px and vertically within 0.01px | Match endpoint height and preferably tangent; a gap/step does not become a joined ramp |
| Eligible valley | `pump:true`, depth ≥6px, sampled flanks ≤−0.08 / ≥+0.08 | Tiny ripples/flats are ineligible; these thresholds are not comfortable teaching dimensions |
| Incoming pump | Rolling/grounded, surface speed ≥60, downhill slope×direction <−0.025 | Allow a real downhill approach before the bottom; spawning/landing at the minimum is insufficient |
| Release/repress | Genuine forward release then press ≤0.28s later | Provide visible descent and coasting space; adjacent bowl inputs must be independent |
| Good / perfect | ±0.11 / ±0.05s around interpolated centre crossing | Basic progression cannot depend on repeated precision pumps |
| Reward/rearm | One finite reward per valley traversal; exit complete region by >12px | Do not place a basic requirement where rocking or repeated taps are necessary |
| Standing / curl | 10×22 / 10×12px, common feet anchor | A 16px tunnel clears curl but blocks standing; test entering, releasing inside and exiting both ways |
| Natural crest | `g*N.y + u²*kappa < -1e-4` | A smooth crest can launch at speed; test intended support and separation at each entry speed |
| Speed | 300px/s horizontal cap; grounded rolling tangent speed also capped after wind | High entry speed may clip pumps; acceptance must measure benefit, not only reward events |

For a horizontal crest at default rolling gravity, radius greater than `300²/880 ≈102.27px` avoids the negative-normal-force threshold **at that point**. At nonzero slope use `u²/(880*N.y)` and inspect the whole Hermite segment: curvature extrema, foot support and entry velocity can differ. This equation is an analysis aid, not a blanket guarantee of collision safety. Reproduce the intended phrase using production World.

No universal “maximum gap”, “comfortable slope” or “minimum recovery width” is established. Gap viability depends on actual launch slope, speed, jump hold, dash timing, ring contact, prior resources, moving-body footprint and landing height. A collection of independently successful jumps does not prove a connected route.

## Terrain patterns

**Gentle slopes:** use continuous height/tangent joins and conservative curvature. Preserve an ordinary standing path. Test roll entry/release, downhill/uphill travel, coasting and controlled braking in both directions.

**Pronounced valleys and consecutive bowls:** make low points visually distinct. Measure the true eligible valley list and bottom crossing. Give a separate release/repress opportunity per bowl, testing full, partial and missed chains. Do not infer benefit from a pump event when speed is already capped. Sample entry speeds 132, 180, 225 and 260px/s; also check the actual upstream arrival state.

**Uphill ramps and natural crests:** use the existing slope-influenced jump and normal-force separation. Validate a no-jump ride, deliberate roll jump, and jump-to-dash with carried charge. Match receiver placement to measured takeoff and flight, with more than one viable trajectory. A steep or abrupt tangent change that launches/stalls unexpectedly is unsafe even when endpoint heights meet.

**Rolling tunnels:** put the arch above real support, including interior curve extrema. Use actual body clearance; preserve steering while release waits. Keep the exit visible and leave room to stop. Decorative bounds must not become collision dimensions.

**Curved receivers:** choose one-way clouds when upward passage is intended; use two-way islands for solid walls/undersides. Test high-speed diagonal descent and two-way uphill landings through the production air sweep in both directions. A broad-phase rectangular top is not a receiver measurement.

**Cloud-skimming platforms:** place targets for the carried flight, not an independently reset jump. Fresh jump before contact buffers a same-step rebound, refreshes one dash and keeps valid horizontal speed. Hold curl to prepare the next rolling contact. Feedback adds no boost. Record landing and exit on the same step where buffering succeeds.

**Recovery cascades:** derive cloud/ramp positions from failed upper trajectories. Mark surfaces `recovery:true` for readable presentation/telemetry, not a collision exemption. Leave forward runway, a usable jump/dash/spring opportunity and a natural rejoin. A missed optional shortcut should cost time rather than require blind backtracking or likely death.

## Momentum and aerial phrase rules

1. Never reset speed, reposition the player, restore a charge or hide hazards inside a test/control recipe. Initialization belongs before the first World step.
2. Let momentum open optional routes. Avoid forced braking immediately after success; give a deliberate braking option with visible space.
3. Keep Garden feasible without successful pumps. Flow/Skyway must be physically reachable and measurably faster with the same initial state and common finish boundary.
4. Use real air dashes, ordinary springs and rings. A ring should be reached with a spent dash and followed by a usable next command; crossing an unused ring is not refill evidence.
5. Carry all state through roll → pump → ramp → launch → dash → refill → skim → roll. Include launch/landing contact IDs, carried vx and dash charges in receipts.
6. Let misses fall forward and rejoin. Test a genuine missed contact, not the successful Skyway recipe renamed “recovery”. Record the first lower catch and rejoin x/time/surface/vx.
7. Preserve six ordered Level 1 split gates, three fragments, story, keepsakes, checkpoints, NPCs, hazards, seeds and natural Parade. Keep lower gates vertically inclusive so elevated routes remain legitimate.

## Complete-route acceptance protocol

Define finish, required contacts/events and important failures **before** implementation. For each recipe create one production World with the entire level, then run uninterrupted controls to finish. No between-link reset, teleport, charge injection, Parade pre-reveal or hazard removal. Section fixtures may declare an initial state/reveal boundary, but cannot be called whole-level clean Time Trial evidence.

Run Garden/Flow/Skyway and genuine missed-Skyway recovery from matching initial states, plus 132/180/225/260px/s entry matrices, successful/missed/partial pumps, takeoff/timing perturbations and resource failures. Verify real Input tapes at 30/60/144 rendering fps with events delivered in frame batches and physical timestamps, including release/repress inside a fixed tick. Render hitches that drop simulation time are a separate test category.

Retain runnable policies/tapes and machine-readable evidence: entry/exit vx, total fixed-step airtime, actual landing x/y and runtime/authored surface IDs, slope/curvature, pumps and quality, completion time, recovery/rejoin, peak speed, wall/death/respawn counts, gates, fragments and Parade. State criteria and failures explicitly; a timeout is failure, never reachability. Compare accepted pumps with measured delivered/time benefit, including cap clipping.

Keep the original full route suite passing, plus complete tests, TypeScript checking, production build and `git diff --check`. Verify both characters, visual presets and Bloom against the same movement outcomes at the available real boundary. Record browser and human checks separately. Never upgrade a mocked boundary to live/game/device success.

## Acceptance language

| Claim | Required evidence |
| --- | --- |
| Reachable once | One complete successful recorded phrase with production state and declared inputs |
| Reliably reachable within tested conditions | Every declared entry/takeoff/timing/resource sample passes; publish the finite matrix and failures |
| Comfortable for ordinary play | Human first-clear/repeat-play observations across appropriate players; measured automation alone is insufficient |
| Optimized for expert movement | Demonstrated route search or expert attempts under comparable rules; a faster scripted recipe alone is insufficient |

Sampled isolated-link windows may help discover geometry, but different samples can use different recipes. They do not prove a continuous timing window, reliable phrase, human comfort or optimal route. Broader claims require broader evidence.

Before handoff, publish current measured examples in [Laboratory](SKYFLOW_LABORATORY.md) and retain [comparison JSON](evidence/skyflow-route-comparison.json). Human feel, browser integration, physical display/input and sustained performance are distinct acceptance gates.
