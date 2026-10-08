import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { LEVEL1 } from '../src/level/level1';
import { level1Inputs } from '../src/level/level1Phrases';
import { SKYFLOW_LEVEL, SKYFLOW_SECTIONS } from '../src/level/skyflowLaboratory';
import { level1SkyflowInputs, skyflowInputs } from '../src/level/skyflowPolicies';
import { traverse, type TraversalResult } from '../src/level/traversal';
import { terrainValleys } from '../src/sim/terrain';
import { NO_INPUT } from '../src/sim/Player';
import { World } from '../src/sim/World';
import { traversePhysical } from '../src/level/physicalTape';
import { physicalPolicy } from './fixtures/skyflowPhysical';

function clean(r: TraversalResult): void {
  expect(r.reason, JSON.stringify(r.final)).toBe('goal');
  expect(r.wallHits).toBe(0);
  expect(r.runInvalidReason).toBeNull();
  expect(r.progressionComplete).toBe(true);
  expect(r.peakSpeed).toBeLessThanOrEqual(MOVEMENT.maxHorizontalSpeed);
}

describe('Skyflow uninterrupted production-World content', () => {
  for (const vx of [0, 132, 180, 225, 260]) {
    it(`Garden completes without advanced inputs from ${vx}px/s`, () => {
      const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('garden'), { start: { ...SKYFLOW_LEVEL.start, vx }, trailEvery: 0 });
      clean(r);
      expect(r.events.some(e => e.event.type === 'pump' || e.event.type === 'dash')).toBe(false);
    });
    for (const offset of [-6, 0, 6]) it(`Skyway carries ${vx}px/s entry through ${offset}px takeoff variation`, () => {
      const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('skyway', offset), { start: { ...SKYFLOW_LEVEL.start, vx }, trailEvery: 0 });
      clean(r);
      expect(r.events.filter(e => e.event.type === 'pump')).toHaveLength(3);
      expect(r.events.filter(e => e.event.type === 'skim').length).toBeGreaterThanOrEqual(3);
      expect(r.events.filter(e => e.event.type === 'ring')).toHaveLength(1);
      expect(r.events.some(e => e.event.type === 'land' && e.event.x > 3480 && e.event.y > 150)).toBe(true);
    });
    it(`Missed E skim recovers onto the lower curve from ${vx}px/s`, () => {
      const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('missed'), { start: { ...SKYFLOW_LEVEL.start, vx }, trailEvery: 0 });
      clean(r);
      expect(r.events.some(e => e.event.type === 'land' && e.event.x > 3140 && e.event.x < 3400 && e.event.y < 80)).toBe(true);
    });
  }
  for (const mask of [[false, false, false], [true, false, true], [true, true, true]]) it(`Flow preserves progress with pump mask ${mask.join('/')}`, () => {
    const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('flow', 0, 0, mask), { trailEvery: 0 });
    clean(r);
    expect(r.events.filter(e => e.event.type === 'pump')).toHaveLength(mask.filter(Boolean).length);
    expect(r.events.filter(e => e.event.type === 'launch').length).toBeGreaterThan(0);
    expect(r.events.some(e => e.event.type === 'launch' && e.event.x < 2500)).toBe(false);
  });
  it('Skyway is faster than both lower routes from matching initial rest', () => {
    const results = ['garden', 'flow', 'skyway'].map(route => traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs(route as 'garden' | 'flow' | 'skyway'), { trailEvery: 0 }));
    results.forEach(clean);
    expect(results[2].final.time).toBeLessThan(results[1].final.time - 0.3);
    expect(results[2].final.time).toBeLessThan(results[0].final.time - 10);
  });
  it('three laboratory valleys have independent traversal identities and supported inter-bowl crests', () => {
    const bowls = SKYFLOW_LEVEL.terrain![0];
    expect(terrainValleys(bowls)).toHaveLength(3);
    const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('flow'), { stop: w => w.player.x > 1940 });
    expect(r.reason).toBe('target');
    expect(new Set(r.events.filter(e => e.event.type === 'pump').map(e => e.event.type === 'pump' && e.event.valley)).size).toBe(3);
    expect(r.trail.every(s => s.grounded)).toBe(true);
  });
  it('the additive Level 1 hybrid reaches its rolling rejoin and all story fragments cleanly', () => {
    const r = traverse(LEVEL1, MOVEMENT, level1SkyflowInputs(), { trailEvery: 0 });
    clean(r);
    expect(r.events.filter(e => e.event.type === 'fragment')).toHaveLength(3);
    expect(r.events.some(e => e.event.type === 'skim' && e.event.x > 4290)).toBe(true);
    expect(r.events.some(e => e.event.type === 'ring' && e.event.x === 4400)).toBe(true);
    expect(r.events.some(e => e.event.type === 'land' && e.event.x > 4440 && e.event.x < 4590 && e.event.y > 172)).toBe(true);
    expect(r.events.some(e => e.event.type === 'paradeStart')).toBe(true);
    expect(r.final.time).toBeLessThan(traverse(LEVEL1, MOVEMENT, level1Inputs('express'), { trailEvery: 0 }).final.time - 3);
  });
  it('all seven section spawns and curved checkpoints remain supported while idle', () => {
    for (const start of [...SKYFLOW_SECTIONS, ...SKYFLOW_LEVEL.checkpoints]) {
      const world = new World({ ...SKYFLOW_LEVEL, start, splitGates: [] }, MOVEMENT, 'adventure');
      for (let i = 0; i < 60; i++) world.step(NO_INPUT);
      expect(world.player.grounded).toBe(true);
      expect(world.player.x).toBe(start.x);
      expect(world.player.y).toBeCloseTo(start.y, 8);
      expect(world.dead).toBe(false);
    }
  });
  for (const route of ['garden', 'flow', 'skyway', 'missed'] as const) it(`actual keyboard ${route} plays and replays at 30/60/144 fps`, () => {
    const { result, tape } = physicalPolicy(SKYFLOW_LEVEL, skyflowInputs(route));
    clean(result);
    const direct = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs(route));
    expect(result.final).toEqual(direct.final);
    expect(result.events).toEqual(direct.events);
    for (const fps of [30, 60, 144]) expect(traversePhysical(SKYFLOW_LEVEL, MOVEMENT, tape, fps, { maxSteps: 5400 })).toEqual(result);
  });
  it('actual keyboard plays the complete Level 1 hybrid without state edits', () => {
    const { result, tape } = physicalPolicy(LEVEL1, level1SkyflowInputs());
    clean(result);
    expect(result.fragments).toBe(3);
    expect(result.final).toEqual(traverse(LEVEL1, MOVEMENT, level1SkyflowInputs()).final);
    expect(traversePhysical(LEVEL1, MOVEMENT, tape, 30, { maxSteps: 5400 })).toEqual(result);
  });
});
