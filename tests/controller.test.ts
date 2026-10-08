import { describe, expect, it } from 'vitest';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { FixedLoop } from '../src/core/FixedLoop';
import { blocked } from '../src/sim/collision';
import { box, floor, input, makePlayer, run, steps } from './helpers';

const R = MOVEMENT.runSpeed;

describe('ground movement', () => {
  it('reaches run speed in roughly 0.18–0.25 s', () => {
    const p = makePlayer();
    const solids = [floor()];
    let t = 0;
    while (p.vx < R - 1e-6 && t < 1) {
      p.step(SIM_DT, input({ move: 1 }), solids, []);
      t += SIM_DT;
    }
    expect(t).toBeGreaterThanOrEqual(0.18);
    expect(t).toBeLessThanOrEqual(0.25);
  });

  it('starts moving on the very first step', () => {
    const p = makePlayer();
    run(p, [floor()], 1, input({ move: 1 }));
    expect(p.vx).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThan(0);
  });

  it('brakes deliberately when reversing', () => {
    const p = makePlayer();
    p.vx = R;
    run(p, [floor()], steps(0.1), input({ move: -1 }));
    expect(p.vx).toBeLessThan(0);
  });

  it('keeps a landing boost and lets it decay gradually instead of snapping to run speed', () => {
    const p = makePlayer(0, 40);
    p.grounded = false;
    p.vx = 225;
    const solids = [floor()];
    let landedAt = -1;
    for (let i = 0; i < 120 && landedAt < 0; i++) {
      p.step(SIM_DT, input({ move: 1 }), solids, []);
      if (p.grounded) landedAt = i;
    }
    expect(landedAt).toBeGreaterThan(0);
    expect(p.vx).toBeGreaterThan(205); // only gentle air decay while falling
    run(p, solids, steps(0.15), input({ move: 1 }));
    expect(p.vx).toBeGreaterThan(R + 40);
    run(p, solids, steps(1.5), input({ move: 1 }));
    expect(p.vx).toBeCloseTo(R, 5);
  });

  it('bounds horizontal speed with the configured cap', () => {
    const p = makePlayer();
    p.vx = 1000;
    run(p, [floor()], 1, input({ move: 1 }));
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(MOVEMENT.maxHorizontalSpeed);
  });

  it('keeps earned speed while running forward, but stops quickly on release or reversal', () => {
    const forward = makePlayer();
    forward.vx = 225;
    run(forward, [floor()], steps(1), input({ move: 1 }));
    expect(forward.vx).toBeGreaterThan(160);
    expect(forward.vx).toBeLessThan(170);

    const released = makePlayer();
    released.vx = 225;
    run(released, [floor()], steps(0.32), input());
    expect(released.vx).toBe(0);

    const reversed = makePlayer();
    reversed.vx = 225;
    run(reversed, [floor()], steps(0.2), input({ move: -1 }));
    expect(reversed.vx).toBeLessThan(-20);
  });

  it('does not reset overspeed when running off a platform', () => {
    const p = makePlayer(0, 0);
    p.vx = 225;
    const solids = [floor(-100, 6)];
    while (p.grounded) p.step(SIM_DT, input({ move: 1 }), solids, []);
    const exit = p.vx;
    p.step(SIM_DT, input({ move: 1 }), solids, []);
    expect(exit).toBeGreaterThan(220);
    expect(p.vx).toBeGreaterThan(exit - 1);
  });

  it('coasts with neutral air input while opposite input remains an effective air brake', () => {
    const coast = makePlayer(0, 500);
    coast.vx = R;
    run(coast, [], steps(0.25), input());
    expect(coast.vx).toBeGreaterThan(120);

    const brake = makePlayer(0, 500);
    brake.vx = 225;
    run(brake, [], steps(0.1), input({ move: -1 }));
    expect(brake.vx).toBeLessThan(150);
    run(brake, [], steps(0.2), input({ move: -1 }));
    expect(brake.vx).toBeLessThan(0);
  });
});

describe('jumping', () => {
  it('allows a jump for ~100 ms after leaving an edge (coyote time)', () => {
    const ok = makePlayer(-20, 0);
    const solids = [box(-200, -50, 200, 50)];
    // Walk off the edge.
    let off = 0;
    for (let i = 0; i < 200 && ok.grounded; i++) {
      ok.step(SIM_DT, input({ move: 1 }), solids, []);
      off = i;
    }
    expect(ok.grounded).toBe(false);
    run(ok, solids, steps(0.08) - 1, input({ move: 1 }));
    run(ok, solids, 1, input({ move: 1, jumpPressed: true, jumpHeld: true }));
    expect(ok.vy).toBeGreaterThan(MOVEMENT.jumpSpeed * 0.9);
    void off;

    const late = makePlayer(-20, 0);
    while (late.grounded) late.step(SIM_DT, input({ move: 1 }), solids, []);
    run(late, solids, steps(0.12), input({ move: 1 }));
    run(late, solids, 1, input({ move: 1, jumpPressed: true, jumpHeld: true }));
    expect(late.vy).toBeLessThan(0);
  });

  it('remembers a jump pressed ~120 ms before landing (buffer), but not much earlier', () => {
    const fall = (pressBefore: number) => {
      const p = makePlayer(0, 60);
      p.grounded = false;
      const solids = [floor()];
      // Measure when it lands without input first.
      const probe = makePlayer(0, 60);
      probe.grounded = false;
      let n = 0;
      while (!probe.grounded) {
        probe.step(SIM_DT, input(), solids, []);
        n++;
      }
      const pressAt = n - Math.round(pressBefore / SIM_DT);
      let jumped = false;
      for (let i = 0; i < n + 5; i++) {
        p.step(SIM_DT, input({ jumpPressed: i === pressAt, jumpHeld: i >= pressAt }), solids, []);
        if (p.events.some((e) => e.type === 'jump')) jumped = true;
      }
      return jumped;
    };
    expect(fall(0.1)).toBe(true);
    expect(fall(0.2)).toBe(false);
  });

  it('consumes a press once: holding Space does not re-jump', () => {
    const p = makePlayer();
    const solids = [floor()];
    let jumps = 0;
    for (let i = 0; i < steps(3); i++) {
      p.step(SIM_DT, input({ jumpPressed: i === 0, jumpHeld: true }), solids, []);
      jumps += p.events.filter((e) => e.type === 'jump').length;
    }
    expect(jumps).toBe(1);
  });

  it('releasing early shortens the jump (variable height)', () => {
    const apex = (holdSteps: number) => {
      const p = makePlayer();
      let top = 0;
      run(p, [floor()], steps(1), (i) => {
        top = Math.max(top, p.y);
        return input({ jumpPressed: i === 0, jumpHeld: i < holdSteps });
      });
      return top;
    };
    const full = apex(999);
    const short = apex(4);
    expect(full).toBeGreaterThan(45);
    expect(short).toBeLessThan(full * 0.6);
  });
});

describe('air dash', () => {
  const airborne = (vx = R, vy = 0) => {
    const p = makePlayer(0, 100);
    p.grounded = false;
    p.vx = vx;
    p.vy = vy;
    return p;
  };

  it('dashes at about 1.6–1.8× run speed for ~140 ms', () => {
    const p = airborne(0);
    run(p, [], 1, input({ dash: 1 }));
    expect(p.vx / R).toBeGreaterThanOrEqual(1.6);
    expect(p.vx / R).toBeLessThanOrEqual(1.8);
    let n = 1;
    while (p.dashing) {
      p.step(SIM_DT, input(), [], []);
      n++;
    }
    expect(n * SIM_DT).toBeGreaterThan(0.12);
    expect(n * SIM_DT).toBeLessThan(0.17);
  });

  it('never launches upward and never slows a faster same-direction player', () => {
    const rising = airborne(R, 200);
    run(rising, [], 1, input({ dash: 1 }));
    expect(rising.vy).toBeLessThan(200);
    const falling = airborne(R, -200);
    run(falling, [], 1, input({ dash: 1 }));
    expect(falling.vy).toBeLessThanOrEqual(0);
    const fast = airborne(280);
    run(fast, [], 1, input({ dash: 1 }));
    expect(fast.vx).toBeGreaterThanOrEqual(279);
  });

  it('allows one dash per airtime and recharges on landing', () => {
    const p = airborne(0, 0);
    const solids = [floor()];
    run(p, solids, 1, input({ dash: 1 }));
    run(p, solids, steps(0.2), input());
    const vx = p.vx;
    run(p, solids, 1, input({ dash: -1 }));
    expect(p.dashing).toBe(false);
    expect(Math.sign(p.vx)).toBe(Math.sign(vx));
    while (!p.grounded) p.step(SIM_DT, input(), solids, []);
    expect(p.dashCharges).toBe(1);
  });

  it('does not dash on the ground (a grounded press waits briefly for takeoff)', () => {
    const p = makePlayer();
    run(p, [floor()], 1, input({ dash: 1 }));
    expect(p.dashing).toBe(false);
    run(p, [floor()], 1, input({ jumpPressed: true, jumpHeld: true }));
    run(p, [floor()], 1, input({ jumpHeld: true }));
    expect(p.dashing).toBe(true);
  });

  it('reverses cleanly when dashing against current motion', () => {
    const p = airborne(R);
    run(p, [], 1, input({ dash: -1 }));
    expect(p.vx).toBeLessThan(-R * 1.5);
    expect(p.facing).toBe(-1);
  });

  it('ends on wall impact without clipping into the wall', () => {
    const wall = box(30, 0, 20, 300);
    const p = airborne(R);
    run(p, [wall], steps(0.3), (i) => input({ dash: i === 0 ? 1 : 0, move: 1 }));
    expect(p.dashing).toBe(false);
    expect(p.x + p.w / 2).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('landing during a dash ends it and keeps the speed', () => {
    const p = airborne(R, -100);
    p.y = 2;
    const solids = [floor()];
    run(p, solids, 1, input({ dash: 1 }));
    while (!p.grounded) p.step(SIM_DT, input({ move: 1 }), solids, []);
    expect(p.dashing).toBe(false);
    expect(p.vx).toBeGreaterThan(R * 1.5);
  });

  it('answers a buffered press at the refill boundary and retains its original direction', () => {
    const p = airborne();
    p.dashCharges = 0;
    p.step(SIM_DT, input({ dash: -1, move: 1 }), [], []);
    run(p, [], steps(0.08), input({ move: 1 }));
    expect(p.dashing).toBe(false);
    expect(p.refillDash()).toBe(true);
    expect(p.resolveBufferedDash()).toBe(true);
    expect(p.dashDir).toBe(-1);
    expect(p.vx).toBeLessThan(-R * 1.5);
    expect(p.dashCharges).toBe(0);
    expect(p.resolveBufferedDash()).toBe(false);
  });

  it('retains earlier movement events when resolving a same-step refill', () => {
    const p = airborne();
    p.coyote = 0.05;
    p.dashCharges = 0;
    p.step(SIM_DT, input({ jumpPressed: true, jumpHeld: true, dash: 1 }), [], []);
    expect(p.events.map((e) => e.type)).toEqual(['jump']);
    p.refillDash();
    expect(p.resolveBufferedDash()).toBe(true);
    expect(p.events.map((e) => e.type)).toEqual(['jump', 'dash']);
  });

  it('does not answer an expired press after an unrelated later refill', () => {
    const p = airborne();
    p.dashCharges = 0;
    p.step(SIM_DT, input({ dash: 1 }), [], []);
    run(p, [], steps(0.14), input());
    p.refillDash();
    expect(p.resolveBufferedDash()).toBe(false);
    expect(p.dashCharges).toBe(1);
    expect(p.dashing).toBe(false);
  });

  it('consumes a timely request exactly once on active-dash expiry after a refill', () => {
    const p = airborne();
    p.step(SIM_DT, input({ dash: 1 }), [], []);
    p.refillDash();
    run(p, [], 4, input());
    p.step(SIM_DT, input({ dash: -1 }), [], []);
    let started = 0;
    for (let i = 0; i < 8; i++) {
      p.step(SIM_DT, input(), [], []);
      if (p.events.some((e) => e.type === 'dash')) {
        started++;
        expect(p.events.map((e) => e.type)).toEqual(['dashEnd', 'dash']);
        expect(p.dashDir).toBe(-1);
      }
    }
    expect(started).toBe(1);
    expect(p.dashCharges).toBe(0);
    run(p, [], steps(0.3), input());
    p.refillDash();
    expect(p.resolveBufferedDash()).toBe(false);
  });

  it('clears airborne dash intent on landing even when a buffered jump rebounds immediately', () => {
    const p = airborne(225, -120);
    p.y = 1;
    p.dashCharges = 0;
    p.step(SIM_DT, input({ move: 1, dash: -1, jumpPressed: true, jumpHeld: true }), [floor()], []);
    expect(p.events.map((e) => e.type)).toEqual(['land', 'jump']);
    expect(p.grounded).toBe(false);
    expect(p.vy).toBe(MOVEMENT.jumpSpeed);
    expect(p.dashCharges).toBe(1);
    expect(p.resolveBufferedDash()).toBe(false);
    p.step(SIM_DT, input({ move: 1, jumpHeld: true }), [floor()], []);
    expect(p.dashing).toBe(false);
    expect(p.vx).toBeGreaterThan(220);
  });

  it('does not turn a stale grounded press into a dash on a later jump', () => {
    const p = makePlayer();
    p.step(SIM_DT, input({ dash: 1 }), [floor()], []);
    run(p, [floor()], steps(0.14), input());
    p.step(SIM_DT, input({ jumpPressed: true, jumpHeld: true }), [floor()], []);
    expect(p.dashing).toBe(false);
    expect(p.dashCharges).toBe(1);
  });

  it('a wall cancels queued dash intent as well as the active dash', () => {
    const p = airborne();
    p.x = 20;
    const wall = box(30, 0, 20, 300);
    p.step(SIM_DT, input({ dash: 1 }), [wall], []);
    p.refillDash();
    p.step(SIM_DT, input({ dash: -1 }), [wall], []);
    expect(p.events.some((e) => e.type === 'dashEnd' && e.reason === 'wall')).toBe(true);
    expect(p.vx).toBe(0);
    expect(p.resolveBufferedDash()).toBe(false);
  });
});

describe('spring contacts', () => {
  const spring = () => ({ ...box(90, 8, 18, 4, 'spring', true), spring: 0 });

  it('running into a spring rebounds normally, keeps speed and refills the dash', () => {
    const p = makePlayer(83);
    p.vx = 225;
    p.dashCharges = 0;
    p.step(SIM_DT, input({ move: 1 }), [floor(), spring()], []);
    expect(p.events.some((e) => e.type === 'spring' && !e.boosted)).toBe(true);
    expect(p.vy).toBe(MOVEMENT.springSpeed);
    expect(p.vx).toBeGreaterThan(220);
    expect(p.dashCharges).toBe(1);
  });

  it('a jump timed to imminent run-in contact boosts the spring instead of hopping over it', () => {
    const p = makePlayer(83);
    p.vx = R;
    p.step(SIM_DT, input({ move: 1, jumpPressed: true, jumpHeld: true }), [floor(), spring()], []);
    expect(p.events.some((e) => e.type === 'spring' && e.boosted)).toBe(true);
    expect(p.events.some((e) => e.type === 'jump')).toBe(false);
    expect(p.vy).toBe(MOVEMENT.springBoostSpeed);
  });

  it.each([R, 225])('a deliberate jump before a spring stays available at entry speed %s', (speed) => {
    const p = makePlayer(70);
    p.vx = speed;
    p.step(SIM_DT, input({ move: 1, jumpPressed: true, jumpHeld: true }), [floor(), spring()], []);
    expect(p.events.some((e) => e.type === 'jump')).toBe(true);
    expect(p.events.some((e) => e.type === 'spring')).toBe(false);
    let springEvents = 0;
    for (let i = 0; i < 12; i++) {
      p.step(SIM_DT, input({ move: 1, jumpHeld: true }), [floor(), spring()], []);
      springEvents += p.events.filter((e) => e.type === 'spring').length;
    }
    expect(springEvents).toBe(0);
    expect(p.y).toBeGreaterThan(40);
  });

  it('does not reserve a jump for a spring that braking prevents contacting this step', () => {
    const p = makePlayer(82);
    p.vx = R;
    p.step(SIM_DT, input({ move: -1, jumpPressed: true, jumpHeld: true }), [floor(), spring()], []);
    expect(p.events.some((e) => e.type === 'jump')).toBe(true);
    expect(p.vy).toBeGreaterThan(280);
  });

  it('landing with a buffered jump boosts a spring and preserves horizontal momentum', () => {
    const p = makePlayer(98, 13);
    p.vx = 225;
    p.vy = -200;
    p.dashCharges = 0;
    p.step(SIM_DT, input({ move: 1, jumpPressed: true, jumpHeld: true }), [floor(), spring()], []);
    expect(p.events.some((e) => e.type === 'spring' && e.boosted)).toBe(true);
    expect(p.vy).toBe(MOVEMENT.springBoostSpeed);
    expect(p.vx).toBeGreaterThan(220);
    expect(p.dashCharges).toBe(1);
  });

  it('a press just after contact upgrades the rebound without generating a second jump', () => {
    const p = makePlayer(83);
    p.vx = R;
    const solids = [floor(), spring()];
    p.step(SIM_DT, input({ move: 1 }), solids, []);
    run(p, solids, 2, input({ move: 1 }));
    const before = p.vy;
    p.step(SIM_DT, input({ move: 1, jumpPressed: true, jumpHeld: true }), solids, []);
    expect(p.events.map((e) => e.type)).toEqual(['springBoost']);
    expect(p.vy).toBeGreaterThan(before + 80);
    expect(p.jumpBuffer).toBe(0);
  });
});

describe('cloud skimming', () => {
  it('rebounds on the landing step with earned speed and one restored dash', () => {
    const cloud = box(-20, -8, 200, 8, 'cloud', true);
    const p = makePlayer(0, 2);
    p.vx = R;
    p.vy = -100;
    p.step(SIM_DT, input({ dash: 1, move: 1, jumpPressed: true, jumpHeld: true }), [cloud], []);
    let skim = false;
    for (let i = 0; i < 10; i++) {
      p.step(SIM_DT, input({ move: 1, jumpHeld: true }), [cloud], []);
      if (p.events.some((e) => e.type === 'skim')) {
        expect(p.events.map((e) => e.type)).toEqual(['dashEnd', 'land', 'jump', 'skim']);
        expect(p.grounded).toBe(false);
        expect(p.vy).toBe(MOVEMENT.jumpSpeed);
        expect(p.vx).toBe(225);
        expect(p.dashCharges).toBe(1);
        expect(p.sinceSkim).toBe(0);
        skim = true;
        break;
      }
    }
    expect(skim).toBe(true);
  });

  it('recognises a deliberate jump just after a dash landing without adding speed', () => {
    const cloud = box(-20, -8, 200, 8, 'cloud', true);
    const p = makePlayer(0, 2);
    p.vx = R;
    p.vy = -100;
    p.step(SIM_DT, input({ dash: 1, move: 1 }), [cloud], []);
    while (!p.grounded) p.step(SIM_DT, input({ move: 1 }), [cloud], []);
    const speed = p.vx;
    run(p, [cloud], 2, input({ move: 1 }));
    p.step(SIM_DT, input({ move: 1, jumpPressed: true, jumpHeld: true }), [cloud], []);
    expect(p.events.some((e) => e.type === 'skim')).toBe(true);
    expect(p.vx).toBeLessThanOrEqual(speed);
    expect(p.vy).toBeLessThanOrEqual(MOVEMENT.jumpSpeed);
  });

  it('chains distinct cloud landings without resets, free speed or extra dash charges', () => {
    const solids = [
      box(-20, -8, 130, 8, 'cloud', true),
      box(120, -8, 130, 8, 'cloud', true),
      box(260, -8, 130, 8, 'cloud', true),
      box(400, -8, 130, 8, 'cloud', true),
      box(540, -8, 130, 8, 'cloud', true),
    ];
    const p = makePlayer(20);
    p.vx = R;
    let flightSteps = 0;
    let dashed = false;
    let buffered = false;
    const landings: number[] = [];
    let dashCount = 0;
    for (let i = 0; i < 240 && landings.length < 3; i++) {
      const dash = !dashed && p.vy < 0 && p.y < 14;
      const jump = i === 0 || (!buffered && p.vy < 0 && p.y < 3);
      if (dash) dashed = true;
      if (jump && i !== 0) buffered = true;
      p.step(SIM_DT, input({ move: 1, jumpHeld: flightSteps < 10, jumpPressed: jump, dash: dash ? 1 : 0 }), solids, []);
      flightSteps++;
      dashCount += p.events.filter((e) => e.type === 'dash').length;
      expect(p.dashCharges).toBeGreaterThanOrEqual(0);
      expect(p.dashCharges).toBeLessThanOrEqual(1);
      expect(p.vx).toBeLessThanOrEqual(MOVEMENT.dashSpeed);
      if (p.events.some((e) => e.type === 'skim')) {
        landings.push(p.x);
        expect(p.dashCharges).toBe(1);
        expect(p.vx).toBeGreaterThan(215);
        flightSteps = 0;
        dashed = false;
        buffered = false;
      }
    }
    expect(landings).toHaveLength(3);
    expect(dashCount).toBe(3);
    expect(landings[1]).toBeGreaterThan(120);
    expect(landings[2]).toBeGreaterThan(260);
    expect(p.y).toBe(0);
    expect(p.vy).toBe(MOVEMENT.jumpSpeed);
  });
});

describe('collision', () => {
  it('does not tunnel through a 2px wall at maximum speed', () => {
    const wall = box(100, 0, 2, 60);
    const p = makePlayer(0, 0);
    p.vx = MOVEMENT.maxHorizontalSpeed;
    run(p, [floor(), wall], steps(1), input({ move: 1 }));
    expect(p.x + p.w / 2).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('lands on a thin one-way cloud even at terminal fall speed, and can jump up through it', () => {
    const cloud = box(-50, 92, 100, 8, 'cloud', true);
    const p = makePlayer(0, 400);
    p.grounded = false;
    p.vy = -MOVEMENT.maxFall;
    run(p, [cloud], steps(2), input());
    expect(p.grounded).toBe(true);
    expect(p.y).toBe(100);

    const below = makePlayer(0, 60);
    below.grounded = false;
    const solids = [cloud];
    below.vy = MOVEMENT.jumpSpeed;
    let landedOnTop = false;
    for (let i = 0; i < steps(1.5); i++) {
      below.step(SIM_DT, input({ jumpHeld: true }), solids, []);
      if (below.grounded && below.y === 100) landedOnTop = true;
    }
    expect(landedOnTop).toBe(true);
  });

  it('stops at ceilings', () => {
    const ceiling = box(-50, 40, 100, 10);
    const p = makePlayer();
    run(p, [floor(), ceiling], steps(0.5), (i) => input({ jumpPressed: i === 0, jumpHeld: true }));
    expect(p.y + p.h).toBeLessThanOrEqual(40 + 1e-6);
  });

  it('nudges around a clipped ceiling corner without entering solid geometry', () => {
    // Ceiling block whose right edge overlaps the player's left edge by 3px.
    const ceiling = box(-100, 40, 98, 20);
    const solids = [floor(), ceiling];
    const p = makePlayer(0, 0); // spans x -5..5; overlap with block is -5..-2 = 3px
    let maxY = 0;
    for (let i = 0; i < steps(0.6); i++) {
      p.step(SIM_DT, input({ jumpPressed: i === 0, jumpHeld: true }), solids, []);
      maxY = Math.max(maxY, p.y);
      expect(blocked(solids, p.x, p.y, p.w, p.h)).toBe(false);
    }
    expect(maxY).toBeGreaterThan(40);
  });

  it('never ends a step overlapping solids across a randomised obstacle course', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const solids = [floor()];
    for (let i = 0; i < 40; i++) solids.push(box(rnd() * 3000, rnd() * 120, 4 + rnd() * 60, 2 + rnd() * 40));
    const p = makePlayer(0, 0);
    for (let i = 0; i < steps(20); i++) {
      const inp = input({ move: rnd() < 0.85 ? 1 : -1, jumpPressed: rnd() < 0.05, jumpHeld: rnd() < 0.7, dash: rnd() < 0.03 ? 1 : 0 });
      p.step(SIM_DT, inp, solids, []);
      expect(blocked(solids, p.x, p.y, p.w, p.h)).toBe(false);
    }
  });
});

describe('fixed timestep', () => {
  it('gives identical results at 30, 60 and 144 fps render rates', () => {
    const simulate = (fps: number) => {
      const loop = new FixedLoop(SIM_DT);
      const p = makePlayer();
      const solids = [floor(), box(300, 0, 40, 30), box(600, 50, 100, 8, 'cloud', true)];
      let step = 0;
      const frames = Math.round(4 * fps);
      for (let f = 0; f < frames; f++) {
        loop.advance(1 / fps, () => {
          const i = step++;
          p.step(SIM_DT, input({ move: 1, jumpPressed: i % 50 === 0, jumpHeld: i % 50 < 20, dash: i % 50 === 25 ? 1 : 0 }), solids, []);
        });
      }
      return { step, x: p.x, y: p.y };
    };
    const a = simulate(30);
    const b = simulate(60);
    const c = simulate(144);
    const n = Math.min(a.step, b.step, c.step);
    expect(n).toBeGreaterThan(230);
    // Re-run each to the common step count for exact comparison.
    const at = (fps: number) => {
      const loop = new FixedLoop(SIM_DT);
      const p = makePlayer();
      const solids = [floor(), box(300, 0, 40, 30), box(600, 50, 100, 8, 'cloud', true)];
      let step = 0;
      while (step < n) {
        loop.advance(1 / fps, () => {
          if (step >= n) return;
          const i = step++;
          p.step(SIM_DT, input({ move: 1, jumpPressed: i % 50 === 0, jumpHeld: i % 50 < 20, dash: i % 50 === 25 ? 1 : 0 }), solids, []);
        });
      }
      return [p.x, p.y];
    };
    expect(at(30)).toEqual(at(60));
    expect(at(144)).toEqual(at(60));
  });

  it('caps catch-up work after a long hitch', () => {
    const loop = new FixedLoop(SIM_DT);
    let n = 0;
    loop.advance(5, () => n++);
    expect(n).toBeLessThanOrEqual(loop.maxSteps);
  });
});
