// The Petal Parade: an authored, simulation-timed transformation.
// Anticipation → reveal → peak → release. The bridge becomes solid only
// once it is fully visible (see LevelData.parade.bridgeSolidAt).

export const PARADE_TIMELINE = {
  anticipation: 1.4,
  revealEnd: 2.6,
  peakEnd: 9,
  releaseEnd: 12,
  bridgeFadeStart: 1.4,
};

export type ParadeState = 'dormant' | 'active' | 'done';

export class Parade {
  state: ParadeState = 'dormant';
  t = 0;

  constructor(public bridgeSolidAt: number) {}

  start(): void {
    if (this.state !== 'dormant') return;
    this.state = 'active';
    this.t = 0;
  }

  step(dt: number): void {
    if (this.state !== 'active') return;
    this.t += dt;
    if (this.t >= PARADE_TIMELINE.releaseEnd) this.state = 'done';
  }

  set(done: boolean): void {
    this.state = done ? 'done' : 'dormant';
    this.t = done ? PARADE_TIMELINE.releaseEnd : 0;
  }

  get bridgeSolid(): boolean {
    return this.state === 'done' || (this.state === 'active' && this.t >= this.bridgeSolidAt);
  }

  /** 0..1 opacity of the revealed bridge; reaches 1 exactly when it turns solid. */
  get bridgeAlpha(): number {
    if (this.state === 'done') return 1;
    if (this.state === 'dormant') return 0;
    const a = (this.t - PARADE_TIMELINE.bridgeFadeStart) / (this.bridgeSolidAt - PARADE_TIMELINE.bridgeFadeStart);
    return Math.min(1, Math.max(0, a));
  }

  /** Phase amounts for presentation (all 0..1). */
  get anticipation(): number {
    if (this.state !== 'active') return 0;
    return Math.min(1, this.t / PARADE_TIMELINE.anticipation) * (this.t < PARADE_TIMELINE.revealEnd ? 1 : 0);
  }

  get reveal(): number {
    if (this.state === 'done') return 1;
    if (this.state === 'dormant') return 0;
    const { anticipation, revealEnd } = PARADE_TIMELINE;
    return Math.min(1, Math.max(0, (this.t - anticipation) / (revealEnd - anticipation)));
  }

  /** Overall spectacle intensity: rises through the reveal, holds, then settles to a calmer afterglow. */
  get intensity(): number {
    if (this.state === 'dormant') return 0;
    if (this.state === 'done') return 0.45;
    const { peakEnd, releaseEnd } = PARADE_TIMELINE;
    if (this.t < peakEnd) return this.reveal;
    const k = (this.t - peakEnd) / (releaseEnd - peakEnd);
    return 1 - 0.55 * Math.min(1, k);
  }
}
