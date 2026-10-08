# Cloud Curl and Skyflow implementation handoff

Feature branch `feat/cloud-curl-skyflow`, based on `origin/master` at `0701b28`.
The previous momentum overhaul was already merged there. This implementation
does not incorporate the independent art branch or merge into the default branch.

## 1. Implementation

Hold S or Down to curl. The smaller body keeps its feet anchored, carries earned
speed, accelerates downhill, slows uphill and permits deliberate steering and
braking. Release safely restores the standing body when clearance allows it.
Forward coasting and a fresh press near a real valley bottom earn a small,
finite pump reward. Terrain curvature can produce a natural launch; a roll
jump adds a bounded slope influence to the existing jump.

Curves use immutable cubic Hermite geometry with analytic height, tangents,
normals, curvature and extrema. Collision supports the entire foot span and
tests swept airborne motion against the real curve. Broad rectangles do not
act as fake flat surfaces. Ordinary flat-only collision retains its previous
behavior. Ground following, contact transitions, crest separation and wind
respect the safety cap.

Existing jumping, coyote time, buffered landing jumps, air dashes, springs,
ring refills and cloud skims remain part of the same controller. Ordered
physical directional edges survive fixed-step catch-up and recording.
Grounded pump taps cannot become an accidental airborne double-tap dash.

The development-only Laboratory has seven connected zones, resettable starts,
telemetry and memory-only recording/replay. Level 1 adds an optional high
branch near Duck Feather, with bowls, an uphill launch, aerial receivers,
refill, skim and curved recovery/rejoin. The old story route and collectibles
remain available without pumping. Rules-3 record keys isolate prior records.

## 2. Movement tuning

The complete authoritative inventory and equations are in
[CLOUD_CURL_PHYSICS.md](CLOUD_CURL_PHYSICS.md). These values are measured
engineering defaults; human feel approval is still pending.

| Item | Original / proposed | Implemented | Reason |
| --- | --- | --- | --- |
| Ordinary run / dash | 132 / 225 px/s | Unchanged | Preserve established navigation and aerial ability. |
| Standing / curled body | 10×22; curl absent | 10×22 / 10×12 px | Real lower clearance with a stable feet anchor. |
| Rolling target | Proposed 220–240 | 230 px/s | Reachable controlled cruising; retains faster earned speed. |
| Roll drive / reverse brake / resistance | New | 260 / 650 / 12 px/s² | Responsive drive, progressive stopping, low coasting loss. |
| Rolling gravity | Proposed real tangent gravity | 880 px/s² projected on tangent | Genuine downhill gain and uphill cost. |
| Safety cap | Horizontal 300 | Horizontal 300; grounded roll tangent 300 px/s | Bounds high-speed contact and wind-assisted crest launch. |
| Pump minimum speed | New | 60 px/s | Require meaningful traversal. |
| Good / perfect reward | Proposed +8 / +16 | +8 / +16 px/s over 100 ms | Finite force, including legitimate takeoff; cap still applies. |
| Good / perfect window | Proposed ±110 / ±50 ms | ±110 / ±50 ms | Interpolated actual bottom crossing and physical press time. |
| Release / valley rearm | New | 280 ms / whole valley plus 12 px | Intentional gesture, one reward per traversal, no rocking farm. |
| Roll jump | Existing 302 px/s jump | 302 + clamp(0.35×vx×slope, ±60) | Modest launch shaping below the 420/525 spring strengths. |
| Record rules | 2 | 3 | New physics and route geometry make prior times incomparable. |

Experiments rejected a centre-only foot probe, a broad-box curve landing,
initially unrefilled aerial paths, and a wind force applied after the tangent
cap. The final implementation uses the full foot span, diagonal analytic
sweeps, reachable ring placement and a cap reapplied after wind. Lab geometry
uses broad inter-bowl crests and a localized launch crest instead of
accidentally ejecting the player from each bowl. Route recipes return input
only; they never force a launch, refill or recovery.

The tangent cap can reduce horizontal speed on very steep contact. For
example, slope 1 limits grounded rolling vx to about 212.13 px/s; moderate
slope 0.5 can retain an incoming 225 px/s. A pump accepted at the cap may
have its reward clipped. Success feedback alone is not evidence of faster
travel. Matched pump comparisons belong in the route evidence below.

## 3. Connected route comparison

Final measurements from rest:

| Laboratory route | Time | Entry / exit vx | Airborne occupancy | Pumps / skims / refills |
| --- | ---: | ---: | ---: | ---: |
| Garden Trail | 28.067s | 0 / 290.696 px/s | 1.867s | 0 / 0 / 0 |
| Flow Line | 19.067s | 0 / 290.806 px/s | 1.917s | 3 / 0 / 0 |
| Skyway | 17.700s | 0 / 290.800 px/s | 4.150s | 3 / 3 / 1 |
| Missed Skyway, forward recovery | 19.183s | 0 / 290.800 px/s | 2.950s | 3 / 2 / 1 |

Skyway saves 1.367s over Flow and 10.367s over Garden in these recipes.
The missed skim costs 1.483s, catches the lower curve near x3247/y28 and
rejoins near x3674/y142 without death, reset or refill forcing.

Whole Level 1: Garden **56.217s**, legacy Flow **55.717s**, legacy Express
**53.800s**, new hybrid **49.917s**. The hybrid saves 3.883s over legacy
Express. All four collect three fragments, cross six gates and trigger the
Parade naturally. All 81 original timing variants remain passing.

Matched x600-to-x1940 bowl experiments:

| Entry vx | Full pumps | Partial, first/third | No or late-missed pumps |
| ---: | ---: | ---: | ---: |
| 132 | 5.500s | 5.533s | 5.583s |
| 180 | 5.450s | 5.467s | 5.517s |
| 225 | 5.417s | 5.450s | 5.483s |
| 260 | 5.383s | 5.400s | 5.450s |

The benefit is real but modest: 0.067–0.083s. All chains leave the common
flat approach at 229.8 px/s; gravity/capping and drive equalize final speed.
Pumps improve intermediate uphill motion rather than permanently increasing
exit speed. All 72 declared continuous cases pass at the representative
132/180/225/260 entries, selected takeoff/pump variations and chain variants.
This is a finite tested matrix, not a broad timing comfort guarantee.

[Measured comparison and source hashes](evidence/skyflow-route-comparison.json),
[interactive route comparison](evidence/skyflow-summary.html),
[authored content receipts](SKYFLOW_LEVEL_CONTENT.md).
Every measurement uses one continuous production World with carried velocity,
dash state, ring arming and progression. No link-by-link state repair is used.

Garden Trail uses the lower receivers without successful pumps. Flow Line
conserves rolling momentum along the connected lower route. Skyway combines
the bowls, slope jump, dash, real refill and cloud skims. A missed aerial
receiver falls onto a lower catch and continues forward into the curved
rejoin, losing time rather than requiring a reset.

## 4. Verification and performance

Baseline: `npm ci`, all **260 tests / 9 files**, and `npm run build` passed.
The baseline main bundle was **641.66 kB / 171.73 kB gzip**; no dependency was
added. [Baseline tests](evidence/skyflow-baseline-tests.json),
[baseline build](evidence/skyflow-baseline-build.txt).

Final integrated `npm test` passes **477 tests / 18 files**, including all
original tests, in **11.22 seconds** on this machine. The route generator
passes **72 scenarios with zero failures**. TypeScript and production build
pass; main bundle **666.98 kB / 180.27 kB gzip**, a 25.32 kB / 8.54 kB gzip
increase over baseline. No dependency was added.

[Final test JSON](evidence/skyflow-tests.json),
[production build output](evidence/skyflow-build.txt).

The complete matrix exposed two false wall reports at curved cloud exits.
The solver now resolves the exact trailing-foot support boundary before
departure. Bidirectional endpoint regressions cover five speeds; the full
matrix was regenerated without weakening any movement criteria. Only that
expensive matrix test has a 15-second execution timeout for parallel workers.

Automated Chromium verified all seven stable section starts, safe low-arch
uncurl, all four full routes, exact 350-step/three-pump recording/replay,
both characters × three visual presets × low/high Bloom, browser audio
unlock and normal Level 1 completion with clean rules-3 record submission.
Record writes used an in-memory store; existing saved values were restored.
The production preview at `?skyflow` opens ordinary Level 1 with no developer
panel, and its live RAF/input loop curls to height 12 and safely stands to 22.

[Lab/browser receipt](evidence/skyflow-browser.json),
[Level 1 browser receipt](evidence/skyflow-browser-level1.json),
[production smoke](evidence/skyflow-production-smoke.json),
[repeatable development-browser script](evidence/skyflow-browser-checks.js).

A 120-frame Vivid/full-Bloom sample during the naturally active Parade with
audio running averaged **2.38 ms renderer CPU**, p95 **4.20 ms**, maximum
**5.40 ms**. Frame interval mean was **16.42 ms**, p95 **17.10 ms**. A preceding
audio-idle sample had a 29.40 ms rendering outlier and 31 ms frame interval.
These short local samples measure CPU submission, not GPU completion or
sustained device performance. [Performance receipt](evidence/skyflow-browser-performance.json).

Required repeatable commands:

```sh
npm test -- --reporter=default --reporter=json --outputFile=docs/evidence/skyflow-tests.json
npm run build
node tools/skyflow-evidence.mjs
git diff --check
```

Coverage includes both travel directions, hitbox clearance, momentum,
steep contact, braking, slope gravity, drag, pump timing and anti-farming,
wind caps, natural launches, curved diagonal landings, dash/skim/ring chains,
physical event batching, exact replay, clean progression and legacy routes.
Browser checks are automated Chromium evidence, not human playtesting.

## 5. Animation and feedback

Both characters have curl and uncurl transitions, stationary/slow/medium/fast
distance-driven roll phases, pump compression, perfect release, curled
braking, rolling flight and landing poses. Poppy retains her mushroom cap,
flower and braid; Sir Puddlewick retains his duck cushion, top hat, monocle
and moustache. Both share frame selection and identical physics.

Mint pump feedback, small terrain pulses, restrained dust/trails and distinct
audio accents read actual simulation events. Gentle effects keep success
readable; Bloom and effects settings cannot alter physics. Curved art uses
the collision geometry. Procedural frames remain replaceable through the
documented sheet and anchor contract.

[Character-state screenshot](screenshots/skyflow-character-states.png).

## 6. Permanent documentation

1. [Movement design](MOVEMENT_DESIGN.md): control intent, transitions and movement identity.
2. [Cloud Curl physics](CLOUD_CURL_PHYSICS.md): authoritative equations, geometry, invariants and tuning.
3. [Level design standard](LEVEL_DESIGN_STANDARD.md): three route roles, authoring, recovery and continuous acceptance.
4. [Animation standard](ANIMATION_STANDARD.md): frame states, anchors, feedback and future art replacement.
5. [Skyflow Laboratory](SKYFLOW_LABORATORY.md): fixtures, controls, repeatable experiments and measured routes.
6. [This implementation report](SKYFLOW_IMPLEMENTATION_REPORT.md): delivery, evidence, limitations and git handoff.

README and AGENTS link these standards. MOVEMENT.md and ROUTES.md are labelled
historical rules-2 evidence. SKYFLOW_CONTRACT.md records implementation
ownership and initial integration decisions; it is not a second physics authority.

## 7. Known issues and human acceptance

- Human first-clear, comfort, stopping/turning, pump readability, audio balance
  and expert flow still need hands-on playtesting. Automated reachable routes
  are not optimal speedruns or proof of beginner difficulty.
- Physical displays at 30/120/144 Hz, Firefox/Safari, mobile devices and a
  deployed static host are untested. Simulation cadence checks do not prove
  physical-display performance. Gameplay remains keyboard-only.
- Prototype art and procedural music remain. Future art integration must
  reconcile the independent art branch with the new compact frame contract.
- Pump saturation at the speed cap and steep-slope horizontal retention are
  intentional bounded tuning tradeoffs; review them during feel-testing.

## 8. Git and preview handoff

Work is committed only on `feat/cloud-curl-skyflow`, based on `0701b28`.
No default-branch merge, push or PR publication was performed.
The five isolated workstreams and owned source hashes are recorded in
[skyflow-workstreams.json](evidence/skyflow-workstreams.json).

Key files: `src/sim/terrain.ts`, `src/sim/collision.ts`, `src/sim/Player.ts`,
`src/input/Input.ts`, `src/config/movement.ts`, `src/level/skyflowLaboratory.ts`,
`src/level/level1Skyflow.ts`, `src/level/traversal.ts`,
`src/render/characters.ts`, `src/config/animation.ts`, `src/game/Game.ts` and
`src/dev/playground.ts`.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5183 --strictPort
```

Open `http://localhost:5183/` for Level 1,
`http://localhost:5183/?skyflow` for the Laboratory,
`http://localhost:5183/?playground` for the earlier movement fixtures, or
`http://localhost:5183/?sheet` for procedural frame inspection.
The Lab query and developer controls are excluded from production.

Key integrated commits:

| Commit | Change |
| --- | --- |
| `0e8e0be`, `a103fcf`, `819caa2` | Analytic terrain, diagonal airborne sweep, exact endpoint departure. |
| `884e505`, `576a3b5`, `9c1c1fb` | Curl/pumping, curved landings and finite delivery, cap after wind. |
| `e9383b8`, `d6cd0c0` | Both-character roll art/effects/audio; actual tangent speed for visual feedback. |
| `8bb8fec`, `ac90290` | Connected Lab, additive Level 1 and authored content evidence. |
| `1479c48`, `425212d`, `64e2686` | Physical tapes/telemetry, permanent standards and passing route matrix. |
| `3eaf89a`, `df897eb`, `cf18557`, `27893f2` | World integration, fixed input boundaries, playable tools and compatibility checks. |

The final delivery commit additionally retains this report, status/index,
browser/performance/production receipts and integrated test/build output.
