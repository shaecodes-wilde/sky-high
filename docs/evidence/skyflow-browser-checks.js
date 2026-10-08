/* Run this file in the development browser console at /?skyflow or /.
 * Uses the real Game.step -> DOM Input -> World boundary. Keyboard events are
 * automated/synthetic; this is not human playtesting. Stores stay in memory.
 */
(async () => {
  const g = window.cloudbloom;
  if (!g) throw new Error('Start the development game first');
  const { skyflowInputs, level1SkyflowInputs } = await import('/src/level/skyflowPolicies.ts');
  const { LEVEL1 } = await import('/src/level/level1.ts');
  const { applyPreset, presentationOf } = await import('/src/persist/settings.ts');
  const { World } = await import('/src/sim/World.ts');
  const { MOVEMENT } = await import('/src/config/movement.ts');
  const { blocked } = await import('/src/sim/collision.ts');
  const original = { store: g.store, settings: { ...g.settings }, level: g.level, world: g.world, playground: g.playground };
  cancelAnimationFrame(g.raf);
  const memory = new Map();
  g.store = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const held = new Set();
  let clock = performance.now();
  function key(code, down, time) {
    const e = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'timeStamp', { value: time });
    window.dispatchEvent(e);
    down ? held.add(code) : held.delete(code);
  }
  function frame(f, time) {
    const desired = new Set([
      ...(f.move < 0 ? ['KeyA'] : f.move > 0 ? ['KeyD'] : []),
      ...(f.rollHeld ? ['KeyS'] : []), ...(f.jumpHeld ? ['Space'] : []),
    ]);
    for (const code of [...held]) if (!desired.has(code) || code === 'ShiftLeft' || (code === 'Space' && f.jumpPressed)) key(code, false, time - 0.8);
    for (const code of desired) if (!held.has(code)) key(code, true, time - 0.4);
    if (f.jumpPressed && !held.has('Space')) key('Space', true, time - 0.4);
    if (f.jumpPressed && !f.jumpHeld && held.has('Space')) key('Space', false, time - 0.3);
    if (f.dash) key('ShiftLeft', true, time - 0.2);
  }
  function state(p) { return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, rolling: p.rolling, dashCharges: p.dashCharges, dashTimer: p.dashTimer, rollAngle: p.rollAngle, pumpResult: p.pumpResult }; }
  function begin(section = 0) {
    g.state = 'playing'; g.input.enabled = true; g.input.reset(); held.clear();
    if (original.playground) original.playground.reset(g.world, section);
    else g.world.resetAll();
    g.loop.reset(); clock = performance.now();
    g.renderer.clearTransient(); g.camera.snapTo(g.world.player.x, g.world.player.y, 1);
  }
  function render() {
    g.renderer.render({ world: g.world, camera: g.camera, alpha: 1, pres: presentationOf(g.settings), showPlayer: true, frameDt: 1 / 60 });
    g.devPanel?.update();
  }
  function drive(route, bloom) {
    begin();
    const policy = skyflowInputs(route);
    const events = [], trail = [];
    for (let step = 0; step < 3600 && !g.world.complete && !g.world.dead; step++) {
      if (bloom !== undefined) { g.world.bloom.value = bloom; g.world.bloom.visual = bloom; }
      clock += 1000 / 60; frame(policy(g.world, step), clock); g.step(clock);
      events.push(...g.world.events.map(event => ({ step, event: { ...event } })));
      if (step % 30 === 0) trail.push(state(g.world.player));
    }
    render();
    return { route, time: g.world.completeTime || g.world.time, complete: g.world.complete, dead: g.world.dead, final: state(g.world.player), events, trail, practice: g.practice };
  }
  function sections() {
    return original.playground.sections.map((s, i) => {
      begin(i);
      for (let step = 0; step < 30; step++) { clock += 1000 / 60; frame({ move: 0 }, clock); g.step(clock); }
      const p = g.world.player;
      return { name: s.name, stable: p.grounded && Math.abs(p.y - s.y) < 1 && !blocked(g.world.solids, p), state: state(p), dead: g.world.dead };
    });
  }
  function clearance() {
    begin();
    while (g.world.player.x < 180) { clock += 1000 / 60; frame({ move: 1, rollHeld: true }, clock); g.step(clock); }
    clock += 1000 / 60; frame({ move: 1, rollHeld: false }, clock); g.step(clock);
    const underArch = state(g.world.player);
    while (g.world.player.x < 265) { clock += 1000 / 60; frame({ move: 1, rollHeld: false }, clock); g.step(clock); }
    render();
    return { underArch, afterArch: state(g.world.player), blocked: blocked(g.world.solids, g.world.player) };
  }
  function recordAndReplay() {
    begin(1); g.playground.record(g.world);
    const policy = skyflowInputs('flow'), states = [], events = [];
    for (let step = 0; step < 1200 && g.world.player.x < 1940; step++) {
      clock += 1000 / 60; frame(policy(g.world, step), clock); g.step(clock);
      states.push(state(g.world.player)); events.push(g.world.events.map(e => ({ ...e })));
    }
    g.playground.recording = false; g.input.reset(); held.clear();
    const replayStarted = g.playground.replay(g.world);
    let equal = replayStarted;
    for (let step = 0; step < states.length; step++) {
      clock += 1000 / 60; frame({ move: -1, rollHeld: false }, clock); g.step(clock);
      equal &&= JSON.stringify(state(g.world.player)) === JSON.stringify(states[step]) && JSON.stringify(g.world.events) === JSON.stringify(events[step]);
    }
    render();
    return { equal, steps: states.length, pumps: events.flat().filter(e => e.type === 'pump').length, practice: g.practice, final: state(g.world.player) };
  }
  function parity() {
    const rows = [];
    for (const character of ['poppy', 'puddlewick']) for (const preset of ['gentle', 'standard', 'vivid']) for (const bloom of [0, 1]) {
      g.character = character; g.renderer.setCharacter(character); applyPreset(g.settings, preset);
      const r = drive('skyway', bloom);
      rows.push({ character, preset, bloom, final: r.final, time: r.time, pumps: r.events.filter(e => e.event.type === 'pump').length, skims: r.events.filter(e => e.event.type === 'skim').length });
    }
    return { equal: rows.every(row => JSON.stringify([row.final, row.time, row.pumps, row.skims]) === JSON.stringify([rows[0].final, rows[0].time, rows[0].pumps, rows[0].skims])), rows };
  }
  function wholeLevel() {
    if (g.level.id !== LEVEL1.id || g.playground) throw new Error('Navigate to / for the normal Level 1 browser check');
    g.settings.mode = 'timeTrial'; g.settings.assist = 'none'; g.practice = null;
    g.world = new World(g.level, MOVEMENT, 'timeTrial'); g.renderer.buildLevelState(g.world);
    g.state = 'playing'; g.input.enabled = true; g.input.reset(); held.clear(); clock = performance.now();
    const policy = level1SkyflowInputs(), events = [];
    for (let step = 0; step < 6000 && !g.world.complete && !g.world.dead; step++) {
      clock += 1000 / 60; frame(policy(g.world, step), clock); g.step(clock);
      events.push(...g.world.events.map(event => ({ step, event: { ...event } })));
    }
    render();
    const result = { complete: g.world.complete, dead: g.world.dead, time: g.world.completeTime || g.world.time, splits: g.world.splits, fragments: g.world.fragmentsTaken.filter(Boolean).length, parade: g.world.parade.state, invalid: g.world.runInvalidReason, practice: g.practice, final: state(g.world.player), events };
    if (g.world.complete) g.finish();
    result.records = [...memory]; result.ui = document.body.innerText;
    return result;
  }
  function restore() {
    g.input.reset(); Object.assign(g, original); g.renderer.setCharacter(g.character = g.settings.character);
    g.renderer.buildLevelState(g.world); g.restartRun(); g.lastFrame = performance.now();
    g.raf = requestAnimationFrame(t => g.frame(t));
  }
  async function measurePerformance() {
    if (g.playground) throw new Error('Open / for the Level 1 Parade performance sample');
    cancelAnimationFrame(g.raf); g.ui.closeMenu();
    g.world = g.makeWorld(); g.renderer.buildLevelState(g.world); g.restartRun();
    applyPreset(g.settings, 'vivid');
    const policy = level1SkyflowInputs(); clock = performance.now(); held.clear();
    for (let step = 0; step < 6000 && !(g.world.parade.state === 'active' && g.world.parade.t >= 3); step++) {
      clock += 1000 / 60; frame(policy(g.world, step), clock); g.step(clock);
    }
    const initial = { parade: g.world.parade.state, paradeTime: g.world.parade.t, x: g.world.player.x, y: g.world.player.y };
    g.input.reset(); held.clear(); clock = performance.now(); frame({ move: 1, rollHeld: true }, clock);
    g.lastFrame = performance.now(); g.loop.reset();
    const cpu = [], intervals = []; let previous = performance.now();
    const renderFrame = g.renderer.render;
    return await new Promise(resolve => {
      g.renderer.render = function(...args) {
        g.world.bloom.value = 1; g.world.bloom.visual = 1;
        const before = performance.now(); const value = renderFrame.apply(this, args);
        cpu.push(performance.now() - before); intervals.push(before - previous); previous = before;
        if (cpu.length >= 120) queueMicrotask(() => {
          cancelAnimationFrame(g.raf); g.renderer.render = renderFrame; g.input.reset(); held.clear();
          const stats = a => { const b = [...a].sort((x, y) => x - y); return { mean: a.reduce((x, y) => x + y, 0) / a.length, p95: b[Math.floor(b.length * 0.95)], max: b.at(-1) }; };
          resolve({ frames: cpu.length, preset: 'vivid', forcedBloom: 1, initial,
            final: { x: g.world.player.x, y: g.world.player.y, paradeTime: g.world.parade.t, complete: g.world.complete, dead: g.world.dead },
            renderCpuMs: stats(cpu), frameIntervalMs: stats(intervals), audio: g.audio.status });
        });
        return value;
      };
      g.raf = requestAnimationFrame(t => g.frame(t));
    });
  }
  window.skyflowChecks = { drive, sections, clearance, recordAndReplay, parity, wholeLevel, measurePerformance, begin, frame, state, render, restore, game: g };
  return { ready: true, level: g.level.id, audio: g.audio.status };
})();
