import { drawText, Pix, rng, textWidth } from './pixel';

// Environment pixel art, generated at load time on an integer grid. Every
// standable surface's top texel row lines up exactly with its collider top.

export const PAL = {
  outline: '#2e2440',
  cloudTop: '#ffffff',
  cloud: '#f6f0ff',
  cloudS1: '#e3d8f8',
  cloudS2: '#c7b8ee',
  cloudS3: '#a493d8',
  cloudLine: '#8573c0',
  grassL: '#b8ee6c',
  grass: '#7fcf52',
  grassD: '#4f9c3f',
  grassDD: '#367238',
  rockL: '#a191ad',
  rock: '#7d6c8b',
  rockD: '#5a4b68',
  rockDD: '#3f3350',
  moss: '#6aa94a',
  mist: '#cbbcef',
  petal: '#ff9fd0',
  petalL: '#ffd6eb',
  petalD: '#e0659f',
  petalDD: '#b84a83',
  gold: '#ffd447',
  goldL: '#fff3a8',
  goldD: '#e09a24',
  goldDD: '#a8641c',
  dew: '#86f0ff',
  dewL: '#e8fdff',
  dewD: '#3cbfe0',
  dewDD: '#2a86b8',
  ink: '#3a2350',
  inkL: '#6a3f8a',
  inkGlint: '#ff86c2',
  wood: '#a8774a',
  woodL: '#c9975e',
  woodD: '#76502f',
  cap: '#e2393f',
  capD: '#a8232f',
  capL: '#ff7466',
  spot: '#fff6ea',
  stem: '#f6e6cc',
  stemD: '#d7bf9a',
  leaf: '#5fb04a',
};

// ── Platforms ────────────────────────────────────────────────────────────
export function drawCloud(w: number, recovery: boolean, seed: number): Pix {
  const below = 14;
  const h = 8 + below;
  const p = new Pix(w, h);
  const r = rng(seed * 7919 + w);
  // Scalloped underside: overlapping puffs, inset so the silhouette never exceeds the collider width.
  const puffs: [number, number, number][] = [];
  for (let x = 6; x < w - 4; x += 8 + Math.floor(r() * 6)) puffs.push([x, 7 + r() * 3, 4 + r() * 4]);
  puffs.push([w - 6, 7 + r() * 2, 4]);
  for (const [cx, cy, rad] of puffs) p.ellipse(cx, cy, Math.min(rad + 1, cx, w - cx), rad, PAL.cloudS2);
  for (const [cx, cy, rad] of puffs) p.ellipse(cx, cy - 1, Math.min(rad, cx - 1, w - cx - 1), rad - 1, PAL.cloudS1);
  // Firm top band.
  p.rect(0, 0, w, 7, PAL.cloud);
  p.rect(1, 5, w - 2, 2, PAL.cloudS1);
  p.hline(0, w - 1, 0, PAL.cloudTop);
  p.hline(1, w - 2, 1, PAL.cloudTop);
  // Round the top corners a touch below the surface line only.
  p.px(0, 6, null);
  p.px(w - 1, 6, null);
  // Little puffs of texture.
  for (let i = 0; i < w / 14; i++) {
    const x = 3 + Math.floor(r() * (w - 8));
    p.hline(x, x + 2, 3, PAL.cloudS1);
  }
  // Outline the sides and underside but leave the surface line crisp.
  outlineExceptTop(p, PAL.cloudLine);
  if (recovery) dim(p, 0.82, [205, 190, 240]);
  return p;
}

export function drawIsland(w: number, h: number, seed: number): Pix {
  const p = new Pix(w, h);
  const r = rng(seed * 104729 + w);
  // Rock body with stones.
  p.rect(0, 0, w, h, PAL.rock);
  for (let y = 8; y < h; y += 6) {
    let x = (y / 6) % 2 ? -4 : 0;
    while (x < w) {
      const sw = 7 + Math.floor(r() * 7);
      p.hline(x + 1, x + sw - 1, y, PAL.rockL);
      p.hline(x, x + sw - 1, y + 5, PAL.rockD);
      p.px(x + sw - 1, y + 1, PAL.rockD);
      p.px(x + sw - 1, y + 2, PAL.rockD);
      p.px(x + sw - 1, y + 3, PAL.rockD);
      p.px(x + sw - 1, y + 4, PAL.rockD);
      if (r() < 0.25) p.px(x + 2 + Math.floor(r() * (sw - 3)), y + 2 + Math.floor(r() * 2), PAL.rockDD);
      x += sw;
    }
  }
  // Edge shading.
  for (let y = 0; y < h; y++) {
    p.px(0, y, PAL.rockD);
    p.px(1, y, PAL.rockL);
    p.px(w - 1, y, PAL.rockDD);
    p.px(w - 2, y, PAL.rockD);
  }
  // Grass cap (row 0 = collider top) with tufts hanging over the rock face.
  p.rect(0, 0, w, 5, PAL.grass);
  p.hline(0, w - 1, 0, PAL.grassL);
  p.hline(0, w - 1, 1, PAL.grassL);
  for (let x = 0; x < w; x++) {
    const hang = 5 + Math.floor(r() * 3) + (r() < 0.12 ? 3 : 0);
    for (let y = 4; y < hang; y++) p.px(x, y, y === hang - 1 ? PAL.grassDD : PAL.grassD);
    if (r() < 0.3) p.px(x, 2, PAL.grassL);
  }
  // Hanging vines.
  for (let i = 0; i < w / 40; i++) {
    const x = 4 + Math.floor(r() * (w - 8));
    const len = 8 + Math.floor(r() * 18);
    for (let y = 6; y < 6 + len; y++) p.px(x + (Math.floor(y / 5) % 2), y, y % 4 === 0 ? PAL.grass : PAL.moss);
  }
  // Fade into the lower mist.
  for (let y = Math.max(0, h - 40); y < h; y++) {
    const t = (y - (h - 40)) / 40;
    for (let x = 0; x < w; x++) if ((x * 7 + y * 3) % 5 < t * 6) p.px(x, y, PAL.mist);
  }
  // Dark outline on the sides only (top edge stays the grass line).
  for (let y = 2; y < h - 40; y++) {
    p.px(0, y, PAL.outline);
    p.px(w - 1, y, PAL.outline);
  }
  return p;
}

export function drawPetal(w: number, ghost: boolean): Pix {
  const h = 12;
  const p = new Pix(w, h);
  p.ellipse(w / 2, 2.5, w / 2, 6, PAL.petal, (_, y) => y >= 0);
  p.ellipse(w / 2, 2, w / 2 - 3, 3, PAL.petalL, (_, y) => y >= 0);
  p.hline(0, w - 1, 0, PAL.petalL);
  for (let x = 4; x < w - 4; x += 6) p.px(x, 4, PAL.petalD);
  p.hline(w / 2 - 6, w / 2 + 6, 6, PAL.petalD);
  outlineExceptTop(p, PAL.petalDD);
  if (ghost) {
    // Telegraph: a dotted silhouette only.
    const out = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.opaque(x, y) && (!p.opaque(x, y + 1) || y === 0) && (x + y) % 3 === 0) out.px(x, y, '#fff2fa');
    return out;
  }
  return p;
}

export function drawGoalFlower(w: number): Pix {
  const h = 46;
  const p = new Pix(w, h);
  // Drooping petals beneath the flat flower head.
  for (let i = 0; i < 9; i++) {
    const cx = (w * (i + 0.5)) / 9;
    p.ellipse(cx, 10, w / 14, 14 + (i % 2) * 4, i % 2 ? PAL.petalD : PAL.petal);
  }
  p.rect(w / 2 - 4, 18, 8, h - 18, PAL.leaf);
  p.rect(w / 2 - 2, 18, 2, h - 18, '#8ad46a');
  p.rect(0, 0, w, 7, PAL.gold);
  p.hline(0, w - 1, 0, PAL.goldL);
  p.hline(0, w - 1, 1, PAL.goldL);
  for (let x = 3; x < w - 3; x += 5) p.px(x, 4, PAL.goldD);
  p.hline(2, w - 3, 6, PAL.goldD);
  outlineExceptTop(p, PAL.petalDD);
  return p;
}

// ── Interactive objects ──────────────────────────────────────────────────
/** 22×16, anchored at the ground; at rest the cap's top row is the bounce surface (12px up). */
export function drawSpring(squash: -1 | 0 | 1): Pix {
  const p = new Pix(22, 16);
  const capH = squash === 1 ? 5 : 6;
  const off = squash === 1 ? 6 : squash === -1 ? 2 : 4; // rest: cap top exactly on the bounce surface
  const capW = squash === 1 ? 11 : squash === -1 ? 9 : 10;
  const top = off;
  p.ellipse(11, top + capH, capW, capH, PAL.cap, (_, y) => y < top + capH);
  p.hline(11 - capW + 2, 11 + capW - 2, top + capH - 1, PAL.capD);
  p.px(7, top + 1, PAL.capL);
  p.px(6, top + 2, PAL.capL);
  p.rect(9, top + 1, 2, 2, PAL.spot);
  p.rect(14, top + 2, 2, 2, PAL.spot);
  p.px(4, top + 3, PAL.spot);
  p.px(17, top + 3, PAL.spot);
  p.rect(8, top + capH, 6, 16 - top - capH, PAL.stem);
  p.rect(12, top + capH, 2, 16 - top - capH, PAL.stemD);
  p.hline(7, 14, 15, PAL.stemD);
  p.outline(PAL.outline);
  return p;
}

export function drawRing(armed: boolean, phase: number): Pix {
  const p = new Pix(20, 20);
  const cx = 10;
  const cy = 10;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > 6 && d <= 8.6) {
        const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const lit = Math.sin(a * 2 + phase) > 0.4;
        let c = d > 7.8 ? PAL.dewDD : lit ? PAL.dewL : PAL.dew;
        if (!armed) c = d > 7.8 ? '#7d8fb8' : '#b8c8e8';
        p.px(x, y, c);
      }
    }
  }
  if (armed) {
    // Teardrop sparkle in the middle.
    p.px(10, 7, PAL.dewL);
    p.rect(9, 8, 2, 3, PAL.dew);
    p.px(9, 8, PAL.dewL);
  }
  return p;
}

export function drawThistles(w: number, seed: number): Pix {
  const h = 14;
  const p = new Pix(w + 2, h);
  const r = rng(seed * 31 + w);
  for (let cx = 5; cx <= w - 3; cx += 8) {
    const cy = 8 + Math.floor(r() * 2);
    p.rect(cx, cy + 2, 1, h - cy - 2, PAL.grassDD);
    p.ellipse(cx + 0.5, cy, 3.6, 3.4, PAL.ink);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r() * 0.3;
      p.px(cx + Math.round(Math.cos(a) * 5), cy + Math.round(Math.sin(a) * 5), PAL.inkL);
    }
    p.px(cx - 1, cy - 1, PAL.inkL);
    p.px(cx + 1, cy - 2, PAL.inkGlint);
  }
  p.outline(PAL.outline);
  return p;
}

export function drawSeed(frame: number): Pix {
  const p = new Pix(8, 8);
  const widths = [3.5, 2.6, 1.2, 2.6];
  const rx = widths[frame % 4];
  p.ellipse(4, 4, rx, 3.5, PAL.goldD);
  p.ellipse(4, 4, Math.max(0.6, rx - 1), 2.5, PAL.gold);
  if (rx > 2) p.px(3, 2, PAL.goldL);
  p.outline(PAL.goldDD);
  return p;
}

export function drawFragment(): Pix {
  const p = new Pix(18, 20);
  // Soft dithered halo.
  p.ellipse(9, 10, 8.5, 9.5, PAL.goldL);
  const halo = new Pix(18, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 18; x++) if (p.opaque(x, y) && (x + y) % 2 === 0) halo.px(x, y, [255, 243, 168, 150]);
  // A music note.
  halo.ellipse(6.5, 14.5, 3, 2.5, PAL.gold);
  halo.rect(8, 4, 2, 11, PAL.gold);
  halo.rect(10, 4, 3, 2, PAL.gold);
  halo.rect(12, 6, 2, 2, PAL.gold);
  halo.px(5, 13, PAL.goldL);
  halo.px(8, 5, PAL.goldL);
  const out = new Pix(18, 20);
  out.blit(halo, 0, 0);
  // Outline only the note, not the halo.
  const note = new Pix(18, 20);
  note.ellipse(6.5, 14.5, 3, 2.5, PAL.gold);
  note.rect(8, 4, 2, 11, PAL.gold);
  note.rect(10, 4, 3, 2, PAL.gold);
  note.rect(12, 6, 2, 2, PAL.gold);
  note.px(5, 13, PAL.goldL);
  note.px(8, 5, PAL.goldL);
  note.px(7, 15, PAL.goldD);
  note.outline(PAL.goldDD);
  out.blit(note, 0, 0);
  return out;
}

export function drawKeepsake(icon: 'teacup' | 'feather' | 'watch'): Pix {
  const p = new Pix(14, 14);
  if (icon === 'teacup') {
    p.rect(2, 5, 8, 5, '#fff6ea');
    p.rect(3, 10, 6, 1, '#fff6ea');
    p.hline(2, 9, 5, '#9fd7ff');
    p.rect(10, 6, 2, 3, '#fff6ea');
    p.px(11, 7, null);
    p.hline(1, 11, 12, '#e8c8f0');
    p.px(5, 7, PAL.petal);
    p.px(7, 8, PAL.petal);
  } else if (icon === 'feather') {
    p.line(3, 12, 10, 2, '#fff8c8', 2);
    p.line(4, 11, 11, 3, PAL.gold, 1);
    p.line(2, 13, 4, 11, PAL.goldD, 1);
  } else {
    p.ellipse(7, 8, 5, 5, PAL.gold);
    p.ellipse(7, 8, 3.6, 3.6, '#fff6ea');
    p.rect(6, 1, 2, 2, PAL.gold);
    p.px(7, 6, PAL.outline);
    p.px(7, 7, PAL.outline);
    p.px(8, 8, PAL.outline);
  }
  p.outline(PAL.outline);
  return p;
}

/** Checkpoint flower: a sleeping bud that blooms when reached. */
export function drawCheckpoint(open: boolean): Pix {
  const p = new Pix(16, 28);
  p.rect(7, 10, 2, 18, PAL.leaf);
  p.ellipse(4, 20, 3, 1.6, PAL.leaf);
  p.ellipse(12, 16, 3, 1.6, PAL.leaf);
  if (!open) {
    p.ellipse(8, 7, 3.5, 5, '#b9a2e6');
    p.ellipse(8, 6, 2, 3.5, '#d6c6f7');
    p.px(8, 1, '#d6c6f7');
  } else {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.ellipse(8 + Math.cos(a) * 4, 7 + Math.sin(a) * 4, 2.8, 2.8, k % 2 ? PAL.petal : PAL.petalL);
    }
    p.ellipse(8, 7, 2.5, 2.5, PAL.gold);
    p.px(7, 6, PAL.goldL);
  }
  p.outline(PAL.outline);
  return p;
}

export function drawSign(text: string): Pix {
  const lines = text.split('\n');
  const tw = Math.max(...lines.map(textWidth));
  const w = tw + 10;
  const bh = lines.length * 6 + 7;
  const h = bh + 12;
  const p = new Pix(w, h);
  p.rect(w / 2 - 1, bh, 3, h - bh, PAL.woodD);
  p.rect(1, 1, w - 2, bh - 2, PAL.wood);
  p.hline(1, w - 2, 1, PAL.woodL);
  p.hline(1, w - 2, bh - 2, PAL.woodD);
  for (let y = 4; y < bh - 3; y += 4) if (y % 8 === 0) p.hline(3, w - 4, y, '#b5845a');
  p.outline(PAL.outline);
  drawText(p, text, w / 2, 4, '#4a2e1c', 'center');
  return p;
}

export function drawFlower(v: number, stage: 0 | 1 | 2): Pix {
  const p = new Pix(9, 11);
  const colors = [
    [PAL.petal, PAL.petalL],
    ['#fff6ea', '#ffffff'],
    [PAL.gold, PAL.goldL],
    ['#a9b8ff', '#dfe4ff'],
    ['#ff9a6a', '#ffd0b8'],
  ];
  const [c, l] = colors[v % colors.length];
  const stemH = 4 + (v % 3);
  p.rect(4, 11 - stemH, 1, stemH, PAL.grassD);
  if (v % 2) p.px(5, 9, PAL.grass);
  const cy = 10 - stemH;
  if (stage === 0) {
    p.rect(4, cy - 1, 1, 2, c);
    p.px(4, cy - 2, PAL.grassD);
  } else if (stage === 1) {
    p.rect(3, cy - 1, 3, 2, c);
    p.px(4, cy - 2, l);
  } else {
    p.px(4, cy - 2, c);
    p.px(2, cy, c);
    p.px(6, cy, c);
    p.px(4, cy + 1, c);
    p.rect(3, cy - 1, 3, 2, l);
    p.px(4, cy, PAL.gold);
  }
  p.outline(PAL.outline);
  return p;
}

export function drawTuft(v: number): Pix {
  const p = new Pix(8, 6);
  p.px(1, 5, PAL.grassD);
  p.px(2, 4, PAL.grass);
  p.px(3, 3 + (v % 2), PAL.grass);
  p.px(4, 5, PAL.grassD);
  p.px(5, 3, PAL.grassL);
  p.px(6, 4, PAL.grass);
  p.px(3, 5, PAL.grassD);
  p.px(5, 5, PAL.grassD);
  p.px(2, 5, PAL.grassD);
  return p;
}

/** Decorative (non-bouncy) mushrooms are pastel blue/lilac so they never read as springcaps. */
export function drawDecorMushroom(v: number): Pix {
  const p = new Pix(18, 22);
  const cap = v % 2 ? '#9fb4ff' : '#c49cf0';
  const capL = v % 2 ? '#d6e0ff' : '#e6d0ff';
  p.rect(7, 8, 4, 14, PAL.stem);
  p.rect(9, 8, 2, 14, PAL.stemD);
  p.ellipse(9, 8, 8, 6, cap, (_, y) => y <= 8);
  p.hline(3, 15, 8, capL);
  p.px(6, 4, capL);
  p.px(11, 3, capL);
  p.px(13, 6, capL);
  p.outline(PAL.outline);
  return p;
}

export function drawLamp(lit: boolean): Pix {
  const p = new Pix(10, 34);
  p.rect(4, 8, 2, 26, '#4a3c5a');
  p.rect(2, 2, 6, 7, '#4a3c5a');
  p.rect(3, 3, 4, 5, lit ? '#ffe28a' : '#8f7fa8');
  if (lit) p.px(4, 4, '#fffbe0');
  p.hline(1, 8, 1, '#4a3c5a');
  p.hline(3, 6, 33, '#4a3c5a');
  p.outline(PAL.outline);
  return p;
}

export function drawCloudFace(awake: boolean): Pix {
  const p = new Pix(14, 7);
  const c = '#8573c0';
  if (awake) {
    p.rect(2, 1, 2, 2, c);
    p.rect(10, 1, 2, 2, c);
    p.px(2, 1, '#ffffff');
    p.px(10, 1, '#ffffff');
    p.hline(5, 8, 5, c);
    p.px(4, 4, c);
    p.px(9, 4, c);
    p.px(1, 4, '#ffc2dc');
    p.px(12, 4, '#ffc2dc');
  } else {
    p.hline(1, 3, 2, c);
    p.hline(10, 12, 2, c);
    p.hline(6, 7, 5, c);
  }
  return p;
}

/** The giant cloud flower that opens during the Petal Parade (open: 0..1). */
export function drawGiantFlower(open: number): Pix {
  const S = 128;
  const p = new Pix(S, S);
  const cx = S / 2;
  const cy = S / 2;
  const petals = 10;
  const len = 14 + open * 38;
  const wid = 6 + open * 9;
  const rot = open * 0.6;
  for (let layer = 0; layer < 2; layer++) {
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2 + rot + layer * (Math.PI / petals);
      const L = len * (layer ? 0.72 : 1);
      const W = wid * (layer ? 0.8 : 1);
      const px = cx + Math.cos(a) * L * 0.55;
      const py = cy + Math.sin(a) * L * 0.55;
      for (let y = Math.floor(py - L); y <= py + L; y++) {
        for (let x = Math.floor(px - L); x <= px + L; x++) {
          const dx = x + 0.5 - px;
          const dy = y + 0.5 - py;
          const u = (dx * Math.cos(a) + dy * Math.sin(a)) / (L * 0.55);
          const v = (-dx * Math.sin(a) + dy * Math.cos(a)) / W;
          if (u * u + v * v <= 1) {
            const edge = u * u + v * v > 0.7;
            p.px(x, y, layer ? (edge ? PAL.petal : PAL.petalL) : edge ? PAL.petalD : PAL.petal);
          }
        }
      }
    }
  }
  p.ellipse(cx, cy, 9 + open * 4, 9 + open * 4, PAL.gold);
  p.ellipse(cx - 2, cy - 2, 4 + open * 2, 4 + open * 2, PAL.goldL);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    p.px(cx + Math.cos(a) * (7 + open * 3), cy + Math.sin(a) * (7 + open * 3), PAL.goldD);
  }
  if (open < 0.05) {
    // Closed bud: wrap it in sepals.
    p.ellipse(cx, cy + 8, 14, 16, '#8fd06a', (_, y) => y > cy);
  }
  p.outline(PAL.petalDD);
  return p;
}

export function drawSun(awake: number): Pix {
  const S = 112;
  const p = new Pix(S, S);
  const c = S / 2;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const L = k % 2 ? 50 : 44;
    p.line(c + Math.cos(a) * 32, c + Math.sin(a) * 32, c + Math.cos(a) * L, c + Math.sin(a) * L, k % 2 ? '#ffd27a' : '#ffb870', 3);
  }
  p.ellipse(c, c, 32, 32, '#ffc85a');
  p.ellipse(c, c, 29, 29, '#ffdc78');
  p.ellipse(c - 7, c - 9, 12, 10, '#ffeaa8');
  const eye = '#8a4a2a';
  if (awake < 0.5) {
    p.line(c - 16, c, c - 6, c + 2, eye, 2);
    p.line(c + 6, c + 2, c + 16, c, eye, 2);
    p.ellipse(c, c + 13, 3, 2, '#e88a5a');
  } else {
    p.ellipse(c - 11, c, 3, 4, eye);
    p.ellipse(c + 11, c, 3, 4, eye);
    p.px(c - 12, c - 2, '#ffffff');
    p.px(c + 10, c - 2, '#ffffff');
    for (let x = -7; x <= 7; x++) p.px(c + x, c + 10 + Math.round((x * x) / 14), eye);
  }
  p.ellipse(c - 20, c + 8, 4, 2.5, '#ff9a8a');
  p.ellipse(c + 20, c + 8, 4, 2.5, '#ff9a8a');
  p.outline('#d9823e');
  return p;
}

export function drawBubble(text: string): Pix {
  const lines = text.split('\n');
  const w = Math.max(...lines.map(textWidth)) + 10;
  const bh = lines.length * 6 + 7;
  const p = new Pix(w, bh + 5);
  p.rect(1, 0, w - 2, bh, '#fffaf2');
  p.rect(0, 1, w, bh - 2, '#fffaf2');
  p.px(8, bh, '#fffaf2');
  p.px(9, bh, '#fffaf2');
  p.px(8, bh + 1, '#fffaf2');
  p.px(7, bh + 2, '#fffaf2');
  p.outline('#6a5a8e');
  drawText(p, text, w / 2, 4, '#4a3c6a', 'center');
  return p;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function outlineExceptTop(p: Pix, c: string): void {
  const add: [number, number][] = [];
  for (let y = 1; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.opaque(x, y)) continue;
      if (p.opaque(x - 1, y) || p.opaque(x + 1, y) || p.opaque(x, y - 1)) add.push([x, y]);
    }
  }
  for (const [x, y] of add) p.px(x, y, c);
  // Edge columns of opaque pixels become outline (keeps the silhouette within width).
  for (let y = 2; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!p.opaque(x, y)) continue;
      if (x === 0 || x === p.w - 1) p.px(x, y, c);
    }
  }
}

function dim(p: Pix, k: number, toward: [number, number, number]): void {
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] === 0) continue;
    for (let j = 0; j < 3; j++) p.data[i + j] = p.data[i + j] * k + toward[j] * (1 - k);
  }
}
