import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import type { LevelData, TerrainDef } from '../src/level/types';
import { traverse } from '../src/level/traversal';
import { World } from '../src/sim/World';
import { Input } from '../src/input/Input';
import { loadSettings } from '../src/persist/settings';
import { input } from './helpers';

const bowl: TerrainDef = {
  id: 100, kind: 'island', bottom: -50, pump: true,
  knots: [
    { x: 0, y: 40, slope: 0 }, { x: 80, y: 8, slope: 0 },
    { x: 160, y: 40, slope: 0 }, { x: 240, y: 40, slope: 0 },
  ],
};
const fixture: LevelData = {
  id: 'skyflow-world-fixture', name: 'Connected bowl boundary fixture',
  start: { x: -50, y: 40 }, minX: -100, maxX: 460, killY: -90,
  platforms: [
    { id: 0, kind: 'island', x0: -100, x1: 0, top: 40, bottom: -50 },
    { id: 1, kind: 'cloud', x0: 240, x1: 450, top: 40, bottom: 32 },
  ],
  terrain: [bowl], springs: [], rings: [], winds: [], hazards: [],
  seeds: [], fragments: [], keepsakes: [], checkpoints: [{ x: 300, y: 40 }],
  splitGates: [{ x: 40 }, { x: 160 }, { x: 320 }],
  signs: [], npcs: [], decor: [],
  parade: { triggerX: 9999, flower: { x: 9000, y: 40 }, bridgeSolidAt: 2.4 },
  goal: { x0: 380, x1: 440, top: 40 }, sun: { x: 440, y: 100 },
  route: [], express: [],
};

describe('Skyflow production World boundaries', () => {
  it('restores an available dash when a saved binding now belongs to Cloud Curl', () => {
    const stored = JSON.stringify({ dashKey: 'KeyS', muted: true });
    const settings = loadSettings({ getItem: () => stored, setItem: () => {} });
    const keyboard = new Input();
    keyboard.bindings.dash = [settings.dashKey];
    keyboard.press('KeyS', keyboard.actionFor('KeyS')!, 0);
    const curl = keyboard.sample(false, 1, 0);
    expect(curl.rollHeld).toBe(true);
    expect(curl.dash).toBe(0);
    keyboard.press(settings.dashKey, keyboard.actionFor(settings.dashKey)!, 17);
    expect(keyboard.sample(true, 1, 17, true).dash).toBe(1);
    expect(settings.muted).toBe(true);
  });

  it('constructs curve solids without changing existing platform and spring identity', () => {
    const level = { ...fixture, springs: [{ x: 410, top: 40 }] };
    const world = new World(level, MOVEMENT, 'adventure');
    expect(new Set(world.solids.map(s => s.id)).size).toBe(world.solids.length);
    expect(world.solids.slice(0, 2).map(s => s.id)).toEqual([0, 1]);
    expect(world.solids.filter(s => s.terrain)).toHaveLength(1);
    expect(world.springs[0].solid.spring).toBe(0);
  });

  it('rejects duplicate authored terrain identity rather than sharing unrelated pump rewards', () => {
    expect(() => new World({ ...fixture, terrain: [bowl, { ...bowl }] }, MOVEMENT, 'adventure')).toThrow(/unique finite IDs/);
    expect(() => new World({ ...fixture, terrain: [{ ...bowl, id: NaN }] }, MOVEMENT, 'adventure')).toThrow(/unique finite IDs/);
  });

  for (const rolling of [false, true]) {
    it(`carries one continuous ${rolling ? 'rolling' : 'ordinary'} route through curves and clean split gates without pumps`, () => {
      const result = traverse(fixture, MOVEMENT, () => input({ move: 1, rollHeld: rolling }), {
        maxSteps: 60 * 15,
      });
      expect(result.reason).toBe('goal');
      expect(result.wallHits).toBe(0);
      expect(result.progressionComplete).toBe(true);
      expect(result.progressionValid).toBe(true);
      expect(result.runInvalidReason).toBeNull();
      expect(result.events.filter(e => e.event.type === 'pump')).toHaveLength(0);
      expect(result.events.filter(e => e.event.type === 'split').map(e => e.event.type === 'split' && e.event.index)).toEqual([0, 1, 2]);
      expect(result.peakSpeed).toBeLessThanOrEqual(MOVEMENT.maxHorizontalSpeed);
    });
  }

  it('clears rolling state on full restart and restores the curve reveal state', () => {
    const hidden = { ...bowl, parade: true };
    const world = new World({ ...fixture, terrain: [hidden] }, MOVEMENT, 'adventure');
    const terrainSolid = world.solids.find(s => s.terrain)!;
    expect(terrainSolid.active).toBe(false);
    world.parade.set(true);
    world.step(input({ move: 1, rollHeld: true }));
    expect(terrainSolid.active).toBe(true);
    expect(world.player.rolling).toBe(true);
    world.resetAll();
    expect(world.player.rolling).toBe(false);
    expect(world.player.pumpResult).toBe('none');
    expect(world.player.x).toBe(fixture.start.x);
    expect(world.time).toBe(0);
    expect(terrainSolid.active).toBe(false);
  });
});
