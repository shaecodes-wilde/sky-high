import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { LEVEL1 } from '../src/level/level1';
import { chooseAnim, PresentationSignals } from '../src/render/signals';
import { World } from '../src/sim/World';
import { input } from './helpers';

// The presentation adapter is the art layer's only window into the controller.
// These tests pin its semantics so either branch can change internals safely.

function world(): World {
  return new World(LEVEL1, MOVEMENT, 'adventure');
}

describe('presentation signals', () => {
  it('normalises speed against the configured run speed', () => {
    const w = world();
    const sig = new PresentationSignals();
    w.player.vx = MOVEMENT.runSpeed;
    expect(sig.update(w, 1 / 60).speed).toBeCloseTo(1);
    w.player.vx = MOVEMENT.maxHorizontalSpeed;
    expect(sig.update(w, 1 / 60).overdrive).toBeCloseTo(1);
  });

  it('scales with a retuned controller instead of fixed numbers', () => {
    const fast = { ...MOVEMENT, runSpeed: MOVEMENT.runSpeed * 2 };
    const w = new World(LEVEL1, fast, 'adventure');
    const sig = new PresentationSignals();
    w.player.vx = fast.runSpeed;
    expect(sig.update(w, 1 / 60).speed).toBeCloseTo(1);
  });

  it('latches one-shot pulses for exactly one rendered frame', () => {
    const w = world();
    const sig = new PresentationSignals();
    sig.ingest([{ type: 'land', x: 0, y: 0, impact: MOVEMENT.maxFall / 2, speed: 0 }, { type: 'dash', dir: 1, x: 0, y: 0 }], w);
    const a = sig.update(w, 1 / 60);
    expect(a.landed).toBeCloseTo(0.5);
    expect(a.dashStarted).toBe(true);
    const b = sig.update(w, 1 / 60);
    expect(b.landed).toBe(0);
    expect(b.dashStarted).toBe(false);
  });

  it('chooses the same poses as the original renderer thresholds', () => {
    const w = world();
    const sig = new PresentationSignals();
    const p = w.player;
    const pose = () => chooseAnim(sig.update(w, 1 / 60));
    p.grounded = true;
    p.sinceLand = 1;
    p.vx = 0;
    expect(pose()).toBe('idle');
    p.vx = MOVEMENT.runSpeed;
    p.groundTime = 1;
    expect(pose()).toBe('run');
    p.grounded = false;
    p.vy = 200;
    expect(pose()).toBe('jump');
    p.vy = 0;
    expect(pose()).toBe('apex');
    p.vy = -200;
    expect(pose()).toBe('fall');
    // Movement-branch feedback poses: launch anticipation, skim rebound, land-into-jump.
    p.vy = 200;
    p.ascent = 'jump';
    p.airTime = 0.01;
    expect(pose()).toBe('launch');
    p.airTime = 0.2;
    p.sinceSkim = 0.02;
    expect(pose()).toBe('rebound');
    p.sinceSkim = 99;
    p.sinceLand = 0.01;
    expect(pose()).toBe('land');
  });

  it('never changes the simulation', () => {
    const a = world();
    const b = world();
    const sig = new PresentationSignals();
    for (let i = 0; i < 240; i++) {
      const inp = input({ move: 1, jumpPressed: i % 50 === 0, jumpHeld: i % 50 < 20 });
      a.step(inp);
      b.step(inp);
      sig.ingest(a.events, a);
      sig.update(a, 1 / 60);
    }
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.y).toBe(b.player.y);
  });
});
