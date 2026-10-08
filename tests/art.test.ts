import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_NAMES, FRAME_W } from '../src/config/animation';
import { buildCharacter, buildRollPreview } from '../src/render/characters';
import { terrainMaterial } from '../src/render/props';

// Art contracts that gameplay relies on: frame size and foot baseline, and
// curved-ground lips that are always solid paint.

const GROUNDED = ['idle0', 'idle1', 'idle2', 'start', 'brake', 'land', 'cheer0'];

describe('character art contract', () => {
  for (const id of ['poppy', 'puddlewick'] as const) {
    const sheet = buildCharacter(id);

    it(`${id}: every configured frame exists at 24×32`, () => {
      for (const name of FRAME_NAMES) {
        const f = sheet.frames.get(name);
        expect(f, name).toBeDefined();
        expect([f!.w, f!.h]).toEqual([FRAME_W, FRAME_H]);
      }
    });

    it(`${id}: grounded poses stand on row 30 with the outline on row 31`, () => {
      for (const name of GROUNDED) {
        const f = sheet.frames.get(name)!;
        const row = (y: number) => [...Array(FRAME_W).keys()].some((x) => f.opaque(x, y));
        expect(row(30), `${name} feet`).toBe(true);
        expect(row(31), `${name} outline`).toBe(true);
      }
    });

    it(`${id}: Cloud Curl frames keep the same footprint baseline`, () => {
      for (const [name, f] of buildRollPreview(id)) {
        expect([f.w, f.h], name).toEqual([FRAME_W, FRAME_H]);
        expect([...Array(FRAME_W).keys()].some((x) => f.opaque(x, 31) || f.opaque(x, 30)), name).toBe(true);
      }
    });
  }
});

describe('curved terrain material', () => {
  it('always paints the standable lip row', () => {
    for (const kind of ['island', 'cloud'] as const) {
      for (let x = 0; x < 200; x += 7) expect(terrainMaterial(kind, 0, 40, x, 100, 3), `${kind}@${x}`).not.toBeNull();
    }
  });
});
