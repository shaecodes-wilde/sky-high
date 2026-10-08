import { keyLabel } from '../config/keys';
import { DOUBLE_TAP_RANGE_MS, type AssistMode } from '../config/movement';
import { PRESET_INFO, type PresetName } from '../config/presentation';
import { formatDelta, formatTime } from '../persist/records';
import type { Settings } from '../persist/settings';
import { CHARACTER_INFO, type CharacterId } from '../render/characters';
import { GameRenderer } from '../render/GameRenderer';
import type { GameMode } from '../sim/World';
import { buildWordmark, installOrnaments } from './ornaments';

// DOM menus and HUD, laid over the letterboxed game view and scaled with
// the same integer factor as the pixel art. The HUD is updated with direct
// text writes (no framework, no per-frame layout work beyond a few nodes).

type Btn = [label: string, onClick: () => void, opts?: { big?: boolean; selected?: boolean }];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface CompleteInfo {
  mode: GameMode;
  time: number;
  clean: boolean;
  practiceReason: string | null;
  best: number | null;
  previousBest: number | null;
  newBest: boolean;
  splits: (number | null)[];
  bestSplits: (number | null)[];
  seeds: [number, number];
  keepsakes: [number, number];
  fragments: number;
  character: CharacterId;
}

export class UI {
  private root: HTMLElement;
  private menu: HTMLElement;
  private hud: HTMLElement;
  private hudLeft: HTMLElement;
  private hudNotes: HTMLElement[] = [];
  private hudSeeds: HTMLElement;
  private hudBloom: HTMLElement;
  private bloomTier = -1;
  private hudRight: HTMLElement;
  private hudTime: HTMLElement;
  private hudPractice: HTMLElement;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private captionEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private escHandler: (() => void) | null = null;
  private lastHud = '';

  constructor(root: HTMLElement) {
    this.root = root;
    installOrnaments(root);
    this.hud = el('div', 'hud');
    this.hudLeft = el('div', 'chip left');
    // Melody pips, a sun-seed counter and the Bloom curl, printed as tiny plates.
    const notes = el('span', 'notes');
    for (let i = 0; i < 3; i++) {
      const n = el('i', 'pip note');
      this.hudNotes.push(n);
      notes.append(n);
    }
    const seeds = el('span', 'seeds');
    this.hudSeeds = el('span', 'count');
    seeds.append(el('i', 'pip seed'), this.hudSeeds);
    this.hudBloom = el('i', 'pip bloom');
    this.hudBloom.title = 'Bloom';
    this.hudLeft.append(notes, seeds, this.hudBloom);
    this.hudRight = el('div', 'chip right');
    this.hudTime = el('span');
    this.hudPractice = el('span', 'practice');
    this.hudRight.append(this.hudTime, this.hudPractice);
    this.hud.append(this.hudLeft, this.hudRight);
    this.hud.style.display = 'none';
    this.menu = el('div', 'layer');
    root.append(this.hud, this.menu);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** Matches the overlay to the game view rectangle. */
  layout(rect: { x: number; y: number; w: number; h: number; scale: number }): void {
    const s = this.root.style;
    s.left = `${rect.x}px`;
    s.top = `${rect.y}px`;
    s.width = `${rect.w}px`;
    s.height = `${rect.h}px`;
    s.setProperty('--u', `${rect.scale}px`);
  }

  get menuOpen(): boolean {
    return this.menu.childElementCount > 0;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.menuOpen) return;
    if (e.code === 'Escape' && this.escHandler) {
      e.preventDefault();
      this.escHandler();
      return;
    }
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrows.includes(e.code)) return;
    if (document.activeElement instanceof HTMLInputElement && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;
    const focusables = [...this.menu.querySelectorAll<HTMLElement>('button, input, .char')];
    if (!focusables.length) return;
    e.preventDefault();
    const i = focusables.indexOf(document.activeElement as HTMLElement);
    const dir = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
    const next = focusables[(i + dir + focusables.length) % focusables.length];
    next.focus();
  }

  private open(panel: HTMLElement, onEsc: (() => void) | null = null): void {
    this.menu.replaceChildren(panel);
    this.escHandler = onEsc;
    const first = panel.querySelector<HTMLElement>('.selected, button.big, button, .char');
    queueMicrotask(() => first?.focus());
  }

  closeMenu(): void {
    this.menu.replaceChildren();
    this.escHandler = null;
  }

  private buttons(btns: Btn[]): HTMLElement {
    const row = el('div', 'row');
    for (const [label, fn, opts] of btns) {
      const b = el('button', `${opts?.big ? 'big' : ''} ${opts?.selected ? 'selected' : ''}`.trim());
      b.textContent = label;
      b.addEventListener('click', fn);
      row.append(b);
    }
    return row;
  }

  // ── screens ────────────────────────────────────────────────────────────
  showTitle(onStart: () => void): void {
    const p = el('div', 'panel title');
    p.append(
      buildWordmark().el,
      el('div', 'subtitle', 'A Sky Out of Tune'),
      el('div', 'tag', 'working title · vertical slice'),
    );
    const b = this.buttons([['Start', onStart, { big: true }]]);
    b.style.marginTop = 'calc(var(--u) * 14)';
    p.append(b, el('div', 'keys', 'Best with a keyboard · sound on'));
    this.open(p);
  }

  showSetup(s: Settings, onChange: () => void, onNext: () => void, onSettings: () => void, onBack: () => void): void {
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Before the morning'));
    const modeDesc: Record<GameMode, string> = {
      adventure: 'Frequent checkpoints, friendly recovery routes, little conversations.',
      timeTrial: 'Clean full runs from the start. Splits and local best times. Dialogue skipped.',
    };
    const assistDesc: Record<AssistMode, string> = {
      none: 'Standard timing windows.',
      gentle: 'Longer coyote time and jump buffers. Records are kept separately.',
    };
    const render = () => {
      p.querySelectorAll('.dyn').forEach((n) => n.remove());
      const mk = (label: string, row: HTMLElement, desc: string) => {
        const box = el('div', 'dyn');
        box.append(el('div', 'opt-label', label), row, el('p', 'muted', esc(desc)));
        return box;
      };
      const set = (fn: () => void) => () => {
        fn();
        onChange();
        render();
      };
      p.insertBefore(
        mk(
          'Mode',
          this.buttons([
            ['Adventure', set(() => (s.mode = 'adventure')), { selected: s.mode === 'adventure' }],
            ['Time Trial', set(() => (s.mode = 'timeTrial')), { selected: s.mode === 'timeTrial' }],
          ]),
          modeDesc[s.mode],
        ),
        actions,
      );
      p.insertBefore(
        mk(
          'Presentation',
          this.buttons(
            (['gentle', 'standard', 'vivid'] as PresetName[]).map((n): Btn => [n[0].toUpperCase() + n.slice(1), set(() => this.onPreset?.(n)), { selected: s.preset === n }]),
          ),
          PRESET_INFO[s.preset],
        ),
        actions,
      );
      p.insertBefore(
        mk(
          'Timing assist',
          this.buttons([
            ['Off', set(() => (s.assist = 'none')), { selected: s.assist === 'none' }],
            ['Gentle', set(() => (s.assist = 'gentle')), { selected: s.assist === 'gentle' }],
          ]),
          assistDesc[s.assist],
        ),
        actions,
      );
    };
    const actions = this.buttons([
      ['Back', onBack],
      ['Settings', onSettings],
      ['Choose a traveller →', onNext, { big: true }],
    ]);
    p.append(actions);
    render();
    this.open(p, onBack);
    queueMicrotask(() => actions.querySelector<HTMLElement>('button.big')?.focus());
  }

  /** Set by the game: applies a preset to settings. */
  onPreset: ((n: PresetName) => void) | null = null;

  showSelect(current: CharacterId, onPick: (c: CharacterId) => void, onBack: () => void, onMove: () => void): void {
    const wrap = el('div');
    wrap.style.pointerEvents = 'auto';
    const head = el('h2', 'select-head', 'Who will carry the missing melody?');
    const chars = el('div', 'chars');
    let sel = current;
    const cards = new Map<CharacterId, HTMLElement>();
    for (const id of ['poppy', 'puddlewick'] as CharacterId[]) {
      const info = CHARACTER_INFO[id];
      const card = el('div', 'char');
      card.tabIndex = 0;
      card.append(GameRenderer.portrait(id, 'idle0', 3), el('div', 'lip'));
      card.append(el('h3', '', esc(info.name)), el('p', 'muted', esc(info.blurb)), el('p', 'line', esc(info.line)));
      card.addEventListener('click', () => (sel === id ? onPick(id) : choose(id)));
      card.addEventListener('focus', () => choose(id));
      card.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          onPick(sel);
        }
      });
      cards.set(id, card);
      chars.append(card);
    }
    const choose = (id: CharacterId) => {
      if (sel !== id) onMove();
      sel = id;
      for (const [cid, c] of cards) c.classList.toggle('selected', cid === sel);
    };
    choose(current);
    const bed = el('div', 'cloudbed');
    const note = el('p', 'select-note', 'Both travel exactly the same way — choose whoever makes you smile.');
    const actions = this.buttons([
      ['Back', onBack],
      ['Begin', () => onPick(sel), { big: true }],
    ]);
    wrap.append(head, chars, bed, note, actions);
    this.open(wrap, onBack);
    queueMicrotask(() => cards.get(sel)?.focus());
  }

  showPause(mode: GameMode, practiceNote: string | null, h: { resume: () => void; checkpoint: () => void; restart: () => void; settings: () => void; quit: () => void }): void {
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Taking a breath'));
    if (practiceNote) p.append(el('p', 'behind', esc(practiceNote)));
    p.append(
      this.buttons([['Resume', h.resume, { big: true }]]),
      this.buttons([
        ['Retry from checkpoint', h.checkpoint],
        ['Restart full run', h.restart],
      ]),
      this.buttons([
        ['Settings', h.settings],
        ['Quit to title', h.quit],
      ]),
      el(
        'div',
        'keys',
        `<kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> jump · tap a direction twice in the air or <kbd>${esc(this.dashLabel)}</kbd> to dash<br><kbd>R</kbd> checkpoint retry · <kbd>Backspace</kbd> full restart · <kbd>M</kbd> mute · <kbd>Esc</kbd> pause`,
      ),
    );
    if (mode === 'timeTrial') p.append(el('p', 'muted', 'In Time Trial, death, pausing, losing focus, hiding the tab or retrying from a checkpoint moves the attempt to practice. Restart the full run for a clean, recordable attempt.'));
    this.open(p, h.resume);
  }

  dashLabel = 'Shift';

  showSettings(s: Settings, onChange: () => void, onRemap: (done: () => void) => void, onBack: () => void): void {
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Settings'));
    const grid = el('div', 'settings-grid');
    const slider = (label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void, fmt: (v: number) => string) => {
      const lab = el('label', '', esc(label));
      const box = el('div');
      box.style.cssText = 'display:flex;gap:calc(var(--u)*4);align-items:center';
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      const out = el('span', '', fmt(get()));
      out.style.minWidth = 'calc(var(--u)*28)';
      input.addEventListener('input', () => {
        put(Number(input.value));
        out.textContent = fmt(Number(input.value));
        onChange();
      });
      box.append(input, out);
      grid.append(lab, box);
    };
    const toggle = (label: string, get: () => boolean, put: (v: boolean) => void) => {
      const lab = el('label', '', esc(label));
      const b = el('button', get() ? 'selected' : '');
      b.textContent = get() ? 'On' : 'Off';
      b.addEventListener('click', () => {
        put(!get());
        b.textContent = get() ? 'On' : 'Off';
        b.classList.toggle('selected', get());
        onChange();
      });
      const box = el('div');
      box.append(b);
      grid.append(lab, box);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    slider('Music', 0, 1, 0.05, () => s.musicVolume, (v) => (s.musicVolume = v), pct);
    slider('Effects', 0, 1, 0.05, () => s.sfxVolume, (v) => (s.sfxVolume = v), pct);
    toggle('Mute all (M)', () => s.muted, (v) => (s.muted = v));
    slider('Camera shake', 0, 1, 0.25, () => s.shake, (v) => (s.shake = v), (v) => (v === 0 ? 'Off' : pct(v)));
    toggle('Afterimages', () => s.afterimages, (v) => (s.afterimages = v));
    toggle('Background distortion', () => s.distortion, (v) => (s.distortion = v));
    slider('Double-tap window', DOUBLE_TAP_RANGE_MS[0], DOUBLE_TAP_RANGE_MS[1], 10, () => s.doubleTapMs, (v) => (s.doubleTapMs = v), (v) => `${v} ms`);
    const remapLab = el('label', '', 'Dash key');
    const remap = el('button');
    remap.textContent = keyLabel(s.dashKey);
    remap.addEventListener('click', () => {
      remap.textContent = 'Press a key…';
      onRemap(() => (remap.textContent = keyLabel(s.dashKey)));
    });
    const rb = el('div');
    rb.append(remap);
    grid.append(remapLab, rb);
    p.append(grid, el('p', 'muted', 'Presentation presets (on the setup screen) reset shake, afterimages and distortion. Effects never change the gameplay.'));
    p.append(this.buttons([['Done', onBack, { big: true }]]));
    this.open(p, onBack);
  }

  showComplete(c: CompleteInfo, onAgain: () => void, onTitle: () => void): void {
    const p = el('div', 'panel complete');
    p.append(el('h2', '', 'The morning remembers its song'));
    const who = CHARACTER_INFO[c.character].name;
    p.append(el('p', '', `${esc(who)} reached the sleeping sun with ${c.fragments}/3 melody fragments.`));
    if (c.mode === 'timeTrial') {
      const t = el('p', '', `<b style="font-size:1.6em">${formatTime(c.time)}</b>`);
      p.append(t);
      if (!c.clean) p.append(el('p', 'behind', `Practice attempt (${esc(c.practiceReason ?? 'practice')}) — not recorded.`));
      else if (c.newBest) p.append(el('p', 'ahead', c.previousBest === null ? 'First clean run recorded!' : `New best! (${formatDelta(c.time - c.previousBest)})`));
      else p.append(el('p', '', `Best: ${formatTime(c.best)} (${formatDelta(c.time - (c.best ?? c.time))})`));
      const table = el('table', 'splits');
      const prevBest = c.newBest && c.clean ? [] : c.bestSplits;
      c.splits.forEach((s, i) => {
        const b = prevBest[i] ?? null;
        const d = s !== null && b !== null ? s - b : null;
        const tr = el('tr');
        tr.innerHTML = `<td>Split ${i + 1}</td><td>${formatTime(s)}</td><td class="${d === null ? '' : d <= 0 ? 'ahead' : 'behind'}">${d === null ? '' : formatDelta(d)}</td>`;
        table.append(tr);
      });
      p.append(table);
    } else {
      p.append(el('p', '', `Time: ${formatTime(c.time)}`));
    }
    p.append(el('p', 'muted', `Sun-seeds ${c.seeds[0]}/${c.seeds[1]} · Keepsakes ${c.keepsakes[0]}/${c.keepsakes[1]}`));
    p.append(
      this.buttons([
        ['Play again', onAgain, { big: true }],
        ['Title', onTitle],
      ]),
    );
    this.open(p, onTitle);
  }

  showFallback(msg: string): void {
    const f = el('div', 'fallback');
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Cloudbloom can’t start here'), el('p', '', esc(msg)));
    f.append(p);
    document.body.append(f);
  }

  // ── HUD ────────────────────────────────────────────────────────────────
  setHudVisible(v: boolean): void {
    this.hud.style.display = v ? '' : 'none';
  }

  updateHud(mode: GameMode, fragments: number, seeds: number, time: number, practice: string | null): void {
    const key = `${mode}|${fragments}|${seeds}|${mode === 'timeTrial' ? time.toFixed(2) : ''}|${practice}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hudNotes.forEach((n, i) => n.classList.toggle('on', i < fragments));
    this.hudSeeds.textContent = String(seeds);
    this.hudLeft.setAttribute('aria-label', `Melody fragments ${fragments} of 3, sun-seeds ${seeds}`);
    this.hudRight.style.display = mode === 'timeTrial' ? '' : 'none';
    this.hudTime.textContent = formatTime(time);
    this.hudPractice.textContent = practice ? `practice · ${practice}` : '';
  }

  /** Optional: shows the Bloom tier as a curl that prints more plates (presentation only). */
  setBloom(tier: 0 | 1 | 2): void {
    if (tier === this.bloomTier) return;
    this.bloomTier = tier;
    this.hudBloom.dataset.tier = String(tier);
    this.hudBloom.classList.remove('pulse');
    void this.hudBloom.offsetWidth;
    if (tier > 0) this.hudBloom.classList.add('pulse');
  }

  toast(html: string, seconds = 2.2): void {
    this.toastEl?.remove();
    const t = el('div', 'toast', html);
    this.hud.append(t);
    this.toastEl = t;
    this.toastTimer = seconds;
  }

  caption(text: string, seconds: number): void {
    this.captionEl?.remove();
    const c = el('div', 'caption', esc(text));
    this.hud.append(c);
    this.captionEl = c;
    window.setTimeout(() => {
      c.style.opacity = '0';
      window.setTimeout(() => c.remove(), 900);
    }, seconds * 1000);
  }

  tick(dt: number): void {
    if (this.toastEl) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEl.remove();
        this.toastEl = null;
      }
    }
  }

  banner(text: string | null, onClick?: () => void): void {
    this.bannerEl?.remove();
    this.bannerEl = null;
    if (!text) return;
    const b = el('button', 'banner');
    b.textContent = text;
    if (onClick) b.addEventListener('click', onClick);
    this.root.append(b);
    this.bannerEl = b;
  }
}
