// Gently damped follow camera, stepped with the simulation so it can be
// interpolated. Looks ahead in the direction of travel; a vertical dead zone
// keeps it from bobbing with every jump. Never rolls or zooms.

export const VIEW_W = 480;
export const VIEW_H = 270;

export const CAMERA_CONFIG = {
  lookAheadPerSpeed: 0.42,
  lookAheadMax: 110,
  lookAheadIdle: 28,
  lookAheadRate: 2.2,
  followRateX: 7,
  /** Player sits this far below centre when standing. */
  groundOffset: 36,
  deadZoneUp: 64,
  deadZoneDown: 46,
  followRateY: 3.2,
  fallRateY: 7,
};

export class CameraRig {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  private look = 0;
  private anchorY = 0;
  shake = 0;

  constructor(
    private minX: number,
    private maxX: number,
    private minY: number,
  ) {}

  snapTo(px: number, py: number, facing: number): void {
    this.look = facing * CAMERA_CONFIG.lookAheadIdle;
    this.x = this.clampX(px + this.look);
    this.anchorY = py + CAMERA_CONFIG.groundOffset;
    this.y = Math.max(this.minY, this.anchorY);
    this.prevX = this.x;
    this.prevY = this.y;
    this.shake = 0;
  }

  private clampX(x: number): number {
    return Math.min(this.maxX - VIEW_W / 2, Math.max(this.minX + VIEW_W / 2, x));
  }

  step(dt: number, px: number, py: number, vx: number, facing: number, grounded: boolean): void {
    const c = CAMERA_CONFIG;
    this.prevX = this.x;
    this.prevY = this.y;
    const want = Math.abs(vx) > 20 ? Math.max(-c.lookAheadMax, Math.min(c.lookAheadMax, vx * c.lookAheadPerSpeed)) : facing * c.lookAheadIdle;
    this.look += (want - this.look) * (1 - Math.exp(-c.lookAheadRate * dt));
    const tx = this.clampX(px + this.look);
    this.x += (tx - this.x) * (1 - Math.exp(-c.followRateX * dt));

    const rel = py - this.anchorY;
    if (grounded) this.anchorY = py + c.groundOffset;
    else if (rel > c.deadZoneUp - c.groundOffset) this.anchorY = py - (c.deadZoneUp - c.groundOffset);
    else if (rel < -c.deadZoneDown - c.groundOffset) this.anchorY = py + c.deadZoneDown + c.groundOffset;
    const ty = Math.max(this.minY, this.anchorY);
    const rate = ty < this.y ? c.fallRateY : c.followRateY;
    this.y += (ty - this.y) * (1 - Math.exp(-rate * dt));
    // Never let a fast fall leave the player off-screen.
    const margin = VIEW_H / 2 - 30;
    if (py < this.y - margin) this.y = Math.max(this.minY, py + margin);
    this.shake = Math.max(0, this.shake - dt * 3);
  }
}
