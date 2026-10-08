import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { FixedLoop } from '../src/core/FixedLoop';
import { Input } from '../src/input/Input';
import { LEVEL1 } from '../src/level/level1';
import type { LevelData } from '../src/level/types';
import { World } from '../src/sim/World';
import { input } from './helpers';

function airborneRing(ringX = 35, ringY = 110): World {
  const level: LevelData = {
    ...LEVEL1, id: 'ring-buffer-fixture', start: { x: 0, y: 0 },
    platforms: [{ id: 0, kind: 'island', x0: -1000, x1: 2000, top: 0, bottom: -100 }],
    rings: [{ x: ringX, y: ringY }], springs: [], winds: [], hazards: [], seeds: [], fragments: [], keepsakes: [],
    checkpoints: [], splitGates: [], npcs: [], signs: [], decor: [],
    parade: { triggerX: 10000, flower: { x: 9000, y: 0 }, bridgeSolidAt: 2.4 },
    goal: { x0: 9000, x1: 9100, top: 0 },
  };
  const w = new World(level, MOVEMENT, 'timeTrial');
  w.player.reset(0, 100); w.player.vx = 225; w.player.dashCharges = 0;
  return w;
}

describe('dash commands through the real World contact boundary', () => {
  it('recognises an early-dash cloud skim after a long arc with fresh keyboard edges', () => {
    const base = airborneRing().level;
    const w = new World({ ...base, rings: [], platforms: [{ id: 0, kind: 'cloud', x0: -100, x1: 2000, top: 0, bottom: -8 }] }, MOVEMENT, 'adventure');
    const keys = new Input();
    keys.press('KeyD', 'right', 0); keys.press('Space', 'jump', 0);
    let releasedAt = -1; let pressedAgain = false; let dashAt = -1; let skimAt = -1;
    for (let i = 0; i < 90 && skimAt < 0; i++) {
      const t = i * SIM_DT * 1000;
      if (i === 8) keys.press('ShiftLeft', 'dash', t);
      if (i === 9) keys.release('ShiftLeft', 'dash', t);
      if (i > 8 && releasedAt < 0 && w.player.vy < 0 && w.player.y < 12) { keys.release('Space', 'jump', t); releasedAt = i; }
      if (releasedAt >= 0 && i > releasedAt && !pressedAgain && w.player.y < 6) { keys.press('Space', 'jump', t); pressedAgain = true; }
      w.step(keys.sample(!w.player.grounded, w.player.facing, t));
      if (w.events.some(e => e.type === 'dash')) dashAt = i;
      if (w.events.some(e => e.type === 'skim')) skimAt = i;
    }
    expect(skimAt - dashAt).toBeGreaterThan(0.35 / SIM_DT);
    expect(skimAt).toBeGreaterThan(0);
    expect(w.player.grounded).toBe(false);
    expect(w.player.vx).toBeGreaterThan(MOVEMENT.runSpeed);
    expect(w.player.dashCharges).toBe(1);
  });
  it.each([0, 1, 4, 5])('consumes a saved direction on ring contact with the press at step %i', (pressStep) => {
    const w = airborneRing();
    const events: string[] = [];
    let ringStep = -1; let dashStep = -1;
    for (let i = 0; i < 12; i++) {
      w.step(input({ move: 1, dash: i === pressStep ? -1 : 0 }));
      for (const e of w.events) {
        events.push(e.type);
        if (e.type === 'ring') ringStep = i;
        if (e.type === 'dash') { dashStep = i; expect(e.dir).toBe(-1); }
      }
    }
    expect(ringStep).toBe(5);
    expect(dashStep).toBe(ringStep);
    expect(events.filter((e) => e === 'dash')).toHaveLength(1);
    expect(events.indexOf('ring')).toBeLessThan(events.indexOf('dash'));
    expect(w.player.dashCharges).toBe(0);
    expect(w.player.dashBuffer).toBe(0);
  });

  it('a stale command cannot fire on a later ring refill', () => {
    const w = airborneRing(54, 96);
    const events: string[] = [];
    for (let i = 0; i < 16; i++) {
      w.step(input({ move: 1, dash: i === 0 ? 1 : 0 }));
      events.push(...w.events.map((e) => e.type));
    }
    expect(events.filter((e) => e === 'ring')).toHaveLength(1);
    expect(events).not.toContain('dash');
    expect(w.player.dashCharges).toBe(1);
  });

  it('a timely request waits for an active dash to expire after a ring refill', () => {
    const w = airborneRing(20);
    w.player.dashTimer = 0.075;
    const events: string[] = [];
    let dashStep = -1; let ringStep = -1;
    for (let i = 0; i < 10; i++) {
      w.step(input({ move: 1, dash: i === 1 ? -1 : 0 }));
      for (const e of w.events) {
        events.push(e.type);
        if (e.type === 'ring') ringStep = i;
        if (e.type === 'dash') { dashStep = i; expect(e.dir).toBe(-1); }
      }
    }
    expect(ringStep).toBeGreaterThanOrEqual(0);
    expect(dashStep).toBeGreaterThan(ringStep);
    expect(events.filter((e) => e === 'dash')).toHaveLength(1);
    expect(w.player.dashCharges).toBe(0);
  });

  it('a held keyboard dash triggers only once through refill, landing, and another jump', () => {
    const w = airborneRing(); const keys = new Input();
    keys.press('KeyD', 'right', 0); keys.press('ShiftLeft', 'dash', 0);
    let dashes = 0; let rings = 0;
    for (let i = 0; i < 180; i++) {
      if (i === 65) keys.press('Space', 'jump', i * SIM_DT * 1000);
      if (i === 80) keys.release('Space', 'jump', i * SIM_DT * 1000);
      w.step(keys.sample(!w.player.grounded, w.player.facing, i * SIM_DT * 1000));
      dashes += w.events.filter((e) => e.type === 'dash').length;
      rings += w.events.filter((e) => e.type === 'ring').length;
    }
    expect(rings).toBe(1); expect(dashes).toBe(1);
    expect(w.player.dashCharges).toBe(1);
  });

  it('ring, dash, landing and timer results are identical at different render rates', () => {
    function replay(fps: number) {
      const w = airborneRing(); const loop = new FixedLoop(SIM_DT);
      const events: string[] = []; let tick = 0;
      while (tick < 240) loop.advance(1 / fps, () => {
        if (tick >= 240) return;
        w.step(input({ move: 1, dash: tick === 0 ? 1 : 0, jumpPressed: tick === 80, jumpHeld: tick >= 80 && tick < 100 }));
        events.push(...w.events.map((e) => `${tick}:${e.type}`)); tick++;
      });
      const p = w.player;
      return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, charges: p.dashCharges, dash: p.dashTimer, buffer: p.dashBuffer, time: w.time, events };
    }
    expect(replay(30)).toEqual(replay(60)); expect(replay(144)).toEqual(replay(60));
  });
});
