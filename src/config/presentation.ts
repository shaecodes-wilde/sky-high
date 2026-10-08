// Visual comfort presets. None of these touch the simulation: disabling an
// effect must never change physics, collisions or route availability.

export type PresetName = 'gentle' | 'standard' | 'vivid';

export interface Presentation {
  preset: PresetName;
  /** Camera shake amount, 0 = off. */
  shake: number;
  afterimages: boolean;
  /** Background wave distortion during the Petal Parade. */
  distortion: boolean;
  /** Particle count multiplier. */
  particles: number;
  /** Strength of background transformations (sky fans, colour shifts). */
  spectacle: number;
}

export const PRESETS: Record<PresetName, Presentation> = {
  gentle: { preset: 'gentle', shake: 0, afterimages: false, distortion: false, particles: 0.5, spectacle: 0.55 },
  standard: { preset: 'standard', shake: 0.5, afterimages: true, distortion: false, particles: 1, spectacle: 0.85 },
  vivid: { preset: 'vivid', shake: 1, afterimages: true, distortion: true, particles: 1.4, spectacle: 1 },
};

export const PRESET_INFO: Record<PresetName, string> = {
  gentle: 'Calm colours, no shake, no afterimages or distortion, fewer particles.',
  standard: 'The intended look: light shake, afterimages, no distortion.',
  vivid: 'Everything on: fuller sky transformations, waves and more particles.',
};
