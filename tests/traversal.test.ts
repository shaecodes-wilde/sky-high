import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { FixedLoop } from '../src/core/FixedLoop';
import { LEVEL1 } from '../src/level/level1';
import { LEVEL1_EXPRESS_CUES as EXPRESS, LEVEL1_STANDARD_CUES as STANDARD, level1Inputs } from '../src/level/level1Phrases';
import { movementCues, replayInputs, traversalState, traverse } from '../src/level/traversal';
import type { LevelData } from '../src/level/types';
import { World } from '../src/sim/World';
import { Input } from '../src/input/Input';

describe('continuous Level 1 routes with production World and fixed-step input', () => {
  for (const vx of [0, 132, 225]) for (const offset of [-6, 0, 6]) for (const dashOffset of [-1, 0, 1]) {
    it(`flow route: initial vx ${vx}, takeoff ${offset}px, dash ${dashOffset} tick includes real Level 1 skims`, () => {
      const r = traverse(LEVEL1, MOVEMENT, level1Inputs('flow', offset, dashOffset), {
        start: { ...LEVEL1.start, vx }, maxSteps: 60 * 90, trailEvery: 0,
      });
      expect(r.reason).toBe('goal');
      expect(r.wallHits).toBe(0);
      expect(r.progressionComplete).toBe(true);
      expect(r.runInvalidReason).toBeNull();
      expect(r.events.filter(e => e.event.type === 'split').map(e => e.event.type === 'split' && e.event.index)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(r.peakSpeed).toBeLessThanOrEqual(MOVEMENT.maxHorizontalSpeed);
      expect(r.events.filter(e => e.event.type === 'fragment')).toHaveLength(3);
      expect(r.events.filter(e => e.event.type === 'skim').length).toBeGreaterThanOrEqual(2);
      for (const [x0, x1] of [[1200, 1300], [1935, 2050]]) {
        const landing = r.landings.find(l => l.x > x0 && l.x < x1);
        expect(landing).toBeDefined();
        expect(landing?.exit?.step).toBe(landing?.step);
        expect(landing?.exit?.vx).toBe(landing?.vx);
        expect(landing?.exit?.dashCharges).toBe(1);
      }
      const firstSpring = r.events.find(e => e.event.type === 'spring' && e.event.spring === 0);
      expect(firstSpring && firstSpring.event.type === 'spring' && firstSpring.event.boosted).toBe(false);
    });
  }
  for (const [name, cues] of [['standard', STANDARD], ['express', EXPRESS]] as const) {
    for (const vx of [0, 132, 225]) for (const offset of [-6, 0, 6]) for (const dashOffset of [-1, 0, 1]) {
      it(`${name}: initial vx ${vx}, takeoff ${offset}px, dash ${dashOffset} tick`, () => {
        const variant = cues.map(c => ({ ...c, dashSteps: c.dashSteps?.map(s => s + dashOffset) }));
        const r = traverse(LEVEL1, MOVEMENT, movementCues(variant, offset), {
          start: { ...LEVEL1.start, vx }, maxSteps: 60 * 90, trailEvery: 0,
        });
        expect(r.reason, `ended at ${r.final.x.toFixed(1)},${r.final.y.toFixed(1)}`).toBe('goal');
        expect(r.wallHits).toBe(0);
        expect(r.progressionComplete).toBe(true);
        expect(r.progressionValid).toBe(true);
        expect(r.runInvalidReason).toBeNull();
        expect(r.splits.every(t => t !== null)).toBe(true);
        expect(r.events.filter(e => e.event.type === 'split').map(e => e.event.type === 'split' && e.event.index)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(r.events.some(e => e.event.type === 'paradeStart')).toBe(true);
        expect(r.events.some(e => e.event.type === 'ring')).toBe(true);
        expect(r.peakSpeed).toBeLessThanOrEqual(MOVEMENT.maxHorizontalSpeed);
      });
    }
  }

  it('express is genuinely faster and uses both upper lanes with identical initial conditions', () => {
    const standard = traverse(LEVEL1, MOVEMENT, level1Inputs('standard'), { trailEvery: 0 });
    const flow = traverse(LEVEL1, MOVEMENT, level1Inputs('flow'), { trailEvery: 0 });
    const express = traverse(LEVEL1, MOVEMENT, level1Inputs('express'), { trailEvery: 0 });
    expect(standard.reason).toBe('goal');
    expect(express.reason).toBe('goal');
    expect(flow.reason).toBe('goal');
    expect(express.final.time).toBeLessThan(standard.final.time - 2);
    expect(flow.final.time).toBeLessThan(standard.final.time - 0.4);
    expect(express.final.time).toBeLessThan(flow.final.time);
    const upperIds = LEVEL1.platforms.filter(p => p.parade || p.top >= 230).map(p => p.id);
    expect(express.landings.filter(l => upperIds.includes(l.surface!)).length).toBeGreaterThanOrEqual(8);
    expect(express.landings.some(l => l.x > 3300 && l.x < 3450 && l.vx > 220)).toBe(true);
    expect(express.landings.some(l => l.x > 6760 && l.x < 6900 && l.vx > 200)).toBe(true);
    expect(standard.events.filter(e => e.event.type === 'fragment')).toHaveLength(3);
    expect(express.events.filter(e => e.event.type === 'fragment')).toHaveLength(3);
    console.log(`Continuous production routes: comfort ${standard.final.time.toFixed(3)}s; flow ${flow.final.time.toFixed(3)}s; express ${express.final.time.toFixed(3)}s. No deaths or wall impacts.`);
  });

  it('flow skims survive real keyboard release/press edges and replay without state injection', () => {
    const expected = traverse(LEVEL1, MOVEMENT, level1Inputs('flow'), { trailEvery: 0 });
    const keys = new Input();
    const policy = level1Inputs('flow');
    const world = new World(LEVEL1, MOVEMENT, 'timeTrial');
    keys.press('KeyD', 'right', 0);
    let skims = 0;
    let step = 0;
    for (; step < 60 * 90 && !world.complete && !world.dead; step++) {
      const ms = step * SIM_DT * 1000;
      const frame = policy(world, step);
      if (frame.jumpPressed) {
        keys.release('Space', 'jump', ms);
        keys.press('Space', 'jump', ms);
      } else if (!frame.jumpHeld) keys.release('Space', 'jump', ms);
      if (frame.dash) keys.press('ShiftLeft', 'dash', ms);
      else keys.release('ShiftLeft', 'dash', ms);
      world.step(keys.sample(!world.player.grounded, world.player.facing, ms));
      skims += world.events.filter(e => e.type === 'skim').length;
    }
    expect(world.complete).toBe(true);
    expect(skims).toBeGreaterThanOrEqual(2);
    expect(traversalState(world, step)).toEqual(expected.final);
    expect(world.splits).toEqual(expected.splits);
    expect(world.fragmentsTaken.filter(Boolean)).toHaveLength(3);
    expect(world.runInvalidReason).toBeNull();
    expect(traverse(LEVEL1, MOVEMENT, expected.recording, { trailEvery: 0 })).toEqual(expected);
  });

  it('replays the entire exact input recording with the same landings, speeds, charges and events', () => {
    const a = traverse(LEVEL1, MOVEMENT, movementCues(EXPRESS), { trailEvery: 0 });
    const b = traverse(LEVEL1, MOVEMENT, a.recording, { trailEvery: 0 });
    expect(b).toEqual(a);
    expect(a.landings.filter(l => l.exit !== null).length).toBeGreaterThan(20);
    expect(a.landings.every(l => l.dashCharges === 1)).toBe(true);
  });

  it('whole-route replay produces the same outcome at 30, 60 and 144 rendering fps', () => {
    const expected = traverse(LEVEL1, MOVEMENT, movementCues(EXPRESS), { trailEvery: 0 });
    for (const fps of [30, 60, 144]) {
      const world = new World(LEVEL1, MOVEMENT, 'timeTrial');
      const intent = replayInputs(expected.recording);
      const loop = new FixedLoop(SIM_DT);
      let step = 0;
      for (let frame = 0; frame < fps * 90 && !world.complete; frame++) {
        loop.advance(1 / fps, () => {
          if (world.complete) return;
          world.step(intent(world, step++));
        });
      }
      expect(world.complete).toBe(true);
      expect(traversalState(world, step)).toEqual(expected.final);
      expect(world.splits).toEqual(expected.splits);
      expect(world.progressionComplete).toBe(true);
    }
  });
});

describe('connected movement phrases and recovery boundaries', () => {
  for (const vx of [132, 225, 300]) {
    it(`normal first spring preserves a ${vx}px/s approach without a receiver sidewall`, () => {
      const r = traverse(LEVEL1, MOVEMENT, () => ({ move: 1, jumpHeld: false, jumpPressed: false, dash: 0 }), {
        start: { x: 1450, y: 80, vx }, maxSteps: 100,
        stop: w => w.player.grounded && w.player.x > 1530,
      });
      expect(r.reason).toBe('target');
      expect(r.wallHits).toBe(0);
      expect(r.final.y).toBe(172);
      expect(r.final.vx).toBeGreaterThanOrEqual(vx === 132 ? 132 : vx - 26);
      expect(r.events.filter(e => e.event.type === 'spring')).toHaveLength(1);
      expect(r.final.dashCharges).toBe(1);
    });
    it(`boosted first spring reaches the optional upper fork from ${vx}px/s`, () => {
      let pressed = false;
      const r = traverse(LEVEL1, MOVEMENT, world => {
        const contact = !pressed && world.player.ascent === 'spring' && world.player.lastSpring === 0;
        if (contact) pressed = true;
        return { move: 1, jumpHeld: true, jumpPressed: contact, dash: 0 };
      }, {
        start: { x: 1450, y: 80, vx }, maxSteps: 120,
        stop: w => w.player.grounded && w.player.x > 1530,
      });
      expect(r.reason).toBe('target');
      expect(r.final.y).toBe(222);
      expect(r.wallHits).toBe(0);
      expect(r.events.filter(e => e.event.type === 'springBoost')).toHaveLength(1);
      expect(r.final.dashCharges).toBe(1);
    });
  }

  it('chains multiple dash → buffered cloud landing → jump phrases without free speed or charge resets', () => {
    const phrase: LevelData = {
      ...LEVEL1, start: { x: 80, y: 0 }, killY: -100,
      platforms: [
        { id: 0, kind: 'island', x0: -100, x1: 110, top: 0, bottom: -120 },
        ...[[160, 285], [320, 465], [500, 645]].map(([x0, x1], i) => ({ id: i + 1, kind: 'cloud' as const, x0, x1, top: 0, bottom: -8 })),
      ],
      springs: [], winds: [], rings: [], hazards: [], seeds: [], fragments: [], keepsakes: [],
      checkpoints: [], splitGates: [], npcs: [], route: [], express: [],
      parade: { ...LEVEL1.parade, triggerX: 9999 }, goal: { x0: 9999, x1: 10000, top: 0 },
    };
    let lastJump = 0;
    let requested = false;
    const r = traverse(phrase, MOVEMENT, (world, step) => {
      const p = world.player;
      if (world.events.some(e => e.type === 'jump')) { lastJump = step; requested = false; }
      const buffer = !requested && p.vy < 0 && p.y < 9;
      if (buffer) requested = true;
      return { move: 1, jumpHeld: true, jumpPressed: step === 0 || buffer, dash: step - lastJump === 28 ? 1 : 0 };
    }, { start: { ...phrase.start, vx: 225 }, maxSteps: 180, stop: w => w.player.x > 510 });
    expect(r.reason).toBe('target');
    expect(r.events.filter(e => e.event.type === 'skim').length).toBeGreaterThanOrEqual(2);
    expect(r.landings.filter(l => l.exit?.step === l.step).length).toBeGreaterThanOrEqual(2);
    expect(r.landings.every(l => l.exit && l.exit.vx >= l.vx - MOVEMENT.groundOverspeedDecay * SIM_DT)).toBe(true);
    expect(r.peakSpeed).toBeLessThanOrEqual(225);
    expect(r.trail.every(s => s.dashCharges === 0 || s.dashCharges === 1)).toBe(true);
    expect(r.wallHits).toBe(0);
  });

  it('reports deaths rather than respawning or teleporting into a successful result', () => {
    const r = traverse({ ...LEVEL1, splitGates: [] }, MOVEMENT, [{ step: 0, move: 1 }], {
      start: { x: 2260, y: 120, vx: 132 }, maxSteps: 100,
    });
    expect(r.reason).toBe('death');
    expect(r.events.some(e => e.event.type === 'death')).toBe(true);
    expect(r.events.some(e => e.event.type === 'respawn')).toBe(false);
    expect(r.runInvalidReason).toBe('death');
  });

  it('consumes recorded button commands once while held state persists', () => {
    const input = replayInputs([{ step: 0, move: 1, jumpPressed: true, jumpHeld: true, dash: 1 }]);
    const world = new World(LEVEL1, MOVEMENT, 'timeTrial');
    expect(input(world, 0)).toEqual({ move: 1, jumpPressed: true, jumpHeld: true, dash: 1 });
    expect(input(world, 1)).toEqual({ move: 1, jumpPressed: false, jumpHeld: true, dash: 0 });
  });

  it('rejects an unordered recording rather than silently dropping its later commands', () => {
    expect(() => replayInputs([{ step: 20, dash: 1 }, { step: 10, jumpPressed: true }])).toThrow('ordered');
  });
});
