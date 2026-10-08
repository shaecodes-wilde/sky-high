import type { InputFrame } from '../sim/Player';
import type { World } from '../sim/World';
import { level1Inputs } from './level1Phrases';

export type SkyflowRoute = 'garden' | 'flow' | 'skyway' | 'missed';

/** Developer route recipes. Only input is returned; carried World state is never edited. */
export function skyflowInputs(route: SkyflowRoute, takeoffOffset = 0, pumpOffset = 0, pumpMask: readonly boolean[] = [true, true, true]): (world: World, step: number) => InputFrame {
  const pumped = new Set<number>();
  let releaseUntil = -1;
  let crestJumped = false;
  let lastJump = -999;
  let lastDash = -999;
  let landingRequested = false;
  let jumpHeld = false;
  const lowerJumps = new Set<number>();
  return (world, step) => {
    const p = world.player;
    if (world.events.some(e => e.type === 'jump' || e.type === 'spring')) {
      lastJump = step;
      landingRequested = false;
    }
    let jumpPressed = false;
    let dash: InputFrame['dash'] = 0;
    let move: InputFrame['move'] = 1;
    const upper = route === 'skyway' || route === 'missed';
    const rolling = (route !== 'garden' || p.x < 300 || p.x > 3520)
      && !(route === 'missed' && p.x > 3140 && p.x < 3570 && p.y < 190);
    if (route === 'skyway' || route === 'flow' || route === 'missed') {
      for (const [index, bottom] of [820, 1260, 1700].entries()) {
        if (!pumpMask[index]) continue;
        if (!pumped.has(bottom) && p.grounded && p.x >= bottom - 28 + pumpOffset) {
          pumped.add(bottom);
          releaseUntil = step + 4;
        }
      }
      if (step < releaseUntil) move = 0;
    }
    if (upper && !crestJumped && p.grounded && p.x >= 2560 + takeoffOffset) {
      crestJumped = true;
      jumpPressed = true;
      lastJump = step;
    }
    if (upper && p.x < 3500) {
      if (!p.grounded && step - lastJump === 24 && step - lastDash > 8 && !(route === 'missed' && p.x > 2990)) {
        dash = 1;
        lastDash = step;
      }
      if (world.events.some(e => e.type === 'ring')) { dash = 1; lastDash = step; }
      // A fresh press on descent, within the production jump-buffer window.
      const receivers = [{ x0: 2690, x1: 2850, y: 228 }, { x0: 2850, x1: 2990, y: 228 },
        { x0: 3010, x1: 3150, y: 220 }];
      const receiver = receivers.find(s => p.x > s.x0 - 5 && p.x < s.x1 && p.y > s.y && p.y < s.y + 10);
      if (receiver && p.vy < 0 && !landingRequested && !(route === 'missed' && p.x > 2990)) {
        landingRequested = true;
        jumpPressed = true;
      }
      if (p.grounded && p.x > 3300 + takeoffOffset && p.x < 3330 && p.y >= 195) jumpPressed = true;
    }
    // Lower receivers are a forgiving forward path, not a reset to the expert lane.
    for (const [edge, top] of [[2830, 152], [3090, 96]]) {
      if (!lowerJumps.has(edge) && p.grounded && Math.abs(p.y - top) < 1 && p.x >= edge + takeoffOffset && p.x < edge + 90) {
        lowerJumps.add(edge);
        jumpPressed = true;
        lastJump = step;
      }
    }
    // This deliberately imperfect approach loses the next skim, then falls onto the cascade.
    if (route === 'missed' && p.x > 3120 && p.x < 3190) move = p.grounded && p.y > 195 && p.vx > 140 ? -1 : 0;
    jumpHeld ||= jumpPressed || world.events.some(e => e.type === 'spring');
    return { move, rollHeld: rolling, jumpHeld, jumpPressed, dash };
  };
}

/** Whole Level 1 Adventure/Trial recipe: real spring boost, optional Skyway, all fragments. */
export function level1SkyflowInputs(): (world: World, step: number) => InputFrame {
  const ordinary = level1Inputs('express');
  let skyJumped = false;
  let lastJump = -999;
  let bufferRequested = false;
  const pumped = new Set<number>();
  let releasedUntil = -1;
  let shortSkim = false;
  return (world, step) => {
    const p = world.player;
    const frame = ordinary(world, step);
    if (p.x < 3560 || p.x > 4680) return frame;
    if (world.events.some(e => e.type === 'jump')) {
      lastJump = step; bufferRequested = false;
      shortSkim = p.x > 4290;
    }
    frame.rollHeld = p.x > 3670;
    frame.jumpPressed = false;
    frame.jumpHeld = !shortSkim;
    frame.dash = 0;
    frame.move = 1;
    if (p.ascent === 'spring' && p.lastSpring === world.level.springs.findIndex(s => s.x === 3640) && p.springLate > 0) frame.jumpPressed = true;
    for (const bottom of [3690, 3870, 4050]) {
      if (!pumped.has(bottom) && p.grounded && p.x >= bottom - 20 && p.x < bottom + 20) {
        pumped.add(bottom); releasedUntil = step + 3;
      }
    }
    if (step < releasedUntil) frame.move = 0;
    if (!skyJumped && p.grounded && p.x >= 4200) { skyJumped = true; frame.jumpPressed = true; lastJump = step; }
    if (skyJumped && !p.grounded && step - lastJump === (shortSkim ? 1 : 24) && p.x < 4390) frame.dash = 1;
    const target = 376;
    if (skyJumped && !bufferRequested && p.vy < 0 && p.y > target && p.y < target + 10 && p.x > 4290 && p.x < 4380) {
      bufferRequested = true; frame.jumpPressed = true;
    }
    return frame;
  };
}
