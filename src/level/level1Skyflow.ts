import type { PlatformDef, TerrainDef } from './types';
import { authoredTerrain } from './skyflowTerrain';

/** Optional branch entered by boosting the existing Duck Feather spring or its high shelf.
 * Keeping the rolling approach above y=320 protects the existing ordinary/express lanes.
 * The short rolling rejoin ends above the Parade garden, before its melody fragment.
 */
export const LEVEL1_SKYFLOW_TERRAIN: TerrainDef[] = [
  authoredTerrain(1100, [
    { x: 3560, y: 330, slope: 0 }, { x: 3600, y: 330, slope: 0 },
    { x: 3690, y: 320, slope: 0 }, { x: 3780, y: 330, slope: 0 },
    { x: 3870, y: 320, slope: 0 }, { x: 3960, y: 330, slope: 0 },
    { x: 4050, y: 320, slope: 0 }, { x: 4140, y: 330, slope: 0 },
    { x: 4230, y: 348, slope: 0.24 }, { x: 4260, y: 352, slope: 0 },
    { x: 4290, y: 346, slope: -0.3 },
  ], { kind: 'cloud', bottom: 300, pump: true }),
  authoredTerrain(1101, [
    { x: 4440, y: 346, slope: -0.8 }, { x: 4590, y: 172, slope: -0.6 },
  ], { kind: 'cloud', bottom: 140, recovery: true }),
];

/** IDs supplied by Level 1's existing builder; no legacy IDs are renumbered. */
export function level1SkyflowClouds(firstId: number): PlatformDef[] {
  return [
    { id: firstId, kind: 'cloud', x0: 4290, x1: 4380, top: 376, bottom: 368 },
    { id: firstId + 1, kind: 'cloud', x0: 4390, x1: 4440, top: 346, bottom: 338 },
  ];
}
