# Movement phrases and route evidence

Level 1 remains *The Morning That Forgot to Happen*. Story, both characters,
the three melody fragments and keepsakes, NPCs, hazards, recovery paths,
checkpoints, Petal Parade and sleeping-sun ending remain in place. Its landing
surfaces now accommodate carried speed instead of relying on isolated jumps.

## Seven phrases

1. **Find Your Feet** — wider early clouds let players compare short hops and
   full jumps. The lower garden still catches misses. The first two seed guides
   are sampled from the production controller at ordinary run speed, with an
   eight-step short hop and a full jump respectively.
2. **First Cloud Skim** — the first dash gap ends on a 320px one-way cloud,
   starting at x=1200 instead of a solid sidewall at x=1220. It allows an early
   landing-to-jump chain and an easier climb from its recovery cloud. Its seed
   guide uses the actual early-dash trajectory. The exported flow traversal
   releases and presses jump again just before contact, rebounding immediately
   with its 214px/s landing velocity intact.
3. **Spring Fork** — the spring at x=1488 launches onto a 300px cloud at y=172.
   Its old raised island started at x=1520, only 18px of body travel after spring
   contact; every tested normal rebound hit its sidewall. A separate cloud at
   y=222 rewards boosted contact. The lower rebound lands earlier, while the
   higher line offers seeds and a different approach to the refill crossing.
4. **Wind and Dewdrop Flow** — the first refill ring moved from y=206 to y=224,
   inside the measured dash arc. Its receiver starts at x=1935. The normal spring
   at x=2392 now feeds a wider wind receiver beginning at x=2510, so a normal
   rebound can stay on the main line instead of dropping into recovery. Flow
   skims the ring receiver at 218px/s, then uses a short hop toward the thistle
   island. A full jump at that carried speed lands too close to the hazard;
   choosing the lower arc produces an earlier, safer landing.
5. **Express Lane** — the boosted x=2392 rebound accesses the upper route.
   Wider upper clouds and a wind receiver starting at x=3050 preserve fast
   approaches. The express line rejoins the y=180 island above its sidewall
   without stopping or reversing. Lower landings remain available.
6. **Petal Parade** — the transformation keeps its anticipation/reveal timing.
   Wider petal landings provide room to prepare the next move. The first active
   spring remains 811px beyond the trigger, exceeding the 720px covered at the
   300px/s cap before the 2.4s reveal. The lower wind receiver starts at x=5380,
   broadening the deliberate-jump-before-spring alternative.
7. **Final Movement Symphony** — wider short clouds support the final dash,
   spring, ring and landing chain. The lower refill receiver starts at x=6535;
   the upper wind receiver starts at x=6450. Both extensions correct measured
   cases where a continuously carried trajectory fell below the old front edge.

The intended skilled sequence is run → short hop → air dash → cloud landing →
buffered jump → spring rebound → refill → second dash → wind → fast landing.
The changes add landing room and readable route choices, without increasing
the run, dash or maximum horizontal speeds.

## Continuous validation

`src/level/traversal.ts` runs **the production `World`** at 60Hz. It accepts
recorded step-based input or a reusable input policy. `movementCues()` supports
spatial takeoffs, jump hold duration, delayed dash presses and actual spring
contact anchors. `level1Inputs()` in `src/level/level1Phrases.ts` supplies the
comfort (`'standard'`), flow (`'flow'`) and express (`'express'`) verification
policies for tests or developer browser use. Flow shares the lower route but
adds two intentional buffered cloud rebounds and a speed-aware short hop.

There is one initial state setup. No platform-to-platform teleports, velocity
overrides, mid-route resets, forced refills, hidden hazard removal or parade
shortcuts occur. Whole-level runs start with the parade dormant. They preserve
velocity, jump/dash buffers, charges, timers, ring arming, wind, spring state,
hazards and active revealed geometry. A death ends the result immediately.

Results retain exact input recordings, event steps, optional trajectory samples,
landing position/velocity/charges/timers, the next actual exit state, wall
impacts, peak speed, split timestamps and run validity. Replaying a captured
recording reproduces the entire outcome, including events and landing/exit
states. Drops record exit state even when no jump is pressed.

Measured with the integrated movement controller and same-step ring resolution:

| Traversal from rest | Time | Wall impacts | Deaths | Ordered splits | Melody fragments | Cloud skims |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Comfort / standard | 56.217s | 0 | 0 | 6/6 | 3/3 | 0 |
| Flow | 55.717s | 0 | 0 | 6/6 | 3/3 | 2 |
| Express | 53.800s | 0 | 0 | 6/6 | 3/3 | 0 |

The express recording is **2.417s (4.3%) faster** under identical starting
conditions. It visits both upper lanes and all four revealed petals. Its upper
routes rejoin at approximately **246px/s** and **223px/s**. These are measured
authored traversals, not claims about optimal record times or human clear times.
The flow recording is **0.500s faster than comfort**, while express remains
**1.917s faster than flow**. Its first two dash landings, near x=1223 and x=1964,
rebound on the same simulation step, preserving exact horizontal velocity and
refilling one air dash. Skims require fresh jump presses; holding jump does not
create these rebounds. The first skim settles before the first spring,
which remains a deliberate normal rebound.

The full-route regression matrix contains **81 traversals**: all three routes ×
initial horizontal velocities 0/132/225px/s × every takeoff shifted −6/0/+6px ×
every dash shifted −1/0/+1 simulation step. All finish with valid ordered splits,
no deaths, no sidewall impacts and bounded speed. Three render schedules,
30/60/144fps, reproduce the entire express run through the real `FixedLoop`.
All 27 flow variants require both real Level 1 skim events and same-step exits
with unchanged landing velocity. A separate complete flow run goes through the
actual keyboard `Input` layer, using Space releases and fresh presses plus dash
key edges; its final state and splits exactly match the direct simulation. The
captured flow recording also reproduces all events and landing/exit states.

Separate connected phrase tests demonstrate consecutive cloud skims, same-step
buffered rebounds, carried exit velocity, one dash charge per airtime and no free
speed. Normal and boosted first-spring contacts are tested at 132/225/300px/s.
Normal receiver velocities are 132/201/278px/s respectively, rather than the old
forced return to ordinary running speed after wall impact.

## Isolated links and their limits

`validateLink()` still checks individual transfers with production physics.
It now samples the complete takeoff-position grid rather than stopping after
the first two successes. It reports contiguous successful sampled windows,
landing positions, carried velocity and remaining landing room. A failed sampled
position splits a window. Wind forks also sample deliberate jumps before their
spring. Boost requests are fresh presses issued once around actual contact.

Every main-route link has a sampled viable position window of at least **18px**
(136ms at ordinary run speed). Recovery and express links have at least **12px**
(91ms at ordinary run speed). The reported windows may use different successful
dash timings across positions; they are reachability evidence, not proof that
one input recipe works throughout each window. The continuous matrix provides
the stronger same-policy check over its finite samples.

The plain-speed link-by-link estimate remains informational. The continuous
recordings, rather than that estimate, establish actual completion and route
comparison. All three recorded traversals collect all three fragments, although
Time Trial split eligibility itself does not require every collectible.

## Repeat the evidence

```sh
npm test -- tests/level.test.ts tests/traversal.test.ts
npm test -- tests/traversal.test.ts -t "genuinely faster" --silent=false
npm run build
```

The first command checks 150 route/phrase cases: 55 isolated level tests and
95 traversal tests. The second prints the measured same-start route comparison.
The fixed-step API and exported policies can be imported in the developer
browser to replay the exact route through the running game. These helpers do
not add normal gameplay controls or change record eligibility.

## Owner playtest questions

- Try an early dash and a late dash into the first cloud. Land, press jump just
  before contact, and keep holding forward. Does the skim feel continuous and
  readable, with enough room to choose the next move?
- Repeat the skim on the first ring receiver at x=1935–2120. Keep the carried
  speed, then use a short hop into the lower island rather than a full jump.
  The lower arc should put the player safely before the thistles, with time for
  the next jump. The measured flow line should feel purposeful, not like jump
  spamming or a mandatory route.
- Run into x=1488 at ordinary speed and after a dash. Compare no jump press with
  a press on contact. The normal rebound should feel quick; the boosted rebound
  should clearly reach the optional higher cloud. Watch for side impacts or
  feeling pushed into the high route unintentionally.
- At x=1870, vary dash timing around the ring. The ring should be easy to see
  inside the reachable arc. Watch for feedback suggesting a refill when the
  player actually passed above or below it.
- Enter the first upper wind lane at speed. Rejoin near x=3320 without slowing.
  It should clear the raised island. Check visibility of the thistle at x=3480
  when approaching at the measured 246px/s rejoin speed.
- During Petal Parade, compare the petal line with the lower wind route. Check
  spring anticipation, landing contrast and room to prepare another jump.
- Chain the finale at x=7145 → spring x=7330 → ring x=7414 → cloud x=7480.
  Early, apex and late dash timings should offer different useful trajectories.
  The 300px/s cap does not establish human readability or difficulty by itself.

No human feel-testing is claimed here. The successful samples do not establish
the entire timing range, optimal speedrun path or first-time difficulty. The
highest-risk remaining human checks are the first upper-lane ring crossing,
high-speed thistle approaches, and petal landing-to-jump timing at unusually high
incoming speeds.
