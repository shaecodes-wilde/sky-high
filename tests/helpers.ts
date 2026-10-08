import { MOVEMENT, SIM_DT, type MovementConfig } from '../src/config/movement';
import type { Solid, SolidKind } from '../src/sim/collision';
import { Player, type InputFrame } from '../src/sim/Player';

let nextId = 1000;

export function box(x: number, y: number, w: number, h: number, kind: SolidKind = 'island', oneWay = false): Solid {
  return { id: nextId++, kind, x, y, w, h, oneWay, active: true };
}

/** A long flat floor with its top at y = 0. */
export function floor(x0 = -2000, x1 = 6000): Solid {
  return box(x0, -50, x1 - x0, 50);
}

export function input(p: Partial<InputFrame> = {}): InputFrame {
  return { move: 0, jumpHeld: false, jumpPressed: false, dash: 0, ...p };
}

export function makePlayer(x = 0, y = 0, cfg: MovementConfig = MOVEMENT): Player {
  const p = new Player(cfg);
  p.reset(x, y, 1);
  p.grounded = y === 0;
  return p;
}

export function run(p: Player, solids: Solid[], steps: number, inp: InputFrame | ((i: number) => InputFrame)): void {
  for (let i = 0; i < steps; i++) p.step(SIM_DT, typeof inp === 'function' ? inp(i) : inp, solids, []);
}

export const steps = (seconds: number) => Math.round(seconds / SIM_DT);
