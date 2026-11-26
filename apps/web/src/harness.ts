import { Game } from '@sd/game';
import { defaultGameSettings, type GraphicsPreset } from '@sd/shared';

// Development harness (not part of production builds): renders the city with or without gameplay.
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
const preset = (q.get('preset') ?? 'high') as GraphicsPreset;
const settings = defaultGameSettings(preset);
if (q.has('shadows')) settings.graphics.shadows = q.get('shadows') as 'off' | 'low' | 'high';
settings.graphics.dynamicResolution = false;
const log = document.getElementById('log')!;
const photo = q.get('mode') === 'photo'
  ? { x: num('x', 0), y: num('y', 40), z: num('z', 120), tx: num('tx', 0), ty: num('ty', 0), tz: num('tz', 0), time: num('time', 17.2), weather: (q.get('weather') ?? 'clear') as 'clear' }
  : undefined;
const game = new Game({
  canvas: document.getElementById('c') as HTMLCanvasElement,
  fetchAsset: (p) => fetch(`/dev-world/${p}`),
  settings,
  debug: true,
  photo,
  onProgress: (p, l) => (log.textContent = `${Math.round(p * 100)}% ${l}`),
  onEvent: (e) => console.log('[event]', JSON.stringify(e).slice(0, 300)),
});
(window as unknown as { __game: Game }).__game = game;
game
  .init()
  .then(() => {
    if (q.has('time')) game.atmosphere.timeOfDay = num('time', 17);
    if (q.has('weather')) game.atmosphere.setWeather(q.get('weather') as 'clear', true);
    game.start();
    let frames = 0;
    const tick = () => {
      frames++;
      if (frames === num('frames', 8)) document.title = 'rendered';
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.title = 'ready';
    log.textContent = '';
  })
  .catch((e) => {
    console.error(e);
    log.textContent = 'ERROR ' + (e?.message ?? e);
    document.title = 'error';
  });
