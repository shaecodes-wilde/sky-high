import type {
  DecorDef,
  HazardDef,
  KeepsakeDef,
  LevelData,
  NpcDef,
  PlatformDef,
  PlatformKind,
  PointDef,
  RingDef,
  RouteLink,
  RouteMove,
  SignDef,
  SpringDef,
  WindDef,
} from './types';
import { MOVEMENT, SIM_DT } from '../config/movement';
import { Player } from '../sim/Player';
import type { Solid } from '../sim/collision';

// "The Morning That Forgot to Happen" — hand-authored. Every gap on the
// normal route is checked against measured controller reach in
// tests/level.test.ts; adjust numbers here and re-run the tests.

const ISLAND_BOTTOM = -120;
const CLOUD_THICKNESS = 8;

class Builder {
  platforms: PlatformDef[] = [];
  springs: SpringDef[] = [];
  rings: RingDef[] = [];
  winds: WindDef[] = [];
  hazards: HazardDef[] = [];
  seeds: PointDef[] = [];
  fragments: PointDef[] = [];
  keepsakes: KeepsakeDef[] = [];
  checkpoints: PointDef[] = [];
  signs: SignDef[] = [];
  npcs: NpcDef[] = [];
  decor: DecorDef[] = [];
  route: RouteLink[] = [];
  express: RouteLink[] = [];

  private add(kind: PlatformKind, x0: number, x1: number, top: number, extra: Partial<PlatformDef> = {}): number {
    const id = this.platforms.length;
    const bottom = kind === 'island' ? ISLAND_BOTTOM : top - CLOUD_THICKNESS;
    this.platforms.push({ id, kind, x0, x1, top, bottom, ...extra });
    return id;
  }
  island(x0: number, x1: number, top: number): number {
    return this.add('island', x0, x1, top);
  }
  cloud(x0: number, x1: number, top: number, recovery = false): number {
    return this.add('cloud', x0, x1, top, recovery ? { recovery } : {});
  }
  petal(x0: number, x1: number, top: number): number {
    return this.add('petal', x0, x1, top, { parade: true });
  }
  flower(x0: number, x1: number, top: number): number {
    return this.add('flower', x0, x1, top);
  }
  spring(x: number, top: number, parade = false): void {
    this.springs.push(parade ? { x, top, parade } : { x, top });
  }
  ring(x: number, y: number): void {
    this.rings.push({ x, y });
  }
  wind(x: number, y: number, w: number, h: number, speed = 250): void {
    this.winds.push({ x, y, w, h, dir: 1, speed });
  }
  thistles(x: number, y: number, w: number): void {
    this.hazards.push({ x, y, w });
  }
  /** Seeds along a parabolic arc — graceful collectible lines. */
  arc(x0: number, y0: number, x1: number, y1: number, lift: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.seeds.push({ x: Math.round(x0 + (x1 - x0) * t), y: Math.round(y0 + (y1 - y0) * t + lift * 4 * t * (1 - t)) });
    }
  }
  row(x0: number, x1: number, y: number, n: number): void {
    this.arc(x0, y, x1, y, 0, n);
  }
  /** Sample the production controller against the already-authored geometry. */
  jumpGuide(x: number, y: number, endX: number, holdSteps: number, dashStep = -1): void {
    const player = new Player(MOVEMENT);
    player.reset(x, y);
    player.grounded = true;
    player.vx = MOVEMENT.runSpeed;
    const solids: Solid[] = this.platforms.map(p => ({
      id: p.id, kind: p.kind, x: p.x0, y: p.bottom, w: p.x1 - p.x0,
      h: p.top - p.bottom, oneWay: p.kind !== 'island', active: !p.parade,
    }));
    for (let step = 0; step < 80; step++) {
      player.step(SIM_DT, { move: 1, jumpHeld: step < holdSteps, jumpPressed: step === 0, dash: step === dashStep ? 1 : 0 }, solids, []);
      if (player.x > endX || (step > 0 && player.grounded) || (step > 4 && player.y < y - 30)) break;
      if (step % 6 === 3) this.seeds.push({ x: Math.round(player.x), y: Math.round(player.y + 12) });
    }
  }
  link(from: number, to: number, move: RouteMove, note?: string): void {
    this.route.push(note ? { from, to, move, note } : { from, to, move });
  }
  xlink(from: number, to: number, move: RouteMove, note?: string): void {
    this.express.push(note ? { from, to, move, note } : { from, to, move });
  }
  flowers(x0: number, x1: number, y: number, n: number, seed: number): void {
    for (let i = 0; i < n; i++) {
      const v = (seed * 97 + i * 31) % 17;
      this.decor.push({ kind: i % 3 === 2 ? 'tuft' : 'flower', x: Math.round(x0 + ((x1 - x0) * (i + 0.5)) / n + ((v % 5) - 2) * 2), y, v });
    }
  }
}

const b = new Builder();

// ── 1. Sleepy lavender garden: run, jump, short safe gaps ──────────────────
// Phrase 1: Find Your Feet — compare short hops and full jumps safely.
const p1 = b.island(-220, 360, 64);
b.signs.push({ x: 92, y: 64, text: 'THE SKY FORGOT\nITS SONG' });
b.signs.push({ x: 210, y: 64, text: 'A D  RUN\nSPACE  JUMP' });
b.flowers(-200, 80, 64, 7, 1);
b.row(150, 330, 76, 5);
b.decor.push({ kind: 'mushroom', x: -30, y: 64, v: 3 });
const p2 = b.island(360, 470, 88);
b.link(p1, p2, 'jump', 'step up');
b.flowers(380, 460, 88, 3, 2);
const p3 = b.cloud(504, 632, 88);
b.link(p2, p3, 'jump');
b.jumpGuide(455, 88, 530, 8);
const p4 = b.cloud(660, 772, 108);
b.link(p3, p4, 'jump');
b.jumpGuide(616, 88, 702, 60);
const p5 = b.island(816, 1100, 80);
b.link(p4, p5, 'jump');
b.arc(766, 124, 810, 96, 14, 3);
// Lower garden catches early misses and climbs back out.
const r1 = b.island(460, 790, 30);
const r1b = b.cloud(735, 790, 62, true);
b.link(r1, r1b, 'jump', 'recovery');
b.link(r1b, p5, 'jump', 'recovery');
b.flowers(480, 720, 30, 8, 3);
b.keepsakes.push({ x: 520, y: 44, name: 'Chipped Teacup', icon: 'teacup' });

// ── 2. Dash, springcaps and a dewdrop ring ────────────────────────────────
// Phrase 2: First Cloud Skim — wide dash receiver, then a speed-carrying launch.
b.checkpoints.push({ x: 1040, y: 80 });
b.signs.push({ x: 950, y: 80, text: 'IN THE AIR:\nTAP TAP OR SHIFT\nTO DASH' });
b.flowers(840, 930, 80, 4, 4);
const p6 = b.cloud(1200, 1520, 80);
b.link(p5, p6, 'dash', 'first dash gap');
b.jumpGuide(1090, 80, 1220, 60, 8);
const r2 = b.cloud(1100, 1218, 40, true);
b.link(r2, p6, 'jump', 'recovery: climb through the cloud');
b.signs.push({ x: 1330, y: 80, text: 'MUSHROOMS BOUNCE\nJUMP ON CONTACT\nTO SOAR' });
b.spring(1488, 80);
// Spring Fork: the one-way receiver removes the old 96px sidewall only
// 18px beyond contact. Normal rebounds carry 132–300px/s through cleanly.
const p7 = b.cloud(1510, 1810, 172);
b.link(p6, p7, 'spring');
b.arc(1478, 130, 1478, 190, 0, 3);
b.flowers(1560, 1700, 172, 6, 5);
b.signs.push({ x: 1610, y: 172, text: 'DEWDROPS\nRESTORE YOUR DASH' });
const springHigh = b.cloud(1580, 1800, 222);
b.xlink(p6, springHigh, 'springBoost', 'optional high spring fork');
b.row(1610, 1760, 238, 5);
// Phrase 4: Wind and Dewdrop Flow — refill on the measured air-dash arc.
b.ring(1870, 224);
const p8 = b.cloud(1935, 2120, 168);
b.link(p7, p8, 'ring', 'dash, refill, dash');
b.xlink(springHigh, p8, 'ring', 'high fork rejoins without reversing');
b.arc(1810, 202, 1950, 196, 25, 5);
// Experiment floor: misses land here and a springcap lifts you onward.
const r3 = b.island(1800, 2000, 90);
b.spring(1950, 90);
b.link(r3, p8, 'spring', 'recovery');
b.flowers(1810, 1920, 90, 4, 6);

// ── 3. Development: standard route + optional upper express ───────────────
// Phrase 5: Express Lane — boost above the lower route and rejoin at speed.
b.checkpoints.push({ x: 2060, y: 168 });
const p9 = b.island(2180, 2420, 120);
b.link(p8, p9, 'jump');
b.thistles(2262, 120, 30);
b.signs.push({ x: 2210, y: 120, text: 'INK THISTLES\nSTING' });
b.arc(2250, 134, 2306, 134, 26, 4);
b.fragments.push({ x: 2360, y: 146 });
b.wind(2400, 124, 300, 52);
b.signs.push({ x: 2330, y: 120, text: 'RIBBONS\nCARRY YOU' });
const p10 = b.cloud(2510, 2780, 112);
b.link(p9, p10, 'wind');
b.arc(2440, 150, 2560, 134, 16, 5);
const r4 = b.cloud(2440, 2700, 70, true);
b.link(r4, p10, 'jump', 'recovery: up through the cloud');
const p11 = b.island(2820, 3100, 96);
b.link(p10, p11, 'jump');
b.checkpoints.push({ x: 2860, y: 96 });
b.npcs.push({
  x: 2990,
  y: 96,
  lines: {
    puddlewick: 'I HAVE DRESSED\nAPPROPRIATELY FOR\nTHE ALTITUDE.',
    poppy: 'MAYBE THE SKY\nJUST NEEDS SOMEONE\nTO SING FIRST.',
  },
});
b.flowers(2830, 2960, 96, 6, 7);
b.decor.push({ kind: 'lamp', x: 2940, y: 96, v: 0 });
b.spring(3070, 96);
const p12 = b.cloud(3110, 3280, 170);
b.link(p11, p12, 'spring');
const p13 = b.island(3320, 3700, 180);
b.link(p12, p13, 'jump');
b.thistles(3480, 180, 36);
b.arc(3470, 196, 3530, 196, 28, 4);
b.flowers(3340, 3460, 180, 5, 8);
// Express: a buffered spring jump from p9 reaches the upper clouds.
b.spring(2392, 120);
const u1 = b.cloud(2415, 2580, 240);
b.xlink(p9, u1, 'springBoost');
b.ring(2640, 268);
const u2 = b.cloud(2700, 2880, 248);
b.xlink(u1, u2, 'ring');
b.wind(2860, 252, 420, 50, 260);
b.ring(2980, 272);
const u3 = b.cloud(3050, 3300, 232);
b.xlink(u2, u3, 'wind', 'ribbon plus dash');
b.xlink(u3, p13, 'drop');
b.row(2440, 2540, 256, 4);
b.arc(2880, 270, 3060, 260, 20, 7);
// Secret: a boosted bounce to a high cloud with a keepsake.
b.spring(3640, 180);
const s1 = b.cloud(3560, 3650, 330);
b.keepsakes.push({ x: 3604, y: 346, name: 'Duck Feather', icon: 'feather' });
b.flowers(3570, 3640, 330, 3, 9);
void s1;

const p14 = b.cloud(3740, 3915, 150);
b.link(p13, p14, 'jump');
const p15 = b.cloud(3940, 4120, 130);
b.link(p14, p15, 'jump');
b.arc(3706, 196, 3756, 166, 12, 3);
b.arc(3906, 166, 3956, 146, 12, 3);

// ── 4. Midpoint: The Petal Parade ─────────────────────────────────────────
// Phrase 6: Petal Parade — solid geometry waits for the full visible reveal.
const m1 = b.island(4160, 4800, 110);
b.link(p15, m1, 'jump');
b.checkpoints.push({ x: 4210, y: 110 });
b.fragments.push({ x: 4620, y: 136 });
b.flowers(4180, 4780, 110, 18, 10);
b.decor.push({ kind: 'mushroom', x: 4300, y: 110, v: 1 }, { kind: 'mushroom', x: 4720, y: 110, v: 2 });
const PARADE_TRIGGER_X = 4420;
const p16 = b.cloud(4840, 5020, 110);
b.link(m1, p16, 'jump');
const p17 = b.island(5060, 5300, 120);
b.link(p16, p17, 'jump');
b.wind(5300, 124, 300, 52);
const p18 = b.cloud(5380, 5620, 110);
b.link(p17, p18, 'wind');
const r5 = b.cloud(5300, 5450, 60, true);
b.spring(5420, 60);
b.link(r5, p18, 'spring', 'recovery');
b.arc(5310, 150, 5440, 134, 14, 5);
const p19 = b.island(5660, 6000, 130);
b.link(p18, p19, 'jump');
b.checkpoints.push({ x: 5700, y: 130 });
b.flowers(5760, 5980, 130, 8, 11);
// The newly revealed route: a spring and petal steps up to the sky lane.
b.spring(5240, 120, true);
const pb1 = b.petal(5280, 5380, 196);
const pb2 = b.petal(5400, 5510, 220);
const pb3 = b.petal(5520, 5640, 238);
const pb4 = b.petal(5650, 5790, 248);
b.xlink(p17, pb1, 'spring');
b.xlink(pb1, pb2, 'jump');
b.xlink(pb2, pb3, 'jump');
b.xlink(pb3, pb4, 'jump');
const u5 = b.cloud(5800, 6000, 244);
b.xlink(pb4, u5, 'jump');
b.arc(5300, 220, 5760, 272, 30, 10);

// ── 5. Final movement sequence ────────────────────────────────────────────
// Phrase 7: Final Movement Symphony — dash, skim, spring, refill and fast landing.
const p20 = b.island(6060, 6400, 110);
b.link(p19, p20, 'jump');
b.thistles(6170, 110, 44);
b.arc(6160, 126, 6224, 126, 30, 4);
b.flowers(6080, 6160, 110, 4, 12);
b.ring(6480, 168);
const p21 = b.cloud(6535, 6720, 130);
b.link(p20, p21, 'ring');
b.arc(6410, 150, 6550, 158, 20, 5);
const r6 = b.island(6380, 6620, 50);
b.spring(6540, 50);
b.link(r6, p21, 'spring', 'recovery');
b.keepsakes.push({ x: 6430, y: 64, name: 'Pocket Watch', icon: 'watch' });
b.flowers(6400, 6500, 50, 4, 13);
const p22 = b.island(6760, 7000, 100);
b.link(p21, p22, 'jump');
b.checkpoints.push({ x: 6790, y: 100 });
b.fragments.push({ x: 6880, y: 126 });
b.npcs.push({
  x: 6960,
  y: 100,
  lines: {
    puddlewick: 'ONE MORE PHRASE,\nOLD BEAN. THE SUN\nIS A LIGHT SLEEPER.',
    poppy: 'LISTEN! THE CLOUDS\nARE HUMMING ALONG.',
  },
});
b.flowers(6770, 6860, 100, 4, 14);
// Express lane after the parade rejoins at p22.
const u6 = b.cloud(6100, 6260, 252);
b.xlink(u5, u6, 'dash');
b.wind(6260, 256, 360, 48, 260);
b.ring(6400, 280);
const u7 = b.cloud(6450, 6700, 238);
b.xlink(u6, u7, 'wind', 'ribbon plus dash');
b.xlink(u7, p22, 'drop');
b.arc(6280, 276, 6460, 266, 18, 7);

// accelerate → short hop → air dash → spring rebound → ring → longer dash → fast landing → jump
const p23 = b.cloud(7040, 7160, 112);
b.link(p22, p23, 'jump');
const p24 = b.island(7240, 7370, 90);
b.link(p23, p24, 'dash');
b.spring(7330, 90);
b.ring(7414, 192);
const p25 = b.cloud(7480, 7700, 172);
b.link(p24, p25, 'spring', 'rebound, ring, dash');
const r7 = b.cloud(7380, 7740, 90, true);
b.spring(7620, 90);
b.link(r7, p25, 'spring', 'recovery');
const p26 = b.cloud(7740, 7900, 200);
b.link(p25, p26, 'jump');
const p27 = b.island(7940, 8200, 170);
b.link(p26, p27, 'jump');
b.arc(7150, 140, 7250, 112, 12, 4);
b.arc(7340, 160, 7470, 200, 30, 6);
b.arc(7704, 196, 7756, 218, 12, 3);
b.flowers(7960, 8180, 170, 9, 15);
b.signs.push({ x: 8010, y: 170, text: 'KINDER WORLDS\nBRIGHTER DAYS' });

// ── 6. Ending: the giant flower beside the sleeping sun ───────────────────
const p28 = b.cloud(8240, 8400, 190);
b.link(p27, p28, 'jump');
const goalFlower = b.flower(8440, 8660, 196);
b.link(p28, goalFlower, 'jump');
b.arc(8384, 214, 8436, 214, 14, 3);

export const LEVEL1: LevelData = {
  id: 'morning-that-forgot',
  name: 'The Morning That Forgot to Happen',
  start: { x: 30, y: 64 },
  killY: -60,
  minX: -220,
  maxX: 8900,
  platforms: b.platforms,
  springs: b.springs,
  rings: b.rings,
  winds: b.winds,
  hazards: b.hazards,
  seeds: b.seeds,
  fragments: b.fragments,
  keepsakes: b.keepsakes,
  checkpoints: b.checkpoints,
  signs: b.signs,
  npcs: b.npcs,
  decor: b.decor,
  parade: { triggerX: PARADE_TRIGGER_X, flower: { x: 4560, y: 210 }, bridgeSolidAt: 2.4 },
  goal: { x0: 8500, x1: 8600, top: 196 },
  sun: { x: 8720, y: 300 },
  route: b.route,
  express: b.express,
};
