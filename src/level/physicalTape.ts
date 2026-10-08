import type { Action } from '../config/keys';
import { SIM_DT, type MovementConfig } from '../config/movement';
import { Input } from '../input/Input';
import { traverse, type RecordedInput, type TraversalOptions } from './traversal';
import type { LevelData } from './types';

export interface PhysicalInput {
  /** Seconds from the simulation's initial state; stable order breaks ties. */
  time: number;
  code: string;
  action: Action;
  down: boolean;
}

/**
 * Emit real keyboard edges for a control recipe. Jump holding begins with a
 * genuine press, not an impossible pre-held jump with no press edge. Such a
 * recipe can differ from its keyboard counterpart; measure both explicitly.
 */
export function keyboardTape(recording: readonly RecordedInput[]): PhysicalInput[] {
  const tape: PhysicalInput[] = [];
  let move = 0;
  let roll = false;
  let jump = false;
  const direction = (dir: -1 | 1, down: boolean, time: number) => tape.push({ time, code: dir > 0 ? 'KeyD' : 'KeyA', action: dir > 0 ? 'right' : 'left', down });
  for (const cue of recording) {
    const time = (cue.step + 1) * SIM_DT;
    if (cue.rollHeld !== undefined && cue.rollHeld !== roll) {
      roll = cue.rollHeld;
      tape.push({ time, code: 'KeyS', action: 'roll', down: roll });
    }
    if (cue.directionEvents !== undefined) for (const e of cue.directionEvents) direction(e.dir, e.down, time - e.age);
    else if (cue.move !== undefined && cue.move !== move) {
      if (move) direction(move as -1 | 1, false, time);
      if (cue.move) direction(cue.move, true, time);
    }
    if (cue.move !== undefined) move = cue.move;
    if (cue.jumpPressed) {
      if (jump) tape.push({ time, code: 'Space', action: 'jump', down: false });
      tape.push({ time, code: 'Space', action: 'jump', down: true });
      jump = true;
    }
    if (cue.jumpHeld === false && jump) {
      tape.push({ time, code: 'Space', action: 'jump', down: false });
      jump = false;
    }
    if (cue.dash) {
      tape.push({ time, code: 'ShiftLeft', action: 'dash', down: true }, { time, code: 'ShiftLeft', action: 'dash', down: false });
    }
  }
  return tape.sort((a, b) => a.time - b.time);
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
