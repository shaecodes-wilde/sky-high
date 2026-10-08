import { describe, expect, it } from 'vitest';
import { ANIMS, FRAME_H, FRAME_NAMES, FRAME_W, ROLL_VISUAL, chooseSkyflowAnim, readSkyflowVisual, rollFrameIndex, skyflowFrame, type SkyflowVisualSource } from '../src/config/animation';
import { MOVEMENT, SIM_DT } from '../src/config/movement';
import { PRESETS } from '../src/config/presentation';
import type { TerrainDef } from '../src/level/types';
import { buildCharacter } from '../src/render/characters';
import { drawCurvedTerrain } from '../src/render/GameRenderer';
import { Particles } from '../src/render/Particles';
import type { Pix } from '../src/render/pixel';
import { Player } from '../src/sim/Player';
import { sampleTerrain, terrainSupport, terrainToSolid } from '../src/sim/terrain';

const source = (patch: Partial<SkyflowVisualSource> = {}): SkyflowVisualSource => ({
  vx: 132, vy: 0, grounded: true, braking: false, sinceLand: 99,
  rolling: true, rollAngle: 0, sinceCurl: 99, sinceUncurl: 99,
  sincePump: 99, pumpResult: 'none', ...patch,
});
const anim = (patch: Partial<SkyflowVisualSource>) => chooseSkyflowAnim(readSkyflowVisual(source(patch)));
const colors = (pix: Pix): Set<string> => {
  const result = new Set<string>();
  for (let i = 0; i < pix.data.length; i += 4) if (pix.data[i + 3]) result.add([...pix.data.slice(i, i + 3)].join(','));
  return result;
};
const topRow = (pix: Pix): number => {
  for (let y = 0; y < pix.h; y++) for (let x = 0; x < pix.w; x++) if (pix.opaque(x, y)) return y;
  return pix.h;
};

describe('read-only Skyflow presentation', () => {
  it.each([[0, 'rollIdle'], [40, 'rollSlow'], [132, 'rollMedium'], [225, 'rollFast']] as const)(
    'communicates %i px/s with %s', (vx, expected) => expect(anim({ vx })).toBe(expected),
  );

  it('takes spin phase from signed travelled distance, including reverse travel and stopping', () => {
    expect(rollFrameIndex(Math.PI / 2, 1)).toBe(4);
    expect(rollFrameIndex(-Math.PI / 2, -1)).toBe(4); // mirrored sheet spins left
    expect(rollFrameIndex(-Math.PI / 2, 1)).toBe(12);
    const angle = 132 / 7 / 60;
    expect(rollFrameIndex(angle, 1)).toBeGreaterThan(0);
    const stopped = readSkyflowVisual(source({ vx: 0, rollAngle: 2.4 }));
    const frames = Array.from({ length: 120 }, () => skyflowFrame('rollIdle', stopped, 1));
    expect(new Set(frames).size).toBe(1);
    expect(rollFrameIndex(2.4 + Math.PI * 2, 1)).toBe(rollFrameIndex(2.4, 1));
  });

  it('uses event age through curl and uncurl even when render frames were skipped', () => {
    expect(anim({ sinceCurl: 0 })).toBe('curl');
    const s = readSkyflowVisual(source({ sinceCurl: 0.1 }));
    expect(skyflowFrame('curl', s, 1)).toBe('curl3');
    expect(anim({ sinceCurl: ROLL_VISUAL.curlSeconds + 0.001 })).toBe('rollMedium');
    expect(anim({ rolling: false, sinceUncurl: 0.05 })).toBe('uncurl');
    expect(skyflowFrame('uncurl', readSkyflowVisual(source({ sinceUncurl: 0.05 })), 1)).toBe('curl2');
    expect(anim({ rolling: false, sinceUncurl: 0.2 })).toBeNull();
    // A clearance-blocked controller remains curled; presentation cannot stand it up.
    expect(anim({ rolling: true, sinceUncurl: 99 })).toBe('rollMedium');
  });

  it('shows accepted good/perfect pumps and leaves missed attempts visually ordinary', () => {
    expect(anim({ pumpResult: 'good', sincePump: 0.01 })).toBe('rollPump');
    expect(anim({ pumpResult: 'perfect', sincePump: 0.01 })).toBe('rollPump');
    expect(anim({ pumpResult: 'perfect', sincePump: 0.1 })).toBe('rollPerfect');
    expect(anim({ pumpResult: 'good', sincePump: 0.1 })).toBe('rollMedium');
    expect(anim({ pumpResult: 'none', sincePump: 0 })).toBe('rollMedium');
    expect(anim({ pumpResult: 'perfect', sincePump: 1 })).toBe('rollMedium');
  });

  it('follows aerial roll, landing, brake and old-controller state without inventing physics', () => {
    expect(anim({ grounded: false, vy: 260, sinceCurl: 0 })).toBe('rollJump');
    expect(anim({ sinceLand: 0.02, sinceCurl: 0 })).toBe('rollLand');
    expect(anim({ braking: true })).toBe('rollBrake');
    const old = Object.freeze({ vx: 225, vy: 0, grounded: true, braking: false, sinceLand: 99 });
    expect(chooseSkyflowAnim(readSkyflowVisual(old))).toBeNull();
    const p = Object.freeze(source({ rollAngle: 1.25, pumpResult: 'perfect', sincePump: 0.02 }));
    const before = JSON.stringify(p);
    for (const _preset of Object.values(PRESETS)) skyflowFrame('rollPump', readSkyflowVisual(p), 1);
    expect(JSON.stringify(p)).toBe(before);
  });

  it.each([1, 2, -1, -2])('reads a real 225 px/s tangent traversal on slope %i as fast under both characters and every preset', (slope) => {
    const def: TerrainDef = {
      id: 950, kind: 'island', bottom: -1100,
      knots: [{ x: -500, y: -500 * slope, slope }, { x: 500, y: 500 * slope, slope }],
    };
    const solid = terrainToSolid(def);
    // Isolate presentation classification from acceleration while using the
    // production Player, actual grounded contact, hitbox and roll transitions.
    const p = new Player({ ...MOVEMENT, rollAccel: 0, rollGravity: 0, rollResistance: 0 });
    p.reset(0, terrainSupport(def, -p.w / 2, p.w / 2)!.y);
    p.grounded = true;
    p.vx = 225 * sampleTerrain(def, 0)!.tangent.x;
    for (let i = 0; i < 12; i++) p.step(SIM_DT, { move: 1, jumpHeld: false, jumpPressed: false, dash: 0, rollHeld: true }, [solid], []);
    expect(p.grounded).toBe(true);
    expect(p.rolling).toBe(true);
    expect(p.vy).toBe(0);
    expect(Math.abs(p.vx)).toBeLessThan(210); // horizontal alone selects the wrong atlas
    const before = JSON.stringify(p);
    for (const id of ['poppy', 'puddlewick'] as const) for (const _preset of Object.values(PRESETS)) {
      const visual = readSkyflowVisual(p);
      expect(visual.speed).toBeCloseTo(225, 9);
      const selected = chooseSkyflowAnim(visual)!;
      expect(selected).toBe('rollFast');
      const frame = skyflowFrame(selected, visual, p.facing)!;
      expect(buildCharacter(id).frames.has(frame)).toBe(true);
    }
    expect(JSON.stringify(p)).toBe(before);
  });

  it('preserves legacy flat and airborne presentation instead of using a stale contact or vertical fall to create trails', () => {
    expect(readSkyflowVisual(source({ vx: 225, surface: null })).speed).toBe(225);
    const contact = { tangent: { x: 0.5 } };
    const upright = readSkyflowVisual(source({ vx: 132, rolling: false, surface: contact }));
    expect(upright.speed).toBe(132);
    expect(chooseSkyflowAnim(upright)).toBeNull();
    const aerial = readSkyflowVisual(source({ vx: 132, vy: -300, grounded: false, surface: contact }));
    expect(aerial.speed).toBe(132);
    expect(chooseSkyflowAnim(aerial)).toBe('rollJump');
  });
});

describe('replaceable compact character art', () => {
  for (const id of ['poppy', 'puddlewick'] as const) {
    const sheet = buildCharacter(id);
    it(`${id} supplies every named frame on the shared canvas and stable roll baseline`, () => {
      expect(sheet.frames.size).toBe(FRAME_NAMES.length);
      for (const name of FRAME_NAMES) {
        const pix = sheet.frames.get(name)!;
        expect(pix.w).toBe(FRAME_W);
        expect(pix.h).toBe(FRAME_H);
        expect(topRow(pix)).toBeLessThan(FRAME_H);
        if (name.startsWith('roll')) expect(Array.from({ length: FRAME_W }, (_, x) => pix.opaque(x, 31)).some(Boolean), name).toBe(true);
      }
    });
    it(`${id} curls gradually at the foot anchor and keeps pump feedback without effects`, () => {
      const tops = ANIMS.curl.frames.map((name) => topRow(sheet.frames.get(name)!));
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
      expect(tops[3] - tops[0]).toBeGreaterThan(5);
      const mint = '159,240,208';
      expect(colors(sheet.frames.get('rollPump0')!).has(mint)).toBe(true);
      expect(colors(sheet.frames.get('rollPerfect0')!).has(mint)).toBe(true);
      expect(colors(sheet.frames.get('roll0')!).has(mint)).toBe(false);
    });
  }
  it('retains Poppy cap spots/braid and Puddlewick hat/duck/monocle/moustache at quarter turns', () => {
    const poppy = buildCharacter('poppy');
    const puddlewick = buildCharacter('puddlewick');
    for (const phase of [0, 4, 8, 12]) {
      const pc = colors(poppy.frames.get(`roll${phase}`)!);
      expect(pc.has('255,246,234')).toBe(true); // mushroom spots
      expect(pc.has('122,74,44') || pc.has('79,46,28')).toBe(true); // braid
      const sc = colors(puddlewick.frames.get(`roll${phase}`)!);
      expect(sc.has('47,36,51')).toBe(true); // hat
      expect(sc.has('255,210,60')).toBe(true); // duck
      expect(sc.has('245,197,66')).toBe(true); // monocle
      expect(sc.has('91,58,38')).toBe(true); // moustache
    }
  });
});

describe('curved terrain readability', () => {
  const curves: TerrainDef[] = [
    { id: 900, kind: 'island', bottom: -100, knots: [{ x: 0, y: 70, slope: 0 }, { x: 80, y: 10, slope: 0 }, { x: 160, y: 70, slope: 0 }] },
    { id: 901, kind: 'island', bottom: -100, knots: [{ x: 0, y: 50, slope: 2 }, { x: 160, y: 50, slope: -2 }] },
    { id: 902, kind: 'cloud', bottom: -100, recovery: true, knots: [{ x: 0, y: 50, slope: -2 }, { x: 160, y: 50, slope: 2 }] },
  ];
  it.each(curves)('matches the real surface at every pixel column, including between-knot extrema (terrain $id)', (def) => {
    const tile = drawCurvedTerrain(def, 0, 160);
    for (let x = 0; x < tile.pix.w; x++) {
      const surface = sampleTerrain(def, x + 0.5)!;
      let row = 0;
      while (row < tile.pix.h && !tile.pix.opaque(x, row)) row++;
      expect(row, `column ${x}`).toBeLessThan(tile.pix.h);
      const visibleTop = tile.bottom + tile.pix.h - row;
      expect(Math.abs(visibleTop - surface.y)).toBeLessThanOrEqual(0.5);
    }
  });
  it('keeps cached tile joins continuous and samples world coordinates instead of restarting texture geometry', () => {
    const def = curves[0];
    const a = drawCurvedTerrain(def, 0, 128);
    const b = drawCurvedTerrain(def, 128, 160);
    const all = drawCurvedTerrain(def, 0, 160);
    for (let y = 0; y < all.pix.h; y++) {
      expect(a.pix.get(127, y)).toEqual(all.pix.get(127, y));
      expect(b.pix.get(0, y)).toEqual(all.pix.get(128, y));
    }
  });
});

describe('bounded, reduced Skyflow particles', () => {
  const visible = (p: Particles) => {
    p.update(0);
    const color = p.points.geometry.getAttribute('aColor');
    let n = 0;
    for (let i = 0; i < color.count; i++) if (color.getW(i) > 0) n++;
    return n;
  };
  it.each([['gentle', 4], ['standard', 8], ['vivid', 11]] as const)('scales a perfect pump under %s to %i pixels', (preset, expected) => {
    const p = new Particles(); p.scale = PRESETS[preset].particles;
    p.emit('mint', 0, 0, 8);
    expect(visible(p)).toBe(expected);
  });
  it('halves single-pixel wakes, supports zero effects, and clears restart state', () => {
    const p = new Particles(); p.scale = 0.5;
    for (let i = 0; i < 10; i++) p.emit('mint', 0, 0, 1);
    expect(visible(p)).toBe(5);
    p.clear(); p.scale = 0;
    p.emit('mint', 0, 0, 8);
    expect(visible(p)).toBe(0);
    p.scale = 1; p.emit('mint', 0, 0, 8);
    p.update(1);
    expect(visible(p)).toBe(0);
  });
  it('bounds a large emission at the existing 900-slot pool', () => {
    const p = new Particles(); p.scale = PRESETS.vivid.particles;
    p.emit('mint', 0, 0, 100000);
    expect(visible(p)).toBe(900);
  });
});
