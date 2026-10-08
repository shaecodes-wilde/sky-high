import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { PLAYGROUND_LEVEL, PLAYGROUND_SECTIONS, PlaygroundSession } from '../src/dev/playground';
import { World } from '../src/sim/World';
import { input } from './helpers';

describe('developer movement playground', () => {
  it('has eight independently resettable sections with clean collision starts', () => {
    const w = new World(PLAYGROUND_LEVEL, MOVEMENT, 'adventure');
    const session = new PlaygroundSession();
    expect(PLAYGROUND_SECTIONS).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      session.reset(w, i);
      w.step(input());
      expect(w.player.grounded).toBe(true);
      expect(w.player.vx).toBe(0);
      expect(w.player.dashCharges).toBe(1);
      expect(w.dead).toBe(false);
      expect(w.splits).toEqual([]);
      expect(w.complete).toBe(false);
    }
  });
  it('replays the same fixed-step input from the recorded section deterministically', () => {
    const w = new World(PLAYGROUND_LEVEL, MOVEMENT, 'adventure');
    const s = new PlaygroundSession();
    s.reset(w, 2); s.record(w);
    const states: number[][] = [];
    for (let i = 0; i < 90; i++) {
      w.step(s.input(input({ move: 1, jumpPressed: i === 35, jumpHeld: i >= 35 && i < 60, dash: i === 52 ? 1 : 0 })));
      s.afterStep(w);
      states.push([w.player.x, w.player.y, w.player.vx, w.player.vy, w.player.dashCharges, w.player.dashTimer]);
    }
    s.recording = false; s.reset(w, 0);
    expect(s.replay(w)).toBe(true);
    expect(s.section).toBe(2);
    for (const state of states) {
      w.step(s.input(input({ move: -1 }))); s.afterStep(w);
      expect([w.player.x, w.player.y, w.player.vx, w.player.vy, w.player.dashCharges, w.player.dashTimer]).toEqual(state);
    }
  });
  it('section reset stops recording and replay before a manual retry changes physics', () => {
    const w = new World(PLAYGROUND_LEVEL, MOVEMENT, 'adventure');
    const s = new PlaygroundSession(); s.reset(w, 4); s.record(w);
    for (let i = 0; i < 30; i++) { w.step(s.input(input({ move: 1 }))); s.afterStep(w); }
    s.reset(w);
    expect(s.recording).toBe(false); expect(s.replaying).toBe(false);
    expect(s.elapsed).toBe(0); expect(w.player.x).toBe(PLAYGROUND_SECTIONS[4].x);
    expect(s.replay(w)).toBe(true);
    s.reset(w);
    expect(s.replaying).toBe(false);
  });
  it('retains an independent physical pump gesture when a live edge buffer is reused', () => {
    const w = new World(PLAYGROUND_LEVEL, MOVEMENT, 'adventure');
    const s = new PlaygroundSession(); s.record(w);
    const edges = [{ dir: 1 as const, down: false, age: 0.008 }, { dir: 1 as const, down: true, age: 0.004 }];
    const frame = input({ move: 1, rollHeld: true, directionEvents: edges });
    s.input(frame);
    edges[0].down = true;
    edges.splice(1);
    s.recording = false;
    expect(s.replay(w)).toBe(true);
    expect(s.input(input()).directionEvents).toEqual([
      { dir: 1, down: false, age: 0.008 }, { dir: 1, down: true, age: 0.004 },
    ]);
  });
});
