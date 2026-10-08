import { describe, expect, it } from 'vitest';
import type { TerrainDef } from '../src/level/types';
import { LEVEL1 } from '../src/level/level1';
import { SKYFLOW_LEVEL } from '../src/level/skyflowLaboratory';
import { blocked, groundUnder, moveGrounded, surfaceContact, sweepAir, sweepX, sweepY, type Body, type Solid } from '../src/sim/collision';
import { sampleTerrain, terrainAboveIntervals, terrainSupport, terrainToSolid, terrainValleys } from '../src/sim/terrain';
import { box, makePlayer } from './helpers';

const body = (x: number, y: number, w = 10, h = 22): Body => ({ x, y, w, h });
const ramp = (kind: TerrainDef['kind'] = 'island'): TerrainDef => ({
  id: 2001, kind, bottom: -60, knots: [{ x: 0, y: 0, slope: 0.5 }, { x: 100, y: 50, slope: 0.5 }],
});
const bowl = (depth = 30): TerrainDef => ({
  id: 2002, kind: 'island', bottom: -100, pump: true,
  knots: [{ x: 0, y: depth, slope: -0.6 }, { x: 50, y: 0, slope: 0 }, { x: 100, y: depth, slope: 0.6 }],
});
const crest = (): TerrainDef => ({
  id: 2003, kind: 'island', bottom: -100,
  knots: [{ x: 0, y: 0, slope: 0.6 }, { x: 50, y: 30, slope: 0 }, { x: 100, y: 0, slope: -0.6 }],
});
const on = (solid: Solid, x: number, w = 10, h = 22): Body => body(x, terrainSupport(solid.terrain!, x - w / 2, x + w / 2)!.y, w, h);

describe('analytic authored terrain', () => {
  it('returns exact height and tangent/normal for a straight incline', () => {
    const p = sampleTerrain(ramp(), 40)!;
    expect(p.y).toBe(20);
    expect(p.slope).toBe(0.5);
    expect(p.curvature).toBeCloseTo(0, 12);
    expect(Math.hypot(p.tangent.x, p.tangent.y)).toBeCloseTo(1, 12);
    expect(Math.hypot(p.normal.x, p.normal.y)).toBeCloseTo(1, 12);
    expect(p.tangent.x * p.normal.x + p.tangent.y * p.normal.y).toBeCloseTo(0, 12);
    expect(sampleTerrain(ramp(), -1)).toBeNull();
    expect(sampleTerrain(ramp(), 101)).toBeNull();
  });

  it('is continuous in height and slope at authored seams', () => {
    const def = bowl();
    const before = sampleTerrain(def, 50 - 1e-5)!;
    const after = sampleTerrain(def, 50 + 1e-5)!;
    expect(before.y).toBeCloseTo(after.y, 10);
    expect(before.slope).toBeCloseTo(after.slope, 5);
    expect(before.curvature).toBeGreaterThan(0);
    expect(sampleTerrain(crest(), 50)!.curvature).toBeLessThan(0);
  });

  it('finds extrema between knots for broad bounds and foot support', () => {
    const def: TerrainDef = { id: 2200, kind: 'island', bottom: -20, knots: [{ x: 0, y: 0, slope: 2 }, { x: 100, y: 0, slope: -2 }] };
    const solid = terrainToSolid(def);
    expect(solid.y + solid.h).toBeCloseTo(50, 10);
    expect(terrainSupport(def, 40, 60)!.x).toBeCloseTo(50, 10);
    expect(terrainSupport(def, 40, 60)!.y).toBeCloseTo(50, 10);
    expect(terrainAboveIntervals(def, 49)[0][0]).toBeCloseTo(42.9289321881, 8);
    expect(terrainAboveIntervals(def, 49)[0][1]).toBeCloseTo(57.0710678119, 8);
  });

  it('rejects ambiguous/invalid authored geometry before it becomes collision', () => {
    const def = ramp();
    expect(() => terrainToSolid({ ...def, knots: [def.knots[0]] })).toThrow();
    expect(() => terrainToSolid({ ...def, knots: [def.knots[1], def.knots[0]] })).toThrow();
    expect(() => terrainToSolid({ ...def, bottom: 10 })).toThrow();
    expect(() => terrainToSolid({ ...def, knots: [{ ...def.knots[0], slope: NaN }, def.knots[1]] })).toThrow();
    expect(() => terrainToSolid({ ...def, bottom: -20, knots: [{ x: 0, y: 0, slope: -2 }, { x: 100, y: 0, slope: 2 }] })).toThrow();
  });

  it('gives a substantial bowl one stable valley identity and depth', () => {
    const def = bowl();
    const valley = terrainValleys(def)[0];
    expect(valley).toMatchObject({ x: 50, y: 0, leftX: 0, rightX: 100, depth: 30 });
    expect(terrainValleys(structuredClone(def))).toEqual([valley]);
    const solid = terrainToSolid(def);
    expect(surfaceContact([solid], on(solid, 15))!.valley!.id).toBe(valley.id);
    expect(surfaceContact([solid], on(solid, 85))!.valley!.id).toBe(valley.id);
  });

  it('rejects flat, microscopic, shallow-slope and opt-out pumps', () => {
    expect(terrainValleys({ ...bowl(), pump: false })).toEqual([]);
    expect(terrainValleys({ ...ramp(), pump: true })).toEqual([]);
    expect(terrainValleys({ ...bowl(1), knots: [{ x: 0, y: 1, slope: -0.04 }, { x: 50, y: 0, slope: 0 }, { x: 100, y: 1, slope: 0.04 }] })).toEqual([]);
    const gentle: TerrainDef = { ...bowl(), knots: [{ x: 0, y: 10, slope: -0.02 }, { x: 1000, y: 0, slope: 0 }, { x: 2000, y: 10, slope: 0.02 }] };
    expect(terrainValleys(gentle)).toEqual([]);
  });

  it('identifies distinct valleys on a shared terrain without collision-step-dependent IDs', () => {
    const def: TerrainDef = {
      id: 2010, kind: 'island', bottom: -60, pump: true,
      knots: [{ x: 0, y: 30, slope: 0 }, { x: 50, y: 0, slope: 0 }, { x: 100, y: 30, slope: 0 }, { x: 150, y: 0, slope: 0 }, { x: 200, y: 30, slope: 0 }],
    };
    const valleys = terrainValleys(def);
    expect(valleys).toHaveLength(2);
    expect(valleys.map((v) => v.x)).toEqual([50, 150]);
    expect(new Set(valleys.map((v) => v.id)).size).toBe(2);
    expect(valleys[0]).toMatchObject({ leftX: 0, rightX: 100, depth: 30 });
    expect(valleys[1]).toMatchObject({ leftX: 100, rightX: 200, depth: 30 });
  });
});

describe('curve collision and feet anchoring', () => {
  it('lands on the true incline at terminal/high fall displacement', () => {
    const solid = terrainToSolid(ramp());
    const b = body(40, 400);
    const result = sweepY([solid], b, -800, 0);
    expect(result).toMatchObject({ hit: solid, landed: true });
    expect(b.y).toBe(22.5);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
    expect(groundUnder([solid], b)).toBe(solid);
    expect(surfaceContact([solid], b)!.x).toBe(45);
  });

  it.each(['island', 'cloud'] as const)('maintains grounded incline position at speed 300 on %s terrain', (kind) => {
    const solid = terrainToSolid(ramp(kind));
    const b = on(solid, 20);
    const result = moveGrounded([solid], b, 60, 300, 1250, true);
    expect(result.separated).toBe(false);
    expect(result.hit).toBeNull();
    expect(b.x).toBe(80);
    expect(b.y).toBe(42.5);
    expect(result.contact!.slope).toBeCloseTo(0.5, 10);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
  });

  it('uses the curve footprint for safe foot-anchored form clearance', () => {
    const solid = terrainToSolid(ramp());
    const ceiling = box(25, 35, 30, 10);
    const b = on(solid, 40, 10, 10);
    expect(blocked([solid, ceiling], b.x, b.y, 10, 10)).toBe(false);
    expect(blocked([solid, ceiling], b.x, b.y, 10, 22)).toBe(true);
    expect(blocked([solid], 40, 2, 10, 22)).toBe(true);
  });

  it('does not treat empty curve broad-phase space as blocking geometry', () => {
    const solid = terrainToSolid(ramp());
    expect(blocked([solid], 10, 20, 10, 10)).toBe(false);
    const b = body(-20, 60);
    expect(sweepX([solid], b, 150, 0).hit).toBeNull();
    expect(b.x).toBe(130);
  });

  it.each([1, -1])('sweeps into the real two-way curve at high speed in direction %s', (dir) => {
    const solid = terrainToSolid(ramp());
    const b = body(dir > 0 ? -50 : 150, 10);
    expect(sweepX([solid], b, dir * 300, 0).hit).toBe(solid);
    expect(b.x).toBeCloseTo(dir > 0 ? 15.0002 : 105, 4);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
  });

  it('stops rising through the underside of a two-way curve', () => {
    const solid = terrainToSolid(ramp());
    const b = body(40, -120);
    expect(sweepY([solid], b, 300, 0).hit).toBe(solid);
    expect(b.y + b.h).toBe(-60);
  });

  it('passes up and sideways through a one-way curve, then lands from above', () => {
    const solid = terrainToSolid(ramp('cloud'));
    const b = body(40, -120);
    expect(sweepY([solid], b, 300, 0)).toMatchObject({ hit: null, landed: false });
    expect(sweepX([solid], b, 5, 0).hit).toBeNull();
    expect(sweepY([solid], b, -300, 0).landed).toBe(true);
    expect(b.y).toBe(25);
    expect(blocked([solid], b.x, -30, b.w, b.h)).toBe(false);
  });

  it('does not catch falling one-way bodies which started below the surface', () => {
    const solid = terrainToSolid(ramp('cloud'));
    const b = body(40, 5);
    expect(sweepY([solid], b, -100, 0).hit).toBeNull();
    expect(b.y).toBe(-95);
  });

  it('lands on an interior cubic crest even when all authored knot heights are lower', () => {
    const def: TerrainDef = { id: 2020, kind: 'cloud', bottom: -10, knots: [{ x: 0, y: 0, slope: 2 }, { x: 100, y: 0, slope: -2 }] };
    const solid = terrainToSolid(def);
    const b = body(50, 100, 30);
    expect(sweepY([solid], b, -150, 0).landed).toBe(true);
    expect(b.y).toBe(50);
    expect(surfaceContact([solid], b)).toMatchObject({ x: 50, y: 50, slope: 0 });
  });

  it('ignores inactive curve geometry across every collision boundary', () => {
    const solid = { ...terrainToSolid(ramp()), active: false };
    const b = body(40, 100);
    expect(sweepY([solid], b, -200, 0).hit).toBeNull();
    expect(sweepX([solid], b, 200, 0).hit).toBeNull();
    expect(blocked([solid], 40, -30, 10, 22)).toBe(false);
    expect(surfaceContact([solid], on(solid, 40))).toBeNull();
  });
});

describe('grounded connectivity and physical launches', () => {
  it.each([
    ['Laboratory Sunthread', SKYFLOW_LEVEL.terrain!.find(t => t.id === 1003)!, 2682.5115361173794, 283.93655467389164, 4.74],
    ['Level 1 curved rejoin', LEVEL1.terrain!.find(t => t.id === 1101)!, 4592.043973657692, 300, 4.2],
  ] as const)('leaves the actual %s endpoint without a false wall or lost travel', (_name, def, x, speed, dx) => {
    const solid = terrainToSolid(def);
    const b = on(solid, x, 10, 12);
    const end = def.knots.at(-1)!;
    const exitX = end.x + b.w / 2;
    const result = moveGrounded([solid], b, dx, speed, 1250, true);
    expect(result.hit).toBeNull();
    expect(result.separated).toBe(true);
    expect(result.contact!.x).toBe(end.x);
    expect(b.x).toBeCloseTo(x + dx, 8);
    expect(b.y).toBeCloseTo(end.y + (b.x - exitX) * end.slope, 8);
  });

  it.each([-1, 1] as const)('leaves a concave endpoint in direction %s at every supported route entry speed', dir => {
    const def: TerrainDef = {
      id: 2450, kind: 'cloud', bottom: -10,
      knots: dir > 0 ? [{ x: 0, y: 30, slope: -0.6 }, { x: 100, y: 0, slope: 0 }] : [{ x: 0, y: 0, slope: 0 }, { x: 100, y: 30, slope: 0.6 }],
    };
    const solid = terrainToSolid(def);
    for (const speed of [132, 180, 225, 260, 300]) {
      const x = dir > 0 ? 104.6 : -4.6;
      const b = on(solid, x, 10, 12);
      const dx = dir * speed / 60;
      const result = moveGrounded([solid], b, dx, dir * speed, 1250, true);
      expect(result.hit).toBeNull();
      expect(result.separated).toBe(true);
      expect(result.contact!.slope).toBeCloseTo(0, 10);
      expect(b.x).toBeCloseTo(x + dx, 8);
      expect(b.y).toBeCloseTo(0, 10);
    }
  });

  it('traverses flat-to-curve geometry with the actual Player dimensions getters', () => {
    const incline = terrainToSolid(ramp());
    const left = box(-100, -60, 100, 60);
    const right = box(100, -60, 100, 110);
    const solids = [left, incline, right];
    const player = makePlayer(-20, 0);
    expect(Object.hasOwn(player, 'w')).toBe(false);
    const up = moveGrounded(solids, player, 150, 225, 1250, false);
    expect(up.hit).toBeNull();
    expect(up.separated).toBe(false);
    expect(player.x).toBe(130);
    expect(player.y).toBe(50);
    const down = moveGrounded(solids, player, -150, -225, 1250, false);
    expect(down.hit).toBeNull();
    expect(down.separated).toBe(false);
    expect(player.x).toBe(-20);
    expect(player.y).toBe(0);
  });

  it('resolves a thin curved-route wall against the actual Player getter hitbox', () => {
    const incline = terrainToSolid(ramp());
    const wall = box(60, -60, 0.1, 150);
    const player = makePlayer(20, 12.5);
    const result = moveGrounded([incline, wall], player, 70, 300, 1250, true);
    expect(result.hit).toBe(wall);
    expect(result.separated).toBe(false);
    expect(player.x + player.w / 2).toBeLessThanOrEqual(60.00011);
    expect(blocked([incline, wall], player.x, player.y, player.w, player.h)).toBe(false);
  });

  it('follows a bowl in both directions without a speed-producing impulse', () => {
    const solid = terrainToSolid(bowl());
    const b = on(solid, 10);
    expect(moveGrounded([solid], b, 80, 225, 1250, true).separated).toBe(false);
    expect(b.x).toBe(90);
    expect(b.y).toBeCloseTo(26.73, 2);
    expect(moveGrounded([solid], b, -80, -225, 1250, true).separated).toBe(false);
    expect(b.x).toBe(10);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
  });

  it('joins incline and flat at matching geometric endpoints in both directions', () => {
    const incline = terrainToSolid(ramp());
    const left = box(-100, -60, 100, 60);
    const right = box(100, -60, 100, 110);
    const solids = [left, incline, right];
    const b = body(-20, 0);
    const up = moveGrounded(solids, b, 150, 225, 1250, false);
    expect(up.hit).toBeNull();
    expect(up.separated).toBe(false);
    expect(b).toMatchObject({ x: 130, y: 50 });
    const down = moveGrounded(solids, b, -150, -225, 1250, false);
    expect(down.hit).toBeNull();
    expect(down.separated).toBe(false);
    expect(b).toMatchObject({ x: -20, y: 0 });
  });

  it('stops against a thin wall and an overhead ceiling during a high-speed ground sweep', () => {
    const solid = terrainToSolid(ramp());
    const wall = box(60, -60, 0.1, 150);
    const b = on(solid, 10);
    const result = moveGrounded([solid, wall], b, 80, 300, 1250, true);
    expect(result.hit).toBe(wall);
    expect(b.x + b.w / 2).toBeLessThanOrEqual(60.00011);
    expect(blocked([solid, wall], b.x, b.y, b.w, b.h)).toBe(false);
    const ceiling = box(20, 50, 80, 0.1);
    const c = on(solid, 10);
    expect(moveGrounded([solid, ceiling], c, 80, 300, 1250, true).hit).toBe(ceiling);
    expect(c.y + c.h).toBeLessThanOrEqual(50.00011);
  });

  it('releases fast crest contact only when normal force becomes negative', () => {
    const solid = terrainToSolid(crest());
    const slow = on(solid, 35);
    const fast = { ...slow };
    expect(moveGrounded([solid], slow, 10, 80, 1250, true).separated).toBe(false);
    const takeoff = moveGrounded([solid], fast, 10, 300, 1250, true);
    expect(takeoff.separated).toBe(true);
    expect(takeoff.contact!.curvature).toBeLessThan(0);
    expect(1250 * takeoff.contact!.normal.y + 300 ** 2 * takeoff.contact!.curvature).toBeLessThan(0);
    expect(fast.y).toBeGreaterThan(slow.y);
    expect(blocked([solid], fast.x, fast.y, fast.w, fast.h)).toBe(false);
  });

  it('can suppress natural crest launches for ordinary grounded traversal', () => {
    const solid = terrainToSolid(crest());
    const b = on(solid, 35);
    expect(moveGrounded([solid], b, 20, 300, 1250, false).separated).toBe(false);
    expect(groundUnder([solid], b)).toBe(solid);
  });

  it('makes normal-force separation direction symmetric', () => {
    const solid = terrainToSolid(crest());
    const right = on(solid, 35);
    const left = on(solid, 65);
    const forward = moveGrounded([solid], right, 20, 300, 1250, true);
    const reverse = moveGrounded([solid], left, -20, -300, 1250, true);
    expect(forward.separated).toBe(true);
    expect(reverse.separated).toBe(true);
    expect(right.y).toBeCloseTo(left.y, 8);
    expect(right.x + left.x).toBeCloseTo(100, 8);
    expect(forward.contact!.slope).toBeCloseTo(-reverse.contact!.slope, 8);
  });

  it('respects the physical speed threshold rather than launching every crest', () => {
    const solid = terrainToSolid(crest());
    const initial = on(solid, 50);
    const contact = surfaceContact([solid], initial)!;
    const threshold = Math.sqrt(1250 * contact.normal.y / -contact.curvature);
    const slow = { ...initial };
    const fast = { ...initial };
    expect(moveGrounded([solid], slow, 0.1, threshold - 0.01, 1250, true).separated).toBe(false);
    expect(moveGrounded([solid], fast, 0.1, threshold + 0.01, 1250, true).separated).toBe(true);
  });

  it('preserves tiny legitimate ground movement instead of treating tolerance as a deadzone', () => {
    const flat = box(-100, -50, 200, 50);
    const b = body(0, 0);
    expect(moveGrounded([flat], b, 0.00005, 0.003, 1250, true).separated).toBe(false);
    expect(b.x).toBeCloseTo(0.00005, 12);
  });

  it('leaves real gaps and never snaps onto a lower disconnected surface', () => {
    const left = box(-30, -40, 30, 40);
    const right = box(40, -50, 100, 40);
    const b = body(-10, 0);
    const result = moveGrounded([left, right], b, 80, 225, 1250, true);
    expect(result.separated).toBe(true);
    expect(b).toMatchObject({ x: 70, y: 0 });
    expect(groundUnder([left, right], b)).toBeNull();
  });
});

describe('continuous airborne curve contact', () => {
  it.each(['island', 'cloud'] as const)('preserves an uphill dash landing as top contact on %s in both directions', (kind) => {
    for (const dir of [-1, 1] as const) {
      const def = ramp(kind);
      if (dir < 0) def.knots = [{ x: 0, y: 50, slope: -0.5 }, { x: 100, y: 0, slope: -0.5 }];
      const solid = terrainToSolid(def);
      const x = dir > 0 ? 20 : 80;
      const player = makePlayer(x, terrainSupport(def, x - 5, x + 5)!.y + 0.1);
      player.vx = dir * 225;
      player.vy = -30;
      const result = sweepAir([solid], player, player.vx / 60, player.vy / 60, 0, 0);
      expect(result.hitX).toBeNull();
      expect(result.hitY).toBe(solid);
      expect(result.landed).toBe(true);
      expect(result.contact!.solid).toBe(solid);
      expect(player.x).toBeCloseTo(x + dir * 3.75, 10);
      expect(player.y).toBeCloseTo(14.375, 10);
      expect(player.vx).toBe(dir * 225);
      expect(blocked([solid], player.x, player.y, player.w, player.h)).toBe(false);
    }
  });

  it('catches a diagonal fall crossing an entire thin curve in one step', () => {
    const solid = terrainToSolid(ramp('cloud'));
    const b = body(-30, 80);
    const result = sweepAir([solid], b, 100, -100, 0, 0);
    expect(result.hitX).toBeNull();
    expect(result.hitY).toBe(solid);
    expect(result.landed).toBe(true);
    expect(b.x).toBeCloseTo(70, 8);
    expect(b.y).toBeCloseTo(37.5, 8);
  });

  it('catches between-knot cubic peaks during a diagonal sweep', () => {
    const def: TerrainDef = { id: 2400, kind: 'island', bottom: -10, knots: [{ x: 0, y: 0, slope: 2 }, { x: 100, y: 0, slope: -2 }] };
    const solid = terrainToSolid(def);
    const b = body(-40, 80);
    const result = sweepAir([solid], b, 120, -60, 0, 0);
    expect(result.hitX).toBeNull();
    expect(result.hitY).toBe(solid);
    expect(result.landed).toBe(true);
    expect(b.x).toBeCloseTo(80, 8);
    expect(b.y).toBeCloseTo(37.5, 8);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
  });

  it('retains real two-way side contact when entering below a curve endpoint', () => {
    const solid = terrainToSolid(ramp());
    const b = body(-30, -20);
    const result = sweepAir([solid], b, 100, -10, 0, 0);
    expect(result.hitX).toBe(solid);
    expect(result.landed).toBe(false);
    expect(b.x + b.w / 2).toBeCloseTo(0, 8);
    expect(b.y).toBeCloseTo(-30, 8);
    expect(blocked([solid], b.x, b.y, b.w, b.h)).toBe(false);
  });

  it('stops against a curve underside while retaining unobstructed horizontal motion', () => {
    const solid = terrainToSolid(ramp());
    const b = body(20, -100);
    const result = sweepAir([solid], b, 30, 100, 0, 0);
    expect(result.hitX).toBeNull();
    expect(result.hitY).toBe(solid);
    expect(result.landed).toBe(false);
    expect(b.x).toBeCloseTo(50, 8);
    expect(b.y + b.h).toBeCloseTo(-60, 8);
  });

  it('passes upward through a one-way curve without landing or wall contact', () => {
    const solid = terrainToSolid(ramp('cloud'));
    const b = body(20, -30);
    expect(sweepAir([solid], b, 40, 100, 0, 0)).toMatchObject({ hitX: null, hitY: null, landed: false });
    expect(b).toMatchObject({ x: 60, y: 70 });
  });

  it('does not catch one-way horizontal or diagonal movement from below', () => {
    const solid = terrainToSolid(ramp('cloud'));
    const b = body(-30, -20);
    expect(sweepAir([solid], b, 100, -10, 0, 0)).toMatchObject({ hitX: null, hitY: null, landed: false });
    expect(b).toMatchObject({ x: 70, y: -30 });
  });

  it('honors thin walls and ceilings in the same mixed-terrain diagonal sweep', () => {
    const solid = terrainToSolid(ramp());
    const wall = box(35, -60, 0.1, 180);
    const b = body(20, 60);
    const wallResult = sweepAir([solid, wall], b, 60, -20, 0, 0);
    expect(wallResult.hitX).toBe(wall);
    expect(b.x + b.w / 2).toBeCloseTo(35, 8);
    expect(blocked([solid, wall], b.x, b.y, b.w, b.h)).toBe(false);
    const ceiling = box(10, 80, 90, 0.1);
    const c = body(20, 40);
    const ceilingResult = sweepAir([solid, ceiling], c, 40, 100, 0, 0);
    expect(ceilingResult.hitY).toBe(ceiling);
    expect(c.x).toBeCloseTo(60, 8);
    expect(c.y + c.h).toBeCloseTo(80, 8);
  });

  it.each([
    [0, 60, 100, -80], [0, 0, 100, 0], [0, 0, 30, 100], [0, 60, -100, -80],
  ])('retains exact legacy flat-axis results for (%s,%s)+(%s,%s)', (x, y, dx, dy) => {
    const solids = [box(-100, -50, 250, 50), box(40, 0, 2, 70), box(-20, 40, 18, 10)];
    const original = body(x, y);
    const combined = { ...original };
    const xr = sweepX(solids, original, dx, 4);
    const yr = sweepY(solids, original, dy, 4);
    const result = sweepAir(solids, combined, dx, dy, 4, 4);
    expect(combined).toEqual(original);
    expect(result).toMatchObject({ hitX: xr.hit, hitY: yr.hit, landed: yr.landed });
  });
});
