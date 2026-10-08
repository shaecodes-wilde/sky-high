import type { TerrainDef, TerrainKnot } from '../level/types';
import type { Solid } from './collision';

export interface TerrainSample {
  x: number;
  y: number;
  slope: number;
  /** Signed inverse radius: positive in a valley, negative on a crest. */
  curvature: number;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
}

export interface TerrainValley {
  id: string;
  x: number;
  y: number;
  leftX: number;
  rightX: number;
  depth: number;
}

const ROOT_EPS = 1e-10;
const MIN_VALLEY_DEPTH = 6;
const MIN_FLANK_SLOPE = 0.08;

// Level geometry is immutable after authoring; activation lives on Solid.
// Cache geometry only by definition identity, never by moving-body state.
const criticalCache = new WeakMap<TerrainDef, number[]>();
const coefficientCache = new WeakMap<TerrainDef, [number, number, number, number][]>();
const valleyCache = new WeakMap<TerrainDef, TerrainValley[]>();

function segmentCoefficients(def: TerrainDef): [number, number, number, number][] {
  let result = coefficientCache.get(def);
  if (!result) {
    result = def.knots.slice(0, -1).map((left, i) => coefficients(left, def.knots[i + 1]));
    coefficientCache.set(def, result);
  }
  return result;
}

/** Coefficients of y(t), where t = (x-left.x)/(right.x-left.x). */
function coefficients(left: TerrainKnot, right: TerrainKnot): [number, number, number, number] {
  const span = right.x - left.x;
  return [
    2 * left.y - 2 * right.y + span * (left.slope + right.slope),
    -3 * left.y + 3 * right.y - span * (2 * left.slope + right.slope),
    span * left.slope,
    left.y,
  ];
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < ROOT_EPS) return Math.abs(b) < ROOT_EPS ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -ROOT_EPS) return [];
  if (Math.abs(discriminant) < ROOT_EPS) return [-b / (2 * a)];
  // Avoid cancellation when the two roots have very different magnitudes.
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(discriminant));
  return [q / a, c / q].sort((x, y) => x - y);
}

/** Exact derivative roots and knot boundaries within a clipped domain. */
export function terrainCriticalXs(def: TerrainDef, x0: number, x1: number): number[] {
  const cached = criticalCache.get(def);
  if (cached) return cached.filter((x) => x >= x0 && x <= x1);
  const points: number[] = [];
  for (let i = 0; i < def.knots.length - 1; i++) {
    const left = def.knots[i];
    const right = def.knots[i + 1];
    points.push(left.x, right.x);
    const [a, b, c] = segmentCoefficients(def)[i];
    for (const t of quadraticRoots(3 * a, 2 * b, c)) {
      const x = left.x + t * (right.x - left.x);
      if (t > 0 && t < 1) points.push(x);
    }
  }
  const result = [...new Set(points)].sort((a, b) => a - b);
  criticalCache.set(def, result);
  return result.filter((x) => x >= x0 && x <= x1);
}

/** Analytic Hermite height, first derivative, and signed curvature. */
export function sampleTerrain(def: TerrainDef, x: number): TerrainSample | null {
  const knots = def.knots;
  if (knots.length < 2 || !Number.isFinite(x) || x < knots[0].x || x > knots[knots.length - 1].x) return null;
  let low = 0;
  let high = knots.length - 2;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (x >= knots[middle + 1].x) low = middle + 1;
    else high = middle;
  }
  const left = knots[low];
  const right = knots[low + 1];
  const span = right.x - left.x;
  const t = (x - left.x) / span;
  const [a, b, c, d] = segmentCoefficients(def)[low];
  const y = ((a * t + b) * t + c) * t + d;
  const slope = ((3 * a * t + 2 * b) * t + c) / span;
  const second = (6 * a * t + 2 * b) / (span * span);
  const length = Math.hypot(1, slope);
  return {
    x, y, slope, curvature: second / (length * length * length),
    tangent: { x: 1 / length, y: slope / length },
    normal: { x: -slope / length, y: 1 / length },
  };
}

/** Highest true curve point beneath an AABB foot span, including cubic extrema. */
export function terrainSupport(def: TerrainDef, left: number, right: number): TerrainSample | null {
  const x0 = Math.max(left, def.knots[0].x);
  const x1 = Math.min(right, def.knots[def.knots.length - 1].x);
  if (x1 <= x0) return null;
  let best = sampleTerrain(def, x0)!;
  for (const x of [x1, ...terrainCriticalXs(def, x0, x1)]) {
    const point = sampleTerrain(def, x)!;
    if (point.y > best.y) best = point;
  }
  return best;
}

/** Exact horizontal regions where the curve is above a given feet height. */
export function terrainAboveIntervals(def: TerrainDef, height: number): [number, number][] {
  const first = def.knots[0].x;
  const last = def.knots[def.knots.length - 1].x;
  const points = [first, ...terrainCriticalXs(def, first, last), last];
  const cuts = [...new Set(points)].sort((a, b) => a - b);
  const result: [number, number][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let a = cuts[i];
    let b = cuts[i + 1];
    const aboveA = sampleTerrain(def, a)!.y > height;
    const aboveB = sampleTerrain(def, b)!.y > height;
    if (!aboveA && !aboveB) continue;
    if (aboveA !== aboveB) {
      let low = a;
      let high = b;
      for (let n = 0; n < 48; n++) {
        const middle = (low + high) / 2;
        if ((sampleTerrain(def, middle)!.y > height) === aboveA) low = middle;
        else high = middle;
      }
      const root = (low + high) / 2;
      if (aboveA) b = root;
      else a = root;
    }
    if (b > a) {
      const previous = result.at(-1);
      if (previous && Math.abs(previous[1] - a) < ROOT_EPS) previous[1] = b;
      else result.push([a, b]);
    }
  }
  return result;
}

/** Stable geometric valleys; tiny ripple/flat geometry never becomes pumpable. */
export function terrainValleys(def: TerrainDef): TerrainValley[] {
  if (!def.pump) return [];
  const cached = valleyCache.get(def);
  if (cached) return cached;
  const first = def.knots[0].x;
  const last = def.knots[def.knots.length - 1].x;
  const critical = [...new Set([first, ...terrainCriticalXs(def, first, last), last])].sort((a, b) => a - b);
  const minima: number[] = [];
  const maxima: number[] = [first];
  for (let i = 1; i < critical.length - 1; i++) {
    const x = critical[i];
    const before = sampleTerrain(def, (critical[i - 1] + x) / 2)!.slope;
    const after = sampleTerrain(def, (x + critical[i + 1]) / 2)!.slope;
    if (before < -ROOT_EPS && after > ROOT_EPS) minima.push(x);
    if (before > ROOT_EPS && after < -ROOT_EPS) maxima.push(x);
  }
  maxima.push(last);
  const result: TerrainValley[] = [];
  for (const x of minima) {
    const leftX = maxima.filter((p) => p < x).at(-1)!;
    const rightX = maxima.find((p) => p > x)!;
    const y = sampleTerrain(def, x)!.y;
    const depth = Math.min(sampleTerrain(def, leftX)!.y, sampleTerrain(def, rightX)!.y) - y;
    if (depth < MIN_VALLEY_DEPTH) continue;
    // A meaningful flank must have real slope somewhere, rather than relying
    // on curvature sign at a single collision micro-step.
    let downhill = 0;
    let uphill = 0;
    for (let n = 0; n <= 32; n++) {
      downhill = Math.min(downhill, sampleTerrain(def, leftX + (x - leftX) * n / 32)!.slope);
      uphill = Math.max(uphill, sampleTerrain(def, x + (rightX - x) * n / 32)!.slope);
    }
    if (downhill > -MIN_FLANK_SLOPE || uphill < MIN_FLANK_SLOPE) continue;
    result.push({ id: `${def.id}:valley:${x.toFixed(6)}`, x, y, leftX, rightX, depth });
  }
  valleyCache.set(def, result);
  return result;
}

/** Validates authored geometry and includes interior extrema in broad-phase bounds. */
export function terrainToSolid(def: TerrainDef, id = def.id): Solid {
  if (def.knots.length < 2 || !Number.isFinite(def.bottom) || !Number.isFinite(id)) throw new Error('Terrain requires finite bounds and at least two knots');
  for (let i = 0; i < def.knots.length; i++) {
    const knot = def.knots[i];
    if (![knot.x, knot.y, knot.slope].every(Number.isFinite) || (i > 0 && knot.x <= def.knots[i - 1].x)) throw new Error('Terrain knots require finite values and strictly increasing x');
  }
  const first = def.knots[0].x;
  const last = def.knots[def.knots.length - 1].x;
  const samples = [first, last, ...terrainCriticalXs(def, first, last)].map((x) => sampleTerrain(def, x)!);
  const minimum = Math.min(...samples.map((p) => p.y));
  const maximum = Math.max(...samples.map((p) => p.y));
  if (def.bottom >= minimum) throw new Error('Terrain bottom must lie below its entire surface');
  return { id, kind: def.kind, x: first, y: def.bottom, w: last - first, h: maximum - def.bottom, oneWay: def.kind === 'cloud', active: !def.parade, terrain: def };
}
