import * as THREE from 'three';

// Small helpers for authoring pixel art in code on an integer grid. All
// art is drawn at 1 texel = 1 virtual pixel and sampled with nearest
// filtering; nothing here is smooth art pixelated after the fact.

export type RGBA = [number, number, number, number];

export function hex(c: string, a = 255): RGBA {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export class Pix {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /** Sets a pixel. y=0 is the top row (canvas convention). */
  px(x: number, y: number, c: RGBA | string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c === null) {
      this.data[i + 3] = 0;
      return;
    }
    const v = typeof c === 'string' ? hex(c) : c;
    this.data[i] = v[0];
    this.data[i + 1] = v[1];
    this.data[i + 2] = v[2];
    this.data[i + 3] = v[3];
  }

  get(x: number, y: number): RGBA | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  opaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA | string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  hline(x0: number, x1: number, y: number, c: RGBA | string): void {
    const a = Math.round(Math.min(x0, x1));
    const b = Math.round(Math.max(x0, x1));
    for (let x = a; x <= b; x++) this.px(x, y, c);
  }

  /** Filled ellipse using pixel centres (crisp, symmetric shapes). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | string, onlyIf?: (x: number, y: number) => boolean): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!onlyIf || onlyIf(x, y))) this.px(x, y, c);
      }
    }
  }

  /** A thick line made of square dabs. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA | string, thick = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.rect(Math.round(x - (thick - 1) / 2), Math.round(y - (thick - 1) / 2), thick, thick, c);
    }
  }

  /** Adds a 1px outline around all opaque pixels (4-neighbour). */
  outline(c: RGBA | string): void {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.px(x, y, c);
  }

  /** Replaces every opaque pixel with one colour (silhouettes). */
  tint(c: RGBA | string): void {
    const v = typeof c === 'string' ? hex(c) : c;
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      this.data[i] = v[0];
      this.data[i + 1] = v[1];
      this.data[i + 2] = v[2];
    }
  }

  blit(src: Pix, ox: number, oy: number, flip = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(flip ? src.w - 1 - x : x, y);
        if (c) this.px(ox + x, oy + y, c);
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.w, this.h), 0, 0);
    return cv;
  }

  toTexture(): THREE.Texture {
    return pixelTexture(this.toCanvas());
  }
}

export function pixelTexture(source: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(source);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Deterministic PRNG for cosmetic variation (never used for gameplay). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ── 3×5 pixel font ─────────────────────────────────────────────────────────
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  "'": '010010000000000', '-': '000000111000000', ':': '000010000010000', '♥': '101111111010000',
  '/': '001001010100100', ' ': '000000000000000',
};

export function textWidth(line: string): number {
  return Math.max(0, line.length * 4 - 1);
}

/** Draws uppercase pixel text; '\n' starts a new line (6px line height). */
export function drawText(p: Pix, text: string, x: number, y: number, c: RGBA | string, align: 'left' | 'center' = 'left'): void {
  text
    .toUpperCase()
    .split('\n')
    .forEach((line, li) => {
      const lx = align === 'center' ? Math.round(x - textWidth(line) / 2) : x;
      [...line].forEach((ch, ci) => {
        const g = GLYPHS[ch] ?? GLYPHS['?'];
        for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) if (g[r * 3 + col] === '1') p.px(lx + ci * 4 + col, y + li * 6 + r, c);
      });
    });
}
