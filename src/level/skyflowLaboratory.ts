import type { LevelData, PlatformDef } from './types';
import { authoredTerrain } from './skyflowTerrain';
import { terrainSupport } from '../sim/terrain';

export const SKYFLOW_SECTIONS: { name: string; x: number; y: number; hint: string }[] = [
  { name: 'A · Rolling Basics', x: 30, y: 128, hint: 'Hold S / Down to curl under the arch. Release after it; try coasting and braking on the gentle descent.' },
  { name: 'B · Whispering Bowls', x: 600, y: 64, hint: 'Three broad bowls: hold curl, release forward on the descent, then press again near each low point.' },
  { name: 'C · Sunthread Ramp', x: 1940, y: 64, hint: 'Carry the third bowl uphill. Ride the crest, roll-jump before it, or add an air dash for the upper clouds.' },
  { name: 'D · Dewdrop Crossing', x: 2720, y: 228, hint: 'Spend a dash across the dewdrop, then press again after the refill. Lower clouds catch a missed upper approach.' },
  { name: 'E · Cloud Skimming', x: 3060, y: 220, hint: 'Dash toward each cloud and press jump just before landing. Keep curl held to prepare the next roll.' },
  { name: 'F · Rolling Rejoin', x: 3530, y: 152, hint: 'Meet the broad downhill curve while curled. Continue through the valley and onto the finish garden.' },
  { name: 'G · Recovery Cascades', x: 2720, y: 152, hint: 'Hop the lower shelves and climb the broad curve. If rolling uphill stalls, release curl and run into the rejoin.' },
];

const platforms: PlatformDef[] = [];
const cloud = (x0: number, x1: number, top: number, recovery = false): number => {
  const id = platforms.length;
  platforms.push({ id, kind: 'cloud', x0, x1, top, bottom: top - 8, recovery });
  return id;
};
// Sixteen pixels of real standing clearance: curl fits, the standing body does not.
platforms.push({ id: 0, kind: 'island', x0: 150, x1: 240, top: 160, bottom: 144 });

export const SKYFLOW_SURFACES = {
  dewdrop: cloud(2690, 2850, 228),
  crossing: cloud(2850, 2990, 228),
  skim1: cloud(3010, 3150, 220),
  skim2: cloud(3190, 3330, 200),
  recovery1: cloud(2590, 2850, 152, true),
  recovery2: cloud(2930, 3110, 96, true),
};

const approach = authoredTerrain(1000, [
  { x: -120, y: 128, slope: 0 }, { x: 260, y: 128, slope: 0 },
  { x: 600, y: 64, slope: 0 },
  // 440px / 56px bowls. Broad inter-bowl crests stay supported at the 300px/s cap.
  { x: 820, y: 8, slope: 0 }, { x: 1040, y: 64, slope: 0 },
  { x: 1260, y: 8, slope: 0 }, { x: 1480, y: 64, slope: 0 },
  { x: 1700, y: 8, slope: 0 }, { x: 1920, y: 64, slope: 0 },
  { x: 2000, y: 64, slope: 0 },
], { pump: true });

const ramp = authoredTerrain(1003, [
  { x: 2000, y: 64, slope: 0 }, { x: 2520, y: 172, slope: 0.22 },
  { x: 2580, y: 184, slope: 0.22 },
  // Only this short crest deliberately exceeds the normal-force threshold.
  { x: 2600, y: 187, slope: 0 }, { x: 2640, y: 180, slope: -0.35 },
  { x: 2680, y: 170, slope: 0 },
], { kind: 'cloud', bottom: 40 });

const rejoin = authoredTerrain(1001, [
  { x: 3480, y: 152, slope: 0 }, { x: 3590, y: 152, slope: 0 },
  { x: 3970, y: 64, slope: 0 }, { x: 4310, y: 64, slope: 0 },
], { kind: 'cloud', bottom: 40, recovery: true });

const recovery = authoredTerrain(1002, [
  { x: 3140, y: 8, slope: 0 }, { x: 3670, y: 141.94, slope: -0.231 },
], { kind: 'cloud', bottom: -20, recovery: true });

// The 10px foot span rests on the highest true point, not the knot's centre height.
SKYFLOW_SECTIONS[1].y = terrainSupport(approach, 595, 605)!.y;

export const SKYFLOW_LEVEL: LevelData = {
  id: 'dev-skyflow-laboratory', name: 'Skyflow Laboratory',
  start: { x: 30, y: 128 }, minX: -120, maxX: 4500, killY: -100,
  platforms, terrain: [approach, rejoin, recovery, ramp],
  springs: [],
  rings: [{ x: 2830, y: 280 }], winds: [], hazards: [], fragments: [], keepsakes: [],
  checkpoints: [{ x: 600, y: SKYFLOW_SECTIONS[1].y }, { x: 1940, y: 64 }, { x: 4030, y: 64 }],
  splitGates: [{ x: 600 }, { x: 1940 }, { x: 3100 }, { x: 4030 }],
  seeds: [820, 1260, 1700].map(x => ({ x, y: 25 })),
  signs: [
    { x: 65, y: 128, text: 'HOLD S / DOWN\nCLOUD CURL' },
    { x: 610, y: 64, text: 'WHISPERING BOWLS\nCOAST THEN PRESS' },
    { x: 2010, y: 64, text: 'SUNTHREAD RAMP\nRIDE OR ROLL JUMP' },
    { x: 2990, y: 96, text: 'MISSED THE SKY?\nKEEP MOVING' },
  ], npcs: [],
  decor: [30, 600, 1040, 1480, 1920, 4050, 4200].map((x, v) => ({ kind: 'flower', x, y: x === 30 ? 128 : 64, v })),
  parade: { triggerX: 99999, flower: { x: 4380, y: 160 }, bridgeSolidAt: 2.4 },
  goal: { x0: 4200, x1: 4290, top: 64 }, sun: { x: 4370, y: 240 },
  route: [], express: [],
};
