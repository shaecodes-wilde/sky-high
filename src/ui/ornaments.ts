import { ACCENT, CLOUD, INK, PAPER, SKY } from '../render/palette';
import { drawText, Pix, textWidth } from '../render/pixel';

// Skyprint Folklore UI ornaments, authored in code on the same integer grid
// as the world art (1 texel = 1 virtual pixel, shown with image-rendering:
// pixelated and sized with the --u custom property). Nothing here is
// fetched: every mark is drawn from palette tokens at load.

type Pt = [number, number];

/** Pixel-perfect polyline: rounds samples to the grid and drops L-corners. */
function pathPixels(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const [x, y] of pts) {
    const p: Pt = [Math.round(x), Math.round(y)];
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
    // Remove the middle of any L-shaped triple so the line stays 1 px.
    if (out.length >= 3) {
      const [a, , c] = out.slice(-3);
      if (Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1) out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** Archimedean spiral samples from radius r0 → r1 over `turns`. */
function spiral(cx: number, cy: number, r0: number, r1: number, a0: number, turns: number, dir: 1 | -1): Pt[] {
  const pts: Pt[] = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + dir * turns * Math.PI * 2 * t;
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function stamp(p: Pix, rows: string[], ox: number, oy: number, map: Record<string, string>): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => map[ch] && p.px(ox + x, oy + y, map[ch])));
}

function mirror(src: Pix): Pix {
  const p = new Pix(src.w, src.h);
  p.blit(src, 0, 0, true);
  return p;
}

const url = (p: Pix) => `url(${p.toCanvas().toDataURL()})`;

// ── Individual marks ──────────────────────────────────────────────────────

/** ⊕ — the printer's registration mark (9×9). */
export function regMark(c: string = INK.ink): Pix {
  const p = new Pix(9, 9);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d > 2.5 && d < 3.6) p.px(x, y, c);
    }
  p.hline(0, 8, 4, c);
  for (let y = 0; y < 9; y++) p.px(4, y, c);
  return p;
}

/** The unfurling curl (spiral → tail → petal), petal pointing left. 26×11. */
export function curlOrnament(line: string = INK.line, petal: string = ACCENT.coral): Pix {
  const p = new Pix(26, 11);
  const pts = spiral(20.5, 4.5, 0.6, 4.1, -Math.PI / 2, 1.6, 1);
  // Continue from the spiral's outer end into a gentle tail heading left.
  const [ex, ey] = pts[pts.length - 1];
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    pts.push([ex - t * 13, ey + Math.sin(t * Math.PI) * 0.9 - t * 2.2]);
  }
  for (const [x, y] of pathPixels(pts)) p.px(x, y, line);
  // Teardrop petal at the tail's tip, pointing outward.
  stamp(p, ['..oo.', '.oxxo', 'oxxxo', '.oxo.', '..o..'], 1, 3, { o: line, x: petal });
  return p;
}

/** Small closed bud for list bullets / focus pointer (7×7). */
export function budMark(fill: string = ACCENT.coral, line: string = INK.ink): Pix {
  const p = new Pix(7, 7);
  stamp(p, ['..o....', '.oxo...', 'oxxxo..', 'oxxxxo.', '.oxxxxo', '..oxxo.', '...oo..'], 0, 0, { o: line, x: fill });
  return p;
}

const NOTE = ['...#..', '...##.', '...#.#', '...#..', '...#..', '.###..', '####..', '####..', '.##...'];

/** HUD melody pip: gold note when found, a hollow engraved note when missing. */
export function notePip(found: boolean): Pix {
  const p = new Pix(8, 11);
  stamp(p, NOTE, 1, 1, { '#': found ? ACCENT.gold : INK.soft });
  if (found) {
    p.px(2, 7, ACCENT.goldHi);
    p.px(4, 2, ACCENT.goldHi);
  }
  p.outline(found ? INK.ink : CLOUD.groove);
  if (!found) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.get(x, y)?.[0] === 0x5a) p.px(x, y, null);
  return p;
}

/** HUD sun-seed: a small gold coin with a seed slit (7×7 + outline). */
export function seedPip(): Pix {
  const p = new Pix(9, 9);
  p.ellipse(4.5, 4.5, 3.4, 3.4, ACCENT.gold);
  p.px(3, 2, ACCENT.goldHi);
  p.px(2, 3, ACCENT.goldHi);
  for (let y = 3; y <= 5; y++) p.px(4, y, ACCENT.goldDeep);
  p.outline(INK.ink);
  return p;
}

/** HUD Bloom curl, one ink per tier: quiet lilac → gold plate → mint & petal plates. */
export function bloomCurl(tier: 0 | 1 | 2): Pix {
  const p = new Pix(13, 11);
  const line = tier === 0 ? CLOUD.light : tier === 1 ? ACCENT.gold : ACCENT.mint;
  const pts = spiral(6.5, 5, 0.5, 4.3, -Math.PI / 2, 1.75, 1);
  for (const [x, y] of pathPixels(pts)) p.px(x, y, line);
  if (tier > 0) p.px(6, 5, tier === 2 ? ACCENT.petal : ACCENT.goldHi);
  if (tier === 2) stamp(p, ['.x.', 'xxx', '.x.'], 10, 0, { x: ACCENT.petal });
  return p;
}

/** Repeating halftone dot tile (4×4). */
export function dotTile(c: string): Pix {
  const p = new Pix(4, 4);
  p.px(1, 1, c);
  return p;
}

/** A short carved cloud lip that a portrait hero stands on (36×8). */
export function cloudLip(): Pix {
  const w = 36;
  const p = new Pix(w, 9);
  for (let i = 0; i < 6; i++) p.ellipse(3 + i * 6, 4.5, 3.6, 3.4, CLOUD.light);
  for (let i = 0; i < 5; i++) p.ellipse(6 + i * 6, 6, 2.2, 1.6, CLOUD.mid);
  p.rect(1, 0, w - 2, 2, PAPER.cream);
  p.hline(2, w - 3, 0, PAPER.white);
  p.hline(1, w - 2, 2, CLOUD.hi);
  for (let i = 0; i < 5; i++) {
    p.px(6 + i * 6, 5, CLOUD.groove);
    p.px(7 + i * 6, 5, CLOUD.groove);
    p.px(7 + i * 6, 4, CLOUD.groove);
  }
  p.outline(INK.line);
  return p;
}

// ── Pixel lettering for the HUD (3×5 font, shared with in-world signs) ──────

/** A canvas that redraws 3×5 pixel text only when its string changes. */
export class PixText {
  readonly canvas = document.createElement('canvas');
  private text = '\u0000';

  constructor(
    private color: string,
    private shade: string | null = null,
    private cell = 1,
  ) {
    this.canvas.className = 'pixtext';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const t = text.replace(/−/g, '-').replace(/[·•]/g, ' ');
    const w = Math.max(1, textWidth(t) + (this.shade ? 1 : 0));
    const h = 5 + (this.shade ? 1 : 0);
    const p = new Pix(w, h);
    if (this.shade) drawText(p, t, 1, 1, this.shade);
    drawText(p, t, 0, 0, this.color);
    const cv = this.canvas;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), w, h), 0, 0);
    cv.style.width = `calc(var(--u) * ${w * this.cell})`;
    cv.style.height = `calc(var(--u) * ${h * this.cell})`;
  }
}

// ── The CLOUDBLOOM wordmark ────────────────────────────────────────────────

// Carved-block letters on a coarse cell grid (1 cell = 4 px), smoothed by a
// majority filter so corners round like gouged wood, then printed as three
// plates: mint and coral colour plates under an ink key with a cream face.
const CELL = 4;
const GAP = 3;
const LETTERS: Record<string, string[]> = {
  C: ['.###.', '#...#', '#....', '#....', '#...#', '.###.'],
  L: ['#...', '#...', '#...', '#...', '#...', '####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#..#.', '###..'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '####.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#'],
};

export interface Wordmark {
  el: HTMLElement;
}

export function buildWordmark(word = 'CLOUDBLOOM'): Wordmark {
  const PAD_X = 10;
  const PAD_T = 6;
  const glyphH = 6 * CELL;
  const glyphW = [...word].reduce((s, ch) => s + LETTERS[ch][0].length * CELL, 0) + GAP * (word.length - 1);
  const W = glyphW + PAD_X * 2;
  const H = PAD_T + glyphH + 16;
  const base = PAD_T;

  // 1. Cell mask → pixel mask.
  const raw = new Uint8Array(W * H);
  let cx = PAD_X;
  const letterX: number[] = [];
  for (const ch of word) {
    const g = LETTERS[ch];
    letterX.push(cx);
    g.forEach((row, r) =>
      [...row].forEach((v, c) => {
        if (v !== '#') return;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) raw[(base + r * CELL + y) * W + cx + c * CELL + x] = 1;
      }),
    );
    cx += g[0].length * CELL + GAP;
  }
  // 2. Majority filter (5×5, ≥12) rounds convex corners and fillets concave ones.
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) n += raw[(y + j) * W + x + i] ?? 0;
      m[y * W + x] = n >= 12 ? 1 : 0;
    }
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;

  // 3. Key plate: carved face (cream lip, lilac belly, groove) + ink outline + 1 px block depth.
  const key = new Pix(W, H);
  const belly = base + Math.round(glyphH * 0.62);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      let c: string = PAPER.cream;
      if (!on(x, y - 1)) c = PAPER.white;
      else if (y === belly) c = CLOUD.light;
      else if (y > belly) c = on(x, y + 1) ? CLOUD.hi : CLOUD.light;
      key.px(x, y, c);
    }
  key.outline(INK.ink);
  // Block depth: one extra ink row under every bottom edge.
  for (let y = H - 2; y >= 0; y--) for (let x = 0; x < W; x++) if (key.opaque(x, y) && !key.opaque(x, y + 1)) key.px(x, y + 1, INK.ink);

  // 4. The curl swash: a spiral under the C that unfurls into a tail and a petal after the M.
  const swY = base + glyphH + 7;
  const pts = spiral(PAD_X + 1, swY - 3.5, 0.6, 3.6, -Math.PI / 2, 1.6, -1);
  const [sx, sy] = pts[pts.length - 1];
  const tailEnd = W - PAD_X - 4;
  for (let i = 1; i <= 160; i++) {
    const t = i / 160;
    pts.push([sx + (tailEnd - sx) * t, sy + Math.sin(t * Math.PI) * 1.6 - t * 3]);
  }
  const sw = pathPixels(pts);
  for (const [x, y] of sw) {
    key.px(x, y, INK.ink);
    key.px(x, y + 1, INK.ink);
  }
  // Petal at the tip.
  const tx = Math.round(tailEnd);
  const ty = Math.round(swY - 3.5 - 3);
  stamp(key, ['.ooo..', 'oxxxo.', 'oxhxxo', 'oxxxxo', '.oxxo.', '..oo..'], tx - 1, ty - 4, { o: INK.ink, x: ACCENT.petal, h: ACCENT.petalHi });

  // 5. Colour plates are flat silhouettes of the key.
  const plate = (c: string) => {
    const p = new Pix(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (key.opaque(x, y)) p.px(x, y, c);
    return p;
  };
  // A mint plate stripe across the bellies (the second ink of the edition).
  const el = document.createElement('div');
  el.className = 'wordmark';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Cloudbloom');
  el.style.width = `calc(var(--u) * ${W})`;
  el.style.height = `calc(var(--u) * ${H})`;
  for (const [cls, pix] of [
    ['plate mint', plate(ACCENT.mint)],
    ['plate coral', plate(ACCENT.coralHi)],
    ['plate key', key],
  ] as [string, Pix][]) {
    const cv = pix.toCanvas();
    cv.className = cls;
    cv.setAttribute('aria-hidden', 'true');
    el.append(cv);
  }
  void letterX;
  return { el };
}

// ── Install as CSS custom properties ───────────────────────────────────────

let installed = false;

/** Publishes the ornament sprites as CSS variables on the UI root (once). */
export function installOrnaments(root: HTMLElement): void {
  if (installed) return;
  installed = true;
  const curl = curlOrnament();
  const vars: Record<string, string> = {
    '--orn-reg': url(regMark()),
    '--orn-reg-soft': url(regMark(INK.soft)),
    '--orn-reg-cream': url(regMark(PAPER.cream)),
    '--orn-curl-l': url(curl),
    '--orn-curl-r': url(mirror(curl)),
    '--orn-curl-cream-l': url(curlOrnament(PAPER.cream, ACCENT.petal)),
    '--orn-curl-cream-r': url(mirror(curlOrnament(PAPER.cream, ACCENT.petal))),
    '--orn-bud': url(budMark()),
    '--orn-bud-gold': url(budMark(ACCENT.gold)),
    '--orn-note-on': url(notePip(true)),
    '--orn-note-off': url(notePip(false)),
    '--orn-seed': url(seedPip()),
    '--orn-bloom-0': url(bloomCurl(0)),
    '--orn-bloom-1': url(bloomCurl(1)),
    '--orn-bloom-2': url(bloomCurl(2)),
    '--orn-dots-sky': url(dotTile(SKY.high)),
    '--orn-dots-paper': url(dotTile(PAPER.warm)),
    '--orn-cloud-lip': url(cloudLip()),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // The letterbox (outside the game rect) gets the press-bed dots too.
  document.documentElement.style.setProperty('--orn-dots-bed', url(dotTile(INK.plum)));
}
