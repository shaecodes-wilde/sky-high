// "Morning Song" — an ORIGINAL procedural demo score (not a finished studio
// soundtrack). F major, 144 BPM, 16 steps per bar. Four phase-locked stems:
//   0 atmosphere & harmony · 1 melody · 2 bass & light percussion · 3 full drums & countermelody
// To replace it with recorded stems, see docs/AUDIO.md.

export const BPM = 144;
export const STEPS_PER_BAR = 16;
export const STEP_SECONDS = 60 / BPM / 4;

export type ChordName = 'Fmaj7' | 'Dm9' | 'Bbmaj7' | 'C9sus' | 'C' | 'Gm7' | 'Am7' | 'Dbmaj7' | 'Ebmaj7';

/** Pad voicings (MIDI) and bass roots. */
export const CHORDS: Record<ChordName, { pad: number[]; root: number }> = {
  Fmaj7: { pad: [53, 57, 60, 64], root: 41 },
  Dm9: { pad: [53, 57, 60, 64], root: 38 },
  Bbmaj7: { pad: [50, 53, 57, 58], root: 46 },
  C9sus: { pad: [53, 55, 58, 62], root: 36 },
  C: { pad: [52, 55, 58, 60], root: 36 },
  Gm7: { pad: [50, 53, 55, 58], root: 43 },
  Am7: { pad: [52, 55, 57, 60], root: 45 },
  Dbmaj7: { pad: [49, 53, 56, 60], root: 37 },
  Ebmaj7: { pad: [51, 55, 58, 62], root: 39 },
};

/** [step, midi, lengthInSteps] within a bar. */
export type Note = [number, number, number];

export interface Section {
  name: 'intro' | 'A' | 'B' | 'parade' | 'ending';
  chords: ChordName[];
  melody: Note[][];
  /** Drums play in half-time feel. */
  halfTime: boolean;
}

const MORNING_A: Note[][] = [
  [[0, 69, 4], [4, 72, 2], [6, 77, 6], [12, 76, 4]],
  [[0, 74, 3], [3, 72, 3], [6, 69, 2], [8, 72, 8]],
  [[0, 74, 4], [4, 77, 2], [6, 81, 6], [12, 79, 4]],
  [[0, 76, 3], [3, 74, 3], [6, 72, 2], [8, 67, 8]],
  [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 81, 4], [12, 79, 4]],
  [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 8]],
  [[0, 70, 4], [4, 74, 2], [6, 79, 6], [12, 77, 4]],
  [[0, 76, 4], [4, 79, 4], [8, 76, 8]],
];

const ANSWER_B: Note[][] = [
  [[0, 74, 2], [3, 77, 2], [6, 81, 2], [8, 79, 2], [10, 77, 6]],
  [[0, 76, 2], [3, 79, 2], [6, 84, 4], [10, 81, 6]],
  [[0, 74, 2], [3, 77, 2], [6, 82, 2], [8, 81, 2], [10, 79, 6]],
  [[0, 81, 6], [6, 77, 2], [8, 72, 8]],
  [[0, 74, 2], [3, 77, 2], [6, 81, 2], [8, 79, 2], [10, 77, 6]],
  [[0, 76, 2], [3, 79, 2], [6, 84, 4], [10, 81, 6]],
  [[0, 74, 2], [3, 77, 2], [6, 82, 2], [8, 81, 2], [10, 79, 6]],
  [[0, 79, 4], [4, 76, 4], [8, 74, 4], [12, 72, 4]],
];

const PARADE_C: Note[][] = [
  [[0, 77, 8], [8, 80, 8]],
  [[0, 79, 8], [8, 82, 8]],
  [[0, 81, 6], [6, 84, 2], [8, 81, 4], [12, 77, 4]],
  [[0, 76, 4], [4, 77, 12]],
  [[0, 80, 4], [4, 77, 4], [8, 84, 8]],
  [[0, 82, 4], [4, 79, 4], [8, 79, 8]],
  [[0, 82, 4], [4, 81, 4], [8, 79, 4], [12, 77, 4]],
  [[0, 76, 8], [8, 79, 8]],
];

export const SECTIONS: Record<Section['name'], Section> = {
  intro: {
    name: 'intro',
    chords: ['Fmaj7', 'Dm9', 'Bbmaj7', 'C9sus'],
    melody: [MORNING_A[0], MORNING_A[1], [[8, 74, 4], [12, 72, 4]], [[0, 67, 8]]],
    halfTime: true,
  },
  A: { name: 'A', chords: ['Fmaj7', 'Dm9', 'Bbmaj7', 'C', 'Fmaj7', 'Dm9', 'Gm7', 'C'], melody: MORNING_A, halfTime: false },
  B: { name: 'B', chords: ['Bbmaj7', 'Am7', 'Gm7', 'Fmaj7', 'Bbmaj7', 'Am7', 'Gm7', 'C'], melody: ANSWER_B, halfTime: false },
  parade: { name: 'parade', chords: ['Dbmaj7', 'Ebmaj7', 'Fmaj7', 'Fmaj7', 'Dbmaj7', 'Ebmaj7', 'Gm7', 'C'], melody: PARADE_C, halfTime: true },
  ending: {
    name: 'ending',
    chords: ['Bbmaj7', 'C9sus', 'Fmaj7', 'Fmaj7'],
    melody: [MORNING_A[2], MORNING_A[3], MORNING_A[0], [[0, 77, 16]]],
    halfTime: true,
  },
};

/** Normal arrangement loop after the intro. */
export const FORM: Section['name'][] = ['A', 'B', 'A', 'B'];

/** Stem target levels per Bloom tier (0 low · 1 medium · 2 high). */
export const STEM_LEVELS: number[][] = [
  [0.9, 0.85, 0, 0],
  [0.9, 0.95, 0.85, 0],
  [0.85, 1, 0.9, 0.85],
];

export const MIX = {
  master: 0.7,
  musicDefault: 0.7,
  sfxDefault: 0.8,
  reverbSend: 0.28,
};
