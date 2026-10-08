import * as THREE from 'three';
import { ANIMS, FRAME_H, FRAME_W, RUN_FPS_RANGE, type AnimName } from '../config/animation';
import type { Presentation } from '../config/presentation';
import type { LevelData } from '../level/types';
import type { World, WorldEvent } from '../sim/World';
import { createParallax, createSky, createWindMesh, placeParallax, type ParallaxLayer } from './background';
import { VIEW_H, VIEW_W, type CameraRig } from './CameraRig';
import { buildCharacter, type CharacterId } from './characters';
import { Particles } from './Particles';
import { Pix } from './pixel';
import * as art from './props';
import { Bursts } from './Bursts';
import { CLOUD, PLATES } from './palette';
import { chooseAnim, PresentationSignals, type MotionSignals } from './signals';

// Three.js is only the renderer here: it draws the simulation's state at a
// 480×270 virtual resolution into a render target, then upscales that by
// an integer factor (letterboxed) with nearest-neighbour sampling.

type Anchor = 'bl' | 'bc' | 'c';

const ORDER = {
  far: 4,
  wind: 6,
  decorBack: 7,
  platform: 10,
  spring: 11,
  decor: 12,
  hazard: 13,
  collectible: 14,
  ring: 15,
  shadow: 11.5,
  npc: 18,
  afterimage: 19,
  burst: 19.5,
  player: 20,
  particles: 21,
  bubble: 22,
};

const AFTERIMAGE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uTint;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  // Dithered fade keeps the silhouette crisp.
  vec2 p = floor(gl_FragCoord.xy);
  float d = mod(p.x + p.y * 2.0, 4.0) / 4.0;
  if (d >= uAlpha) discard;
  gl_FragColor = vec4(uTint, 1.0);
}`;

const BLIT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv); }`;

const BASIC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

interface Placed {
  mesh: THREE.Mesh;
  x0: number;
  x1: number;
  hidden?: boolean;
}

interface Afterimage {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  life: number;
}

interface Bubble {
  mesh: THREE.Mesh;
  life: number;
}

export interface RenderInput {
  world: World;
  camera: CameraRig;
  alpha: number;
  pres: Presentation;
  showPlayer: boolean;
  /** Real seconds since the previous frame (presentation-only animation). */
  frameDt: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H / 2, -VIEW_H / 2, -100, 100);
  private blitScene = new THREE.Scene();
  private blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sky = createSky();
  private layers: ParallaxLayer[] = createParallax();
  readonly particles = new Particles();
  private signals = new PresentationSignals();
  private bursts!: Bursts;
  /** Landing shadow: where the player will touch down (sizes 0..3, near → far). */
  private shadow!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadowTex: THREE.Texture[] = [];
  /** A second, out-of-register impression of the live sprite at speed. */
  private regGhost!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private texCache = new Map<string, THREE.Texture>();
  private matCache = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  private geoCache = new Map<string, THREE.PlaneGeometry>();
  private world!: World;
  private level!: LevelData;
  private placed: Placed[] = [];
  private signMeshes = new Set<THREE.Mesh>();
  private seedMeshes: THREE.Mesh[] = [];
  private seedFrames: THREE.Texture[] = [];
  private seedMat!: THREE.MeshBasicMaterial;
  private fragmentMeshes: THREE.Mesh[] = [];
  private keepsakeMeshes: THREE.Mesh[] = [];
  private checkpointMeshes: THREE.Mesh[] = [];
  private springMeshes: THREE.Mesh[] = [];
  private springTex: THREE.Texture[] = [];
  private ringMeshes: THREE.Mesh[] = [];
  private ringTex: { armed: THREE.Texture[]; dormant: THREE.Texture } = { armed: [], dormant: null! };
  private windMeshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private flowerMeshes: { mesh: THREE.Mesh; v: number }[] = [];
  private flowerTex = new Map<string, THREE.Texture>();
  private lampMeshes: THREE.Mesh[] = [];
  private lampTex: THREE.Texture[] = [];
  private bridgeMeshes: THREE.Mesh[] = [];
  private ghostMeshes: THREE.Mesh[] = [];
  private paradeSpringMeshes: THREE.Mesh[] = [];
  private faceMeshes: { mesh: THREE.Mesh; x: number }[] = [];
  private faceTex: THREE.Texture[] = [];
  private giantFlower!: THREE.Mesh;
  private giantTex: THREE.Texture[] = [];
  private sun!: THREE.Mesh;
  private sunTex: THREE.Texture[] = [];
  private npcMeshes: THREE.Mesh[] = [];
  private player!: THREE.Mesh;
  private playerFrames = new Map<string, THREE.Texture>();
  private npcFrames = new Map<string, THREE.Texture>();
  private afterimages: Afterimage[] = [];
  private afterTimer = 0;
  private afterColor = 0;
  private bubbles: Bubble[] = [];
  private anim: { name: AnimName; t: number } = { name: 'idle', t: 0 };
  private time = 0;
  private character: CharacterId = 'poppy';
  private shake = 0;
  private scale = 1;
  private viewport = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
  private wakeTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.target = new THREE.WebGLRenderTarget(VIEW_W, VIEW_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    const blit = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: BASIC_VERT, fragmentShader: BLIT_FRAG, uniforms: { tSrc: { value: this.target.texture } }, depthTest: false }),
    );
    this.blitScene.add(blit);
    this.scene.add(this.sky);
    for (const l of this.layers) this.scene.add(l.mesh);
    this.scene.add(this.particles.points);
    this.bursts = new Bursts(this.scene, ORDER.burst);
    this.shadowTex = [14, 11, 8, 5].map((w, i) => shadowPix(w, i).toTexture());
    this.shadow = new THREE.Mesh(this.geo(16, 3, 'bc'), new THREE.MeshBasicMaterial({ map: this.shadowTex[0], transparent: true, depthTest: false, depthWrite: false }));
    this.shadow.renderOrder = ORDER.shadow;
    this.shadow.frustumCulled = false;
    this.shadow.visible = false;
    this.scene.add(this.shadow);
    this.resize();
  }

  // ── setup ────────────────────────────────────────────────────────────
  private tex(key: string, make: () => Pix): THREE.Texture {
    let t = this.texCache.get(key);
    if (!t) {
      t = make().toTexture();
      this.texCache.set(key, t);
    }
    return t;
  }

  private mat(t: THREE.Texture): THREE.MeshBasicMaterial {
    let m = this.matCache.get(t);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      this.matCache.set(t, m);
    }
    return m;
  }

  private geo(w: number, h: number, anchor: Anchor): THREE.PlaneGeometry {
    const key = `${w}x${h}${anchor}`;
    let g = this.geoCache.get(key);
    if (!g) {
      g = new THREE.PlaneGeometry(w, h);
      if (anchor === 'bl') g.translate(w / 2, h / 2, 0);
      else if (anchor === 'bc') g.translate(0, h / 2, 0);
      this.geoCache.set(key, g);
    }
    return g;
  }

  private sprite(t: THREE.Texture, anchor: Anchor, x: number, y: number, order: number, ownMaterial = false): THREE.Mesh {
    const img = t.image as HTMLCanvasElement;
    const material = ownMaterial ? this.mat(t).clone() : this.mat(t);
    const m = new THREE.Mesh(this.geo(img.width, img.height, anchor), material);
    m.position.set(Math.round(x), Math.round(y), 0);
    m.renderOrder = order;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  private place(m: THREE.Mesh, x0: number, x1: number): THREE.Mesh {
    this.placed.push({ mesh: m, x0, x1 });
    return m;
  }

  /** Points the renderer at a fresh World for the same level (mode/assist change). */
  buildLevelState(world: World): void {
    if (world.level !== this.level) throw new Error('buildLevelState expects the same level');
    this.world = world;
  }

  /** Tutorial signs are hidden in Time Trial. */
  setSignsVisible(v: boolean): void {
    for (const pl of this.placed) if (this.signMeshes.has(pl.mesh)) pl.hidden = !v;
  }

  buildLevel(world: World): void {
    this.world = world;
    const level = world.level;
    this.level = level;
    let seed = 1;

    for (const p of level.platforms) {
      const w = p.x1 - p.x0;
      if (p.kind === 'island') {
        const h = p.top - p.bottom;
        const t = this.tex(`island${p.id}`, () => art.drawIsland(w, h, seed++));
        this.place(this.sprite(t, 'bl', p.x0, p.bottom, ORDER.platform), p.x0, p.x1);
      } else if (p.kind === 'cloud') {
        const t = this.tex(`cloud${w}r${p.recovery ? 1 : 0}s${p.id}`, () => art.drawCloud(w, !!p.recovery, p.id));
        this.place(this.sprite(t, 'bl', p.x0, p.top - 22, ORDER.platform), p.x0, p.x1);
        if (p.id % 3 === 1 && w >= 90) {
          const fm = this.sprite(this.faceTexture(false), 'bc', p.x0 + w / 2, p.top - 15, ORDER.platform + 0.5);
          this.faceMeshes.push({ mesh: fm, x: p.x0 });
          this.place(fm, p.x0, p.x1);
        }
      } else if (p.kind === 'petal') {
        const real = this.sprite(this.tex(`petal${w}`, () => art.drawPetal(w, false)), 'bl', p.x0, p.top - 12, ORDER.platform, true);
        const ghost = this.sprite(this.tex(`ghost${w}`, () => art.drawPetal(w, true)), 'bl', p.x0, p.top - 12, ORDER.platform, true);
        this.bridgeMeshes.push(this.place(real, p.x0, p.x1));
        this.ghostMeshes.push(this.place(ghost, p.x0, p.x1));
      } else {
        const t = this.tex(`goal${w}`, () => art.drawGoalFlower(w));
        this.place(this.sprite(t, 'bl', p.x0, p.top - 46, ORDER.platform), p.x0, p.x1);
      }
    }

    this.springTex = [art.drawSpring(0), art.drawSpring(1), art.drawSpring(-1)].map((p) => p.toTexture());
    world.springs.forEach((s) => {
      const m = this.sprite(this.springTex[0], 'bc', s.x, s.top, ORDER.spring, s.parade);
      this.springMeshes.push(this.place(m, s.x - 12, s.x + 12));
      if (s.parade) this.paradeSpringMeshes.push(m);
    });

    this.ringTex.armed = [0, 1, 2, 3].map((k) => art.drawRing(true, (k * Math.PI) / 2).toTexture());
    this.ringTex.dormant = art.drawRing(false, 0).toTexture();
    for (const r of level.rings) this.ringMeshes.push(this.place(this.sprite(this.ringTex.armed[0], 'c', r.x, r.y, ORDER.ring), r.x - 10, r.x + 10));

    for (const wz of level.winds) {
      const m = createWindMesh(wz.w, wz.h);
      m.position.set(wz.x, wz.y, 0);
      m.renderOrder = ORDER.wind;
      m.frustumCulled = false;
      this.scene.add(m);
      this.windMeshes.push(m);
      this.place(m, wz.x, wz.x + wz.w);
    }

    level.hazards.forEach((h, i) => {
      const t = this.tex(`thistle${h.w}_${i}`, () => art.drawThistles(h.w, i));
      this.place(this.sprite(t, 'bl', h.x - 1, h.y, ORDER.hazard), h.x, h.x + h.w);
    });

    this.seedFrames = [0, 1, 2, 3].map((k) => art.drawSeed(k).toTexture());
    this.seedMat = new THREE.MeshBasicMaterial({ map: this.seedFrames[0], transparent: true, depthTest: false, depthWrite: false });
    for (const s of level.seeds) {
      const m = new THREE.Mesh(this.geo(8, 8, 'c'), this.seedMat);
      m.position.set(s.x, s.y, 0);
      m.renderOrder = ORDER.collectible;
      m.frustumCulled = false;
      this.scene.add(m);
      this.seedMeshes.push(this.place(m, s.x - 4, s.x + 4));
    }
    const fragTex = art.drawFragment().toTexture();
    for (const f of level.fragments) this.fragmentMeshes.push(this.place(this.sprite(fragTex, 'c', f.x, f.y, ORDER.collectible), f.x - 9, f.x + 9));
    for (const k of level.keepsakes) {
      const t = this.tex(`keep${k.icon}`, () => art.drawKeepsake(k.icon));
      this.keepsakeMeshes.push(this.place(this.sprite(t, 'c', k.x, k.y, ORDER.collectible), k.x - 7, k.x + 7));
    }
    const cpClosed = art.drawCheckpoint(false).toTexture();
    this.tex('cpOpen', () => art.drawCheckpoint(true));
    for (const c of level.checkpoints) this.checkpointMeshes.push(this.place(this.sprite(cpClosed, 'bc', c.x, c.y, ORDER.decor), c.x - 8, c.x + 8));
    this.texCache.set('cpClosed', cpClosed);

    for (const s of level.signs) {
      const t = this.tex(`sign:${s.text}`, () => art.drawSign(s.text));
      const w = (t.image as HTMLCanvasElement).width;
      this.signMeshes.add(this.place(this.sprite(t, 'bc', s.x, s.y, ORDER.decorBack), s.x - w / 2, s.x + w / 2));
    }

    this.lampTex = [art.drawLamp(false).toTexture(), art.drawLamp(true).toTexture()];
    for (const d of level.decor) {
      if (d.kind === 'flower') {
        const m = this.sprite(this.flowerTexture(d.v, 0), 'bc', d.x, d.y, ORDER.decor);
        this.flowerMeshes.push({ mesh: m, v: d.v });
        this.place(m, d.x - 5, d.x + 5);
      } else if (d.kind === 'tuft') {
        this.place(this.sprite(this.tex(`tuft${d.v % 2}`, () => art.drawTuft(d.v)), 'bc', d.x, d.y, ORDER.decor), d.x - 4, d.x + 4);
      } else if (d.kind === 'mushroom') {
        this.place(this.sprite(this.tex(`dm${d.v % 2}`, () => art.drawDecorMushroom(d.v)), 'bc', d.x, d.y, ORDER.decorBack), d.x - 9, d.x + 9);
      } else if (d.kind === 'lamp') {
        const m = this.sprite(this.lampTex[0], 'bc', d.x, d.y, ORDER.decorBack);
        this.lampMeshes.push(this.place(m, d.x - 5, d.x + 5));
      }
    }

    this.giantTex = [0, 0.2, 0.4, 0.6, 0.8, 1].map((o) => art.drawGiantFlower(o).toTexture());
    this.giantFlower = this.sprite(this.giantTex[0], 'c', level.parade.flower.x, level.parade.flower.y, ORDER.far);
    this.place(this.giantFlower, level.parade.flower.x - 64, level.parade.flower.x + 64);
    this.sunTex = [art.drawSun(0).toTexture(), art.drawSun(1).toTexture()];
    this.sun = this.sprite(this.sunTex[0], 'c', level.sun.x, level.sun.y, ORDER.far);
    this.place(this.sun, level.sun.x - 56, level.sun.x + 56);

    this.player = new THREE.Mesh(this.geo(FRAME_W, FRAME_H, 'bc'), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.player.renderOrder = ORDER.player;
    this.player.frustumCulled = false;
    this.scene.add(this.player);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        this.geo(FRAME_W, FRAME_H, 'bc'),
        new THREE.ShaderMaterial({
          vertexShader: BASIC_VERT,
          fragmentShader: AFTERIMAGE_FRAG,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { map: { value: null }, uTint: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        }),
      );
      mesh.renderOrder = ORDER.afterimage;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.afterimages.push({ mesh, life: 0 });
    }
    this.regGhost = new THREE.Mesh(
      this.geo(FRAME_W, FRAME_H, 'bc'),
      new THREE.ShaderMaterial({
        vertexShader: BASIC_VERT,
        fragmentShader: AFTERIMAGE_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { map: { value: null }, uTint: { value: new THREE.Color(PLATES[1]) }, uAlpha: { value: 0.5 } },
      }),
    );
    this.regGhost.renderOrder = ORDER.afterimage;
    this.regGhost.visible = false;
    this.regGhost.frustumCulled = false;
    this.scene.add(this.regGhost);
    for (const n of level.npcs) {
      const m = new THREE.Mesh(this.geo(FRAME_W, FRAME_H, 'bc'), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(n.x, n.y, 0);
      m.scale.x = -1;
      m.renderOrder = ORDER.npc;
      m.frustumCulled = false;
      this.scene.add(m);
      this.npcMeshes.push(this.place(m, n.x - 12, n.x + 12));
    }
    this.setCharacter(this.character);
  }

  private faceTexture(awake: boolean): THREE.Texture {
    if (!this.faceTex.length) this.faceTex = [art.drawCloudFace(false).toTexture(), art.drawCloudFace(true).toTexture()];
    return this.faceTex[awake ? 1 : 0];
  }

  private flowerTexture(v: number, stage: 0 | 1 | 2): THREE.Texture {
    const key = `${v % 15}:${stage}`;
    let t = this.flowerTex.get(key);
    if (!t) {
      t = art.drawFlower(v, stage).toTexture();
      this.flowerTex.set(key, t);
    }
    return t;
  }

  setCharacter(id: CharacterId): void {
    const other: CharacterId = id === 'poppy' ? 'puddlewick' : 'poppy';
    if (id !== this.character || !this.playerFrames.size) {
      const load = (cid: CharacterId, into: Map<string, THREE.Texture>) => {
        for (const t of into.values()) t.dispose();
        into.clear();
        for (const [name, pix] of buildCharacter(cid).frames) into.set(name, pix.toTexture());
      };
      load(id, this.playerFrames);
      load(other, this.npcFrames);
    }
    this.character = id;
    this.afterimages.forEach((a) => (a.life = 0));
  }

  // ── events → effects ────────────────────────────────────────────────
  onEvents(events: readonly WorldEvent[], pres: Presentation): void {
    const P = this.particles;
    const w = this.world;
    const poppy = this.character === 'poppy';
    this.signals.ingest(events, w);
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.bursts.spawn('jump', e.x, e.y);
          P.emit('dust', e.x, e.y + 1, 5, 0, 1);
          P.emit(poppy ? 'spore' : 'droplet', e.x, e.y + 8, 3);
          break;
        case 'land':
          this.bursts.spawn(e.impact > w.player.cfg.maxFall * 0.75 ? 'landHard' : 'land', e.x, e.y);
          P.emit('dust', e.x, e.y + 1, e.impact > 250 ? 10 : 5, 0, 1);
          if (e.impact > 320) this.shake = Math.max(this.shake, 0.35 * pres.shake);
          if (!poppy && e.impact > 200) P.emit('droplet', e.x, e.y + 10, 4);
          break;
        case 'dash':
          this.bursts.spawn('dash', e.x - e.dir * 14, e.y + 11, e.dir);
          P.emit('dust', e.x, e.y + 11, 8, -e.dir, 0);
          P.emit(poppy ? 'petal' : 'droplet', e.x, e.y + 12, 6, -e.dir, 0);
          break;
        case 'spring':
          this.bursts.spawn('spring', w.springs[e.spring]?.x ?? e.x, (w.springs[e.spring]?.top ?? e.y) + 4);
          P.emit(poppy ? 'petal' : 'droplet', e.x, e.y, e.boosted ? 12 : 7, 0, 1);
          P.emit('sparkle', e.x, e.y, e.boosted ? 8 : 3, 0, 1);
          break;
        case 'springBoost':
          P.emit('sparkle', w.player.x, w.player.y, 8);
          break;
        case 'brake':
          P.emit('dust', e.x, e.y + 1, 4, w.player.facing, 0);
          break;
        case 'ring':
          this.bursts.spawn('ring', e.x, e.y);
          P.emit('dew', e.x, e.y, 14);
          break;
        case 'seed':
          P.emit('gold', e.x, e.y, 4);
          break;
        case 'fragment':
          this.bursts.spawn('fragment', e.x, e.y);
          P.emit('sparkle', e.x, e.y, 20);
          P.emit('confetti', e.x, e.y, 12);
          break;
        case 'keepsake':
          P.emit('sparkle', e.x, e.y, 14);
          break;
        case 'checkpoint':
          this.bursts.spawn('checkpoint', e.x, e.y + 21);
          P.emit('petal', e.x, e.y + 14, 10, 0, 1);
          break;
        case 'death':
          P.emit('puff', e.x, e.y + 10, 18);
          break;
        case 'respawn':
          P.emit('sparkle', e.x, e.y + 10, 8);
          this.afterimages.forEach((a) => (a.life = 0));
          break;
        case 'paradeStart':
          break;
        case 'npc':
          this.say(e.index);
          break;
        case 'goal':
          P.emit('confetti', e.x, e.y + 20, 40);
          break;
      }
    }
  }

  private say(index: number): void {
    const n = this.level.npcs[index];
    const text = this.character === 'poppy' ? n.lines.puddlewick : n.lines.poppy;
    const t = art.drawBubble(text).toTexture();
    const m = this.sprite(t, 'bl', n.x - 9, n.y + 34, ORDER.bubble, true);
    this.bubbles.push({ mesh: m, life: 6 });
  }

  clearTransient(): void {
    this.particles.clear();
    this.bursts.clear();
    this.signals.reset();
    for (const b of this.bubbles) this.removeBubble(b);
    this.bubbles.length = 0;
    this.afterimages.forEach((a) => {
      a.life = 0;
      a.mesh.visible = false;
    });
    this.shake = 0;
  }

  private removeBubble(b: Bubble): void {
    this.scene.remove(b.mesh);
    const m = b.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }

  // ── per-frame ────────────────────────────────────────────────────────
  render(input: RenderInput): void {
    const { world: w, camera, alpha, pres, frameDt } = input;
    const dt = Math.min(frameDt, 0.1);
    this.time += dt;
    const p = w.player;
    const parade = w.parade;
    const bloom = w.bloom.visual;
    const paradeI = parade.intensity;
    this.particles.scale = pres.particles;

    // Camera (integer pixels; shake is cosmetic and optional).
    let cx = Math.round(camera.prevX + (camera.x - camera.prevX) * alpha);
    let cy = Math.round(camera.prevY + (camera.y - camera.prevY) * alpha);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0 && pres.shake > 0) {
      const amp = Math.ceil(this.shake * 3);
      cx += Math.round((Math.random() * 2 - 1) * amp);
      cy += Math.round((Math.random() * 2 - 1) * amp);
    }
    this.cam.position.set(cx, cy, 10);
    this.cam.updateMatrixWorld();

    // Sky & parallax.
    this.sky.position.set(cx, cy, -1);
    const u = this.sky.material.uniforms;
    u.uTime.value = this.time;
    u.uBloom.value = bloom * (0.5 + 0.5 * pres.spectacle);
    u.uParade.value = paradeI;
    u.uDistort.value = pres.distortion ? 1 : 0;
    u.uSpectacle.value = pres.spectacle;
    u.uDawn.value = Math.min(1, (w.complete ? 1 : 0) * Math.min(1, this.wakeTimer / 3) + Math.max(0, (p.x - 7600) / 2400) * 0.4);
    u.uDim.value = parade.anticipation * 0.12 * pres.spectacle;
    u.uFlower.value.set(this.level.parade.flower.x - cx + VIEW_W / 2, this.level.parade.flower.y - cy + VIEW_H / 2);
    u.uCam.value.set(cx, cy);
    placeParallax(this.layers, cx, cy, 160);

    // Cull by x.
    const vx0 = cx - VIEW_W / 2 - 40;
    const vx1 = cx + VIEW_W / 2 + 40;
    for (const pl of this.placed) pl.mesh.visible = !pl.hidden && pl.x1 >= vx0 && pl.x0 <= vx1;

    // Collectibles.
    const seedFrame = Math.floor(this.time * 8) % 4;
    this.seedMat.map = this.seedFrames[seedFrame];
    this.seedMeshes.forEach((m, i) => {
      if (w.seedsTaken[i]) m.visible = false;
      else m.position.y = this.level.seeds[i].y + (Math.sin(this.time * 2 + i * 0.7) > 0.3 ? 1 : 0);
    });
    this.fragmentMeshes.forEach((m, i) => {
      if (w.fragmentsTaken[i]) m.visible = false;
      else m.position.y = Math.round(this.level.fragments[i].y + Math.sin(this.time * 2.4) * 2);
    });
    this.keepsakeMeshes.forEach((m, i) => {
      if (w.keepsakesTaken[i]) m.visible = false;
      else m.position.y = Math.round(this.level.keepsakes[i].y + Math.sin(this.time * 1.8 + i) * 1.5);
    });
    this.checkpointMeshes.forEach((m, i) => {
      (m as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material = this.mat(this.texCache.get(i <= w.checkpoint ? 'cpOpen' : 'cpClosed')!);
    });

    // Springs.
    w.springs.forEach((s, i) => {
      const m = this.springMeshes[i];
      const t = s.since < 0.07 ? this.springTex[1] : s.since < 0.22 ? this.springTex[2] : this.springTex[0];
      const mat = m.material as THREE.MeshBasicMaterial;
      if (s.parade) {
        mat.map = t;
        mat.opacity = parade.bridgeAlpha;
        if (parade.bridgeAlpha <= 0) m.visible = false;
      } else m.material = this.mat(t);
    });

    // Rings.
    const ringPhase = Math.floor(this.time * 6) % 4;
    w.rings.forEach((r, i) => {
      const m = this.ringMeshes[i];
      m.material = this.mat(r.armed ? this.ringTex.armed[ringPhase] : this.ringTex.dormant);
      m.position.y = r.def.y + (r.armed && Math.sin(this.time * 2 + i) > 0.5 ? 1 : 0);
    });

    // Wind ribbons grow more expressive with Bloom and the parade.
    const windLevel = Math.min(1, bloom * 0.7 + paradeI * 0.8) * pres.spectacle;
    for (const m of this.windMeshes) {
      m.material.uniforms.uTime.value = this.time;
      m.material.uniforms.uLevel.value = windLevel;
    }

    // Flowers open with Bloom (and fully during the parade).
    const openness = Math.max(bloom, paradeI * 0.9, w.complete ? 1 : 0);
    for (const f of this.flowerMeshes) {
      if (!f.mesh.visible) continue;
      const t1 = 0.12 + (f.v % 5) * 0.05;
      const t2 = 0.45 + (f.v % 7) * 0.04;
      const stage: 0 | 1 | 2 = openness > t2 ? 2 : openness > t1 ? 1 : 0;
      f.mesh.material = this.mat(this.flowerTexture(f.v, stage));
    }
    for (const m of this.lampMeshes) m.material = this.mat(this.lampTex[w.bloom.tier >= 1 || paradeI > 0 ? 1 : 0]);

    // Petal Parade set pieces.
    const reveal = parade.reveal;
    const gi = Math.min(5, Math.floor(reveal * 5 + 0.001));
    this.giantFlower.material = this.mat(this.giantTex[gi]);
    if (parade.state === 'active' && parade.anticipation > 0 && Math.random() < 0.5 * pres.particles) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit('sparkle', this.level.parade.flower.x + Math.cos(a) * 30, this.level.parade.flower.y + Math.sin(a) * 30, 1, -Math.cos(a), -Math.sin(a));
    }
    if (parade.state === 'active' && Math.abs(parade.t - 1.5) < dt) this.shake = Math.max(this.shake, 0.5 * pres.shake);
    const ba = parade.bridgeAlpha;
    for (const m of this.bridgeMeshes) {
      (m.material as THREE.MeshBasicMaterial).opacity = ba;
      if (ba <= 0) m.visible = false;
    }
    for (const m of this.ghostMeshes) {
      (m.material as THREE.MeshBasicMaterial).opacity = (0.55 + 0.25 * Math.sin(this.time * 2)) * (1 - ba);
      if (ba >= 1) m.visible = false;
    }
    const awakeFaces = reveal > 0.5;
    for (const f of this.faceMeshes) {
      const awake = w.complete || (awakeFaces && f.x > this.level.parade.triggerX - 700);
      f.mesh.material = this.mat(this.faceTexture(awake));
    }
    if (w.complete) this.wakeTimer += dt;
    else this.wakeTimer = 0;
    this.sun.material = this.mat(this.sunTex[w.complete && this.wakeTimer > 1.2 ? 1 : 0]);
    this.sun.position.y = this.level.sun.y + Math.round(Math.min(1, this.wakeTimer / 3) * 20);
    if (w.complete && this.wakeTimer > 1.2 && this.wakeTimer < 4 && Math.random() < 0.4 * pres.particles) {
      this.particles.emit('confetti', this.level.sun.x - 120 + Math.random() * 200, this.level.sun.y + 60, 1, 0, -1);
    }

    // NPCs idle.
    const idle = ANIMS.idle;
    const npcFrame = idle.frames[Math.floor(this.time * idle.fps) % idle.frames.length];
    for (const m of this.npcMeshes) (m.material as THREE.MeshBasicMaterial).map = this.npcFrames.get(npcFrame) ?? null;

    // Player.
    const sig = this.signals.update(w, dt);
    this.updatePlayer(input, dt, bloom, sig);

    // Bubbles.
    for (const b of this.bubbles) {
      b.life -= dt;
      if (b.life <= 0) this.removeBubble(b);
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);

    this.particles.update(dt);
    this.bursts.enabled = pres.particles > 0;
    this.bursts.update(dt);

    // Draw low-res, then upscale.
    this.renderer.setRenderTarget(this.target);
    this.renderer.setViewport(0, 0, VIEW_W, VIEW_H);
    this.renderer.setClearColor('#b9a7e6');
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(null);
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setViewport(0, 0, size.x, size.y);
    this.renderer.setClearColor('#1b1430');
    this.renderer.clear();
    const v = this.viewport;
    this.renderer.setViewport(v.x, v.y, v.w, v.h);
    this.renderer.autoClear = false;
    this.renderer.render(this.blitScene, this.blitCam);
    this.renderer.autoClear = true;
  }

  private updatePlayer(input: RenderInput, dt: number, bloom: number, sig: MotionSignals): void {
    const w = input.world;
    const p = w.player;
    const m = this.player;
    m.visible = input.showPlayer && !(w.dead && w.deadTimer < 0.4);
    const name = chooseAnim(sig);
    if (name !== this.anim.name) this.anim = { name, t: 0 };
    let fps = ANIMS[name].fps;
    if (name === 'run') {
      const k = sig.speed;
      fps = Math.min(RUN_FPS_RANGE[1], Math.max(RUN_FPS_RANGE[0], ANIMS.run.fps * k));
    }
    this.anim.t += dt * fps;
    const def = ANIMS[name];
    const idx = def.loop ? Math.floor(this.anim.t) % def.frames.length : Math.min(def.frames.length - 1, Math.floor(this.anim.t));
    const frameName = def.frames[idx];
    const tex = this.playerFrames.get(frameName) ?? null;
    (m.material as THREE.MeshBasicMaterial).map = tex;
    const x = Math.round(p.prevX + (p.x - p.prevX) * input.alpha);
    const y = Math.round(p.prevY + (p.y - p.prevY) * input.alpha);
    m.position.set(x, y, 0);
    m.scale.x = p.facing;

    // Print stamps: the sprite re-pressed in single plate colours along the path.
    // Dashes always stamp; ordinary running only stamps once the sky is singing.
    const fast = sig.speed > 1.15;
    const singing = sig.mood >= 1.6;
    const want = input.pres.afterimages && m.visible && (sig.dashing || (fast && singing));
    this.afterTimer -= dt;
    if (sig.dashStarted) this.afterTimer = 0;
    if (want && this.afterTimer <= 0) {
      this.afterTimer = sig.dashing ? 0.035 : 0.08;
      const slot = this.afterimages.reduce((a, b) => (a.life < b.life ? a : b));
      slot.life = sig.dashing ? 0.26 : 0.2;
      slot.mesh.material.uniforms.map.value = tex;
      slot.mesh.material.uniforms.uTint.value.set(PLATES[this.afterColor++ % PLATES.length]);
      slot.mesh.position.set(x, y, 0);
      slot.mesh.scale.x = p.facing;
    }
    for (const a of this.afterimages) {
      a.life -= dt;
      a.mesh.visible = a.life > 0;
      if (a.life > 0) a.mesh.material.uniforms.uAlpha.value = Math.min(0.75, (a.life / 0.26) * 0.9);
    }

    // Misregistration: a mint plate printed 2 px behind the live sprite at full flow.
    const reg = input.pres.afterimages && m.visible && (sig.dashing || (singing && sig.energy > 0.55));
    this.regGhost.visible = reg;
    if (reg) {
      const u = this.regGhost.material.uniforms;
      u.map.value = tex;
      u.uTint.value.set(sig.dashing ? PLATES[1] : PLATES[0]);
      u.uAlpha.value = sig.dashing ? 0.75 : 0.5;
      this.regGhost.position.set(x - p.facing * 2, y + (sig.dashing ? 0 : 1), 0);
      this.regGhost.scale.x = p.facing;
    }

    // Landing shadow: a soft carved dot on whatever surface is directly below,
    // shrinking with height — a read of where the jump will come down.
    this.updateShadow(w, x, y, m.visible && !w.dead);

    // Petal wake / spores at high Bloom while running.
    if (m.visible && p.grounded && fast && bloom > 0.6 && Math.random() < 0.35 * input.pres.particles) {
      this.particles.emit(this.character === 'poppy' ? 'wake' : 'droplet', p.x - p.facing * 6, p.y + 3, 1, -p.facing, 0.3);
    }
    // Singing: loose notes lift off the player now and then.
    if (m.visible && singing && sig.energy > 0.4 && Math.random() < 0.08 * input.pres.particles) {
      this.particles.emit('note', p.x - p.facing * 4, p.y + 18, 1, -p.facing * 0.3, 1);
    }
  }

  private updateShadow(w: World, x: number, y: number, show: boolean): void {
    const sh = this.shadow;
    sh.visible = false;
    if (!show) return;
    let best = -Infinity;
    for (const s of w.solids) {
      if (!s.active || x < s.x || x > s.x + s.w) continue;
      const top = s.y + s.h;
      if (top <= y + 0.5 && top > best) best = top;
    }
    const h = y - best;
    if (best === -Infinity || h > 150) return;
    const size = h < 6 ? 0 : h < 40 ? 1 : h < 90 ? 2 : 3;
    sh.material.map = this.shadowTex[size];
    sh.position.set(x, Math.round(best) - 3, 0);
    sh.visible = true;
  }

  // ── sizing ───────────────────────────────────────────────────────────
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.max(1, Math.floor(window.innerWidth * dpr));
    const H = Math.max(1, Math.floor(window.innerHeight * dpr));
    this.renderer.setSize(W, H, false);
    const fit = Math.min(W / VIEW_W, H / VIEW_H);
    // Integer upscale whenever it fits; only tiny windows fall back to a fractional fit.
    this.scale = fit >= 1 ? Math.floor(fit) : fit;
    const vw = Math.round(VIEW_W * this.scale);
    const vh = Math.round(VIEW_H * this.scale);
    this.viewport = { x: Math.floor((W - vw) / 2), y: Math.floor((H - vh) / 2), w: vw, h: vh };
  }

  /** CSS-pixel rectangle of the game view (for positioning DOM UI). */
  viewRect(): { x: number; y: number; w: number; h: number; scale: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const v = this.viewport;
    const H = Math.floor(window.innerHeight * dpr);
    return { x: v.x / dpr, y: (H - v.y - v.h) / dpr, w: v.w / dpr, h: v.h / dpr, scale: this.scale / dpr };
  }

  /** Renders one frame of a character to a canvas (UI portraits). */
  static portrait(id: CharacterId, frame: string, scale: number): HTMLCanvasElement {
    const src = buildCharacter(id).frames.get(frame)!.toCanvas();
    const cv = document.createElement('canvas');
    cv.width = FRAME_W * scale;
    cv.height = FRAME_H * scale;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
}

/** A dithered carved-shadow ellipse (never solid, so it can't read as a surface). */
function shadowPix(w: number, size: number): Pix {
  const p = new Pix(16, 3);
  const rx = w / 2;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = (x + 0.5 - 8) / rx;
      const dy = (y + 0.5 - 1.5) / 1.5;
      if (dx * dx + dy * dy > 1) continue;
      const solid = dx * dx + dy * dy < 0.35 && size < 2;
      if (solid || (x + y) % 2 === 0) p.px(x, y, CLOUD.groove);
    }
  }
  return p;
}
