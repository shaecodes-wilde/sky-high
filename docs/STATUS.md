# Implementation status — Cloud Curl and Skyflow

Updated 2026-10-08. Committed on `feat/cloud-curl-skyflow`, based on `origin/master` at `0701b28`. The previous momentum overhaul was already merged. No default-branch merge, push or PR publication was performed; the independent art branch remains separate.

## Implemented

- Hold S / Down to curl; responsive drive, coast and braking; real tangent gravity, safe smaller body and clearance-aware uncurl.
- Intentional forward release/repress pumps with good/perfect timing, finite capped reward, independent valleys and anti-farming.
- Analytic curved terrain, high-speed diagonal collision, exact endpoint departures, bounded slope jumps and natural crest launches.
- Existing jump buffers, coyote time, dash, springs, refills and cloud skims compose with rolling. Physical input timestamps remain correct through fixed-step catch-up.
- Complete procedural roll states for Poppy and Sir Puddlewick, distance-driven rotation, terrain-speed feedback, mint pump cues and restrained effects/audio. Visual presets/Bloom do not alter movement.
- Seven connected development Laboratory zones with stable resets, telemetry and memory-only recording/replay. Open `/?skyflow`; development content cannot submit records and is absent from production.
- Additive Level 1 Skyway near the existing Duck Feather high spring, with compact bowls, slope launch, aerial skim/refill and curved recovery/rejoin. Existing story, fragments, keepsakes, six checkpoints, ordinary routes, Adventure/Time Trial, Parade and ending remain intact.
- Movement rules 3 keep incompatible older records separate. S/Down formerly remapped as dash migrate to Shift; those keys are now reserved for curl.

## Verified final integration

`npm test -- --reporter=default --reporter=json --outputFile=docs/evidence/skyflow-tests.json` passes **477 tests / 18 files**, including all original 260 and all 81 legacy route variants. The default worker command passes; the expensive 72-case test alone allows 15 seconds, without relaxing movement criteria.

`node tools/skyflow-evidence.mjs` passes **all 72 continuous cases**, with source hashes and zero failures. Cases cover 132/180/225/260 entry speeds, full/partial/none/late-missed pumps, selected takeoff variations, four full Level 1 routes, recoverable misses and physical keyboard tapes at 30/60/144 fps. No state repair occurs between links.

`npm run build` passes TypeScript and Vite; main bundle **666.98 kB / 180.27 kB gzip**, versus baseline 641.66 / 171.73. No dependency was added. Production artifact searches find no Laboratory/playground identifiers. Whitespace checks pass.

Automated Chromium exercises real DOM input, Game/World, both characters × three visual presets × low/high Bloom, stable starts, low-ceiling release and exact 350-step three-pump replay. Normal Level 1 finishes in 49.917s with six splits, three fragments, natural Parade and a clean record submitted to an in-memory fixture. Existing storage was preserved/restored. Static production preview ignores `?skyflow`, omits developer controls and supports real RAF curl/uncurl. Start clicks unlock browser audio. These are automated checks, not human playtesting.

A short 120-frame Vivid/full-Bloom, active-Parade, audio-running sample averaged 2.38 ms rendering CPU, p95 4.20 ms; frame interval mean 16.42 ms, p95 17.10 ms. A preceding audio-idle sample included a 29.40 ms rendering outlier. These are local CPU-submission observations, not sustained/GPU/device acceptance.

## Measured routes and tradeoffs

| Laboratory from rest | Time | Pumps / skims / refills |
| --- | ---: | ---: |
| Garden | 28.067s | 0 / 0 / 0 |
| Flow | 19.067s | 3 / 0 / 0 |
| Skyway | 17.700s | 3 / 3 / 1 |
| Missed Skyway → lower recovery → rejoin | 19.183s | 3 / 2 / 1 |

Whole Level 1 Garden/legacy Flow/legacy Express/new Skyflow measure 56.217/55.717/53.800/49.917s. These demonstrate reachability and recipe time savings, not optimized speedruns or beginner comfort.

Successful bowl pumps save a modest 0.067–0.083s versus omitted/late gestures. Rewards can clip at the cap; all bowl-entry experiments equalize to 229.8px/s at the common flat exit. The grounded tangent cap can reduce horizontal momentum on very steep terrain. Slow recovery climbs should uncurl and run. These are explicit tuning tradeoffs for human review.

## Evidence and permanent standards

[Full eight-part handoff](SKYFLOW_IMPLEMENTATION_REPORT.md) links movement design, authoritative physics/tuning, level authoring, animation, Laboratory standards, source commits and preview instructions. README and AGENTS provide the same entry points. Earlier MOVEMENT/ROUTES documents are marked historical rules-2 evidence.

[Final tests](evidence/skyflow-tests.json) · [Build](evidence/skyflow-build.txt) · [Continuous routes/source hashes](evidence/skyflow-route-comparison.json) · [Lab browser](evidence/skyflow-browser.json) · [Level 1 browser](evidence/skyflow-browser-level1.json) · [Production smoke](evidence/skyflow-production-smoke.json) · [Performance](evidence/skyflow-browser-performance.json)

## Remaining acceptance

Human first-clear/feel, pump readability, stopping/turning, launch expectation, audio balance and expert optimization remain unverified. Firefox/Safari, physical display/input latency, mobile devices, static-host deployment and sustained performance are untested. Gameplay remains keyboard-only; procedural art/music remain prototypes, and future art integration must preserve the new frame/anchor contract.
