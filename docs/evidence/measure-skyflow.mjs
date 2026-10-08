import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { MOVEMENT } = await server.ssrLoadModule('/src/config/movement.ts');
  const { SKYFLOW_LEVEL } = await server.ssrLoadModule('/src/level/skyflowLaboratory.ts');
  const { skyflowInputs, level1SkyflowInputs } = await server.ssrLoadModule('/src/level/skyflowPolicies.ts');
  const { LEVEL1 } = await server.ssrLoadModule('/src/level/level1.ts');
  const { traverse } = await server.ssrLoadModule('/src/level/traversal.ts');
  const results = [];
  const pumpComparison = [];
  for (const vx of [132, 180, 225, 260]) for (const mask of [[true, true, true], [true, false, true], [false, false, false]]) {
    const r = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs('skyway', 0, 0, mask), {
      start: { x: 600, y: SKYFLOW_LEVEL.checkpoints[0].y, vx }, stop: w => w.player.x > 1940 });
    pumpComparison.push({ entryVx: vx, mask, reason: r.reason, time: r.final.time, exitVx: r.final.vx,
      pumps: r.events.filter(e => e.event.type === 'pump'),
      afterBottom: [850, 880, 1290, 1320, 1730, 1760].map(x => ({ x, state: r.trail.find(s => s.x >= x) })) });
  }
  for (const route of ['garden', 'flow', 'skyway', 'missed']) {
    const run = traverse(SKYFLOW_LEVEL, MOVEMENT, skyflowInputs(route), { maxSteps: 5400, trailEvery: 6 });
    const detail = { route, reason: run.reason, final: run.final, peakSpeed: run.peakSpeed,
      wallHits: run.wallHits, progression: run.progressionComplete, invalid: run.runInvalidReason,
      entry: run.entry, airTime: run.airTime, rollTime: run.rollTime, recording: run.recording,
      events: run.events.filter(e => !['seed', 'split', 'checkpoint', 'curl', 'uncurl'].includes(e.event.type)),
      landings: run.landings, trail: run.trail };
    results.push(detail);
    console.log(JSON.stringify({ route, reason: run.reason, time: run.final.time,
      pumps: run.events.filter(e => e.event.type === 'pump').length,
      skims: run.events.filter(e => e.event.type === 'skim').length,
      rings: run.events.filter(e => e.event.type === 'ring').length,
      landings: run.landings.map(l => [Math.round(l.x), Math.round(l.y), Math.round(l.vx)]), wallHits: run.wallHits }));
  }
  writeFileSync('docs/evidence/skyflow-level-routes.json', JSON.stringify({ scope: 'Automated production World; input only; initial rest; no between-link state edits. Trail sampled every six fixed ticks; recordings/events/contacts retained at full resolution.', results, pumpComparison }, null, 2) + '\n');
  const run = traverse(LEVEL1, MOVEMENT, level1SkyflowInputs(), { maxSteps: 5400, trailEvery: 6 });
  console.log(JSON.stringify({ route: 'level1-skyflow', reason: run.reason, time: run.final.time,
    pumps: run.events.filter(e => e.event.type === 'pump').length,
    skims: run.events.filter(e => e.event.type === 'skim').length,
    rings: run.events.filter(e => e.event.type === 'ring').length, walls: run.wallHits,
    fragments: run.fragments, progression: run.progressionComplete, invalid: run.runInvalidReason }));
  writeFileSync('docs/evidence/level1-skyflow-route.json', JSON.stringify(run, null, 2) + '\n');
} finally { await server.close(); }
