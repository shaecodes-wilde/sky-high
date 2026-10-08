# Skyflow movement design

The movement phrase is **Run → Roll → Pump → Launch → Air Dash → Cloud Skim → Roll Again**. Terrain lets players generate, conserve and redirect momentum. Ordinary progression must remain possible without precise pumps. Advanced paths reward continuity and timing with time savings and recoverable risk.

This document owns player-facing intent. [Cloud Curl physics](CLOUD_CURL_PHYSICS.md) owns equations/defaults; [level standard](LEVEL_DESIGN_STANDARD.md) owns geometry and route acceptance; [Laboratory](SKYFLOW_LABORATORY.md) owns reproducible practice/testing. [Animation standard](ANIMATION_STANDARD.md) owns presentation, including future art replacement.

## Controls

| Input | Result |
| --- | --- |
| A/D or left/right arrows | Run; while curled, limited forward drive or progressive reverse braking |
| Hold S or down arrow | Curl and stay curled, including in air to prepare a landing |
| Release S/down | Stand when the standing body has clearance; otherwise remain curled and steerable |
| Release forward while curled | Coast with low rolling resistance |
| Repress forward near a valley bottom | Attempt a directional pump; same rule leftward |
| Space | Ground/coyote jump; release early for a shorter jump; buffer before landing |
| Shift (remappable) | Air dash; one charge, refreshed by real landings, springs and rings |
| Double-tap airborne direction | Ordinary air dash; grounded rolling pulses belong to pumping |
| Escape/P; R; Backspace; M | Pause; retry checkpoint; restart; mute |

Curl is hold-based, with no toggle or extra dedicated key. Pumping uses forward release/repress, never dash, jump or backward input. Hold curl throughout a pump: release only forward briefly, then press again near the visible low point. Good/perfect pumps have different feedback; a miss leaves ordinary rolling. Reduced visual effects must preserve readable state and optional feedback without changing physics.

## Transitions and intended expression

Run into curl without a free boost or momentum reset. Curled downhill travel accelerates through real tangent gravity; climbing trades speed for height. Forward steering remains available, coasting retains momentum, and deliberate opposite input brakes progressively. Roll drive has a target rather than a clamp on earned overspeed. Releasing curl uses ordinary standing acceleration/decay, so it can be useful for precise positioning.

Roll jumps retain horizontal momentum with a bounded slope influence on vertical launch. At sufficiently curved crests, rolling may separate naturally using the physical normal-force condition. Normal precision jumps retain their existing baseline. After launch, air steering and dash resources behave normally; a dash does not invent upward launch velocity.

Hold curl before contact for a smaller rolling landing. Cloud landings restore one dash. A fresh buffered jump can rebound on the same contact tick, avoiding a forced pause or loss of carried speed. A successful dash-flight skim is feedback on that transition, with no secret extra boost. Dash-refill rings and springs must remain ordinary production contacts with finite resources, rather than route scripts.

Uncurl under an arch waits for real standing clearance. Feet remain anchored as form changes; decorative accessories never enlarge the collision body. Both Poppy and Sir Puddlewick share movement and hitboxes. Their animation may differ in silhouette/personality while consuming the same authoritative state.

## Route roles and accessibility

Garden Trail teaches movement and provides forgiving progression with no required pumps. Flow Line rewards rolling and conserved speed while accepting less precise approaches. Skyway combines timing, launches, aerial dashes, rings and cloud rebounds, with readable targets and forward lower recovery. These are encounter roles, not compulsory three lanes everywhere.

Keep beginner mistakes informative: a missed pump has no imposed speed penalty; a missed optional upper cloud should usually land below, cost time and continue forward. Let routes rejoin in a broad curve without forcing a stop immediately after an advanced success. Give players room and a visible opportunity to brake. Avoid invisible speed gates and frame-perfect requirements on the basic route.

Jump buffering, coyote time, corner forgiveness, remappable dash and configurable double-tap timing remain. Gentle assist expands three existing timing windows and stores distinct records. Gentle/Standard/Vivid **visual presets**, Bloom, shake, afterimages and distortion are presentation choices and cannot affect simulation. Keyboard is the implemented gameplay input boundary; this work does not establish touch/gamepad support.

## Acceptance and feel

Automated evidence can show stable state transitions, measured routes, recoverable misses, timing tolerance and relative time savings. It cannot establish that movement feels satisfying or comfortable. The intended feel is responsive steering, meaningful earned speed, readable timing and predictable landings. Evaluate those with human first-clear and repeat-play observations, especially low-ceiling release, braking/turning, pump timing cues, crest launch expectation and rejoin visibility.

See the four acceptance levels in [level standards](LEVEL_DESIGN_STANDARD.md): reachable once, reliable under a declared sample matrix, comfortable under observed human play, and expert-optimized under actual optimization evidence. Preserve Adventure story, collectibles, six Time Trial gates, three fragments, Parade and restart/practice rules when changing routes. Local physics replay does not certify browser UI, record submission, audio, physical displays or human feel.
