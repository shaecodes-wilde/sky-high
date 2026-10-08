import { FRAME_H, FRAME_NAMES, FRAME_W } from '../config/animation';
import { ACCENT, EARTH, INK, PAPER } from './palette';
import { hex, Pix, type RGBA } from './pixel';

// Both playable characters are drawn in code on the 24×32 grid from a small
// per-character rig: a hand-shaped head, a cap / top hat, a torso, and limbs
// solved from hip→foot and shoulder→hand targets. Every frame is an authored
// key pose (no interpolation), so each one can be art-directed on its own.
//
// Contract: frames face right; feet rest on row 30, row 31 holds the outline;
// bodies broadly fill the shared 10×22 collision box (x 7..16, rows 9..30).
// Caps, hats, braids and the duck floatie may overhang it.

export type CharacterId = 'poppy' | 'puddlewick';

type Pt = [number, number];
type Shade = (x: number, y: number, t: number, s: number) => string | null;
type Eye = 'open' | 'blink' | 'happy' | 'wide' | 'squint' | 'dizzy' | 'shut' | 'calm';
type Mouth = 'smile' | 'grin' | 'open' | 'oh' | 'flat' | 'grit' | 'wobble';

const OUT = INK.ink;

// ── Geometry helpers ───────────────────────────────────────────────────────

/**
 * Paints every pixel within a tapered radius of segment a→b. `s` passed to
 * a shading callback is the signed perpendicular offset (−1 left … +1 right
 * of the direction of travel), so limbs can carry a lit and a shadow side.
 */
function capsule(p: Pix, a: Pt, b: Pt, r0: number, r1: number, c: string | Shade): void {
  const r = Math.max(r0, r1);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-6;
  const len = Math.sqrt(l2);
  for (let y = Math.floor(Math.min(a[1], b[1]) - r); y <= Math.ceil(Math.max(a[1], b[1]) + r); y++) {
    for (let x = Math.floor(Math.min(a[0], b[0]) - r); x <= Math.ceil(Math.max(a[0], b[0]) + r); x++) {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const d = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
      const rr = r0 + (r1 - r0) * t;
      if (d > rr + 1e-6) continue;
      const col = typeof c === 'string' ? c : c(x, y, t, ((x - a[0]) * dy - (y - a[1]) * dx) / len / Math.max(rr, 0.5));
      if (col) p.px(x, y, col);
    }
  }
}

/** 1-px Bresenham line (crisp spindly limbs, chains). */
function line1(p: Pix, a: Pt, b: Pt, c: string): void {
  let x0 = Math.round(a[0]);
  let y0 = Math.round(a[1]);
  const x1 = Math.round(b[0]);
  const y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    p.px(x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Middle joint of a two-bone limb of total length `len`. dir=+1 bends the
 * joint "forward" of the a→b direction (knees), −1 bends it back (elbows).
 */
function joint(a: Pt, b: Pt, len: number, dir: 1 | -1): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const h = Math.sqrt(Math.max(0, (len / 2) ** 2 - (d / 2) ** 2));
  return [(a[0] + b[0]) / 2 + (dir * dy * h) / d, (a[1] + b[1]) / 2 - (dir * dx * h) / d];
}

/** Draws a palette-keyed pixel stamp; '.' and ' ' are transparent. */
function stamp(p: Pix, x: number, y: number, rows: string[], pal: Record<string, string>, flip = false): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const k = row[flip ? row.length - 1 - i : i];
      if (k !== '.' && k !== ' ') p.px(x + i, y + j, pal[k]);
    }
  });
}

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

/**
 * Draws a part on its own layer, gives it a full ink contour (optionally
 * masked, e.g. to leave the hip joint seamless) and composites it. This is
 * what separates a skin arm from a skin face, or the near leg from the far.
 */
function inked(p: Pix, draw: (l: Pix) => void, mask?: (x: number, y: number) => boolean, selOut?: Record<string, string>): void {
  const l = new Pix(p.w, p.h);
  draw(l);
  const sel = selOut && new Map(Object.entries(selOut).map(([k, v]) => [hex(k).slice(0, 3).join(), v]));
  const edits: [number, number, string | RGBA][] = [];
  for (let y = 0; y < l.h; y++) {
    for (let x = 0; x < l.w; x++) {
      const c = l.get(x, y);
      if (c) edits.push([x, y, c]);
      else if ((l.opaque(x - 1, y) || l.opaque(x + 1, y) || l.opaque(x, y - 1) || l.opaque(x, y + 1)) && (!mask || mask(x, y))) {
        // Selective outline: over a contrasting material, use that material's
        // own dark tone instead of full ink, so crossings stay quiet.
        const under = p.get(x, y);
        const soft = under ? sel?.get(under.slice(0, 3).join()) : undefined;
        if (soft !== '') edits.push([x, y, soft || OUT]); // '' = no contour over that material
      }
    }
  }
  for (const [x, y, c] of edits) p.px(x, y, c);
}

/** Little four-point dizzy star. */
function star(p: Pix, x: number, y: number, c: string, hi: string): void {
  p.px(x, y, hi);
  p.px(x - 1, y, c);
  p.px(x + 1, y, c);
  p.px(x, y - 1, c);
  p.px(x, y + 1, c);
}

// ── Shared pose description ────────────────────────────────────────────────

interface Foot {
  /** Ankle pixel. On the ground the ankle sits on row 28 (shoe rows 29–30). */
  x: number;
  y: number;
  toe?: 'flat' | 'point' | 'up';
  /** Override for the knee position. */
  knee?: Pt;
}

interface Pose {
  /** Whole upper body bob (head, torso, hips) in rows. */
  b: number;
  /** Torso x shift (forward lean). */
  lean: number;
  /** Extra head offset beyond the torso. */
  hx: number;
  hy: number;
  /** Extra hip offset (squash / sitting). */
  hipY: number;
  feet: [Foot, Foot]; // far, near
  hands: [Pt, Pt]; // far, near — relative to their shoulders
  /** Headwear lift (rows), x offset and tilt (+ = brim dips forward). */
  hat: number;
  hatX: number;
  tilt: number;
  /** +1 squashes headwear wider / lower, −1 stretches it. */
  squash: number;
  eyes: Eye;
  mouth: Mouth;
  stars: boolean;
  // Poppy
  braid: [number, number]; // root and tip angle, degrees back from straight down
  braidFront: boolean;
  // Puddlewick
  stache: 'rest' | 'up' | 'down' | 'wind' | 'twitch';
  brow: 'calm' | 'stern' | 'up';
  monocle: 'on' | 'pop' | 'dangle';
  /** Floatie offset relative to the waist (lags the body), and squash. */
  ring: number;
  ringSquash: number;
}

const F = (x: number, y = 28, toe: Foot['toe'] = 'flat', knee?: Pt): Foot => ({ x, y, toe, knee });

const BASE: Pose = {
  b: 0,
  lean: 0,
  hx: 0,
  hy: 0,
  hipY: 0,
  feet: [F(10), F(13)],
  hands: [
    [-1, 5],
    [1, 5],
  ],
  hat: 0,
  hatX: 0,
  tilt: 0,
  squash: 0,
  eyes: 'open',
  mouth: 'smile',
  stars: false,
  braid: [20, 12],
  braidFront: false,
  stache: 'rest',
  brow: 'calm',
  monocle: 'on',
  ring: 0,
  ringSquash: 0,
};

const pose = (p: Partial<Pose>): Pose => ({ ...BASE, ...p });

// ── Poppy ──────────────────────────────────────────────────────────────────

const PO = {
  skin: '#f7cba6',
  skinS: '#df9d7d',
  skinD: '#b9675a',
  blush: '#f68ea4',
  hair: '#8c5634',
  hairD: '#5d3423',
  hairL: '#b47a4a',
  cap: ACCENT.coral,
  capHi: ACCENT.coralHi,
  capLo: ACCENT.coralLo,
  gill: PAPER.butter,
  gillS: PAPER.shade,
  spot: PAPER.cream,
  spotS: PAPER.shade,
  shirt: PAPER.white,
  shirtS: '#dccfe9',
  shirtD: '#b5a4d2',
  pants: ACCENT.petal,
  pantsS: ACCENT.petalLo,
  pantsD: ACCENT.petalDeep,
  printA: ACCENT.gold,
  printB: PAPER.cream,
  shoe: '#7c4630',
  shoeL: '#ab6b42',
  shoeD: '#52291f',
  tie: ACCENT.gold,
  tieS: ACCENT.goldLo,
  petal: PAPER.white,
  centre: ACCENT.gold,
  leaf: EARTH.meadowMid,
  eye: OUT,
  white: PAPER.white,
  tongue: ACCENT.coral,
};

// Head under the cap: 10×7, origin = left of row 9. Hair wraps the back,
// the face looks right. H/h/l hair, s/S skin.
const POPPY_HEAD = [
  'hhhhhhhhhh',
  'Hhlhhhhhss',
  'Hhhhhsssss',
  'HhhSssssss',
  'HhhSssssss',
  'HHhSSsssss',
  '.HHhSSsss.',
];

function poppyRun(i: number): Partial<Pose> {
  // contact → down → passing, then the same with the other leg.
  const k = i % 3;
  const near = i < 3; // near leg is the forward one in the first half
  const bob = [0, 1, -1][k];
  const fwd = [F(16, 28, 'up'), F(14, 28), F(11, 28, 'point')][k];
  const back = [F(7, 26, 'point'), F(8, 24, 'point', [6, 24]), F(14, 25, 'point', [15, 23])][k];
  const armF: Pt = [[5, 0], [4, 2], [1, 5]][k] as Pt; // forward-swinging hand
  const armB: Pt = [[-5, 1], [-4, 3], [-1, 5]][k] as Pt;
  return {
    b: bob,
    lean: 1,
    hx: 0,
    feet: near ? [back, fwd] : [fwd, back],
    hands: near ? [armF, armB] : [armB, armF],
    hat: k === 1 ? 1 : 0,
    braid: ([
      [55, 85],
      [45, 70],
      [65, 95],
    ] as [number, number][])[k],
    mouth: 'smile',
  };
}

const POPPY: Record<string, Pose> = {
  idle0: pose({}),
  idle1: pose({ b: 1, hands: [[-1, 4], [1, 4]], braid: [16, 4] }),
  idle2: pose({ eyes: 'blink', braid: [22, 20] }),
  start: pose({ b: 1, lean: 1, hx: 1, feet: [F(8, 27, 'point'), F(14)], hands: [[3, 2], [-3, 3]], hat: 1, braid: [10, 2], eyes: 'squint', mouth: 'grit' }),
  run0: pose(poppyRun(0)),
  run1: pose(poppyRun(1)),
  run2: pose(poppyRun(2)),
  run3: pose(poppyRun(3)),
  run4: pose(poppyRun(4)),
  run5: pose(poppyRun(5)),
  brake: pose({
    b: 1,
    lean: -1,
    hx: -2,
    feet: [F(9, 28, 'flat', [11, 25]), F(17, 28, 'up')],
    hands: [[-4, -1], [4, -3]],
    tilt: 1,
    hatX: 1,
    braid: [-30, -55],
    braidFront: true,
    eyes: 'wide',
    mouth: 'oh',
  }),
  jump: pose({ b: -1, feet: [F(10, 27, 'point'), F(13, 25, 'point', [15, 24])], hands: [[-4, -5], [5, -5]], hat: 2, squash: -1, braid: [5, 0], mouth: 'grin' }),
  apex: pose({ feet: [F(7, 25, 'point'), F(16, 26, 'point')], hands: [[-5, 0], [5, -1]], hat: 1, braid: [100, 125], eyes: 'wide', mouth: 'open' }),
  fall0: pose({ feet: [F(9, 26, 'point'), F(14, 27, 'point')], hands: [[-4, -4], [5, -2]], hat: 2, braid: [150, 170], eyes: 'wide', mouth: 'oh' }),
  fall1: pose({ b: -1, feet: [F(10, 27, 'point'), F(14, 25, 'point')], hands: [[-5, -2], [4, -5]], hat: 2, braid: [160, 185], eyes: 'wide', mouth: 'open' }),
  dash: pose({
    b: 1,
    lean: 2,
    hx: 1,
    feet: [F(5, 25, 'point', [7, 26]), F(16, 26, 'flat', [16, 23])],
    hands: [[-5, 1], [5, 0]],
    tilt: -1,
    hatX: -1,
    squash: -1,
    braid: [88, 92],
    eyes: 'squint',
    mouth: 'grit',
  }),
  land: pose({ b: 2, hy: 1, hipY: 1, feet: [F(8), F(15)], hands: [[-4, 2], [4, 2]], squash: 1, braid: [-5, -15], eyes: 'shut', mouth: 'flat' }),
  rebound: pose({ b: -1, feet: [F(10, 27, 'point'), F(13, 26, 'point')], hands: [[-5, -5], [6, -5]], hat: 2, squash: -1, braid: [170, 180], eyes: 'happy', mouth: 'grin' }),
  fail: pose({
    b: 4,
    hipY: 2,
    lean: -1,
    hx: 0,
    feet: [F(16, 26, 'up', [14, 23]), F(19, 27, 'up', [16, 27])],
    hands: [[-4, 5], [-2, 5]],
    hat: 1,
    hatX: 1,
    tilt: 2,
    braid: [40, 60],
    eyes: 'dizzy',
    mouth: 'wobble',
    stars: true,
  }),
  cheer0: pose({ hands: [[-5, -5], [6, -5]], hat: 1, braid: [10, 20], eyes: 'happy', mouth: 'grin' }),
  cheer1: pose({ b: -1, feet: [F(9, 26, 'point', [8, 25]), F(13, 28)], hands: [[-5, -3], [5, -6]], hat: 2, braid: [-10, 30], eyes: 'happy', mouth: 'open' }),
};

/** Sel-out maps for parts crossing Poppy's own body. */
const POPPY_SEL: Record<string, string> = {
  [PO.shirt]: PO.shirtD,
  [PO.shirtS]: PO.shirtD,
  [PO.pants]: PO.pantsD,
  [PO.pantsS]: PO.pantsD,
};
const POPPY_ARM_SEL: Record<string, string> = { ...POPPY_SEL, [PO.shirt]: '', [PO.shirtS]: '' };

function drawPoppy(p: Pix, q: Pose): void {
  const by = q.b;
  const tx = q.lean;
  const hox = 7 + tx + q.hx; // head origin
  const hoy = 9 + by + q.hy;
  const sy = 16 + by; // shoulder row
  const hipY = 22 + by + q.hipY;
  const hips: [Pt, Pt] = [
    [10.5 + tx * 0.5, hipY],
    [13 + tx * 0.5, hipY],
  ];
  const shoulders: [Pt, Pt] = [
    [9 + tx, sy + 1],
    [14 + tx, sy + 1],
  ];

  const belowHip = (_x: number, y: number): boolean => y > hipY;
  if (!q.braidFront) poppyBraid(p, q, hox, hoy);
  inked(p, (l) => poppyArm(l, shoulders[0], q.hands[0], true));
  inked(p, (l) => poppyLeg(l, hips[0], q.feet[0], true), belowHip);

  // Blouse: soft puff shoulders, lilac shadow on the right and along the hem.
  for (let y = sy; y <= sy + 4; y++) {
    for (let x = 9 + tx; x <= 14 + tx; x++) {
      if (y === sy && (x === 9 + tx || x === 14 + tx)) continue;
      let c = PO.shirt;
      if (x === 14 + tx || y === sy + 4) c = PO.shirtS;
      p.px(x, y, c);
    }
  }
  p.px(12 + tx, sy, PO.shirtS); // collar notch
  p.px(13 + tx, sy + 1, PO.shirtS);
  // Waistband.
  p.hline(9 + tx, 14 + tx, sy + 5, PO.pantsS);
  if (hipY > sy + 5) p.rect(Math.round(9 + tx * 0.5), sy + 6, 6, hipY - sy - 5, PO.pants);

  inked(p, (l) => poppyLeg(l, hips[1], q.feet[1], false), belowHip, POPPY_SEL);

  // Head.
  stamp(p, hox, hoy, POPPY_HEAD, { H: PO.hairD, h: PO.hair, l: PO.hairL, s: PO.skin, S: PO.skinS });
  p.px(hox + 10, hoy + 3, PO.skin); // nose
  poppyFace(p, q, hox + 7, hoy + 3);

  inked(p, (l) => poppyArm(l, shoulders[1], q.hands[1], false), (_x, y) => y !== Math.round(shoulders[1][1]) - 2, POPPY_ARM_SEL);
  if (q.braidFront) inked(p, (l) => poppyBraid(l, q, hox, hoy), (_x, y) => y > hoy + 5, POPPY_SEL);
  poppyCap(p, q, 12 + tx + q.hx + q.hatX, hoy - q.hat);
  if (q.stars) {
    const top = hoy - q.hat - 7;
    star(p, hox - 1, top + 1, ACCENT.gold, ACCENT.goldHi);
    star(p, hox + 12, top, ACCENT.gold, ACCENT.goldHi);
  }

  p.outline(OUT);
}

function poppyFace(p: Pix, q: Pose, ex: number, ey: number): void {
  const e = PO.eye;
  switch (q.eyes) {
    case 'blink':
      p.hline(ex - 1, ex, ey + 1, e);
      break;
    case 'shut':
      p.px(ex - 1, ey, e);
      p.px(ex, ey + 1, e);
      p.px(ex - 1, ey + 1, e);
      break;
    case 'happy':
      p.px(ex - 1, ey + 1, e);
      p.px(ex, ey, e);
      p.px(ex + 1, ey + 1, e);
      break;
    case 'wide':
      p.rect(ex - 1, ey - 1, 2, 3, e);
      p.px(ex - 1, ey - 1, PO.white);
      break;
    case 'squint':
      p.hline(ex - 1, ex + 1, ey, e);
      p.px(ex, ey + 1, e);
      break;
    case 'dizzy':
      p.px(ex - 1, ey - 1, e);
      p.px(ex + 1, ey - 1, e);
      p.px(ex, ey, e);
      p.px(ex - 1, ey + 1, e);
      p.px(ex + 1, ey + 1, e);
      break;
    default:
      p.rect(ex, ey, 1, 2, e);
  }
  // Cheek and mouth.
  if (q.eyes !== 'dizzy' && q.eyes !== 'wide') p.px(ex - 1, ey + 2, PO.blush);
  else p.px(ex - 2, ey + 2, PO.blush);
  const mx = ex + 2;
  const my = ey + 2;
  switch (q.mouth) {
    case 'grin':
      p.hline(mx - 1, mx, my, e);
      p.px(mx - 1, my + 1, PO.tongue);
      break;
    case 'open':
      p.px(mx, my, e);
      p.px(mx, my + 1, PO.tongue);
      break;
    case 'oh':
      p.px(mx, my, e);
      p.px(mx, my + 1, e);
      break;
    case 'flat':
      p.hline(mx - 1, mx, my, PO.skinD);
      break;
    case 'grit':
      p.hline(mx - 1, mx, my, e);
      break;
    case 'wobble':
      p.px(mx - 1, my + 1, e);
      p.px(mx, my, e);
      break;
    default:
      p.px(mx, my, PO.skinD);
      p.px(mx - 1, my + 1, PO.skinD);
  }
}

function poppyCap(p: Pix, q: Pose, cx: number, rim: number): void {
  const rx = 8.6 + q.squash * 0.8;
  const ry = 6 - q.squash;
  const cy = rim + 0.4;
  const shear = (y: number): number => Math.round((q.tilt * (rim - y)) / 5);
  for (let y = Math.floor(cy - ry); y < rim; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      let c = PO.cap;
      if (y === rim - 1 || nx > 0.82 || nx * 0.45 + ny * 0.2 > 0.48) c = PO.capLo;
      else if ((nx + 0.42) ** 2 * 2.6 + (ny + 0.72) ** 2 * 5 < 0.32) c = PO.capHi;
      p.px(x - shear(y), y, c);
    }
  }
  // Gills: a cream band peeking from under the rim.
  const g0 = Math.round(cx - rx + 2);
  const g1 = Math.round(cx + rx - 2);
  for (let x = g0; x <= g1; x++) p.px(x, rim, x > cx + 3 ? PO.gillS : PO.gill);
  // Spots — deliberate clusters, larger toward the lit side.
  const spots: [number, number, string[]][] = [
    [-5, -5, ['.ss', 'ssS']],
    [1, -6, ['ss.', 'sss', '.sS']],
    [5, -3, ['sS']],
    [-2, -3, ['s']],
    [-7, -2, ['s']],
  ];
  for (const [sx, sy, rows] of spots) {
    const yy = rim + sy + (q.squash > 0 ? 1 : 0);
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        const x = Math.round(cx) + sx + i;
        const y = yy + j;
        if (y >= rim - 1) continue;
        p.px(x - shear(y), y, row[i] === 'S' ? PO.spotS : PO.spot);
      }
    });
  }
  // Small white flower tucked at the back of the cap.
  const fx = Math.round(cx - rx + 1) - shear(rim - 4);
  const fy = rim - 4 + (q.squash > 0 ? 1 : 0);
  p.px(fx, fy - 1, PO.petal);
  p.px(fx - 1, fy, PO.petal);
  p.px(fx + 1, fy, PO.petal);
  p.px(fx, fy + 1, PO.petal);
  p.px(fx, fy, PO.centre);
  p.px(fx + 1, fy + 1, PO.leaf);
}

function poppyBraid(p: Pix, q: Pose, hox: number, hoy: number): void {
  let x = hox + 0.5;
  let y = hoy + 4.5;
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = ((q.braid[0] + (q.braid[1] - q.braid[0]) * t) * Math.PI) / 180;
    const px = Math.round(x - 0.5);
    const py = Math.round(y - 0.5);
    if (i < 7) {
      p.rect(px, py, 2, 2, PO.hair);
      // Plait: alternate a dark lower-right crossing each step.
      p.px(px + (i % 2), py + 1, PO.hairD);
      if (i % 2 === 0) p.px(px, py, PO.hairL);
    } else if (i === 7) {
      p.rect(px, py, 2, 2, PO.tie);
      p.px(px + 1, py + 1, PO.tieS);
    } else {
      p.rect(px, py, 2, 2, i === n ? PO.hairL : PO.hair);
    }
    x += -Math.sin(a);
    y += Math.cos(a);
  }
}

function poppyLeg(p: Pix, hip: Pt, f: Foot, far: boolean): void {
  const ankle: Pt = [f.x, f.y];
  const knee = f.knee ?? joint(hip, ankle, 6.4, 1);
  const base = far ? PO.pantsS : PO.pants;
  const shade = far ? PO.pantsD : PO.pantsS;
  const sh: Shade = (_x, _y, _t, s) => (s > 0.45 ? shade : base);
  capsule(p, hip, knee, 1.5, 1.5, sh);
  // Bell-bottom: the shin flares toward the hem.
  capsule(p, knee, ankle, 1.5, 2.4, (x, y, t, s) => (t > 0.86 ? shade : sh(x, y, t, s)));
  if (!far) {
    // Flower print: a couple of deliberate gold / cream blossoms.
    const m1: Pt = [Math.round((hip[0] + knee[0]) / 2), Math.round((hip[1] + knee[1]) / 2)];
    const m2: Pt = [Math.round(knee[0] + (ankle[0] - knee[0]) * 0.55), Math.round(knee[1] + (ankle[1] - knee[1]) * 0.55)];
    p.px(m1[0] - 1, m1[1], PO.printA);
    p.px(m2[0], m2[1], PO.printB);
    p.px(m2[0] + 1, m2[1] - 1, PO.printA);
  } else {
    const m2: Pt = [Math.round(knee[0] + (ankle[0] - knee[0]) * 0.5), Math.round(knee[1] + (ankle[1] - knee[1]) * 0.5)];
    p.px(m2[0], m2[1], PO.pants);
  }
  shoe(p, f, far ? PO.shoeD : PO.shoe, far ? PO.shoe : PO.shoeL, PO.shoeD);
}

function shoe(p: Pix, f: Foot, c: string, hi: string, sole: string): void {
  const x = Math.round(f.x);
  const y = Math.round(f.y);
  switch (f.toe) {
    case 'point':
      p.hline(x - 1, x + 1, y + 1, c);
      p.hline(x, x + 2, y + 2, c);
      p.px(x - 1, y + 1, hi);
      break;
    case 'up':
      p.hline(x - 1, x + 1, y + 2, sole);
      p.hline(x - 1, x + 1, y + 1, c);
      p.px(x + 2, y, c);
      p.px(x + 2, y + 1, c);
      p.px(x - 1, y + 1, hi);
      break;
    default:
      p.hline(x - 1, x + 1, y + 1, c);
      p.hline(x - 1, x + 2, y + 2, c);
      p.px(x - 1, y + 1, hi);
      p.px(x + 2, y + 2, c);
  }
}

function poppyArm(p: Pix, sh: Pt, rel: Pt, far: boolean): void {
  const hand = add(sh, rel);
  const elbow = joint(sh, hand, 6, -1);
  const skin = far ? PO.skinS : PO.skin;
  line1(p, sh, elbow, skin);
  line1(p, elbow, hand, skin);
  // Puff sleeve.
  p.rect(Math.round(sh[0]) - (far ? 1 : 0), Math.round(sh[1]) - 1, 2, 2, far ? PO.shirtS : PO.shirt);
  if (!far) p.px(Math.round(sh[0]) + 1, Math.round(sh[1]), PO.shirtS);
  p.rect(Math.round(hand[0]) - 1 + (rel[0] >= 0 ? 1 : 0), Math.round(hand[1]), 2, 2, skin);
}

// ── Sir Puddlewick ─────────────────────────────────────────────────────────

const SP = {
  skin: '#f3c39c',
  skinS: '#d6967a',
  skinD: '#a8695a',
  nose: '#ee9a86',
  shine: PAPER.white,
  fringe: '#ece4f0',
  fringeS: '#b9aac9',
  hat: '#45345e',
  hatL: '#6b5889',
  hatD: '#34264a',
  band: ACCENT.coral,
  bandS: ACCENT.coralLo,
  petal: PAPER.white,
  centre: ACCENT.gold,
  monocle: ACCENT.gold,
  monocleS: ACCENT.goldLo,
  lens: ACCENT.mintHi,
  stache: '#7d4b2e',
  stacheL: '#ad6d40',
  under: PAPER.white,
  underS: '#dccfe9',
  underD: '#b5a4d2',
  duck: ACCENT.gold,
  duckHi: ACCENT.goldHi,
  duckS: ACCENT.goldLo,
  duckD: ACCENT.goldDeep,
  beak: '#f2873a',
  beakS: '#c45b2a',
  eye: OUT,
  white: PAPER.white,
};

function puddleRun(i: number): Partial<Pose> {
  // Ramrod-straight sprinter: upright torso, enormous knee lift, textbook arms.
  const k = i % 3;
  const near = i < 3;
  const bob = [0, 1, -1][k];
  const fwd = [F(16, 28, 'up'), F(13, 28), F(10, 28, 'point')][k];
  const back = [F(8, 26, 'point'), F(8, 24, 'point', [6, 26]), F(15, 24, 'point', [16, 21])][k];
  const armF: Pt = [[3, 0], [2, 2], [0, 5]][k] as Pt;
  const armB: Pt = [[-3, 3], [-2, 4], [0, 5]][k] as Pt;
  return {
    b: bob,
    feet: near ? [back, fwd] : [fwd, back],
    hands: near ? [armB, armF] : [armF, armB],
    ring: [0, -1, 1][k],
    stache: k === 2 ? 'wind' : 'rest',
    brow: 'stern',
    mouth: 'flat',
  };
}

const PUDDLE: Record<string, Pose> = {
  idle0: pose({ hands: [[-1, 5], [1, 5]] }),
  idle1: pose({ b: 1, hands: [[-1, 4], [1, 4]], ring: -1, stache: 'twitch' }),
  idle2: pose({ hands: [[-1, 5], [1, 5]], eyes: 'blink' }),
  start: pose({ b: 1, lean: 1, hx: 1, feet: [F(8, 27, 'point'), F(14)], hands: [[3, 2], [-3, 3]], ring: -1, brow: 'stern', mouth: 'flat' }),
  run0: pose(puddleRun(0)),
  run1: pose(puddleRun(1)),
  run2: pose(puddleRun(2)),
  run3: pose(puddleRun(3)),
  run4: pose(puddleRun(4)),
  run5: pose(puddleRun(5)),
  brake: pose({
    b: 1,
    lean: -1,
    hx: -1,
    feet: [F(9, 28, 'flat', [10, 25]), F(17, 28, 'up')],
    hands: [[-3, -4], [4, -4]],
    hat: 1,
    hatX: 2,
    tilt: 1,
    ring: -1,
    stache: 'up',
    brow: 'up',
    monocle: 'pop',
    eyes: 'wide',
    mouth: 'oh',
  }),
  jump: pose({ b: -1, feet: [F(11, 28, 'point'), F(13, 28, 'point')], hands: [[-4, -8], [1, 5]], hat: 2, ring: 1, stache: 'up', brow: 'stern', mouth: 'flat' }),
  apex: pose({ feet: [F(10, 28, 'point'), F(14, 25, 'point', [15, 22])], hands: [[-5, -1], [5, -2]], hat: 2, ring: 0, eyes: 'calm', brow: 'calm', mouth: 'smile', stache: 'up' }),
  fall0: pose({ feet: [F(9, 27, 'point'), F(14, 26, 'point')], hands: [[-4, -7], [5, 0]], hat: 2, ring: -1, stache: 'wind', brow: 'up', eyes: 'wide', mouth: 'oh' }),
  fall1: pose({ b: -1, feet: [F(10, 26, 'point'), F(14, 27, 'point')], hands: [[-6, -4], [5, 2]], hat: 2, ring: -2, stache: 'wind', brow: 'up', eyes: 'wide', mouth: 'oh' }),
  dash: pose({
    b: 1,
    lean: 2,
    hx: 1,
    feet: [F(4, 27, 'flat', [7, 26]), F(16, 28, 'flat', [17, 25])],
    hands: [[-3, -4], [7, -1]],
    tilt: -1,
    hatX: -1,
    ring: 0,
    stache: 'wind',
    brow: 'stern',
    eyes: 'squint',
    mouth: 'grit',
  }),
  land: pose({ b: 2, hipY: 1, feet: [F(8), F(15)], hands: [[-3, 3], [4, 3]], hat: -1, squash: 1, ring: 1, ringSquash: 1, eyes: 'shut', stache: 'down', mouth: 'flat' }),
  rebound: pose({ b: -1, feet: [F(11, 27, 'point'), F(13, 26, 'point')], hands: [[-5, -7], [6, -3]], hat: 2, ring: 2, stache: 'up', brow: 'up', eyes: 'happy', mouth: 'grin' }),
  fail: pose({
    b: 4,
    hipY: -1,
    lean: -1,
    feet: [F(16, 26, 'up', [14, 24]), F(18, 27, 'up', [15, 28])],
    hands: [[-4, 3], [3, 4]],
    hat: 2,
    hatX: -3,
    tilt: -2,
    ring: 0,
    stache: 'down',
    monocle: 'dangle',
    eyes: 'dizzy',
    mouth: 'wobble',
    stars: true,
  }),
  cheer0: pose({ hands: [[-4, -9], [5, -1]], hat: 2, hatX: -5, tilt: -1, stache: 'up', brow: 'up', eyes: 'happy', mouth: 'smile' }),
  cheer1: pose({ b: -1, feet: [F(10, 26, 'point'), F(13, 26, 'point')], hands: [[-5, -8], [5, 0]], hat: 2, hatX: -6, tilt: -2, ring: 1, stache: 'up', brow: 'up', eyes: 'happy', mouth: 'grin' }),
};

// Head under the hat: 10×7, origin = left of row 9 (row 0 hides under the
// brim). s/S skin, w crown shine, f/F silver fringe. Light from upper-left,
// so the face stays clean and only the jaw carries shadow.
const PUDDLE_HEAD = [
  '..ssssss..',
  '.swwsssss.',
  'ffssssssss',
  'fFsSssssss',
  'fFsSssssss',
  '.Fssssssss',
  '..SSSSsSS.',
];

/** Sel-out: contours crossing white underwear go soft lilac instead of ink. */
const PUDDLE_SEL: Record<string, string> = {
  [SP.under]: SP.underS,
  [SP.underS]: SP.underD,
};
/** Arms crossing the floatie get a soft gold contour instead of full ink. */
const PUDDLE_ARM_SEL: Record<string, string> = {
  ...PUDDLE_SEL,
  [SP.duck]: SP.duckS,
  [SP.duckHi]: SP.duckS,
  [SP.duckS]: SP.duckD,
};

function drawPuddlewick(p: Pix, q: Pose): void {
  const by = q.b;
  const tx = q.lean;
  const hox = 8 + tx + q.hx;
  const hoy = 9 + by + q.hy;
  const sy = 16 + by;
  const hipY = 25 + by + q.hipY;
  const hips: [Pt, Pt] = [
    [10 + tx * 0.5, hipY],
    [13 + tx * 0.5, hipY],
  ];
  const shoulders: [Pt, Pt] = [
    [9 + tx, sy + 1],
    [14 + tx, sy + 1],
  ];
  const cx = 11.5 + tx * 0.5;
  const cy = 20 + by + q.ring;
  const belowHip = (_x: number, y: number): boolean => y > hipY;

  inked(p, (l) => puddleArm(l, shoulders[0], q.hands[0], true));
  inked(p, (l) => puddleLeg(l, hips[0], q.feet[0], true), belowHip);
  floatieBack(p, cx, cy, q);

  // Chest: lean and dignified, a wisp of silver chest hair.
  for (let y = sy; y <= hipY - 4; y++) {
    for (let x = 9 + tx; x <= 14 + tx; x++) {
      if (y === sy && (x === 9 + tx || x === 14 + tx)) continue;
      p.px(x, y, x >= 13 + tx ? SP.skinS : SP.skin);
    }
  }
  p.px(11 + tx, sy + 1, SP.fringeS);
  // Plain, opaque, entirely respectable white underwear.
  for (let y = hipY - 3; y <= hipY; y++) {
    for (let x = Math.round(9 + tx * 0.5); x <= Math.round(14 + tx * 0.5); x++) {
      if (y === hipY && x === Math.round(11.5 + tx * 0.5)) continue;
      p.px(x, y, y === hipY || x === Math.round(14 + tx * 0.5) ? SP.underS : SP.under);
    }
  }
  inked(p, (l) => puddleLeg(l, hips[1], q.feet[1], false), belowHip, PUDDLE_SEL);

  // The floatie, then the duck's head rising from its prow.
  inked(p, (l) => floatieFront(l, cx, cy, q));
  inked(p, (l) => duckHead(l, Math.round(cx + 5), Math.round(cy) - 5, q));

  inked(p, (l) => puddleHead(l, q, hox, hoy, sy), (_x, y) => y < hoy + 7);
  inked(p, (l) => puddleArm(l, shoulders[1], q.hands[1], false), undefined, PUDDLE_ARM_SEL);
  topHat(p, q, hox + 4 + q.hatX, hoy - q.hat);
  if (q.monocle === 'pop') {
    // The monocle has leapt from its post and swings ahead on its chain.
    const m: Pt = [hox + 12, hoy];
    monocleRing(p, m, true);
    line1(p, [m[0] - 1, m[1] + 2], [hox + 9, hoy + 6], SP.monocleS);
  }
  if (q.stars) {
    const top = hoy - q.hat - 7;
    star(p, hox - 2, top + 2, ACCENT.gold, ACCENT.goldHi);
    star(p, hox + 11, top + 1, ACCENT.gold, ACCENT.goldHi);
  }

  p.outline(OUT);
}

function monocleRing(p: Pix, m: Pt, lens: boolean): void {
  p.px(m[0], m[1] - 1, SP.monocle);
  p.px(m[0] - 1, m[1], SP.monocle);
  p.px(m[0] + 1, m[1], SP.monocleS);
  p.px(m[0], m[1] + 1, SP.monocleS);
  if (lens) p.px(m[0], m[1], SP.lens);
}

function puddleHead(p: Pix, q: Pose, ox: number, oy: number, sy: number): void {
  stamp(p, ox, oy, PUDDLE_HEAD, { s: SP.skin, S: SP.skinS, w: SP.shine, f: SP.fringe, F: SP.fringeS });
  p.px(ox - 1, oy + 3, SP.fringe); // the fringe sticks out a touch
  // A noble nose.
  p.px(ox + 10, oy + 3, SP.skin);
  p.px(ox + 10, oy + 4, SP.nose);
  p.px(ox + 11, oy + 4, SP.nose);
  // Neck.
  p.rect(ox + 4, oy + 7, 3, Math.max(0, sy - oy - 7), SP.skinS);

  const ex = ox + 6;
  const ey = oy + 3;
  const e = SP.eye;
  // Brow (silver, bristling).
  const br = q.brow === 'up' && q.hat >= 1 ? ey - 3 : ey - 2;
  p.hline(ex - 1, ex + 1, br, SP.fringeS);
  if (q.brow === 'stern') p.px(ex + 1, br + 1, SP.fringeS);
  if (q.brow === 'up') p.px(ex - 2, br + 1, SP.fringeS);

  // Monocle chain first, so the moustache sits over it.
  if (q.monocle === 'on') line1(p, [ex - 1, ey + 2], [ex - 2, sy + 1], SP.monocleS);
  switch (q.eyes) {
    case 'blink':
    case 'calm':
      p.hline(ex - (q.eyes === 'calm' ? 1 : 0), ex, ey, SP.skinD);
      break;
    case 'shut':
      p.hline(ex - 1, ex + 1, ey, e);
      break;
    case 'happy':
      p.px(ex - 1, ey, e);
      p.px(ex, ey - 1, e);
      p.px(ex + 1, ey, e);
      break;
    case 'wide':
      p.rect(ex - 1, ey - 1, 2, 2, e);
      p.px(ex - 1, ey - 1, SP.white);
      break;
    case 'squint':
      p.hline(ex - 1, ex + 1, ey, e);
      p.px(ex + 1, ey - 1, e);
      break;
    case 'dizzy':
      p.px(ex - 1, ey - 1, e);
      p.px(ex + 1, ey - 1, e);
      p.px(ex, ey, e);
      p.px(ex - 1, ey + 1, e);
      p.px(ex + 1, ey + 1, e);
      break;
    default:
      p.px(ex, ey, e);
  }
  if (q.monocle === 'on' && q.eyes !== 'happy' && q.eyes !== 'dizzy') monocleRing(p, [ex, ey], false);
  else if (q.monocle === 'dangle') {
    monocleRing(p, [ox + 3, sy + 2], true);
    line1(p, [ox + 4, sy], [ox + 5, sy - 1], SP.monocleS);
  }

  // Handlebar moustache: bulk under the nose, waxed tips.
  const sx = ox + 7;
  const my = oy + 5;
  p.hline(sx, sx + 3, my, SP.stache);
  p.px(sx + 1, my, SP.stacheL);
  p.px(sx + 2, my, SP.stacheL);
  const tips: Record<Pose['stache'], Pt[]> = {
    rest: [[-1, 0], [-2, 0], [-3, -1], [4, 0], [5, -1]],
    twitch: [[-1, 0], [-2, -1], [-3, -2], [4, -1], [5, -2]],
    up: [[-1, 0], [-2, -1], [-2, -2], [4, 0], [5, -1], [5, -2]],
    down: [[-1, 0], [-2, 1], [-2, 2], [4, 1], [4, 2]],
    wind: [[-1, 0], [-2, 0], [-3, 0], [-4, -1], [4, -1], [3, -2]],
  };
  for (const [dx, dy] of tips[q.stache]) p.px(sx + dx, my + dy, SP.stache);
  const mo = my + 1;
  if (q.mouth === 'oh' || q.mouth === 'open') p.px(sx + 2, mo, e);
  if (q.mouth === 'grin') p.hline(sx + 1, sx + 2, mo, e);
  if (q.mouth === 'wobble') p.px(sx + 3, mo, e);
}

function topHat(p: Pix, q: Pose, cx: number, brim: number): void {
  const h = 6 - Math.max(0, q.squash);
  const shear = (y: number): number => Math.round((q.tilt * (brim - y)) / 6);
  for (let y = brim - h; y < brim; y++) {
    const top = y === brim - h;
    const x0 = cx - 3 - (top ? 1 : 0);
    const x1 = cx + 4 + (top ? 1 : 0);
    for (let x = x0; x <= x1; x++) {
      let c = SP.hat;
      if (top) c = SP.hatL;
      else if (x === x0 + 1) c = SP.hatL;
      else if (x === x1) c = SP.hatD;
      p.px(x - shear(y), y, c);
    }
  }
  // Red band with a tucked flower at the front.
  for (const [dy, c] of [
    [2, SP.band],
    [1, SP.bandS],
  ] as [number, string][]) {
    const y = brim - dy;
    p.hline(cx - 3 - shear(y), cx + 4 - shear(y), y, c);
  }
  const fy = brim - 3;
  const fx = cx + 3 - shear(fy);
  p.px(fx, fy - 1, SP.petal);
  p.px(fx - 1, fy, SP.petal);
  p.px(fx + 1, fy, SP.petal);
  p.px(fx, fy + 1, SP.petal);
  p.px(fx, fy, SP.centre);
  // Brim, curled up a touch at each end.
  const w = Math.max(0, q.squash);
  p.hline(cx - 5 - w, cx + 6 + w, brim, SP.hat);
  p.hline(cx - 3, cx + 1, brim, SP.hatL);
  p.px(cx - 6 - w, brim - 1, SP.hat);
  p.px(cx + 7 + w, brim - 1, SP.hatD);
}

const ringSize = (q: Pose): [number, number] => [6.9 + q.ringSquash, 2.4 - q.ringSquash * 0.4];

/** The far rim, peeking out above the near rim on either side of his waist. */
function floatieBack(p: Pix, cx: number, cy: number, q: Pose): void {
  const [rx, ry] = ringSize(q);
  p.ellipse(cx, cy - 0.9, rx - 0.6, ry, SP.duckD);
  // Tail feathers at the back.
  const tx = Math.round(cx - rx);
  const ty = Math.round(cy) - 2;
  p.px(tx - 1, ty, SP.duck);
  p.px(tx - 1, ty - 1, SP.duckHi);
  p.px(tx - 2, ty - 2, SP.duckHi);
  p.px(tx, ty, SP.duck);
}

function floatieFront(p: Pix, cx: number, cy: number, q: Pose): void {
  const [rx, ry] = ringSize(q);
  const top = Math.floor(cy - ry + 0.5);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      let c = SP.duck;
      if (ny > 0.45 || nx > 0.86) c = SP.duckS;
      else if (y <= top && nx < 0.45) c = SP.duckHi;
      p.px(x, y, c);
    }
  }
}

function duckHead(p: Pix, x: number, y: number, q: Pose): void {
  // A small, steadfast duck. Its eye widens when its gentleman's does.
  const alarmed = q.monocle === 'pop' || q.eyes === 'wide';
  stamp(p, x, y, ['.hd..', 'hdddb', 'dkddbb', 'dddd.', '.ds..'], {
    h: SP.duckHi,
    d: SP.duck,
    s: SP.duckS,
    k: SP.eye,
    b: SP.beak,
  });
  p.px(x + 4, y + 2, SP.beakS);
  p.px(x + 5, y + 2, SP.beakS);
  if (alarmed) p.px(x + 1, y + 1, SP.eye);
}

function puddleLeg(p: Pix, hip: Pt, f: Foot, far: boolean): void {
  const ankle: Pt = [f.x, f.y + 1];
  const knee = f.knee ?? joint(hip, ankle, 4.4, 1);
  const c = far ? SP.skinS : SP.skin;
  const s = far ? SP.skinD : SP.skinS;
  // Two-pixel spindly legs: lit front edge, shaded back edge.
  line1(p, hip, knee, s);
  line1(p, ankle, knee, s);
  line1(p, [hip[0] + 1, hip[1]], [knee[0] + 1, knee[1]], c);
  line1(p, [knee[0] + 1, knee[1]], [ankle[0] + 1, ankle[1]], c);
  // Bare foot.
  const x = Math.round(f.x);
  const y = Math.round(f.y) + 2;
  if (f.toe === 'point') {
    p.px(x + 1, y - 1, c);
    p.px(x + 2, y, c);
    p.px(x + 1, y, c);
  } else if (f.toe === 'up') {
    p.hline(x, x + 1, y, c);
    p.px(x + 2, y - 1, c);
    p.px(x + 3, y - 2, c);
  } else {
    p.hline(x, x + 3, y, c);
    p.px(x, y, s);
  }
}

function puddleArm(p: Pix, sh: Pt, rel: Pt, far: boolean): void {
  const hand = add(sh, rel);
  const elbow = joint(sh, hand, 7, -1);
  const c = far ? SP.skinS : SP.skin;
  line1(p, sh, elbow, c);
  line1(p, elbow, hand, c);
  p.rect(Math.round(hand[0]) - (rel[0] < 0 ? 1 : 0), Math.round(hand[1]), 2, 2, c);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CharacterSheet {
  id: CharacterId;
  frames: Map<string, Pix>;
}

export function buildCharacter(id: CharacterId): CharacterSheet {
  const frames = new Map<string, Pix>();
  const poses = id === 'poppy' ? POPPY : PUDDLE;
  for (const name of FRAME_NAMES) {
    const p = new Pix(FRAME_W, FRAME_H);
    (id === 'poppy' ? drawPoppy : drawPuddlewick)(p, poses[name] ?? BASE);
    frames.set(name, p);
  }
  return { id, frames };
}

export const CHARACTER_INFO: Record<CharacterId, { name: string; blurb: string; line: string }> = {
  poppy: {
    name: 'Poppy',
    blurb: 'Mushroom cap, flower-print flares, and a braid that never stops moving.',
    line: '“Maybe the sky just needs someone to sing first.”',
  },
  puddlewick: {
    name: 'Sir Puddlewick',
    blurb: 'Top hat, monocle, magnificent moustache, and a very dependable duck.',
    line: '“I have dressed appropriately for the altitude.”',
  },
};
