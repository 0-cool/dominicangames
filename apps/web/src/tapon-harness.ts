// Development harness for El Tapón (not part of production builds).
import '@fontsource-variable/inter';
import '@fontsource/anton';
import { TaponGame } from '@sd/tapon';
const q = new URLSearchParams(location.search);
const game = new TaponGame({ canvas: document.getElementById('c') as HTMLCanvasElement, debug: true, onEvent: (e) => console.log('[tapon]', JSON.stringify(e).slice(0, 200)) });
(window as unknown as { __game: TaponGame }).__game = game;
game.init().then(() => {
  if (q.get('play')) game.start();
  document.title = 'ready';
}).catch((e) => { console.error(e); document.title = 'error'; });
