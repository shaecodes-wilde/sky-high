import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { LEVEL1 } from '../src/level/level1';
import { traversePhysical, type PhysicalInput } from '../src/level/physicalTape';
import { replayInputs, traverse } from '../src/level/traversal';
import type { LevelData, TerrainDef } from '../src/level/types';
import { assessPhrase } from '../src/level/validate';
import { terrainSupport } from '../src/sim/terrain';
import { World } from '../src/sim/World';

const valley: TerrainDef = {
  id: 901, kind: 'island', bottom: -100, pump: true,
  knots: [{ x: -120, y: 60, slope: -1 }, { x: 0, y: 0, slope: 0 }, { x: 120, y: 60, slope: 1 }],
};
const fixture: LevelData = {
  ...LEVEL1, id: 'validation-physical-valley', start: { x: -75, y: terrainSupport(valley, -80, -70)!.y },
  platforms: [{ id: 0, kind: 'cloud', x0: 120, x1: 600, top: 60, bottom: 52 }],
  terrain: [valley], springs: [], winds: [], rings: [], hazards: [], seeds: [], fragments: [], keepsakes: [],
  checkpoints: [], splitGates: [], npcs: [], route: [], express: [], killY: -200,
  parade: { ...LEVEL1.parade, triggerX: 9999 }, goal: { x0: 400, x1: 590, top: 60 },
};
const held: PhysicalInput[] = [
  { time: 0, code: 'KeyS', action: 'roll', down: true },
  { time: 0, code: 'KeyD', action: 'right', down: true },
];

function pulseTape(vx: number, spam = false) {
  const base = traversePhysical(fixture, MOVEMENT, held, 60, { start: { ...fixture.start, vx }, maxSteps: 180 });
  const after = base.trail.findIndex(s => s.x >= 0);
  const a = base.trail[after - 1];
  const b = base.trail[after];
  const crossing = a.time + -a.x / (b.x - a.x) * SIM_DT;
  // Both release and press occur inside one fixed interval, 4ms apart.
  const press = Math.floor(crossing / SIM_DT) * SIM_DT + 0.010;
  const tape = [...held, { time: press - 0.004, code: 'KeyD', action: 'right' as const, down: false },
    { time: press, code: 'KeyD', action: 'right' as const, down: true }];
  if (spam) for (let time = press + 0.025; time < press + 0.3; time += 0.03) {
    tape.push({ time, code: 'KeyD', action: 'right', down: false }, { time: time + 0.004, code: 'KeyD', action: 'right', down: true });
  }
  return tape;
}

describe('production World recordings and physically timestamped catch-up', () => {
  for (const vx of [132, 180, 225, 260]) it(`replays a complete physical valley at ${vx}px/s, including frame-batched 4ms pulses`, () => {
    const options = { start: { ...fixture.start, vx }, maxSteps: 180 };
    const tape = pulseTape(vx);
    const a = traversePhysical(fixture, MOVEMENT, tape, 60, options);
    expect(a.reason).toBe('goal');
    expect(a.events.filter(e => e.event.type === 'pump').map(e => e.event.type === 'pump' && e.event.quality)).toEqual(['perfect']);
    expect(a.events.some(e => e.event.type === 'dash')).toBe(false);
    expect(a.recording.some(e => e.directionEvents?.length === 2)).toBe(true);
    expect(a.rollTime).toBe(a.final.time);
    expect(a.trail.some(s => s.valley && s.curvature !== null && s.tangentSpeed !== null)).toBe(true);
    for (const fps of [30, 144]) expect(traversePhysical(fixture, MOVEMENT, tape, fps, options)).toEqual(a);
    expect(traverse(fixture, MOVEMENT, a.recording, options)).toEqual(a);
  });

  it('cannot farm multiple production-World rewards with timestamped same-valley spam', () => {
    const a = traversePhysical(fixture, MOVEMENT, pulseTape(180, true), 30, { start: { ...fixture.start, vx: 180 }, maxSteps: 180 });
    expect(a.reason).toBe('goal');
    expect(a.events.filter(e => e.event.type === 'pump')).toHaveLength(1);
    expect(a.peakSpeed).toBeLessThanOrEqual(300);
  });

  it('records a curved rolling landing using the real curve, not the broad-phase box top', () => {
    const curve: TerrainDef = { id: 990, kind: 'cloud', bottom: -100, recovery: true,
      knots: [{ x: -100, y: 50, slope: -0.2 }, { x: 250, y: -20, slope: -0.2 }] };
    const level = { ...fixture, platforms: [], terrain: [curve] };
    const options = { start: { x: 0, y: 65, vx: 225, vy: -100, grounded: false, dashCharges: 0 }, maxSteps: 60, stop: (w: World) => w.player.grounded };
    const a = traverse(level, MOVEMENT, () => ({ move: 1, jumpHeld: false, jumpPressed: false, dash: 0, rollHeld: true }), options);
    expect(a.reason).toBe('target');
    expect(a.landings).toHaveLength(1);
    const landing = a.landings[0];
    expect(landing.surface).toBe(0);
    expect(landing.terrain).toBe(990);
    expect(landing.y).toBeCloseTo(terrainSupport(curve, landing.x - 5, landing.x + 5)!.y, 8);
    expect(landing.y).toBeLessThan(50);
    expect(landing.recovery).toBe(true);
    expect(landing.rolling).toBe(true);
    expect(landing.dashCharges).toBe(1);
    expect(landing.vx).toBeCloseTo(225 - MOVEMENT.airOverspeedDecay * landing.time, 8);
    expect(traverse(level, MOVEMENT, a.recording, options)).toEqual(a);
  });

  it('holds optional curl but consumes directional edges exactly once in authored order', () => {
    const edges = [{ dir: 1 as const, down: false, age: 0.010 }, { dir: 1 as const, down: true, age: 0.006 }];
    const input = replayInputs([{ step: 0, move: 1, rollHeld: true }, { step: 2, directionEvents: edges }, { step: 3, rollHeld: false }]);
    const world = new World(fixture, MOVEMENT, 'timeTrial');
    expect(input(world, 0).rollHeld).toBe(true);
    expect(input(world, 1).directionEvents).toBeUndefined();
    const frame = input(world, 2);
    expect(frame.directionEvents).toEqual(edges);
    frame.directionEvents![0].age = 0;
    expect(edges[0].age).toBe(0.010);
    expect(input(world, 3).directionEvents).toBeUndefined();
    expect(input(world, 4).rollHeld).toBe(false);
  });

  it('ending optional roll intent by omission remains an uncurl in exact replay', () => {
    const a = traverse(fixture, MOVEMENT, (_w, step) => ({ move: 1, jumpHeld: false, jumpPressed: false, dash: 0, ...(step < 5 ? { rollHeld: true } : {}) }), { maxSteps: 20 });
    expect(a.final.rolling).toBe(false);
    expect(traverse(fixture, MOVEMENT, a.recording, { maxSteps: 20 })).toEqual(a);
  });

  it('reports outcome failures explicitly, rather than treating a timeout as reachable', () => {
    const result = traverse(fixture, MOVEMENT, [], { maxSteps: 1 });
    expect(assessPhrase(result, MOVEMENT, { minPumps: 1, requireRecovery: true })).toEqual(['ended with timeout', 'too few pumps', 'no recovery contact']);
  });

  it('rejects corrupt physical ages and out-of-order physical timestamps', () => {
    expect(() => replayInputs([{ step: 0, directionEvents: [{ dir: 1, down: true, age: NaN }] }])).toThrow('Directional');
    expect(() => replayInputs([{ step: 0, directionEvents: [{ dir: 1, down: false, age: 0.004 }, { dir: 1, down: true, age: 0.010 }] }])).toThrow('ordered');
    expect(() => traversePhysical(fixture, MOVEMENT, [...held, { ...held[0], time: -1 }], 30)).toThrow('timestamps');
  });
});
