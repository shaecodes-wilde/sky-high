// No new dependencies. Use the project's existing Vite TS loader to execute
// production World/terrain/controller modules with their normal imports.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/evidence/skyflow-route-comparison.json');
const server = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { buildSkyflowEvidence } = await server.ssrLoadModule('/src/level/skyflowValidation.ts');
  const hashes = {};
  for (const file of ['src/config/movement.ts', 'src/sim/Player.ts', 'src/sim/collision.ts', 'src/sim/terrain.ts', 'src/sim/World.ts', 'src/input/Input.ts', 'src/core/FixedLoop.ts', 'src/level/traversal.ts', 'src/level/physicalTape.ts', 'src/level/validate.ts', 'src/level/skyflowLaboratory.ts', 'src/level/skyflowTerrain.ts', 'src/level/skyflowPolicies.ts', 'src/level/level1.ts', 'src/level/level1Skyflow.ts', 'src/level/skyflowValidation.ts']) {
    hashes[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
  }
  const evidence = { generatedAt: new Date().toISOString(), generator: 'node tools/skyflow-evidence.mjs',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceSha256: hashes,
    ...buildSkyflowEvidence() };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, passed: evidence.passed, scenarios: evidence.runs.length, failures: evidence.failures }, null, 2));
  if (!evidence.passed) process.exitCode = 1;
} finally {
  await server.close();
}
