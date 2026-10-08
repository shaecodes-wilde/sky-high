import { DEFAULT_BINDINGS, type Action } from '../config/keys';
import { DOUBLE_TAP_DEFAULT_MS, SIM_DT } from '../config/movement';
import type { InputFrame } from '../sim/Player';

type Dir = -1 | 1;

interface QueuedEvent {
  down: boolean;
  action: Action;
  code: string;
  t: number;
}

/**
 * Keyboard → per-step InputFrame. Pure apart from `attach`, so tests can feed
 * synthetic events with explicit timestamps.
 *
 * Double-tap dash rules: two fresh presses of the same direction separated
 * by a release, within `doubleTapMs`. OS key-repeat is ignored. The second
 * press must be processed while airborne; the first may come just before
 * takeoff. Stale taps expire, and everything is cleared by `reset()`.
 */
export class Input {
  doubleTapMs = DOUBLE_TAP_DEFAULT_MS;
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);

  private queue: QueuedEvent[] = [];
  private held = new Set<string>();
  /** Key state as of the queue position being processed (events may batch between steps). */
  private procHeld = new Set<string>();
  private dirOrder: Dir[] = [];
  private jumpHeld = false;
  private tap: { dir: Dir; t: number; released: boolean } | null = null;
  /** Edge-triggered menu/meta actions not consumed by the simulation. */
  private metaPresses: Action[] = [];
  private detach: (() => void) | null = null;
  /** While false (menus open), keys are left alone for the UI. */
  enabled = false;
  /** When set, the next key press is delivered here instead (dash remapping). */
  captureNext: ((code: string) => void) | null = null;

  attach(target: Window): void {
    this.detach?.();
    const onDown = (e: KeyboardEvent) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      if (!this.enabled) return;
      const action = this.actionFor(e.code);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(e.code, action, e.timeStamp);
    };
    const onUp = (e: KeyboardEvent) => {
      const action = this.actionFor(e.code);
      if (!action) return;
      this.release(e.code, action, e.timeStamp);
    };
    const onBlur = () => this.reset();
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    this.detach = () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  actionFor(code: string): Action | null {
    for (const a of Object.keys(this.bindings) as Action[]) {
      if (this.bindings[a].includes(code)) return a;
    }
    return null;
  }

  press(code: string, action: Action, t: number): void {
    if (this.held.has(code)) return; // a repeat we were not told about
    this.held.add(code);
    this.queue.push({ down: true, action, code, t });
    if (action === 'pause' || action === 'checkpoint' || action === 'fullRestart' || action === 'mute') this.metaPresses.push(action);
  }

  release(code: string, action: Action, t: number): void {
    if (!this.held.delete(code)) return;
    this.queue.push({ down: false, action, code, t });
  }

  /** Clears all held keys, buffered presses and tap state (focus loss, restart, character select). */
  reset(): void {
    this.queue.length = 0;
    this.held.clear();
    this.procHeld.clear();
    this.dirOrder.length = 0;
    this.jumpHeld = false;
    this.tap = null;
    this.metaPresses.length = 0;
  }

  /** Drops pending gameplay presses but keeps meta presses (used while paused). */
  discardGameplay(): void {
    this.queue.length = 0;
  }

  takeMeta(): Action[] {
    const out = this.metaPresses.slice();
    this.metaPresses.length = 0;
    return out;
  }

  private dirHeld(dir: Dir): boolean {
    const codes = this.bindings[dir < 0 ? 'left' : 'right'];
    return codes.some((c) => this.procHeld.has(c));
  }

  /**
   * Produces the input for one simulation step. `airborne` and `facing`
   * describe the player at the start of the step.
   */
  sample(airborne: boolean, facing: Dir, now: number, rolling = false): InputFrame {
    let jumpPressed = false;
    let dash: -1 | 0 | 1 = 0;
    let directionPressed: -1 | 0 | 1 = 0;
    let directionReleased: -1 | 0 | 1 = 0;
    const directionEvents: NonNullable<InputFrame['directionEvents']> = [];
    // Include curl intent queued in this batch: the takeoff step must not
    // seed an airborne double tap with a grounded rolling directional pulse.
    // Catch-up steps sample their own physical time boundary. Events from a
    // later boundary stay queued, even though the live keyboard held set has
    // already changed by the time the render frame delivers them.
    const due = this.queue.filter((event) => event.t <= now);
    this.queue = this.queue.filter((event) => event.t > now);
    const groundRoll = !airborne && (rolling || this.bindings.roll.some((code) => this.procHeld.has(code)) || due.some((event) => event.action === 'roll' && event.down));
    if (groundRoll) this.tap = null;
    // Compare press timestamps while processing the queue. Expiring against
    // render time first could discard a timely second tap queued during a
    // slow frame, even though both physical presses were inside the window.
    for (const ev of due) {
      if (ev.down) this.procHeld.add(ev.code);
      else this.procHeld.delete(ev.code);
      if (ev.action === 'left' || ev.action === 'right') {
        const dir: Dir = ev.action === 'left' ? -1 : 1;
        // Direction state counts as one input even with two keys bound.
        const otherKeysHeld = this.bindings[ev.action].some((c) => c !== ev.code && this.procHeld.has(c));
        if (ev.down) {
          this.dirOrder = this.dirOrder.filter((d) => d !== dir);
          this.dirOrder.push(dir);
          if (otherKeysHeld) continue; // not a fresh press of this direction
          directionPressed = dir;
          directionEvents.push({ dir, down: true, age: Math.min(SIM_DT, Math.max(0, (now - ev.t) / 1000)) });
          if (groundRoll) continue;
          const tap = this.tap;
          if (tap && tap.dir === dir && tap.released && ev.t >= tap.t && ev.t - tap.t <= this.doubleTapMs) {
            this.tap = null;
            if (airborne) {
              dash = dir;
              continue;
            }
          }
          this.tap = { dir, t: ev.t, released: false };
        } else {
          if (!this.dirHeld(dir)) {
            this.dirOrder = this.dirOrder.filter((d) => d !== dir);
            directionReleased = dir;
            directionEvents.push({ dir, down: false, age: Math.min(SIM_DT, Math.max(0, (now - ev.t) / 1000)) });
            if (this.tap && this.tap.dir === dir) this.tap.released = true;
          }
        }
      } else if (ev.action === 'jump') {
        if (ev.down) {
          jumpPressed = true;
          this.jumpHeld = true;
        } else if (!this.bindings.jump.some((c) => this.procHeld.has(c))) {
          this.jumpHeld = false;
        }
      } else if (ev.action === 'dash' && ev.down) {
        // Both Shift keys are one logical button. Pressing its other binding
        // while already held is not a fresh command.
        if (this.bindings.dash.some((c) => c !== ev.code && this.procHeld.has(c))) continue;
        const held = this.dirOrder[this.dirOrder.length - 1];
        dash = held ?? facing;
      }
    }
    if (this.tap && now - this.tap.t > this.doubleTapMs) this.tap = null;
    const move = (this.dirOrder[this.dirOrder.length - 1] ?? 0) as -1 | 0 | 1;
    const rollHeld = this.bindings.roll.some((code) => this.procHeld.has(code));
    return { move, jumpHeld: this.jumpHeld, jumpPressed, dash, rollHeld, directionPressed, directionReleased, directionEvents };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }
}
