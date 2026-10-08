import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT, type MovementConfig } from '../src/config/movement';
import { FixedLoop } from '../src/core/FixedLoop';
import { Input } from '../src/input/Input';
import type { TerrainDef } from '../src/level/types';
import { blocked, surfaceContact, type Solid } from '../src/sim/collision';
import { Player, type PlayerEvent } from '../src/sim/Player';
import { terrainSupport, terrainToSolid } from '../src/sim/terrain';
import { box, floor, input, makePlayer, run, steps } from './helpers';

const bowl = (depth = 60, pump = true): TerrainDef => ({
  id: 901, kind: 'island', bottom: -40, pump,
  knots: [{ x: -120, y: depth, slope: -depth / 60 }, { x: 0, y: 0, slope: 0 }, { x: 120, y: depth, slope: depth / 60 }],
});
const isolated: MovementConfig = { ...MOVEMENT, rollAccel: 0, rollResistance: 0, rollGravity: 0 };

function on(solid: Solid, x: number, speed: number, cfg = MOVEMENT): Player {
  const p = new Player(cfg);
  p.reset(x, terrainSupport(solid.terrain!, x - cfg.width / 2, x + cfg.width / 2)!.y);
  p.grounded = true;
  const contact = surfaceContact([solid], p)!;
  p.vx = speed * contact.tangent.x;
  return p;
}

function crossing(dir: -1 | 1 = 1): number {
  const solid = terrainToSolid(bowl());
  const p = on(solid, -dir * 75, dir * 150, isolated);
  for (let n = 0; n < 200; n++) {
    const before = p.x;
    p.step(SIM_DT, input({ rollHeld: true, move: dir }), [solid], []);
    if (before * dir < 0 && p.x * dir >= 0) return n * SIM_DT + (-before / (p.x - before)) * SIM_DT;
  }
  throw new Error('Fixture did not cross the minimum');
}

function pulse(offset: number, dir: -1 | 1 = 1, fps = 60, spam = false, releaseDuration = 0.03) {
  const solid = terrainToSolid(bowl());
  const p = on(solid, -dir * 75, dir * 150, isolated);
  const press = crossing(dir) + offset;
  const release = press - releaseDuration;
  const keyboard = new Input();
  const code = dir > 0 ? 'KeyD' : 'KeyA';
  const action = dir > 0 ? 'right' : 'left';
  const edges = [{ t: 0, down: true }, { t: release, down: false }, { t: press, down: true }];
  if (spam) for (let t = press + 0.03; t < 0.95; t += 0.04) edges.push({ t, down: false }, { t: t + 0.015, down: true });
  edges.sort((a, b) => a.t - b.t);
  keyboard.press('KeyS', 'roll', 0);
  let edge = 0;
  let n = 0;
  const events: PlayerEvent[] = [];
  const deliveries: number[] = [];
  let rewarded = false;
  const loop = new FixedLoop(SIM_DT);
  let renderTime = 0;
  // Physical events arrive in render-frame batches, including events later
  // than the first fixed-step boundary of a 30fps catch-up frame.
  while (n < 66) {
    renderTime += 1 / fps;
    while (edge < edges.length && edges[edge].t <= renderTime + 1e-9) {
      const e = edges[edge++];
      if (e.down) keyboard.press(code, action, e.t * 1000);
      else keyboard.release(code, action, e.t * 1000);
    }
    loop.advance(1 / fps, () => {
    if (n >= 66) return;
    const time = ++n * SIM_DT;
    p.step(SIM_DT, keyboard.sample(!p.grounded, dir, time * 1000, p.rolling), [solid], []);
    events.push(...p.events);
    if (p.events.some((e) => e.type === 'pump')) rewarded = true;
    if (rewarded && deliveries.length < 8) deliveries.push(p.surface ? Math.abs(p.vx / p.surface.tangent.x) : Math.abs(p.vx));
    expect(blocked([solid], p.x, p.y, p.w, p.h)).toBe(false);
  });
  }
  return { p, events, deliveries, state: [p.x, p.y, p.vx, p.vy, p.rollAngle, p.dashCharges, p.pumpResult] };
}

describe('hold curl and ordinary momentum', () => {
  it('enters with a smaller anchored box and no arbitrary momentum', () => {
    const p = makePlayer();
    p.vx = 225;
    p.step(SIM_DT, input({ rollHeld: true }), [floor()], []);
    expect(p.rolling).toBe(true);
    expect(p.h).toBe(12);
    expect(p.w).toBe(10);
    expect(p.y).toBe(0);
    expect(p.vx).toBeCloseTo(224.8);
    expect(p.events.filter((e) => e.type === 'curl')).toHaveLength(1);
    expect(p.rollAngle).toBeGreaterThan(0);
  });

  it('drives toward 230 while retaining earned overspeed rather than clamping to target', () => {
    const ordinary = makePlayer();
    run(ordinary, [floor()], steps(1.2), input({ rollHeld: true, move: 1 }));
    expect(ordinary.vx).toBeGreaterThan(229);
    expect(ordinary.vx).toBeLessThanOrEqual(230);
    const fast = makePlayer();
    fast.vx = 280;
    run(fast, [floor()], steps(0.5), input({ rollHeld: true, move: 1 }));
    expect(fast.vx).toBeCloseTo(274);
  });

  it('coasts gently and brakes progressively without creating a reverse impulse', () => {
    const coast = makePlayer();
    coast.vx = 225;
    run(coast, [floor()], steps(0.3), input({ rollHeld: true }));
    expect(coast.x).toBeGreaterThan(65);
    expect(coast.vx).toBeGreaterThan(221);
    const brake = makePlayer();
    brake.vx = 225;
    run(brake, [floor()], steps(0.2), input({ rollHeld: true, move: -1 }));
    expect(brake.vx).toBeGreaterThan(80);
    expect(brake.vx).toBeLessThan(100);
    run(brake, [floor()], steps(0.2), input({ rollHeld: true, move: -1 }));
    expect(brake.vx).toBeLessThanOrEqual(0);
    expect(brake.vx).toBeGreaterThan(-15);
  });

  it('stays curled under a low ceiling, remains steerable, and stands only after clearance', () => {
    const p = makePlayer();
    const solids = [floor(), box(-20, 14, 40, 10)];
    p.vx = 132;
    p.step(SIM_DT, input({ rollHeld: true, move: 1 }), solids, []);
    let uncurl = 0;
    for (let n = 0; n < 30; n++) {
      p.step(SIM_DT, input({ move: 1 }), solids, []);
      expect(p.y).toBe(0);
      expect(blocked(solids, p.x, p.y, p.w, p.h)).toBe(false);
      if (p.x < 25) expect(p.rolling).toBe(true);
      uncurl += p.events.filter((e) => e.type === 'uncurl').length;
    }
    expect(p.rolling).toBe(false);
    expect(p.h).toBe(22);
    expect(uncurl).toBe(1);
  });

  it('curl intent works in air, dash landing preserves speed and restores one dash', () => {
    const p = makePlayer(0, 3);
    p.grounded = false;
    p.vx = 132;
    p.vy = -150;
    for (let n = 0; n < 10 && !p.grounded; n++) p.step(SIM_DT, input({ rollHeld: true, move: 1, dash: n === 0 ? 1 : 0 }), [floor()], []);
    expect(p.rolling).toBe(true);
    expect(p.grounded).toBe(true);
    expect(p.vx).toBe(225);
    expect(p.dashCharges).toBe(1);
    expect(p.dashing).toBe(false);
  });

  it('buffered rolling cloud rebound takes off on contact, preserving speed and dash refill', () => {
    const cloud = box(-20, -8, 200, 8, 'cloud', true);
    const p = makePlayer(0, 1);
    p.grounded = false;
    p.vx = 225;
    p.vy = -200;
    p.dashCharges = 0;
    p.step(SIM_DT, input({ rollHeld: true, move: 1, jumpPressed: true, jumpHeld: true }), [cloud], []);
    expect(p.events.map((e) => e.type)).toEqual(['curl', 'land', 'jump']);
    expect(p.grounded).toBe(false);
    expect(p.vy).toBe(302);
    expect(p.vx).toBeGreaterThan(224);
    expect(p.dashCharges).toBe(1);
    p.step(SIM_DT, input({ rollHeld: true, dash: 1 }), [cloud], []);
    expect(p.dashing).toBe(true);
    expect(p.dashCharges).toBe(0);
  });

  it('roll spring contact retains the ordinary spring and late-boost rules', () => {
    const p = makePlayer(83);
    p.vx = 225;
    const spring = { ...box(90, 8, 18, 4, 'spring', true), spring: 0 };
    p.step(SIM_DT, input({ rollHeld: true, move: 1 }), [floor(), spring], []);
    expect(p.vy).toBe(420);
    expect(p.rolling).toBe(true);
    p.step(SIM_DT, input({ rollHeld: true, jumpPressed: true, jumpHeld: true }), [floor(), spring], []);
    expect(p.events.some((e) => e.type === 'springBoost')).toBe(true);
  });

  it('reset clears roll intent, rotation, timing and reward feedback', () => {
    const p = pulse(0).p;
    p.reset(10, 20);
    expect(p.rolling).toBe(false);
    expect(p.rollAngle).toBe(0);
    expect(p.pumpResult).toBe('none');
    expect(p.surface).toBeNull();
    expect(p.events).toEqual([]);
  });
});

describe('real tangent traversal and takeoff', () => {
  it('gravity speeds downhill travel and slows uphill travel in both world directions', () => {
    const solid = terrainToSolid(bowl());
    for (const dir of [-1, 1] as const) {
      const down = on(solid, -dir * 80, dir * 150);
      down.step(SIM_DT, input({ rollHeld: true }), [solid], []);
      expect(Math.abs(down.vx / down.surface!.tangent.x)).toBeGreaterThan(155);
      const up = on(solid, dir * 80, dir * 150);
      up.step(SIM_DT, input({ rollHeld: true }), [solid], []);
      expect(Math.abs(up.vx / up.surface!.tangent.x)).toBeLessThan(145);
    }
  });

  it('bounded rolling and rotation follow the real travelled path without overlap', () => {
    const solid = terrainToSolid(bowl(120));
    const p = on(solid, -100, 295);
    for (let n = 0; n < 50 && p.grounded; n++) {
      p.step(SIM_DT, input({ rollHeld: true, move: 1 }), [solid], []);
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(300);
      if (p.surface) expect(Math.abs(p.vx / p.surface.tangent.x)).toBeLessThanOrEqual(300.000001);
      expect(blocked([solid], p.x, p.y, p.w, p.h)).toBe(false);
    }
    expect(p.rollAngle).toBeGreaterThan(10);
  });

  it.each([-1, 1] as const)('roll jump has modest signed slope influence in direction %s', (dir) => {
    const solid = terrainToSolid(bowl());
    const up = on(solid, dir * 70, dir * 225);
    const vx = up.vx;
    up.step(SIM_DT, input({ rollHeld: true, jumpPressed: true, jumpHeld: true, move: dir }), [solid], []);
    expect(up.vx * dir).toBeGreaterThan(Math.abs(vx) - 1);
    expect(up.vy).toBeGreaterThan(302);
    expect(up.vy).toBeLessThanOrEqual(362);
    expect(up.surface).toBeNull();
    const down = on(solid, -dir * 70, dir * 225);
    down.step(SIM_DT, input({ rollHeld: true, jumpPressed: true, jumpHeld: true, move: dir }), [solid], []);
    expect(down.vy).toBeLessThan(302);
    expect(down.vy).toBeGreaterThan(220);
  });

  it('fast convex terrain releases naturally, conserving the takeoff tangent and allowing dash', () => {
    const def: TerrainDef = { id: 902, kind: 'island', bottom: -40, knots: [{ x: 0, y: 0, slope: 1 }, { x: 100, y: 0, slope: -1 }] };
    const solid = terrainToSolid(def);
    const p = on(solid, 35, 300);
    p.step(SIM_DT, input({ rollHeld: true }), [solid], []);
    expect(p.grounded).toBe(false);
    expect(p.events.some((e) => e.type === 'launch')).toBe(true);
    expect(p.vy).toBeGreaterThan(0);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(300);
    expect(blocked([solid], p.x, p.y, p.w, p.h)).toBe(false);
    p.step(SIM_DT, input({ rollHeld: true, dash: 1 }), [solid], []);
    expect(p.dashing).toBe(true);
    expect(p.dashCharges).toBe(0);
  });
});

describe('directional valley pumping', () => {
  it.each([-0.04, 0, 0.04])('awards perfect for a physical pulse %ss around the minimum', (offset) => {
    const result = pulse(offset);
    expect(result.events.filter((e) => e.type === 'pump').map((e) => e.quality)).toEqual(['perfect']);
    expect(result.events.some((e) => e.type === 'dash')).toBe(false);
    expect(result.deliveries[0]).toBeCloseTo(150, 7);
    expect(result.deliveries[1]).toBeCloseTo(150 + 16 / 6, 7);
    expect(result.deliveries[6]).toBeCloseTo(166, 7);
    expect(result.deliveries[7]).toBeCloseTo(166, 7);
  });

  it.each([-0.08, 0.08])('awards good with exactly eight delivered speed for offset %ss', (offset) => {
    const result = pulse(offset);
    expect(result.events.filter((e) => e.type === 'pump').map((e) => e.quality)).toEqual(['good']);
    expect(result.deliveries[6]).toBeCloseTo(158, 7);
  });

  it.each([-0.14, 0.14])('missed timing %ss leaves ordinary movement untouched', (offset) => {
    const result = pulse(offset);
    expect(result.events.filter((e) => e.type === 'pump')).toEqual([]);
    expect(result.p.vx / result.p.surface!.tangent.x).toBeCloseTo(150, 7);
  });

  it('repeated pulses earn only one finite reward in the complete valley traversal', () => {
    const result = pulse(0, 1, 60, true);
    expect(result.events.filter((e) => e.type === 'pump')).toHaveLength(1);
    expect(result.p.vx / result.p.surface!.tangent.x).toBeCloseTo(166, 7);
  });

  it('leftward traversal uses the same direction-relative timing and reward', () => {
    const result = pulse(-0.04, -1);
    expect(result.events.filter((e) => e.type === 'pump').map((e) => e.quality)).toEqual(['perfect']);
    expect(result.deliveries[6]).toBeCloseTo(166, 7);
    expect(result.p.vx).toBeLessThan(0);
  });

  it('physical timestamp tapes produce exact equal results at 30/60/144 render fps', () => {
    const a = pulse(-0.049, 1, 30);
    const b = pulse(-0.049, 1, 60);
    const c = pulse(-0.049, 1, 144);
    expect(a.state).toEqual(b.state);
    expect(c.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(c.events).toEqual(b.events);
  });

  it.each([-0.11, -0.050001, -0.05, 0.05, 0.050001, 0.11, -0.110001, 0.110001])('resolves the explicit window boundary at %ss', (offset) => {
    const result = pulse(offset);
    const timing = Math.abs(offset);
    const expected = timing <= 0.05 ? ['perfect'] : timing <= 0.11 ? ['good'] : [];
    expect(result.events.filter((e) => e.type === 'pump').map((e) => e.quality)).toEqual(expected);
  });

  it('same-step release and repress four ms apart produce one physical perfect pump', () => {
    const a = pulse(-0.025, 1, 30, false, 0.004);
    const b = pulse(-0.025, 1, 144, false, 0.004);
    expect(a.state).toEqual(b.state);
    expect(a.events.filter((e) => e.type === 'pump').map((e) => e.quality)).toEqual(['perfect']);
    expect(a.events).toEqual(b.events);
  });

  it('directly authored input frames retain genuine release/repress edge fallback', () => {
    const solid = terrainToSolid(bowl());
    const p = on(solid, -75, 150, isolated);
    let count = 0;
    for (let n = 0; n < 60; n++) {
      const move = p.x > -12 && p.x < -4 ? 0 : 1;
      p.step(SIM_DT, input({ rollHeld: true, move }), [solid], []);
      count += p.events.filter((e) => e.type === 'pump').length;
    }
    expect(count).toBe(1);
    expect(p.pumpResult).toBe('perfect');
  });

  it.each(['held', 'repeat', 'backward'] as const)('a %s direction cannot manufacture a forward pulse', (kind) => {
    const solid = terrainToSolid(bowl());
    const p = on(solid, -75, 150, isolated);
    let count = 0;
    for (let n = 0; n < 60; n++) {
      const move = kind === 'backward' && p.x > -15 ? (n % 2 ? -1 : 0) : 1;
      const directionEvents = kind === 'repeat' ? [{ dir: 1 as const, down: true, age: 0 }] : undefined;
      p.step(SIM_DT, input({ rollHeld: true, move, directionEvents }), [solid], []);
      count += p.events.filter((e) => e.type === 'pump').length;
    }
    expect(count).toBe(0);
  });

  it.each([40, 150])('rearms only after genuinely leaving the whole valley (turn at x=%s)', (turnX) => {
    const solid = terrainToSolid(bowl());
    const solids = [solid, box(-600, -40, 480, 100), box(120, -40, 480, 100)];
    const p = on(solid, -75, 150, { ...isolated, rollAccel: 260 });
    let direction: -1 | 1 = 1;
    let released = false;
    let pressed = false;
    let turned = false;
    const rewards: PlayerEvent[] = [];
    for (let n = 0; n < 400; n++) {
      if (!turned && p.x >= turnX) { direction = -1; released = false; pressed = false; turned = true; }
      const incoming = direction === 1 ? p.x < 0 : p.x > 0;
      if (incoming && Math.sign(p.vx) === direction && Math.abs(p.x) < 12 && !pressed) released = true;
      if (released && Math.abs(p.x) < 4) pressed = true;
      p.step(SIM_DT, input({ rollHeld: true, move: released && !pressed ? 0 : direction }), solids, []);
      rewards.push(...p.events.filter((e) => e.type === 'pump'));
      expect(blocked(solids, p.x, p.y, p.w, p.h)).toBe(false);
      if (turned && p.x < -50) break;
    }
    expect(rewards).toHaveLength(turnX === 40 ? 1 : 2);
  });

  it.each(['flat', 'tiny', 'unauthored', 'stationary', 'airborne'] as const)('cannot reward %s input spam', (kind) => {
    const solid = kind === 'flat' ? floor() : terrainToSolid(bowl(kind === 'tiny' ? 1 : 60, kind !== 'unauthored'));
    const p = kind === 'flat' ? makePlayer() : on(solid, -75, kind === 'stationary' ? 0 : 150, isolated);
    if (kind === 'airborne') { p.grounded = false; p.y += 100; p.vy = 100; }
    let pumps = 0;
    for (let n = 0; n < 50; n++) {
      p.step(SIM_DT, input({ rollHeld: true, move: n % 2 ? 0 : 1 }), [solid], []);
      pumps += p.events.filter((e) => e.type === 'pump').length;
    }
    expect(pumps).toBe(0);
  });
});
