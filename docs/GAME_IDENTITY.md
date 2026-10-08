# Cloudbloom — Game Identity

> **Status:** Living creative north star · v0.1 · 2026-10-07  
> **Project:** [sky-high](https://github.com/shaecodes-wilde/sky-high)  
> **Working game title:** **Cloudbloom: A Sky Out of Tune**  
> **One-sentence promise:** **Momentum makes the world bloom.**

This is the **shared identity document** for art, movement, level design, narrative, audio, UI, and future contributors. It describes the experience we are building, not a frozen asset list or a mandate to copy reference games. The art-design and movement-mechanics workstreams may proceed in parallel, but both must respect this common product identity. See [ART_DESIGN.md](ART_DESIGN.md) for the art implementation brief and integration boundaries.

## 1. The game in one breath

A joyful, precision-driven, left-to-right sky-platformer where maintaining momentum rekindles a world that has forgotten its morning song. Choose an unlikely hero, carve flowing routes between the clouds, collect fragments of a missing melody, and turn the sky from sleepy storybook into a magnificent, responsive musical dream.

**Player fantasy:** "I am getting so good at moving through this world that the world begins to sing with me."

**Emotional register:** wonder, laughter, curiosity, flow, anticipation, sudden surprise, a little melancholy, and a triumphant return of colour and music.

**Genre:** single-player, momentum-focused 2D platformer rendered in a browser with Three.js. Precision and speedrunning mastery coexist with forgiving routes and optional exploration.

## 2. Five non-negotiable creative pillars

### 1. Movement is musical
Flow is the lead instrument. Running, jumping, linking dashes and rebounds, choosing elevated routes, and preserving velocity should have a distinct cadence. Mastery should feel expressive rather than merely efficient. A responsive character always takes precedence over spectacle.

### 2. The sky responds to you
Bloom is a readable progression from dormant to awake, driven by player progress, sustained momentum, and traversal. Visuals and music respond emotionally to mastery. The presentation can grow radically expressive **without secretly altering player physics**. Authored transformation moments can add mechanics when clearly designed, telegraphed, and tested.

### 3. Wonder with a clear landing
The universe can bend, print colours can misregister, flora can form impossible musical shapes, and clouds can appear alive. But the player silhouette, hazards, jump destinations, and interactive paths must remain clear, especially at speed. Beauty must help navigation or stay out of its way.

### 4. Characters with ridiculous heart
The heroes are charming outsiders, not generic mascots. Their reactions, anticipation, squash, and small failures should make movement satisfying and funny. Their designs must read in motion at gameplay scale.

### 5. Authored surprises, not random noise
Spectacles have setups, reveals, payoffs, and aftermaths. The Petal Parade is a reference example: a transformation the player can anticipate, experience, and remember. Future biomes should invent fresh visual/music interactions while preserving an identifiable Cloudbloom language.

## 3. Story and world

**Established premise:** The sky has forgotten its morning song. Choose **Poppy** or **Sir Puddlewick**, gather the missing melody, and carry it across the clouds toward the sleeping sun.

**Current first level:** *The Morning That Forgot to Happen.* It begins in a tutorial garden, introduces expressive traversal objects, branches into normal and express routes, and contains the **Petal Parade** as its major transformation before the closing encounter with the sleeping sun.

**Tone:** witty, affectionate, whimsical, optimistic. Earnest feeling is welcome; cynicism, irony-only worldbuilding, and generic epic-fantasy bombast are not.

**Narrative method:** environment, animation, music, small character exchanges, and recurring motifs should tell most of the story. Gameplay should rarely stop to explain the wonder.

**Future exploration, not implemented canon:** *Ink-and-Sun Carnival* and *Moonsea* are evocative biome ideas, not finished features. Their shape, order, lore, and gameplay should remain open to iteration.

## 4. Playable character identities

| Character | Recognizable design | Personality in motion |
| --- | --- | --- |
| **Poppy** | Brown braid; red spotted mushroom hat; light shirt; colourful patterned trousers | Impulsive, nimble, warm, adventurous; expressive braid and hat secondary motion |
| **Sir Puddlewick** | Bald older gentleman; tall top hat; handlebar moustache; monocle; plain white underwear; yellow duck floatie | Ridiculously dignified, unexpectedly athletic; hat/floatie/moustache secondary motion |

**Gameplay fairness:** In the current build, the heroes share physics and hitboxes. Art must not create misleading collision silhouettes or give one character a perceptual route advantage. Distinct personality should come from acting, animation, sound, and visual effects unless a future game-design decision intentionally changes this.

**Character-art direction:** memorable silhouette first; excellent timing second; thoughtful internal pixel detail third. Readable, playful animation beats complexity.

## 5. Proposed visual identity: Skyprint Folklore

**Working hypothesis, not a locked mandate.** The world feels like a living storybook printed with imperfect layers of ink, stitched through with rhythmic botanical geometry, and awakened by motion.

Visual signatures to explore:

- **Crisp playable layer:** deliberate pixel silhouettes, sharply defined landing edges, expressive animation poses.
- **Illustrated sky depth:** sculptural clouds, carved floating islands, unusual architecture, paper-and-ink textures.
- **Musical botany:** petals, stems, flower fans, rings, and wind bands that feel like fragments of a score.
- **Selective print misregistration:** restrained colour offsets and graphic doubles on speed accents, not constant chromatic blur.
- **Environmental choreography:** foreground activity and distant scenery respond to Bloom, music, and authored events.
- **Gentle-to-wild transformation:** worlds look lovely at rest and astonishing at full bloom, while remaining legible.

Influence roles rather than mimicry: *Celeste* — clarity/feel; *Across the Spider-Verse* — graphic bravery; *Super Mario Bros. Wonder* — authored surprise; *Golden Sun* — adventure and handcrafted pixel-art richness. No direct reproduction of another property's characters, scenery, UI, or identifiable motifs.

### Starter colour conversation (exploratory, not approved tokens)

| Role | Candidate | Usage |
| --- | --- | --- |
| Ink / outline | #30213D | Character and gameplay contrast |
| Dusk lilac | #9A81E8 | Distant sky and atmosphere |
| Dawn peach | #FFCCB4 | Warm horizon, gentle opening |
| Cloud cream | #FFF6E9 | Landable cloud highlights |
| Mushroom coral | #E3434C | Poppy, selected accents |
| Sun-gold | #FFE078 | Melody/sun/achievement accents |
| Neural mint | #91EACD | Wind/energy/secondary magic |
| Petal pink | #F99BC9 | Bloom and botanical accents |

Do not paint everything with the same saturated palette. Each scene needs controlled contrast, palette hierarchy, atmosphere, and quiet areas. The final art palette should be measured against real gameplay screenshots and accessibility presets before it becomes canonical.

## 6. Readability and graphical hierarchy

During a fast run, the eye should decode information in this order:

1. Player location, pose, facing, and near-future trajectory.
2. Landable platforms, gaps, hazards, and next jump/dash target.
3. Interactables: springcaps, wind ribbons, dewdrop rings, melody fragments, checkpoints.
4. Optional rewards, clues, and nearby reactive scenery.
5. Decorative layers, skyline, distant animation, and psychedelic ornament.

**Contract:** Decorative objects may not convincingly resemble landable platforms; gameplay silhouettes cannot vanish under particles or lighting; hazard warnings must remain clear with reduced effects; no essential collision information may be encoded only by hue.

The existing 480 × 270 logical render target and crisp nearest-neighbour art set a meaningful base constraint. Evaluate every change at **actual play size**, not only on zoomed stills.

## 7. World vocabulary

**Existing first-level gameplay objects:** puff clouds, springcaps, wind ribbons, dewdrop rings, ink-thistles, sun-seeds, melody fragments, keepsakes, checkpoints, giant flower, and the sleeping sun. Keep them immediately distinguishable even as their skins and animations improve.

**Recurring identity motifs to develop:** concentric musical rings; petal shapes inspired by sound waves; etched cloud undersides; imperfect printed colour layers; a soft rhythmic sunrise; landscapes that shift between dormant and orchestral.

**Level structure:** The regular route invites first-time enjoyment, while higher express lanes and optional detours reward speed, exploration, and repeated mastery. Background spectacle must never unintentionally conceal a high-speed route.

## 8. Bloom as an emotional grammar

| State | Mood | Presentation principles |
| --- | --- | --- |
| Quiet | Intimate, sleepy, curious | Sparse particles, gentle parallax, closed flowers, legible colour |
| Stirring | Playful, responsive | Subtle flora reactions, melodic accents, directional winds |
| Singing | Kinetic, celebratory | Layered motion trails, synchronized colour/petal responses |
| Spectacular | Euphoric, uncanny, rewarding | Authored sky choreography, patterned depth, carefully limited visual accents |

These are **creative tiers**, not a proposal to rewrite existing Bloom thresholds or physics. The renderer should translate existing game state into expressive but optional effects. Art should remain coherent in Gentle, Standard, Vivid, and reduced-effects configurations.

### Signature moment: the Petal Parade

Anticipation → reveal → peak → release → persistent afterglow. The giant flower, waking cloud faces, floral fan patterns, and petal bridge should read as one deliberately staged musical event. The interactive bridge must remain clearly telegraphed and safe at maximum speed. Do not trade away physical fairness for more dramatic transitions.

## 9. Audio and UI identity

**Audio:** A score that grows with traversal rather than dictating it. Poppy's bells and Sir Puddlewick's duck-like sound cues communicate personality. The current four-stem procedural score is a prototype; a produced soundtrack may replace it later. Animation, music, and VFX should share phrasing when possible but must degrade gracefully if audio is muted or unavailable.

**UI:** Menus should feel like part of the same world, not a generic web dashboard. Handcrafted type treatments, expressive but accessible transitions, warm system feedback, a restrained high-contrast in-game HUD, and a special sense of occasion for achievements and completion.

**Comfort:** Gentle/Standard/Vivid presets, camera-shake limits, afterimage/background-effect controls, and reduced-effects readability are part of the identity, not optional postproduction.

## 10. What is already true vs. what is aspirational

**Implemented vertical slice (according to docs/STATUS.md, 2026-10-07):** two selectable characters, one hand-authored level, express routes, 6 checkpoints, Bloom, Petal Parade, local time trials and records, adaptive procedural demo score, input and rendering options.

**Not established as shipped:** a polished studio soundtrack, independently playtested movement feel, ghost replay, gamepad/touch gameplay, future biomes, and fully hand-polished character/environment assets.

Do not treat concept mockups or this identity document as proof of implemented art.

## 11. Cross-discipline rules and decision ownership

- **Game identity:** This file is the shared creative north star. Changes should be deliberate and reviewed across streams.
- **Art design branch:** owns appearance, art assets, visual effects, character acting, presentation-facing animations, graphics polish, menu style, and visual documentation. See [ART_DESIGN.md](ART_DESIGN.md).
- **Movement mechanics branch:** owns movement tuning, jump/dash behaviour, collision/physics, movement-input mechanics, controller testing, and gameplay-feel instrumentation.
- **Shared integration:** both streams should rely on semantic movement/presentation signals rather than art effects reading hardcoded physics constants. Any shared gameplay API change needs agreement before editing.
- **Branch safety:** independent branches and reviewable PRs; never merge either stream into master automatically and do not overwrite the other's work.

## 12. Open decisions for playtesting and art review

- Does *Cloudbloom: A Sky Out of Tune* remain the release title?
- Which graphical style makes the heroes and scenery instantly recognizable at 480 × 270?
- What level of illustrated texture can coexist with crisp pixel gameplay?
- What is the final production palette, outline system, sprite size, and font family?
- How much motion-driven spectacle is comfortable at expert run speed?
- Which visual signals from the movement stream should become stable public presentation events?
- Which moments deserve unique transformations rather than more generic particles?

**Quality criterion:** A screenshot should be unmistakably Cloudbloom; a five-second movement clip should feel delightful; and a fast player should never miss a landing because the art got in the way.

---

*This is a starting constitution, not a finished art bible. Refine it using playable evidence, side-by-side screenshots, user feedback, and the independent movement-mechanics PR.*
