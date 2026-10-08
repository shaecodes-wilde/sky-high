import { movementCues, type MovementCue, type TraversalInput } from './traversal';

// Developer verification input. These cues guide real controls through the
// authored level; they never move the body or change the simulation state.
const full = (x: number, dashSteps?: number[]): MovementCue => ({ x, jumpHoldSteps: 60, dashSteps });

export const LEVEL1_STANDARD_CUES: readonly MovementCue[] = [
  full(330), full(462), full(619), full(760), full(1090, [8]),
  full(1794, [8, 26]), full(2108), full(2238), full(2770),
  full(3270), full(3455), full(3690), full(3890), full(4105), full(4790),
  full(5010), full(5290), full(5605), full(5990), full(6138),
  full(6390, [14, 32]), full(6690), full(6990), full(7145, [8]),
  { x: 7316, spring: true, dashSteps: [20, 32] },
  full(7685), full(7885), full(8185), full(8385),
];

export const LEVEL1_EXPRESS_CUES: readonly MovementCue[] = [
  ...LEVEL1_STANDARD_CUES.filter(c => c.x < 2380),
  { x: 2380, spring: true, jumpHoldSteps: 60 },
  full(2550, [32, 43]), full(2848, [32]),
  ...LEVEL1_STANDARD_CUES.filter(c => c.x >= 3455 && c.x < 5230),
  full(5366), full(5497), full(5625), full(5775), full(5990, [8]),
  full(6248, [32]), ...LEVEL1_STANDARD_CUES.filter(c => c.x >= 6990),
];

export function level1Inputs(route: 'standard' | 'flow' | 'express', takeoffOffset = 0, dashOffset = 0): TraversalInput {
  const cues = route === 'express' ? LEVEL1_EXPRESS_CUES : LEVEL1_STANDARD_CUES;
  const base = movementCues(cues.map(c => ({ ...c,
    // Carrying the ring skim into this lower island calls for a short hop:
    // a full jump would land too close to its thistles at the higher speed.
    jumpHoldSteps: route === 'flow' && c.x === 2108 ? 8 : c.jumpHoldSteps,
    dashSteps: c.dashSteps?.map(step => step + dashOffset),
  })), takeoffOffset);
  if (route !== 'flow') return base;

  // The flow line shares the lower route but rebounds from its first two dash
  // landings. Release then press again: this is a real keyboard edge, not a
  // held-button re-jump. Only controls are changed; World owns the contact.
  let releasedAt = -1;
  let skimmed = false;
  let targetIndex = 0;
  const targets = [
    { x0: 1180, x1: 1300, top: 80, stopX: 1460 },
    { x0: 1900, x1: 2050, top: 168, stopX: 2250 },
  ];
  return (world, step) => {
    const frame = base(world, step);
    const p = world.player;
    const target = targets[targetIndex];
    if (!target) return frame;
    if (releasedAt < 0) {
      if (p.x > target.x0 && p.x < target.x1 && p.vy < 0 && p.y > target.top && p.y < target.top + 12 && p.dashCharges === 0) {
        releasedAt = step;
        frame.jumpHeld = false;
        frame.jumpPressed = false;
      }
    } else {
      if (step === releasedAt + 1) frame.jumpPressed = true;
      skimmed ||= world.events.some(event => event.type === 'skim');
      if ((skimmed && p.grounded) || p.x > target.stopX) {
        targetIndex++;
        releasedAt = -1;
        skimmed = false;
      } else frame.jumpHeld = true;
    }
    return frame;
  };
}
