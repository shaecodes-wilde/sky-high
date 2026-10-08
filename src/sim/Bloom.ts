// Bloom: a presentation-only measure of flow. It never feeds back into
// physics, route availability or level geometry.

export const BLOOM_CONFIG = {
  /** Gain per pixel of new forward progress, only while moving briskly. */
  progressGain: 0.0007,
  progressMinSpeed: 0.7, // × runSpeed
  sustainGain: 0.05, // per second above run speed
  idleDecay: 0.07, // per second while slow
  cruiseDecay: 0.012,
  events: { spring: 0.05, ring: 0.07, dashLand: 0.04, fragment: 0.12, seedChain: 0.006 },
  /** Tier thresholds with hysteresis: [enter, leave]. */
  tiers: [
    [0.34, 0.24],
    [0.7, 0.58],
  ] as [number, number][],
  visualRate: 0.9, // smoothing of the displayed value (1/s)
  /** Speed and event bonuses only count near the furthest point reached, so
   *  dashing or bouncing in place cannot charge Bloom. */
  frontierSlack: 80,
};

export type BloomEvent = keyof typeof BLOOM_CONFIG.events;

export class Bloom {
  value = 0;
  /** Smoothed value for rendering. */
  visual = 0;
  tier: 0 | 1 | 2 = 0;
  private maxX = -Infinity;

  reset(x: number): void {
    this.value = 0;
    this.visual = 0;
    this.tier = 0;
    this.maxX = x;
  }

  /** Respawning keeps the mood but resets the progress mark. */
  rebase(x: number): void {
    this.maxX = Math.max(this.maxX, x);
  }

  step(dt: number, x: number, vx: number, runSpeed: number): void {
    const c = BLOOM_CONFIG;
    const speed = Math.abs(vx);
    let v = this.value;
    if (x > this.maxX) {
      if (vx >= runSpeed * c.progressMinSpeed) v += (x - this.maxX) * c.progressGain;
      this.maxX = x;
    }
    if (speed > runSpeed * 1.05 && vx > 0 && x >= this.maxX - c.frontierSlack) v += c.sustainGain * dt;
    v -= (speed < runSpeed * 0.5 ? c.idleDecay : c.cruiseDecay) * dt;
    this.value = Math.min(1, Math.max(0, v));
    this.updateTier();
    this.visual += (this.value - this.visual) * (1 - Math.exp(-c.visualRate * dt));
  }

  add(e: BloomEvent, x: number): void {
    if (e !== 'fragment' && x < this.maxX - BLOOM_CONFIG.frontierSlack) return;
    this.value = Math.min(1, this.value + BLOOM_CONFIG.events[e]);
    this.updateTier();
  }

  private updateTier(): void {
    const [[up1, down1], [up2, down2]] = BLOOM_CONFIG.tiers;
    if (this.tier === 0 && this.value >= up1) this.tier = 1;
    if (this.tier === 1 && this.value >= up2) this.tier = 2;
    if (this.tier === 2 && this.value < down2) this.tier = 1;
    if (this.tier === 1 && this.value < down1) this.tier = 0;
  }
}
