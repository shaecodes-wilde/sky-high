import { ACCENT, CLOUD, EARTH, INK, PAPER, SKY } from './palette';
import { drawText, hex, Pix, rng, textWidth, type RGBA } from './pixel';

// Environment pixel art — "Skyprint Folklore" (docs/ART_BIBLE.md).
//
// Everything is carved, not airbrushed: flat ink plates, a groove + lit lip
// for every engraving, and the unfurling curl as the recurring motif.
// Generated once at load on an integer grid. Every standable surface's top
// texel row lines up exactly with its collider top, is continuous, and is
// the brightest flat value of that sprite; nothing decorative sits above it
// or beyond the collider's x-extent.

/** Legacy names, now mapped onto the shared tokens in palette.ts. */
export const PAL = {
  outline: INK.line,
  cloudTop: PAPER.cream,
  cloud: CLOUD.hi,
  cloudS1: CLOUD.light,
  cloudS2: CLOUD.mid,
  cloudS3: CLOUD.low,
  cloudLine: CLOUD.groove,
  grassL: EARTH.meadowHi,
  grass: EARTH.meadow,
  grassD: EARTH.meadowMid,
  grassDD: EARTH.meadowLow,
  rockL: EARTH.stoneHi,
  rock: EARTH.stone,
  rockD: EARTH.stoneMid,
  rockDD: EARTH.stoneLow,
  moss: EARTH.meadowMid,
  mist: CLOUD.mid,
  petal: ACCENT.petal,
  petalL: ACCENT.petalHi,
  petalD: ACCENT.petalLo,
  petalDD: ACCENT.petalDeep,
  gold: ACCENT.gold,
  goldL: ACCENT.goldHi,
  goldD: ACCENT.goldLo,
  goldDD: ACCENT.goldDeep,
  dew: ACCENT.mint,
  dewL: ACCENT.mintHi,
  dewD: ACCENT.mintLo,
  dewDD: ACCENT.mintDeep,
  ink: INK.ink,
  inkL: INK.soft,
  inkGlint: ACCENT.sting,
  wood: EARTH.root,
  woodL: PAPER.shade,
  woodD: mix(EARTH.root, EARTH.stoneLow, 0.5),
  cap: ACCENT.coral,
  capD: ACCENT.coralLo,
  capL: ACCENT.coralHi,
  spot: PAPER.cream,
  stem: PAPER.butter,
  stemD: PAPER.shade,
  leaf: EARTH.meadowMid,
};

// Derived inks (always mixed from tokens, never invented).
const BLUE = { hi: mix(CLOUD.hi, SKY.zenith, 0.05), mid: mix('#a9bcf2', CLOUD.light, 0.35), lo: mix('#8797d6', CLOUD.low, 0.4) };
const COOL = (c: string) => mix(c, '#8d9ad8', 0.32);
const GREY_LILAC = { hi: mix(CLOUD.light, '#b9bccc', 0.5), lo: mix(CLOUD.low, '#7d8199', 0.5) };

// ── Platforms ────────────────────────────────────────────────────────────

/**
 * Carved cloud (one-way). w × 22, row 0 = collider top.
 * Flat cream lip (the brightest value in the scene), lilac belly of
 * scalloped lobes engraved with curls and concentric gouges. Recovery clouds
 * print one step lower and cooler with a thinner lip highlight.
 */
export function drawCloud(w: number, recovery: boolean, seed: number): Pix {
  const H = 22;
  const p = new Pix(w, H);
  const r = rng(seed * 7919 + w * 13 + (recovery ? 7 : 0));
  const faced = seed % 3 === 1 && w >= 90; // GameRenderer stamps a face at rows 8..14, centred
  const face = (x: number, y: number) => faced && Math.abs(x - w / 2) < 11 && y >= 6 && y <= 16;

  const lip = recovery ? [PAPER.cream, PAPER.cream, PAPER.warm, PAPER.shade] : [PAPER.cream, PAPER.cream, PAPER.cream, PAPER.butter];
  const puff = recovery ? PAPER.shade : PAPER.warm;
  const hi = recovery ? COOL(CLOUD.mid) : CLOUD.light;
  const mid = recovery ? COOL(CLOUD.low) : CLOUD.mid;
  const lo = recovery ? COOL(CLOUD.groove) : CLOUD.low;
  const groove = recovery ? COOL(CLOUD.deep) : CLOUD.groove;
  const shadow = recovery ? COOL(CLOUD.groove) : CLOUD.low;
  const line = recovery ? mix(INK.line, CLOUD.deep, 0.55) : INK.line;
  const arc = recovery ? mix(mid, lo, 0.5) : lo;

  // Belly lobes, inset so the silhouette (outline included) stays in [0, w-1].
  type Lobe = { cx: number; cy: number; rx: number; ry: number };
  const lobes: Lobe[] = [];
  const minR = 5;
  let x = 2;
  while (x < w - 3) {
    const rx = Math.min(minR + 2 + Math.floor(r() * 5), Math.floor((w - 4) / 2));
    const ry = 4 + Math.floor(r() * 3) + (rx > 9 ? 1 : 0);
    const cx = Math.min(x + rx, w - 2 - rx);
    lobes.push({ cx, cy: 20 - ry, rx, ry });
    x = cx + rx - 2 + Math.floor(r() * 3);
    if (cx >= w - 2 - rx) break;
  }
  // Precomputed masks: nearest lobe per pixel and the belly silhouette.
  const LI = new Int16Array(w * H).fill(-1);
  const LD = new Float32Array(w * H).fill(2);
  lobes.forEach((l, k) => {
    for (let y = Math.max(4, Math.floor(l.cy - l.ry)); y <= Math.min(H - 2, Math.ceil(l.cy + l.ry)); y++) {
      for (let x = Math.max(0, Math.floor(l.cx - l.rx)); x <= Math.min(w - 1, Math.ceil(l.cx + l.rx)); x++) {
        const dx = (x + 0.5 - l.cx) / l.rx;
        const dy = (y + 0.5 - l.cy) / l.ry;
        const dd = dx * dx + dy * dy;
        const i = y * w + x;
        if (dd <= 1 && dd < LD[i]) {
          LD[i] = dd;
          LI[i] = k;
        }
      }
    }
  });
  const inLobe = (x: number, y: number): Lobe | null => {
    const k = LI[y * w + x];
    return k >= 0 ? lobes[k] : null;
  };
  // Little cream puffs hanging off the lip's underside (rows 4..5).
  const puffBottom = new Int8Array(w).fill(3);
  for (let px = 3 + Math.floor(r() * 4); px < w - 6; px += 9 + Math.floor(r() * 8)) {
    const pw = 5 + Math.floor(r() * 5);
    for (let i = 0; i < pw && px + i < w - 3; i++) {
      const t = (i + 0.5) / pw;
      puffBottom[px + i] = 3 + (t > 0.2 && t < 0.8 ? 2 : 1);
    }
  }
  const inset = (y: number) => (y <= 6 ? 1 : 1 + Math.ceil((y - 6) * 0.8));
  const M = new Uint8Array(w * H);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < w; x++) {
      M[y * w + x] = y <= 3 || (y <= 11 && x >= inset(y) && x <= w - 1 - inset(y)) || LI[y * w + x] >= 0 ? 1 : 0;
    }
  }
  // Fill any pocket between lobes so the belly has no interior holes (they'd outline as dark dashes).
  const holes: number[] = [];
  const colLast = new Int16Array(w).fill(-1);
  const rowFirst = new Int16Array(H).fill(w);
  const rowLast = new Int16Array(H).fill(-1);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (!M[y * w + x]) continue;
      colLast[x] = y;
      if (x < rowFirst[y]) rowFirst[y] = x;
      rowLast[y] = x;
    }
  }
  for (let y = 5; y < H - 2; y++) {
    for (let x = rowFirst[y] + 1; x < rowLast[y]; x++) {
      const i = y * w + x;
      if (!M[i] && y < colLast[x]) holes.push(i);
    }
  }
  for (const i of holes) M[i] = 1;
  const mask = (x: number, y: number): boolean => x >= 0 && x < w && y >= 0 && y < H && M[y * w + x] === 1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask(x, y)) continue;
      if (y <= puffBottom[x]) {
        px(p, x, y, y <= 3 ? lip[y] : puff);
        continue;
      }
      // Belly.
      let c = mid;
      if (y === puffBottom[x] + 1) c = shadow;
      else if (y <= puffBottom[x] + 3) c = hi;
      if (!mask(x, y + 1)) c = lo;
      const l = inLobe(x, y);
      if (l && !face(x, y)) {
        // Concentric gouge inside the lower half of each lobe.
        const dx = (x + 0.5 - l.cx) / l.rx;
        const dy = (y + 0.5 - l.cy) / l.ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (dy > 0.05 && d > 0.58 && d < 0.58 + 1.1 / l.ry) c = arc;
      }
      px(p, x, y, c);
    }
  }
  // Carved curls in alternate lobes (normal clouds only; recovery stays quiet).
  if (!recovery) {
    lobes.forEach((l, i) => {
      if (i % 2 !== (seed & 1)) return;
      const rad = Math.min(3.6, l.ry - 1.2, l.rx - 2);
      if (rad < 2.4) return;
      const cx = l.cx + (i % 4 < 2 ? -1 : 1);
      const cy = Math.max(9.5, l.cy - 0.5);
      if (face(Math.round(cx - rad), Math.round(cy)) || face(Math.round(cx + rad), Math.round(cy))) return;
      carve(p, curl(cx, cy, rad, i % 4 < 2 ? 1 : -1, 0.85), groove, hi, (x, y) => mask(x, y) && y > puffBottom[x] + 1);
    });
  }
  // Sides of the lip and the whole belly outlined; row 0 stays the clean landing line.
  const add: [number, number][] = [];
  for (let y = 1; y < H; y++) {
    for (let x = 0; x < w; x++) {
      if (mask(x, y)) {
        if (x === 0 || x === w - 1) add.push([x, y]);
        continue;
      }
      if (mask(x - 1, y) || mask(x + 1, y) || mask(x, y - 1)) add.push([x, y]);
    }
  }
  for (const [ax, ay] of add) px(p, ax, ay, line);
  return p;
}

/**
 * Moored earth (two-way island). w × h, row 0 = collider top.
 * Meadow lip with a tufted overhang, lavender stone printed in horizontal
 * strata (terrace lip + groove per band), carved curl fossils, root threads
 * and low-contrast gouges; the base dissolves into cloud-mist.
 */
export function drawIsland(w: number, h: number, seed: number): Pix {
  const p = new Pix(w, h);
  const r = rng(seed * 104729 + w * 7 + h);
  // Face ramp compressed toward the mid tones: the stone stays calm so the meadow lip owns the contrast.
  const S = [mix(EARTH.stoneHi, EARTH.stone, 0.55), EARTH.stone, mix(EARTH.stone, EARTH.stoneMid, 0.6), mix(EARTH.stoneMid, EARTH.stoneLow, 0.45), EARTH.stoneLow].map(C);
  // Islands hang from their top down to y=-120; keep honest stone down to
  // about y=-30 (below that is the fall-out zone, killY=-60), then mist.
  const mistTop = clamp(h - 90, 56, h - 40);
  const fadeA = mistTop - 8; // lowest stone row that carries carving
  const mistEnd = Math.min(h, mistTop + 40);

  // Meadow overhang profile: scalloped lobes + hanging blades.
  const bot = new Int16Array(w).fill(6);
  for (let x0 = -3 - Math.floor(r() * 6); x0 < w; ) {
    const lw = 6 + Math.floor(r() * 12);
    const d = 1.5 + r() * 3.5;
    const cx = x0 + lw / 2;
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + lw); x++) {
      const t = (x + 0.5 - cx) / (lw / 2);
      if (Math.abs(t) <= 1) bot[x] = Math.max(bot[x], 6 + Math.round(d * Math.sqrt(1 - t * t)));
    }
    x0 += lw - 1;
  }
  const blade = new Int8Array(w);
  for (let x = 1; x < w - 1; x++) if (r() < 0.2 && blade[x - 1] === 0) blade[x] = 1 + Math.floor(r() * (r() < 0.25 ? 5 : 3));

  // Strata: roughly parallel wavy bands — thick beds split by thin laminae.
  type Band = { top: Int16Array; tone: number; thin: boolean; lit: Uint8Array };
  const bands: Band[] = [];
  let a1 = 0.8 + r() * 1.3;
  let f1 = 0.012 + r() * 0.022;
  let ph1 = r() * 6.28;
  // Faults: the whole bedding steps by a pixel or two at a few x positions.
  const fault = new Int8Array(w);
  const cracks: number[] = [];
  for (let fx = 50 + Math.floor(r() * 90), off = 0; fx < w - 30; fx += 90 + Math.floor(r() * 140)) {
    off = clamp(off + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)), -3, 3);
    for (let x = fx; x < w; x++) fault[x] = off;
    cracks.push(fx);
  }
  let y0 = 9 + Math.floor(r() * 3);
  for (let k = 0; y0 < h + 4; k++) {
    if (k % 3 === 2) {
      a1 = clamp(a1 + (r() - 0.5) * 0.7, 0.5, 2.2);
      ph1 += (r() - 0.5) * 0.5;
      f1 = clamp(f1 + (r() - 0.5) * 0.006, 0.01, 0.035);
    }
    const a2 = 0.2 + r() * 0.3;
    const f2 = 0.05 + r() * 0.06;
    const ph2 = r() * 6.28;
    const top = new Int16Array(w);
    for (let x = 0; x < w; x++) top[x] = Math.round(y0 + a1 * Math.sin(x * f1 + ph1) + a2 * Math.sin(x * f2 + ph2)) + fault[x];
    const thin = k > 0 && !bands[k - 1].thin && r() < 0.45;
    const deep = y0 > fadeA * 0.62;
    const tone = thin ? (r() < 0.3 && !deep ? 0 : deep ? 3 : 2) : deep ? 2 : 1;
    // Broken terrace lip: printed highlight with ink gaps.
    const lit = new Uint8Array(w);
    for (let x = 0; x < w; ) {
      const run = 5 + Math.floor(r() * 30);
      const on = r() < 0.62 ? 1 : 0;
      for (let i = 0; i < run && x < w; i++, x++) lit[x] = on;
      x += 1 + Math.floor(r() * 3);
    }
    bands.push({ top, tone, thin, lit });
    y0 += thin ? 2 + Math.floor(r() * 2) : 7 + Math.floor(r() * 8) + Math.floor(y0 / 40);
  }

  // Additive tone tweaks (+1 groove, -1 lit lip): gouges, block joints and fault cracks.
  const mod = new Int8Array(w * h);
  const nG = Math.floor((w * fadeA) / 300);
  for (let i = 0; i < nG; i++) {
    const gx = 3 + Math.floor(r() * (w - 10));
    const gy = 12 + Math.floor(r() * Math.max(1, fadeA - 16));
    const len = 2 + Math.floor(r() * 4);
    for (let j = 0; j < len; j++) mod[gy * w + gx + j] = 1;
    if (gy + 1 < h) mod[(gy + 1) * w + Math.min(w - 1, gx + len)] = -1;
  }
  const crackLen = new Map<number, [number, number]>();
  for (const cx of cracks) {
    const ya = 8 + Math.floor(r() * 20);
    crackLen.set(cx, [ya, Math.min(fadeA, ya + 14 + Math.floor(r() * 40))]);
  }
  for (const [cx, [ya, yb]] of crackLen) {
    for (let y = ya; y < yb; y++) {
      const x = cx + (y % 9 < 4 ? 0 : -1);
      if (x > 2 && x < w - 3) {
        mod[y * w + x] = 1;
        mod[y * w + x + 1] = -1;
      }
    }
  }
  // Mist collar: scalloped cloud lobes bulging up into the base of the stone.
  const ct = new Int16Array(w).fill(mistTop);
  for (let x0 = -Math.floor(r() * 10); x0 < w; ) {
    const lw = 12 + Math.floor(r() * 16);
    const dd = 3 + r() * 5;
    const cx = x0 + lw / 2;
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + lw); x++) {
      const t = (x + 0.5 - cx) / (lw / 2);
      if (Math.abs(t) <= 1) ct[x] = Math.min(ct[x], mistTop - Math.round(dd * Math.sqrt(1 - t * t)));
    }
    x0 += lw - 2;
  }
  const dissolveA = mistTop + 6;

  // Main fill (packed 32-bit writes; this is the hot loop of level load).
  const tone = new Uint8Array(w * h);
  const d = p.data;
  const d32 = new Uint32Array(d.buffer, d.byteOffset, w * h);
  const S32 = S.map(U);
  const [mh, mm, mmid, mlow, mdeep, mistLo, mistMid, mistHi, line32] = [EARTH.meadowHi, EARTH.meadow, EARTH.meadowMid, EARTH.meadowLow, EARTH.meadowDeep, CLOUD.low, CLOUD.mid, CLOUD.light, INK.line].map((c) => U(C(c)));
  const nb = bands.length;
  for (let x = 0; x < w; x++) {
    let b = 0;
    const bx = bot[x];
    const bl = bx + blade[x];
    const ctx = ct[x];
    const edge = x === 0 || x === w - 1;
    const rim = x > 0 && x <= 2 ? -1 : x >= w - 3 ? 1 : 0;
    for (let y = 0; y < mistEnd; y++) {
      while (b + 1 < nb && y >= bands[b + 1].top[x]) b++;
      const i = y * w + x;
      if (y < bl) {
        // Meadow lip + overhang.
        let c: number;
        if (y <= 1) c = mh;
        else if (edge) c = mdeep;
        else if (y >= bx) c = y === bl - 1 ? mlow : mmid; // hanging blade
        else if (y === 2) c = (x * 5 + seed) % 11 === 0 ? mh : mm;
        else if (y === 3) c = mm;
        else if (y === bx - 1) c = mlow;
        else c = mmid;
        d32[i] = c;
        continue;
      }
      if (y >= ctx) {
        // Cloud-mist collar, dissolving downward.
        if (y >= dissolveA && BAYER[(y & 3) * 4 + (x & 3)] < ((y - dissolveA + 1) / (mistEnd - dissolveA)) * 1.05) continue;
        const j = y - ctx;
        d32[i] = j === 0 ? mistHi : j === 3 + ((x >> 3) & 1) ? mistLo : y > mistTop + 14 ? mistHi : mistMid;
        continue;
      }
      // Stone.
      const band = bands[b];
      const next = b + 1 < nb ? bands[b + 1].top[x] : h + 99;
      let t = band.tone;
      if (y === band.top[x] && band.lit[x] && !band.thin) t -= 1;
      else if (y === next - 1 && !band.thin) t += 1;
      if (band.thin && (x + b * 7) % 29 < 3) t = bands[b > 0 ? b - 1 : 0].tone; // laminae print broken
      if (y >= bx && y <= bx + 1) t = (t > band.tone ? t : band.tone) + 1; // overhang shadow
      if (y >= ctx - 2) t += 1; // shadow above the mist
      if (y > 6) t += rim; // lit left rim, shaded right rim
      t += mod[i];
      t = t < 0 ? 0 : t > 3 ? 3 : t;
      tone[i] = t;
      d32[i] = edge ? line32 : S32[t];
    }
  }

  // Root threads wandering down from under the meadow.
  const root = C(EARTH.root);
  const rootLo = C(mix(EARTH.root, EARTH.stoneMid, 0.5));
  const nR = 1 + Math.floor(w / 30);
  for (let i = 0; i < nR; i++) {
    let rx = 4 + Math.floor(r() * (w - 8));
    let ry = bot[rx] + blade[rx];
    const len = 6 + Math.floor(r() * (r() < 0.3 ? 30 : 16));
    for (let s = 0; s < len && ry < fadeA - 4; s++) {
      put(d, (ry * w + rx) * 4, s > len - 3 ? rootLo : root);
      if (rx + 1 < w - 1 && tone[ry * w + rx + 1] > 0) put(d, (ry * w + rx + 1) * 4, S[Math.min(3, tone[ry * w + rx + 1] + 1)]);
      ry++;
      if (r() < 0.28) rx = clamp(rx + (r() < 0.5 ? -1 : 1), 2, w - 3);
      if (r() < 0.05 && s > 3) {
        // a little side branch
        const dir = r() < 0.5 ? -1 : 1;
        for (let q = 1; q <= 3; q++) put(d, ((ry + q) * w + clamp(rx + dir * q, 2, w - 3)) * 4, rootLo);
      }
    }
  }

  // Carved curl fossils.
  const nC = Math.max(1, Math.round((w * fadeA) / 5200));
  for (let i = 0; i < nC; i++) {
    const big = r() < 0.35;
    const rad = big ? 5.2 + r() * 1.6 : 3.4 + r() * 1.2;
    const cx = 10 + r() * Math.max(1, w - 20);
    const cy = 18 + r() * Math.max(1, fadeA - 30);
    const dir = r() < 0.5 ? 1 : -1;
    const pts = curl(cx, cy, rad, dir, 0.8);
    for (const [px, py] of pts) {
      if (px < 2 || px >= w - 2 || py < 0 || py >= h) continue;
      const t = tone[py * w + px];
      put(d, (py * w + px) * 4, S[Math.min(4, t + 1 + (t >= 2 ? 1 : 0))]);
    }
    const set = new Set(pts.map(([a, b]) => b * w + a));
    for (const [px, py] of pts) {
      const qx = px + 1;
      const qy = py + 1;
      if (qx >= w - 2 || qy >= h || set.has(qy * w + qx)) continue;
      const t = tone[qy * w + qx];
      put(d, (qy * w + qx) * 4, S[Math.max(0, t - 1)]);
    }
  }

  // A few flecks of bloom in the meadow (decor-quiet, below the lip line).
  for (let x = 4; x < w - 4; x++) if ((x * 37 + seed * 11) % 53 === 0) put(d, (3 * w + x) * 4, C(ACCENT.petalHi));
  return p;
}

/** Petal bridge pad (Parade-only). w × 12, row 0 = collider top. Ghost = dotted telegraph outline only. */
export function drawPetal(w: number, ghost: boolean): Pix {
  const H = 12;
  const p = new Pix(w, H);
  const mask = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= H - 1) return false;
    if (y <= 2) return true;
    const dx = (x + 0.5 - w / 2) / (w / 2 - 0.5);
    const dy = (y + 0.5) / 10.6;
    return dx * dx + dy * dy <= 1;
  };
  if (ghost) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask(x, y)) continue;
        if (y === 0) {
          if (x % 3 !== 2) px(p, x, y, PAPER.white);
        } else if (!mask(x, y + 1) || !mask(x - 1, y) || !mask(x + 1, y)) {
          if ((x + y) % 3 === 0) px(p, x, y, ACCENT.petalHi);
        }
      }
    }
    return p;
  }
  const cx = w / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask(x, y)) continue;
      let c = ACCENT.petal;
      if (y === 0) c = ACCENT.petalHi;
      else if (y <= 2) c = x >= 3 && x <= w - 4 ? PAPER.cream : ACCENT.petalHi;
      else if (y === 3) c = x >= 4 && x <= w - 5 ? PAPER.shade : ACCENT.petal;
      else if (!mask(x, y + 1)) c = ACCENT.petalLo;
      px(p, x, y, c);
    }
  }
  // Radiating veins meeting in a carved curl at the pad's heart.
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const a = (k / 3.5) * 1.25;
    for (let s = 4; s < 30; s++) {
      const x = Math.round(cx + Math.sin(a) * s * (w / 22));
      const y = Math.round(4 + Math.cos(a) * s * 0.28);
      if (y < 5 || !mask(x, y + 1)) break;
      if (s > 6) px(p, x, y, ACCENT.petalLo);
    }
  }
  carve(p, curl(cx, 6.5, 2.6, 1, 0.8), ACCENT.petalLo, ACCENT.petalHi, (x, y) => mask(x, y) && y > 3);
  outlineExceptTop(p, ACCENT.petalDeep);
  return p;
}

/** The goal flower platform. w × 46, row 0 = collider top: a gold face over a flaring cup of petals. */
export function drawGoalFlower(w: number): Pix {
  const h = 46;
  const p = new Pix(w, h);
  const n = Math.max(5, Math.round(w / 15));
  const cx = w / 2;
  const petal = (pxv: number, py: number, ang: number, L: number, W: number, back: boolean, curlTip: boolean) => {
    const ux = Math.sin(ang);
    const uy = Math.cos(ang);
    const mx = pxv + (ux * L) / 2;
    const my = py + (uy * L) / 2;
    const R = Math.ceil(L / 2 + W) + 1;
    for (let y = Math.floor(my - R); y <= my + R; y++) {
      for (let x = Math.floor(mx - R); x <= mx + R; x++) {
        if (x < 1 || x > w - 2 || y < 5 || y >= h) continue;
        const dx = x + 0.5 - mx;
        const dy = y + 0.5 - my;
        const a = (dx * ux + dy * uy) / (L / 2);
        const b = (-dx * uy + dy * ux) / W;
        const e = a * a + b * b;
        if (e > 1) continue;
        let col = back ? ACCENT.petalLo : ACCENT.petal;
        if (e > 0.7) col = back ? ACCENT.petalDeep : ACCENT.petalLo;
        else if (!back && Math.abs(b) < 0.14 && a > -0.5 && a < 0.6) col = ACCENT.petalLo;
        else if (!back && b * Math.sign(ux || 1) < -0.2 && a < 0.2) col = ACCENT.petalHi;
        px(p, x, y, col);
      }
    }
    if (curlTip && !back) {
      const tx = pxv + ux * L * 0.8;
      const ty = py + uy * L * 0.8;
      carve(p, curl(tx, ty, 2.2, ux < 0 ? -1 : 1, 0.9), ACCENT.petalDeep, ACCENT.petalHi, (x, y) => p.opaque(x, y) && y > 7);
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    const m = pass ? n : n + 1;
    for (let i = 0; i < m; i++) {
      const t = m === 1 ? 0.5 : i / (m - 1);
      const s = t * 2 - 1; // -1 left .. 1 right
      const pxv = clamp(cx + s * (w / 2 - 8), 6, w - 7);
      const ang = s * 1.05; // lean outward
      const L = (pass ? 22 : 18) + (1 - Math.abs(s)) * (pass ? 10 : 8);
      const W = pass ? Math.max(4.5, w / n / 2 + 0.5) : Math.max(4, w / n / 2);
      petal(pxv, 5, ang, L, W, pass === 0, pass === 1 && i % 3 === 1);
    }
  }
  // Stem with fiddlehead leaves.
  const sx = Math.round(cx);
  p.rect(sx - 3, 30, 6, h - 30, C(EARTH.meadowMid));
  p.rect(sx - 2, 30, 1, h - 30, C(EARTH.meadow));
  p.rect(sx + 2, 30, 1, h - 30, C(EARTH.meadowLow));
  for (const [lx, ly, dir] of [[sx - 9, 40, -1], [sx + 9, 36, 1]] as const) {
    p.ellipse(lx, ly, 6, 2.6, C(EARTH.meadowMid));
    p.hline(lx - 4, lx + 4, ly, C(EARTH.meadowLow));
    carve(p, curl(lx + dir * 6, ly - 2, 2.2, dir, 1), EARTH.meadowLow, EARTH.meadow);
  }
  // Flower face: the landing disc.
  p.rect(0, 0, w, 7, C(ACCENT.gold));
  p.hline(0, w - 1, 0, C(ACCENT.goldHi));
  p.hline(0, w - 1, 1, C(ACCENT.goldHi));
  for (let y = 3; y <= 5; y++) for (let x = 2 + (y % 2) * 2; x < w - 2; x += 4) px(p, x, y, ACCENT.goldLo);
  p.hline(1, w - 2, 6, C(ACCENT.goldLo));
  outlineExceptTop(p, INK.line);
  return p;
}

// ── Interactive objects ──────────────────────────────────────────────────

/**
 * Springcap: 22×16, bottom-centre on the ground. At rest the cap's top row
 * (its outline) is row 4 — exactly 12 px above the ground, the bounce surface.
 * squash 1 = compressed impact, -1 = stretched rebound.
 */
export function drawSpring(squash: -1 | 0 | 1): Pix {
  const p = new Pix(22, 16);
  const cx = 11;
  const top = squash === 1 ? 7 : squash === -1 ? 1 : 4; // outline row
  const rx = squash === 1 ? 10.4 : squash === -1 ? 8 : 9.4;
  const ry = squash === 1 ? 4.6 : squash === -1 ? 7 : 6;
  const base = top + 1 + ry; // row just below the dome
  const by = Math.round(base);
  // Dome.
  for (let y = top + 1; y < by; y++) {
    for (let x = 0; x < 22; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - base) / ry;
      const dd = dx * dx + dy * dy;
      if (dd > 1) continue;
      let c = ACCENT.coral;
      const lightDot = -dx * 0.6 - dy * 0.8;
      if (y >= by - 1) c = ACCENT.coralLo;
      else if (dd > 0.42 && dd < 0.82 && lightDot > 0.72) c = ACCENT.coralHi;
      else if (dx > 0.55 && dy > -0.55) c = ACCENT.coralLo;
      px(p, x, y, c);
    }
  }
  // Cream spots (shift with the squash).
  const sy = (k: number) => Math.round(top + 1 + ry * k);
  const sxs = (k: number) => Math.round(cx + rx * k);
  p.rect(sxs(-0.52), sy(0.45), 2, 2, PAPER.cream);
  p.rect(sxs(-0.08), sy(0.18), 3, 2, PAPER.cream);
  px(p, sxs(-0.08) + 1, sy(0.18) - 1, PAPER.cream);
  p.rect(sxs(0.4), sy(0.5), 2, 2, PAPER.cream);
  px(p, sxs(0.72), sy(0.72), PAPER.cream);
  // Gills under the rim.
  const gw = Math.round(rx) - 2;
  p.hline(cx - gw, cx + gw - 1, by, PAPER.shade);
  for (let x = cx - gw + 1; x < cx + gw - 1; x += 2) px(p, x, by, mix(PAPER.shade, ACCENT.coralLo, 0.3));
  // Chunky stem.
  const stemW = squash === 1 ? 8 : squash === -1 ? 4 : 6;
  const sx0 = cx - stemW / 2;
  const st = by + 1;
  p.rect(sx0, st, stemW, 15 - st, PAPER.butter);
  p.rect(sx0 + stemW - 2, st, 2, 15 - st, PAPER.shade);
  px(p, sx0, st, PAPER.shade);
  p.hline(sx0 - 1, sx0 + stemW, 15, PAPER.shade);
  px(p, sx0 + stemW - 1, 15, mix(PAPER.shade, EARTH.root, 0.5));
  p.outline(INK.line);
  // Anchor guarantee: nothing above the outline row.
  for (let y = 0; y < top; y++) for (let x = 0; x < 22; x++) px(p, x, y, null);
  return p;
}

/** Dewdrop ring, 20×20 centred. Armed = clean mint ring, empty centre, one droplet; spent = hollow dashed grey-lilac. */
export function drawRing(armed: boolean, phase: number): Pix {
  const p = new Pix(20, 20);
  const cx = 10;
  const cy = 10;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (armed) {
        if (d <= 6.1 || d > 8.9) continue;
        let c = ACCENT.mint;
        if (d > 8) c = ACCENT.mintDeep;
        else if (d < 6.9) c = ACCENT.mintLo;
        else if (Math.cos(a - phase - 3.9) > 0.55) c = ACCENT.mintHi; // highlight travels round the ring
        px(p, x, y, c);
      } else {
        // Hollow, dashed, thin: unmistakably "not now".
        if (d <= 6.9 || d > 8.2) continue;
        const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
        if (seg % 2 === 0) px(p, x, y, d > 7.6 ? GREY_LILAC.lo : GREY_LILAC.hi);
      }
    }
  }
  if (armed) {
    // The droplet, hanging in the open centre (bobs a pixel with the phase).
    const bob = Math.round(phase / (Math.PI / 2)) % 2;
    const dy = 8 + bob;
    px(p, 10, dy, ACCENT.mintHi);
    p.rect(9, dy + 1, 3, 2, ACCENT.mint);
    px(p, 9, dy + 1, ACCENT.mintHi);
    px(p, 10, dy + 3, ACCENT.mintLo);
    px(p, 11, dy + 2, ACCENT.mintLo);
    px(p, 10, dy - 1, ACCENT.mintLo);
  }
  return p;
}

/** Ink-thistles: (w+2) × 14 placed at x-1, bottom on the hazard's y. The only spiky, dark-ink thing in the world. */
export function drawThistles(w: number, seed: number): Pix {
  const H = 14;
  const W = w + 2;
  const p = new Pix(W, H);
  const r = rng(seed * 31 + w);
  // Jagged base rosette.
  for (let x = 1; x < W - 1; x += 3) {
    const tip = 8 + Math.floor(r() * 3);
    const dir = (x / 3) % 2 ? 1 : -1;
    p.line(x, 13, clamp(x + dir * 2, 0, W - 1), tip, INK.plum, 1);
    px(p, x, 12, INK.plum);
  }
  p.hline(0, W - 1, 13, INK.plum);
  const n = Math.max(1, Math.round((w - 2) / 10));
  const heads: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const hx = 1 + Math.round(((i + 0.5) * w) / n);
    const hy = 5 + Math.floor(r() * 2) - (i % 2);
    heads.push([hx, hy]);
    p.line(hx, hy + 2, hx + (r() < 0.5 ? 0 : 1), 13, INK.plum, 1);
    px(p, hx + 1, hy + 5, INK.plum); // thorn on the stalk
  }
  for (const [hx, hy] of heads) {
    p.ellipse(hx + 0.5, hy + 0.5, 2.7, 2.6, INK.plum);
    px(p, hx - 1, hy - 1, INK.soft);
    px(p, hx, hy - 1, INK.soft);
  }
  const body = new Pix(W, H);
  body.blit(p, 0, 0);
  body.outline(INK.ink);
  // Sharp spikes (drawn after the outline so they stay 1 px and angular).
  for (const [hx, hy] of heads) {
    const rot = r() * 0.5;
    for (let k = 0; k < 9; k++) {
      const a = rot + (k / 9) * Math.PI * 2;
      const up = Math.sin(a) < 0.3;
      if (!up && k % 2) continue;
      const L = up ? 5.5 + (k % 2) : 4;
      body.line(hx + 0.5 + Math.cos(a) * 2.6, hy + 0.5 + Math.sin(a) * 2.6, hx + 0.5 + Math.cos(a) * L, hy + 0.5 + Math.sin(a) * L, INK.ink, 1);
    }
    // Sting-pink glint on the burr and one spike tip.
    body.px(hx + 1, hy - 1, ACCENT.sting);
    body.px(hx + 1, hy - 4, ACCENT.sting);
  }
  // Keep the top-left/right clean of clipped stubs.
  return body;
}

/** Sun-seed coin, 8×8, four spin frames. */
export function drawSeed(frame: number): Pix {
  const p = new Pix(8, 8);
  const f = ((frame % 4) + 4) % 4;
  const rx = [3.5, 2.5, 1.0, 2.5][f];
  const back = f === 3;
  p.ellipse(4, 4, rx, 3.5, ACCENT.goldLo);
  if (rx > 1.5) p.ellipse(4, 4, rx - 1, 2.5, back ? ACCENT.goldLo : ACCENT.gold);
  if (f === 0) {
    px(p, 2, 2, ACCENT.goldHi);
    px(p, 2, 3, ACCENT.goldHi);
    px(p, 3, 2, ACCENT.goldHi);
  } else if (f === 1) px(p, 3, 2, ACCENT.goldHi);
  else if (f === 2) p.rect(3, 1, 1, 6, ACCENT.gold);
  // The seed slit.
  if (rx > 2) {
    px(p, 4, 3, ACCENT.goldDeep);
    px(p, 4, 4, ACCENT.goldDeep);
    if (f === 0) px(p, 4, 5, ACCENT.goldDeep);
  }
  p.outline(ACCENT.goldDeep);
  return p;
}

/**
 * Melody fragment, 18×20 centred: a torn printed scrap carrying a gold note,
 * with a dotted ring. `ring` (0..3, optional) breathes the ring outward.
 */
export function drawFragment(ring = 0): Pix {
  const W = 18;
  const H = 20;
  const out = new Pix(W, H);
  // Breathing ring (dotted gold, behind).
  const rr = 8.2 + (ring % 4 === 1 || ring % 4 === 3 ? 0.5 : ring % 4 === 2 ? 0.9 : 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x + 0.5 - 9) / 1, (y + 0.5 - 10) / 1.1);
      if (Math.abs(d - rr) < 0.55 && (x + y) % 2 === 0) out.px(x, y, ACCENT.goldHi);
    }
  }
  // Torn paper scrap, slightly skewed.
  const paper = new Pix(W, H);
  const tear = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0];
  for (let y = 4; y <= 16; y++) {
    const sh = y < 8 ? 1 : y > 13 ? -1 : 0;
    const x0 = 4 + sh + tear[y % 16];
    const x1 = 13 + sh - tear[(y + 5) % 16];
    for (let x = x0; x <= x1; x++) paper.px(x, y, PAPER.butter);
  }
  for (let x = 5; x <= 13; x++) if (tear[x] === 1) paper.px(x, 3, PAPER.butter);
  for (let x = 4; x <= 12; x++) if (tear[x + 3] === 0) paper.px(x, 17, PAPER.butter);
  // Printed staff lines on the scrap.
  for (const sy of [7, 10, 13]) for (let x = 0; x < W; x++) if (paper.opaque(x, sy)) paper.px(x, sy, PAPER.shade);
  // Torn-edge shadow on the right/bottom.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (paper.opaque(x, y) && (!paper.opaque(x + 1, y) || !paper.opaque(x, y + 1))) paper.px(x, y, PAPER.shade);
  paper.outline(INK.line);
  out.blit(paper, 0, 0);
  // Gold note (eighth note) printed on top.
  const note = new Pix(W, H);
  note.ellipse(7.5, 13.5, 2.6, 2, ACCENT.gold);
  note.rect(9, 5, 1, 9, ACCENT.gold);
  note.rect(10, 5, 2, 1, ACCENT.gold);
  note.rect(11, 6, 1, 2, ACCENT.gold);
  note.px(12, 7, ACCENT.gold);
  note.px(6, 13, ACCENT.goldHi);
  note.px(7, 12, ACCENT.goldHi);
  note.px(8, 14, ACCENT.goldLo);
  note.outline(ACCENT.goldDeep);
  out.blit(note, 0, 0);
  return out;
}

/** Keepsakes, 14×14 centred: small object icons with a cream halo, outlined in ink. */
export function drawKeepsake(icon: 'teacup' | 'feather' | 'watch'): Pix {
  const p = new Pix(14, 14);
  const ic = new Pix(14, 14);
  if (icon === 'teacup') {
    ic.rect(2, 5, 8, 4, PAPER.white);
    ic.rect(3, 9, 6, 1, PAPER.white);
    ic.rect(8, 5, 2, 5, PAPER.shade);
    ic.hline(3, 8, 5, ACCENT.mint);
    ic.hline(2, 9, 4, PAPER.white);
    ic.rect(10, 6, 2, 1, PAPER.white);
    ic.rect(11, 7, 1, 1, PAPER.white);
    ic.rect(10, 8, 2, 1, PAPER.white);
    ic.px(4, 7, ACCENT.petal);
    ic.px(6, 7, ACCENT.petal);
    ic.px(5, 8, ACCENT.petalLo);
    ic.hline(1, 10, 11, PAPER.shade);
    ic.px(5, 2, CLOUD.light);
    ic.px(6, 1, CLOUD.light);
  } else if (icon === 'feather') {
    ic.line(3, 11, 10, 2, PAPER.butter, 2);
    ic.line(4, 11, 11, 3, ACCENT.gold, 1);
    ic.px(9, 2, ACCENT.goldHi);
    ic.px(7, 5, ACCENT.goldLo);
    ic.px(5, 8, ACCENT.goldLo);
    ic.line(2, 12, 4, 10, ACCENT.goldLo, 1);
  } else {
    ic.ellipse(7, 8, 4.6, 4.6, ACCENT.gold);
    ic.ellipse(7, 8, 3.3, 3.3, PAPER.white);
    ic.rect(6, 2, 2, 1, ACCENT.gold);
    ic.px(5, 5, ACCENT.goldHi);
    ic.px(7, 6, INK.line);
    ic.px(7, 7, INK.line);
    ic.px(8, 8, INK.line);
    ic.px(9, 8, ACCENT.petalLo);
  }
  ic.outline(INK.line);
  // Cream halo: a dithered ring just inside the frame.
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7);
      if (d > 5.6 && d < 7 && (x + y) % 2 === 0) px(p, x, y, PAPER.cream);
    }
  }
  p.blit(ic, 0, 0);
  return p;
}

/** Checkpoint, 16×28 bottom-centre: a carved bud-post that unfurls into a petal with a ⊕ registration mark. */
export function drawCheckpoint(open: boolean): Pix {
  const p = new Pix(16, 28);
  // Carved post (cloud-stone).
  const postHi = open ? EARTH.meadow : CLOUD.light;
  const post = open ? EARTH.meadowMid : CLOUD.mid;
  const postLo = open ? EARTH.meadowLow : CLOUD.low;
  p.rect(6, 12, 4, 13, post);
  p.rect(6, 12, 1, 13, postHi);
  p.rect(9, 12, 1, 13, postLo);
  for (let y = 15; y < 25; y += 4) {
    p.hline(6, 9, y, postLo);
    p.hline(7, 9, y + 1, postHi);
  }
  // Plinth.
  p.rect(4, 25, 8, 3, CLOUD.mid);
  p.hline(4, 11, 25, CLOUD.light);
  p.rect(10, 26, 2, 2, CLOUD.low);
  if (!open) {
    // Closed bud, carved with a curl.
    p.ellipse(8, 8, 4.2, 5.2, CLOUD.mid);
    p.ellipse(7.5, 7.5, 3, 4, CLOUD.light);
    px(p, 8, 1, CLOUD.light);
    px(p, 8, 2, CLOUD.light);
    px(p, 10, 10, CLOUD.low);
    px(p, 9, 11, CLOUD.low);
    carve(p, curl(8, 8, 2.2, 1, 1), CLOUD.groove, CLOUD.hi, (x, y) => p.opaque(x, y));
    // Sepals.
    px(p, 5, 11, EARTH.meadowMid);
    px(p, 11, 11, EARTH.meadowMid);
    p.hline(6, 10, 12, EARTH.meadowMid);
  } else {
    // Unfurled petals.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
      p.ellipse(8 + Math.cos(a) * 4.4, 7 + Math.sin(a) * 4.4, 2.9, 2.9, k % 2 ? ACCENT.petal : ACCENT.petalHi);
      px(p, Math.round(8 + Math.cos(a) * 5.6), Math.round(7 + Math.sin(a) * 5.6), ACCENT.petalLo);
    }
    p.ellipse(8, 7, 3, 3, PAPER.cream);
    // ⊕ registration mark.
    for (const [x, y] of [[7, 5], [8, 5], [6, 6], [9, 6], [6, 7], [9, 7], [7, 8], [8, 8]] as const) px(p, x, y, ACCENT.petalDeep);
    px(p, 7, 4, ACCENT.petalDeep);
    px(p, 7, 9, ACCENT.petalDeep);
    px(p, 5, 7, ACCENT.petalDeep);
    px(p, 10, 6, ACCENT.petalDeep);
    px(p, 7, 6, ACCENT.petalDeep);
    px(p, 8, 7, ACCENT.petalDeep);
    // Leaves on the post.
    p.ellipse(4, 19, 2.6, 1.3, EARTH.meadowMid);
    p.ellipse(12, 16, 2.6, 1.3, EARTH.meadowMid);
    px(p, 3, 19, EARTH.meadow);
    px(p, 13, 16, EARTH.meadow);
  }
  p.outline(INK.line);
  return p;
}

/** Tutorial sign: a carved wooden block-print plaque on a post. */
export function drawSign(text: string): Pix {
  const lines = text.split('\n');
  const tw = Math.max(...lines.map(textWidth));
  const w = tw + 10;
  const bh = lines.length * 6 + 7;
  const h = bh + 12;
  const p = new Pix(w, h);
  const face = mix(EARTH.root, PAPER.shade, 0.3);
  const faceHi = mix(PAPER.shade, EARTH.root, 0.15);
  const faceLo = mix(EARTH.root, EARTH.stoneLow, 0.35);
  const groove = mix(EARTH.root, INK.plum, 0.45);
  // Post.
  const px0 = Math.floor(w / 2) - 1;
  p.rect(px0, bh - 1, 3, h - bh + 1, EARTH.root);
  p.rect(px0 + 2, bh - 1, 1, h - bh + 1, faceLo);
  p.hline(px0 - 1, px0 + 3, h - 1, faceLo);
  // Plaque with chamfered corners.
  p.rect(1, 1, w - 2, bh - 2, face);
  p.hline(2, w - 3, 1, faceHi);
  p.hline(2, w - 3, bh - 2, faceLo);
  for (let y = 2; y < bh - 2; y++) px(p, w - 2, y, faceLo);
  for (let y = 2; y < bh - 2; y++) px(p, 1, y, faceHi);
  px(p, 1, 1, null);
  px(p, w - 2, 1, null);
  px(p, 1, bh - 2, null);
  px(p, w - 2, bh - 2, null);
  // Carved border (groove + lit lip), kept clear of the text block.
  for (let x = 3; x <= w - 4; x++) {
    px(p, x, 2, groove);
    px(p, x, bh - 3, faceHi);
  }
  for (let y = 3; y <= bh - 4; y++) {
    px(p, 2, y, groove);
    px(p, w - 3, y, faceHi);
  }
  // Corner registration dots.
  px(p, 3, 3, groove);
  px(p, w - 4, bh - 4, groove);
  p.outline(INK.line);
  drawText(p, text, w / 2, 4, INK.plum, 'center');
  return p;
}

/** Decor flower 9×11 (bottom-centre). Low contrast; stage 0 closed bud → 2 open. */
export function drawFlower(v: number, stage: 0 | 1 | 2): Pix {
  const p = new Pix(9, 11);
  const colors: [string, string, string][] = [
    [ACCENT.petal, ACCENT.petalHi, ACCENT.petalLo],
    [PAPER.warm, PAPER.butter, PAPER.shade],
    [ACCENT.gold, ACCENT.goldHi, ACCENT.goldLo],
    [BLUE.mid, BLUE.hi, BLUE.lo],
    [CLOUD.light, CLOUD.hi, CLOUD.mid],
  ];
  const [c, l, dk] = colors[v % colors.length];
  const stemH = 4 + (v % 3);
  p.rect(4, 11 - stemH, 1, stemH, EARTH.meadowLow);
  if (v % 2) px(p, 5, 9, EARTH.meadowMid);
  else px(p, 3, 8, EARTH.meadowMid);
  const cy = 10 - stemH;
  if (stage === 0) {
    p.rect(4, cy - 2, 1, 3, c);
    px(p, 4, cy - 2, l);
    px(p, 3, cy, EARTH.meadowMid);
    px(p, 5, cy, EARTH.meadowMid);
  } else if (stage === 1) {
    p.rect(3, cy - 1, 3, 2, c);
    px(p, 4, cy - 2, l);
    px(p, 3, cy - 2, c);
    px(p, 5, cy, dk);
  } else {
    px(p, 4, cy - 2, c);
    px(p, 2, cy, c);
    px(p, 6, cy, c);
    px(p, 3, cy + 1, dk);
    px(p, 5, cy + 1, dk);
    p.rect(3, cy - 1, 3, 2, l);
    px(p, 4, cy, ACCENT.goldLo);
  }
  p.outline(mix(EARTH.meadowDeep, CLOUD.groove, 0.4));
  return p;
}

/** Grass tuft 8×6 (bottom-centre). Darker than the meadow lip so the walk line stays clean. */
export function drawTuft(v: number): Pix {
  const p = new Pix(8, 6);
  const blades: [number, number][] = v % 2 ? [[1, 3], [2, 1], [3, 2], [4, 0], [5, 2], [6, 3]] : [[1, 2], [2, 3], [3, 0], [4, 2], [5, 1], [6, 3]];
  for (const [x, top] of blades) {
    for (let y = top; y < 6; y++) px(p, x, y, y === top ? EARTH.meadowMid : y > 4 ? EARTH.meadowDeep : EARTH.meadowLow);
  }
  px(p, v % 2 ? 2 : 3, v % 2 ? 1 : 0, EARTH.meadow);
  return p;
}

/** Decor mushroom 18×22 (bottom-centre): a tall pastel bell / ink-cap — never coral, never a springcap dome. */
export function drawDecorMushroom(v: number): Pix {
  const p = new Pix(18, 22);
  const blue = v % 2 === 1;
  const hi = blue ? BLUE.hi : CLOUD.hi;
  const mid = blue ? BLUE.mid : CLOUD.light;
  const lo = blue ? BLUE.lo : CLOUD.mid;
  // Slender, slightly leaning stem.
  for (let y = 10; y < 22; y++) {
    const x = 8 + (y < 15 ? 1 : 0);
    p.rect(x, y, 2, 1, PAPER.warm);
    px(p, x + 1, y, PAPER.shade);
  }
  p.hline(7, 11, 21, PAPER.shade);
  px(p, 7, 15, PAPER.shade); // skirt
  px(p, 11, 15, PAPER.shade);
  // Bell cap: pointed, tall, with a scalloped drooping skirt.
  for (let y = 1; y <= 12; y++) {
    const t = (y - 1) / 11;
    const hw = 1 + Math.pow(t, 0.7) * 6.5;
    for (let x = 0; x < 18; x++) {
      const dx = x + 0.5 - 9.5;
      if (Math.abs(dx) > hw) continue;
      if (y === 12 && Math.abs(Math.round(dx)) % 3 === 1) continue; // scallops
      let c = mid;
      if (dx < -hw * 0.45 && y > 2) c = hi;
      if (dx > hw * 0.5) c = lo;
      if (y >= 10 && Math.round(dx + 9.5) % 3 === 0) c = lo; // gill grooves
      px(p, x, y, c);
    }
  }
  px(p, 6, 6, hi);
  px(p, 12, 8, lo);
  p.outline(mix(CLOUD.groove, EARTH.stoneMid, 0.4));
  return p;
}

/** Lamp 10×34 (bottom-centre): a fiddlehead post carrying a bell-flower lantern. Dormant → gold when lit. */
export function drawLamp(lit: boolean): Pix {
  const p = new Pix(10, 34);
  const post = EARTH.stoneMid;
  const postHi = EARTH.stone;
  p.rect(4, 12, 2, 21, post);
  p.rect(4, 12, 1, 21, postHi);
  p.hline(2, 7, 33, post);
  p.hline(3, 6, 32, postHi);
  // Fiddlehead finial (the unfurling curl).
  for (const [x, y] of curl(5, 3.5, 2.6, 1, 1)) px(p, x, y, post);
  p.rect(4, 6, 2, 2, post);
  // Bell lantern.
  const glow = lit ? ACCENT.gold : CLOUD.mid;
  const glowHi = lit ? ACCENT.goldHi : CLOUD.light;
  p.rect(3, 8, 4, 1, post);
  p.rect(2, 9, 6, 4, glow);
  p.rect(1, 12, 8, 1, glow);
  px(p, 1, 13, glow);
  px(p, 4, 13, glow);
  px(p, 8, 13, glow);
  p.rect(3, 9, 2, 2, glowHi);
  if (lit) px(p, 3, 9, PAPER.white);
  p.outline(EARTH.stoneLow);
  return p;
}

/** Cloud face 14×7, bottom-centre at the cloud's top-15 (sits in the belly). */
export function drawCloudFace(awake: boolean): Pix {
  const p = new Pix(14, 7);
  const c = CLOUD.deep;
  if (awake) {
    p.rect(2, 1, 2, 3, c);
    p.rect(10, 1, 2, 3, c);
    px(p, 2, 1, PAPER.white);
    px(p, 10, 1, PAPER.white);
    p.hline(6, 7, 5, c);
    px(p, 5, 4, c);
    px(p, 8, 4, c);
    px(p, 6, 6, ACCENT.petalLo);
    px(p, 7, 6, ACCENT.petalLo);
    p.hline(0, 1, 4, ACCENT.petal);
    p.hline(12, 13, 4, ACCENT.petal);
  } else {
    // Sleeping: closed, curved eyes.
    for (const ox of [1, 9]) {
      px(p, ox, 2, c);
      px(p, ox + 1, 3, c);
      px(p, ox + 2, 3, c);
      px(p, ox + 3, 2, c);
    }
    p.hline(6, 7, 5, c);
    px(p, 0, 4, CLOUD.groove);
    px(p, 13, 4, CLOUD.groove);
  }
  return p;
}

/** The giant flower that opens during the Petal Parade (open: 0..1), 128×128 centred. */
export function drawGiantFlower(open: number): Pix {
  const S = 128;
  const p = new Pix(S, S);
  const c = S / 2;
  const o = clamp(open, 0, 1);
  if (o < 0.05) {
    drawBud(p, c);
    p.outline(C(ACCENT.petalDeep));
    return p;
  }
  type Layer = { n: number; base: number; len: number; wid: number; rot: number; fill: string; edge: string; vein: string; hi: string; front: boolean };
  const layers: Layer[] = [
    { n: 10, base: 4, len: 18 + o * 40, wid: 6 + o * 11, rot: Math.PI / 10 + o * 0.3, fill: ACCENT.petalLo, edge: ACCENT.petalDeep, vein: ACCENT.petalDeep, hi: ACCENT.petal, front: false },
    { n: 10, base: 4, len: 15 + o * 33, wid: 5 + o * 10, rot: o * 0.3, fill: ACCENT.petal, edge: ACCENT.petalLo, vein: ACCENT.petalLo, hi: ACCENT.petalHi, front: true },
    { n: 10, base: 3, len: 8 + o * 15, wid: 3 + o * 5, rot: Math.PI / 10 - o * 0.2, fill: ACCENT.petalHi, edge: ACCENT.petal, vein: ACCENT.petal, hi: PAPER.butter, front: false },
  ];
  const disc = 7 + o * 7;
  const maxR = layers[0].base + layers[0].len + 1;
  const halfW = (u: number, W: number) => (u < 0.55 ? W * Math.pow(Math.sin((u / 0.55) * (Math.PI / 2)), 0.8) : W * Math.sqrt(Math.max(0, 1 - ((u - 0.55) / 0.45) ** 2)));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const rad = Math.hypot(dx, dy);
      if (rad > maxR) continue;
      const ang = Math.atan2(dy, dx);
      let col: string | null = null;
      for (let li = layers.length - 1; li >= 0 && !col; li--) {
        const L = layers[li];
        const step = (Math.PI * 2) / L.n;
        const k = Math.round((ang - L.rot) / step);
        const da = ang - L.rot - k * step;
        const along = rad * Math.cos(da) - L.base;
        const perp = rad * Math.sin(da);
        const u = along / L.len;
        if (u < 0 || u > 1) continue;
        const hw = halfW(u, L.wid);
        const ap = Math.abs(perp);
        if (ap > hw) continue;
        if (u > 0.93 && ap < 1) continue; // notched tip
        col = L.fill;
        if (ap > hw - 1.1 || u > 1 - 1.1 / L.len) col = L.edge;
        else if (ap < 0.55 && u > 0.12 && u < 0.85) col = L.vein;
        else if (L.front && Math.abs(ap - hw * 0.5) < 0.5 && u > 0.3 && u < 0.8) col = L.hi; // side veins
        else if (L.front && o >= 0.4 && Math.abs(((rad - disc) % 7) - 3.5) < 0.5 && (x + y) % 2 === 0) col = L.hi; // printed sound-wave rings
        else if (u < 0.35 && perp < 0) col = L.hi;
      }
      if (rad <= disc) {
        const t = rad / disc;
        col = t > 0.88 ? ACCENT.goldLo : t > 0.74 ? ACCENT.gold : t > 0.64 ? ACCENT.goldHi : t > 0.54 ? ACCENT.gold : t > 0.46 ? ACCENT.goldLo : ACCENT.petalLo;
        if (t <= 0.46 && t > 0.18 && dx < 0 && dy < 0) col = ACCENT.petal;
      }
      if (col) px(p, x, y, col);
    }
  }
  // Unfurling curls: rolled petal tips while opening, small carved curls at the heart once open.
  const front = layers[1];
  for (let k = 0; k < front.n; k++) {
    const a = front.rot + (k * Math.PI * 2) / front.n;
    if (o < 0.7) {
      if (k % 2) continue;
      const rr = front.base + front.len * 0.78;
      const rc = 2.6 + (0.7 - o) * 5;
      for (const [x, y] of curl(c + Math.cos(a) * rr, c + Math.sin(a) * rr, rc, 1, 1, a + Math.PI)) px(p, x, y, ACCENT.petalDeep);
    } else {
      if (k % 2) continue;
      const rr = disc + 7;
      const pts = curl(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 3.4, 1, 1, a);
      carve(p, pts, ACCENT.petalLo, PAPER.butter, (x, y) => p.opaque(x, y) && Math.hypot(x + 0.5 - c, y + 0.5 - c) > disc + 1);
    }
  }
  // Seed dots round the heart.
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + o;
    px(p, c + Math.cos(a) * (disc + 1.5), c + Math.sin(a) * (disc + 1.5), ACCENT.goldHi);
  }
  p.outline(C(ACCENT.petalDeep));
  // Sound rings breathing outside the bloom once it is mostly open.
  if (o >= 0.6) {
    const outer = Math.min(61, layers[0].base + layers[0].len + 2);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (p.opaque(x, y)) continue;
        const rad = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (rad < outer - 1 || rad > outer + 4) continue;
        const ang = Math.atan2(y + 0.5 - c, x + 0.5 - c);
        for (let i = 0; i < 2; i++) {
          const rr = outer + i * 2.5;
          if (rr > 63.4 || Math.abs(rad - rr) >= 0.5) continue;
          if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * (36 + i * 20)) % 2 === 0) px(p, x, y, i ? ACCENT.petalHi : ACCENT.goldHi);
        }
      }
    }
  }
  return p;
}

function drawBud(p: Pix, c: number): void {
  // Tall closed bud wrapped in sepals, with a carved curl.
  p.ellipse(c, c + 2, 13, 20, ACCENT.petalLo, (_, y) => y < c + 8);
  p.ellipse(c - 2, c - 2, 8, 15, ACCENT.petal, (_, y) => y < c + 6);
  p.ellipse(c - 4, c - 6, 3, 8, ACCENT.petalHi);
  for (let y = Math.round(c - 22); y < c - 14; y++) {
    const hw = Math.max(0, (y - (c - 22)) * 0.7);
    p.hline(c - hw, c + hw, y, ACCENT.petal);
  }
  carve(p, curl(c + 3, c - 2, 4.5, 1, 1), ACCENT.petalDeep, ACCENT.petalHi, (x, y) => p.opaque(x, y));
  // Sepals.
  for (const [sx, dir] of [[c - 9, -1], [c + 9, 1], [c, 0]] as const) {
    for (let y = 0; y < 22; y++) {
      const hw = Math.max(0, 6 - Math.abs(y - 14) * 0.45);
      const x = sx + dir * (y < 10 ? (10 - y) * 0.25 : 0);
      if (y > 2) p.hline(x - hw, x + hw, c + y, y > 16 ? EARTH.meadowLow : EARTH.meadowMid);
    }
  }
  p.rect(c - 3, c + 22, 6, 30, EARTH.meadowMid);
  p.rect(c + 1, c + 22, 2, 30, EARTH.meadowLow);
}

/** The sleeping sun, 112×112 centred: a sun-daisy (original botanical silhouette). awake 0 → 1. */
export function drawSun(awake: number): Pix {
  const S = 112;
  const p = new Pix(S, S);
  const c = S / 2;
  const up = awake >= 0.5;
  // Dormant prints one pale plate; awake gets the full gold edition.
  const petal = up ? ACCENT.gold : mix(ACCENT.goldHi, ACCENT.gold, 0.35);
  const petalHi = up ? ACCENT.goldHi : mix(PAPER.butter, ACCENT.goldHi, 0.5);
  const petalLo = up ? ACCENT.goldLo : mix(ACCENT.gold, ACCENT.goldLo, 0.3);
  const discC = up ? mix(ACCENT.goldHi, PAPER.butter, 0.3) : mix(PAPER.butter, ACCENT.goldHi, 0.4);
  const discHi = up ? PAPER.white : PAPER.butter;
  const feat = up ? ACCENT.goldDeep : mix(ACCENT.goldLo, ACCENT.goldDeep, 0.4);
  const N = 16;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const rad = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const cs = Math.abs(Math.cos((N / 2) * ang));
      const R = 41 + 11 * Math.pow(cs, 0.55);
      if (rad > R) continue;
      let col = petal;
      if (rad > 29 && cs < 0.16) col = petalLo; // grooves between petals
      else if (rad > 33 && cs > 0.985 && rad < R - 4) col = petalHi; // petal veins
      else if (rad > R - 3 && dx + dy < -10) col = petalHi; // lit rim upper-left
      else if (rad > R - 2.2) col = petalLo;
      if (rad <= 29) {
        col = discC;
        if (rad > 27.4) col = petalLo;
        else if (Math.hypot(dx + 15, dy + 14) < 6 && Math.hypot(dx + 12, dy + 11) > 4.5) col = discHi;
      }
      px(p, x, y, col);
    }
  }
  // Seed ring just inside the disc rim.
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    px(p, c + Math.cos(a) * 25.5, c + Math.sin(a) * 25.5, petal);
  }
  // Face.
  const ey = c + 1;
  if (!up) {
    for (const ex of [c - 12, c + 12]) {
      for (let i = -5; i <= 5; i++) {
        const yy = ey + Math.round(2 - (i * i) / 12.5);
        p.rect(ex + i, yy, 1, 2, feat);
      }
      px(p, ex - 6, ey - 1, feat);
      px(p, ex + 6, ey - 1, feat);
    }
    p.ellipse(c, c + 13, 2.2, 1.6, feat);
    px(p, c, c + 13, mix(feat, ACCENT.coralHi, 0.5));
  } else {
    for (const ex of [c - 12, c + 12]) {
      p.ellipse(ex, ey, 3.2, 4.2, feat);
      p.rect(ex - 2, ey - 3, 2, 2, PAPER.white);
      p.line(ex - 5, ey - 8, ex + 3, ey - 9, feat, 1); // lifted brows
    }
    for (let i = -9; i <= 9; i++) p.rect(c + i, c + 10 + Math.round((81 - i * i) / 18), 1, 2, feat);
    p.rect(c - 3, c + 15, 7, 1, ACCENT.coralHi);
  }
  for (const bx of [c - 21, c + 21]) p.ellipse(bx, c + 8, 4.5, 2.6, up ? ACCENT.coralHi : mix(ACCENT.petalHi, discC, 0.4));
  p.outline(up ? ACCENT.goldDeep : petalLo);
  return p;
}

/** Speech bubble: paper with an ink outline and a misregistered print shadow. */
export function drawBubble(text: string): Pix {
  const lines = text.split('\n');
  const w = Math.max(...lines.map(textWidth)) + 10;
  const bh = lines.length * 6 + 7;
  const shape = new Pix(w, bh + 5);
  shape.rect(1, 0, w - 2, bh, PAPER.cream);
  shape.rect(0, 1, w, bh - 2, PAPER.cream);
  shape.px(8, bh, PAPER.cream);
  shape.px(9, bh, PAPER.cream);
  shape.px(8, bh + 1, PAPER.cream);
  shape.px(7, bh + 2, PAPER.cream);
  shape.outline(INK.line);
  const p = new Pix(w + 1, bh + 6);
  // Offset impression (petal plate) one pixel down-right.
  const shadow = new Pix(w, bh + 5);
  shadow.blit(shape, 0, 0);
  shadow.tint(mix(CLOUD.mid, ACCENT.petal, 0.25));
  p.blit(shadow, 1, 1);
  p.blit(shape, 0, 0);
  // Paper grain: a faint printed rule under the text block.
  for (let x = 3; x < w - 3; x += 2) px(p, x, bh - 2, PAPER.warm);
  drawText(p, text, w / 2, 4, INK.plum, 'center');
  return p;
}

// ── Utilities ──────────────────────────────────────────────────────────────
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const RGBA_CACHE = new Map<string, RGBA>();

function C(c: string): RGBA {
  let v = RGBA_CACHE.get(c);
  if (!v) {
    v = hex(c);
    RGBA_CACHE.set(c, v);
  }
  return v;
}

/** Packs an RGBA into a little-endian 32-bit pixel. */
function U(c: RGBA): number {
  return ((c[3] << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
}

/** Fast raw write at a byte index (null clears). */
function put(d: Uint8ClampedArray, i: number, c: RGBA | null): void {
  if (i < 0 || i >= d.length) return;
  if (!c) {
    d[i + 3] = 0;
    return;
  }
  d[i] = c[0];
  d[i + 1] = c[1];
  d[i + 2] = c[2];
  d[i + 3] = c[3];
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Mixes two '#rrggbb' inks (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const ch = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/**
 * The unfurling curl: a 1-px Archimedean spiral (≈1.6 turns) from the centre
 * out to radius `r`, ending in a small teardrop. Pixel-perfect (no L-corners).
 */
function curl(cx: number, cy: number, r: number, dir: 1 | -1, squash = 1, rot = -Math.PI / 2): [number, number][] {
  const turns = r < 3 ? 1.15 : r < 4.5 ? 1.35 : 1.6;
  const total = turns * Math.PI * 2;
  const steps = Math.ceil(total * r * 3) + 12;
  const raw: [number, number][] = [];
  let last = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * total;
    const rad = 0.7 + (r - 0.7) * (th / total);
    const a = rot + dir * th;
    const x = Math.round(cx + Math.cos(a) * rad - 0.5);
    const y = Math.round(cy + Math.sin(a) * rad * squash - 0.5);
    const key = `${x},${y}`;
    if (key !== last) {
      raw.push([x, y]);
      last = key;
    }
  }
  // Remove L-corner pixels for a clean 1-px line.
  const pts: [number, number][] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = pts[pts.length - 1];
    const b = raw[i];
    const n = raw[i + 1];
    if (a && n && Math.abs(a[0] - n[0]) === 1 && Math.abs(a[1] - n[1]) === 1 && (b[0] === a[0] || b[1] === a[1])) continue;
    pts.push(b);
  }
  // Teardrop at the outer end: carry on along the tangent, then swell inward.
  if (pts.length > 2 && r >= 2.4) {
    const [ex, ey] = pts[pts.length - 1];
    const [qx, qy] = pts[pts.length - 2];
    const tx = Math.sign(ex - qx);
    const ty = Math.sign(ey - qy);
    pts.push([ex + tx, ey + ty]);
    const ix = Math.sign(cx - (ex + tx));
    const iy = Math.sign(cy - (ey + ty));
    if (Math.abs(cx - ex) > Math.abs(cy - ey)) pts.push([ex + tx + ix, ey + ty]);
    else pts.push([ex + tx, ey + ty + iy]);
  }
  return pts;
}

/** Carves a path: dark groove, lit lip one pixel down-right (light from upper-left). */
function carve(p: Pix, pts: [number, number][], groove: string, lip: string, onlyIf?: (x: number, y: number) => boolean): void {
  const set = new Set(pts.map(([x, y]) => y * 4096 + x));
  for (const [x, y] of pts) {
    const lx = x + 1;
    const ly = y + 1;
    if (set.has(ly * 4096 + lx)) continue;
    if (onlyIf && !onlyIf(lx, ly)) continue;
    if (!p.opaque(lx, ly)) continue;
    px(p, lx, ly, lip);
  }
  for (const [x, y] of pts) {
    if (onlyIf && !onlyIf(x, y)) continue;
    if (!p.opaque(x, y)) continue;
    px(p, x, y, groove);
  }
}

function outlineExceptTop(p: Pix, c: string): void {
  const add: [number, number][] = [];
  for (let y = 1; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.opaque(x, y)) continue;
      if (p.opaque(x - 1, y) || p.opaque(x + 1, y) || p.opaque(x, y - 1)) add.push([x, y]);
    }
  }
  for (const [x, y] of add) px(p, x, y, c);
  // Edge columns of opaque pixels become outline (keeps the silhouette within width).
  for (let y = 2; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!p.opaque(x, y)) continue;
      if (x === 0 || x === p.w - 1) px(p, x, y, c);
    }
  }
}

/** Pix.px with the hex parse cached (string inks are parsed once). */
function px(p: Pix, x: number, y: number, c: string | null): void {
  p.px(x, y, c === null ? null : C(c));
}

// ── Curved terrain material (forward-compatible seam) ────────────────────
/**
 * Colour for one pixel of authored curved ground, in the same material
 * language as drawIsland / drawCloud. The movement stream's curved-terrain
 * rasteriser can call this per pixel instead of the legacy PAL ramp:
 *
 * - `depth`: rows below the surface at this column (0 = the standable lip row)
 * - `columnDepth`: total painted rows in this column
 * - `worldX`, `worldY`: world coordinates of the pixel (y-up)
 *
 * Returns null where the material dissolves (transparent mist dither).
 */
export function terrainMaterial(kind: 'island' | 'cloud', depth: number, columnDepth: number, worldX: number, worldY: number, seed = 0, recovery = false): string | null {
  const x = Math.floor(worldX);
  const y = Math.floor(worldY);
  if (kind === 'cloud') {
    // Flat cream lip, a warm shade line, then the carved lilac belly.
    let c: string;
    if (depth < 2) c = depth === 0 ? PAPER.cream : PAPER.white;
    else if (depth < 4) c = depth === 2 ? PAPER.cream : PAPER.warm;
    else {
      const t = (depth - 4) / Math.max(1, columnDepth - 4);
      c = t < 0.3 ? CLOUD.hi : t < 0.6 ? CLOUD.light : t < 0.85 ? CLOUD.mid : CLOUD.low;
      // Carved concentric gouges: arcs of groove that echo the curl motif.
      const r = Math.hypot(((x + seed * 13) % 18) - 9, (depth - 9) * 1.4);
      if (depth > 5 && Math.abs(r - 5) < 0.5) c = CLOUD.groove;
    }
    if (depth >= columnDepth - 1) c = INK.line;
    if (recovery && depth >= 2) c = c === CLOUD.hi ? CLOUD.light : c === CLOUD.light ? CLOUD.mid : c;
    return c;
  }
  // Moored earth: meadow lip, tufted fringe, printed strata, then mist.
  if (depth < 2) return EARTH.meadowHi;
  if (depth < 4) return EARTH.meadow;
  const fringe = 6 + (((x * 7 + seed * 3) >>> 0) % 4);
  if (depth < fringe) return depth === fringe - 1 ? EARTH.meadowLow : EARTH.meadowMid;
  const toBottom = columnDepth - depth;
  if (toBottom < 16) {
    // Dissolve into the cloud sea with an ordered dither.
    const keep = toBottom / 16;
    const b = ((x & 3) * 4 + (y & 3)) / 16;
    if (b > keep) return (x + y) % 2 ? CLOUD.mid : null;
  }
  // Strata follow world height, so slopes cut through them like real bedding.
  const band = Math.floor((y + seed * 5) / 7);
  const inBand = ((y + seed * 5) % 7 + 7) % 7;
  if (inBand === 0) return EARTH.stoneLow;
  const tones = [EARTH.stone, EARTH.stoneMid, EARTH.stone, EARTH.stoneHi];
  return tones[((band % 4) + 4) % 4];
}
