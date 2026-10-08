# Agent D: authored Skyflow content

This note records the content work and measured evidence. The canonical movement, physics, level design, animation and Laboratory documents are owned by the other workstreams. This work uses the approved `SKYFLOW_CONTRACT.md`; no physics, input, render or Game changes are included in the owned content commit.

## Laboratory

`src/level/skyflowLaboratory.ts` exports `SKYFLOW_LEVEL` and seven `{name,x,y,hint}` section spawns. The full level runs continuously from x30 to the shared finish x4200. Section/checkpoint feet use the actual 10px AABB support span; every section and checkpoint remains stable through a 60-tick idle fixture.

- A: flat approach, real 16px-clearance arch, gentle descent. Curl fits; standing does not. Garden curls for the arch, then walks without advanced inputs.
- B: three connected 440px-wide, 56px-deep Whispering Bowls with minima at x820/1260/1700. Zero-slope inter-bowl crests have approximately 144px radius. The production route stays grounded through all three and rewards independent gestures.
- C: a matched x2000/y64 cloud-ramp join; gradual uphill drive, deliberate local crest separation near x2591, roll-jump near x2560 and dash variants. Using a one-way aerial ramp gives an early natural launch a forward lower receiver without a solid underside trap.
- D/E: upper receivers at x2690/2850/3010/3190, with a spent-dash ring near x2830/y280. The Skyway recipe refills and spends another dash, then performs three same-contact buffered cloud skims.
- F: a broad cloud curve starting x3480/y152 and descending to the finish garden. The upper approach lands curled near x3512 at 214px/s and accelerates naturally along the descent.
- G: lower receivers at x2590–2850/y152 and x2930–3110/y96, then a continuous recovery curve from x3140/y8. Placement follows measured natural-crest and missed-skim trajectories. A low-speed missed arrival releases curl and runs up the recovery ascent; holding curl at insufficient speed can stall there. The section hint explains that choice.

Terrain IDs 1000–1003 are distinct and finite. Definitions, knots and knot arrays are frozen before sampling because analytic terrain caches use identity. Activation remains World state.

## Reusable input recipes

`skyflowInputs(route, takeoffOffset=0, pumpOffset=0, pumpMask=[true,true,true])` creates a fresh input-only policy. Routes are `garden`, `flow`, `skyway`, `missed`. Offsets are pixels, not injected velocity; the mask selects intentional successful/omitted pump gestures. `pumpOffset=70` supplies a deliberately late missed chain. Policies never move/reset/refill a player or remove geometry. Jump hold begins with an actual press. A new policy instance is required per run.

`level1SkyflowInputs()` follows the legacy express controls, deliberately boosts the existing Duck Feather spring, enters the optional rolling branch, skims/refills and lands on its curved rejoin. It returns to the ordinary control recipe before the next legacy phrase. `tests/fixtures/skyflowPhysical.ts` emits actual KeyD/KeyA/KeyS/Space/ShiftLeft press/release events through production Input, then retains a physical tape for frame-batched replay.

## Additive Level 1 branch

The existing x2180–3700 area contains mandatory story/hazard geometry and both tested legacy lanes. The new branch instead uses the nearby existing high Duck Feather entry at x3560, then stays above those routes. It contains compact three-valley terrain through x4140, a roll-jump launch, upper clouds, dash-refill ring and a curved rolling rejoin ending near x4590, before the required Parade fragment at x4620/y136. Bowls are 180px wide / 10px deep and their crests remain supported at the speed cap. These are compact optional practice bowls; the Laboratory's substantial teaching bowls remain the main acceptance environment.

All existing platforms, IDs, ordinary/express route links, springs, winds, hazards, checkpoints, fragments, keepsakes, NPCs, seeds, Parade trigger and goal remain intact. Two new cloud platforms, two terrain definitions, one ring, two signs and nine optional seed guides are additive. The nominal whole-level hybrid lands on terrain 1100 at x3761/y329 with 176px/s, rewards two pumps after the spring arrival, skims at x4356/y376, refills at x4400/y395, lands curled on terrain 1101 at x4577/y186 with 199px/s, then carries 250px/s onto the Parade garden and collects its unchanged fragment. Three authored bowls exist; this forward spring entry starts partway through the first one.

## Measured outcomes

All times below start at rest in one production World, keep actual carried velocity/resources/world state, and have no deaths, respawns, wall impacts or invalid progression.

| Laboratory recipe | Time | Pumps / skims / rings |
| --- | ---: | ---: |
| Garden | 28.067s | 0 / 0 / 0 |
| Flow | 19.067s | 3 / 0 / 0 |
| Skyway | 17.700s | 3 / 3 / 1 |
| Missed E skim → lower catch → rejoin | 19.183s | 3 / 2 / 1 |

Skyway saves 1.367s over Flow and 10.367s over Garden. The genuine missed skim catches the recovery curve near x3247/y28, continues forward and costs 1.483s compared with Skyway.

Level 1 hybrid finishes in **49.917s**, with all six ordered splits, all three fragments and natural Parade activation. The unchanged legacy routes remain 56.217s Garden, 55.717s Flow and 53.800s express. The hybrid saves 3.883s over legacy express; these are demonstrated recipes, not optimized records.

Pump comparison starts only once at the actual first bowl entry x600 with valid AABB seating. Full / partial (first and third) / omitted chains to x1940 measure:

| Entry vx | Full | Partial | Omitted |
| ---: | ---: | ---: | ---: |
| 132 | 5.500s | 5.533s | 5.583s |
| 180 | 5.450s | 5.467s | 5.517s |
| 225 | 5.417s | 5.450s | 5.483s |
| 260 | 5.383s | 5.400s | 5.450s |

The measured benefit is modest: 0.067–0.083s for the full chain. Rewards clip near 300px/s; all routes return to 229.8px/s at the common flat exit. A pump event is not proof that the whole nominal +16px/s was retained. Sharper lower curves were tried and rejected because measured benefit decreased. No invisible speed gate was introduced. Principal tuning/feel review should decide whether this reward is satisfying enough.

## Repeatable checks and handoff boundary

```sh
npm test -- tests/skyflow-content.test.ts
node docs/evidence/measure-skyflow.mjs
npm test -- --reporter=default --reporter=json --outputFile=docs/evidence/skyflow-level-final-tests.json
npm run build
git diff --check
```

The content suite has 37 passing checks: laboratory entries at 0/132/180/225/260px/s, ±6px upper takeoffs, omitted/partial/full pump chains, genuine missed lower catch, relative times, all section/checkpoint idle stability, whole Level 1 progression/rejoin, actual keyboard routes and exact 30/60/144fps physical-tape replay. Whole-level Level 1 has the full unchanged **81** legacy timing variants plus the new nominal hybrid. The complete dependency/content suite passes **415 tests / 14 files**. Production TypeScript/Vite build passes. Whitespace check passes; Git reports only Windows line-ending conversion notices.

Receipts: [laboratory routes and pump comparison](evidence/skyflow-level-routes.json), [complete Level 1 hybrid tape/events/contacts](evidence/level1-skyflow-route.json), [test report](evidence/skyflow-level-final-tests.json), [production build](evidence/skyflow-level-build.txt). Traces sample every six simulation ticks; input recordings, events and contacts retain full resolution.

Owned implementation commit: `474b038`. Dependency commits remain separate on `work/skyflow-levels`: World `5b59af1`, getter fix `c1a123a`, controller `67cdebb`, diagonal terrain sweep `1b05c67`, controller integration `1c29808`, fixed-step clock `3d39645`, E recording/telemetry `d573be6`, wind cap `22cec80`. Those are dependency copies, not Agent D changes; the principal should cherry-pick the owned content/evidence commits only. Movement rules version 3 belongs to B/principal and must cover the final integrated content before records ship.

No browser or human playtest is claimed by Agent D. The principal owns developer menu/Game/render/browser integration. The Level 1 hybrid is measured nominally; broad timing comfort, alternate missed Level 1 branches, optimization, visual clarity and physical input/display feel remain separate checks. No push or default-branch merge was performed.
