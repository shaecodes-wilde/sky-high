import { SIM_DT, SIM_HZ } from '../config/movement';
import type { LevelData, PlatformDef, PointDef } from '../level/types';
import { NO_INPUT, type InputFrame } from '../sim/Player';
import type { World } from '../sim/World';
import { sweepY } from '../sim/collision';

export const PLAYGROUND_SECTIONS = [
  { name: '1 · Acceleration & braking', x: 30, y: 64, hint: 'Run, release, reverse. Earned speed should persist; intentional braking should stop you.' },
  { name: '2 · Short hop / full jump', x: 830, y: 64, hint: 'Compare a tap with a held jump across the low and raised clouds.' },
  { name: '3 · Dash trajectories', x: 1630, y: 64, hint: 'Try an early, apex, then late dash across the same gap.' },
  { name: '4 · Cloud skimming', x: 2430, y: 64, hint: 'Dash onto a cloud and buffer a jump before touching down.' },
  { name: '5 · Spring fork', x: 3230, y: 64, hint: 'Run into the cap for a low rebound; press jump at contact for the high route.' },
  { name: '6 · Wind & dewdrop', x: 4030, y: 64, hint: 'Spend a dash, cross the ring, and press dash just before contact.' },
  { name: '7 · Continuous phrase', x: 4830, y: 64, hint: 'Jump → dash → cloud skim → spring → wind → ring → landing.' },
  { name: '8 · Recovery & collision', x: 6030, y: 64, hint: 'Test the thin wall, ceiling, one-way surface and recovery floor.' },
];

const platforms: PlatformDef[] = [];
function surface(x0: number, x1: number, top: number, kind: PlatformDef['kind'] = 'cloud', recovery = false): void {
  platforms.push({ id: platforms.length, x0, x1, top, bottom: kind === 'island' ? -20 : top - 8, kind, recovery });
}
surface(-120, 650, 64, 'island');
surface(800, 1080, 64, 'island'); surface(1130, 1280, 64); surface(1300, 1470, 102);
surface(1600, 1810, 64, 'island'); surface(2010, 2290, 64); surface(1800, 2250, 0, 'cloud', true);
surface(2400, 2550, 64, 'island'); surface(2640, 2760, 64); surface(2820, 2940, 64); surface(3000, 3130, 64);
surface(2550, 3150, -5, 'cloud', true);
surface(3200, 3420, 64, 'island'); surface(3530, 3740, 80); surface(3500, 3680, 210); surface(3400, 3900, 0, 'cloud', true);
surface(4000, 4230, 64, 'island'); surface(4430, 4740, 80); surface(4200, 4750, 0, 'cloud', true);
surface(4800, 4930, 64, 'island'); surface(5010, 5130, 64); surface(5190, 5330, 64); surface(5440, 5580, 110); surface(5700, 5900, 110);
surface(4940, 5900, -5, 'cloud', true);
surface(6000, 6600, 64, 'island'); surface(6250, 6252, 132, 'island'); surface(6310, 6410, 168);
platforms.push({ id: platforms.length, x0: 6120, x1: 6220, top: 136, bottom: 126, kind: 'island' });

export const PLAYGROUND_LEVEL: LevelData = {
  id: 'dev-movement-playground', name: 'Movement playground', start: PLAYGROUND_SECTIONS[0],
  minX: -220, maxX: 6900, killY: -80, platforms,
  springs: [{ x: 3390, top: 64 }, { x: 5300, top: 64 }],
  rings: [{ x: 4370, y: 126 }, { x: 5630, y: 168 }],
  winds: [{ x: 4230, y: 65, w: 220, h: 110, dir: 1, speed: 260 }, { x: 5490, y: 111, w: 300, h: 100, dir: 1, speed: 260 }],
  hazards: [{ x: 6530, y: 64, w: 24 }], seeds: [], fragments: [], keepsakes: [], checkpoints: [],
  signs: PLAYGROUND_SECTIONS.map((s) => ({ x: s.x + 80, y: s.y, text: s.name.toUpperCase().replace(' · ', '\n') })),
  npcs: [], decor: PLAYGROUND_SECTIONS.map((s, v) => ({ kind: 'flower', x: s.x + 10, y: s.y, v })),
  parade: { triggerX: 99999, flower: { x: 6850, y: 100 }, bridgeSolidAt: 2.4 },
  goal: { x0: 99990, x1: 99999, top: 0 }, sun: { x: 6840, y: 260 }, route: [], express: [],
};

/** Session-only tapes; no storage, progression or records. Input is recorded once per authoritative step. */
export class PlaygroundSession {
  constructor(
    readonly sections: readonly { name: string; x: number; y: number; hint: string }[] = PLAYGROUND_SECTIONS,
    readonly title = 'Movement playground',
  ) {
    if (!sections.length) throw new Error('A development level needs at least one section');
  }

  section = 0;
  elapsed = 0;
  event = 'ready';
  recording = false;
  replaying = false;
  private tape: InputFrame[] = [];
  private cursor = 0;
  private recordedSection = 0;
  private trail: PointDef[] = [];
  private ghost: PointDef[] = [];
  private recordedPath: PointDef[] = [];

  reset(world: World, section = this.section): void {
    this.section = Math.max(0, Math.min(this.sections.length - 1, section));
    world.resetAll();
    this.restoreSectionSpawn(world);
    this.elapsed = 0;
    this.event = 'ready';
    this.cursor = 0;
    this.recording = false;
    this.replaying = false;
    this.trail = [];
  }

  record(world: World): void {
    this.reset(world);
    this.recordedSection = this.section;
    this.tape = [];
    this.ghost = [];
    this.recordedPath = [];
    this.recording = true;
  }

  replay(world: World): boolean {
    if (!this.tape.length) return false;
    this.ghost = this.recordedPath.slice();
    this.reset(world, this.recordedSection);
    this.replaying = true;
    return true;
  }

  restoreSectionSpawn(world: World): void {
    const start = this.sections[this.section];
    const player = world.player;
    // Initial fixture placement only: the exact AABB support can be a
    // fraction above a knot's centre height. A short real vertical sweep
    // seats the feet without changing any in-flight route state.
    player.reset(start.x, start.y + 1);
    const contact = sweepY(world.solids, player, -2, 0);
    player.grounded = contact.landed;
    player.prevY = player.y;
  }

  input(live: InputFrame): InputFrame {
    if (this.replaying) {
      if (this.cursor >= this.tape.length) { this.replaying = false; return NO_INPUT; }
      return this.tape[this.cursor++];
    }
    if (this.recording) {
      if (this.tape.length < SIM_HZ * 60) this.tape.push({ ...live,
        ...(live.directionEvents ? { directionEvents: live.directionEvents.map(edge => ({ ...edge })) } : {}),
      });
      else this.recording = false;
    }
    return live;
  }

  afterStep(world: World): void {
    this.elapsed += SIM_DT;
    const last = world.events.filter((e) => !['seed', 'checkpoint', 'split'].includes(e.type)).at(-1);
    if (last) this.event = last.type;
    if (this.trail.length < SIM_HZ * 60) this.trail.push({ x: world.player.x, y: world.player.y });
    if (this.recording && this.recordedPath.length < SIM_HZ * 60) this.recordedPath.push({ x: world.player.x, y: world.player.y });
  }

  mount(world: () => World, resetView: () => void): { update: () => void; dispose: () => void } {
    const panel = document.createElement('aside');
    panel.className = 'movement-dev';
    panel.setAttribute('aria-label', `Developer ${this.title}`);
    panel.innerHTML = '<strong>Movement playground · DEV · no records</strong><select aria-label="Playground section"></select><p></p><div><button>Reset section</button><button>Record</button><button>Stop</button><button>Replay</button><label><input type="checkbox" checked> HUD</label></div><pre></pre><canvas width="360" height="95" aria-label="Trajectory: pink current, mint previous recording"></canvas>';
    panel.querySelector('strong')!.textContent = `${this.title} · DEV · no records`;
    const select = panel.querySelector('select')!;
    for (const [i, s] of this.sections.entries()) select.add(new Option(s.name, String(i)));
    const actions = [() => this.reset(world(), Number(select.value)), () => this.record(world()), () => { this.recording = false; this.replaying = false; }, () => this.replay(world())];
    panel.querySelectorAll('button').forEach((button, i) => button.addEventListener('click', () => { actions[i](); resetView(); button.blur(); }));
    select.addEventListener('change', () => { this.reset(world(), Number(select.value)); resetView(); select.blur(); });
    const pre = panel.querySelector('pre')!;
    const canvas = panel.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    document.body.append(panel);
    let lastUpdate = 0;
    return {
      update: () => {
        if (performance.now() - lastUpdate < 100) return;
        lastUpdate = performance.now();
        select.value = String(this.section);
        panel.querySelector('p')!.textContent = this.sections[this.section].hint;
        const p = world().player;
        pre.hidden = !(panel.querySelector('input') as HTMLInputElement).checked;
        pre.textContent = `vx ${p.vx.toFixed(1)}  vy ${p.vy.toFixed(1)}  ${p.grounded ? 'grounded' : 'airborne'}\n${p.rolling ? 'CLOUD CURL' : 'standing'} · slope ${(p.surface?.slope ?? 0).toFixed(2)} · pump ${p.pumpResult}\ndash ${p.dashCharges}  timer ${p.dashTimer.toFixed(3)}  coyote ${p.coyote.toFixed(3)}\njump buffer ${p.jumpBuffer.toFixed(3)}  dash buffer ${p.dashBuffer.toFixed(3)}\n${this.event} · ${SIM_HZ} Hz · segment ${this.elapsed.toFixed(2)}s\n${this.recording ? 'RECORDING' : this.replaying ? 'REPLAY' : 'live'} · ${this.tape.length} recorded steps`;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const start = this.sections[this.section];
        for (const [path, color] of [[this.ghost, '#9ff0d0'], [this.trail, '#ff9fd0']] as const) {
          ctx.strokeStyle = color; ctx.beginPath();
          path.forEach((point, i) => { const x = (point.x - start.x) * 0.45; const y = 85 - (point.y - start.y) * 0.3; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
          ctx.stroke();
        }
      },
      dispose: () => panel.remove(),
    };
  }
}
