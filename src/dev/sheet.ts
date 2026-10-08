import { FRAME_NAMES } from '../config/animation';
import { buildCharacter } from '../render/characters';

/** Dev-only: `?sheet` shows every generated character frame at 4×. */
export function showSheet(root: HTMLElement): void {
  root.style.cssText = 'background:#b9a7e6;padding:12px;display:flex;flex-direction:column;gap:12px;font:12px monospace';
  for (const id of ['poppy', 'puddlewick'] as const) {
    const sheet = buildCharacter(id);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    for (const name of FRAME_NAMES) {
      const cv = sheet.frames.get(name)!.toCanvas();
      cv.style.cssText = 'width:96px;height:128px;image-rendering:pixelated;background:#cfc3f0';
      cv.title = name;
      const cell = document.createElement('div');
      cell.append(cv, Object.assign(document.createElement('div'), { textContent: name }));
      row.append(cell);
    }
    root.append(row);
  }
}
