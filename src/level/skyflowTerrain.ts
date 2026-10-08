import type { TerrainDef, TerrainKnot } from './types';

/** Terrain caches use definition identity. Freeze authored curves before first sampling. */
export function authoredTerrain(id: number, knots: TerrainKnot[], extra: Partial<TerrainDef> = {}): TerrainDef {
  const def: TerrainDef = { id, kind: 'island', bottom: -140, knots, ...extra };
  def.knots.forEach(Object.freeze);
  Object.freeze(def.knots);
  return Object.freeze(def);
}
