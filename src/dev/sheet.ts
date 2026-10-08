import { ANIMS, FRAME_H, FRAME_NAMES, FRAME_W, type AnimName } from '../config/animation';
import { buildCharacter, buildRollPreview, CHARACTER_INFO, type CharacterId } from '../render/characters';
import type { Pix } from '../render/pixel';

// Dev-only `?sheet` page: the character review board.
//
// URL options (all optional):
//   char=poppy|puddlewick   show one character only
//   z=4                     zoom for the frame grid (default 4)
//   hit                     start with the 10×22 collision box overlay on
//   grid                    start with the pixel grid overlay on
//   still                   don't animate the cycle previews (stable screenshots)
//
// Each character gets: every frame at zoom (labelled), every animation cycle
// playing at its real fps at zoom / 2× / 1×, and a 1× + 2× strip of every
// frame over gameplay-like backgrounds (sky, cloud lip, meadow).

const HIT = { x: 7, y: 9, w: 10, h: 22 };
const BG_SKY = 'linear-gradient(#ae9ee0, #cdb8e8 55%, #f0c9cf)';

interface Opts {
  hit: boolean;
  grid: boolean;
  zoom: number;
}

function drawFrame(cv: HTMLCanvasElement, pix: Pix, z: number, o: Opts): void {
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(pix.toCanvas(), 0, 0, FRAME_W * z, FRAME_H * z);
  if (o.grid && z >= 4) {
    ctx.strokeStyle = 'rgba(43,29,58,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < FRAME_W; x++) ctx.moveTo(x * z + 0.5, 0), ctx.lineTo(x * z + 0.5, FRAME_H * z);
    for (let y = 1; y < FRAME_H; y++) ctx.moveTo(0, y * z + 0.5), ctx.lineTo(FRAME_W * z, y * z + 0.5);
    ctx.stroke();
  }
  if (o.hit) {
    ctx.strokeStyle = 'rgba(39,135,122,0.9)';
    ctx.lineWidth = Math.max(1, z / 4);
    ctx.strokeRect(HIT.x * z, HIT.y * z, HIT.w * z, HIT.h * z);
    // Foot baseline (row 30).
    ctx.strokeStyle = 'rgba(232,72,79,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, 31 * z);
    ctx.lineTo(FRAME_W * z, 31 * z);
    ctx.stroke();
  }
}

function canvas(z: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FRAME_W * z;
  cv.height = FRAME_H * z;
  cv.style.cssText = `width:${FRAME_W * z}px;height:${FRAME_H * z}px;image-rendering:pixelated;display:block`;
  return cv;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export function showSheet(root: HTMLElement): void {
  const qs = new URLSearchParams(location.search);
  const only = qs.get('char') as CharacterId | null;
  const opts: Opts = { hit: qs.has('hit'), grid: qs.has('grid'), zoom: Number(qs.get('z')) || 4 };
  const still = qs.has('still');

  root.style.cssText = 'margin:0;background:#b9a7e6;padding:12px;font:12px monospace;color:#2b1d3a';

  const bar = el('div', 'display:flex;gap:14px;align-items:center;margin-bottom:10px');
  bar.append(el('b', '', 'Cloudbloom character sheet'));
  const redraws: (() => void)[] = [];
  const toggle = (label: string, key: 'hit' | 'grid'): void => {
    const lab = el('label', 'cursor:pointer');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = opts[key];
    box.onchange = () => {
      opts[key] = box.checked;
      redraws.forEach((r) => r());
    };
    lab.append(box, ` ${label}`);
    bar.append(lab);
  };
  toggle('hitbox 10×22 + baseline', 'hit');
  toggle('pixel grid', 'grid');
  root.append(bar);

  const anims: { cvs: HTMLCanvasElement[]; zs: number[]; frames: Pix[]; fps: number; t0: number }[] = [];

  for (const id of ['poppy', 'puddlewick'] as const) {
    if (only && only !== id) continue;
    const sheet = buildCharacter(id);
    const sec = el('section', 'margin-bottom:18px');
    sec.append(el('h3', 'margin:4px 0', `${CHARACTER_INFO[id].name} — ${CHARACTER_INFO[id].blurb}`));

    // 0. Cloud Curl preview (`?sheet&curl`): rolled frames for the movement stream's mechanic.
    if (qs.has('curl')) {
      const curlRow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px');
      for (const [name, pix] of buildRollPreview(id)) {
        const cv = canvas(opts.zoom);
        cv.style.background = '#cfc3f0';
        drawFrame(cv, pix, opts.zoom, opts);
        const cell = el('div', '');
        cell.append(cv, el('div', '', name));
        curlRow.append(cell);
      }
      sec.append(el('div', 'font-weight:bold', 'Cloud Curl (forward-compatible preview)'), curlRow);
    }

    // 1. Every frame at zoom.
    const z = opts.zoom;
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:6px');
    for (const name of FRAME_NAMES) {
      const cv = canvas(z);
      cv.style.background = '#cfc3f0';
      cv.title = name;
      const pix = sheet.frames.get(name)!;
      const draw = (): void => drawFrame(cv, pix, z, opts);
      draw();
      redraws.push(draw);
      const cell = el('div');
      cell.append(cv, el('div', '', name));
      row.append(cell);
    }
    sec.append(row);

    // 2. Animated cycles at zoom / 2× / 1×.
    const arow = el('div', `display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;padding:8px;background:${BG_SKY}`);
    for (const [an, def] of Object.entries(ANIMS) as [AnimName, (typeof ANIMS)[AnimName]][]) {
      const frames = def.frames.map((f) => sheet.frames.get(f)!);
      const cell = el('div', 'display:flex;flex-direction:column;align-items:center;gap:2px');
      const line = el('div', 'display:flex;align-items:flex-end;gap:4px');
      const zs = [Math.max(3, z - 1), 2, 1];
      const cvs = zs.map((zz) => canvas(zz));
      line.append(...cvs);
      cell.append(line, el('div', '', `${an} ${def.frames.length}f @${def.fps}`));
      arow.append(cell);
      const fps = an === 'run' ? 13 : def.frames.length > 1 ? def.fps : 1;
      anims.push({ cvs, zs, frames, fps, t0: 0 });
    }
    sec.append(arow);

    // 3. Gameplay-scale strips over representative backgrounds.
    for (const s of [1, 2]) {
      const strip = el('div', `display:flex;gap:${s * 4}px;margin-top:8px;padding:${s * 6}px ${s * 6}px 0;align-items:flex-end`);
      strip.style.background = `linear-gradient(#ae9ee0, #f0c9cf calc(100% - ${s * 4}px), #fff6e9 calc(100% - ${s * 4}px), #fff6e9 calc(100% - ${s * 2}px), #b09ae0 calc(100% - ${s * 2}px))`;
      for (const name of FRAME_NAMES) {
        const cv = canvas(s);
        cv.title = name;
        drawFrame(cv, sheet.frames.get(name)!, s, { hit: false, grid: false, zoom: s });
        cv.style.marginBottom = `${-s}px`;
        strip.append(cv);
      }
      sec.append(strip);
    }
    const meadow = el('div', `display:flex;gap:8px;padding:12px 12px 0;align-items:flex-end;background:linear-gradient(#5d4b80, #8e7fd0 calc(100% - 6px), #b8e07e calc(100% - 6px))`);
    for (const name of FRAME_NAMES) {
      const cv = canvas(2);
      drawFrame(cv, sheet.frames.get(name)!, 2, { hit: false, grid: false, zoom: 2 });
      cv.style.marginBottom = '-2px';
      meadow.append(cv);
    }
    sec.append(meadow);
    root.append(sec);
  }

  const tick = (t: number): void => {
    for (const a of anims) {
      const i = still ? 0 : Math.floor((t / 1000) * a.fps) % a.frames.length;
      a.cvs.forEach((cv, k) => drawFrame(cv, a.frames[i], a.zs[k], { hit: false, grid: false, zoom: a.zs[k] }));
    }
    if (!still) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
