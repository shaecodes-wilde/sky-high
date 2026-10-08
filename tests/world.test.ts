import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { LEVEL1 } from '../src/level/level1';
import type { LevelData } from '../src/level/types';
import { Bloom } from '../src/sim/Bloom';
import { RING_REARM, World } from '../src/sim/World';
import { input, steps } from './helpers';

function tinyLevel(): LevelData {
  return {
    ...LEVEL1,
    platforms: [{ id: 0, kind: 'island', x0: -500, x1: 3000, top: 0, bottom: -100 }],
    springs: [],
    rings: [{ x: 100, y: 60 }],
    winds: [],
    hazards: [],
    seeds: [],
    fragments: [],
    keepsakes: [],
    checkpoints: [{ x: 400, y: 0 }],
    signs: [],
    npcs: [],
    decor: [],
    start: { x: 0, y: 0 },
    parade: { triggerX: 1000, flower: { x: 0, y: 0 }, bridgeSolidAt: 2.4 },
    goal: { x0: 99999, x1: 99999, top: 0 },
  };
}

describe('dewdrop rings', () => {
  it('refill at most one dash per contact and rearm only after the delay and an exit', () => {
    const w = new World(tinyLevel(), MOVEMENT, 'adventure');
    const p = w.player;
    // Hover inside the ring with no dash.
    const park = () => {
      p.x = 100;
      p.y = 50;
      p.vx = 0;
      p.vy = 0;
      p.grounded = false;
    };
    park();
    p.dashCharges = 0;
    let refills = 0;
    for (let i = 0; i < steps(RING_REARM * 2); i++) {
      park();
      w.step(input());
      p.dashCharges = 0; // spend it again immediately
      refills += w.events.filter((e) => e.type === 'ring').length;
    }
    expect(refills).toBe(1); // never re-armed while still inside
    // Leave, wait, return.
    p.x = 300;
    for (let i = 0; i < steps(0.2); i++) {
      p.x = 300;
      p.y = 50;
      p.vy = 0;
      w.step(input());
    }
    park();
    p.dashCharges = 0;
    w.step(input());
    expect(w.events.filter((e) => e.type === 'ring').length).toBe(1);
  });
});

describe('bloom', () => {
  it('cannot be charged by stationary input spam', () => {
    const w = new World(tinyLevel(), MOVEMENT, 'adventure');
    for (let i = 0; i < steps(10); i++) w.step(input({ move: i % 2 ? 1 : -1, jumpPressed: i % 7 === 0, jumpHeld: true, dash: i % 22 === 0 ? 1 : i % 22 === 11 ? -1 : 0 }));
    expect(Math.abs(w.player.x)).toBeLessThan(120);
    expect(w.bloom.value).toBeLessThan(0.1);
  });

  it('builds from sustained forward progress and eases off gently', () => {
    const b = new Bloom();
    b.reset(0);
    let x = 0;
    for (let i = 0; i < steps(8); i++) {
      x += 200 * SIM_DT;
      b.step(SIM_DT, x, 200, MOVEMENT.runSpeed);
    }
    expect(b.tier).toBe(2);
    for (let i = 0; i < steps(1); i++) b.step(SIM_DT, x, 0, MOVEMENT.runSpeed);
    expect(b.tier).toBe(2); // a breath, not a punishment
  });

  it('uses hysteresis so the tier does not flicker around a threshold', () => {
    const b = new Bloom();
    b.reset(0);
    b.value = 0.35;
    b.step(SIM_DT, 0, 0, MOVEMENT.runSpeed);
    expect(b.tier).toBe(1);
    b.value = 0.3;
    b.step(SIM_DT, 0, 0, MOVEMENT.runSpeed);
    expect(b.tier).toBe(1);
  });

  it('never changes physics: identical trajectories at low and high bloom', () => {
    const trace = (bloom: number) => {
      const w = new World(tinyLevel(), MOVEMENT, 'adventure');
      const out: number[] = [];
      for (let i = 0; i < steps(3); i++) {
        w.bloom.value = bloom;
        w.step(input({ move: 1, jumpPressed: i % 40 === 0, jumpHeld: i % 40 < 15, dash: i % 40 === 20 ? 1 : 0 }));
        out.push(w.player.x, w.player.y);
      }
      return out;
    };
    expect(trace(1)).toEqual(trace(0));
  });
});

describe('petal parade and checkpoints', () => {
  it('turns the bridge solid only once it is fully visible', () => {
    const w = new World(LEVEL1, MOVEMENT, 'adventure');
    w.parade.start();
    const bridge = w.solids.filter((s) => s.kind === 'petal');
    expect(bridge.length).toBeGreaterThan(0);
    for (let i = 0; i < steps(5); i++) {
      w.parade.step(SIM_DT);
      const solid = w.parade.bridgeSolid;
      if (solid) expect(w.parade.bridgeAlpha).toBe(1);
      else expect(w.parade.bridgeAlpha).toBeLessThan(1);
    }
  });

  it('restores the dormant sky when dying during the transformation from an earlier checkpoint', () => {
    const w = new World(LEVEL1, MOVEMENT, 'adventure');
    const cp = LEVEL1.checkpoints.findIndex((c) => c.x < LEVEL1.parade.triggerX && c.x > LEVEL1.parade.triggerX - 400);
    const c = LEVEL1.checkpoints[cp];
    w.player.reset(c.x, c.y);
    w.player.grounded = true;
    w.step(input());
    expect(w.checkpoint).toBe(cp);
    // Run to the trigger.
    for (let i = 0; i < steps(4) && w.parade.state === 'dormant'; i++) w.step(input({ move: 1 }));
    expect(w.parade.state).toBe('active');
    // Fall to death mid-transformation.
    w.player.y = LEVEL1.killY - 10;
    w.step(input());
    expect(w.dead).toBe(true);
    for (let i = 0; i < steps(1); i++) w.step(input());
    expect(w.dead).toBe(false);
    expect(w.parade.state).toBe('dormant');
    expect(w.solids.filter((s) => s.kind === 'petal').every((s) => !s.active)).toBe(true);
    expect(w.player.x).toBe(c.x);
  });

  it('keeps the bloomed state when respawning at a checkpoint reached after the parade', () => {
    const w = new World(LEVEL1, MOVEMENT, 'adventure');
    w.parade.set(true);
    const cp = LEVEL1.checkpoints.findIndex((c) => c.x > LEVEL1.parade.triggerX);
    const c = LEVEL1.checkpoints[cp];
    w.player.reset(c.x, c.y);
    w.player.grounded = true;
    w.step(input());
    w.respawn();
    expect(w.parade.state).toBe('done');
    expect(w.solids.filter((s) => s.kind === 'petal').every((s) => s.active)).toBe(true);
  });

  it('repeated respawns do not accumulate events or state', () => {
    const w = new World(LEVEL1, MOVEMENT, 'adventure');
    for (let i = 0; i < 50; i++) w.respawn();
    expect(w.events.length).toBeLessThanOrEqual(50);
    w.step(input());
    expect(w.events.length).toBeLessThan(5);
  });
});

describe('time trial rules', () => {
  it('records split times at first arrival only', () => {
    const w = new World(tinyLevel(), MOVEMENT, 'timeTrial');
    for (let i = 0; i < steps(6); i++) w.step(input({ move: 1 }));
    const first = w.splits[0];
    expect(first).not.toBeNull();
    w.respawn();
    for (let i = 0; i < steps(1); i++) w.step(input({ move: 1 }));
    expect(w.splits[0]).toBe(first);
  });

  it('skips dialogue in time trial', () => {
    const lvl = { ...tinyLevel(), npcs: [{ x: 50, y: 0, lines: { poppy: 'HI', puddlewick: 'HI' } }] };
    const tt = new World(lvl, MOVEMENT, 'timeTrial');
    const adv = new World(lvl, MOVEMENT, 'adventure');
    let ttTalk = 0;
    let advTalk = 0;
    for (let i = 0; i < steps(2); i++) {
      tt.step(input({ move: 1 }));
      adv.step(input({ move: 1 }));
      ttTalk += tt.events.filter((e) => e.type === 'npc').length;
      advTalk += adv.events.filter((e) => e.type === 'npc').length;
    }
    expect(ttTalk).toBe(0);
    expect(advTalk).toBe(1);
  });
});
