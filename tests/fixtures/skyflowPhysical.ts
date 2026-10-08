import { SIM_DT, MOVEMENT } from '../../src/config/movement';
import type { Action } from '../../src/config/keys';
import { Input } from '../../src/input/Input';
import type { PhysicalInput } from '../../src/level/physicalTape';
import { traverse, type TraversalInput } from '../../src/level/traversal';
import type { LevelData } from '../../src/level/types';

/** Turn policy intent into real press/release edges, then run production Input + World. */
export function physicalPolicy(level: LevelData, policy: TraversalInput) {
  const keys = new Input();
  const held = new Set<Action>();
  const tape: PhysicalInput[] = [];
  const codes: Partial<Record<Action, string>> = { right: 'KeyD', left: 'KeyA', roll: 'KeyS', jump: 'Space', dash: 'ShiftLeft' };
  const set = (action: Action, down: boolean, time: number) => {
    if (held.has(action) === down) return;
    const code = codes[action]!;
    if (down) { held.add(action); keys.press(code, action, time * 1000); }
    else { held.delete(action); keys.release(code, action, time * 1000); }
    tape.push({ time, code, action, down });
  };
  const result = traverse(level, MOVEMENT, (world, step) => {
    const frame = policy(world, step);
    const time = (step + 1) * SIM_DT;
    set('right', frame.move === 1, time);
    set('left', frame.move === -1, time);
    set('roll', frame.rollHeld === true, time);
    if (frame.jumpPressed) { set('jump', false, time); set('jump', true, time); }
    set('jump', frame.jumpHeld, time);
    if (frame.dash) { set('dash', false, time); set('dash', true, time); }
    else set('dash', false, time);
    return keys.sample(!world.player.grounded, world.player.facing, time * 1000, world.player.rolling);
  }, { maxSteps: 5400 });
  return { result, tape };
}
