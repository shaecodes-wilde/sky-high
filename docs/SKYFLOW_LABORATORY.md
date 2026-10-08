# Skyflow Laboratory

The Laboratory is an isolated development level for the complete **run → roll → pump → launch → dash → refill → skim → roll** phrase. It uses production World/controller/collision/Input and authored geometry. It is developer practice and cannot set normal game records. [Movement](MOVEMENT_DESIGN.md), [physics](CLOUD_CURL_PHYSICS.md) and [level standards](LEVEL_DESIGN_STANDARD.md) remain canonical.

## Open and inspect

After principal integration of the developer shell, run `npm run dev` and open `/?skyflow` on its printed local URL. The main entry loads this level only in development. Normal Level 1 uses `/?` without the Laboratory parameter; the existing `/?playground` remains a separate movement fixture set. Production builds exclude the developer playground/Laboratory.

The panel has section selection, Reset section, Record, Stop, Replay and HUD controls. Recording is session-memory-only with a one-minute cap. Replay resets only to the declared fixture start before replay begins; it must not reposition or alter resources during the recording. Pink/mint trajectories compare current and recorded paths. HUD exposes vx/vy, grounded/airborne, curl/standing, slope, pump quality, charge, dash/coyote/jump/dash-buffer timers, latest event and 60Hz segment time. Pause/focus/practice behavior is owned by Game; scripted World results do not certify the UI.

## Seven zones

| Zone | Reference start | Exercise and failure to check |
| --- | --- | --- |
| A · Rolling Basics | x30, y128 | Curl under the 16px-clearance arch at x150–240; release under it, remain curled, then safely stand. Coast/brake on the approach/downhill. |
| B · Whispering Bowls | x600, feet seated on real support | Three connected minima x820/1260/1700, y8; surrounding crests y64. Release/repress forward separately at each low point. Compare all/none/partial/late pumps. |
| C · Sunthread Ramp | x1940, y64 | Carry the third bowl into the x2000–2680 ramp. Compare normal crest ride, roll jump near x2560 and jump→dash. No speed injection. |
| D · Dewdrop Crossing | x2720, y228 | Upper clouds and ring x2830,y280; spend a dash before ring contact and make a fresh command afterward. Merely passing the ring with a full charge is insufficient. |
| E · Cloud Skimming | x3060, y220 | Buffer fresh jumps before upper cloud contacts. Keep curl and actual dash resource state through multiple landings. |
| F · Rolling Rejoin | x3530, y152 | Broad one-way curved descent through x3590–3970 into the finish. Check rolling landing speed and natural forward rejoin. |
| G · Recovery Cascades | x2720, y152 | Lower clouds x2590–2850,y152 and x2930–3110,y96; curved recovery x3140–3670. Uncurl to run if a slow rolling uphill approach stalls. |

Initial feet use real AABB foot support, not raw centre knot height; the 10px span can sit slightly higher than the knot. Section selection performs initial placement only. Checkpoint y values must likewise match actual support. Tests hold the player idle for two seconds after each section reset and each real World checkpoint retry, rejecting embedding, falling or death. Those fixture-reset checks are separate from uninterrupted route acceptance.

## Reproduce measurements

From the project root:

```sh
npm test -- tests/skyflow-recording.test.ts tests/skyflow-routes.test.ts
node tools/skyflow-evidence.mjs
npm test -- --reporter=default --reporter=json --outputFile=docs/evidence/skyflow-validation-tests.json
npm run build
git diff --check
```

The generator uses installed Vite to load the real TypeScript modules; it adds no dependency or package script. It writes [skyflow-route-comparison.json](evidence/skyflow-route-comparison.json), including source commit and SHA-256 hashes of measured source files. Nonzero exit means a declared scenario/acceptance comparison failed. Regenerate after final integration or rules changes. The source hashes identify measured working-tree code even when the artifact is committed afterward.

`skyflowInputs(route,takeoffOffset,pumpOffset,pumpMask)` and `level1SkyflowInputs()` are reusable control recipes. They return inputs only. `traverse` runs one production World per phrase and retains optional curl, ordered directional events, landings, pump/slope/roll telemetry, events and exact replay tape. No velocity assignment, charge reset, teleport, hazard removal or Parade forcing occurs between contacts. `traversePhysical` runs actual timestamped Input with FixedLoop at 30/60/144 render fps; all due events arrive in frame batches before catch-up. The dedicated valley tape also puts a genuine 4ms release/repress inside one fixed step.

The 72 declared direct-input cases consist of 20 full Laboratory runs (four route roles × rest/four entry speeds), 16 actual bowls-entry pump-chain runs, 16 takeoff/pump perturbations, and 20 whole-Level-1 runs. Physical keyboard counterparts of the four full Laboratory recipes run separately at three render cadences. Character/art/preset/Bloom parity, section spawn and checkpoint retry tests add separate boundary checks.

Bowls-entry fixtures start at x600 with real seated feet and declared vx 132/180/225/260; all remaining contacts and resources carry continuously. Because the fixture starts at the first gate boundary, it is **not** clean whole-level record evidence; its unchanged World progression/invalidity is retained in JSON. Whole Laboratory runs begin at x30. Whole Level 1 begins at the actual start with dormant Parade, all hazards/collectibles and six gates present.

## Measured comparison and interpretation

Current numeric comparisons are retained in the JSON `comparison`, `pumpComparison`, `physical` and `runs` fields. Compare common initial and finish boundaries. The canonical threshold declares Flow ≥1s faster than Garden and Skyway ≥0.2s faster than Flow; a missed upper contact must catch and rejoin forward while taking longer than successful Skyway. These are automated acceptance requirements, not an optimum-time or human difficulty claim.

| Canonical Laboratory from rest | Time | Entry / exit vx | Airborne occupancy | Pumps / skims / ring refills |
| --- | ---: | ---: | ---: | ---: |
| Garden | 28.067s | 0 / 290.696px/s | 1.867s | 0 / 0 / 0 |
| Flow | 19.067s | 0 / 290.806px/s | 1.917s | 3 / 0 / 0 |
| Skyway | 17.700s | 0 / 290.800px/s | 4.150s | 3 / 3 / 1 |
| Missed Skyway | 19.183s | 0 / 290.800px/s | 2.950s | 3 / 2 / 1 |

These four full physical keyboard tapes reproduce the direct recipes exactly and have identical outcomes at 30/60/144fps. Garden uses normal uphill running before rolling into the downhill finish; its high final speed does not imply required pumps. Canonical Skyway saves 10.367s over Garden and 1.367s over Flow; the miss costs 1.483s. The expanded matrix currently identifies two departure-edge wall events (`lab/flow/entry-132`, `level1/skyflow/entry-225`), so do not call the whole matrix reliable until its JSON passes after an owned correction.

| Actual x600 bowl entry vx | Full pumps | None / late-missed | Partial (first/third) | x1940 exit vx, all chains |
| --- | ---: | ---: | ---: | ---: |
| 132 | 5.500s | 5.583s | 5.533s | 229.8px/s |
| 180 | 5.450s | 5.517s | 5.467s | 229.8px/s |
| 225 | 5.417s | 5.483s | 5.450s | 229.8px/s |
| 260 | 5.383s | 5.450s | 5.400s | 229.8px/s |

Full chains save only 0.067–0.083s across the bowls; they produce higher immediate uphill speeds but exit drive equalizes at 229.8px/s. Partial/none/missed chains remain physically accessible. This is a modest skill reward, not evidence that the route is pump-gated. Whole Level 1 from rest measures Garden 56.217s, legacy Flow 55.717s, legacy Express 53.800s and additive Skyflow 49.917s, each with six splits/three fragments/natural Parade.

For every case the artifact records entry/exit vx, completion time, fixed-step airborne/rolling occupancy, peak horizontal speed, actual landing coordinates/runtime solid/authored terrain IDs, slopes/curvature, carried charge, pump quality/valley/step, ring/dash events, recovery/rejoin, deaths/walls/respawns, splits, fragments and Parade. Landing geometry/signed speed come from the land event; timers/resources are end-of-tick snapshots, including any same-step rebound/refill/dash. Exit snapshots identify that same-step continuation.

Accepted pump counts do not imply full useful speed delivery. Compare successful/none/partial/late-missed chains at x1940 (bowl exit), x2560 (ramp) and finish; the 300px/s cap can clip earned bonuses. Test both substantial Laboratory bowls and compact Level 1 bowls. Do not infer a universal gap/timing comfort bound from a finite recipe matrix.

Garden needs no pumps. Flow uses rolling with lower receivers. Skyway uses three bowl gestures, roll jump, dash/ring/dash and cloud rebounds, then rolls into F. The missed recipe intentionally fails the next upper skim around x3120–3190, catches the lower curve and uncurls on the uphill recovery before joining F; it is not a successful Skyway renamed as recovery.

Level 1's optional additive branch occupies x3560–4590 above the Duck Feather route, retaining original content and routes. It enters through the existing boosted spring/high shelf, rolls three compact minima x3690/3870/4050, launches near x4200, crosses upper clouds/ring and descends into the original Parade garden. Whole-Level-1 results must finish cleanly with six ordered splits, three fragments and a naturally triggered Parade. Game record submission, story/dialogue UI and browser rendering remain principal integration checks.

## Human playtest checklist

Observe curl recognition and safe tunnel release, progressive brake/turn response, distinct valley timing cues, missed/good/perfect readability, crest launch predictability, visibility of the next upper/lower target, buffered skim timing, slow uphill uncurl recovery and finish rejoin. Repeat with both characters and reduced effects. Record first-clear mistakes and recovery success, rather than declaring comfort from scripted time savings.

These local automated measurements establish finite tested reachability, deterministic controls and simulation boundaries. They do not establish human feel, broad continuous timing tolerance, expert optimal times, physical keyboard/display latency, browser UI/audio correctness or sustained GPU performance. Report browser and human evidence separately.
