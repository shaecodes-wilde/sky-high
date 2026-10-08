import { FRAME_H, FRAME_NAMES, FRAME_W } from '../config/animation';
import { Pix } from './pixel';

// Both playable characters are drawn procedurally from a shared set of
// poses, so every frame shares scale, foot baseline and palette. Frames
// face right; the renderer mirrors them for leftward motion.

export type CharacterId = 'poppy' | 'puddlewick';

interface Limb {
  dx: number;
  /** Legs: foot lift off the ground. Arms: hand offset below the shoulder. */
  dy: number;
}

interface Pose {
  by: number;
  lean: number;
  legs: [Limb, Limb];
  arms: [Limb, Limb];
  hat: number;
  squash: number;
  /** Braid / moustache-tip angle from straight down, rotating backward (deg). */
  braid: number;
  flare: number;
  eyes: 'open' | 'closed' | 'happy' | 'wide' | 'squint' | 'dizzy';
  mouth: 'smile' | 'open' | 'flat';
  floatBob: number;
}

const L = (dx: number, dy: number): Limb => ({ dx, dy });

const BASE: Pose = {
  by: 0,
  lean: 0,
  legs: [L(-2, 0), L(2, 0)],
  arms: [L(-2, 5), L(2, 5)],
  hat: 0,
  squash: 0,
  braid: 15,
  flare: 0.4,
  eyes: 'open',
  mouth: 'smile',
  floatBob: 0,
};

function pose(p: Partial<Pose>): Pose {
  return { ...BASE, ...p };
}

function runPose(i: number): Pose {
  const a = (i / 6) * Math.PI * 2;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return pose({
    by: i % 3 === 0 ? 1 : 0,
    lean: 1,
    legs: [L(Math.round(-4 * s), Math.max(0, Math.round(-2.5 * c))), L(Math.round(4 * s), Math.max(0, Math.round(2.5 * c)))],
    arms: [L(Math.round(3 * s) - 1, 4), L(Math.round(-3 * s) + 1, 4)],
    braid: 70 + (i % 2) * 10,
    flare: 0.7,
    floatBob: i % 3 === 1 ? -1 : 0,
  });
}

const POSES: Record<string, Pose> = {
  idle0: pose({}),
  idle1: pose({ by: 1, arms: [L(-2, 4), L(2, 4)], floatBob: 1 }),
  idle2: pose({ eyes: 'closed' }),
  start: pose({ lean: 1, legs: [L(-4, 1), L(3, 0)], arms: [L(-4, 3), L(4, 3)], braid: 40 }),
  run0: runPose(0),
  run1: runPose(1),
  run2: runPose(2),
  run3: runPose(3),
  run4: runPose(4),
  run5: runPose(5),
  brake: pose({ lean: -1, legs: [L(-1, 0), L(5, 0)], arms: [L(-4, 2), L(-1, 0)], braid: -25, eyes: 'wide', mouth: 'open', floatBob: -1 }),
  jump: pose({ by: -1, legs: [L(-3, 4), L(2, 2)], arms: [L(-3, 1), L(3, -3)], hat: 2, braid: 30, flare: 1, mouth: 'open', floatBob: 1 }),
  apex: pose({ legs: [L(-2, 3), L(3, 4)], arms: [L(-4, 1), L(4, 0)], hat: 3, braid: 110, flare: 1, eyes: 'wide', floatBob: -1 }),
  fall0: pose({ legs: [L(-2, 1), L(2, 2)], arms: [L(-3, -1), L(4, -2)], hat: 1, braid: 150, flare: 0.9, mouth: 'open' }),
  fall1: pose({ legs: [L(-2, 2), L(2, 1)], arms: [L(-4, -2), L(4, -3)], hat: 2, braid: 160, flare: 0.9, mouth: 'open', floatBob: -1 }),
  dash: pose({ lean: 2, legs: [L(-5, 3), L(3, 3)], arms: [L(-5, 1), L(5, 0)], hat: 1, squash: -1, braid: 95, flare: 1, eyes: 'squint', mouth: 'flat' }),
  land: pose({ by: 2, squash: 1, legs: [L(-3, 0), L(3, 0)], arms: [L(-4, 3), L(4, 3)], braid: 20, flare: 0.8, floatBob: 1 }),
  rebound: pose({ by: -1, squash: -1, hat: 4, legs: [L(-1, 2), L(1, 3)], arms: [L(-1, -5), L(2, -5)], braid: 165, flare: 1, eyes: 'happy', mouth: 'open', floatBob: 1 }),
  fail: pose({ by: 1, legs: [L(-3, 0), L(3, 0)], arms: [L(-4, -2), L(4, -2)], hat: 3, braid: 60, eyes: 'dizzy', mouth: 'open' }),
  cheer0: pose({ arms: [L(-3, -6), L(3, -6)], hat: 2, eyes: 'happy', mouth: 'open' }),
  cheer1: pose({ by: 1, arms: [L(-4, -4), L(4, -4)], hat: 1, eyes: 'happy', mouth: 'open', floatBob: 1 }),
};

const GROUND = 30; // bottom row of the feet; row 31 holds the outline

// ── Poppy ──────────────────────────────────────────────────────────────────
const PO = {
  outline: '#2e1f35',
  skin: '#f3c6a0',
  skinS: '#d99a78',
  hair: '#7a4a2c',
  hairD: '#4f2e1c',
  hairL: '#a56a3d',
  cap: '#e2393f',
  capD: '#a8232f',
  capL: '#ff7466',
  spot: '#fff6ea',
  under: '#f2dcc0',
  shirt: '#fbf7f2',
  shirtS: '#d9cfe0',
  pants: '#e868b0',
  pantsD: '#b8458a',
  flowerY: '#ffd84a',
  flowerO: '#ff9a3c',
  shoe: '#6b3e26',
  shoeL: '#93603e',
  blush: '#f28aa0',
  eye: '#2e1f35',
  tie: '#ffd84a',
  petal: '#ffffff',
  leaf: '#5fb04a',
};

function drawPoppy(p: Pix, q: Pose): void {
  const lean = Math.round(q.lean);
  const hcx = 12 + lean;
  const hcy = 13 + q.by;
  const hipY = 22 + q.by;

  // Braid, trailing behind according to motion.
  const ang = (q.braid * Math.PI) / 180;
  const bx = -Math.sin(ang);
  const byy = Math.cos(ang);
  let x = hcx - 4;
  let y = hcy + 1;
  for (let i = 0; i < 10; i++) {
    const wob = i > 2 ? Math.sin(i * 1.3) * 0.4 : 0;
    const px = x + bx * i - byy * wob;
    const py = y + byy * i + bx * wob;
    const c = i === 7 ? PO.tie : i % 2 ? PO.hairD : PO.hair;
    p.rect(Math.round(px), Math.round(py), 2, 2, c);
    if (i === 9) p.px(Math.round(px + bx), Math.round(py + byy), PO.hairL);
  }

  // Back arm and leg.
  arm(p, hcx - 2, 18 + q.by, q.arms[0], PO.skinS, PO.shirtS);
  poppyLeg(p, 10, hipY, q.legs[0], q.flare, true);

  // Torso.
  p.rect(9 + lean, 17 + q.by, 7, 5, PO.shirt);
  p.hline(9 + lean, 15 + lean, 21 + q.by, PO.shirtS);
  p.px(15 + lean, 18 + q.by, PO.shirtS);
  p.rect(9, hipY, 6, 2, PO.pants);
  p.px(13, hipY, PO.shoeL); // belt buckle hint

  poppyLeg(p, 13, hipY, q.legs[1], q.flare, false);
  arm(p, hcx + 2, 18 + q.by, q.arms[1], PO.skin, PO.shirt);

  // Head.
  p.ellipse(hcx - 0.5, hcy + 0.5, 5, 4.6, PO.hair);
  p.ellipse(hcx + 1.2, hcy + 1.4, 3.7, 3.3, PO.skin);
  p.px(hcx - 2, hcy + 1, PO.hairD);
  p.px(hcx - 2, hcy + 2, PO.hair);
  p.hline(hcx - 1, hcx + 3, hcy - 2, PO.hair);
  p.px(hcx + 1, hcy - 1, PO.hair);
  p.px(hcx + 4, hcy - 1, PO.hairL);
  face(p, hcx + 3, hcy, q, PO.eye, PO.blush, PO.skinS);

  // Mushroom cap.
  const cy = 8 + q.by - q.hat;
  const rx = 9 + q.squash;
  const ry = 5.5 - q.squash * 0.8;
  p.ellipse(hcx, cy + 1, rx, ry, PO.cap, (_, yy) => yy <= cy + 1);
  p.hline(hcx - rx + 2, hcx + rx - 2, cy + 1, PO.capD);
  p.hline(hcx - rx + 3, hcx + rx - 3, cy + 2, PO.under);
  p.px(hcx - 4, cy - 3, PO.capL);
  p.px(hcx - 3, cy - 4, PO.capL);
  p.px(hcx - 5, cy - 2, PO.capL);
  const spots: [number, number, number][] = [
    [-5, -1, 2],
    [1, -3, 2],
    [5, -1, 1],
    [-1, 0, 1],
    [7, 0, 1],
  ];
  for (const [sx, sy, s] of spots) p.rect(hcx + sx, cy + sy, s, s === 2 ? 2 : 1, PO.spot);
  // Little flower on the side of the cap.
  const fx = hcx - 7;
  const fy = cy - 1;
  p.px(fx, fy - 1, PO.petal);
  p.px(fx - 1, fy, PO.petal);
  p.px(fx + 1, fy, PO.petal);
  p.px(fx, fy + 1, PO.petal);
  p.px(fx, fy, PO.flowerY);
  p.px(fx + 1, fy + 1, PO.leaf);

  p.outline(PO.outline);
}

function poppyLeg(p: Pix, hx: number, hipY: number, leg: Limb, flare: number, back: boolean): void {
  const footY = Math.max(hipY + 3, GROUND - leg.dy);
  const fx = hx + leg.dx;
  const base = back ? PO.pantsD : PO.pants;
  for (let y = hipY; y <= footY - 2; y++) {
    const t = (y - hipY) / Math.max(1, footY - 2 - hipY);
    const cx = hx + leg.dx * t;
    const half = 1 + flare * 1.6 * t * t;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      let c = base;
      if (!back && (x * 5 + y * 3) % 7 === 0) c = PO.flowerY;
      else if (!back && (x * 3 + y * 5) % 11 === 0) c = PO.flowerO;
      else if (y === footY - 2) c = PO.pantsD;
      p.px(x, y, c);
    }
  }
  p.rect(fx - 1, footY - 1, 4, 2, PO.shoe);
  p.px(fx - 1, footY - 1, PO.shoeL);
}

// ── Sir Puddlewick ─────────────────────────────────────────────────────────
const SP = {
  outline: '#2a1e2e',
  skin: '#f0c09a',
  skinS: '#cf9474',
  shine: '#fff0dc',
  hat: '#2f2433',
  hatL: '#5a4562',
  band: '#c03a44',
  monocle: '#f5c542',
  lens: '#d8f3ff',
  stache: '#5b3a26',
  stacheL: '#83573a',
  under: '#fbf8f2',
  underS: '#d7d0dc',
  duck: '#ffd23c',
  duckS: '#e3a21e',
  duckL: '#fff3a0',
  beak: '#f28a24',
  eye: '#2a1e2e',
  blush: '#ef9a8c',
  petal: '#ffffff',
  center: '#ffd84a',
};

function drawPuddlewick(p: Pix, q: Pose): void {
  const lean = Math.round(q.lean);
  const hcx = 12 + lean;
  const hcy = 13 + q.by;
  const hipY = 26 + q.by;
  const fb = q.floatBob;

  // Back limbs.
  arm(p, 10 + lean, 18 + q.by, q.arms[0], SP.skinS, SP.skinS);
  thinLeg(p, 10, hipY, q.legs[0], SP.skinS);

  // Torso and underwear.
  p.ellipse(11.5 + lean * 0.5, 21.5 + q.by, 4.6, 4.4, SP.skin);
  p.px(14 + lean, 22 + q.by, SP.skinS);
  p.px(14 + lean, 21 + q.by, SP.skinS);
  p.rect(8, 24 + q.by, 8, 3, SP.under);
  p.hline(8, 15, 26 + q.by, SP.underS);
  p.px(12, 26 + q.by, null);
  thinLeg(p, 13, hipY, q.legs[1], SP.skin);

  // Duck floatie.
  const ry = 22 + q.by + fb;
  p.ellipse(11.5, ry + 0.5, 7.4, 2.6, SP.duck);
  p.hline(6, 17, ry - 2, SP.duckL);
  p.hline(6, 17, ry + 2, SP.duckS);
  p.px(5, ry + 1, SP.duckS);
  p.px(18, ry + 1, SP.duckS);
  // Tail at the back, head at the front.
  p.px(4, ry - 2, SP.duck);
  p.px(3, ry - 3, SP.duckL);
  p.ellipse(18.5, ry - 2.5, 2.2, 2.2, SP.duck);
  p.px(18, ry - 4, SP.duckL);
  p.px(19, ry - 3, SP.eye);
  p.rect(21, ry - 2, 2, 1, SP.beak);
  p.px(21, ry - 1, SP.beak);

  arm(p, 13 + lean, 18 + q.by, q.arms[1], SP.skin, SP.skin);

  // Bald head.
  p.ellipse(hcx, hcy + 0.5, 4.6, 4.4, SP.skin);
  p.px(hcx - 1, hcy - 3, SP.shine);
  p.px(hcx - 2, hcy - 2, SP.shine);
  p.px(hcx - 3, hcy, SP.skinS);
  p.px(hcx - 3, hcy + 1, SP.skinS);
  p.px(hcx + 4, hcy + 1, SP.skinS); // nose
  p.px(hcx + 5, hcy + 1, SP.skin);

  // Eyes and monocle (on the front eye).
  const ex = hcx + 2;
  const ey = hcy;
  for (const [mx, my] of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ]) {
    p.px(ex + mx, ey + my, SP.monocle);
  }
  if (q.eyes === 'open' || q.eyes === 'wide' || q.eyes === 'squint') p.px(ex, ey, SP.eye);
  else p.px(ex, ey, SP.lens);
  // Monocle chain.
  p.px(ex + 1, ey + 3, SP.monocle);
  p.px(ex, ey + 5, SP.monocle);
  p.px(ex - 1, ey + 7, SP.monocle);
  p.px(hcx + 1, hcy + 1, SP.blush);

  // Handlebar moustache under the nose, tips fluttering with motion.
  const my = hcy + 2;
  p.hline(hcx + 1, hcx + 5, my, SP.stache);
  p.hline(hcx + 2, hcx + 4, my + 1, SP.stache);
  p.px(hcx + 3, my, SP.stacheL);
  const flutter = q.braid > 60 ? 1 : 0;
  const up = q.braid > 130 ? -1 : 0;
  p.px(hcx, my - 1 + flutter, SP.stache);
  p.px(hcx - 1, my - 2 + flutter * 2 + up, SP.stache);
  p.px(hcx + 6, my - 1, SP.stache);
  p.px(hcx + 7, my - 2 + up, SP.stache);
  if (q.mouth === 'open') p.px(hcx + 3, my + 2, SP.eye);

  // Top hat (floats up during jumps).
  const hb = 9 + q.by - q.hat; // brim row
  const crownTop = 1 + q.by - q.hat + (q.squash > 0 ? 1 : 0) - (q.squash < 0 ? 1 : 0);
  p.rect(hcx - 4, crownTop, 8, hb - crownTop, SP.hat);
  p.hline(hcx - 4, hcx + 3, crownTop, SP.hatL);
  for (let yy = crownTop + 1; yy < hb - 1; yy++) p.px(hcx - 3, yy, SP.hatL);
  p.hline(hcx - 4, hcx + 3, hb - 3, SP.band);
  p.hline(hcx - 4, hcx + 3, hb - 2, SP.band);
  p.hline(hcx - 6 - Math.max(0, q.squash), hcx + 5 + Math.max(0, q.squash), hb, SP.hat);
  p.hline(hcx - 5, hcx + 4, hb - 1, SP.hat);
  // A little flower tucked in the band.
  p.px(hcx + 2, hb - 3, SP.petal);
  p.px(hcx + 1, hb - 2, SP.petal);
  p.px(hcx + 3, hb - 2, SP.petal);
  p.px(hcx + 2, hb - 2, SP.center);

  p.outline(SP.outline);
}

function thinLeg(p: Pix, hx: number, hipY: number, leg: Limb, c: string): void {
  const footY = Math.max(hipY + 2, GROUND - leg.dy);
  const fx = hx + leg.dx;
  p.line(hx, hipY, fx, footY - 1, c, 2);
  p.hline(fx - 1, fx + 2, footY, c);
  p.px(fx + 2, footY - 1, c);
}

function arm(p: Pix, sx: number, sy: number, a: Limb, skin: string, sleeve: string): void {
  const hx = sx + a.dx;
  const hy = sy + a.dy;
  p.line(sx, sy, hx, hy, skin, 1);
  p.px(sx, sy, sleeve);
  p.rect(hx, hy, 2, 2, skin);
}

function face(p: Pix, ex: number, ey: number, q: Pose, eye: string, blush: string, shade: string): void {
  switch (q.eyes) {
    case 'closed':
      p.hline(ex - 1, ex, ey + 1, eye);
      break;
    case 'happy':
      p.px(ex - 1, ey + 1, eye);
      p.px(ex, ey, eye);
      p.px(ex + 1, ey + 1, eye);
      break;
    case 'wide':
      p.rect(ex, ey - 1, 1, 3, eye);
      break;
    case 'squint':
      p.hline(ex - 1, ex + 1, ey, eye);
      p.px(ex, ey + 1, eye);
      break;
    case 'dizzy':
      p.px(ex - 1, ey - 1, eye);
      p.px(ex + 1, ey + 1, eye);
      p.px(ex, ey, eye);
      break;
    default:
      p.rect(ex, ey, 1, 2, eye);
  }
  p.px(ex + 1, ey + 2, blush);
  if (q.mouth === 'open') p.px(ex, ey + 3, eye);
  else if (q.mouth === 'smile') p.px(ex, ey + 3, shade);
}

export interface CharacterSheet {
  id: CharacterId;
  frames: Map<string, Pix>;
}

export function buildCharacter(id: CharacterId): CharacterSheet {
  const frames = new Map<string, Pix>();
  for (const name of FRAME_NAMES) {
    const p = new Pix(FRAME_W, FRAME_H);
    (id === 'poppy' ? drawPoppy : drawPuddlewick)(p, POSES[name]);
    frames.set(name, p);
  }
  return { id, frames };
}

export const CHARACTER_INFO: Record<CharacterId, { name: string; blurb: string; line: string }> = {
  poppy: {
    name: 'Poppy',
    blurb: 'Mushroom cap, flower-power flares, a braid that never stops moving.',
    line: '“Maybe the sky just needs someone to sing first.”',
  },
  puddlewick: {
    name: 'Sir Puddlewick',
    blurb: 'Top hat, monocle, handlebar moustache, and a very dependable duck.',
    line: '“I have dressed appropriately for the altitude.”',
  },
};
