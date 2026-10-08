// Explicit 2D collision against axis-aligned boxes. Movement is swept one
// axis at a time, so no speed can tunnel through a surface of any thickness.
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
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
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

/** True if the body at (x, y) would overlap any blocking (two-way) solid. */
export function blocked(solids: readonly Solid[], x: number, y: number, w: number, h: number): boolean {
  const left = x - w / 2;
  const right = x + w / 2;
  for (const s of solids) {
    if (!s.active || s.oneWay) continue;
    if (overlapsX(s, left, right) && overlapsY(s, y, y + h)) return true;
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
    const rise = top(hit) - b.y;
    if (rise > 0 && rise <= ledgeNudge && !blocked(solids, b.x + dx, top(hit), b.w, b.h) && !blocked(solids, b.x, top(hit), b.w, b.h)) {
      b.y = top(hit);
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
    for (const s of solids) {
      if (!s.active || !overlapsX(s, left, right)) continue;
      const t = top(s);
      if (t > b.y + EPS) continue;
      const d = t - b.y;
      if (d > limit) {
        limit = d;
        hit = s;
      }
    }
    b.y += limit;
    if (hit) b.y = top(hit);
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
  const left = b.x - b.w / 2;
  const right = b.x + b.w / 2;
  for (const s of solids) {
    if (!s.active || !overlapsX(s, left, right)) continue;
    if (Math.abs(top(s) - b.y) <= 0.01) return s;
  }
  return null;
}

export function boxesOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
