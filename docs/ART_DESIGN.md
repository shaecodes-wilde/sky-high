# Cloudbloom — Art Design Workstream

> **Branch:** art/cloudbloom-art-design  
> **Base / future PR target:** master  
> **Parallel workstream:** independent movement-mechanics branch (exact branch name may change)  
> **Status:** Production brief v0.2 — vertical-slice art pass implemented on this branch (see *Implementation status* below and [ART_BIBLE.md](ART_BIBLE.md))  
> **Creative source of truth:** [GAME_IDENTITY.md](GAME_IDENTITY.md)

## Implementation status (2026-10-08)

The chosen direction is **Skyprint Folklore**, the relief-print hymnal recorded in [ART_BIBLE.md](ART_BIBLE.md). It is now implemented across the whole first level, not just a sample section:

| Area | State | Where |
| --- | --- | --- |
| Palette tokens and art bible | Done | `src/render/palette.ts`, `docs/ART_BIBLE.md` |
| Presentation-signal adapter (movement → art contract) | Done, tested | `src/render/signals.ts`, `tests/signals.test.ts` |
| Characters (21 frames each, same 24×32 contract) | Done; Sir Puddlewick redone structurally | `src/render/characters.ts`, `?sheet` |
| Cloud Curl roll/curl frames (forward-compatible with movement PR #4) | Done, preview at `?sheet&curl` | `src/render/characters.ts` |
| Sky, song staff, sun rings, parade edition, ending dawn | Done | `src/render/background.ts` |
| Parallax (wind organs, cloud cliffs, carved banks, cloud sea) | Done | `src/render/background.ts` |
| Play-plane art (moored earth, carved clouds, interactables, set pieces) | Done | `src/render/props.ts` |
| Curved-terrain material seam | Done (`terrainMaterial`) | `src/render/props.ts` |
| FX: bursts, print stamps, registration ghost, landing shadow | Done | `src/render/Bursts.ts`, `src/render/GameRenderer.ts` |
| Petal Parade choreography | Done | `src/render/GameRenderer.ts` |
| Game-native UI and HUD | Done | `src/ui/styles.css`, `src/ui/ornaments.ts`, `src/ui/UI.ts` |
| Before/after captures | Done | `docs/art/before/`, `docs/art/after/`, `docs/art/characters.png` |
| Real-GPU performance measurement | **Not done**: the preview browser renders with SwiftShader (software GL), so frame timings there are not meaningful | — |
| Human playtest of readability at speed | **Not done** | — |

### Integration notes for the movement stream
- `src/render/signals.ts` is the **only** renderer code that reads controller internals. If controller fields are renamed, update `PresentationSignals.update()` and `chooseAnim()`; nothing else in the art layer depends on them.
- Movement PR #3 (merged to master) was merged into this branch. Its feedback poses (launch, skim rebound, land-into-jump, steep-fall cadence), cloud compression and skim particles are kept, and the poses are ported to the adapter.
- For movement PR #4 (Cloud Curl):
  - Keep this branch's `characters.ts`. It already draws every `roll*`/`curl*` frame name that PR #4's `animation.ts` asks for.
  - Its curved-terrain rasteriser can call `props.terrainMaterial()` per pixel instead of the legacy `PAL` ramp.
  - `PAL` keeps its old keys, now mapped to the new palette, so legacy code stays on-palette.

## Mission

Take the existing playable Cloudbloom vertical slice from coherent programmer art to a **premium, instantly recognizable, highly polished visual experience**. The goal is not a quick reskin, not one impressive still, and not a generic mixture of reference-game styles. The goal is a singular, authored visual world with exceptional character acting, compelling environmental depth, brilliant transformations, excellent motion feedback, and impeccable gameplay readability.

The visual redesign is intentionally **independent of the ongoing movement-mechanics work**. Both branches are intended to contribute separate PRs to master; do not merge from or into the movement branch directly, and do not merge this PR into master without human approval.

### Creative freedom

Reference mockups from the earlier design discussion are **loose inspiration only**. The phrase *Skyprint Folklore* is an exploratory direction, not a fixed visual template. Challenge or replace individual ideas where doing so produces a stronger artistic identity.

Borrow design *principles*, never recognizably copy characters/assets from *Celeste*, *Across the Spider-Verse*, *Super Mario Bros. Wonder*, or *Golden Sun*.

**Design north star:** The sky is lovely at rest; the player's momentum brings it vividly, magically, musically to life.

## What the repo has today

The existing implementation uses TypeScript, Vite, and Three.js. Rendering is through an orthographic 480 × 270 logical target with nearest-neighbour upscale. Assets are currently produced by code in src/render/characters.ts, src/render/props.ts, and src/render/background.ts. There is a working first level, two playable characters, Bloom presentation, a major Petal Parade event, and several effect/comfort presets.

Read these before touching implementation:

- [GAME_IDENTITY.md](GAME_IDENTITY.md) — core player fantasy, story, tone, pillars, art language, accessibility.
- [STATUS.md](STATUS.md) — implemented features, current gaps, measurements, and what was actually tested.
- [ASSETS.md](ASSETS.md) — provenance and locations of existing sprites, effects, and audio.
- [AUDIO.md](AUDIO.md) — procedural score and audio implementation.
- README.md at repository root — controls and project structure.

**Reminder:** Current status and reported performance are historical results, not proof that your branch continues to meet them. Re-run tests and benchmark your changes.

## Scope ownership and forbidden collisions

The table defines the normal ownership boundary. It is a collaboration guideline rather than permission to change gameplay contracts silently.

| Area | Art-design branch | Movement branch |
| --- | --- | --- |
| Character sprite artwork, visual poses, secondary animation | **Owns** | Consults for event timing if needed |
| Environment art, sky/background shaders, parallax, particles, decoration | **Owns** | No normal edits |
| UI styling, visual menus, HUD presentation | **Owns** | Consult for movement indicators and accessibility |
| Existing Bloom and Parade visual treatment | **Owns presentation** | Must not silently change visual API |
| Player speed, acceleration, jump, dash, input mechanics | **Do not edit** | **Owns** |
| Collision, physics simulation, deterministic loop | **Do not edit** | **Owns** |
| Movement/level reachability tests | **Do not edit except approved shared fix** | **Owns** |
| Main game wiring, shared event types, camera/gameplay contracts | **Coordinate before edits** | **Coordinate before edits** |
| Core level layout, platform coordinates, hazards | **Visuals only; geometry changes need agreement** | **Owns movement-facing geometry** |
| Game identity and product narrative | **May propose/edit; cross-discipline review** | **Consults and may propose** |

### Recommended file boundaries

**Art-first locations:**

- src/render/** (characters, environments, sprites, camera *presentation* and visual effects)
- src/ui/styles.css and presentation-only sections of src/ui/**
- src/config/presentation.ts (effects and accessibility, not movement rules)
- art assets in a clearly organized dedicated directory, if introduced
- docs/ART_DESIGN.md and future art-specific docs

**Reserved for movement stream by default:**

- src/config/movement.ts
- src/sim/Player.ts and other simulation/physics modules
- src/input/** movement-input mechanics
- tests/controller.test.ts and tests/input.test.ts

**Shared/high-conflict: inspect and coordinate before edits:**

- src/game/Game.ts and interfaces connecting World to rendering
- src/sim/World.ts, src/sim/Bloom.ts, and src/sim/Parade.ts
- src/level/** and any geometry/collision-related definitions
- src/ui/UI.ts if a gameplay event contract or input handling must change
- src/config/animation.ts if timing overlaps movement state assumptions

Do not adjust physics just to make an art effect look better. Do not freeze a future movement mechanic by relying on numeric velocity constants. If an expected movement event doesn't exist yet, use a local presentation adapter or document a proposed integration contract rather than inventing a new simulation API unilaterally.

## Visual direction to explore

### 1. A recognizable visual signature

Find the small set of motifs that makes Cloudbloom identifiable even without logos:

- An unusually sculptural, etched/relief-printed cloud language
- Musical/botanical geometry, petals and rings that suggest a living score
- Print-layer textures, precise graphic contours and controlled chromatic offsets
- Contrasting clarity: crisp, readable gameplay against rich, distant atmospheric illustrations
- Evolving environmental expression tied to progress, momentum, and music
- A humorous, character-driven sense of discovery

These ideas are creative hypotheses. Prototype, compare, and **choose one coherent style**, not an indiscriminate collection of effects.

### 2. Character craft

Preserve recognizability of:

- **Poppy:** brown braid, red mushroom cap, light blouse, expressive patterned trousers.
- **Sir Puddlewick:** bald older gentleman, top hat, handlebar moustache, monocle, plain white underwear, yellow duck floatie.

Focus on silhouette, contact points, staging, timing, anticipation/follow-through, reaction poses, and secondary motion. Make running, braking, dashing, jumping, landing, rebounding, and cheering delightful to watch at actual playing scale.

The current 24 × 32 sprite basis is a starting point, not a mandate to over-detail characters. Any asset-size or scale change needs a documented sprite alignment and consistent *visual* hitbox contract; it must not silently change the simulation hitboxes.

### 3. Environmental composition

Create exquisite playable landscapes without blurring important structure:

- A stable, obvious landable-surface visual vocabulary
- Distinctive puff clouds and sculptural floating islands
- Atmospheric parallax with restrained contrast at far depths
- Living mushrooms, foliage, flowers, and small noninteractive characters
- Deliberate accent lighting and palette transitions
- Landscapes with memorable focal points and landmarks
- Beautifully choreographed ambient animation

The art must support route preview and speedrunning. Evaluate fast passes and first-time player scans, not only paused hero shots.

### 4. Momentum-driven spectacle

Use existing public game/render state where possible. Consider a purely presentational mapping from current traversal and Bloom signals to:

- Quiet: slight breathing, low-intensity particles, soft parallax.
- Stirring: distant colour responses, flower opening and wind accents.
- Singing: fast but controlled print ghosts, directional particles, visual rhythm.
- Spectacular: authored botanical choreography, patterned sky changes and controlled bursts of layered colour.

**Never let high-Bloom presentation change deterministic motion.**

Effects must degrade gracefully under Gentle/Standard/Vivid and reduced-motion settings. Never hide hazards, landing edges, jump arcs, or collectibles with afterimages and particles.

### 5. The Petal Parade: art-direction showcase

Build anticipation, reveal, peak, release, and afterglow as one composed musical event. The current authored bridge, danger/recovery rules, and visual-warning timing are gameplay contracts. Do not move the trigger or alter collision behaviour as an unreviewed art edit.

The goal is **an unforgettable transformation**, not maximal on-screen particles.

### 6. A game-native interface

Style title, character select, settings, pause, checkpoints, Time Trial HUD, and completion around the same artistic universe. Distinguish navigation interactions from gameplay inputs. The HUD must be legible in motion, with responsive sizing and accessible contrast.

## Art implementation system

1. **Baseline:** capture repeatable screenshots of current areas and effects; document camera scale and readability.
2. **Identity exploration:** make 2–3 visually distinct sketches/concepts; select and justify one direction. These may be static but cannot substitute for gameplay.
3. **Asset standards:** define palette tokens, outline system, pixel density, texture sizes, sprite pivots, naming, animations, and performance budgets. Record rights/provenance for every introduced asset.
4. **Playable vertical slice:** build an exceptional representative 15–20-second gameplay stretch with a Poppy pass and a Sir Puddlewick pass. Verify at 480 × 270 and typical browser viewport scaling.
5. **Transformation polish:** finish normal/high-Bloom and Petal Parade composition on that slice.
6. **Extend carefully:** scale the validated style across the level, UI and other major scenes.
7. **Optimize and verify:** compare before/after screenshots, record builds/tests, assess effects settings, validate restart/memory behaviour, and benchmark representative hardware.

Prefer a genuinely finished, coherent playable sample over a half-finished retexture of the whole level.

## Proposed movement → art integration contract (NOT an existing API)

The parallel mechanics branch may change accelerations, states, and dash feel. The art should respond to **meaning**, not fixed constants or guessed future controller internals.

At integration review, agree on whether the renderer can reliably consume a stable set of *presentation-only* events or derived values such as:

| Candidate signal | What art needs it for |
| --- | --- |
| normalized horizontal speed or movement intensity | trail amount, parallax energy, environmental response |
| grounded / rising / falling | character pose and camera presentation |
| dash started / active / ended | anticipation, dash trails, ending accents |
| landed / landing intensity | squash/recovery pose and cloud impact VFX |
| spring or ring rebound | one-shot animation/sound feedback |
| Bloom value / authored transformation phase | atmosphere and choreography |

These are **proposals only**: inspect existing actual types first, do not invent a dependency on fields that don't exist, and do not require the mechanics PR to adopt an art-side API without joint review.

The preferred architecture is:

**Simulation event/state → stable read-only presentation adapter → character/environment/UI effects.**

No visual system should feed back into the simulation or timing.

## Parallel PR and integration procedure

1. Art and mechanics branches both start from master and work independently; do not directly merge either development branch into the other.
2. Art PR should touch art-owned files wherever possible; movement PR should touch movement-owned files wherever possible.
3. Each PR should clearly label shared-file edits, API additions, and any collision or movement implications.
4. The two PRs may be reviewed concurrently. **A human chooses when each merges.**
5. After whichever PR lands first, refresh the remaining branch against current master before merging it. Resolve conflicts by preserving the intent of *both* streams; re-run tests, build, visual smoke tests, and representative movement playtests.
6. If both branches need a shared interface, agree on a narrow contract and implement it via one clearly owned integration step or a small follow-up integration PR.
7. Do not force push, overwrite the other branch, silently cherry-pick shared physics, or auto-merge to master.

**Integration risk hotspots:** src/game/Game.ts, animation/state selection, HUD movement indicators, camera behaviour, level geometry, and existing visual-event data paths.

## QA and acceptance standards

### Required gates

- npm test passes, or every failing test is documented with an accountable fix.
- npm run build passes and resulting browser bundle runs.
- Character and gameplay readability verified at native logical resolution and enlarged display.
- Poppy and Sir Puddlewick remain visually recognizable across movement poses.
- Every gameplay platform/hazard/interactable remains distinct.
- The Petal Parade telegraph remains valid at maximum current speed.
- Gentle/Standard/Vivid and reduced-effects options remain usable.
- No accidental movement-physics, input, collision, or level-coordinate changes.
- No unsupported claims of 60 FPS: measure before/after on identified device/browser.
- New images, sounds, and fonts have documented provenance and compatible rights.
- Demo captures include before/after, normal/Bloom, and character comparisons.

### Review questions

Would a still be identifiable as Cloudbloom? Does movement look better rather than simply noisier? Is the sky beautiful when stationary? Does it become meaningfully more magical with momentum? Can an expert still see the route immediately? Does Sir Puddlewick remain hilarious without losing readability? Are effects coherent with the art's materials and outline style?

## Suggested agent roles and handoff

- **Lead (Opus 5.5):** creative consistency, shared architecture, code review, integration quality.
- **Character art:** sprites, animation poses, secondary-motion identity.
- **Environment:** cloud/island language, palette, parallax and prop assets.
- **Technical art:** shaders, particles, effect states, authored transformation.
- **UI/art systems:** game-native menu and HUD visual polish.
- **QA:** deterministic regressions, screenshots, readability, settings and profiling.

Parallelize only independent file ownership. Integrate small, reviewable changes, keep a branch journal, and teach through architectural decisions in plain English.

## Intended PR deliverables

- A working art-design branch with actual improvements in the game.
- An updated, evidence-driven game identity and focused art bible.
- Before/after captures at meaningful gameplay sizes and representative keyframes.
- Poppy and Sir Puddlewick design/animation comparisons.
- A demonstrable normal → Bloom → Petal Parade transformation.
- Tests/build/performance evidence and accessible settings.
- A clear checklist of finished versus deferred items.
- An explicitly documented contract for connecting the future movement-mechanics PR.

**Do not open or merge an art redesign PR as "finished" based only on design documents.** A draft PR is appropriate while implementation is in progress.

---

**Creative instruction:** Do not imitate five famous games. Make Cloudbloom a world that could only be Cloudbloom. Be visually bold, mechanically respectful, wonderfully strange, and disciplined about the details that make platforming feel beautiful.
