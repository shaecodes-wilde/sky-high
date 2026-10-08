import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/config/movement';
import { Input } from '../src/input/Input';

describe('curl input ownership', () => {
  it('holds either Down or S and releases only after both bindings are up', () => {
    const input = new Input();
    expect(input.actionFor('KeyS')).toBe('roll');
    expect(input.actionFor('ArrowDown')).toBe('roll');
    input.press('KeyS', 'roll', 0);
    input.press('ArrowDown', 'roll', 1);
    expect(input.sample(false, 1, 2).rollHeld).toBe(true);
    input.release('KeyS', 'roll', 3);
    expect(input.sample(false, 1, 4, true).rollHeld).toBe(true);
    input.release('ArrowDown', 'roll', 5);
    expect(input.sample(false, 1, 6, true).rollHeld).toBe(false);
  });

  it('preserves ordered physical release/repress timestamps within a step', () => {
    const input = new Input();
    input.press('KeyD', 'right', 0);
    input.sample(false, 1, 1, true);
    input.release('KeyD', 'right', 10);
    input.press('KeyD', 'right', 14);
    const frame = input.sample(false, 1, 16, true);
    expect(frame.directionReleased).toBe(1);
    expect(frame.directionPressed).toBe(1);
    expect(frame.directionEvents).toEqual([{ dir: 1, down: false, age: 0.006 }, { dir: 1, down: true, age: 0.002 }]);
    expect(frame.dash).toBe(0);
    expect(input.sample(false, 1, 32, true).directionEvents).toEqual([]);
  });

  it('an alternate binding cannot forge a physical directional release', () => {
    const input = new Input();
    input.press('KeyD', 'right', 0);
    input.sample(false, 1, 1, true);
    input.press('ArrowRight', 'right', 5);
    input.release('KeyD', 'right', 8);
    input.press('KeyD', 'right', 10);
    expect(input.sample(false, 1, 16, true).directionEvents).toEqual([]);
    input.release('ArrowRight', 'right', 20);
    input.release('KeyD', 'right', 22);
    expect(input.sample(false, 1, 24, true).directionEvents).toEqual([{ dir: 1, down: false, age: 0.002 }]);
  });

  it('a grounded rolling pulse cannot seed the first airborne dash tap', () => {
    const input = new Input();
    input.press('KeyD', 'right', 0);
    input.release('KeyD', 'right', 40);
    input.press('KeyD', 'right', 100);
    input.sample(false, 1, 105, true);
    input.release('KeyD', 'right', 115);
    input.press('KeyD', 'right', 150);
    expect(input.sample(true, 1, 155, true).dash).toBe(0);
    input.release('KeyD', 'right', 175);
    input.press('KeyD', 'right', 200);
    expect(input.sample(true, 1, 205, true).dash).toBe(1);
  });

  it('first-frame curl intent consumes existing ordinary tap history before takeoff', () => {
    const input = new Input();
    input.press('KeyD', 'right', 0);
    input.release('KeyD', 'right', 30);
    input.sample(false, 1, 35);
    input.press('KeyD', 'right', 80);
    input.press('KeyS', 'roll', 85);
    expect(input.sample(false, 1, 90).dash).toBe(0);
    input.release('KeyD', 'right', 100);
    input.press('KeyD', 'right', 120);
    expect(input.sample(true, 1, 125, true).dash).toBe(0);
  });

  it('explicit Shift remains available immediately after a rolling launch', () => {
    const input = new Input();
    input.press('KeyS', 'roll', 0);
    input.press('KeyD', 'right', 0);
    input.sample(false, 1, 1, true);
    input.press('ShiftLeft', 'dash', 10);
    expect(input.sample(true, 1, 16, true).dash).toBe(1);
  });

  it('ordinary grounded tap and airborne double-tap behavior remain unchanged', () => {
    const input = new Input();
    input.press('KeyA', 'left', 0);
    input.release('KeyA', 'left', 40);
    input.sample(false, -1, 45);
    input.press('KeyA', 'left', 120);
    expect(input.sample(true, -1, 125).dash).toBe(-1);
  });

  it('bounds old event ages, and reset clears roll plus directional edges', () => {
    const input = new Input();
    input.press('KeyS', 'roll', 0);
    input.press('KeyD', 'right', 0);
    expect(input.sample(false, 1, 100, true).directionEvents?.[0].age).toBe(SIM_DT);
    input.reset();
    const frame = input.sample(true, 1, 120);
    expect(frame.rollHeld).toBe(false);
    expect(frame.move).toBe(0);
    expect(frame.directionEvents).toEqual([]);
  });

  it('catch-up samples retain future edges and do not let a future curl steal an ordinary tap', () => {
    const input = new Input();
    input.press('KeyD', 'right', 0);
    input.release('KeyD', 'right', 5);
    input.press('KeyD', 'right', 20);
    input.press('KeyS', 'roll', 30);
    const first = input.sample(false, 1, 16);
    expect(first.move).toBe(0);
    expect(first.rollHeld).toBe(false);
    expect(first.directionEvents?.map((e) => e.down)).toEqual([true, false]);
    const second = input.sample(true, 1, 24);
    expect(second.dash).toBe(1);
    expect(second.rollHeld).toBe(false);
    expect(input.sample(true, 1, 32).rollHeld).toBe(true);
  });
});
