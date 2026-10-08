import { DOUBLE_TAP_DEFAULT_MS, DOUBLE_TAP_RANGE_MS, type AssistMode } from '../config/movement';
import { DEFAULT_BINDINGS } from '../config/keys';
import { PRESETS, type PresetName, type Presentation } from '../config/presentation';
import type { CharacterId } from '../render/characters';
import type { GameMode } from '../sim/World';
import type { KVStore } from './records';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  preset: PresetName;
  shake: number;
  afterimages: boolean;
  distortion: boolean;
  doubleTapMs: number;
  dashKey: string;
  assist: AssistMode;
  mode: GameMode;
  character: CharacterId;
}

const KEY = 'cloudbloom.settings.v1';

export function defaultSettings(): Settings {
  const p = PRESETS.standard;
  return {
    musicVolume: 0.7,
    sfxVolume: 0.8,
    muted: false,
    preset: 'standard',
    shake: p.shake,
    afterimages: p.afterimages,
    distortion: p.distortion,
    doubleTapMs: DOUBLE_TAP_DEFAULT_MS,
    dashKey: 'ShiftLeft',
    assist: 'none',
    mode: 'adventure',
    character: 'poppy',
  };
}

export function loadSettings(store: KVStore): Settings {
  const d = defaultSettings();
  try {
    const raw = store.getItem(KEY);
    if (!raw) return d;
    const s = { ...d, ...JSON.parse(raw) } as Settings;
    s.doubleTapMs = Math.min(DOUBLE_TAP_RANGE_MS[1], Math.max(DOUBLE_TAP_RANGE_MS[0], Number(s.doubleTapMs) || d.doubleTapMs));
    if (!(s.preset in PRESETS)) s.preset = d.preset;
    // S/Down were previously legal custom dash keys. Cloud Curl now owns
    // them, so restore an available dash rather than show a silent conflict.
    if (DEFAULT_BINDINGS.roll.includes(s.dashKey)) s.dashKey = d.dashKey;
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(store: KVStore, s: Settings): void {
  try {
    store.setItem(KEY, JSON.stringify(s));
  } catch {
    /* best-effort */
  }
}

/** Applies a preset, which resets the individual comfort toggles to its values. */
export function applyPreset(s: Settings, name: PresetName): void {
  const p = PRESETS[name];
  s.preset = name;
  s.shake = p.shake;
  s.afterimages = p.afterimages;
  s.distortion = p.distortion;
}

export function presentationOf(s: Settings): Presentation {
  return { ...PRESETS[s.preset], shake: s.shake, afterimages: s.afterimages, distortion: s.distortion };
}
