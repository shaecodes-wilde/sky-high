// Skyprint Folklore — the production palette (see docs/ART_BIBLE.md).
//
// Every colour in the game belongs to a *material*, and every material has a
// gameplay job. Ramps run light → dark. Art code should pull from here rather
// than inventing one-off hex values, so the whole world prints from the same
// handful of inks.

/** Ink: the shared outline / darkest value. Characters and hazards use it at full strength. */
export const INK = {
  ink: '#2b1d3a',
  plum: '#3d2a55',
  soft: '#5a4378',
  /** Outline for pale environment materials (softer than character ink). */
  line: '#4b3870',
};

/** Paper: warm highlights. The brightest value in any scene is reserved for landing lips. */
export const PAPER = {
  white: '#fffdf8',
  cream: '#fff6e9',
  butter: '#ffeccc',
  warm: '#f6dcc4',
  shade: '#e7c6b4',
};

/** Cloud belly — relief-carved lilac. Never the brightest value; grooves read as engraving. */
export const CLOUD = {
  hi: '#e4d6f6',
  light: '#cdb9ee',
  mid: '#b09ae0',
  low: '#917cc9',
  groove: '#7462ae',
  deep: '#5d4d92',
};

/** Moored earth — islands are lavender stone printed in strata, crowned with meadow. */
export const EARTH = {
  meadowHi: '#e8f5b0',
  meadow: '#b8e07e',
  meadowMid: '#86c46a',
  meadowLow: '#5a9a5c',
  meadowDeep: '#3f7454',
  stoneHi: '#a892c4',
  stone: '#8a74ad',
  stoneMid: '#735e98',
  stoneLow: '#5d4b80',
  stoneDeep: '#46386a',
  root: '#c99a8a',
};

/** Sky inks (dormant → awake). */
export const SKY = {
  zenith: '#8e7fd0',
  high: '#ae9ee0',
  mid: '#cdb8e8',
  low: '#f0c9cf',
  horizon: '#ffd9bd',
  /** Bloom shifts the sky toward a warmer, more saturated "edition". */
  zenithBloom: '#9a72d6',
  midBloom: '#e7a9d6',
  horizonBloom: '#ffd99a',
  night: '#2a2350',
};

/** Accent inks — each has exactly one job. */
export const ACCENT = {
  /** Springcaps / Poppy. Rebound. */
  coral: '#e8484f',
  coralHi: '#ff7f73',
  coralLo: '#a8273a',
  /** Sun, seeds, melody, achievement. */
  gold: '#ffd75e',
  goldHi: '#fff3b0',
  goldLo: '#e39a2c',
  goldDeep: '#a8601e',
  /** Dewdrop rings, wind, dash energy. */
  mint: '#8ff0cf',
  mintHi: '#e2fff4',
  mintLo: '#3fc4a6',
  mintDeep: '#27877a',
  /** Bloom / Petal Parade / botany. */
  petal: '#ff9fcf',
  petalHi: '#ffd8ec',
  petalLo: '#e2669f',
  petalDeep: '#b2457f',
  /** Hazard-only glint. Never used on safe objects. */
  sting: '#ff5c8a',
};

/** Print-misregistration plates used by speed accents (afterimages, parade echoes). */
export const PLATES = [ACCENT.coralHi, ACCENT.mint, ACCENT.gold, '#b8a8ff'] as const;

/** Converts '#rrggbb' to [r,g,b] floats for shader uniforms. */
export function rgb01(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** GLSL vec3 literal for a palette colour (used to template shaders). */
export function vec3(c: string): string {
  const [r, g, b] = rgb01(c);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}
