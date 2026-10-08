# Asset & audio provenance

Everything the game draws or plays is generated at runtime by code in this repository. There are no image files, audio files, fonts or third-party art packs in the build.

| Asset | Source | Where |
| --- | --- | --- |
| Poppy & Sir Puddlewick sprites (21 frames each, 24×32) | Original. Drawn procedurally from shared poses on a pixel grid. Based on the user-supplied concept sheets, with the adjustments the brief asked for: Poppy's hair is **brown** like the sheet (at the user's request), and Sir Puddlewick is **bald** under his hat with plain white underwear. | `src/render/characters.ts` |
| Islands, clouds, petals, springcaps, dewdrop rings, ink-thistles, seeds, fragments, keepsakes, checkpoints, signs, decor, giant flower, sun | Original procedural pixel art | `src/render/props.ts` |
| Sky, parallax strips, wind ribbons | Original GLSL shaders and procedural strips | `src/render/background.ts` |
| 3×5 pixel font for in-world signs | Original glyph table | `src/render/pixel.ts` |
| Menu / HUD typography | The system UI font stack (no font files shipped) | `src/ui/styles.css` |
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
