import type { TerrainDef } from '../level/types';
import { sampleTerrain, terrainAboveIntervals, terrainSupport, terrainValleys, type TerrainSample, type TerrainValley } from './terrain';

// Explicit 2D collision against boxes and analytic cubic heightfields.
// Conventions: y-up; a Box is { x, y } = bottom-left; a Body is
// { x = horizontal centre, y = feet }.

export type SolidKind = 'island' | 'cloud' | 'petal' | 'spring' | 'flower';

export interface Solid {
  id: number;
  kind: SolidKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** One-way surfaces only stop bodies falling onto them from above. */
  oneWay: boolean;
  active: boolean;
  /** Index into the world's spring list when kind === 'spring'. */
  spring?: number;
  /** The box is broad-phase bounds only; collision uses this true curve. */
  terrain?: TerrainDef;
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bodies may expose dimensions through prototype getters (not own fields). */
function bodyAt(b: Body, x: number, y = b.y): Body {
  return { x, y, w: b.w, h: b.h };
}

const EPS = 1e-4;

export function top(s: Solid): number {
  return s.y + s.h;
}

function overlapsX(s: Solid, left: number, right: number): boolean {
  return s.x < right - EPS && s.x + s.w > left + EPS;
}

function overlapsY(s: Solid, bottom: number, topY: number): boolean {
  return s.y < topY - EPS && s.y + s.h > bottom + EPS;
}

export interface SurfaceContact extends TerrainSample {
  solid: Solid;
  /** Geometric bottom is independent of the AABB's support point. */
  valley?: TerrainValley;
}

/** Actual highest supporting point under the body's foot span. */
function support(s: Solid, b: Body): SurfaceContact | null {
  if (!s.active || !overlapsX(s, b.x - b.w / 2, b.x + b.w / 2)) return null;
  if (!s.terrain) return { solid: s, x: b.x, y: top(s), slope: 0, curvature: 0, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 } };
  const point = terrainSupport(s.terrain, b.x - b.w / 2, b.x + b.w / 2);
  if (!point) return null;
  const valley = terrainValleys(s.terrain).filter((v) => b.x >= v.leftX && b.x <= v.rightX).sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x))[0];
  return { ...point, solid: s, ...(valley ? { valley } : {}) };
}

/** Curve and flat surfaces expose identical geometry to the controller. */
export function surfaceContact(solids: readonly Solid[], b: Body): SurfaceContact | null {
  for (const s of solids) {
    const point = support(s, b);
    if (point && Math.abs(point.y - b.y) <= 0.01) return point;
  }
  return null;
}

/** True if the body at (x, y) would overlap any blocking (two-way) solid. */
export function blocked(solids: readonly Solid[], x: number, y: number, w: number, h: number): boolean {
  const left = x - w / 2;
  const right = x + w / 2;
  for (const s of solids) {
    if (!s.active || s.oneWay) continue;
    if (!overlapsX(s, left, right) || !overlapsY(s, y, y + h)) continue;
    if (!s.terrain || (terrainSupport(s.terrain, left, right)?.y ?? -Infinity) > y + EPS) return true;
  }
  return false;
}

export interface MoveResult {
  hit: Solid | null;
}

/** Sweeps the body horizontally. Only two-way solids block sideways motion. */
export function sweepX(solids: readonly Solid[], b: Body, dx: number, ledgeNudge: number): MoveResult {
  if (dx === 0) return { hit: null };
  const left = b.x - b.w / 2;
  const right = b.x + b.w / 2;
  let limit = dx;
  let hit: Solid | null = null;
  for (const s of solids) {
    if (!s.active || s.oneWay || !overlapsY(s, b.y, b.y + b.h)) continue;
    if (s.terrain) {
      for (const [x0, x1] of terrainAboveIntervals(s.terrain, b.y + EPS)) {
        if (dx > 0 && x0 >= right - EPS && x0 - right < limit) {
          limit = Math.max(0, x0 - right);
          hit = s;
        } else if (dx < 0 && x1 <= left + EPS && x1 - left > limit) {
          limit = Math.min(0, x1 - left);
          hit = s;
        }
      }
      continue;
    }
    if (dx > 0 && s.x >= right - EPS) {
      const d = s.x - right;
      if (d < limit) {
        limit = Math.max(0, d);
        hit = s;
      }
    } else if (dx < 0 && s.x + s.w <= left + EPS) {
      const d = s.x + s.w - left;
      if (d > limit) {
        limit = Math.min(0, d);
        hit = s;
      }
    }
  }
  if (hit && ledgeNudge > 0) {
    // Clipping the very top of a ledge: step up onto it if that space is free.
    const height = support(hit, bodyAt(b, b.x + dx))?.y ?? top(hit);
    const rise = height - b.y;
    if (rise > 0 && rise <= ledgeNudge && !blocked(solids, b.x + dx, height, b.w, b.h) && !blocked(solids, b.x, height, b.w, b.h)) {
      b.y = height;
      return sweepX(solids, b, dx, 0);
    }
  }
  b.x += limit;
  return { hit };
}

export interface MoveYResult extends MoveResult {
  landed: boolean;
}

/**
 * Sweeps the body vertically. Falling bodies land on any surface whose top
 * they were at or above at the start of the move; rising bodies are stopped
 * only by two-way ceilings (with a small corner nudge).
 */
export function sweepY(solids: readonly Solid[], b: Body, dy: number, cornerNudge: number): MoveYResult {
  if (dy === 0) return { hit: null, landed: false };
  const left = b.x - b.w / 2;
  const right = b.x + b.w / 2;
  let limit = dy;
  let hit: Solid | null = null;
  if (dy < 0) {
    let landingY = b.y;
    for (const s of solids) {
      if (!s.active || !overlapsX(s, left, right)) continue;
      const t = support(s, b)?.y ?? top(s);
      if (t > b.y + EPS) continue;
      const d = t - b.y;
      if (d > limit || (s.terrain && d >= limit - EPS)) {
        limit = d;
        hit = s;
        landingY = t;
      }
    }
    b.y += limit;
    if (hit) b.y = landingY;
    return { hit, landed: hit !== null };
  }
  const headTop = b.y + b.h;
  for (const s of solids) {
    if (!s.active || s.oneWay || !overlapsX(s, left, right)) continue;
    if (s.y < headTop - EPS) continue;
    const d = s.y - headTop;
    if (d < limit) {
      limit = Math.max(0, d);
      hit = s;
    }
  }
  if (hit && cornerNudge > 0) {
    // Head clipping a corner: slide around it if the adjacent space is free.
    const pushRight = hit.x + hit.w - left;
    const pushLeft = hit.x - right;
    const shift = pushRight <= cornerNudge ? pushRight : -pushLeft <= cornerNudge ? pushLeft : 0;
    if (shift !== 0 && !blocked(solids, b.x + shift, b.y, b.w, b.h)) {
      b.x += shift;
      return sweepY(solids, b, dy, 0);
    }
  }
  b.y += limit;
  return { hit, landed: false };
}

/** The surface the body is standing on, if any (feet exactly on its top). */
export function groundUnder(solids: readonly Solid[], b: Body): Solid | null {
  return surfaceContact(solids, b)?.solid ?? null;
}

export interface GroundMoveResult extends MoveResult {
  /** On separation, this is the last physical support (the takeoff tangent). */
  contact: SurfaceContact | null;
  separated: boolean;
}

/** Surfaces join only where their real end heights meet; gaps/steps are not snapped. */
function surfacesJoin(a: Solid, b: Solid): boolean {
  const boundary = Math.abs(a.x + a.w - b.x) <= EPS ? b.x : Math.abs(b.x + b.w - a.x) <= EPS ? a.x : null;
  if (boundary === null) return false;
  const ay = a.terrain ? sampleTerrain(a.terrain, boundary)?.y : top(a);
  const by = b.terrain ? sampleTerrain(b.terrain, boundary)?.y : top(b);
  return ay !== undefined && by !== undefined && Math.abs(ay - by) <= 0.01;
}

function continuedSupport(solids: readonly Solid[], b: Body, previous: SurfaceContact): SurfaceContact | null {
  let next = support(previous.solid, b);
  for (const s of solids) {
    if (s === previous.solid || !s.active) continue;
    const point = support(s, b);
    if (!point || (next && point.y < next.y)) continue;
    if (surfacesJoin(previous.solid, s) || Math.abs(point.y - previous.y) <= 0.01) next = point;
  }
  return next;
}

function losesNormalForce(contact: SurfaceContact, speed: number, gravity: number): boolean {
  return gravity * contact.normal.y + speed * speed * contact.curvature < -EPS;
}

/** Swept tangent continuation after a crest/edge, without creating velocity. */
function leaveSurface(solids: readonly Solid[], b: Body, dx: number, contact: SurfaceContact): GroundMoveResult {
  let hit: Solid | null = null;
  const count = Math.max(1, Math.ceil(Math.abs(dx) / Math.max(0.1, Math.min(0.5, b.w / 4))));
  const stepX = dx / count;
  const stepY = stepX * contact.slope;
  for (let i = 0; i < count; i++) {
    if (stepY > 0) {
      const yr = sweepY(solids, b, stepY, 0);
      if (yr.hit) { hit = yr.hit; break; }
    }
    const xr = sweepX(solids, b, stepX, 0);
    if (xr.hit) { hit = xr.hit; break; }
    if (stepY <= 0) {
      const yr = sweepY(solids, b, stepY, 0);
      if (yr.hit) { hit = yr.hit; break; }
    }
  }
  return { hit, contact, separated: true };
}

/**
 * Follows real supporting geometry and limits against walls/ceilings. This
 * changes position only; the controller owns tangent gravity and momentum.
 * Curve support is the exact highest point under an AABB, not its broad box.
 */
export function moveGrounded(solids: readonly Solid[], b: Body, dx: number, speed: number, gravity: number, allowLaunch: boolean): GroundMoveResult {
  let contact = surfaceContact(solids, b);
  if (!contact) {
    const result = sweepX(solids, b, dx, 0);
    return { ...result, contact: null, separated: true };
  }
  if (dx === 0) return { hit: null, contact, separated: false };
  let remaining = dx;
  const maxStep = Math.max(0.05, Math.min(0.5, b.w / 4, b.h / 4));
  while (Math.abs(remaining) > 1e-12) {
    if (allowLaunch && losesNormalForce(contact, speed, gravity)) return leaveSurface(solids, b, remaining, contact);
    let step = Math.sign(remaining) * Math.min(Math.abs(remaining), maxStep);
    let next = continuedSupport(solids, bodyAt(b, b.x + step), contact);
    // Keep vertical sampling equally fine on steep authored terrain.
    for (let n = 0; next && Math.abs(next.y - b.y) > maxStep && n < 16; n++) {
      step *= 0.5;
      next = continuedSupport(solids, bodyAt(b, b.x + step), contact);
    }
    if (!next) return leaveSurface(solids, b, remaining, contact);
    if (blocked(solids, b.x + step, next.y, b.w, b.h)) {
      // Locate the actual contact boundary rather than resetting/snapping.
      let low = 0;
      let high = 1;
      for (let n = 0; n < 32; n++) {
        const fraction = (low + high) / 2;
        const probe = continuedSupport(solids, bodyAt(b, b.x + step * fraction), contact);
        if (probe && !blocked(solids, b.x + step * fraction, probe.y, b.w, b.h)) low = fraction;
        else high = fraction;
      }
      const boundary = continuedSupport(solids, bodyAt(b, b.x + step * low), contact)!;
      const obstacle = solids.find((s) => blocked([s], b.x + step, next!.y, b.w, b.h)) ?? null;
      b.x += step * low;
      b.y = boundary.y;
      return { hit: obstacle, contact: boundary, separated: false };
    }
    b.x += step;
    b.y = next.y;
    remaining -= step;
    contact = next;
  }
  return { hit: null, contact, separated: false };
}

export function boxesOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
