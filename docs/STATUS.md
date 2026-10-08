# Implementation status — momentum movement build

_Last updated 2026-10-08._ Feature branch: `feat/momentum-movement-flow`, based on the latest remote default `master` at `5cef1be`. The default branch is unchanged. This report describes measured implementation evidence, with human feel-testing still pending.

## Implemented and preserved

| System | Current behavior |
| --- | --- |
| Ground and air control | Ordinary run speed, acceleration, strong ground braking and the 300px/s cap are unchanged. Forward ground overspeed decay is 60px/s², air overspeed decay 30px/s² and neutral air friction 25px/s². Dash and wind speed persist without making ground stops slippery. |
| Jump and cloud skimming | Variable height, short hops, full jumps, coyote time and buffering remain. A buffered landing jump executes on the contact step, preserving speed and restoring one dash. Timely dash-flight cloud rebounds get compression, a small wake and a quiet accent, without bonus speed. |
| Dash reliability | An explicit 100ms command buffer retains press direction. Ring contact can resolve the request in the same step; active-dash requests can wait for expiry. Requests consume once, held keys do not repeat, and airborne requests cancel on landing/wall impact. Ground presses retain takeoff buffering. Double taps use physical press times. |
| Springs, wind and rings | Normal/boosted 420/525px/s rebounds and bounded wind remain. Spring assistance reserves only imminent contact; deliberate earlier jumps remain available. Each ring contact refills once, with explicit exit/delay rearming. |
| Level 1 | The Morning That Forgot to Happen retains its story, characters, six respawn flowers, three fragments, three keepsakes, NPCs, hazards, recovery paths, Petal Parade and ending. It now has 114 seeds, wider cloud receivers, a reliable first-spring fork, measured seed guides and better wind/finale rejoining. See [ROUTES.md](ROUTES.md). |
| Time Trial | Six ordered forward split gates cover all legitimate vertical routes independently of respawn flower overlap. Express runs remain eligible. Death, retry, pause, focus/visibility loss and skipped gates make practice. Full restart restores clean state and transformation state. Records use `rules2` / `trial2`; unrelated settings retain their key. |
| Developer playground | Eight isolated movement sections, telemetry, fast reset, memory-only 60Hz input recording/replay and trajectory comparison. Only available in dev with `?playground`; never eligible for records. |
| Camera and presentation | More forward visibility, improved boosted-ascent and recovery-fall framing, immediate launch/compression/rebound and persistent speed trails. Pixel snapping remains. Bloom and effects affect presentation only. Both characters share physics and hitboxes. |
| Existing game/UI/audio | Title, setup, both character choices, Adventure/Time Trial, dialogue, completion, adaptive four-stem procedural music, volume/mute, presentation presets and WebGL fallback remain. No dependency or major rendering refactor was introduced. |

Full tuning comparison, controls, developer usage, owner checklist and git review stages are in [MOVEMENT.md](MOVEMENT.md).

## Automated checks actually run

Baseline: `npm ci`, `npm test` → **102 passing tests / 5 files**, and `npm run build` → pass.

Final integrated commands:

```sh
npm test -- --reporter=default --reporter=json --outputFile=docs/evidence/tests.json
npm run build
git diff --check
```

**260 tests pass in nine files; zero failures.** TypeScript checking and the Vite production build pass. The main bundle is 641.66kB (171.73kB gzip), with no new dependency. The developer playground is excluded from production. The build output is captured in [evidence/build.txt](evidence/build.txt), and the exact test results in [evidence/tests.json](evidence/tests.json).

| Suite | Passed | Observable outcomes |
| --- | ---: | --- |
| Controller | 43 | Momentum retention, braking, jump heights/buffers/coyote time, dash expiry/direction/landing, spring contacts/early jumps, ceilings, thin surfaces, no overlap/tunnelling in tested cases, fixed-step determinism. |
| Input | 14 | Fresh press edges, no repeat, double-tap timing with delayed sampling, remapped/combined physical bindings, facing/direction and reset. |
| World | 23 | Ring rearming, Bloom parity, parade activation/restoration, independent ordered gates, reverse/skipped crossings, death/retry and checkpoint state. |
| Records | 13 | Versioned storage, valid ordered finite splits, best times/segments, corruption handling and formatting. |
| Level | 55 | Real-physics reachability and sampled landing windows, recovery/express links, parade lead, collectibles and connected structure. |
| Traversal | 95 | Connected phrases, spring receivers at 132/225/300px/s, 81 whole-level speed/timing variants, exact tape replay, real keyboard-input Flow run and 30/60/144fps FixedLoop replay. |
| Movement/World integration | 9 | Timely/stale dash commands around real ring contact, active expiry, saved direction, held-key limits, long early-dash skim feedback and event/state determinism. |
| Playground | 3 | Eight-zone separation, exact record/replay/reset behavior and practice-only eligibility. |
| Camera | 5 | Forward visibility at ordinary/dash/cap speed, boosted ascent and fast recovery falls with the actual level boundary. |

## Measured continuous routes

All runs use the production World and collision rules with no mid-route teleports, velocity overrides, forced refills or hazard removal. The parade starts dormant and reveals normally.

| From rest | Time | Splits / fragments | Skims | Deaths / wall impacts |
| --- | ---: | --- | ---: | --- |
| Comfort | 56.217s | 6/6 / 3/3 | 0 | 0 / 0 |
| Flow | 55.717s | 6/6 / 3/3 | 2 | 0 / 0 |
| Express | 53.800s | 6/6 / 3/3 | 0 | 0 / 0 |

The matrix varies initial speed 0/132/225px/s, every takeoff by −6/0/+6px and every dash by −1/0/+1 fixed step. **All 81 variants finish cleanly**, with bounded speed. All 27 Flow variants require both skims and unchanged same-step landing/exit velocity. Express is 2.417s (4.3%) faster than comfort in these recordings. This establishes feasible connected routes and a real shortcut benefit; it does not establish optimal times, broad continuous timing windows or beginner difficulty.

Every main link has at least an 18px successful sampled takeoff window; recovery/express links have at least 12px. Different positions can use different timing recipes. Details and repeatable policies are in [ROUTES.md](ROUTES.md).

## Browser evidence

These are automated Chromium checks in the T3 collaborative preview, **not human playtesting**:

- Title/setup/character selection and gameplay were exercised through DOM controls. Both characters across Gentle/Standard/Vivid and Bloom 0/1 reproduced identical trajectories in a 180-step fixture.
- The playground recorded and replayed 90 steps exactly, including velocity, dash charges and timer; its record eligibility remained false. [Screenshot](screenshots/movement-playground.png).
- Uninterrupted whole-level Game replays completed comfort and express with six splits, three fragments, zero deaths/walls and accepted clean records. Completion UI displayed 56.22s and 53.80s. Records used an in-memory fixture to preserve existing saved records. Death/retry became practice, and restart restored clean state.
- The production preview loaded with `?playground` but opened normal Level 1 without developer controls; a 60-step keyboard smoke check reached normal run speed. The Start click unlocked the audio context.
- An earlier normal RAF sample on Vivid/full Bloom covered 120 frames: mean interval 16.668ms, p95 16.8ms; mean render CPU 1.628ms, p95 3.5ms. This was an earlier presentation build, before final geometry/Flow integration; it is not a final Parade benchmark or sustained performance guarantee.

Receipts: [browser-movement.json](evidence/browser-movement.json), [browser-completion.json](evidence/browser-completion.json), [production-smoke.json](evidence/production-smoke.json).

The desktop preview host disconnected before a final production Parade performance check and before the new Flow policy could be browser-replayed. Flow is verified through production World and real keyboard Input tests. A synchronous 1,080-render stress evaluation timed out and detached its tab; sustained stress was not verified. Startup Electron preload errors were observed separately from the working game. Focus changes intentionally paused play.

## Remaining limitations and owner checks

- No human first-clear, speedrun or feel-testing. Prioritize skim readability, lower short-hop thistle approaches, upper wind/ring rejoining, petal timing, stopping/turning and audio balance. Use the specific [owner checklist](MOVEMENT.md#owner-playtest-checklist).
- Firefox/Safari, physical 30/120/144Hz displays, remote/static-host deployment and sustained resource/performance behavior are untested. Render-rate independence is verified in simulation; it is not physical-display evidence.
- Touch/gamepad remain unsupported; gameplay is keyboard-only. Normal gameplay has no new controls.
- Music remains a procedural demo and character art remains generated from code. A recorded-stem replacement path is in [AUDIO.md](AUDIO.md).
- One transformation (Petal Parade) remains. Later story levels were outside this scope. Optional seeds are counted rather than unlocking content. There is no production ghost; trajectory comparison is developer-only.

The game has a strong, repeatable movement implementation. Final tuning remains a human playtest decision.
