# Asset & audio provenance

Everything the game draws or plays is generated at runtime by code in this repository. There are no image files, audio files, fonts or third-party art packs in the build.

| Asset | Source | Where |
| --- | --- | --- |
| Poppy & Sir Puddlewick sprites (21 frames each, 24×32) | Original. Drawn procedurally from shared poses on a pixel grid, re-authored in the *Skyprint Folklore* art pass (see `docs/ART_BIBLE.md`). Poppy keeps her **brown** braid (user request); Sir Puddlewick is **bald** under his hat with plain white underwear and a duck floatie. | `src/render/characters.ts` |
| Islands ("moored earth"), carved relief clouds, petal bridge, springcaps, dewdrop rings, ink-thistles, sun-seeds, melody fragments, keepsakes, checkpoint posts, signs, decor, giant flower, sun | Original procedural pixel art | `src/render/props.ts` |
| Halftone sky, song staff, sun rings, Petal Parade edition, dawn; wind-organ / cloud-bank / cloud-sea parallax strips; wind ribbons | Original GLSL shaders and procedural strips | `src/render/background.ts` |
| Impact bursts (landing ripples, dash gouges, rebound arcs, refill rings, bloom rings), print stamps, landing shadow | Original procedural flip-books and shaders | `src/render/Bursts.ts`, `src/render/GameRenderer.ts` |
| UI ornaments and the CLOUDBLOOM wordmark (registration marks, curls, pips, halftone tiles) | Original, drawn in code on the pixel grid | `src/ui/ornaments.ts` |
| Colour palette | Original | `src/render/palette.ts` |
| 3×5 pixel font for in-world signs | Original glyph table | `src/render/pixel.ts` |
| Menu / HUD typography | System font stacks only (serif headings, sans body); no font files shipped | `src/ui/styles.css` |
| Music: "Morning Song" procedural demo score | Original composition (melodies, chords and arrangement written for this project), synthesised live with Web Audio | `src/config/audio.ts`, `src/audio/AudioEngine.ts` |
| Sound effects | Original Web Audio synthesis | `src/audio/AudioEngine.ts` |
| Reverb impulse | Generated noise decay at startup | `src/audio/AudioEngine.ts` |
| App icon | Pre-existing repository file | `assets/icon.svg` |

The creative references named in the brief (Celeste, Golden Sun, Super Mario Wonder, Across the Spider-Verse, Geometry Dash) were used only as tonal direction. No characters, levels, melodies, interface elements or assets were copied from them.

## Code dependencies

| Package | Version | License | Use |
| --- | --- | --- | --- |
| three | 0.186.1 | MIT | WebGL renderer |
| vite | 8.3.3 | MIT | Dev server and bundler (dev only) |
| typescript | 7.0.2 | Apache-2.0 | Type checking (dev only) |
| vitest | 5.0.3 | MIT | Tests (dev only) |
| @types/three | 0.186.0 | MIT | Type definitions (dev only) |

Versions are pinned exactly in `package.json` and locked in `package-lock.json`.
