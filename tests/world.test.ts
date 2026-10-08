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
    splitGates: undefined,
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

  it.each(['standard', 'express'] as const)('records all ordered gates on a continuous %s route', (route) => {
    const level: LevelData = {
      ...tinyLevel(),
      rings: [],
      checkpoints: [{ x: 200, y: 0 }, { x: 400, y: 0 }, { x: 700, y: 0 }],
      goal: { x0: 900, x1: 950, top: 0 },
    };
    if (route === 'express') {
      // Same start and finish: a spring launches onto a high lane that bypasses
      // every low respawn marker, then the lane drops back to the shared goal.
      level.springs = [{ x: 90, top: 0 }];
      level.platforms.push({ id: 1, kind: 'cloud', x0: 130, x1: 780, top: 80, bottom: 72 });
    }
    const w = new World(level, MOVEMENT, 'timeTrial');
    const crossings: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < steps(10) && !w.complete; i++) {
      w.step(input({ move: 1 }));
      for (const event of w.events) {
        if (event.type !== 'split') continue;
        crossings.push(event.index);
        heights.push(event.y);
      }
    }
    expect(w.complete).toBe(true);
    expect(w.dead).toBe(false);
    expect(crossings).toEqual([0, 1, 2]);
    expect(w.splits.every((s) => s !== null)).toBe(true);
    expect(w.progressionComplete).toBe(true);
    expect(w.runInvalidReason).toBeNull();
    if (route === 'express') {
      expect(heights.every((y) => y >= 80)).toBe(true);
      expect(w.checkpoint).toBe(-1);
    } else {
      expect(heights).toEqual([0, 0, 0]);
      expect(w.checkpoint).toBe(2);
    }
  });

  it('keeps physical respawn markers separate from authored progression gates', () => {
    const level = { ...tinyLevel(), checkpoints: [{ x: 80, y: 0 }], splitGates: [{ x: 240 }] };
    const w = new World(level, MOVEMENT, 'timeTrial');
    let checkpointEvents = 0;
    let splitEvents = 0;
    for (let i = 0; i < steps(1.3); i++) {
      w.step(input({ move: 1 }));
      checkpointEvents += w.events.filter((e) => e.type === 'checkpoint').length;
      splitEvents += w.events.filter((e) => e.type === 'split').length;
    }
    expect(checkpointEvents).toBe(1);
    expect(w.checkpoint).toBe(0);
    expect(splitEvents).toBe(0);
    expect(w.splits).toEqual([null]);
    for (let i = 0; i < steps(1); i++) {
      w.step(input({ move: 1 }));
      splitEvents += w.events.filter((e) => e.type === 'split').length;
    }
    expect(splitEvents).toBe(1);
    expect(w.progressionComplete).toBe(true);
    w.respawn();
    expect(w.player.x).toBe(80);
    expect(w.runInvalidReason).toBe('checkpoint retry');
  });

  it('never repeats a split while reversing and crossing a boundary again', () => {
    const w = new World({ ...tinyLevel(), splitGates: [{ x: 100 }, { x: 800 }] }, MOVEMENT, 'timeTrial');
    for (let i = 0; i < steps(1.4); i++) w.step(input({ move: 1 }));
    const first = w.splits[0];
    expect(first).not.toBeNull();
    let repeated = 0;
    for (let i = 0; i < steps(1.2); i++) {
      w.step(input({ move: -1 }));
      repeated += w.events.filter((e) => e.type === 'split').length;
    }
    expect(w.player.x).toBeLessThan(100);
    for (let i = 0; i < steps(1.4); i++) {
      w.step(input({ move: 1 }));
      repeated += w.events.filter((e) => e.type === 'split').length;
    }
    expect(w.player.x).toBeGreaterThan(100);
    expect(repeated).toBe(0);
    expect(w.splits[0]).toBe(first);
    expect(w.progressionValid).toBe(true);
  });

  it('invalidates a missed gate and never records a later gate out of order', () => {
    const w = new World({ ...tinyLevel(), splitGates: [{ x: 100, minY: 100, maxY: 200 }, { x: 200 }] }, MOVEMENT, 'timeTrial');
    let failures = 0;
    for (let i = 0; i < steps(3); i++) {
      w.step(input({ move: 1 }));
      failures += w.events.filter((e) => e.type === 'progressionInvalid').length;
    }
    expect(w.player.x).toBeGreaterThan(200);
    expect(w.splits).toEqual([null, null]);
    expect(w.progressionValid).toBe(false);
    expect(w.progressionComplete).toBe(false);
    expect(w.runInvalidReason).toBe('skipped split gates');
    expect(failures).toBe(1);
  });

  it('does not repair clean eligibility by backtracking after skipping a gate', () => {
    const w = new World({ ...tinyLevel(), splitGates: [{ x: 100, minY: 35 }] }, MOVEMENT, 'timeTrial');
    for (let i = 0; i < steps(1.2); i++) w.step(input({ move: 1 }));
    expect(w.progressionValid).toBe(false);
    for (let i = 0; i < steps(0.75); i++) w.step(input({ move: -1 }));
    expect(w.player.x).toBeLessThan(100);
    for (let i = 0; i < steps(0.7); i++) w.step(input({ move: 1, jumpPressed: i === 0, jumpHeld: true }));
    expect(w.splits[0]).not.toBeNull(); // useful practice timing remains available
    expect(w.progressionComplete).toBe(false);
    expect(w.runInvalidReason).toBe('skipped split gates');
  });

  it('does not count a teleport beyond a boundary as a forward crossing', () => {
    const w = new World({ ...tinyLevel(), splitGates: [{ x: 100 }, { x: 200 }] }, MOVEMENT, 'timeTrial');
    w.player.reset(250, 0);
    w.player.grounded = true;
    w.step(input({ move: 1 }));
    expect(w.splits).toEqual([null, null]);
    expect(w.runInvalidReason).toBe('skipped split gates');
  });

  it('orders nearby boundaries even when maximum speed crosses both in one tick', () => {
    const w = new World({ ...tinyLevel(), splitGates: [{ x: 2 }, { x: 4 }] }, MOVEMENT, 'timeTrial');
    w.player.vx = MOVEMENT.maxHorizontalSpeed;
    w.step(input({ move: 1 }));
    expect(w.events.filter((e) => e.type === 'split').map((e) => e.index)).toEqual([0, 1]);
    expect(w.splits[0]).toBeGreaterThan(0);
    expect(w.splits[1]).toBeGreaterThan(w.splits[0]!);
    expect(w.splits[1]).toBeLessThan(SIM_DT);
    expect(w.progressionComplete).toBe(true);
  });

  it('uses the crossing height rather than the endpoint of a fast fall', () => {
    const level = { ...tinyLevel(), splitGates: [{ x: 2, minY: 0, maxY: 99 }] };
    const w = new World(level, MOVEMENT, 'timeTrial');
    w.player.y = 101;
    w.player.vx = MOVEMENT.maxHorizontalSpeed;
    w.player.vy = -MOVEMENT.maxFall;
    w.player.grounded = false;
    w.step(input({ move: 1 }));
    expect(w.progressionComplete).toBe(true);
    const split = w.events.find((e) => e.type === 'split');
    expect(split?.y).toBeLessThanOrEqual(99);
    expect(split?.y).toBeGreaterThan(w.player.y);
  });

  it('keeps death ineligible after automatic respawn and retains first split times', () => {
    const w = new World(tinyLevel(), MOVEMENT, 'timeTrial');
    for (let i = 0; i < steps(4); i++) w.step(input({ move: 1 }));
    const first = w.splits[0];
    expect(w.checkpoint).toBe(0);
    w.player.y = w.level.killY - 10;
    w.player.grounded = false;
    w.step(input());
    expect(w.runInvalidReason).toBe('death');
    for (let i = 0; i < steps(1); i++) w.step(input());
    expect(w.dead).toBe(false);
    expect(w.player.x).toBe(400);
    expect(w.splits[0]).toBe(first);
    expect(w.runInvalidReason).toBe('death');
  });

  it('clears all progression and eligibility state on a full restart', () => {
    const w = new World(tinyLevel(), MOVEMENT, 'timeTrial');
    for (let i = 0; i < steps(4); i++) w.step(input({ move: 1 }));
    w.respawn();
    expect(w.runInvalidReason).toBe('checkpoint retry');
    w.resetAll();
    expect(w.splits).toEqual([null]);
    expect(w.checkpoint).toBe(-1);
    expect(w.progressionComplete).toBe(false);
    expect(w.progressionValid).toBe(true);
    expect(w.runInvalidReason).toBeNull();
    expect(w.time).toBe(0);
    expect(w.events).toEqual([]);
    for (let i = 0; i < steps(4); i++) w.step(input({ move: 1 }));
    expect(w.progressionComplete).toBe(true);
    expect(w.runInvalidReason).toBeNull();
  });

  it('rejects unordered split gates so authored indexes cannot silently change', () => {
    expect(() => new World({ ...tinyLevel(), splitGates: [{ x: 200 }, { x: 100 }] }, MOVEMENT, 'timeTrial')).toThrow(/increasing/);
  });
});
