# Skyflow animation standard

Cloud Curl presentation follows the controller's actual form, contact, velocity,
travelled roll angle and event ages. It never sets player position, velocity,
collision dimensions, dash charges or input. Both characters share the same
animation selection and the same simulation. The authoritative movement rules
belong in [CLOUD_CURL_PHYSICS.md](CLOUD_CURL_PHYSICS.md); integration fields and
ownership are recorded in [SKYFLOW_CONTRACT.md](SKYFLOW_CONTRACT.md).

## Required states

| State | Trigger and presentation |
| --- | --- |
| Curl anticipation | A grounded curl uses four progressively compressed poses over 120 ms. Physics enters immediately; the animation adds no delay. |
| Idle / slow roll | Below 6 px/s, retain the current travelled phase. From 6 to 110 px/s, show the compact rolling form. A stopped character never spins on a timer. |
| Medium roll | From 110 to 210 px/s, use the medium atlas. The spin rate follows distance, including slope travel. |
| Fast roll | At 210 px/s and above, use the fast atlas, with small braid/hat flutter tied to the travelled phase. |
| Pump compression | Accepted good and perfect pumps compress the character for 70 ms and add a mint success mark. Missed attempts leave ordinary rolling presentation. |
| Perfect release | A perfect pump adds a short mint release accent until 190 ms after the accepted event. |
| Curled braking | Show a mildly compressed rolling silhouette and restrained ground dust when the controller reports braking. Spin slows with the actual travel. |
| Uncurl | Reverse the four anchored transition poses over 120 ms only after the controller has actually restored the upright form. A clearance-blocked curl stays visibly curled. |
| Roll jump / natural launch | Use a slightly stretched compact form while rolling and airborne. Ground contact controls the transition; a renderer cannot launch the character. |
| Rolling landing | Show a compressed compact form for the first 100 ms of real ground contact, including a held-Down air-dash landing. |

Accepted pump feedback takes priority over grounded curl/landing poses so a
successful input remains readable. Airborne roll takes priority over ground
feedback. Death and completion retain their existing poses. Ordinary upright
run/jump/dash/spring/skim animations remain available.

All animation durations and speed bands are presentation tuning in
`src/config/animation.ts`. They do not define controller timing windows or
movement speed limits.

## Frames, rotation and anchors

`buildCharacter(id)` returns a `CharacterSheet` containing every `FRAME_NAMES`
entry. Textures are 24 by 32 pixels and share the bottom-centre foot anchor.
The compact art has a circular outline with a stable bottom row, separate from
the standing art. Curl/uncurl resampling also keeps the feet anchored. Decorative
hats, braids and floaties do not define the collision shape.

Rolling variants each contain 16 nearest-pixel phases. `rollFrameIndex` reads
the controller's signed `rollAngle`; the facing-aware atlas and renderer mirror
produce rightward clockwise and leftward counter-clockwise rotation. The atlas
is selected from actual state and speed, and phase is selected from travelled
distance. Neither an idle timer nor changing render FPS creates rotation.
`sinceCurl`, `sinceUncurl` and `sincePump` determine transition frames directly,
so skipped render frames cannot restart an already elapsed animation.

The renderer interpolates the player's simulation position at its existing
pixel anchor. It does not shift that position for squash, stretch or spin.
Afterimages capture the selected compact frame and honour the live afterimage
setting, including a switch to Gentle while trails are still alive.

## Character identity

- **Poppy:** the mushroom cap wraps around tucked knees. Pale cap spots, the
  flower, pink trousers and a brown braid following the rim preserve her
  identity. Fast-phase braid flutter is at most one decorative pixel.
- **Sir Puddlewick:** the duck floatie becomes a round cushion with a visible
  head and orange beak. The top hat, monocle with gold chain and handlebar
  moustache remain attached to the rotating face. The hat flutters by one pixel
  in the fast phases.

This is replaceable procedural art. No palette or signal code was copied from
the independent, unmerged art PR.

## Pump, terrain and audio feedback

An accepted good pump emits four mint particles before preset scaling; a
perfect pump emits eight. A three-mesh surface-ripple pool gives a local terrain
or cloud response for 160 / 220 ms respectively. Its direction follows the
analytic terrain slope at the event position. Cloud contact may also give the
existing small cloud compression. Surface marks are cosmetic: standable
geometry stays fixed. Pump feedback adds no camera shake or full-screen flash.

Audio exposes `curl`, `uncurl`, `pumpGood`, `pumpPerfect`, `rollLand`, `rollJump`
and `rollBrake` one-shots. Good/perfect cues have different rising tones, and
perfect receives a small brighter musical accent. Effects use the existing SFX
bus, volume and mute controls. Event rate limits prevent duplicate bursts; there
is no continuous rolling sound loop. The integrator owns event-to-audio wiring
in `Game.ts` so the renderer never controls music or gameplay.

`drawCurvedTerrain` samples the same `sampleTerrain` Hermite geometry as
collision. Column tops are nearest-pixel rasterisation of those samples, with
at most half a pixel of rounding. Bounds include between-knot extrema; curved
cloud undersides also include valleys below the authored knot heights. The
renderer caches 128-pixel horizontal tiles, culls by their world bounds and uses
the existing grass/rock/cloud palette. Tile joins share world coordinates.
Parade-marked terrain follows the existing bridge reveal alpha.

## Accessibility and performance

Gentle disables afterimages and shake through the existing settings and scales
particles to 0.5. Fractional particle budgets accumulate, so even single-pixel
wakes are halved instead of rounding every emission back to one. Setting the
particle multiplier to zero emits no particles. The in-sprite mint mark and the
small local surface ripple remain readable without particles or sound. Vivid
scales particles to 1.4; it does not change animation selection or physics.

Character frames are built at character selection and uploaded once. Rolling
does not create textures each frame or rotate a filtered GPU sprite. The
existing six afterimage meshes, three surface ripples and 900-particle single
draw-call pool bound transient effects. Audio creates sources only for accepted,
rate-limited one-shots and skips allocation when muted, paused or at zero SFX
volume. No dependency was added.

## Replacing the art

1. Keep the `CharacterSheet` factory, frame names and shared foot anchor, or
   adapt an imported sheet to that interface in the character renderer.
2. Supply every ordinary frame and every rolling phase/variant listed in
   `FRAME_NAMES`, including curl and uncurl transition frames.
3. Preserve nearest-neighbour filtering, compact silhouette recognition and
   distance-driven phase. A different number of authored phases can change
   `ROLL_PHASES` and the atlas together without controller changes.
4. Read the immutable visual adapter or the equivalent authoritative Player
   fields. Do not estimate rolling from a held key, invent accepted pumps or
   write back animation timing to the simulation.
5. Run the dedicated checks and inspect both characters in `/?sheet`, then
   inspect real rolling, reversing, low-ceiling uncurl, roll-jump, landing and
   pump sequences in `/?skyflow` under Gentle / Standard / Vivid.

## Repeatable checks and evidence limits

```sh
npm test -- --run tests/skyflow-presentation.test.ts tests/skyflow-audio.test.ts
npm run build
```

The presentation checks cover phase direction/stopping, event-age transitions,
good/perfect/missed state selection, shared anchors and required identity
colours, exact curve-column rasterisation including extrema and tile seams,
reduced/zero effects and the bounded particle pool. Audio checks capture finite
one-shots, duplicate suppression and mute/pause/unsupported behavior at a
simulated Web Audio boundary. These do not prove speaker output, browser audio
unlock, subjective animation quality or human feel. Integrated browser and
human acceptance must be reported separately by the principal integrator.
