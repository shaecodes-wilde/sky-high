# Audio

## What ships now: a procedural demo score

The music is an **original procedural demo**, synthesised live with the Web Audio API. It is not a finished studio soundtrack. It was written to prove out the adaptive-music system, and its timbres are deliberately simple:
- celesta: sine plus a bell partial
- music box
- mallets
- detuned saw pads
- plucked square bass
- synthesised kick, snare and hats

**Key / tempo:** F major, 144 BPM, 16 steps per bar. The intro and the parade use a half-time drum feel.

**Sections** (all data lives in `src/config/audio.ts`):

| Section | Bars | Role |
| --- | --- | --- |
| `intro` | 4 | Opening phrase of the "morning song", half-time |
| `A` | 8 | The morning-song melody |
| `B` | 8 | Answering phrase, more syncopated |
| `parade` | 8 | Borrowed ♭VI–♭VII lift (D♭maj7 → E♭maj7) for the Petal Parade |
| `ending` | 4 | Resolution onto F at the sleeping sun |

After the intro the form loops A → B → A → B. The parade and the ending are cued by gameplay and start on the next bar line.

**Stems** (each is its own `GainNode`, and all are scheduled from one shared step clock, so they stay phase-aligned):

| Stem | Content | Bloom 0 | Bloom 1 | Bloom 2 |
| --- | --- | --- | --- | --- |
| 0 | Atmosphere & harmony (pads, music-box sparkles) | ● | ● | ● |
| 1 | Melody (celesta) | ● | ● | ● |
| 2 | Plucked bass & light percussion | | ● | ● |
| 3 | Breakbeat & mallet countermelody | | | ● |

Stem levels change only at bar boundaries, with a short crossfade (`setTargetAtTime`). Bloom never changes tempo or pitch.

**Melody fragments** enrich the melody stem:
- 1 fragment adds an octave music-box doubling.
- 2 fragments add a soft echo.

**Scheduling:** a 25 ms look-ahead timer schedules notes about 120 ms ahead on `AudioContext.currentTime`. Gameplay sound effects play immediately and are never quantised to the beat.

**Lifecycle:**
- The context is created and resumed by the Start button.
- If the browser blocks audio, a banner offers to retry. The game stays fully playable without sound.
- Pausing suspends the context.
- Restarts never create a second scheduler or a second track: `playMusic` is idempotent.

The momentum build adds a quiet, rate-limited cloud-skim musical accent with a
small speed-dependent pitch rise. It plays on a timely dash-flight landing and
rebound, rather than every movement step. Ring accents are also rate-limited.
Normal/boosted spring sounds, character flavor, mute/volume controls and the
four synchronized adaptive stems remain unchanged. Sound is presentation only.

## Replacing it with recorded stems

1. Export four loop-aligned stems per section at 144 BPM (same length, same start). Any common format works, e.g. `assets/audio/A_stem0.ogg` … `A_stem3.ogg`, plus the same for `B`, `intro`, `parade` and `ending`.
2. In `AudioEngine`, decode them once with `decodeAudioData`. Then, in `scheduleStep`, replace the synthesis calls with a single `AudioBufferSourceNode` per stem, started at each section's first bar. Keep the existing `stems[i]` gain nodes so the Bloom mix and bar-quantised crossfades keep working unchanged.
3. Keep `advanceBar` / `cue()` as the section controller: they already decide which section plays next.
4. Add the files to `docs/ASSETS.md` with their licence and author.
