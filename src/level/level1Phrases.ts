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

export function level1Inputs(route: 'standard' | 'express', takeoffOffset = 0, dashOffset = 0): TraversalInput {
  const cues = route === 'express' ? LEVEL1_EXPRESS_CUES : LEVEL1_STANDARD_CUES;
  return movementCues(cues.map(c => ({ ...c, dashSteps: c.dashSteps?.map(step => step + dashOffset) })), takeoffOffset);
}
