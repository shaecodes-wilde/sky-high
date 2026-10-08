import { AudioEngine } from '../audio/AudioEngine';
import { DEFAULT_BINDINGS, keyLabel } from '../config/keys';
import { movementFor, SIM_DT } from '../config/movement';
import { FixedLoop } from '../core/FixedLoop';
import { Input } from '../input/Input';
import { LEVEL1 } from '../level/level1';
import type { LevelData } from '../level/types';
import type { PlaygroundSession } from '../dev/playground';
import { formatDelta, formatTime, getRecord, recordKey, safeStorage, submitCleanRun, type KVStore } from '../persist/records';
import { applyPreset, loadSettings, presentationOf, saveSettings, type Settings } from '../persist/settings';
import { CameraRig, VIEW_H } from '../render/CameraRig';
import type { CharacterId } from '../render/characters';
import { GameRenderer } from '../render/GameRenderer';
import { World, type WorldEvent } from '../sim/World';
import type { UI } from '../ui/UI';

type State = 'title' | 'setup' | 'select' | 'playing' | 'paused' | 'complete';

/**
 * Owns the loop and wires input → simulation → (renderer, audio, UI).
 * The simulation runs at a fixed 60 Hz regardless of display rate.
 */
export class Game {
  private store: KVStore = safeStorage();
  private settings: Settings = loadSettings(this.store);
  private input = new Input();
  private audio = new AudioEngine();
  private loop = new FixedLoop(SIM_DT);
  private world: World;
  private camera: CameraRig;
  private state: State = 'title';
  private character: CharacterId;
  private lastFrame = performance.now();
  private raf = 0;
  private titleTime = 0;
  /** Time Trial: null while the attempt is clean, otherwise why it became practice. */
  private practice: string | null = null;
  private completeTimer = -1;
  private seedsTaken = 0;
  private settingsReturn: () => void = () => {};
  private readonly level: LevelData;
  private readonly playground?: PlaygroundSession;
  private devPanel?: { update: () => void; dispose: () => void };

  constructor(
    private renderer: GameRenderer,
    private ui: UI,
    options: { level?: LevelData; playground?: PlaygroundSession } = {},
  ) {
    this.level = options.level ?? LEVEL1;
    this.playground = options.playground;
    this.character = this.settings.character;
    this.world = this.makeWorld();
    this.camera = new CameraRig(this.level.minX, this.level.maxX, this.level.killY + VIEW_H / 2 - 30);
    this.renderer.buildLevel(this.world);
    this.renderer.setCharacter(this.character);
    this.camera.snapTo(this.level.start.x + 120, this.level.start.y, 1);
    this.applySettings();
    this.input.attach(window);
    this.ui.onPreset = (n) => applyPreset(this.settings, n);

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('blur', () => this.onBlur());
    this.onResize();
    this.ui.showTitle(() => void this.startFromTitle());
    if (this.playground) this.devPanel = this.playground.mount(() => this.world, () => {
      this.input.reset();
      this.loop.reset();
      this.renderer.clearTransient();
      this.camera.snapTo(this.world.player.x, this.world.player.y, 1);
    });
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private makeWorld(): World {
    return new World(this.level, movementFor(this.settings.assist), this.playground ? 'adventure' : this.settings.mode);
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio.musicVolume = s.musicVolume;
    this.audio.sfxVolume = s.sfxVolume;
    this.audio.setMuted(s.muted);
    this.input.doubleTapMs = s.doubleTapMs;
    const dashCodes = s.dashKey === 'ShiftLeft' ? DEFAULT_BINDINGS.dash : [s.dashKey];
    this.input.bindings.dash = dashCodes;
    this.ui.dashLabel = keyLabel(s.dashKey);
    saveSettings(this.store, s);
  }

  private onResize(): void {
    this.renderer.resize();
    this.ui.layout(this.renderer.viewRect());
  }

  private onBlur(): void {
    this.input.reset();
    if (this.state === 'playing') this.pause('focus lost');
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.input.reset();
      if (this.state === 'playing') this.pause('tab hidden');
    }
    this.loop.reset();
    this.lastFrame = performance.now();
  }

  // ── flow ────────────────────────────────────────────────────────────────
  private async startFromTitle(): Promise<void> {
    await this.audio.unlock();
    this.refreshAudioBanner();
    this.audio.playMusic('title');
    this.audio.play('uiSelect');
    this.showSetup();
  }

  private refreshAudioBanner(): void {
    if (this.audio.status === 'blocked') {
      this.ui.banner('🔇 Sound is blocked by the browser — click to enable', () => void this.audio.unlock().then(() => this.refreshAudioBanner()));
    } else if (this.audio.status === 'unsupported') {
      this.ui.banner('Sound is unavailable in this browser (the game is fully playable without it)');
    } else this.ui.banner(null);
  }

  private showSetup(): void {
    this.state = 'setup';
    this.ui.showSetup(
      this.settings,
      () => {
        this.applySettings();
        this.audio.play('uiMove');
      },
      () => this.showSelect(),
      () => this.openSettings(() => this.showSetup()),
      () => {
        this.state = 'title';
        this.ui.showTitle(() => void this.startFromTitle());
      },
    );
  }

  private showSelect(): void {
    this.state = 'select';
    this.input.reset();
    this.ui.showSelect(
      this.character,
      (c) => this.begin(c),
      () => this.showSetup(),
      () => this.audio.play('uiMove'),
    );
  }

  private openSettings(back: () => void): void {
    this.settingsReturn = back;
    this.ui.showSettings(
      this.settings,
      () => this.applySettings(),
      (done) => {
        this.input.captureNext = (code) => {
          if (code !== 'Escape' && !['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyM', 'KeyP', 'Backspace'].includes(code)) this.settings.dashKey = code;
          this.applySettings();
          done();
        };
      },
      () => this.settingsReturn(),
    );
  }

  private begin(c: CharacterId): void {
    this.character = c;
    this.settings.character = c;
    this.applySettings();
    this.audio.play('uiSelect');
    this.audio.setCharacter(c);
    this.renderer.setCharacter(c);
    // Mode or assist may have changed: rebuild the simulation state.
    if (this.world.mode !== this.settings.mode || this.world.player.cfg !== movementFor(this.settings.assist)) {
      this.world = this.makeWorld();
      this.renderer.buildLevelState(this.world);
    }
    this.renderer.setSignsVisible(this.settings.mode === 'adventure');
    this.restartRun();
    this.ui.closeMenu();
    this.ui.setHudVisible(true);
    if (this.playground) this.ui.toast('Developer playground · section resets and replays cannot set records', 3);
    else if (this.settings.mode === 'adventure') this.ui.caption('The sky has forgotten its morning song…', 4);
    else this.ui.toast('Time Trial — clean run from the start', 2.5);
  }

  private restartRun(): void {
    this.world.resetAll();
    this.playground?.reset(this.world);
    this.input.reset();
    this.loop.reset();
    this.camera.snapTo(this.world.player.x, this.world.player.y, 1);
    this.renderer.clearTransient();
    this.practice = this.playground ? 'developer playground' : null;
    this.completeTimer = -1;
    this.seedsTaken = 0;
    this.audio.setFragments(0);
    this.audio.playMusic('play');
    this.audio.restartArrangement();
    this.audio.resume();
    this.state = 'playing';
    this.input.enabled = true;
    this.lastFrame = performance.now();
  }

  private retryCheckpoint(): void {
    if (this.world.complete) return;
    if (this.settings.mode === 'timeTrial' && !this.practice) this.markPractice('checkpoint retry');
    if (this.playground) this.playground.reset(this.world);
    else this.world.respawn();
    this.handleEvents(this.world.events);
    this.camera.snapTo(this.world.player.x, this.world.player.y, 1);
    this.input.reset();
  }

  private markPractice(reason: string): void {
    if (this.settings.mode !== 'timeTrial' || this.practice) return;
    this.practice = reason;
    this.ui.toast(`Practice attempt (${reason}) — <kbd>Backspace</kbd> for a clean run`, 3);
  }

  private pause(reason: string): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.reset();
    this.audio.pause();
    if (!this.world.complete) this.markPractice(reason === 'menu' ? 'paused' : reason);
    this.showPauseMenu();
  }

  private showPauseMenu(): void {
    this.ui.showPause(this.settings.mode, this.settings.mode === 'timeTrial' && this.practice ? `This attempt is now practice (${this.practice}). Its time won’t be recorded.` : null, {
      resume: () => this.resume(),
      checkpoint: () => {
        this.resume();
        this.retryCheckpoint();
      },
      restart: () => {
        this.ui.closeMenu();
        this.restartRun();
      },
      settings: () => this.openSettings(() => this.showPauseMenu()),
      quit: () => this.toTitle(),
    });
  }

  private resume(): void {
    this.ui.closeMenu();
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.audio.resume();
    this.loop.reset();
    this.lastFrame = performance.now();
  }

  private toTitle(): void {
    this.state = 'title';
    this.input.enabled = false;
    this.input.reset();
    this.audio.resume();
    this.audio.playMusic('title');
    this.audio.setTier(0);
    this.audio.restartArrangement();
    this.ui.setHudVisible(false);
    this.world.resetAll();
    this.renderer.clearTransient();
    this.camera.snapTo(this.level.start.x + 120, this.level.start.y, 1);
    this.ui.showTitle(() => void this.startFromTitle());
  }

  private finish(): void {
    const w = this.world;
    const mode = this.settings.mode;
    const key = recordKey(this.level.id, this.settings.assist);
    let result = { best: getRecord(this.store, key).bestTime, previousBest: getRecord(this.store, key).bestTime, newBest: false, bestSplits: getRecord(this.store, key).bestSplits };
    // All legitimate lanes cross progression gates; respawn flowers are optional.
    if (mode === 'timeTrial' && this.practice === null) {
      this.practice = w.runInvalidReason ?? (!w.progressionComplete ? 'skipped split gates' : null);
    }
    const clean = !this.playground && mode === 'timeTrial' && this.practice === null;
    if (clean) {
      const prevSplits = result.bestSplits;
      const r = submitCleanRun(this.store, key, w.completeTime, w.splits);
      result = { best: r.record.bestTime, previousBest: r.previousBest, newBest: r.newBest, bestSplits: prevSplits };
    }
    this.state = 'complete';
    this.input.enabled = false;
    this.ui.showComplete(
      {
        mode,
        time: w.completeTime,
        clean,
        practiceReason: this.practice,
        best: result.best,
        previousBest: result.previousBest,
        newBest: result.newBest,
        splits: w.splits,
        bestSplits: result.bestSplits,
        seeds: [w.seedsTaken.filter(Boolean).length, w.seedsTaken.length],
        keepsakes: [w.keepsakesTaken.filter(Boolean).length, w.keepsakesTaken.length],
        fragments: w.fragmentsTaken.filter(Boolean).length,
        character: this.character,
      },
      () => {
        this.ui.closeMenu();
        this.restartRun();
      },
      () => this.toTitle(),
    );
  }

  // ── loop ────────────────────────────────────────────────────────────────
  private frame(now: number): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    let alpha = 1;

    for (const a of this.input.takeMeta()) this.onMeta(a);

    if (this.state === 'playing') {
      alpha = this.loop.advance(dt, () => this.step());
      if (this.world.complete) {
        this.completeTimer += dt;
        if (this.completeTimer > 3.6) this.finish();
      }
    } else if (this.state === 'title' || this.state === 'setup' || this.state === 'select') {
      // Gentle drift over the opening garden behind the menus.
      this.titleTime += dt;
      this.camera.prevX = this.camera.x;
      this.camera.prevY = this.camera.y;
      this.camera.x = this.level.start.x + 200 + Math.sin(this.titleTime * 0.12) * 140;
      this.camera.y = 150;
    } else if (this.state === 'complete') {
      alpha = this.loop.advance(dt, () => this.step());
    }

    this.renderer.render({
      world: this.world,
      camera: this.camera,
      alpha,
      pres: presentationOf(this.settings),
      showPlayer: this.state === 'playing' || this.state === 'paused' || this.state === 'complete',
      frameDt: this.state === 'paused' ? 0 : dt,
    });
    this.ui.tick(dt);
    this.devPanel?.update();
    if (this.state === 'playing' || this.state === 'paused') {
      this.ui.updateHud(this.settings.mode, this.world.fragmentsTaken.filter(Boolean).length, this.seedsTaken, this.world.complete ? this.world.completeTime : this.world.time, this.practice);
      this.ui.setBloom(this.world.bloom.tier); // presentation only
    }
  }

  private onMeta(a: string): void {
    if (a === 'mute') {
      this.settings.muted = !this.settings.muted;
      this.applySettings();
      this.ui.toast(this.settings.muted ? 'Sound muted' : 'Sound on', 1.2);
      return;
    }
    if (this.state !== 'playing') return;
    if (a === 'pause') this.pause('menu');
    else if (a === 'checkpoint') this.retryCheckpoint();
    else if (a === 'fullRestart') {
      this.restartRun();
      this.ui.toast(this.settings.mode === 'timeTrial' ? 'Clean run — go!' : 'Back to the beginning', 1.5);
    }
  }

  private step(): void {
    const w = this.world;
    const p = w.player;
    const input = this.state === 'playing' ? this.input.sample(!p.grounded, p.facing, performance.now()) : { move: 0 as const, jumpHeld: false, jumpPressed: false, dash: 0 as const };
    w.step(this.playground && this.state === 'playing' ? this.playground.input(input) : input);
    if (this.playground && w.events.some((e) => e.type === 'respawn')) this.playground.restoreSectionSpawn(w);
    if (this.state === 'playing') this.playground?.afterStep(w);
    this.camera.step(SIM_DT, p.x, p.y, p.vx, p.facing, p.grounded, p.vy);
    this.handleEvents(w.events);
  }

  private handleEvents(events: readonly WorldEvent[]): void {
    if (!events.length) {
      this.audio.setTier(this.world.bloom.tier);
      return;
    }
    const pres = presentationOf(this.settings);
    this.renderer.onEvents(events, pres);
    const A = this.audio;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          A.play('jump');
          break;
        case 'land':
          A.play('land', { impact: e.impact });
          break;
        case 'dash':
          A.play('dash');
          break;
        case 'skim':
          A.play('skim', { speed: e.speed });
          break;
        case 'spring':
          A.play(e.boosted ? 'springBoost' : 'spring');
          break;
        case 'springBoost':
          A.play('springBoost');
          break;
        case 'wall':
          A.play('wall');
          break;
        case 'ring':
          A.play('ring');
          break;
        case 'seed':
          this.seedsTaken++;
          A.play('seed', { chain: e.chain });
          break;
        case 'fragment': {
          const n = this.world.fragmentsTaken.filter(Boolean).length;
          A.play('fragment', { index: e.index });
          A.setFragments(n);
          this.ui.toast(`♪ Melody fragment ${n}/3 — the sky hums along`);
          break;
        }
        case 'keepsake':
          A.play('keepsake');
          this.ui.toast(`Keepsake found: ${this.level.keepsakes[e.index].name}`);
          break;
        case 'checkpoint':
          if (this.settings.mode === 'adventure') A.play('checkpoint');
          break;
        case 'split': {
          if (!this.playground && this.settings.mode === 'timeTrial') {
            A.play('checkpoint');
            const rec = getRecord(this.store, recordKey(this.level.id, this.settings.assist));
            const best = rec.bestSplits[e.index] ?? null;
            const now = e.time;
            const delta = best !== null ? ` <span class="${now - best <= 0 ? 'ahead' : 'behind'}">${formatDelta(now - best)}</span>` : '';
            this.ui.toast(`Split ${e.index + 1} · ${formatTime(now)}${delta}`);
          }
          break;
        }
        case 'death':
          A.play('death');
          this.markPractice('death');
          break;
        case 'progressionInvalid':
          this.markPractice(e.reason);
          break;
        case 'respawn':
          A.play('respawn');
          this.camera.snapTo(this.world.player.x, this.world.player.y, 1);
          break;
        case 'paradeStart':
          A.play('parade');
          A.cue('parade');
          if (this.settings.mode === 'adventure') this.ui.caption('The great cloud flower is waking…', 3.5);
          break;
        case 'goal':
          A.play('goal');
          A.cue('ending');
          this.completeTimer = 0;
          this.ui.caption('Good morning, sun.', 3.2);
          break;
      }
    }
    A.setTier(this.world.bloom.tier);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.audio.dispose();
    this.devPanel?.dispose();
  }
}
