import { MOVEMENT, MOVEMENT_RULES_VERSION } from '../config/movement';
import { blocked, sweepY } from '../sim/collision';
import { terrainValleys } from '../sim/terrain';
import { World } from '../sim/World';
import { LEVEL1 } from './level1';
import { level1Inputs } from './level1Phrases';
import { keyboardTape, traversePhysical } from './physicalTape';
import { SKYFLOW_LEVEL, SKYFLOW_SECTIONS } from './skyflowLaboratory';
import { level1SkyflowInputs, skyflowInputs, type SkyflowRoute } from './skyflowPolicies';
import { traverse, type TraversalInput, type TraversalResult, type TraversalState } from './traversal';
import type { LevelData } from './types';
import { assessPhrase, type PhraseCriteria } from './validate';

export const ENTRY_SPEEDS = [132, 180, 225, 260] as const;
export const LAB_ROUTES: readonly SkyflowRoute[] = ['garden', 'flow', 'skyway', 'missed'];

/** Initial placement only, matching the dev section's production vertical sweep. */
export function seatedStart(level: LevelData, x: number, y: number, vx = 0) {
  const world = new World(level, MOVEMENT, 'timeTrial');
  const body = { x, y: y + 1, w: MOVEMENT.width, h: MOVEMENT.height };
  const contact = sweepY(world.solids, body, -2, MOVEMENT.cornerNudge);
  if (!contact.landed || blocked(world.solids, body.x, body.y, body.w, body.h)) throw new Error(`Unsafe declared section start ${x},${y}`);
  return { x: body.x, y: body.y, vx, grounded: true };
}

export function labCriteria(route: SkyflowRoute): PhraseCriteria {
  return { requireProgression: true,
    ...(route === 'garden' ? { maxPumps: 0 } : {}),
    ...(route === 'skyway' ? { minPumps: 3, minRings: 1, minSkims: 2 } : {}),
    ...(route === 'missed' ? { requireRecovery: true } : {}),
  };
}

function sample(s: TraversalState) {
  return { step: s.step, time: s.time, x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: s.grounded,
    surface: s.surface, terrain: s.terrain, rolling: s.rolling, slope: s.slope, curvature: s.curvature,
    tangentSpeed: s.tangentSpeed, dashCharges: s.dashCharges, recovery: s.recovery };
}

export function summarizePhrase(id: string, result: TraversalResult, criteria: PhraseCriteria = {}, includeTape = false) {
  const failures = assessPhrase(result, MOVEMENT, criteria);
  const count = (type: string) => result.events.filter(e => e.event.type === type).length;
  const recovery = result.landings.find(l => l.recovery && l.x > 2990);
  const level1 = id.startsWith('level1/');
  const rejoin = recovery ? result.trail.find(s => s.step > recovery.step && s.grounded && s.x > recovery.x &&
    (level1 ? s.x > 4590 && s.terrain === null : s.x >= 3590 && s.terrain === 1001)) : undefined;
  return { id, passed: failures.length === 0, criteria, failures, reason: result.reason,
    entry: sample(result.entry), exit: sample(result.final), time: result.final.time, airTime: result.airTime, rollTime: result.rollTime,
    peakHorizontalSpeed: result.peakSpeed, wallHits: result.wallHits, deaths: count('death'), respawns: count('respawn'),
    wallEvents: result.events.filter(e => e.event.type === 'wall').map(e => ({ ...e,
      states: result.trail.filter(s => Math.abs(s.step - e.step) <= 2).map(sample) })),
    pumps: result.events.filter(e => e.event.type === 'pump'), skims: count('skim'), rings: count('ring'),
    pumpDeliverySamples: result.events.filter(e => e.event.type === 'pump').map(e => ({ step: e.step,
      samples: [0, 1, 3, 6].map(offset => result.trail.find(s => s.step === e.step + offset)).map(s => s && sample(s)) })),
    valleyExits: [850, 1290, 1730].map(x => ({ boundaryX: x, state: result.trail.find(s => s.x >= x) })).map(c => ({ boundaryX: c.boundaryX, state: c.state && sample(c.state) })),
    ringAndDashEvents: result.events.filter(e => ['ring', 'dash', 'dashEnd'].includes(e.event.type)),
    landings: result.landings.map(l => ({ ...sample(l), impact: l.impact, exit: l.exit && sample(l.exit) })),
    checkpoints: [1940, 2560, 3590].map(x => ({ boundaryX: x, state: result.trail.find(s => s.x >= x) })).map(c => ({ boundaryX: c.boundaryX, state: c.state && sample(c.state) })),
    recovery: { caught: recovery ? sample(recovery) : null, rejoined: rejoin ? sample(rejoin) : null,
      movedForward: recovery ? result.final.x > recovery.x && Boolean(rejoin && rejoin.x > recovery.x) : null },
    validity: { progressionComplete: result.progressionComplete, progressionValid: result.progressionValid,
      invalidReason: result.runInvalidReason, splits: result.splits, fragments: result.fragments, paradeTriggered: result.paradeTriggered,
      boundary: 'production World; Game pause/focus, UI, localStorage and human feel are separate' },
    ...(includeTape ? { recording: result.recording } : {}),
  };
}

export function runLab(route: SkyflowRoute, vx = 0, takeoffOffset = 0, pumpOffset = 0, mask?: readonly boolean[], bowlsEntry = false) {
  const start = bowlsEntry ? seatedStart(SKYFLOW_LEVEL, 600, 64, vx) : { ...SKYFLOW_LEVEL.start, vx };
  return traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs(route, takeoffOffset, pumpOffset, mask), { start, maxSteps: 60 * 60 });
}

/** Shared by real-boundary route tests and the no-dependency evidence generator. */
export function buildSkyflowEvidence() {
  const runs: ReturnType<typeof summarizePhrase>[] = [];
  for (const route of LAB_ROUTES) {
    runs.push(summarizePhrase(`lab/${route}/rest`, runLab(route), labCriteria(route), true));
    for (const vx of ENTRY_SPEEDS) runs.push(summarizePhrase(`lab/${route}/entry-${vx}`, runLab(route, vx), labCriteria(route)));
  }
  for (const vx of ENTRY_SPEEDS) for (const [chain, mask, pumpOffset] of [
    ['successful', [true, true, true], 0], ['none', [false, false, false], 0],
    ['partial', [true, false, true], 0], ['late-missed', [true, true, true], 70],
  ] as const) {
    const expected = chain === 'successful' ? 3 : chain === 'partial' ? 2 : 0;
    runs.push(summarizePhrase(`bowls-to-goal/${chain}/entry-${vx}`, runLab('skyway', vx, 0, pumpOffset, mask, true), {
      minPumps: expected, maxPumps: expected, minSkims: 2, minRings: 1,
    }));
  }
  for (const route of LAB_ROUTES) for (const takeoff of [-6, 6]) for (const pump of [-4, 4]) {
    runs.push(summarizePhrase(`lab/${route}/takeoff-${takeoff}/pump-${pump}`, runLab(route, 0, takeoff, pump), labCriteria(route)));
  }
  const levelRoutes: [string, () => TraversalInput][] = [
    ['garden', () => level1Inputs('standard')], ['legacy-flow', () => level1Inputs('flow')],
    ['legacy-express', () => level1Inputs('express')], ['skyflow', () => level1SkyflowInputs()],
  ];
  for (const [route, policy] of levelRoutes) for (const vx of [0, ...ENTRY_SPEEDS]) {
    runs.push(summarizePhrase(`level1/${route}/entry-${vx}`, traverse(LEVEL1, MOVEMENT, policy(), {
      start: { ...LEVEL1.start, vx }, maxSteps: 60 * 90,
    }), { requireProgression: true, fragments: 3, requireParade: true,
      ...(route === 'garden' ? { maxPumps: 0 } : {}),
    }, vx === 0));
  }
  const canonical = Object.fromEntries(LAB_ROUTES.map(route => [route, runs.find(r => r.id === `lab/${route}/rest`)!]));
  const physical = LAB_ROUTES.map(route => {
    const source = runLab(route);
    const tape = keyboardTape(source.recording);
    const options = { maxSteps: 60 * 60 };
    const reference = traversePhysical(SKYFLOW_LEVEL, MOVEMENT, tape, 60, options);
    const signature = (r: TraversalResult) => JSON.stringify([r.final, r.landings, r.events, r.splits, r.fragments, r.paradeTriggered]);
    const frames = [30, 60, 144].map(fps => {
      const result = fps === 60 ? reference : traversePhysical(SKYFLOW_LEVEL, MOVEMENT, tape, fps, options);
      return { fps, sameOutcome: signature(result) === signature(reference), failures: assessPhrase(result, MOVEMENT, labCriteria(route)), time: result.final.time };
    });
    return { route, matchesInputRecipe: signature(source) === signature(reference), frames, tape,
      measured: summarizePhrase(`physical/${route}/60fps`, reference, labCriteria(route), true) };
  });
  const comparison = { gardenSeconds: canonical.garden.time, flowSeconds: canonical.flow.time,
    skywaySeconds: canonical.skyway.time, missedSeconds: canonical.missed.time,
    flowSavingSeconds: canonical.garden.time - canonical.flow.time,
    skywaySavingSeconds: canonical.garden.time - canonical.skyway.time,
    skywayVsFlowSeconds: canonical.flow.time - canonical.skyway.time,
    missedPenaltySeconds: canonical.missed.time - canonical.skyway.time,
    humanComfortVerified: false, expertOptimizationVerified: false };
  const level1Comparison = Object.fromEntries(levelRoutes.map(([route]) => [route, runs.find(r => r.id === `level1/${route}/entry-0`)!.time]));
  const failures = runs.filter(r => !r.passed).map(r => ({ id: r.id, failures: r.failures }));
  for (const p of physical) if (!p.matchesInputRecipe || p.frames.some(f => !f.sameOutcome || f.failures.length)) failures.push({ id: `physical/${p.route}`, failures: [
    ...(!p.matchesInputRecipe ? ['keyboard counterpart differs from direct recipe'] : []),
    ...p.frames.flatMap(f => [...f.failures, ...(!f.sameOutcome ? [`${f.fps}fps differs`] : [])]),
  ] });
  if (comparison.flowSavingSeconds < 1 || comparison.skywayVsFlowSeconds < 0.2) failures.push({ id: 'route-time-comparison', failures: ['Flow must save ≥1s over Garden and Skyway ≥0.2s over Flow in canonical recipes'] });
  if (!canonical.missed.recovery.movedForward || comparison.missedPenaltySeconds <= 0) failures.push({ id: 'missed-recovery-comparison', failures: ['miss must catch/rejoin forward and cost time'] });
  const pumpComparison = ENTRY_SPEEDS.map(vx => ({ entryVx: vx, cases: runs.filter(r => r.id.startsWith('bowls-to-goal/') && r.id.endsWith(`entry-${vx}`)).map(r => ({
    id: r.id, pumps: r.pumps.length, time: r.time, afterValleys: r.valleyExits, atBowlExit: r.checkpoints[0].state, atRamp: r.checkpoints[1].state, exitVx: r.exit.vx,
  })) }));
  return { schemaVersion: 1, rulesVersion: MOVEMENT_RULES_VERSION,
    boundary: 'single production World per run; initial fixtures declared; no intermediate reset/teleport/forced refill; all geometry and hazards active',
    defaults: MOVEMENT, levels: { laboratory: SKYFLOW_LEVEL.id, level1: LEVEL1.id },
    sections: SKYFLOW_SECTIONS, valleys: (SKYFLOW_LEVEL.terrain ?? []).flatMap(t => terrainValleys(t)),
    passed: failures.length === 0, failures, comparison, level1Comparison, pumpComparison, physical, runs,
    limitations: ['Finite scripted sample matrix, not broad continuous timing tolerance or human comfort.',
      'Accepted pump rewards can clip at the cap; compare measured times/exit states, not event count alone.',
      'Timestamp/cadence and presentation parity are tested separately; browser/device latency, UI and sustained rendering are not established by this JSON.',
      'Bowls-entry fixtures begin at the first gate boundary and are not clean whole-Laboratory records; their progression state is retained explicitly.',
      'No expert optimal-time search or human playtest. Laboratory is developer practice; World progression does not submit a Game record.'],
  };
}
