// Editable level data format. Coordinates are pixels, y-up; "top" is the
// standable surface height. See src/level/level1.ts.

export type PlatformKind = 'island' | 'cloud' | 'petal' | 'flower';

export interface PlatformDef {
  id: number;
  kind: PlatformKind;
  x0: number;
  x1: number;
  top: number;
  /** Two-way islands extend down to `bottom`; clouds/petals are thin one-way surfaces. */
  bottom: number;
  /** Petal-bridge pieces only exist once the Petal Parade reveals them. */
  parade?: boolean;
  /** Recovery clouds are drawn a little dimmer so the main route reads first. */
  recovery?: boolean;
}

export interface SpringDef {
  x: number;
  top: number;
  parade?: boolean;
}

export interface RingDef {
  x: number;
  y: number;
}

export interface WindDef {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: -1 | 1;
  speed: number;
}

export interface HazardDef {
  x: number;
  y: number;
  w: number;
}

export interface PointDef {
  x: number;
  y: number;
}

/** A forward progression boundary, independent of a physical respawn marker.
 * Omitted height limits cover every route above the level's fall-out plane.
 */
export interface SplitGateDef {
  x: number;
  minY?: number;
  maxY?: number;
}

export interface KeepsakeDef extends PointDef {
  name: string;
  icon: 'teacup' | 'feather' | 'watch';
}

export interface SignDef extends PointDef {
  text: string;
}

export interface NpcDef extends PointDef {
  /** What the *other* character says, keyed by the NPC's identity. */
  lines: { poppy: string; puddlewick: string };
}

export type RouteMove = 'walk' | 'jump' | 'dash' | 'spring' | 'springBoost' | 'ring' | 'wind' | 'drop';

export interface RouteLink {
  from: number;
  to: number;
  move: RouteMove;
  /** Optional takeoff/landing hints for validation (defaults: edges). */
  note?: string;
}

export interface DecorDef {
  kind: 'flower' | 'tuft' | 'mushroom' | 'lamp' | 'cloudFace';
  x: number;
  y: number;
  /** Cosmetic variant seed. */
  v: number;
}

export interface LevelData {
  id: string;
  name: string;
  start: PointDef;
  killY: number;
  minX: number;
  maxX: number;
  platforms: PlatformDef[];
  springs: SpringDef[];
  rings: RingDef[];
  winds: WindDef[];
  hazards: HazardDef[];
  seeds: PointDef[];
  fragments: PointDef[];
  keepsakes: KeepsakeDef[];
  /** Physical markers which save a safe respawn position and local sky state. */
  checkpoints: PointDef[];
  /** Ordered Time Trial boundaries. Defaults to checkpoint x positions. */
  splitGates?: SplitGateDef[];
  signs: SignDef[];
  npcs: NpcDef[];
  decor: DecorDef[];
  parade: {
    triggerX: number;
    flower: PointDef;
    /** Seconds after the trigger at which the bridge becomes fully visible and solid. */
    bridgeSolidAt: number;
  };
  goal: { x0: number; x1: number; top: number };
  sun: PointDef;
  /** The normal (standard) route, validated against measured controller reach. */
  route: RouteLink[];
  /** The optional upper express route. */
  express: RouteLink[];
}
