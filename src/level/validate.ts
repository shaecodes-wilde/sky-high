import type { MovementConfig } from '../config/movement';
import { SIM_DT } from '../config/movement';
import { groundUnder } from '../sim/collision';
import type { InputFrame } from '../sim/Player';
import { World } from '../sim/World';
import type { LevelData, RouteLink, RouteMove } from './types';
import { traverse, type TraversalInput, type TraversalOptions, type TraversalResult } from './traversal';

/**
 * Rough time for the normal route at plain run speed with simple scripted
 * jumps: ground distance between landings and takeoffs at run speed, plus
 * measured air time per link. Not an expert time — a sanity estimate.
 */
export function estimateRouteTime(level: LevelData, cfg: MovementConfig, links: RouteLink[]): number {
  let t = 0;
  let x = level.start.x;
  for (const link of links) {
    const r = validateLink(level, cfg, link, 1, level.platforms[link.from].x0 > level.parade.triggerX);
    if (!r.best) return Infinity;
    t += Math.max(0, r.best.takeoffX - x) / cfg.runSpeed + r.best.airTime;
    x = r.best.landX;
  }
  const g = level.goal;
  return t + Math.max(0, (g.x0 + g.x1) / 2 - x) / cfg.runSpeed;
}

// Verifies route links by running the real controller in the real level
// geometry with simple scripted inputs (hold right, jump at a takeoff point,
// optional dashes at a few timings). A link passes if enough distinct
// takeoff points succeed. This is sampled isolated-link reachability, never
// human comfort evidence or proof that the links form a complete route.

export interface Strategy {
  takeoffX: number;
  jump: boolean;
  boost: boolean;
  dashes: number[]; // seconds after takeoff at which to request a dash (absolute, sorted)
  /** 1 = hold right throughout; 0 = standing vertical jump (recovery climbs). */
  steer: 0 | 1;
}

const DASH_TIMES = [0.12, 0.22, 0.32, 0.42, 0.52];
const SECOND_DASH_DELAYS = [0.05, 0.15, 0.25, 0.35];

function maxDashes(move: RouteMove): number {
  switch (move) {
    case 'dash':
      return 1;
    case 'ring':
    case 'wind':
    case 'spring':
    case 'springBoost':
      return 2;
    default:
      return 0;
  }
}

export interface LinkResult {
  link: RouteLink;
  ok: boolean;
  successes: number;
  tried: number;
  /** The fastest successful outcome found (by air time). */
  best: StrategyOutcome | null;
  /** Consecutive sampled successful takeoff positions, not a single lucky press. */
  takeoffWindows: { minX: number; maxX: number; width: number; secondsAtRunSpeed: number }[];
  widestWindow: number;
  outcomes: StrategyOutcome[];
}

export interface StrategyOutcome {
  /** Seconds from takeoff to landing on the target. */
  airTime: number;
  takeoffX: number;
  landX: number;
  landVx: number;
  /** Forward landing room still available for preparing the next move. */
  landingRoom: number;
  dashes: number[];
  steer: 0 | 1;
}

export function runStrategy(level: LevelData, cfg: MovementConfig, link: RouteLink, s: Strategy, paradeDone: boolean): StrategyOutcome | null {
  const from = level.platforms[link.from];
  const world = new World(level, cfg, 'timeTrial');
  world.parade.set(paradeDone);
  world.step({ move: 0, jumpHeld: false, jumpPressed: false, dash: 0 }); // sync bridge solids
  const p = world.player;
  // Arrive at run speed a short distance before the takeoff point.
  const startX = Math.max(from.x0 + p.w / 2 + 1, s.takeoffX - 36);
  p.reset(startX, from.top, 1);
  p.grounded = true;
  p.vx = s.steer ? cfg.runSpeed : 0;
  if (!s.steer) p.x = s.takeoffX;
  let tookOff = false;
  let airT = 0;
  let dashIdx = 0;
  let boostPressed = false;
  for (let i = 0; i < 60 * 5; i++) {
    const input: InputFrame = { move: s.steer, jumpHeld: true, jumpPressed: false, dash: 0 };
    if (!tookOff) {
      if (p.x >= s.takeoffX || !p.grounded || (i > 2 && p.vx === 0)) {
        tookOff = true;
        if (s.jump && p.grounded) input.jumpPressed = true;
        if (s.jump && !p.grounded && p.coyote > 0) input.jumpPressed = true;
      }
    } else {
      airT += 1 / 60;
      if (dashIdx < s.dashes.length && airT >= s.dashes[dashIdx]) {
        input.dash = 1;
        dashIdx++;
      }
      // Buffered jump just before touching a springcap.
      if (s.boost && !boostPressed) {
        for (const sp of world.springs) {
          if (!sp.solid.active) continue;
          const contactNextStep = Math.abs(p.x + p.vx * SIM_DT - sp.x) < 14 && p.y - (sp.top + 12) < 14 && p.y >= sp.top;
          const lateContact = p.ascent === 'spring' && p.springLate > 0 && p.lastSpring === sp.solid.spring;
          if (contactNextStep || lateContact) {
            input.jumpPressed = true;
            boostPressed = true;
            break;
          }
        }
      }
    }
    if (!tookOff) input.jumpHeld = false;
    world.step(input);
    if (world.dead || world.events.some((e) => e.type === 'death')) return null;
    if (tookOff && airT > 0 && p.grounded) {
      const g = groundUnder(world.solids, p);
      if (!g) continue;
      if (g.id === link.to) return { airTime: airT, takeoffX: s.takeoffX, landX: p.x, landVx: p.vx, landingRoom: level.platforms[link.to].x1 - p.x, dashes: s.dashes, steer: s.steer };
      if (g.id !== link.from || airT > 0.2) return null;
    }
  }
  return null;
}

function strategies(level: LevelData, link: RouteLink): Strategy[] {
  const from = level.platforms[link.from];
  const to = level.platforms[link.to];
  const xs = new Set<number>();
  // Last stretch of the takeoff platform, plus anywhere directly beneath the target.
  for (let x = from.x1 - 1; x >= Math.max(from.x0 + 8, from.x1 - 70); x -= 6) xs.add(x);
  for (let x = Math.max(from.x0 + 8, to.x0 + 6); x <= Math.min(from.x1 - 1, to.x1 - 6); x += 12) xs.add(x);
  // Wind routes may share a spring fork: also sample deliberate jumps before
  // the cap, rather than only the tiny stretch after it.
  if (link.move === 'spring' || link.move === 'springBoost' || link.move === 'wind') {
    for (const sp of level.springs) {
      if (sp.top !== from.top || sp.x < from.x0 || sp.x > from.x1) continue;
      for (let x = sp.x - 60; x <= sp.x - 8; x += 6) if (x > from.x0 + 6) xs.add(x);
    }
  }
  const dashSets: number[][] = [[]];
  const n = maxDashes(link.move);
  if (n >= 1) for (const t of DASH_TIMES) dashSets.push([t]);
  if (n >= 2) for (const t of DASH_TIMES) for (const d of SECOND_DASH_DELAYS) dashSets.push([t, t + 0.14 + d]);
  const out: Strategy[] = [];
  const boost = link.move === 'springBoost';
  const walkIn = link.move === 'drop' || link.move === 'walk' || link.move === 'spring' || link.move === 'springBoost';
  for (const x of xs) {
    for (const dashes of dashSets) {
      out.push({ takeoffX: x, jump: true, boost, dashes, steer: 1 });
      if (walkIn) out.push({ takeoffX: x, jump: false, boost, dashes, steer: 1 });
    }
    if (x >= to.x0 + 4 && x <= to.x1 - 4) out.push({ takeoffX: x, jump: true, boost, dashes: [], steer: 0 });
  }
  return out;
}

export function validateLink(level: LevelData, cfg: MovementConfig, link: RouteLink, needed: number, paradeDone = false): LinkResult {
  const strats = strategies(level, link);
  const okTakeoffs = new Set<number>();
  let tried = 0;
  let best: StrategyOutcome | null = null;
  const outcomes: StrategyOutcome[] = [];
  for (const s of strats) {
    if (okTakeoffs.has(s.takeoffX)) continue;
    tried++;
    const out = runStrategy(level, cfg, link, s, paradeDone);
    if (out) {
      okTakeoffs.add(s.takeoffX);
      outcomes.push(out);
      if (!best || out.airTime < best.airTime) best = out;
    }
  }
  const takeoffWindows: LinkResult['takeoffWindows'] = [];
  for (const x of [...okTakeoffs].sort((a, b) => a - b)) {
    const last = takeoffWindows.at(-1);
    // The position grid is 6px near edges and 12px underneath a receiver.
    const missedSample = last && strats.some(s => s.takeoffX > last.maxX && s.takeoffX < x && !okTakeoffs.has(s.takeoffX));
    if (last && x - last.maxX <= 12 && !missedSample) {
      last.maxX = x;
      last.width = x - last.minX;
      last.secondsAtRunSpeed = last.width / cfg.runSpeed;
    } else takeoffWindows.push({ minX: x, maxX: x, width: 0, secondsAtRunSpeed: 0 });
  }
  const widestWindow = Math.max(0, ...takeoffWindows.map(w => w.width));
  return { link, ok: okTakeoffs.size >= needed, successes: okTakeoffs.size, tried, best, takeoffWindows, widestWindow, outcomes };
}

/** Distance (px) between the parade trigger and the nearest revealed surface. */
export function paradeLead(level: LevelData): number {
  const xs = [
    ...level.platforms.filter((p) => p.parade).map((p) => p.x0),
    ...(level.terrain ?? []).filter(t => t.parade).map(t => t.knots[0].x),
    ...level.springs.filter((s) => s.parade).map((s) => s.x - 9),
  ];
  return Math.min(...xs) - level.parade.triggerX;
}

export interface PhraseCriteria {
  finish?: 'goal' | 'target';
  minPumps?: number;
  maxPumps?: number;
  minSkims?: number;
  minRings?: number;
  requireRecovery?: boolean;
  requireProgression?: boolean;
  fragments?: number;
  requireParade?: boolean;
}

/** Explicit outcome checks over a single production World, never stitched links. */
export function assessPhrase(result: TraversalResult, cfg: MovementConfig, criteria: PhraseCriteria = {}): string[] {
  const failures: string[] = [];
  const count = (type: string) => result.events.filter(e => e.event.type === type).length;
  if (result.reason !== (criteria.finish ?? 'goal')) failures.push(`ended with ${result.reason}`);
  if (result.wallHits) failures.push(`${result.wallHits} wall impacts`);
  if (count('death') || count('respawn')) failures.push('death or respawn interrupts phrase');
  if (!Number.isFinite(result.final.x) || !Number.isFinite(result.final.y) || !Number.isFinite(result.final.vx) || !Number.isFinite(result.final.vy)) failures.push('non-finite final state');
  if (result.peakSpeed > cfg.maxHorizontalSpeed + 1e-8) failures.push('horizontal safety cap exceeded');
  if (criteria.minPumps !== undefined && count('pump') < criteria.minPumps) failures.push('too few pumps');
  if (criteria.maxPumps !== undefined && count('pump') > criteria.maxPumps) failures.push('too many pumps');
  if (criteria.minSkims !== undefined && count('skim') < criteria.minSkims) failures.push('too few cloud skims');
  if (criteria.minRings !== undefined && count('ring') < criteria.minRings) failures.push('too few ring refills');
  if (criteria.requireRecovery && !result.landings.some(l => l.recovery)) failures.push('no recovery contact');
  if (criteria.requireProgression && (!result.progressionComplete || !result.progressionValid || result.runInvalidReason !== null)) failures.push('unclean ordered progression');
  if (criteria.fragments !== undefined && result.fragments !== criteria.fragments) failures.push('fragment count mismatch');
  if (criteria.requireParade && !result.paradeTriggered) failures.push('Parade never triggered');
  return failures;
}

export function validatePhrase(level: LevelData, cfg: MovementConfig, input: TraversalInput, options: TraversalOptions = {}, criteria: PhraseCriteria = {}) {
  const result = traverse(level, cfg, input, options);
  const failures = assessPhrase(result, cfg, criteria);
  return { result, failures, ok: failures.length === 0 };
}
