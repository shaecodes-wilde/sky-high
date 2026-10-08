# Implementation status — vertical slice

_Last updated 2026-10-07._ This report separates what works from what is a placeholder, and what was actually tested from what was not.

## Completed and working

| Area | Notes |
| --- | --- |
| Start screen → setup → character select → play → completion | All flows work with keyboard (arrows / Enter / Esc) and mouse. |
| Two playable characters | Poppy (brown hair per the user's request) and Sir Puddlewick (bald, opaque white underwear, duck floatie). Same movement values, same 10×22 hitbox. Each has 21 frames: idle, start, run ×6, brake, jump, apex, fall ×2, dash, land, rebound, fail, cheer ×2. |
| Controller | See the table below. |
| Collision | Swept one axis at a time, so it cannot tunnel at any speed. One-way clouds, ceilings, a 4 px corner nudge and a 4 px ledge nudge, all checked against free space. |
| Fixed 60 Hz simulation | Accumulator with capped catch-up. Rendering interpolates. Timing resets on pause, focus loss and visibility changes. |
| Environment vocabulary | Puff clouds, run-into/land-on springcaps, wind ribbons, dewdrop rings, and one hazard family (ink-thistles). |
| Level 1 | Hand-authored, about 8,900 px long. Includes: tutorial garden, dash and springcap introductions, ring experiment floor, standard route plus two express lanes, recovery clouds, 6 checkpoints, 3 on-route fragments, 3 off-route keepsakes, 105 sun-seeds, 2 rest points with the other character, the parade, and the ending. |
| Bloom | Built from forward progress, sustained speed and traversal events near the progress frontier. Tiers use hysteresis. It drives presentation only; a test confirms trajectories are identical at Bloom 0 and 1. |
| The Petal Parade | Authored trigger. Runs anticipation (bud sparkles, slight sky dim) → reveal (flower opens, floral fans unfurl, cloud faces wake) → peak → release into a lasting afterglow. The petal bridge is telegraphed as a dotted outline and becomes solid only when fully visible. A test checks it is 811 px from the trigger, versus the 720 px needed at maximum speed. |
| Checkpoints | Restore position, ring and spring state, and transformation state. Dying during the parade from the earlier checkpoint resets the sky to dormant. |
| Adventure / Time Trial | Time Trial hides tutorial signs and skips dialogue. It shows a timer and split deltas at each checkpoint. Pausing, hiding the tab, losing focus, retrying from a checkpoint, or skipping checkpoints all turn the attempt into practice, with a visible label and reason. `Backspace` starts a clean run. |
| Local records | Stored in localStorage, keyed by level, `MOVEMENT_RULES_VERSION` and assist mode. Best time, best splits and best segments are stored. Practice runs are never stored. |
| Audio | Procedural adaptive score with four synchronised stems (see `AUDIO.md`). Rate-limited effects, Poppy's bells and Sir Puddlewick's duck squeak. Music / effects volumes and mute, plus correct pause/resume. If audio is blocked, a banner offers to retry. |
| Presentation | 480×270 render target, integer upscale with letterbox, nearest-neighbour sampling, pixel-snapped camera and sprites, no colour-management drift. Gentle / Standard / Vivid presets, plus separate controls for shake, afterimages and distortion. Reduced effects keep every gameplay cue. |
| Fallback | Shows a clear message if WebGL is missing or fails to start. |

### Controller tuning (hypotheses, `src/config/movement.ts`)

| Item | Value |
| --- | --- |
| Time to reach run speed | ≈0.21 s |
| Coyote time | 100 ms |
| Jump buffer | 120 ms |
| Variable jump height | yes |
| Air dash | 140 ms at 1.70× run speed |
| Dashes | one per airtime; refilled by landing, springcaps and rings |
| Dash behaviour | gravity reduced during the dash; never launches upward; never slows a faster player |
| Momentum | kept on landing and decays gradually |
| Horizontal speed cap | 300 px/s |
| Double-tap | adjustable window (140–360 ms); ignores key-repeat; second tap must be airborne; state clears on focus loss, restart and character select |
| Dash key | dedicated, remappable |

## Placeholders and known gaps

- **Music is a procedural demo, not a studio soundtrack.** A replacement path for recorded stems is in `AUDIO.md`.
- **No human playtesting yet.** All tuning values are untested hypotheses.
- **Expert route time is probably short of the 60–100 s target.** The level test estimates the normal route at plain run speed with simple scripted jumps: **62.0 s**. A momentum-optimised expert run would likely be faster. Lengthening the level or adding more phrase variety would close the gap.
- **No local ghost.** It was optional ("once the base game is solid") and is not implemented.
- **Only one transformation (the Petal Parade).** That is all the brief asks for in the first level. The Ink-and-Sun Carnival and the Moonsea are not started.
- **Touch and gamepad are not supported.** The canvas and menus resize to fit any screen, but play is keyboard-only.
- Character art is generated from code. It keeps a consistent grid, baseline and palette, but has not been hand-polished by a pixel artist.
- Collectible "sun-seeds" are only counted. They unlock nothing, by design.

## Tests actually run

`npm test` → **102 tests passed, 5 files** (Vitest 5.0.3, Node 24.13, Windows 11):

| Suite | What it checks |
| --- | --- |
| `tests/controller.test.ts` (23) | Run-speed timing; immediate start; braking; landing momentum retention and decay; speed cap; coyote time (inside/outside the window); jump buffer (inside/outside); holding jump never re-jumps; variable jump height; dash speed and duration; no upward launch; never slows a faster player; one dash per airtime and recharge; no ground dash (press waits for takeoff); dash reversal; wall impact without clipping; landing mid-dash; no tunnelling through a 2 px wall at max speed; landing on a thin one-way cloud at terminal velocity and jumping up through it; ceilings; corner nudge without overlap; random obstacle course never overlapping solids; **identical results at 30 / 60 / 144 fps frame rates**; catch-up cap. |
| `tests/input.test.ts` (10) | Double-tap needs a release; key-repeat ignored; no dash when the second tap is on the ground; first tap before takeoff is OK; stale taps expire; A plus ← count as one direction; reset clears state; dash key uses the held direction or facing; jump press reported once; last-pressed direction wins. |
| `tests/world.test.ts` (11) | One ring refill per contact with explicit rearm (delay plus exit); stationary input spam can't charge Bloom; Bloom builds and eases; hysteresis; Bloom doesn't affect physics; bridge solid only at full opacity; death mid-parade restores the dormant state; post-parade checkpoint keeps the bloomed state; repeated respawns don't accumulate events; splits recorded on first arrival only; dialogue skipped in Time Trial. |
| `tests/records.test.ts` (5) | Versioned keys; best time / splits / segments; segment maths; corrupt storage; time formatting. |
| `tests/level.test.ts` (53) | Every normal-route link (including recovery links) is replayed with the real controller in the real geometry and must succeed from at least 2 different takeoff points. Every express link must be reachable. Parade lead distance; fragments sit over the normal route; the route is a connected chain from start to goal; route-time estimate. |

`npm run build` (type-check plus production bundle) also passes.

## Manual checks in a browser

Tested in the T3 Code preview browser (Chromium 152 / Electron 44, Windows 11, GeForce GT 1030, 8 logical cores, 1280×800 viewport at 2× integer scale):

- Played through title → setup → character select → gameplay for both characters, including the springcap intro, the parade trigger and reveal, the ending and the completion screen, in Adventure and Time Trial. Some checks teleported the player via the debug handle `window.cloudbloom` to reach later sections quickly.
- **Performance:** a steady 60 fps (16.6 ms average frame interval, p95 16.8 ms, max 16.9 ms), both in normal play and during the parade on Vivid at full Bloom. CPU time inside `render()` averaged 2.3 ms (p95 3.8 ms).
- **Repeated restarts:** 40 consecutive full restarts plus checkpoint retries left the scene graph at exactly the same object count (324). There is one audio scheduler and one set of 4 stems.
- Audio context reached `running` after the Start click.

## Not tested (planned)

- Real display rates of 30 and 120/144 Hz. Only simulated through the fixed-step test; the test machine is 60 Hz.
- Firefox and Safari.
- Running the production build on a static host. `npm run preview` serves it locally, but it was only smoke-tested in dev.
- Playtests with human players for difficulty, readability and first-clear duration (target 3–5 minutes).
- A full Time Trial run played start to finish with real inputs.
