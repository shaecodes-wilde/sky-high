import * as THREE from 'three';
import { VIEW_H, VIEW_W } from './CameraRig';
import { ACCENT, SKY, vec3 } from './palette';
import { Pix, pixelTexture, rng } from './pixel';

// Background — "Skyprint Folklore" depth planes (docs/ART_BIBLE.md).
//
// P0  Sky: a two-ink risograph gradient printed through a 45° clustered-dot
//     halftone screen, with the song staff, the sleeping sun's rings, the
//     Petal Parade edition and the ending dawn.
// P1  Far: wind-organ islands (one landmark, the Bell Organ).
// P1b Distant carved cloud cliffs on the horizon.
// P2  Mid: carved cloud banks with unfurling curls.
// P3  Near: a cloud-sea of big rolling curls.
//
// Parallax strips are baked to textures once. Each strip is drawn by a small
// shader that re-lights it against the *current* sky edition (so it always
// desaturates toward whatever the sky is doing), adds Bloom plates from a
// baked accent mask, and during the Parade prints a misregistered plate.
// The strips share the sky's uniform objects, so whatever the renderer feeds
// the sky drives the whole background with no extra wiring.

// ── shared uniforms ────────────────────────────────────────────────────────

interface SkyUniforms {
  [k: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uBloom: THREE.IUniform<number>;
  uParade: THREE.IUniform<number>;
  uDistort: THREE.IUniform<number>;
  uSpectacle: THREE.IUniform<number>;
  uDawn: THREE.IUniform<number>;
  uDim: THREE.IUniform<number>;
  uFlower: THREE.IUniform<THREE.Vector2>;
  uCam: THREE.IUniform<THREE.Vector2>;
  /** 0..1 smoothed player flow energy. < 0 = derive from Bloom. */
  uEnergy: THREE.IUniform<number>;
  /** 0..3 continuous mood (quiet/stirring/singing/spectacular). < 0 = derive from Bloom + Parade. */
  uMood: THREE.IUniform<number>;
  /** 0..1 Parade reveal (how far the floral edition has spread). < 0 = follow uParade. */
  uReveal: THREE.IUniform<number>;
}

function makeSkyUniforms(): SkyUniforms {
  return {
    uTime: { value: 0 },
    uBloom: { value: 0 },
    uParade: { value: 0 },
    uDistort: { value: 0 },
    uSpectacle: { value: 1 },
    uDawn: { value: 0 },
    uDim: { value: 0 },
    uFlower: { value: new THREE.Vector2(240, 160) },
    uCam: { value: new THREE.Vector2(0, 160) },
    uEnergy: { value: -1 },
    uMood: { value: -1 },
    uReveal: { value: -1 },
  };
}

/** The most recently created sky's uniforms; parallax strips bind to the same objects. */
let sharedSky: SkyUniforms | null = null;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vScreen;
void main() {
  vUv = uv;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = c;
  vScreen = (c.xy / c.w * 0.5 + 0.5) * vec2(${VIEW_W}.0, ${VIEW_H}.0);
}`;

const H = (c: string) => vec3(c);

// Common GLSL: uniforms, hashing, the halftone screen and the sky editions.
const COMMON = /* glsl */ `
uniform float uTime;
uniform float uBloom;
uniform float uParade;
uniform float uDistort;
uniform float uSpectacle;
uniform float uDawn;
uniform float uDim;
uniform float uEnergy;
uniform float uMood;
uniform float uReveal;
uniform vec2 uFlower;
uniform vec2 uCam;
varying vec2 vUv;
varying vec2 vScreen;

float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 45° clustered-dot halftone screen: 0 at a dot centre, ~1 at the cell corner.
// Lattice vectors (3,3) and (3,-3): dots ~4.2 px apart, like a coarse riso screen.
float dotScreen(vec2 p) {
  vec2 q = vec2(p.x + p.y, p.x - p.y) / 6.0;
  vec2 f = fract(q) - 0.5;
  return length(f) * 1.4142;
}

float moodLevel() { return uMood >= 0.0 ? uMood : clamp(uBloom * 2.5 + uParade * 3.0, 0.0, 3.0); }
float energyLevel() { return uEnergy >= 0.0 ? uEnergy : uBloom * 0.6; }
float revealLevel() { return uReveal >= 0.0 ? uReveal : uParade; }

vec3 edition(vec3 rest, vec3 bloom, vec3 parade, vec3 dawn, vec3 w) {
  return mix(mix(mix(rest, bloom, w.x), parade, w.y), dawn, w.z);
}

// Five ink stops, horizon (0) to zenith (4). w = (bloom, parade, dawn) edition weights.
void skyStops(vec3 w, out vec3 c0, out vec3 c1, out vec3 c2, out vec3 c3, out vec3 c4) {
  c0 = edition(${H('#fdd5bf')}, ${H(SKY.horizonBloom)}, ${H('#ffc08e')}, ${H('#ffe2a4')}, w);
  c1 = edition(${H(SKY.low)}, ${H('#f6bccd')}, ${H('#ee8eae')}, ${H('#ffcf9e')}, w);
  c2 = edition(${H(SKY.mid)}, ${H('#dcb2e2')}, ${H('#c472b8')}, ${H('#f6b8b2')}, w);
  c3 = edition(${H(SKY.high)}, ${H('#b49be2')}, ${H('#905cb8')}, ${H('#d9a2cd')}, w);
  c4 = edition(${H(SKY.zenith)}, ${H(SKY.zenithBloom)}, ${H('#6648a4')}, ${H('#a98ad6')}, w);
}

vec3 editionWeights() {
  return vec3(clamp(uBloom, 0.0, 1.0) * 0.85, clamp(uParade, 0.0, 1.0) * (0.55 + 0.45 * uSpectacle), clamp(uDawn, 0.0, 1.0));
}

// Height in the sky for a screen row (the sky scrolls a little with the camera).
float skyT(float sy) { return clamp((sy + (uCam.y - 160.0) * 0.2) / ${VIEW_H}.0, 0.0, 0.9999); }

void skyRamp(float t, vec3 w, out vec3 a, out vec3 b, out float f) {
  vec3 c0, c1, c2, c3, c4;
  skyStops(w, c0, c1, c2, c3, c4);
  float s = t * 4.0;
  float k = floor(s);
  f = s - k;
  a = k < 1.0 ? c0 : k < 2.0 ? c1 : k < 3.0 ? c2 : c3;
  b = k < 1.0 ? c1 : k < 2.0 ? c2 : k < 3.0 ? c3 : c4;
}

// Printed version: eight flat ink bands (stops + their midpoints) joined by
// short halftone transitions, so adjacent inks are close and the dots stay quiet.
vec3 skyPrint(float t, vec3 w, float scr) {
  vec3 a, b; float f;
  skyRamp(t, w, a, b, f);
  vec3 m = mix(a, b, 0.5);
  vec3 lo = f < 0.5 ? a : m;
  vec3 hi = f < 0.5 ? m : b;
  float g = fract(f * 2.0);
  float tr = clamp((g - 0.3) / 0.55, 0.0, 1.0);
  tr = floor(tr * 4.0 + 0.5) / 4.0;
  return scr < tr ? hi : lo;
}

vec3 skySmooth(float sy, vec3 w) {
  vec3 a, b; float f;
  skyRamp(skyT(sy), w, a, b, f);
  return mix(a, b, f);
}

const vec3 DIM_INK = ${H('#4f3f80')};
`;

// ── P0: the sky ────────────────────────────────────────────────────────────

const SKY_FRAG = /* glsl */ `
${COMMON}

// Centre line of the song staff for a (whole-pixel) staff coordinate.
float staffY(float s, float energy) {
  return 216.0 - (uCam.y - 160.0) * 0.1
    + 13.0 * sin(s * 0.0105 + 0.7)
    + 6.0 * sin(s * 0.024 + uTime * 0.12)
    + energy * 1.5 * sin(s * 0.08 - uTime * 2.6);
}

void main() {
  vec2 px = floor(vUv * vec2(${VIEW_W}.0, ${VIEW_H}.0));
  vec2 pc = px + 0.5;
  float m = moodLevel();
  float energy = energyLevel();
  float gold = smoothstep(0.6, 1.3, m);
  float song = smoothstep(1.5, 2.4, m);
  float sp = uSpectacle;
  float par = clamp(uParade, 0.0, 1.0);
  vec3 w = editionWeights();

  // Vivid-only distortion during the Parade: the page ripples a few pixels.
  float wob = uDistort * par * sp;
  vec2 q = pc;
  q.x += floor(sin(pc.y * 0.06 + uTime * 1.1) * 2.5 * wob + 0.5);
  float scr = dotScreen(q);

  // Two-ink gradient through the halftone screen, quantised into bands.
  vec3 col = skyPrint(skyT(q.y), w, scr);

  // The sleeping sun: a halftoned glow far away, ringed by breathing sound rings.
  vec2 sun = vec2(372.0 - floor(uCam.x * 0.012), 196.0 - floor((uCam.y - 160.0) * 0.06));
  float rs = length(pc - sun);
  vec3 haloInk = mix(${H('#f2cfdc')}, ${H('#ffe08e')}, max(gold * 0.7, uDawn));
  float core = 10.0 + 2.0 * gold + 26.0 * uDawn;
  float haloR = core + 14.0 + 8.0 * gold + 40.0 * uDawn;
  if (rs < core) col = mix(col, haloInk, 0.45 + 0.15 * gold);
  else {
    float halo = (1.0 - smoothstep(core, haloR, rs)) * (0.55 + 0.2 * gold);
    if (scr < floor(halo * 4.0 + 0.5) / 4.0) col = mix(col, haloInk, 0.35 + 0.15 * gold);
  }

  float breath = sin(uTime * 0.45) * 1.5 + energy * sin(uTime * 2.2);
  float R = rs - core - 14.0 - breath;
  float ringI = floor(R / 9.0 + 0.5);
  float nR = 1.0 + 2.0 * gold + 1.0 * song + 3.0 * uDawn;
  if (abs(R - ringI * 9.0) < 0.55 && ringI >= 0.0 && ringI <= nR) {
    float fade = 1.0 - ringI / (nR + 1.5);
    vec3 ringInk = mix(${H('#e6c3e2')}, ${H(ACCENT.gold)}, max(gold, uDawn) * 0.8);
    // Quiet rings are dotted (printed through the screen); the gold plate makes them solid.
    if (scr < 0.5 + gold) col = mix(col, ringInk, (0.3 + 0.25 * gold) * fade);
  }

  // Dawn: soft sunrise rays fan from the sun.
  if (uDawn > 0.001) {
    float as = atan(pc.y - sun.y, pc.x - sun.x);
    float ray = step(0.55, cos(as * 14.0 + uTime * 0.04));
    float amt = uDawn * 0.5 * (1.0 - smoothstep(40.0, 320.0, rs));
    if (ray > 0.0 && scr < amt) col = mix(col, ${H('#ffe6a0')}, 0.5);
  }

  // The song staff: five faint lines drifting like a wind current.
  float sx = px.x + floor(uCam.x * 0.035) + floor(uTime * 3.0);
  float yc = staffY(sx, energy);
  float d = pc.y - yc;
  float env = smoothstep(-0.35, 0.55, sin(sx * 0.0042 + 1.3));
  if (abs(d) < 12.5) {
    float k = floor(d / 5.0 + 0.5);
    if (abs(d - k * 5.0) < 0.5 && scr < env * 2.5) {
      vec3 staffInk = mix(${H('#9c86cf')}, ${H('#c48ccf')}, song);
      col = mix(col, staffInk, 0.38 + 0.1 * song + 0.08 * energy);
      // Shimmer: a glint runs along the lines with flow energy.
      float glint = smoothstep(0.93, 1.0, sin(sx * 0.03 - uTime * (1.0 + 2.0 * energy) + k)) * energy;
      col = mix(col, ${H(ACCENT.mintHi)}, glint * 0.55 * sp);
    }
  }

  // Notes written onto the staff by Bloom (dots, stemmed notes and tiny petals).
  float cellW = 22.0;
  float cid = floor(sx / cellW);
  float h1 = hash1(cid);
  float density = smoothstep(0.55, 2.6, m) * env;
  if (h1 < density * 0.85) {
    float h2 = hash1(cid + 17.3);
    float h3 = hash1(cid + 41.9);
    float nx = cid * cellW + 5.0 + floor(h2 * 12.0);
    float ny = floor(staffY(nx, energy) + (floor(h3 * 9.0) - 4.0) * 2.5 + 0.5);
    vec2 dn = vec2(sx - nx, px.y - ny);
    float ax = abs(dn.x), ay = abs(dn.y);
    float kind = fract(h2 * 7.0);
    bool head = (ax <= 1.0 && ay <= 0.0) || (ax <= 0.0 && ay <= 1.0) || (ax <= 1.0 && dn.y == 1.0 && kind < 0.4);
    bool stem = kind < 0.4 && dn.x == 1.0 && dn.y >= 1.0 && dn.y <= 5.0;
    bool petal = kind > 0.7 && ax == 1.0 && ay == 1.0;
    vec3 noteCol = song > 0.5 ? (h3 > 0.5 ? ${H(ACCENT.petal)} : ${H(ACCENT.mint)}) : ${H(ACCENT.gold)};
    // A note fades in through the dot screen as its threshold is crossed.
    float pop = clamp((density * 0.85 - h1) * 8.0, 0.0, 1.0);
    if ((head || stem) && scr < pop * 1.2) col = mix(col, noteCol, 0.8);
    if (petal && scr < pop * 1.2) col = mix(col, ${H(ACCENT.petalHi)}, 0.7);
  }

  // Petal Parade: the full-colour edition. Floral fans + misregistered waveform rings.
  if (par > 0.001) {
    vec2 dd = pc - uFlower;
    float r = length(dd);
    float an = atan(dd.y, dd.x);
    if (uDistort > 0.5) an += sin(r * 0.045 - uTime * 1.3) * 0.06 * sp;
    float reach = 30.0 + revealLevel() * 640.0;
    float inReach = 1.0 - smoothstep(reach * 0.75, reach, r);
    float Rf = 150.0 + 12.0 * sin(uTime * 0.6);
    float pet = cos(an * 8.0 + uTime * 0.12);
    float rr = r / Rf;
    if (r < Rf && pet > 0.2 + 0.8 * rr * rr && scr < 0.42 * sp * inReach) col = mix(col, ${H(ACCENT.petal)}, 0.55);
    float wv = 0.35 * sin(an * 7.0 - uTime * 0.4) * smoothstep(20.0, 140.0, r);
    // Waveform rings travel outward in pulses (every third ring is inked) and
    // thin out with distance, so the edition stays a frame, not a wallpaper.
    float amt = 0.46 * sp * sp * inReach * smoothstep(Rf * 0.55, Rf * 0.85, r) * (1.0 - smoothstep(200.0, 340.0, r));
    vec2 o1 = vec2(1.0, 0.0), o2 = vec2(0.0, -1.0), o3 = vec2(-1.0, 1.0);
    float rM = length(pc + o3 - uFlower), rP = length(pc + o2 - uFlower), rG = length(pc + o1 - uFlower);
    float ph = uTime * 0.25;
    float pulse = step(fract((r / 30.0 - ph) / 3.0), 0.67);
    float bM = abs(fract(rM / 30.0 - ph + wv + 0.66) - 0.5) * 30.0;
    float bP = abs(fract(rP / 30.0 - ph + wv + 0.33) - 0.5) * 30.0;
    float bG = abs(fract(rG / 30.0 - ph + wv) - 0.5) * 30.0;
    amt *= pulse;
    if (bM < 0.6) col = mix(col, ${H(ACCENT.mint)}, amt * 0.8);
    if (bP < 0.6) col = mix(col, ${H(ACCENT.petal)}, amt);
    if (bG < 0.6) col = mix(col, ${H(ACCENT.gold)}, amt);
  }

  // Pollen sparkles drift in as Bloom rises: single pixels, a few with a tiny cross.
  vec2 spx = px + floor(vec2(uCam.x * 0.12, uCam.y * 0.06));
  vec2 cell = floor(spx / 9.0);
  vec2 local = spx - cell * 9.0;
  vec2 at = floor(vec2(hash2(cell + 1.3), hash2(cell + 7.1)) * 7.0) + 1.0;
  float h = hash2(cell);
  float tw = 0.5 + 0.5 * sin(uTime * 1.3 + h * 40.0);
  vec2 dq = abs(local - at);
  bool spark = dq.x + dq.y < 0.5 || (h > 0.995 && dq.x + dq.y < 1.5 && min(dq.x, dq.y) < 0.5);
  if (spark && h > 1.0 - 0.05 * clamp(uBloom + par, 0.0, 1.0) * sp && tw > 0.45 && px.y > 60.0) col = mix(col, ${H(ACCENT.goldHi)}, 0.75);

  col = mix(col, DIM_INK, uDim);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  sharedSky = makeSkyUniforms();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SKY_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: sharedSky,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(VIEW_W, VIEW_H), mat);
  m.renderOrder = 0;
  m.frustumCulled = false;
  return m;
}

// ── parallax strips ────────────────────────────────────────────────────────

export interface ParallaxLayer {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  texture: THREE.Texture;
  width: number;
  height: number;
  factor: number;
  factorY: number;
  /** Screen y (from the bottom) of the strip's bottom edge when the camera is at its reference height. */
  baseY: number;
}

/** A Pix whose x wraps around, so strips tile seamlessly. */
class WrapPix extends Pix {
  override px(x: number, y: number, c: Parameters<Pix['px']>[2]): void {
    const w = this.w;
    super.px(((Math.round(x) % w) + w) % w, y, c);
  }
}

/** Same halftone screen as the shaders (0 dot centre .. 1 corner). */
function dotT(x: number, y: number): number {
  const qx = (x + 0.5 + y + 0.5) / 6;
  const qy = (x + 0.5 - (y + 0.5)) / 6;
  const fx = qx - Math.floor(qx) - 0.5;
  const fy = qy - Math.floor(qy) - 0.5;
  return Math.sqrt(fx * fx + fy * fy) * 1.4142;
}

function hashI(x: number, y = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Accent plate ids (decoded in the strip shader). */
const Plate = { Gold: 1, Mint: 2, Petal: 3, GoldHi: 4 } as const;
type Plate = (typeof Plate)[keyof typeof Plate];

/** Marks a pixel in the accent mask: plate colour appears once the mood level passes `at` (0..1). */
function accent(a: Pix, x: number, y: number, plate: Plate, at: number, phase = hashI(x, y)): void {
  a.px(x, y, [Math.round(Math.min(1, Math.max(0.01, at)) * 255), plate * 40, Math.round(phase * 255), 255]);
}

/**
 * An unfurling curl: an Archimedean spiral (carved groove with a light lip
 * above) that opens into a small teardrop petal. dir = ±1 sets the hand.
 */
function curl(
  p: Pix,
  cx: number,
  cy: number,
  R: number,
  turns: number,
  groove: string,
  lip: string | null,
  dir: number,
  acc?: { a: Pix; plate: Plate; at: number },
): void {
  const pts: [number, number][] = [];
  const total = turns * Math.PI * 2;
  const steps = Math.ceil(R * turns * 10);
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * total;
    const r = 1 + (R - 1) * (th / total);
    pts.push([Math.round(cx + dir * Math.cos(th + Math.PI) * r), Math.round(cy + Math.sin(th + Math.PI) * r * 0.82)]);
  }
  // Tail: the spiral's end flicks outward into a petal.
  const [ex, ey] = pts[pts.length - 1];
  if (lip) for (const [x, y] of pts) if (!pts.some(([qx, qy]) => qx === x && qy === y - 1)) p.px(x, y - 1, lip);
  for (const [x, y] of pts) {
    p.px(x, y, groove);
    if (acc) accent(acc.a, x, y, acc.plate, acc.at, 0.3);
  }
  const tx = ex + dir * 2;
  p.px(tx, ey + 1, groove);
  p.px(tx + dir, ey + 1, groove);
  p.px(tx + dir, ey, groove);
  if (acc) {
    accent(acc.a, tx, ey + 1, acc.plate, acc.at, 0.3);
    accent(acc.a, tx + dir, ey + 1, acc.plate, acc.at, 0.3);
    accent(acc.a, tx + dir, ey, acc.plate, acc.at, 0.3);
  }
}

// ── P1: wind-organ islands ─────────────────────────────────────────────────

const FAR = {
  lit: '#cbbdee',
  cap: '#c1b1e9',
  body: '#b6a5e1',
  strata: '#ac9bda',
  shade: '#a998d8',
  deep: '#a08fd1',
  pipe: '#cbbef0',
  pipeLit: '#d7cbf4',
  pipeSh: '#b4a4e2',
  mouth: '#9d8ccf',
  bell: '#d2b1df',
  bellSh: '#c09fd3',
  stem: '#a596d6',
  mist: '#d9cdf3',
};

function organPipe(p: Pix, a: Pix, x0: number, base: number, w: number, h: number, mouthAt: number): void {
  const top = base - h;
  for (let y = top + 1; y <= base; y++) {
    for (let i = 0; i < w; i++) p.px(x0 + i, y, i === 0 ? FAR.pipeLit : i === w - 1 ? FAR.pipeSh : FAR.pipe);
  }
  // Flared lip at the top.
  p.hline(x0 - 1, x0 + w, top, FAR.pipeLit);
  p.px(x0 + w, top, FAR.pipeSh);
  // The pipe mouth: a little dark slit low on the pipe — it sings with the mint plate.
  const mx = x0 + Math.floor((w - 1) / 2);
  const my = base - Math.min(6, Math.max(3, Math.floor(h * 0.22)));
  for (let k = 0; k < 2; k++) {
    p.px(mx, my + k, FAR.mouth);
    if (w >= 5) p.px(mx + 1, my + k, FAR.mouth);
    accent(a, mx, my + k, Plate.Mint, mouthAt);
    if (w >= 5) accent(a, mx + 1, my + k, Plate.Mint, mouthAt);
  }
  p.px(mx - 1, my - 1, FAR.pipeSh);
  p.px(mx + (w >= 5 ? 2 : 1), my - 1, FAR.pipeSh);
}

/** A drooping bell-flower on a crook stem rising from (sx, base). */
function bellFlower(p: Pix, a: Pix, sx: number, base: number, L: number, dir: number, glintAt: number): void {
  for (let y = base; y > base - L; y--) p.px(sx, y, FAR.stem);
  // Crook: a small arc over to the hanging point.
  const r = 3;
  for (let i = 0; i <= 8; i++) {
    const th = (i / 8) * Math.PI;
    p.px(Math.round(sx + dir * (r - Math.cos(th) * r)), Math.round(base - L - Math.sin(th) * r), FAR.stem);
  }
  const bx = sx + dir * 2 * r;
  const by = base - L + 1;
  // Bell hangs mouth-down: narrow top, flared scalloped rim.
  p.hline(bx - 1, bx + 1, by, FAR.bell);
  p.hline(bx - 2, bx + 2, by + 1, FAR.bell);
  p.hline(bx - 2, bx + 2, by + 2, FAR.bell);
  p.px(bx - 3, by + 3, FAR.bell);
  p.px(bx - 1, by + 3, FAR.bellSh);
  p.px(bx, by + 3, FAR.bellSh);
  p.px(bx + 1, by + 3, FAR.bellSh);
  p.px(bx + 3, by + 3, FAR.bell);
  p.px(bx + 1, by, FAR.pipeLit);
  // Gold glint inside the bell (stirring plate) and a clapper drop below.
  accent(a, bx, by + 3, Plate.Gold, glintAt);
  accent(a, bx - 1, by + 3, Plate.Gold, glintAt + 0.05);
  accent(a, bx + 1, by + 3, Plate.Gold, glintAt + 0.05);
  accent(a, bx, by + 5, Plate.GoldHi, glintAt + 0.15);
}

function organIsle(p: Pix, a: Pix, cx: number, top: number, w: number, seed: number, landmark = false): void {
  const r = rng(seed);
  const half = w / 2;
  const D = landmark ? 58 : 22 + r() * 16;
  // Underside: a tapering crag with stalactite tips that dissolve into the air.
  for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
    const u = (x - cx) / half;
    if (Math.abs(u) > 1) continue;
    const bell = Math.pow(1 - u * u, 0.85);
    const tip = hashI(Math.floor(x / 3) * 0.37 + seed) < 0.12 ? 3 + hashI(Math.floor(x / 3) + seed) * 6 : 0;
    const depth = D * bell * (0.84 + 0.16 * Math.sin(x * 0.21 + seed)) + tip * bell;
    for (let y = top; y < top + depth; y++) {
      const k = (y - top) / depth;
      if (k > 0.78 && dotT(x, y) > (1 - k) / 0.22) continue;
      const dy = y - top;
      let c = k > 0.8 ? FAR.deep : k > 0.5 ? FAR.shade : FAR.body;
      if (dy > 3 && dy % 6 === 4 && hashI(Math.floor(x / 5), y + seed) > 0.25) c = FAR.strata;
      if (dy < 2) c = FAR.cap;
      p.px(x, y, c);
    }
    // Domed cap of the meadow-less stone top.
    const capH = Math.round(2.5 * Math.sqrt(Math.max(0, 1 - u * u)));
    for (let y = top - capH; y < top; y++) p.px(x, y, y === top - capH ? FAR.lit : FAR.cap);
  }
  // Moss-mist falling from the edge: dotted strands.
  if (!landmark && r() < 0.6) {
    const mx = Math.round(cx + (r() * 2 - 1) * half * 0.5);
    for (let y = top + 2; y < top + D + 22; y++) if (y % 3 !== 0 && dotT(mx, y) < 1 - (y - top) / (D + 24)) p.px(mx, y, FAR.mist);
  }
  // Floating shards under the island.
  for (let i = 0; i < (landmark ? 5 : 2); i++) {
    const sx = Math.round(cx + (r() * 2 - 1) * half * 0.7);
    const sy = Math.round(top + D * (0.8 + r() * 0.5) + 6);
    p.hline(sx - 1, sx + 1, sy, FAR.shade);
    p.px(sx, sy + 1, FAR.deep);
  }

  const base = top - 2;
  if (landmark) {
    // The Bell Organ: a fan of pipes arranged like an opening flower.
    const pipes = 13;
    for (let i = 0; i < pipes; i++) {
      const c = Math.abs(i - (pipes - 1) / 2) / ((pipes - 1) / 2);
      const h = Math.round(18 + 44 * Math.pow(1 - c, 1.3) + (i % 2) * 3);
      organPipe(p, a, Math.round(cx - pipes * 2.5 + i * 5), base, 4, h, 0.5 + c * 0.2);
    }
    // Tallest crown pipes carry a gold rosette (the instrument's emblem).
    const ry = base - 70;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= 3.2 && d > 1.8) {
          p.px(cx + dx, ry + dy, FAR.pipeLit);
          accent(a, cx + dx, ry + dy, Plate.Gold, 0.32);
        }
        if (d <= 0.8) {
          p.px(cx + dx, ry + dy, FAR.bellSh);
          accent(a, cx + dx, ry + dy, Plate.GoldHi, 0.4);
        }
      }
    // Faint sound rings (printed only once the instrument starts to sing).
    for (let ring = 0; ring < 4; ring++) {
      const R = 12 + ring * 8;
      for (let i = 0; i < R * 7; i++) {
        const th = (i / (R * 7)) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(th) * R);
        const y = Math.round(ry + Math.sin(th) * R * 0.9);
        if (p.opaque(x, y) || (x + y) % 2) continue;
        accent(a, x, y, Plate.Gold, 0.55 + ring * 0.08, 0.5);
      }
    }
    // Bell-flowers drooping from both shoulders.
    for (let i = 0; i < 4; i++) {
      bellFlower(p, a, Math.round(cx - half * 0.72 + i * 5), base, 14 + i * 5, 1, 0.22 + i * 0.03);
      bellFlower(p, a, Math.round(cx + half * 0.72 - i * 5), base, 14 + i * 5, -1, 0.24 + i * 0.03);
    }
    return;
  }

  // Ordinary wind-organ: a small facade of pipes and a bell-flower or two.
  const n = 3 + Math.floor(r() * 4);
  const pw = 3;
  const mode = Math.floor(r() * 3);
  const hMax = 14 + r() * 16;
  const x0 = Math.round(cx - (n * (pw + 1)) / 2 + (r() * 2 - 1) * half * 0.25);
  for (let i = 0; i < n; i++) {
    const c = n === 1 ? 0 : Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
    const t = mode === 0 ? 1 - c : mode === 1 ? 0.45 + 0.55 * c : i / (n - 1);
    organPipe(p, a, x0 + i * (pw + 1), base, pw, Math.round(6 + hMax * t), 0.55 + r() * 0.15);
  }
  const bells = 1 + Math.floor(r() * 2);
  for (let i = 0; i < bells; i++) {
    const side = i === 0 ? -1 : 1;
    const bx = side < 0 ? x0 - 4 - Math.floor(r() * 6) : x0 + n * (pw + 1) + 3 + Math.floor(r() * 6);
    bellFlower(p, a, bx, base, 8 + Math.floor(r() * 10), -side, 0.22 + r() * 0.12);
  }
}

function farLayer(p: Pix, a: Pix): void {
  const isles: [number, number, number][] = [
    [60, 96, 72],
    [250, 72, 58],
    [440, 102, 86],
    [880, 76, 60],
    [1090, 96, 74],
    [1310, 70, 54],
  ];
  isles.forEach(([cx, top, w], i) => organIsle(p, a, cx, top, w, 101 + i * 37));
  // The Bell Organ: drifts into view mid-level and presides over the ending.
  organIsle(p, a, 650, 108, 168, 7, true);
}

// ── P1b: distant carved cloud cliffs ───────────────────────────────────────

const CLIFF = { lit: '#f0d3dd', body: '#e4c3d9', groove: '#d7b3d2', flute: '#dbb8d4' };

function cliffLayer(p: Pix, _a: Pix): void {
  const W = p.w;
  const r = rng(61);
  const k = (n: number) => (Math.PI * 2 * n) / W;
  const top = new Float32Array(W);
  const tower = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    // Towering carved cumulus: a few tall mesas over a rolling base.
    let tw = 0;
    for (const [c, hw, ht] of [
      [180, 46, 30],
      [520, 70, 40],
      [860, 38, 24],
      [1100, 60, 34],
    ]) {
      let dx = Math.abs(x - c);
      dx = Math.min(dx, W - dx);
      tw = Math.max(tw, ht * (1 - smooth(hw - 14, hw, dx)));
    }
    tower[x] = tw;
    top[x] = 70 - tw + 8 * Math.sin(x * k(3) + 0.4) + 5 * Math.sin(x * k(7) + 1.1);
  }
  // Scalloped crown: lobes along the skyline.
  for (let x = 0; x < W; x += 9 + Math.floor(r() * 12)) {
    const rad = 7 + r() * 11;
    const cy = top[x] + rad * 0.55;
    for (let dx = -Math.ceil(rad); dx <= rad; dx++) {
      const xx = (((x + dx) % W) + W) % W;
      const y = cy - Math.sqrt(Math.max(0, rad * rad - dx * dx));
      if (y < top[xx]) top[xx] = y;
    }
  }
  for (let x = 0; x < W; x++) {
    const t0 = Math.round(top[x]);
    for (let y = t0; y < p.h; y++) {
      const depth = y - t0;
      const fadeStart = p.h - 38;
      if (y > fadeStart && dotT(x, y) > 1 - (y - fadeStart) / 38) continue;
      let c = CLIFF.body;
      // Relief contours that follow the skyline, plus vertical flutes on the mesas.
      if (depth > 3 && depth % 10 === 6 && depth < 36 && hashI(Math.floor(x / 9), depth) > 0.3) c = CLIFF.groove;
      if (tower[x] > 12 && x % 9 === 0 && depth > 6 && depth < tower[x] && hashI(x, 3) > 0.4) c = CLIFF.flute;
      if (depth < 2) c = CLIFF.lit;
      p.px(x, y, c);
    }
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ── P2/P3: carved cloud banks ──────────────────────────────────────────────

interface BankStyle {
  body: string;
  rim: string;
  groove: string;
  lip: string;
  deep: string;
  plate: Plate;
  plateAt: number;
}

const MID: BankStyle = { body: '#bfa8e5', rim: '#d0bff0', groove: '#ab95da', lip: '#c9b7ed', deep: '#b7a0e1', plate: Plate.Petal, plateAt: 0.68 };
const NEAR: BankStyle = { body: '#a08bd3', rim: '#b5a2e2', groove: '#8c77c5', lip: '#ab97dd', deep: '#9682cc', plate: Plate.Mint, plateAt: 0.76 };

interface BankRow {
  y0: number;
  y1: number;
  r0: number;
  r1: number;
  step: number;
  jitter: number;
  /** Lobe height / width. */
  squash: number;
}

interface BankShape {
  rows: BankRow[];
  /** Chance a lobe gets an engraved (partial) inner contour. */
  contour: number;
  /** Chance a lobe carries an unfurling curl, and its radius range. */
  curl: number;
  curlR: [number, number];
  strata: boolean;
}

/**
 * A carved cloud bank: overlapping scalloped lobes, each with a lit rim,
 * sometimes an engraved partial contour, and unfurling curls. Lobes are drawn
 * back (higher) to front (lower) so their rims read as carved scallops; curls
 * are cut last, only where their lobe is still the visible surface.
 */
function cloudBank(p: Pix, a: Pix, s: BankStyle, seed: number, shape: BankShape): void {
  const r = rng(seed);
  const W = p.w;
  const list: { x: number; y: number; rad: number; ry: number; contour: number; side: number; curl: boolean }[] = [];
  shape.rows.forEach((row, ri) => {
    for (let x = ri * 7; x < W; x += row.step + Math.floor(r() * row.jitter)) {
      const rad = row.r0 + r() * (row.r1 - row.r0);
      list.push({
        x,
        y: row.y0 + r() * (row.y1 - row.y0),
        rad,
        ry: rad * row.squash,
        contour: r() < shape.contour ? 3 + Math.floor(r() * 3) : 0,
        side: r() < 0.5 ? -1 : 1,
        curl: r() < shape.curl,
      });
    }
  });
  list.sort((m, n) => m.y - n.y);
  const owner = new Int16Array(W * p.h).fill(-1);
  const deepFrom = Math.round(shape.rows[shape.rows.length - 1].y1 + 26);
  list.forEach((L, li) => {
    for (let y = Math.floor(L.y - L.ry); y < p.h; y++) {
      for (let dx = -Math.ceil(L.rad); dx <= L.rad; dx++) {
        const nx = (dx + 0.5) / L.rad;
        const ny = (y + 0.5 - L.y) / L.ry;
        // Lobe: upper half-ellipse, extended straight down into the bank body.
        const inside = ny < 0 ? nx * nx + ny * ny <= 1 : Math.abs(nx) <= 1;
        if (!inside) continue;
        const e = ny < 0 ? 1 - Math.sqrt(nx * nx + ny * ny) : 1 - Math.abs(nx); // 0 at the edge
        const edgePx = e * Math.min(L.rad, L.ry * 1.6);
        let c = y > deepFrom ? s.deep : s.body;
        if (ny < 0.1 && edgePx < 1.2) c = s.rim;
        else if (L.contour && ny < -0.2 && edgePx >= L.contour && edgePx < L.contour + 1) {
          // Engraved contour on one shoulder only, like a gouge following the crest.
          const ang = Math.atan2(-ny, nx * L.side); // 0 = shoulder, π/2 = crest
          if (ang > 0.25 && ang < 1.75) c = s.groove;
        }
        const xx = (((L.x + dx) % W) + W) % W;
        if (y >= 0) owner[y * W + xx] = li;
        p.px(xx, y, c);
      }
    }
  });
  // Long soft groove lines deeper in the bank (relief strata).
  if (shape.strata) {
    for (let y = deepFrom - 6; y < p.h; y += 10) {
      for (let x = 0; x < W; x++) {
        const yy = Math.round(y + 2 * Math.sin((x / W) * Math.PI * 2 * 9 + y));
        if (p.opaque(x, yy) && hashI(Math.floor(x / 13), y) > 0.45) p.px(x, yy, s.groove);
      }
    }
  }
  // Curls: cut where the lobe is still on top.
  list.forEach((L, li) => {
    if (!L.curl) return;
    let R = Math.round(shape.curlR[0] + r() * (shape.curlR[1] - shape.curlR[0]));
    const own = (x: number, y: number) => y >= 0 && y < p.h && owner[y * W + (((x % W) + W) % W)] === li;
    // Find the widest stretch of this lobe that is still the visible surface.
    let best = 0;
    let cx = 0;
    let cy = 0;
    for (let y = Math.round(L.y - L.ry * 0.3); y <= Math.round(L.y + L.ry * 0.5); y += 2) {
      let run = 0;
      for (let x = Math.round(L.x - L.rad); x <= L.x + L.rad + 1; x++) {
        if (x <= L.x + L.rad && own(x, y)) run++;
        else {
          if (run > best) {
            best = run;
            cx = x - Math.ceil(run / 2);
            cy = y;
          }
          run = 0;
        }
      }
    }
    R = Math.min(R, Math.floor(best / 2) - 4);
    while (R >= 4 && !(own(cx, cy - R - 1) && own(cx, cy + R) && own(cx - R - 3, cy) && own(cx + R + 3, cy))) R--;
    if (R < 4) return;
    curl(p, cx, cy, R, 2.2, s.groove, s.lip, L.side, { a, plate: s.plate, at: s.plateAt + r() * 0.1 });
  });
}

function midLayer(p: Pix, a: Pix): void {
  cloudBank(p, a, MID, 23, {
    rows: [
      { y0: 34, y1: 50, r0: 16, r1: 30, step: 22, jitter: 16, squash: 0.72 },
      { y0: 60, y1: 68, r0: 14, r1: 24, step: 26, jitter: 18, squash: 0.7 },
    ],
    contour: 0.55,
    curl: 0.4,
    curlR: [5, 7],
    strata: true,
  });
}

function nearLayer(p: Pix, a: Pix): void {
  cloudBank(p, a, NEAR, 47, {
    rows: [
      { y0: 26, y1: 34, r0: 28, r1: 42, step: 38, jitter: 20, squash: 0.58 },
      { y0: 48, y1: 56, r0: 24, r1: 36, step: 40, jitter: 24, squash: 0.58 },
    ],
    contour: 0.45,
    curl: 0.5,
    curlR: [8, 11],
    strata: false,
  });
}

// ── strip shader ───────────────────────────────────────────────────────────

const STRIP_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uMap;
uniform sampler2D uAcc;
uniform vec2 uTex;
uniform float uShift;
uniform float uFog;
uniform float uRelight;
uniform float uWave;
uniform float uPlateAmt;
uniform vec3 uPlateInk;

vec4 at(sampler2D t, vec2 p) {
  return texture2D(t, vec2((mod(p.x, uTex.x) + 0.5) / uTex.x, (p.y + 0.5) / uTex.y));
}

void main() {
  vec2 tp = floor(vec2(vUv.x * ${VIEW_W}.0, vUv.y * uTex.y));
  float par = clamp(uParade, 0.0, 1.0);
  tp.x += uShift;
  tp.x += floor(sin(tp.y * 0.09 + uTime * 1.2) * 2.0 * uDistort * par * uSpectacle * uWave + 0.5);
  vec4 c = at(uMap, tp);
  vec4 acc = at(uAcc, tp);
  vec2 sp = floor(vScreen);
  float scr = dotScreen(sp);
  vec3 w = editionWeights();
  vec3 skyNow = skySmooth(vScreen.y, w);
  float lvl = clamp(moodLevel() / 3.0, 0.0, 1.0);

  vec3 col;
  float alpha = 1.0;
  if (c.a < 0.5) {
    // Spectacular: a misregistered plate of the silhouette, 1-2 px off.
    float pa = uPlateAmt * par * uSpectacle;
    vec2 o = vec2(1.0 + step(0.0, sin(uTime * 0.8)), -1.0);
    vec4 c2 = at(uMap, tp - o);
    bool plate = pa > 0.01 && c2.a > 0.5 && scr < pa;
    bool glow = acc.a > 0.5 && lvl + 0.06 * sin(uTime * 2.1 + acc.b * 6.283) > acc.r;
    if (!plate && !glow) discard;
    col = plate ? mix(uPlateInk, skyNow, 0.35) : skyNow;
    if (glow) {
      float id = floor(acc.g * 255.0 / 40.0 + 0.5);
      vec3 ink = id < 1.5 ? ${H(ACCENT.gold)} : id < 2.5 ? ${H(ACCENT.mint)} : id < 3.5 ? ${H(ACCENT.petal)} : ${H(ACCENT.goldHi)};
      col = mix(ink, skyNow, 0.45 + uFog * 0.3);
    }
  } else {
    // Re-light against the current sky edition, then fog toward the sky.
    vec3 rest = skySmooth(vScreen.y, vec3(0.0));
    vec3 ratio = clamp(skyNow / max(rest, vec3(0.05)), 0.35, 1.6);
    col = c.rgb * mix(vec3(1.0), ratio, uRelight);
    col = mix(col, skyNow, uFog);
    if (acc.a > 0.5 && lvl + 0.06 * sin(uTime * 2.1 + acc.b * 6.283) > acc.r) {
      float id = floor(acc.g * 255.0 / 40.0 + 0.5);
      vec3 ink = id < 1.5 ? ${H(ACCENT.gold)} : id < 2.5 ? ${H(ACCENT.mint)} : id < 3.5 ? ${H(ACCENT.petal)} : ${H(ACCENT.goldHi)};
      col = mix(ink, col, 0.45 + uFog * 0.4);
    }
  }
  col = mix(col, DIM_INK, uDim);
  gl_FragColor = vec4(col, alpha);
}`;

type Bake = (p: Pix, a: Pix) => void;

interface StripDef {
  width: number;
  height: number;
  draw: Bake;
  factor: number;
  factorY: number;
  baseY: number;
  fog: number;
  relight: number;
  wave: number;
  plateAmt: number;
  plateInk: string;
}

const STRIPS: StripDef[] = [
  // Far wind-organ islands float mid-sky.
  { width: 1536, height: 180, draw: farLayer, factor: 0.05, factorY: 0.035, baseY: 52, fog: 0.22, relight: 1.0, wave: 1, plateAmt: 0.55, plateInk: ACCENT.petal },
  // Distant cloud cliffs on the horizon.
  { width: 1280, height: 130, draw: cliffLayer, factor: 0.1, factorY: 0.07, baseY: 6, fog: 0.22, relight: 1.0, wave: 0.7, plateAmt: 0.4, plateInk: ACCENT.gold },
  // Mid carved cloud banks.
  { width: 1024, height: 120, draw: midLayer, factor: 0.22, factorY: 0.14, baseY: -26, fog: 0.1, relight: 0.85, wave: 0.4, plateAmt: 0.3, plateInk: ACCENT.mint },
  // Near cloud-sea.
  { width: 1024, height: 104, draw: nearLayer, factor: 0.5, factorY: 0.4, baseY: -60, fog: 0.0, relight: 0.7, wave: 0, plateAmt: 0, plateInk: ACCENT.mint },
];

function bake(width: number, height: number, draw: Bake): [THREE.Texture, THREE.Texture] {
  const p = new WrapPix(width, height);
  const a = new WrapPix(width, height);
  draw(p, a);
  const t = p.toTexture();
  const ta = a.toTexture();
  for (const x of [t, ta]) {
    x.wrapS = THREE.RepeatWrapping;
    x.needsUpdate = true;
  }
  return [t, ta];
}

/** Builds the parallax strips. Pass the sky mesh to bind them to its uniforms (defaults to the latest sky). */
export function createParallax(sky?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>): ParallaxLayer[] {
  const shared = (sky?.material.uniforms as SkyUniforms | undefined) ?? sharedSky ?? (sharedSky = makeSkyUniforms());
  return STRIPS.map((d, i) => {
    const [texture, acc] = bake(d.width, d.height, d.draw);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: STRIP_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...shared,
        uMap: { value: texture },
        uAcc: { value: acc },
        uTex: { value: new THREE.Vector2(d.width, d.height) },
        uShift: { value: 0 },
        uFog: { value: d.fog },
        uRelight: { value: d.relight },
        uWave: { value: d.wave },
        uPlateAmt: { value: d.plateAmt },
        uPlateInk: { value: new THREE.Vector3(...hexRgb(d.plateInk)) },
      },
    });
    const geo = new THREE.PlaneGeometry(VIEW_W, d.height);
    geo.translate(VIEW_W / 2, d.height / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1 + i * 0.5; // 1, 1.5, 2, 2.5 — always below gameplay 'far' (4).
    mesh.frustumCulled = false;
    return { mesh, texture, width: d.width, height: d.height, factor: d.factor, factorY: d.factorY, baseY: d.baseY };
  });
}

function hexRgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Positions parallax strips for an integer camera position. */
export function placeParallax(layers: ParallaxLayer[], camX: number, camY: number, refY: number): void {
  for (const l of layers) {
    const shift = Math.round(camX * l.factor);
    l.mesh.material.uniforms.uShift.value = ((shift % l.width) + l.width) % l.width;
    const screenBottom = Math.round(l.baseY - (camY - refY) * l.factorY);
    l.mesh.position.set(camX - VIEW_W / 2, camY - VIEW_H / 2 + screenBottom, 0);
  }
}

export interface ParallaxSignals {
  time?: number;
  bloom?: number;
  parade?: number;
  energy?: number;
  spectacle?: number;
  distort?: boolean | number;
  mood?: number;
}

/**
 * Optional: the strips already read the sky's uniforms, so this is only
 * needed if the layers are used without a sky. Safe to call every frame.
 */
export function updateParallax(layers: ParallaxLayer[], s: ParallaxSignals): void {
  for (const l of layers) {
    const u = l.mesh.material.uniforms;
    if (s.time !== undefined) u.uTime.value = s.time;
    if (s.bloom !== undefined) u.uBloom.value = s.bloom;
    if (s.parade !== undefined) u.uParade.value = s.parade;
    if (s.energy !== undefined) u.uEnergy.value = s.energy;
    if (s.spectacle !== undefined) u.uSpectacle.value = s.spectacle;
    if (s.distort !== undefined) u.uDistort.value = Number(s.distort);
    if (s.mood !== undefined) u.uMood.value = s.mood;
  }
}

// ── wind ribbons (gameplay: a push zone) ───────────────────────────────────

const WIND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uDir;
uniform vec2 uSize;
varying vec2 vUv;

void main() {
  vec2 p = floor(vUv * uSize);
  // Flow coordinate: x always increases downstream.
  float x = uDir >= 0.0 ? p.x : uSize.x - 1.0 - p.x;
  float speed = 60.0 + uLevel * 40.0;
  float t = floor(uTime * speed);
  float alpha = 0.0;
  vec3 col = ${H(ACCENT.mint)};

  // Ribbon strokes with arrowheads.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cy = floor(uSize.y * (0.24 + 0.26 * fi) + 0.5);
    float amp = 2.0 + uLevel * 2.5;
    float yy = cy + floor(sin(x * 0.055 - uTime * 3.0 + fi * 2.1) * amp + 0.5);
    float L = 64.0 + fi * 9.0;
    float len = (0.42 + uLevel * 0.25) * L;
    float u = mod(x - floor(t * (1.0 + fi * 0.08)) - fi * 23.0, L); // 0..L along this period
    float dy = p.y - yy;
    // Body: 2 px stroke (light top edge), tapering to dots at the tail.
    if (u < len) {
      bool tail = u < len * 0.3;
      if ((dy == 0.0 || dy == -1.0) && (!tail || mod(x, 2.0) < 1.0)) {
        alpha = max(alpha, tail ? 0.6 : 0.92);
        col = dy == 0.0 ? ${H(ACCENT.mintHi)} : ${H(ACCENT.mint)};
      }
    }
    // Arrowhead just past the head: a solid chevron 3 wide, 7 tall.
    float hx = u - len;
    if (hx >= 0.0 && hx < 4.0) {
      float ay = abs(dy + 0.5) - 0.5;
      if (ay <= 3.0 - hx && ay >= 2.0 - hx - 1.0) {
        alpha = 0.95;
        col = ${H(ACCENT.mintHi)};
      }
    }
  }

  // Faint chevron field: shows the stream's direction and full extent at rest.
  if (alpha == 0.0) {
    float gx = mod(x - floor(t * 0.5), 16.0);
    float row = floor(p.y / 8.0);
    float gxx = mod(gx + row * 8.0, 16.0);
    float gy = mod(p.y, 8.0);
    if (gxx < 3.0 && abs(gy - 4.0) == 2.0 - gxx) alpha = 0.36;
    // Streamline dashes along the top and bottom edges mark the stream's extent.
    if ((p.y <= 1.0 || p.y >= uSize.y - 2.0) && mod(x - floor(t * 0.8) + (p.y <= 1.0 ? 0.0 : 5.0), 10.0) < 4.0 && (p.y == 0.0 || p.y == uSize.y - 1.0)) alpha = 0.55;
  }

  // Fade at the ends so the stream reads as a current, not a wall.
  float edge = min(p.x, uSize.x - 1.0 - p.x);
  if (edge < 14.0 && mod(p.x + p.y, 2.0) < 1.0) alpha = 0.0;
  if (edge < 6.0) alpha = 0.0;
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(mix(col, ${H(ACCENT.petalHi)}, uLevel * 0.3), alpha);
}`;

export function createWindMesh(w: number, h: number, dir = 1): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: WIND_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uDir: { value: dir }, uSize: { value: new THREE.Vector2(w, h) } },
  });
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(w / 2, h / 2, 0);
  return new THREE.Mesh(geo, mat);
}

export { pixelTexture };
