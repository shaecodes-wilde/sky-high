import { describe, expect, it } from 'vitest';
import { Input } from '../src/input/Input';

const make = () => {
  const i = new Input();
  i.doubleTapMs = 220;
  return i;
};

describe('double-tap dash', () => {
  it('needs two fresh presses separated by a release, with the second in the air', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 60);
    inp.press('KeyD', 'right', 120);
    expect(inp.sample(true, 1, 125).dash).toBe(1);
  });

  it('ignores OS key repeat (no release between presses)', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.press('KeyD', 'right', 30); // repeat: already held
    inp.press('KeyD', 'right', 60);
    expect(inp.sample(true, 1, 65).dash).toBe(0);
  });

  it('does not dash when the second tap happens on the ground', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 50);
    inp.press('KeyD', 'right', 100);
    expect(inp.sample(false, 1, 105).dash).toBe(0);
  });

  it('accepts a first tap just before takeoff and the second in the air', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 40);
    expect(inp.sample(false, 1, 45).dash).toBe(0); // still on the ground
    inp.press('KeyD', 'right', 150);
    expect(inp.sample(true, 1, 155).dash).toBe(1);
  });

  it('expires stale taps outside the window', () => {
    const inp = make();
    inp.press('KeyA', 'left', 0);
    inp.release('KeyA', 'left', 40);
    inp.sample(true, -1, 50);
    inp.press('KeyA', 'left', 400);
    expect(inp.sample(true, -1, 405).dash).toBe(0);
  });

  it('treats A and ArrowLeft as one direction (no false double-tap while both held)', () => {
    const inp = make();
    inp.press('KeyA', 'left', 0);
    inp.press('ArrowLeft', 'left', 50);
    expect(inp.sample(true, -1, 55).dash).toBe(0);
  });

  it('reset() clears tap state, held keys and buffered presses', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 40);
    inp.reset();
    inp.press('KeyD', 'right', 100);
    const f = inp.sample(true, 1, 105);
    expect(f.dash).toBe(0);
    expect(f.move).toBe(1);
    inp.reset();
    expect(inp.sample(true, 1, 200).move).toBe(0);
  });

  it('uses physical press timestamps when a valid second tap is queued in a slow frame', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 50);
    inp.sample(true, 1, 60);
    inp.press('KeyD', 'right', 210);
    expect(inp.sample(true, 1, 240).dash).toBe(1);
  });

  it('a fast direction change starts a new tap sequence instead of dashing on a turn back', () => {
    const inp = make();
    inp.press('KeyD', 'right', 0);
    inp.release('KeyD', 'right', 40);
    inp.press('KeyA', 'left', 60);
    inp.release('KeyA', 'left', 80);
    inp.press('KeyD', 'right', 100);
    expect(inp.sample(true, 1, 110).dash).toBe(0);
    inp.release('KeyD', 'right', 120);
    inp.press('KeyD', 'right', 160);
    expect(inp.sample(true, 1, 170).dash).toBe(1);
  });
});

describe('other input', () => {
  it('the dash key uses the held direction, else facing', () => {
    const inp = make();
    inp.press('ShiftLeft', 'dash', 0);
    expect(inp.sample(true, -1, 1).dash).toBe(-1);
    inp.press('KeyD', 'right', 10);
    inp.release('ShiftLeft', 'dash', 11);
    inp.press('ShiftLeft', 'dash', 12);
    expect(inp.sample(true, -1, 13).dash).toBe(1);
  });

  it('reports a jump press once while the hold persists', () => {
    const inp = make();
    inp.press('Space', 'jump', 0);
    const a = inp.sample(false, 1, 1);
    const b = inp.sample(false, 1, 17);
    expect(a.jumpPressed).toBe(true);
    expect(b.jumpPressed).toBe(false);
    expect(b.jumpHeld).toBe(true);
    inp.release('Space', 'jump', 30);
    expect(inp.sample(false, 1, 33).jumpHeld).toBe(false);
  });

  it('the most recently pressed direction wins', () => {
    const inp = make();
    inp.press('KeyA', 'left', 0);
    inp.press('KeyD', 'right', 10);
    expect(inp.sample(false, 1, 11).move).toBe(1);
    inp.release('KeyD', 'right', 20);
    expect(inp.sample(false, 1, 21).move).toBe(-1);
  });

  it('keeps the dash press direction when movement changes later in the same batch', () => {
    const inp = make();
    inp.press('KeyA', 'left', 0);
    inp.press('ShiftLeft', 'dash', 10);
    inp.press('KeyD', 'right', 12);
    const frame = inp.sample(true, 1, 16);
    expect(frame.dash).toBe(-1);
    expect(frame.move).toBe(1);
  });

  it('holding the dash action, including its alternate binding, never repeats a command', () => {
    const inp = make();
    inp.press('ShiftLeft', 'dash', 0);
    expect(inp.sample(true, 1, 1).dash).toBe(1);
    inp.press('ShiftLeft', 'dash', 10);
    inp.press('ShiftRight', 'dash', 12);
    for (let t = 16; t < 500; t += 16) expect(inp.sample(true, 1, t).dash).toBe(0);
    inp.release('ShiftLeft', 'dash', 500);
    inp.press('ShiftLeft', 'dash', 501);
    expect(inp.sample(true, 1, 502).dash).toBe(0);
    inp.release('ShiftLeft', 'dash', 510);
    inp.release('ShiftRight', 'dash', 511);
    inp.press('ShiftRight', 'dash', 520);
    expect(inp.sample(true, -1, 521).dash).toBe(-1);
  });
});
