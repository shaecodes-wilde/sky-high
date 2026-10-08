import * as THREE from 'three';
import { VIEW_H, VIEW_W } from './CameraRig';
import { Pix, pixelTexture, rng } from './pixel';

// Background: a dithered sky shader (Bloom and the Petal Parade drive it)
// and three repeating parallax strips. Everything here sits behind the
// gameplay layer and never affects simulation.

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBloom;
uniform float uParade;
uniform float uDistort;
uniform float uSpectacle;
uniform float uDawn;
uniform float uDim;
uniform vec2 uFlower;
uniform vec2 uCam;
varying vec2 vUv;

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = floor(vUv * vec2(${VIEW_W}.0, ${VIEW_H}.0));
  float wave = uDistort * uParade * sin(px.y * 0.07 + uTime * 1.1) * 3.0;
  px.x += floor(wave);
  float b = bayer4(px);
  float y = (px.y + uCam.y * 0.05) / ${VIEW_H}.0;

  vec3 top = mix(vec3(0.55, 0.49, 0.83), vec3(0.60, 0.45, 0.86), uBloom);
  vec3 mid = mix(vec3(0.76, 0.70, 0.94), vec3(0.84, 0.70, 0.96), uBloom);
  vec3 low = mix(vec3(1.00, 0.84, 0.76), vec3(1.00, 0.80, 0.68), uBloom);
  low = mix(low, vec3(1.0, 0.90, 0.62), uDawn);
  mid = mix(mid, vec3(1.0, 0.78, 0.80), uDawn * 0.7);

  float q = clamp(floor(y * 10.0 + b) / 10.0, 0.0, 1.0);
  vec3 col = q > 0.45 ? mix(mid, top, (q - 0.45) / 0.55) : mix(low, mid, q / 0.45);

  // Petal Parade: rotating floral fans unfurl from the giant flower.
  if (uParade > 0.001) {
    vec2 d = px - uFlower;
    float r = length(d);
    float a = atan(d.y, d.x);
    float fan = sin(a * 9.0 + uTime * 0.3 + r * 0.006);
    float rings = fract(r * 0.011 - uTime * 0.04);
    vec3 fanCol = rings < 0.33 ? vec3(1.0, 0.66, 0.84) : rings < 0.66 ? vec3(1.0, 0.88, 0.52) : vec3(0.62, 0.95, 0.84);
    float reach = uParade * 520.0;
    float m = smoothstep(0.1, 0.7, fan) * (1.0 - smoothstep(reach * 0.6, reach, r));
    float amt = m * 0.55 * uSpectacle;
    col = mix(col, fanCol, step(b, amt) * 0.75);
  }

  // Pollen sparkles drift in as Bloom rises: single pixels, a few with a tiny cross.
  vec2 sp = px + floor(vec2(uCam.x * 0.12, uCam.y * 0.06));
  vec2 cell = floor(sp / 9.0);
  vec2 local = sp - cell * 9.0;
  vec2 at = floor(vec2(hash(cell + 1.3), hash(cell + 7.1)) * 7.0) + 1.0;
  float h = hash(cell);
  float tw = 0.5 + 0.5 * sin(uTime * 1.3 + h * 40.0);
  vec2 dd = abs(local - at);
  bool spark = dd.x + dd.y < 0.5 || (h > 0.995 && dd.x + dd.y < 1.5 && min(dd.x, dd.y) < 0.5);
  if (spark && h > 1.0 - 0.05 * uBloom * uSpectacle && tw > 0.45 && px.y > 60.0) col = mix(col, vec3(1.0, 0.98, 0.85), 0.85);

  col = mix(col, vec3(0.42, 0.36, 0.62), uDim);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBloom: { value: 0 },
      uParade: { value: 0 },
      uDistort: { value: 0 },
      uSpectacle: { value: 1 },
      uDawn: { value: 0 },
      uDim: { value: 0 },
      uFlower: { value: new THREE.Vector2(240, 160) },
      uCam: { value: new THREE.Vector2(0, 0) },
    },
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(VIEW_W, VIEW_H), mat);
  m.renderOrder = 0;
  m.frustumCulled = false;
  return m;
}

export interface ParallaxLayer {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.Texture;
  width: number;
  height: number;
  factor: number;
  factorY: number;
  /** Screen y (from the bottom) of the strip's bottom edge when the camera is at its reference height. */
  baseY: number;
}

function strip(width: number, height: number, draw: (p: Pix) => void): THREE.Texture {
  const p = new Pix(width, height);
  draw(p);
  const t = p.toTexture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function farLayer(p: Pix): void {
  const r = rng(11);
  const body = '#b9a8e8';
  const hi = '#cdbff2';
  const roof = '#d88aa8';
  // Distant floating isles with castle spires and mushroom roofs.
  for (let i = 0; i < 5; i++) {
    const cx = 100 + i * 200 + Math.floor(r() * 40);
    const w = 60 + Math.floor(r() * 50);
    const top = 70 + Math.floor(r() * 30);
    p.ellipse(cx, top, w / 2, 7, body);
    // Craggy underside that tapers to a few rocky points.
    for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
      const u = (x - cx) / (w / 2);
      const depth = 30 * Math.pow(Math.max(0, 1 - u * u), 0.8) * (0.75 + 0.25 * Math.sin(x * 0.7 + i)) + (x % 7 === 0 ? 4 : 0);
      for (let y = top; y < top + depth; y++) p.px(x, y, y > top + depth - 3 ? '#a796dc' : body);
    }
    p.hline(cx - w / 2 + 3, cx + w / 2 - 3, top - 6, hi);
    p.hline(cx - w / 2 + 6, cx + w / 2 - 6, top - 7, '#ddd2fa');
    if (i % 2 === 1) for (let y = top; y < top + 46; y++) if (y % 3) p.px(cx + w / 4, y, '#e6f2ff');
    if (i % 2 === 0) {
      const tx = cx - 8;
      p.rect(tx, top - 28, 8, 22, body);
      p.rect(tx + 12, top - 20, 6, 14, body);
      for (let k = 0; k < 6; k++) p.hline(tx - 1 + k, tx + 8 - k, top - 34 + k, roof);
      for (let k = 0; k < 5; k++) p.hline(tx + 11 + k, tx + 18 - k, top - 25 + k, roof);
      p.px(tx + 3, top - 22, hi);
    } else {
      p.rect(cx - 2, top - 16, 4, 10, '#e8dcff');
      p.ellipse(cx, top - 17, 9, 5, '#e895b6', (_, y) => y <= top - 17);
    }
  }
}

function midLayer(p: Pix): void {
  const r = rng(23);
  for (let x = -20; x < p.w + 20; x += 18 + Math.floor(r() * 16)) {
    const rad = 16 + r() * 18;
    p.ellipse(x, p.h - 30 + r() * 10, rad, rad * 0.7, '#ddd2fa');
  }
  for (let x = -20; x < p.w + 20; x += 14 + Math.floor(r() * 12)) {
    const rad = 12 + r() * 12;
    p.ellipse(x, p.h - 18 + r() * 8, rad, rad * 0.6, '#eae2ff');
  }
  p.rect(0, p.h - 14, p.w, 14, '#eae2ff');
}

function nearLayer(p: Pix): void {
  const r = rng(47);
  for (let x = -20; x < p.w + 20; x += 16 + Math.floor(r() * 14)) {
    const rad = 14 + r() * 14;
    p.ellipse(x, p.h - 22 + r() * 8, rad, rad * 0.65, '#f4eeff');
  }
  p.rect(0, p.h - 16, p.w, 16, '#fbf8ff');
  for (let x = 0; x < p.w; x += 3) if (r() < 0.4) p.px(x, p.h - 17 - Math.floor(r() * 3), '#ffffff');
}

export function createParallax(): ParallaxLayer[] {
  const defs: [number, number, (p: Pix) => void, number, number, number][] = [
    [1024, 140, farLayer, 0.06, 0.03, 48],
    [1024, 90, midLayer, 0.22, 0.12, 0],
    [1024, 60, nearLayer, 0.5, 0.45, -40],
  ];
  return defs.map(([width, height, draw, factor, factorY, baseY], i) => {
    const texture = strip(width, height, draw);
    texture.repeat.x = VIEW_W / width;
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const geo = new THREE.PlaneGeometry(VIEW_W, height);
    geo.translate(VIEW_W / 2, height / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1 + i;
    mesh.frustumCulled = false;
    return { mesh, texture, width, height, factor, factorY, baseY };
  });
}

/** Positions parallax strips for an integer camera position. */
export function placeParallax(layers: ParallaxLayer[], camX: number, camY: number, refY: number): void {
  for (const l of layers) {
    const shift = Math.round(camX * l.factor);
    l.texture.offset.x = (((shift % l.width) + l.width) % l.width) / l.width;
    const screenBottom = Math.round(l.baseY - (camY - refY) * l.factorY);
    l.mesh.position.set(camX - VIEW_W / 2, camY - VIEW_H / 2 + screenBottom, 0);
  }
}

const WIND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vec2 p = floor(vUv * uSize);
  float alpha = 0.0;
  vec3 col = vec3(0.62, 0.98, 0.84);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cy = uSize.y * (0.25 + 0.25 * fi);
    float amp = 2.0 + uLevel * 3.0;
    float yy = cy + floor(sin(p.x * 0.06 - uTime * 4.0 + fi * 2.1) * amp + 0.5);
    float seg = fract((p.x - uTime * 90.0 - fi * 37.0) / 46.0);
    if (abs(p.y - yy) < 1.0 && seg < 0.55 + uLevel * 0.3) {
      alpha = 0.9;
      if (seg > 0.45 + uLevel * 0.3) col = vec3(1.0, 1.0, 1.0);
    }
  }
  // A faint dithered wash shows the stream's extent.
  if (alpha == 0.0 && mod(p.x + p.y, 4.0) < 1.0 && mod(p.y, 2.0) < 1.0) alpha = 0.22;
  // Fade at the ends so ribbons read as a stream, not a wall.
  float edge = min(p.x, uSize.x - p.x);
  if (edge < 10.0 && mod(p.x + p.y, 2.0) < 1.0) alpha *= 0.0;
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.8, 0.92), uLevel * 0.35), alpha);
}`;

export function createWindMesh(w: number, h: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: WIND_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } },
  });
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(w / 2, h / 2, 0);
  return new THREE.Mesh(geo, mat);
}

export { pixelTexture };
