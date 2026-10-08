import * as THREE from 'three';
import { hex } from './pixel';

// Pooled square-pixel particles in a single draw call. Purely cosmetic.

export type ParticleKind = 'dust' | 'petal' | 'spore' | 'droplet' | 'sparkle' | 'puff' | 'dew' | 'gold' | 'confetti' | 'wake' | 'mint';

interface Spec {
  colors: string[];
  speed: [number, number];
  up: number;
  gravity: number;
  life: [number, number];
  size: [number, number];
  drag: number;
  spread: number;
}

const SPECS: Record<ParticleKind, Spec> = {
  dust: { colors: ['#ffffff', '#e8defa', '#d5c8f2'], speed: [20, 60], up: 10, gravity: 40, life: [0.25, 0.45], size: [1, 2], drag: 3, spread: Math.PI },
  petal: { colors: ['#ff9fd0', '#ffd6eb', '#ffb8dd'], speed: [10, 40], up: 20, gravity: -8, life: [0.6, 1.1], size: [2, 2], drag: 1.5, spread: Math.PI },
  spore: { colors: ['#fff6ea', '#ffe6a8'], speed: [6, 24], up: 18, gravity: -12, life: [0.7, 1.3], size: [1, 1], drag: 1, spread: Math.PI },
  droplet: { colors: ['#9fe8ff', '#e8fdff', '#6fd2f0'], speed: [30, 80], up: 60, gravity: 320, life: [0.3, 0.6], size: [1, 2], drag: 0.5, spread: Math.PI },
  sparkle: { colors: ['#fff8d0', '#ffffff', '#ffe27a'], speed: [20, 70], up: 0, gravity: 0, life: [0.25, 0.5], size: [1, 2], drag: 4, spread: Math.PI },
  puff: { colors: ['#ffffff', '#f2ebff', '#d9ccf6'], speed: [30, 90], up: 10, gravity: -20, life: [0.4, 0.7], size: [2, 4], drag: 4, spread: Math.PI },
  dew: { colors: ['#86f0ff', '#e8fdff'], speed: [40, 90], up: 0, gravity: 0, life: [0.25, 0.45], size: [1, 2], drag: 5, spread: Math.PI },
  gold: { colors: ['#ffd447', '#fff3a8'], speed: [20, 60], up: 30, gravity: 60, life: [0.3, 0.5], size: [1, 1], drag: 2, spread: Math.PI },
  confetti: { colors: ['#ff9fd0', '#ffd447', '#9ff0d0', '#b9a8ff', '#ffffff'], speed: [40, 120], up: 80, gravity: 70, life: [1.2, 2.2], size: [2, 2], drag: 1.2, spread: Math.PI },
  wake: { colors: ['#ff9fd0', '#ffd447', '#9ff0d0', '#ffffff'], speed: [4, 16], up: 6, gravity: -6, life: [0.5, 0.9], size: [1, 2], drag: 1, spread: Math.PI },
  mint: { colors: ['#9ff0d0', '#ddfff1', '#73d9b4'], speed: [18, 42], up: 12, gravity: 25, life: [0.18, 0.32], size: [1, 2], drag: 4, spread: Math.PI * 0.6 },
};

const MAX = 900;

export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private x = new Float32Array(MAX);
  private y = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private next = 0;
  private remainder: Partial<Record<ParticleKind, number>> = {};
  scale = 1;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          if (vColor.a < 0.02) discard;
          gl_FragColor = vColor;
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
  }

  emit(kind: ParticleKind, x: number, y: number, count: number, dirX = 0, dirY = 0): void {
    const s = SPECS[kind];
    // Carry fractional single-particle emissions so Gentle also halves a wake
    // emitted one pixel at a time. Work remains bounded by the existing pool.
    const budget = Math.max(0, Math.min(MAX, count * this.scale)) + (this.remainder[kind] ?? 0);
    const n = Math.floor(budget);
    this.remainder[kind] = budget - n;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.atan2(dirY, dirX) + (Math.random() * 2 - 1) * s.spread;
      const sp = s.speed[0] + Math.random() * (s.speed[1] - s.speed[0]);
      const base = dirX === 0 && dirY === 0 ? Math.random() * Math.PI * 2 : a;
      this.x[i] = x + (Math.random() * 4 - 2);
      this.y[i] = y + (Math.random() * 4 - 2);
      this.vx[i] = Math.cos(base) * sp;
      this.vy[i] = Math.sin(base) * sp + s.up;
      this.maxLife[i] = s.life[0] + Math.random() * (s.life[1] - s.life[0]);
      this.life[i] = this.maxLife[i];
      this.grav[i] = s.gravity;
      this.drag[i] = s.drag;
      this.size[i] = Math.round(s.size[0] + Math.random() * (s.size[1] - s.size[0]));
      const c = hex(s.colors[Math.floor(Math.random() * s.colors.length)]);
      this.col[i * 4] = c[0] / 255;
      this.col[i * 4 + 1] = c[1] / 255;
      this.col[i * 4 + 2] = c[2] / 255;
      this.col[i * 4 + 3] = 1;
    }
  }

  /** Clears everything (restart, title). */
  clear(): void {
    this.life.fill(0);
    this.col.fill(0);
    this.remainder = {};
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.pos[i * 3] = Math.round(this.x[i]) + 0.5;
      this.pos[i * 3 + 1] = Math.round(this.y[i]) + 0.5;
      const t = this.life[i] / this.maxLife[i];
      // Fade by thinning rather than translucency: stay crisp, then blink out.
      this.col[i * 4 + 3] = t > 0.25 ? 1 : t > 0.12 ? 0.6 : 0.3;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}
