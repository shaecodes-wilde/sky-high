// Default keyboard bindings (KeyboardEvent.code values). The dash key is
// remappable from the settings panel and persisted with the other settings.

export type Action = 'left' | 'right' | 'roll' | 'jump' | 'dash' | 'pause' | 'checkpoint' | 'fullRestart' | 'mute';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  roll: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  checkpoint: ['KeyR'],
  fullRestart: ['Backspace'],
  mute: ['KeyM'],
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    Space: 'Space',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Backspace: 'Backspace',
    Escape: 'Esc',
    Enter: 'Enter',
  };
  return names[code] ?? code;
}
