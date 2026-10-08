# Momentum and movement handoff

Historical handoff for movement rules 2, merged into `master` before Skyflow.
For current movement behavior and tuning, read
[MOVEMENT_DESIGN.md](MOVEMENT_DESIGN.md) and
[CLOUD_CURL_PHYSICS.md](CLOUD_CURL_PHYSICS.md).
The measurements below describe the earlier build.

Implemented on `feat/momentum-movement-flow`, based on remote `master` at `5cef1be`. The default branch is unchanged. This is measured engineering tuning, pending human feel-testing.

## Controller contract and tuning

The identity is cloud skimming: spend a dash to earn speed, absorb a cloud landing, then jump while preserving that speed. Forward input conserves earned momentum. Releasing on the ground or pressing against motion remains an intentional brake. Skimming supplies feedback and a landing refill, never bonus speed or height.

| Parameter | Before | Implemented | Reason |
| --- | ---: | ---: | --- |
| Run speed | 132 px/s | 132 | Keep ordinary navigation familiar. |
| Ground acceleration | 640 px/s² | 640 | Run speed arrives in about 0.217 s. |
| Ground reverse brake | 1500 px/s² | 1500 | Deliberate stops and turns remain strong. |
| Ground neutral friction | 1100 px/s² | 1100 | Releasing ground input remains useful. |
| Ground overspeed neutral friction | 520 px/s² | 520 | Earned momentum does not make stopping slippery. |
| Forward ground overspeed decay | 150 px/s² | **60** | Dash landings preserve useful speed across the next approach. |
| Air acceleration / reverse brake | 520 / 820 px/s² | 520 / 820 | Preserve trajectory control. |
| Air overspeed decay | 45 px/s² | **30** | Longer momentum jumps without raising the cap. |
| Neutral air friction | 140 px/s² | **25** | Letting go in the air no longer discards most of a jump's speed. |
| Dash speed / duration | 225 px/s / 140 ms | 225 / 140 | Preserve the established ability. |
| Maximum horizontal speed | 300 px/s | 300 | Geometry and forward visibility remain bounded. |
| Coyote / jump buffer | 100 / 120 ms | 100 / 120 | Existing forgiveness stays intact; Gentle assist remains separate. |
| Airborne dash-command buffer | ~8.3 ms | **100 ms** | Ring refills and dash expiry can answer a timely request. |
| Grounded dash-command buffer | 100 ms | 100 ms | Preserve press-before-takeoff behavior. |
| Spring normal / boosted launch | 420 / 525 px/s | 420 / 525 | Distinct low and high route choices. |
| Spring early assistance | Up to jump-buffer travel (~120 ms) | Imminent contact this step | A nearby cap cannot suppress a deliberate earlier jump. |
| Camera look-ahead scale / maximum | 0.42 s / 110 px | **0.48 s / 120 px** | Show more of the next surface at earned speed. |
| Physics / trial record version | rules1 / original splits | **rules2 / trial2** | Older incompatible records remain stored separately. |

Dash commands retain their pressed direction and consume exactly once. Airborne requests are cancelled on landing and wall collision; grounded requests retain takeoff buffering. A held key produces one press. Active-dash requests wait for expiry if a refill is available. `World` resolves a command after ring contacts in the same fixed step and forwards the new dash event once.

Buffered landing jumps execute at contact, before another ground-friction step. A dash used during that flight followed by a cloud/petal landing and jump within 80 ms emits a skim accent, including longer early-dash arcs. The controller still supports short hops, full jumps, coyote jumps, apex shaping, air reversal and variable height; there is no double jump.

## Developer playground

Run `npm ci`, then `npm run dev`, then open `http://localhost:5173/?playground`. The query only works in the development build. Select a character through the normal menu, then use the section selector. This world never submits records and contains no progression checkpoints.

Eight sections cover acceleration/braking, hop height, dash timing, skims, springs, wind/rings, a continuous chain, and collision/recovery. **Reset section** or `R` returns to the selected section and stops active recording/replay. **Record** starts a clean section and captures authoritative 60 Hz inputs; **Stop**, then **Replay** reproduces that tape from its section start. The tape is held in memory, capped at one minute. The mint trajectory is the previous recording; pink is the current path. Automatic deaths preserve deterministic tape playback while returning to the selected section.

The optional HUD shows horizontal/vertical speed, grounded state, charges, dash/coyote/jump/dash-buffer timers, the last movement event, fixed step rate and section time. The 60 Hz label is the authoritative simulation rate, not a claim about display FPS.

## Routes and geometry

See [ROUTES.md](ROUTES.md) for measured connected traversals, the seven authored phrases, landing/exit evidence and timing windows. The intended chain remains run → jump → air dash → cloud landing → buffered jump → spring → ring refill → wind → fast landing.

The first spring's old raised solid receiver forced a sidewall collision at all tested entry speeds (132, 225, 300 px/s). The receiver now admits a rebound from below, with a higher boosted fork. Later receiver positions and widths were tuned from connected approaches, including wind exits, parade petals and the finale. Recovery geometry, the story, both characters, collectibles, the Petal Parade and ending remain.

Comfort landings trade time for forgiveness. Flow rewards conserved speed through ordinary clouds and refills. Express links use higher forks and wind, rejoining without a checkpoint detour. The measured times from rest are 56.217 / 55.717 / 53.800 seconds respectively. Flow demonstrates two real same-step skims near x=1223 and x=1964, preserving 214/218 px/s; its following short hop lands before the thistles where a full jump at that carried speed would be risky. All 81 tested speed/timing variants complete cleanly. A scripted traversal is evidence of a usable route, not a claim that it is the fastest possible human run or that beginners will clear it.

## Progression and records

Respawn flowers still determine restart positions and transformation snapshots. Time Trial gates now measure forward crossings of ordered x boundaries over all legitimate heights. Default gate positions follow the six existing flowers, but their trigger is independent of the small flower overlap box. Explicit bounded gates can be authored through `LevelData.splitGates`.

Crossing times interpolate within the fixed step; they do not change physics. Reversing cannot create duplicate splits. Missing/out-of-order gates irreversibly invalidate the attempt. Death, checkpoint retry, pause, focus loss and visibility loss make Time Trials practice. A full restart clears invalidity and restores all world state. Records reject missing, unordered or non-finite splits; settings retain their existing storage key.

## Presentation

Both characters retain identical physics and hitboxes. Shared visual states add immediate launch compression, landing-to-jump rebound, faster descent cadence, cloud compression under two pixels, and persistent speed trails. Skims get a small colored wake and a rate-limited musical accent; rings and normal/boosted springs retain distinct feedback. Particle density and afterimages respect presentation settings. Bloom continues to affect presentation only; collision surfaces never move with their visual compression.

The camera keeps pixel snapping and smooth look-ahead, follows a boosted ascent faster, and uses the level's fall boundary to frame recovery falls. There is no new zoom, roll or skim shake. The four-stem adaptive procedural score remains intact.

## Owner playtest checklist

1. **Stop and turn:** run, dash-land, then release and reverse. Speed should feel valuable when holding forward; stopping should feel deliberate and quick.
2. **Hop choices:** tap and hold Space across the same obstacle. A low hop should be faster when height is unnecessary; full height should feel controllable.
3. **Three dash timings:** dash on ascent, at apex, and during descent. Look for different useful landing trajectories rather than one universal timing.
4. **Cloud skim:** press jump just before a dash landing, then just after. Expect compression/rebound, preserved speed and one available dash. Watch for a sticky frame, phantom dash or missed input.
5. **Spring fork:** run into the first cap normally, press jump near contact, then deliberately jump earlier. Normal should favor the low route; boosted should open the upper route; early jump should remain yours.
6. **Dewdrop refill:** spend a dash and press again just before a ring. Expect one reliable refill/dash accent. Hold Shift while landing and jumping again; it must not dash by itself.
7. **Express Time Trial:** stay on upper lanes across every split. Expect ordered split feedback and eligibility without descending to respawn flowers. `R`, death or pause must show practice; Backspace starts clean.
8. **Parade at speed:** approach at dash/wind speed, cross the revealed petals and deliberately miss one. Watch activation lead, landing readability and recovery opportunities.
9. **Camera and comfort:** repeat boosted ascent, fast fall and finale with Gentle/Vivid, afterimages on/off, and both characters. Verify forward visibility, geometry clarity, subdued accents and equal movement feel.
10. **Record/replay:** record a playground section, replay it, then retry mid-recording. The replay should match; manual retry should stop the recording and reset the section.

Remaining tuning questions are the forgiveness of the express wind exit and final ring approach, whether full versus short hops offer enough variety, and whether skim accents clearly explain the technique without becoming repetitive. Human first-clear time, difficulty, audio balance and sustained keyboard feel remain unmeasured. Touch/gamepad, Firefox/Safari and physical high-refresh displays are outside the verified scope.

## Evidence and commands

The baseline was `npm test` (102 tests in five suites) and `npm run build`, both passing. The final integrated run passes 260 tests across nine suites; type-check and production build also pass. Current exact results and browser limitations are recorded in [STATUS.md](STATUS.md), with machine-readable outputs in [evidence](evidence/).

Useful focused checks:

```sh
npm test -- tests/controller.test.ts tests/input.test.ts tests/movement-world.test.ts
npm test -- tests/traversal.test.ts tests/level.test.ts
npm test -- tests/world.test.ts tests/records.test.ts
npm test -- tests/playground.test.ts tests/camera.test.ts
npm test
npm run build
```

New tests exercise observable crossings, refills, landings, speed retention, full traversal and record eligibility. Mock tests are not used as proof of browser feel. Browser checks use automated input/debug stepping and clearly remain separate from human playtesting.

## Git handoff

Remote default branch: `master`. Baseline: `origin/master` at `5cef1be`. Feature branch: `feat/momentum-movement-flow`. No merge or default-branch commit was made.

The main review stages are:

| Commit | Review focus |
| --- | --- |
| `75a135a`, `2276492` | Isolated movement playground, camera tests and movement presentation. |
| `ff423cf`, `60c305f` | Independent ordered splits, record eligibility and Game integration. |
| `23193d8`, `8ed1f74` | Controller/input reliability, same-step ring resolution and skim feedback. |
| `60bafec` | Replay reset, first launch frame and recovery camera corrections found in review. |
| `cf9eeed` | Wider cloud receivers, spring forks, wind exits and measured seed guidance. |
| `e8d1c69`, `a4d056c` | Production-World traversal harness, whole routes and route report. |
| `124d466`, `4ce7ef1` | Long early-dash skim accents and complete Flow traversal through real keyboard input. |

Changed systems: `src/config/movement.ts`, `src/sim/Player.ts`, `src/sim/World.ts`, `src/input/Input.ts`; level geometry/types/validation/traversal; `src/game/Game.ts`, `src/main.ts`, persistence; camera/renderer/animation/audio; developer playground and its UI; nine test suites and documentation/evidence. Collision code and the underlying rendering architecture remain intact. No dependency was added.

Normal preview: `npm run dev`, then `http://localhost:5173/`. Developer movement sections: append `?playground`. Production preview: `npm run build`, then `npm run preview` (normally port 4173); the playground query is ignored there. Press `Backspace` for a clean restart and `R` for checkpoint practice. The feature branch can be reviewed before any release or merge.
