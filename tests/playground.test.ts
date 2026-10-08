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
});
