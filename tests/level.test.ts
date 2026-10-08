import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { LEVEL1 } from '../src/level/level1';
import { estimateRouteTime, paradeLead, validateLink } from '../src/level/validate';

describe('level 1 route reachability (measured with the real controller)', () => {
  for (const link of LEVEL1.route) {
    const a = LEVEL1.platforms[link.from];
    const b = LEVEL1.platforms[link.to];
    it(`normal route: ${a.kind}#${a.id} → ${b.kind}#${b.id} via ${link.move}${link.note ? ` (${link.note})` : ''}`, () => {
      const r = validateLink(LEVEL1, MOVEMENT, link, 2, a.x0 > LEVEL1.parade.triggerX);
      expect(r.successes, `only ${r.successes} takeoff points succeeded (${r.tried} tried)`).toBeGreaterThanOrEqual(2);
      expect(r.widestWindow, `takeoff windows: ${JSON.stringify(r.takeoffWindows)}`).toBeGreaterThanOrEqual(link.note?.startsWith('recovery') ? 12 : 18);
      expect(r.outcomes.every(o => Number.isFinite(o.landVx) && o.landingRoom >= -MOVEMENT.width / 2)).toBe(true);
    });
  }
  for (const link of LEVEL1.express) {
    const a = LEVEL1.platforms[link.from];
    const b = LEVEL1.platforms[link.to];
    it(`express: ${a.kind}#${a.id} → ${b.kind}#${b.id} via ${link.move}`, () => {
      const r = validateLink(LEVEL1, MOVEMENT, link, 1, true);
      expect(r.ok, `${r.tried} strategies tried`).toBe(true);
      expect(r.widestWindow).toBeGreaterThanOrEqual(12);
    });
  }
});

describe('level 1 structure', () => {
  it('reports an estimated plain-speed route time (informational)', () => {
    const main = LEVEL1.route.filter((l) => !l.note?.startsWith('recovery'));
    const t = estimateRouteTime(LEVEL1, MOVEMENT, main);
    console.log(`Estimated normal-route time at plain run speed: ${t.toFixed(1)} s`);
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(200);
  });

  it('reveals the petal bridge before a max-speed player can reach it', () => {
    const lead = paradeLead(LEVEL1);
    expect(lead).toBeGreaterThan(LEVEL1.parade.bridgeSolidAt * MOVEMENT.maxHorizontalSpeed);
  });

  it('places all three melody fragments over the normal route', () => {
    expect(LEVEL1.fragments).toHaveLength(3);
    const routeIds = new Set(LEVEL1.route.flatMap((l) => [l.from, l.to]));
    for (const f of LEVEL1.fragments) {
      const under = LEVEL1.platforms.find((p) => routeIds.has(p.id) && !p.recovery && f.x >= p.x0 && f.x <= p.x1 && f.y > p.top && f.y - p.top < 40);
      expect(under, `fragment at ${f.x},${f.y}`).toBeTruthy();
    }
  });

  it('normal route is a connected chain from the start to the goal flower', () => {
    const main = LEVEL1.route.filter((l) => !l.note?.startsWith('recovery'));
    const start = LEVEL1.platforms.find((p) => LEVEL1.start.x >= p.x0 && LEVEL1.start.x <= p.x1 && p.top === LEVEL1.start.y)!;
    let cur = start.id;
    for (const l of main) {
      expect(l.from).toBe(cur);
      cur = l.to;
    }
    const goal = LEVEL1.platforms[cur];
    expect(goal.kind).toBe('flower');
    expect(LEVEL1.goal.x0).toBeGreaterThanOrEqual(goal.x0);
    expect(LEVEL1.goal.x1).toBeLessThanOrEqual(goal.x1);
  });
});
