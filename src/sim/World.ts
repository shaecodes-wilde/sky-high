import { SIM_DT, type MovementConfig } from '../config/movement';
import type { LevelData, PointDef, RingDef, SplitGateDef } from '../level/types';
import { Bloom } from './Bloom';
import { boxesOverlap, type Solid } from './collision';
import { Parade } from './Parade';
import { Player, type InputFrame, type PlayerEvent, type WindZone } from './Player';

export type GameMode = 'adventure' | 'timeTrial';

export type WorldEvent =
  | PlayerEvent
  | { type: 'ring'; index: number; x: number; y: number }
  | { type: 'seed'; index: number; x: number; y: number; chain: number }
  | { type: 'fragment'; index: number; x: number; y: number }
  | { type: 'keepsake'; index: number; x: number; y: number }
  | { type: 'checkpoint'; index: number; x: number; y: number }
  | { type: 'split'; index: number; x: number; y: number; time: number }
  | { type: 'progressionInvalid'; reason: 'skipped split gates' }
  | { type: 'death'; x: number; y: number }
  | { type: 'respawn'; x: number; y: number }
  | { type: 'paradeStart' }
  | { type: 'npc'; index: number }
  | { type: 'goal'; x: number; y: number };

export const RING_RADIUS = 9;
export const RING_REARM = 1.0;
const SEED_RADIUS = 6;
const FRAGMENT_RADIUS = 10;
const DEATH_TIME = 0.55;
const SPRING_HALF_W = 9;
export const SPRING_HEIGHT = 12;
const HAZARD_H = 10;

export interface RingState {
  def: RingDef;
  armed: boolean;
  cooldown: number;
  inside: boolean;
  /** Seconds since last activation, for presentation. */
  flash: number;
}

export interface SpringState {
  x: number;
  top: number;
  solid: Solid;
  parade: boolean;
  /** Seconds since last bounce, for presentation. */
  since: number;
}

interface Snapshot {
  checkpoint: number;
  paradeDone: boolean;
}

export type RunInvalidReason = 'death' | 'checkpoint retry' | 'skipped split gates';

export class World {
  readonly player: Player;
  readonly solids: Solid[] = [];
  readonly winds: WindZone[];
  readonly springs: SpringState[] = [];
  readonly rings: RingState[];
  readonly bloom = new Bloom();
  readonly parade: Parade;
  readonly events: WorldEvent[] = [];
  readonly seedsTaken: boolean[];
  readonly fragmentsTaken: boolean[];
  readonly keepsakesTaken: boolean[];
  readonly npcTalked: boolean[];
  readonly splitGates: readonly SplitGateDef[];
  /** Index of the latest checkpoint reached (-1 = level start). */
  checkpoint = -1;
  /** Elapsed time at each ordered progression boundary (independent of respawn). */
  splits: (number | null)[];
  /** A missed boundary cannot be repaired into a clean run by backtracking. */
  progressionValid = true;
  /** Local eligibility failures; pausing/focus loss are handled by Game. */
  runInvalidReason: RunInvalidReason | null = null;
  time = 0;
  steps = 0;
  deadTimer = 0;
  complete = false;
  completeTime = 0;
  private snapshot: Snapshot = { checkpoint: -1, paradeDone: false };
  private seedChain = 0;
  private seedChainTimer = 0;
  private lastDashEnd = 99;
  private bridgeSolids: Solid[] = [];
  private nextSplit = 0;

  constructor(
    readonly level: LevelData,
    cfg: MovementConfig,
    readonly mode: GameMode,
  ) {
    this.player = new Player(cfg);
    this.parade = new Parade(level.parade.bridgeSolidAt);
    for (const p of level.platforms) {
      const solid: Solid = {
        id: this.solids.length,
        kind: p.kind,
        x: p.x0,
        y: p.bottom,
        w: p.x1 - p.x0,
        h: p.top - p.bottom,
        oneWay: p.kind !== 'island',
        active: !p.parade,
      };
      this.solids.push(solid);
      if (p.parade) this.bridgeSolids.push(solid);
    }
    level.springs.forEach((s, i) => {
      const solid: Solid = {
        id: this.solids.length,
        kind: 'spring',
        x: s.x - SPRING_HALF_W,
        y: s.top + SPRING_HEIGHT - 4,
        w: SPRING_HALF_W * 2,
        h: 4,
        oneWay: true,
        active: !s.parade,
        spring: i,
      };
      this.solids.push(solid);
      if (s.parade) this.bridgeSolids.push(solid);
      this.springs.push({ x: s.x, top: s.top, solid, parade: !!s.parade, since: 99 });
    });
    this.winds = level.winds.map((w) => ({ ...w, accel: 620 }));
    this.rings = level.rings.map((def) => ({ def, armed: true, cooldown: 0, inside: false, flash: 99 }));
    this.seedsTaken = level.seeds.map(() => false);
    this.fragmentsTaken = level.fragments.map(() => false);
    this.keepsakesTaken = level.keepsakes.map(() => false);
    this.npcTalked = level.npcs.map(() => false);
    this.splitGates = level.splitGates ?? level.checkpoints.map((c) => ({ x: c.x }));
    this.splitGates.forEach((gate, i) => {
      if (!Number.isFinite(gate.x) || (i > 0 && gate.x <= this.splitGates[i - 1].x)) {
        throw new Error('Split gates must have strictly increasing finite x positions');
      }
      if (Number.isNaN(gate.minY) || Number.isNaN(gate.maxY) || (gate.minY ?? level.killY) > (gate.maxY ?? Infinity)) {
        throw new Error('Split gate height limits must form a valid interval');
      }
    });
    this.splits = this.splitGates.map(() => null);
    this.resetAll();
  }

  get dead(): boolean {
    return this.deadTimer > 0;
  }

  /** The full route was crossed in order; missing gates never qualify a record. */
  get progressionComplete(): boolean {
    return this.progressionValid && this.nextSplit === this.splitGates.length;
  }

  /** Fresh full-level state (new run). */
  resetAll(): void {
    this.seedsTaken.fill(false);
    this.fragmentsTaken.fill(false);
    this.keepsakesTaken.fill(false);
    this.npcTalked.fill(false);
    this.splits.fill(null);
    this.nextSplit = 0;
    this.progressionValid = true;
    this.runInvalidReason = null;
    this.checkpoint = -1;
    this.snapshot = { checkpoint: -1, paradeDone: false };
    this.time = 0;
    this.steps = 0;
    this.complete = false;
    this.completeTime = 0;
    this.deadTimer = 0;
    this.bloom.reset(this.level.start.x);
    this.restoreLocal();
    this.events.length = 0;
  }

  /** Returns to the latest checkpoint with its saved local state. */
  respawn(): void {
    this.runInvalidReason ??= 'checkpoint retry';
    this.deadTimer = 0;
    this.restoreLocal();
    const p = this.player;
    this.bloom.rebase(p.x);
    this.events.push({ type: 'respawn', x: p.x, y: p.y });
  }

  checkpointPos(i: number): PointDef {
    return i < 0 ? this.level.start : this.level.checkpoints[i];
  }

  private restoreLocal(): void {
    const pos = this.checkpointPos(this.snapshot.checkpoint);
    this.player.reset(pos.x, pos.y, 1);
    this.player.grounded = true;
    for (const r of this.rings) {
      r.armed = true;
      r.cooldown = 0;
      r.inside = false;
      r.flash = 99;
    }
    for (const s of this.springs) s.since = 99;
    this.parade.set(this.snapshot.paradeDone);
    this.syncBridge();
    this.seedChain = 0;
    this.seedChainTimer = 0;
    this.lastDashEnd = 99;
  }

  private syncBridge(): void {
    const on = this.parade.bridgeSolid;
    for (const s of this.bridgeSolids) s.active = on;
  }

  step(input: InputFrame): void {
    const dt = SIM_DT;
    this.events.length = 0;
    if (this.complete) {
      // Let the player settle on the flower without control.
      this.player.step(dt, { move: 0, jumpHeld: false, jumpPressed: false, dash: 0 }, this.solids, []);
      return;
    }
    this.steps++;
    this.time = this.steps * dt;

    this.parade.step(dt);
    this.syncBridge();
    for (const s of this.springs) s.since += dt;

    if (this.deadTimer > 0) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    const p = this.player;
    p.step(dt, input, this.solids, this.winds);
    for (const e of p.events) {
      this.events.push(e);
      if (e.type === 'spring') {
        this.springs[e.spring].since = 0;
        this.bloom.add('spring', p.x);
      } else if (e.type === 'dashEnd') this.lastDashEnd = 0;
      else if (e.type === 'land' && this.lastDashEnd < 0.35 && e.speed > p.cfg.runSpeed) this.bloom.add('dashLand', p.x);
    }
    this.lastDashEnd += dt;
    this.bloom.step(dt, p.x, p.vx, p.cfg.runSpeed);

    const left = p.x - p.w / 2;
    const bottom = p.y;

    // Dewdrop rings: one refill per contact; rearm after a delay *and* exit.
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.flash += dt;
      const inside = circleBox(r.def.x, r.def.y, RING_RADIUS, left, bottom, p.w, p.h);
      if (r.armed && inside && p.dashCharges === 0) {
        p.refillDash();
        r.armed = false;
        r.cooldown = RING_REARM;
        r.flash = 0;
        this.bloom.add('ring', p.x);
        this.events.push({ type: 'ring', index: i, x: r.def.x, y: r.def.y });
      }
      if (!r.armed) {
        r.cooldown -= dt;
        if (r.cooldown <= 0 && !inside) r.armed = true;
      }
      r.inside = inside;
    }

    // Collectibles.
    this.seedChainTimer -= dt;
    if (this.seedChainTimer <= 0) this.seedChain = 0;
    this.level.seeds.forEach((s, i) => {
      if (this.seedsTaken[i] || !circleBox(s.x, s.y, SEED_RADIUS, left, bottom, p.w, p.h)) return;
      this.seedsTaken[i] = true;
      this.seedChain++;
      this.seedChainTimer = 0.7;
      this.bloom.add('seedChain', p.x);
      this.events.push({ type: 'seed', index: i, x: s.x, y: s.y, chain: this.seedChain });
    });
    this.level.fragments.forEach((f, i) => {
      if (this.fragmentsTaken[i] || !circleBox(f.x, f.y, FRAGMENT_RADIUS, left, bottom, p.w, p.h)) return;
      this.fragmentsTaken[i] = true;
      this.bloom.add('fragment', p.x);
      this.events.push({ type: 'fragment', index: i, x: f.x, y: f.y });
    });
    this.level.keepsakes.forEach((k, i) => {
      if (this.keepsakesTaken[i] || !circleBox(k.x, k.y, FRAGMENT_RADIUS, left, bottom, p.w, p.h)) return;
      this.keepsakesTaken[i] = true;
      this.events.push({ type: 'keepsake', index: i, x: k.x, y: k.y });
    });

    // Checkpoints only move forward.
    this.level.checkpoints.forEach((c, i) => {
      if (i <= this.checkpoint) return;
      if (!boxesOverlap(left, bottom, p.w, p.h, c.x - 12, c.y, 24, 48)) return;
      this.checkpoint = i;
      this.snapshot = { checkpoint: i, paradeDone: this.parade.state !== 'dormant' };
      this.events.push({ type: 'checkpoint', index: i, x: c.x, y: c.y });
    });

    this.checkSplitGates();

    // Authored transformation trigger.
    if (this.parade.state === 'dormant' && p.x >= this.level.parade.triggerX) {
      this.parade.start();
      this.events.push({ type: 'paradeStart' });
    }

    if (this.mode === 'adventure') {
      this.level.npcs.forEach((n, i) => {
        if (this.npcTalked[i] || Math.abs(p.x - n.x) > 70 || Math.abs(p.y - n.y) > 40) return;
        this.npcTalked[i] = true;
        this.events.push({ type: 'npc', index: i });
      });
    }

    const g = this.level.goal;
    if (p.grounded && p.y >= g.top - 0.5 && p.x >= g.x0 && p.x <= g.x1) {
      this.complete = true;
      this.completeTime = this.time;
      this.events.push({ type: 'goal', x: p.x, y: p.y });
      return;
    }

    // Hazards and the fall-out plane.
    let hurt = p.y < this.level.killY;
    for (const h of this.level.hazards) {
      if (boxesOverlap(left + 1, bottom, p.w - 2, p.h - 2, h.x + 2, h.y, h.w - 4, HAZARD_H - 2)) hurt = true;
    }
    if (hurt) {
      this.runInvalidReason ??= 'death';
      this.deadTimer = DEATH_TIME;
      this.events.push({ type: 'death', x: p.x, y: Math.max(p.y, this.level.killY + 20) });
    }
  }

  private checkSplitGates(): void {
    const p = this.player;
    // Use the actual swept motion this step, rather than a marker overlap.
    // All legitimate heights can cross a default gate, including express lanes.
    while (this.nextSplit < this.splitGates.length) {
      const gate = this.splitGates[this.nextSplit];
      if (p.x < gate.x) return;
      const crossed = p.prevX < gate.x && p.x > p.prevX;
      const fraction = crossed ? (gate.x - p.prevX) / (p.x - p.prevX) : 0;
      const y = p.prevY + (p.y - p.prevY) * fraction;
      const inHeight = y + p.h >= (gate.minY ?? this.level.killY) && y <= (gate.maxY ?? Infinity);
      if (!crossed || !inHeight) {
        if (this.progressionValid) {
          this.progressionValid = false;
          this.runInvalidReason ??= 'skipped split gates';
          this.events.push({ type: 'progressionInvalid', reason: 'skipped split gates' });
        }
        return;
      }
      const index = this.nextSplit++;
      // Sub-step interpolation distinguishes two nearby gates crossed in the
      // same authoritative tick. It never changes physics or the run timer.
      const time = this.time - SIM_DT + fraction * SIM_DT;
      this.splits[index] = time;
      this.events.push({ type: 'split', index, x: gate.x, y, time });
    }
  }
}

export function circleBox(cx: number, cy: number, r: number, bx: number, by: number, bw: number, bh: number): boolean {
  const nx = Math.max(bx, Math.min(cx, bx + bw));
  const ny = Math.max(by, Math.min(cy, by + bh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export { HAZARD_H };
