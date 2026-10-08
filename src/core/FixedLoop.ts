// Fixed-timestep accumulator. Rendering interpolates with the returned alpha.

export class FixedLoop {
  private acc = 0;

  constructor(
    readonly step: number,
    /** Upper bound on catch-up steps per frame (avoids a spiral of death). */
    readonly maxSteps = 6,
    /** Frame deltas above this are treated as a hitch, not simulated time. */
    readonly maxFrame = 0.1,
  ) {}

  /** Runs whole steps for `frameDt` seconds of real time; returns interpolation alpha in [0, 1). */
  advance(frameDt: number, stepFn: () => void): number {
    this.acc += Math.min(Math.max(frameDt, 0), this.maxFrame);
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      stepFn();
      this.acc -= this.step;
      n++;
    }
    if (n === this.maxSteps && this.acc >= this.step) this.acc = 0;
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
