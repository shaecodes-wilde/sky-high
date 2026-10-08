import { Game } from './game/Game';
import { GameRenderer } from './render/GameRenderer';
import { UI } from './ui/UI';
import './ui/styles.css';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  if (new URLSearchParams(location.search).has('sheet')) {
    const { showSheet } = await import('./dev/sheet');
    document.getElementById('app')!.remove();
    showSheet(document.body);
    return;
  }
  const ui = new UI(document.getElementById('ui')!);
  if (!webglAvailable()) {
    ui.showFallback('This browser or device doesn’t provide WebGL, which Cloudbloom needs to draw the sky. Try a current desktop version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
    return;
  }
  let renderer: GameRenderer;
  try {
    renderer = new GameRenderer(document.getElementById('game') as HTMLCanvasElement);
  } catch (err) {
    console.error(err);
    ui.showFallback('WebGL failed to start (the graphics driver may have refused it). Enabling hardware acceleration or updating the browser usually helps.');
    return;
  }
  const game = new Game(renderer, ui);
  // Exposed for debugging and automated smoke checks.
  (window as unknown as { cloudbloom: Game }).cloudbloom = game;
}

void boot();
