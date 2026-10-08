import type { Action } from '../config/keys';
import { SIM_DT, type MovementConfig } from '../config/movement';
import { Input } from '../input/Input';
import { traverse, type TraversalOptions } from './traversal';
import type { LevelData } from './types';

export interface PhysicalInput {
  /** Seconds from the simulation's initial state; stable order breaks ties. */
  time: number;
  code: string;
  action: Action;
  down: boolean;
}

/** Production Input + FixedLoop + World. Delivers events in actual frame batches. */
export function traversePhysical(
  level: LevelData, cfg: MovementConfig, tape: readonly PhysicalInput[], fps: number,
  options: Omit<TraversalOptions, 'renderFps' | 'beforeRender'> = {},
) {
  for (let i = 0; i < tape.length; i++) {
    if (!Number.isFinite(tape[i].time) || tape[i].time < 0 || (i && tape[i].time < tape[i - 1].time)) throw new Error('Physical tape must have ordered finite non-negative timestamps');
  }
  const input = new Input();
  let cursor = 0;
  return traverse(level, cfg, (world, step) => input.sample(!world.player.grounded, world.player.facing, (step + 1) * SIM_DT * 1000, world.player.rolling), {
    ...options, renderFps: fps,
    beforeRender(elapsed) {
      while (cursor < tape.length && tape[cursor].time <= elapsed + 1e-9) {
        const e = tape[cursor++];
        if (e.down) input.press(e.code, e.action, e.time * 1000);
        else input.release(e.code, e.action, e.time * 1000);
      }
    },
  });
}
