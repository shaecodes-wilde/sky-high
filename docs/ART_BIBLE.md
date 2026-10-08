# Cloudbloom — Art Bible: *Skyprint Folklore*

> **Status:** v1.0 production direction · 2026-10-07 · branch `art/cloudbloom-art-design`
> Supersedes the exploratory notes in [GAME_IDENTITY.md §5](GAME_IDENTITY.md#5-proposed-visual-identity-skyprint-folklore) where they conflict. Tokens live in [`src/render/palette.ts`](../src/render/palette.ts).

## The thesis in one line

**The sky is a hand-printed hymnal that has lost its tune. Every surface is a carved block; momentum re-inks the page.**

Cloudbloom does not look like a painted fantasy or a neon dreamscape. It looks like a *relief print*: a world cut into blocks of wood and lino, inked in a few warm colours, pressed onto cream paper, and slightly out of register. At rest the print is soft, two-ink and sleepy. As the player moves well, more plates are pressed: gold, mint, and petal-pink arrive. At the Petal Parade, the whole page is re-printed as a full-colour edition.

That one metaphor answers every art question:

| Question | Answer from the metaphor |
| --- | --- |
| How are clouds shaded? | **Carved**, not airbrushed: concentric gouge lines and spiral curls in the belly, a flat untouched lip on top. |
| What makes a landing obvious? | The **paper shows through**. The brightest, flattest value in any scene is the cream lip of a surface you can stand on. Nothing decorative is allowed to be that bright and that flat. |
| What does Bloom do? | **Adds plates.** Quiet = two inks (lilac + peach). Stirring = gold plate. Singing = mint + petal plates, slight misregistration on speed accents. Spectacular = full edition, authored. |
| What are speed effects? | **Misregistered impressions**: the character "stamped" again 1–3 px out of register in single flat plate colours. Never blur. |
| What texture is allowed? | **Halftone and gouge marks**, at low contrast, in the far planes only. The play plane stays clean. |
| What is the recurring motif? | **The unfurling curl** — a spiral that opens into a petal. It is carved into cloud bellies, stone strata, checkpoint emblems, the Bloom meter, the giant flower, and the title. |

## Signature motifs (use these, sparingly, everywhere)

1. **The unfurling curl.** A 1-px spiral (2–3 turns) that ends in a teardrop petal. Carved (dark groove + light lip) in materials; drawn as a line in UI.
2. **The song staff.** Five faint parallel lines drifting across the far sky like a wind current. The sky has *forgotten its song*: when dormant the staff is empty; Bloom writes notes (tiny dots and petals) onto it. This is the world's memory of music, and it is ours alone.
3. **Concentric rings.** Ripples of sound around the sleeping sun, the giant flower, and dewdrop rings. Rings breathe slowly at rest, pulse with momentum.
4. **Wind organs.** Distant floating islands carry clusters of organ pipes and bell-flowers. They are the instruments that went silent. They are always far-plane silhouettes — never platforms.
5. **The registration mark.** A little ⊕ crosshair (the printer's mark) is our UI and checkpoint glyph.

## Depth planes and contrast budget

| Plane | Contents | Contrast | Outline | Motion |
| --- | --- | --- | --- | --- |
| P0 Sky | Two-ink gradient with halftone banding, song staff, sun rings | Very low | None | Slow drift, Bloom plates |
| P1 Far | Wind-organ islands, distant cloud cliffs | Low (within 15% value of sky) | None | 4–8% parallax |
| P2 Mid | Carved cloud banks with curls | Low–medium | Soft (CLOUD.groove) | 18–25% |
| P3 Near | Cloud-sea with big curls; foreground blossoms at frame edges | Medium | Soft | 45–60% |
| **Play** | Platforms, interactables, player, collectibles | **Highest** | Ink (`INK.line` for env, `INK.ink` for characters/hazards) | 100% |
| FX | Particles, afterimages, bubbles | Accent only | n/a | n/a |

Rules:

- **Nothing behind the play plane may be as bright as `PAPER.cream`** in a flat band ≥ 6 px wide. That brightness signals "you can stand here".
- **Nothing behind the play plane may use ink-dark values** (`INK.*`). Dark ink is reserved for the player outline and hazards.
- Far planes desaturate toward the sky's own colour. Atmospheric perspective is mandatory.
- Particles never sit in front of a hazard's silhouette for more than a frame or two (they are short-lived and small).

## Materials and gameplay jobs

Every material has **one job**. Colour reinforces shape; shape alone must still tell the story (check in greyscale).

| Material | Job | Shape language | Colour |
| --- | --- | --- | --- |
| **Carved cloud** (one-way) | Standable | Flat cream lip, 3–4 px; belly of scalloped lobes with carved curls, inset so the silhouette stays inside the collider width | `PAPER` lip, `CLOUD` belly |
| **Recovery cloud** | Standable, secondary | Same, but belly in a quieter, cooler ramp and a thinner lip highlight | `CLOUD` lowered one step |
| **Moored earth** (two-way island) | Solid ground and walls | Meadow lip with tufted overhang; lavender stone printed in horizontal strata, carved with occasional curls and root lines; sides outlined | `EARTH` |
| **Petal bridge** | Parade-only standable | Fat petal pads with a cream inner lip | `ACCENT.petal*` + `PAPER` |
| **Springcap** | Rebound | Domed coral cap, cream spots, chunky stem, visible squash | `ACCENT.coral*` |
| **Dewdrop ring** | Dash refill | Clean mint ring, empty centre, a single droplet; spent = hollow grey-lilac dashed outline | `ACCENT.mint*` |
| **Wind ribbon** | Push | Flowing mint ribbon strokes with arrow-like heads | `ACCENT.mint` |
| **Ink-thistle** | **Hazard** | Dark, spiky, angular burrs on stalks; the only thing in the world with sharp spikes; glint in `ACCENT.sting` | `INK` + sting |
| **Sun-seed** | Route breadcrumb | Small spinning gold coins with a seed-slit | `ACCENT.gold*` |
| **Melody fragment** | Main collectible | A torn printed scrap carrying a gold note, with a breathing ring | `ACCENT.gold*` + `PAPER` |
| **Keepsake** | Optional curiosity | Small object icons with a cream halo | Varied, outlined in ink |
| **Checkpoint** | Save | A carved bud-post that unfurls into a petal and gains a ⊕ registration mark | `CLOUD` closed → `ACCENT.petal` open |
| **Decor** (flowers, tufts, mushrooms, lamps) | None | Small, low contrast. Decor mushrooms are **never coral** and never domed like springcaps | `EARTH`, pastel blue/lilac |

## Characters

Frame contract (unchanged): **24 × 32 px, feet on row 30, row 31 holds the outline; same 10 × 22 collision box, centred on x; frames face right; renderer mirrors.** Frame names and counts in `src/config/animation.ts` are unchanged.

- **Outline:** 1 px `INK.ink`, selectively lightened (sel-out) on lit top edges where it helps read the shape, but the outside silhouette must stay closed and dark against every sky value.
- **Light:** from upper-left. Two to three tones per material, no pillow shading.
- **Silhouette first:** Poppy reads as *mushroom cap + braid + flared trousers*. Sir Puddlewick reads as *top hat + round duck ring + spindly legs*. These must survive at 1× in every pose.
- **Acting:** anticipation on start and jump, smear-like stretch on dash, real squash on land, delighted rebound, a believable brake skid with the body thrown back. Secondary motion (braid, hat, moustache, floatie) lags one beat behind the body.
- **Poppy:** brown braid with a gold tie, red cap with cream spots and a small white flower, white blouse, pink flared trousers with flower print, brown shoes. Warm, nimble, impulsive.
- **Sir Puddlewick:** bald, top hat with red band and a tucked flower, monocle with chain, handlebar moustache, opaque plain white underwear, yellow duck floatie (head at front). Ridiculously dignified.

## Motion and Bloom grammar

Driven only by [`src/render/signals.ts`](../src/render/signals.ts) — the presentation adapter.

| Mood | Signals | What changes |
| --- | --- | --- |
| **Quiet** (mood < 0.7) | Bloom low | Two-ink sky, empty song staff, closed flowers, dust only, no trails |
| **Stirring** (0.7–1.6) | Bloom tier 1 | Gold plate: sun rings visible, staff gains notes, lamps light, flowers half-open |
| **Singing** (1.6–2.6) | Bloom tier 2 + momentum | Mint/petal plates: notes fill the staff, petal wake at speed, misregistered stamps behind fast running |
| **Spectacular** (≥ 2.6) | Petal Parade, ending | Authored: floral fans, cloud faces wake, sky edition re-prints, gentle plate drift on far layers |

Speed/flow `energy` scales trail density, wind ribbon amplitude and staff shimmer. It never changes what is solid.

## Comfort presets

- **Gentle:** no stamps, no plate drift, no shake, half particles, spectacle 0.55. Every gameplay cue identical.
- **Standard:** intended look. Stamps on dash and high-Bloom speed. Light shake.
- **Vivid:** full spectacle, distortion waves on far layers during the Parade, more particles.

Reduced effects must **never** remove: hazard silhouettes, the bridge telegraph, ring armed/spent states, checkpoint state, or the cream landing lips.

## Production standards

- **Medium:** all art is authored in code on an integer grid (`src/render/pixel.ts`), 1 texel = 1 virtual pixel, nearest-neighbour. No external image files, so provenance stays 100% original.
- **Resolution:** 480 × 270 logical, integer upscale. Judge everything at 1× and 2× first, zoomed stills second.
- **Collision honesty:** a platform sprite's top texel row equals its collider top; decorative overhang lives *below* the lip or behind it, never above or beyond the collider's x-extent.
- **Performance budget:** textures are baked once at load; per-frame work is uniform updates, material swaps and the particle buffer. Target: no more than +1 ms CPU per frame over baseline and no extra full-screen passes beyond one composite.
- **Determinism:** cosmetic randomness uses `rng(seed)` or `Math.random()` only in render code, never in `src/sim/**`.

## Review checklist

1. Greyscale the frame: can you still find the player, the next landing, the hazard, the ring?
2. Is the brightest flat value in the scene a landing lip?
3. Is anything dark-ink that isn't the player or a hazard?
4. Does the scene look complete and lovely at Bloom 0 standing still?
5. Does Bloom add *plates* (colour layers) rather than noise?
6. Does Gentle still show every cue?
