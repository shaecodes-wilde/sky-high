import * as THREE from 'three';
import { ACCENT, CLOUD, PAPER } from './palette';
import { Pix } from './pixel';

// Shaped one-shot effects: small baked flip-book sprites (impact rings, dash
// gouges, rebound arcs) drawn in the print language. Pooled meshes, one
// texture swap per frame each. Purely cosmetic.

export type BurstKind = 'land' | 'landHard' | 'dash' | 'spring' | 'ring' | 'checkpoint' | 'fragment' | 'jump' | 'bloomRing';

interface Def {
  frames: THREE.Texture[];
  fps: number;
  w: number;
  h: number;
  /** Anchor: 'b' = bottom-centre at (x,y), 'c' = centred. */
  anchor: 'b' | 'c';
  /** Optional render order (defaults to the pool's FX order). */
  order?: number;
}

interface Live {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  def: Def | null;
  t: number;
}

const POOL = 28;

/** A dotted ring: every `step`-th pixel along an ellipse, optionally only the top half. */
function ring(p: Pix, cx: number, cy: number, rx: number, ry: number, c: string, step: number, phase = 0, upperOnly = false): void {
  const n = Math.max(8, Math.round((rx + ry) * 3.2));
  for (let i = 0; i < n; i++) {
    if ((i + phase) % step !== 0) continue;
    const a = (i / n) * Math.PI * 2;
    const y = cy - Math.sin(a) * ry;
    if (upperOnly && y > cy + 0.5) continue;
    p.px(Math.round(cx + Math.cos(a) * rx - 0.5), Math.round(y - 0.5), c);
  }
}

function frames(n: number, w: number, h: number, draw: (p: Pix, k: number, t: number) => void): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (let k = 0; k < n; k++) {
    const p = new Pix(w, h);
    draw(p, k, n === 1 ? 1 : k / (n - 1));
    out.push(p.toTexture());
  }
  return out;
}

function buildDefs(): Record<BurstKind, Def> {
  return {
    // Soft landing: a flat carved ripple spreading along the surface.
    land: {
      w: 40,
      h: 8,
      anchor: 'b',
      fps: 22,
      frames: frames(5, 40, 8, (p, k, t) => {
        const rx = 5 + t * 14;
        ring(p, 20, 6, rx, 1.6 + t * 1.4, k < 3 ? PAPER.cream : CLOUD.hi, k < 2 ? 1 : 2, 0, true);
        if (k < 3) {
          p.px(20 - Math.round(rx) - 1, 6, PAPER.white);
          p.px(20 + Math.round(rx), 6, PAPER.white);
        }
      }),
    },
    // Heavy landing: double ripple plus kicked-up chips.
    landHard: {
      w: 56,
      h: 14,
      anchor: 'b',
      fps: 20,
      frames: frames(6, 56, 14, (p, k, t) => {
        const rx = 6 + t * 20;
        ring(p, 28, 11, rx, 2 + t * 2, k < 3 ? PAPER.white : PAPER.cream, k < 3 ? 1 : 2, 0, true);
        if (t > 0.2) ring(p, 28, 11, rx * 0.6, 1.2 + t, CLOUD.hi, 2, 1, true);
        for (let s = -1; s <= 1; s += 2) {
          for (let j = 0; j < 3; j++) {
            const x = 28 + s * (6 + j * 4 + t * 10);
            const y = 10 - Math.sin(Math.min(1, t * 1.4) * Math.PI) * (4 + j * 2);
            if (k < 5) p.px(Math.round(x), Math.round(y), j === 1 ? PAPER.cream : CLOUD.hi);
          }
        }
      }),
    },
    // Take-off puff: two tiny curls flicking out from the feet.
    jump: {
      w: 20,
      h: 8,
      anchor: 'b',
      fps: 24,
      frames: frames(4, 20, 8, (p, k, t) => {
        const r = 2 + t * 5;
        ring(p, 10 - r, 4, 1.5 + t, 1.5 + t, PAPER.cream, k < 2 ? 1 : 2);
        ring(p, 10 + r, 4, 1.5 + t, 1.5 + t, PAPER.cream, k < 2 ? 1 : 2);
      }),
    },
    // Dash: horizontal gouge strokes left behind (drawn facing right; mirrored by direction).
    dash: {
      w: 40,
      h: 24,
      anchor: 'c',
      fps: 26,
      frames: frames(6, 40, 24, (p, k, t) => {
        const lines: [number, number, string][] = [
          [6, 22, ACCENT.mintHi],
          [11, 30, PAPER.white],
          [15, 18, ACCENT.mint],
          [19, 26, PAPER.cream],
        ];
        for (const [y, len, c] of lines) {
          const x1 = 38 - Math.round(t * 10);
          const x0 = x1 - Math.round(len * (1 - t * 0.8));
          if (x1 > x0) p.hline(x0, x1, y, c);
        }
        if (k === 0) ring(p, 36, 12, 4, 7, PAPER.white, 1);
      }),
    },
    // Springcap: coral rebound arcs rising off the cap.
    spring: {
      w: 40,
      h: 24,
      anchor: 'b',
      fps: 20,
      frames: frames(6, 40, 24, (p, k, t) => {
        ring(p, 20, 20, 8 + t * 12, 3 + t * 8, k < 3 ? ACCENT.coralHi : ACCENT.petal, k < 2 ? 1 : 2, 0, true);
        if (t > 0.15) ring(p, 20, 20, 4 + t * 8, 2 + t * 5, PAPER.cream, 2, 1, true);
      }),
    },
    // Dewdrop refill: a mint ring opens outward.
    ring: {
      w: 48,
      h: 48,
      anchor: 'c',
      fps: 22,
      frames: frames(6, 48, 48, (p, k, t) => {
        ring(p, 24, 24, 9 + t * 13, 9 + t * 13, k < 3 ? ACCENT.mintHi : ACCENT.mint, k < 2 ? 1 : 2);
        if (t > 0.2) ring(p, 24, 24, 6 + t * 7, 6 + t * 7, ACCENT.mint, 3, k);
      }),
    },
    // Checkpoint: petal plates pressed in a circle.
    checkpoint: {
      w: 48,
      h: 48,
      anchor: 'c',
      fps: 14,
      frames: frames(7, 48, 48, (p, k, t) => {
        const r = 6 + t * 16;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + t * 1.2;
          const x = 24 + Math.cos(a) * r;
          const y = 24 + Math.sin(a) * r;
          const s = k < 5 ? 1.6 : 1;
          p.ellipse(x, y, s, s, i % 2 ? ACCENT.petal : ACCENT.petalHi);
        }
        if (k < 4) ring(p, 24, 24, r * 0.6, r * 0.6, ACCENT.goldHi, 3, k);
      }),
    },
    // Melody fragment: concentric gold rings like a struck bell.
    fragment: {
      w: 64,
      h: 64,
      anchor: 'c',
      fps: 16,
      frames: frames(8, 64, 64, (p, k, t) => {
        for (let j = 0; j < 3; j++) {
          const tt = t - j * 0.18;
          if (tt <= 0) continue;
          const r = 6 + tt * 26;
          ring(p, 32, 32, r, r, j === 0 ? ACCENT.goldHi : j === 1 ? ACCENT.gold : PAPER.cream, tt < 0.4 ? 1 : 2, k);
        }
      }),
    },
    // Petal Parade: a great sound-wave ring rolling out of the giant flower.
    bloomRing: {
      // Behind the play plane: it belongs to the sky set piece, never in front of a landing.
      order: 4.5,
      w: 220,
      h: 220,
      anchor: 'c',
      fps: 12,
      frames: frames(10, 220, 220, (p, k, t) => {
        const r = 40 + t * 66;
        const step = t < 0.5 ? 1 : t < 0.8 ? 2 : 3;
        ring(p, 110, 110, r, r, k < 4 ? ACCENT.goldHi : k < 7 ? ACCENT.petalHi : ACCENT.petal, step, k);
        if (t > 0.1) ring(p, 110, 110, r - 5, r - 5, ACCENT.petal, step + 1, k + 1);
        // Petal ticks on the ring, like notes on a circular staff.
        for (let i = 0; i < 12; i++) {
          if ((i + k) % 3) continue;
          const a = (i / 12) * Math.PI * 2 + t * 0.6;
          p.ellipse(110 + Math.cos(a) * r, 110 + Math.sin(a) * r, 1.6, 1.6, k < 6 ? ACCENT.goldHi : PAPER.cream);
        }
      }),
    },
  };
}

export class Bursts {
  private defs = buildDefs();
  private pool: Live[] = [];
  private geo = new Map<string, THREE.PlaneGeometry>();
  private next = 0;
  enabled = true;

  constructor(
    scene: THREE.Scene,
    private renderOrder: number,
  ) {
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder;
      scene.add(mesh);
      this.pool.push({ mesh, def: null, t: 0 });
    }
  }

  private geometry(d: Def): THREE.PlaneGeometry {
    const key = `${d.w}x${d.h}${d.anchor}`;
    let g = this.geo.get(key);
    if (!g) {
      g = new THREE.PlaneGeometry(d.w, d.h);
      if (d.anchor === 'b') g.translate(0, d.h / 2, 0);
      this.geo.set(key, g);
    }
    return g;
  }

  /** Spawns a burst; `dir` mirrors directional effects (dash). */
  spawn(kind: BurstKind, x: number, y: number, dir: -1 | 1 = 1): void {
    if (!this.enabled) return;
    const d = this.defs[kind];
    const live = this.pool[this.next];
    this.next = (this.next + 1) % POOL;
    live.def = d;
    live.t = 0;
    live.mesh.geometry = this.geometry(d);
    live.mesh.material.map = d.frames[0];
    live.mesh.material.needsUpdate = true;
    // Odd-sized sprites stay on the pixel grid when centred.
    const ox = d.w % 2 ? 0.5 : 0;
    const oy = d.anchor === 'c' && d.h % 2 ? 0.5 : 0;
    live.mesh.position.set(Math.round(x) + ox, Math.round(y) + oy, 0);
    live.mesh.scale.x = dir;
    live.mesh.renderOrder = d.order ?? this.renderOrder;
    live.mesh.visible = true;
  }

  update(dt: number): void {
    for (const l of this.pool) {
      if (!l.def) continue;
      l.t += dt;
      const f = Math.floor(l.t * l.def.fps);
      if (f >= l.def.frames.length) {
        l.def = null;
        l.mesh.visible = false;
        continue;
      }
      if (l.mesh.material.map !== l.def.frames[f]) l.mesh.material.map = l.def.frames[f];
    }
  }

  clear(): void {
    for (const l of this.pool) {
      l.def = null;
      l.mesh.visible = false;
    }
  }
}
