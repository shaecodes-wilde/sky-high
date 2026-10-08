import type { MovementConfig } from '../config/movement';
import { groundUnder } from '../sim/collision';
import type { InputFrame } from '../sim/Player';
import { World } from '../sim/World';
import type { LevelData, RouteLink, RouteMove } from './types';

// Verifies route links by running the real controller in the real level
// geometry with simple scripted inputs (hold right, jump at a takeoff point,
// optional dashes at a few timings). A link passes if enough distinct
// takeoff points succeed — a crude but honest stand-in for "comfortably
// reachable", rather than guessing gap distances by hand.

interface Strategy {
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
}

export function runStrategy(level: LevelData, cfg: MovementConfig, link: RouteLink, s: Strategy, paradeDone: boolean): boolean {
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
      if (s.boost) {
        for (const sp of world.springs) {
          if (Math.abs(p.x + p.vx * 0.06 - sp.x) < 12 && p.y - (sp.top + 12) < 14 && p.y >= sp.top) input.jumpPressed = true;
        }
      }
    }
    if (!tookOff) input.jumpHeld = false;
    world.step(input);
    if (world.dead || world.events.some((e) => e.type === 'death')) return false;
    if (tookOff && airT > 0 && p.grounded) {
      const g = groundUnder(world.solids, p);
      if (!g) continue;
      if (g.id === link.to) return true;
      if (g.id !== link.from || airT > 0.2) return false;
    }
    if (world.complete) return link.to === level.platforms.length - 1;
  }
  return false;
}

function strategies(level: LevelData, link: RouteLink): Strategy[] {
  const from = level.platforms[link.from];
  const to = level.platforms[link.to];
  const xs = new Set<number>();
  // Last stretch of the takeoff platform, plus anywhere directly beneath the target.
  for (let x = from.x1 - 1; x >= Math.max(from.x0 + 8, from.x1 - 70); x -= 6) xs.add(x);
  for (let x = Math.max(from.x0 + 8, to.x0 + 6); x <= Math.min(from.x1 - 1, to.x1 - 6); x += 12) xs.add(x);
  if (link.move === 'spring' || link.move === 'springBoost') {
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
  for (const s of strats) {
    if (okTakeoffs.has(s.takeoffX)) continue;
    tried++;
    if (runStrategy(level, cfg, link, s, paradeDone)) {
      okTakeoffs.add(s.takeoffX);
      if (okTakeoffs.size >= needed) break;
    }
  }
  return { link, ok: okTakeoffs.size >= needed, successes: okTakeoffs.size, tried };
}

/** Distance (px) between the parade trigger and the nearest revealed surface. */
export function paradeLead(level: LevelData): number {
  const xs = [
    ...level.platforms.filter((p) => p.parade).map((p) => p.x0),
    ...level.springs.filter((s) => s.parade).map((s) => s.x - 9),
  ];
  return Math.min(...xs) - level.parade.triggerX;
}
