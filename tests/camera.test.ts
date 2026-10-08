import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/config/movement';
import { CameraRig, VIEW_H, VIEW_W } from '../src/render/CameraRig';

describe('movement camera', () => {
  it.each([132, 225, 300])('keeps forward visibility at %i px/s without pixel jitter at rest', (vx) => {
    const c = new CameraRig(-10000, 10000, -10000);
    let x = 0; c.snapTo(x, 64, 1);
    for (let i = 0; i < 240; i++) { x += vx * SIM_DT; c.step(SIM_DT, x, 64, vx, 1, true); }
    expect(c.x + VIEW_W / 2 - x).toBeGreaterThan(275);
    expect(Math.abs(c.x - c.prevX)).toBeLessThanOrEqual(vx * SIM_DT + 0.01);
    for (let i = 0; i < 600; i++) c.step(SIM_DT, x, 64, 0, 1, true);
    expect(Math.round(c.x)).toBe(Math.round(c.prevX));
  });
  it('keeps boosted ascent and terminal falls inside the frame', () => {
    const c = new CameraRig(-10000, 10000, -10000);
    let y = 64; let vy = 525; c.snapTo(0, y, 1);
    for (let i = 0; i < 150; i++) {
      vy = Math.max(-340, vy - (vy > 0 ? 880 : 1250) * SIM_DT);
      y += vy * SIM_DT; c.step(SIM_DT, i * 5, y, 300, 1, false, vy);
      expect(y).toBeGreaterThanOrEqual(c.y - VIEW_H / 2 + 29);
      expect(y + 32).toBeLessThanOrEqual(c.y + VIEW_H / 2 - 29);
    }
  });
  it('shows a fall to the real recovery/death boundary with the gameplay lower bound', () => {
    const killY = -80;
    const c = new CameraRig(-220, 6900, killY + VIEW_H / 2 - 30);
    let y = 64; c.snapTo(6030, y, 1);
    while (y >= killY) {
      c.step(SIM_DT, 6030, y, 0, 1, false, -340);
      expect(y).toBeGreaterThanOrEqual(c.y - VIEW_H / 2 + 29);
      y -= 340 * SIM_DT;
    }
  });
});
