import { describe, expect, it } from 'vitest';
import { chooseSkyflowAnim, readSkyflowVisual, skyflowFrame } from '../src/config/animation';
import { MOVEMENT, movementFor } from '../src/config/movement';
import { PRESETS } from '../src/config/presentation';
import { keyboardTape, traversePhysical } from '../src/level/physicalTape';
import { SKYFLOW_LEVEL, SKYFLOW_SECTIONS } from '../src/level/skyflowLaboratory';
import { skyflowInputs } from '../src/level/skyflowPolicies';
import { buildSkyflowEvidence, LAB_ROUTES, labCriteria, runLab, seatedStart } from '../src/level/skyflowValidation';
import { traverse } from '../src/level/traversal';
import { assessPhrase } from '../src/level/validate';
import { applyPreset, defaultSettings, presentationOf } from '../src/persist/settings';
import { buildCharacter } from '../src/render/characters';
import { blocked } from '../src/sim/collision';
import { World } from '../src/sim/World';

describe('continuous Skyflow routes through real World', () => {
  it('accepts the declared full-level/entry-speed/pump/takeoff matrix and measured shortcut/recovery outcomes', () => {
    const evidence = buildSkyflowEvidence();
    expect(evidence.failures).toEqual([]);
    expect(evidence.passed).toBe(true);
    for (const run of evidence.runs.filter(r => r.id.startsWith('level1/'))) {
      expect(run.validity.splits).toHaveLength(6);
      expect(run.validity.splits.every(s => s !== null)).toBe(true);
      expect(run.validity.fragments).toBe(3);
      expect(run.validity.paradeTriggered).toBe(true);
    }
    for (const physical of evidence.physical) expect(physical.matchesInputRecipe, physical.route).toBe(true);
  });

  for (const route of LAB_ROUTES) it(`replays ${route} with exact carried roll, pump, contact, charge and world state`, () => {
    const original = runLab(route);
    expect(assessPhrase(original, MOVEMENT, labCriteria(route))).toEqual([]);
    expect(traverse(SKYFLOW_LEVEL, MOVEMENT, original.recording, { maxSteps: 60 * 60 })).toEqual(original);
    const tape = keyboardTape(original.recording);
    const physical = traversePhysical(SKYFLOW_LEVEL, MOVEMENT, tape, 60, { maxSteps: 60 * 60 });
    for (const fps of [30, 144]) expect(traversePhysical(SKYFLOW_LEVEL, MOVEMENT, tape, fps, { maxSteps: 60 * 60 })).toEqual(physical);
  });

  for (const section of SKYFLOW_SECTIONS) it(`idle reset in ${section.name} remains seated with a clear standing box`, () => {
    const start = seatedStart(SKYFLOW_LEVEL, section.x, section.y);
    expect(Math.abs(start.y - section.y)).toBeLessThanOrEqual(1);
    const world = new World(SKYFLOW_LEVEL, MOVEMENT, 'adventure');
    world.player.reset(start.x, start.y);
    world.player.grounded = true;
    for (let step = 0; step < 120; step++) {
      world.step({ move: 0, jumpHeld: false, jumpPressed: false, dash: 0 });
      expect(blocked(world.solids, world.player.x, world.player.y, world.player.w, world.player.h)).toBe(false);
      expect(world.player.grounded).toBe(true);
      expect(world.dead).toBe(false);
    }
    expect(world.player.x).toBe(start.x);
    expect(world.player.y).toBe(start.y);
  });

  it('each authored checkpoint survives real World retry and remains seated without embedding', () => {
    for (const [index, cp] of SKYFLOW_LEVEL.checkpoints.entries()) {
      const world = new World(SKYFLOW_LEVEL, MOVEMENT, 'adventure');
      world.player.reset(cp.x, cp.y);
      world.player.grounded = true;
      world.step({ move: 0, jumpHeld: false, jumpPressed: false, dash: 0 });
      expect(world.checkpoint).toBe(index);
      world.respawn();
      for (let step = 0; step < 120; step++) {
        world.step({ move: 0, jumpHeld: false, jumpPressed: false, dash: 0 });
        expect(blocked(world.solids, world.player.x, world.player.y, world.player.w, world.player.h)).toBe(false);
        expect(world.player.grounded).toBe(true);
        expect(world.dead).toBe(false);
      }
    }
  });

  it('actual character art and animation projections, presets and forced Bloom cannot change the full Skyway simulation', () => {
    const baseline = runLab('skyway');
    for (const character of ['poppy', 'puddlewick'] as const) {
      const art = buildCharacter(character);
      for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) for (const bloom of [0, 1]) {
        const settings = defaultSettings();
        settings.character = character;
        applyPreset(settings, preset);
        const presentation = presentationOf(settings);
        const policy = skyflowInputs('skyway');
        const result = traverse(SKYFLOW_LEVEL, movementFor(settings.assist), (world, step) => {
          world.bloom.value = bloom;
          const visual = readSkyflowVisual(world.player);
          const animation = chooseSkyflowAnim(visual);
          if (animation) {
            const frame = skyflowFrame(animation, visual, world.player.facing);
            if (frame) expect(art.frames.has(frame)).toBe(true);
          }
          expect(presentation.preset).toBe(preset);
          return policy(world, step);
        }, { maxSteps: 60 * 60 });
        expect(result).toEqual(baseline);
      }
    }
  });
});
