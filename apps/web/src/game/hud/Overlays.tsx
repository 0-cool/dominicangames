import { useEffect, useState } from 'react';
import type { MissionStats } from '@sd/game';
import type { Strings } from '../../i18n/index.ts';
import { fmtDuration, fmtKm } from '../../lib/format.ts';
import { Button, IconPlay, SdowLogo, cx } from '../../components/ui.tsx';
import { DgMark } from '../../components/brand/Logo.tsx';

const TIPS = [
  'Los colmados son el corazón del barrio: acércate y escucha el dominó.',
  'En el Malecón, el muro separa la avenida del mar. ¡No te tires!',
  'Descubre monumentos para ganar RD$50 cada uno. Abre el mapa con M.',
  'En el motor, frena antes de las curvas: si chocas fuerte, te caes.',
  'Calle El Conde es peatonal: mejor recórrela a pie.',
  'Haz clic en el mapa para marcar un destino y seguir la ruta del GPS.',
  'Los semáforos funcionan: el tráfico respeta el rojo… casi siempre.',
  'De noche, los faroles y los letreros de los negocios iluminan las calles.',
  'En un vehículo, L enciende o apaga las luces y R cambia de emisora.',
  'Pulsa P para el modo foto: cámara libre y Enter para guardar la imagen.',
];

export function LoadingScreen({ progress, label, t }: { progress: number; label: string; t: Strings }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const i = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 5500);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end overflow-hidden bg-ink-950" data-testid="loading-screen">
      <img src="/img/games/santo-domingo-open-world/hero-malecon-anochecer.jpg" alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-60 animate-kenburns" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.2)_0%,rgba(7,8,12,0.4)_55%,#07080c_100%)]" />
      <div className="absolute left-8 top-8 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.3em] text-ink-200">
        <DgMark className="size-7" animated />
        {t.presents}
      </div>
      <div className="relative mx-auto w-full max-w-5xl px-8 pb-16">
        <SdowLogo />
        <p className="display mt-6 text-5xl text-white">{t.loading}</p>
        <p key={tip} className="mt-4 max-w-2xl text-lg text-ink-200 animate-fade-up">{TIPS[tip]}</p>
        <div className="mt-10 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-sun transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm text-ink-400">
          <span data-testid="loading-label">{label}</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <p className="mt-8 text-xs text-ink-500">{t.attribution}</p>
      </div>
    </div>
  );
}

export function ClickToPlay({ t, onPlay, firstTime }: { t: Strings; onPlay(): void; firstTime: boolean }) {
  return (
    <button onClick={onPlay} className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center bg-black/45 text-center backdrop-blur-[2px]" data-testid="click-to-play">
      <span className="flex size-24 items-center justify-center rounded-full bg-sun text-ink-950 shadow-[0_0_60px_rgba(255,106,61,0.6)] animate-pop">
        <IconPlay className="size-10 translate-x-0.5" />
      </span>
      <span className="display mt-6 text-5xl text-white">{t.clickToPlay}</span>
      <span className="mt-3 text-ink-200">{t.clickToPlayHint}</span>
      {firstTime && (
        <span className="mt-8 grid max-w-xl grid-cols-2 gap-x-10 gap-y-2 text-left text-sm text-ink-200">
          <span><span className="kbd mr-2">W A S D</span> moverse</span>
          <span><span className="kbd mr-2">Shift</span> correr</span>
          <span><span className="kbd mr-2">E</span> interactuar / subir</span>
          <span><span className="kbd mr-2">F</span> bajar del vehículo</span>
          <span><span className="kbd mr-2">Espacio</span> saltar / freno de mano</span>
          <span><span className="kbd mr-2">M</span> mapa</span>
        </span>
      )}
    </button>
  );
}

export function MissionComplete({ t, title, stats, reward, landmarks, onContinue }: { t: Strings; title: string; stats: MissionStats; reward: number; landmarks: number; onContinue(): void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onContinue]);
  const rows: [string, string][] = [
    [t.time, fmtDuration(stats.timeSec)],
    [t.distance, fmtKm(stats.distanceM)],
    [t.topSpeed, `${stats.topSpeedKmh} km/h`],
    [t.collisions, String(stats.collisions)],
    [t.landmarks, String(landmarks)],
  ];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="mission-complete">
      <div className="w-full max-w-lg px-6 text-center">
        <p className="display text-gradient-sun text-7xl animate-pop">{t.missionComplete}</p>
        <p className="mt-3 text-xl font-semibold text-white">{title}</p>
        <div className="mx-auto mt-8 max-w-sm space-y-2 text-left">
          {rows.map(([l, v], i) => (
            <div key={l} className="flex justify-between border-b border-white/10 pb-2 text-[15px] animate-fade-up" style={{ animationDelay: `${150 + i * 110}ms` }}>
              <span className="text-ink-300">{l}</span>
              <span className="font-semibold text-white">{v}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between pt-3 animate-fade-up" style={{ animationDelay: '800ms' }}>
            <span className="text-ink-200">{t.reward}</span>
            <span className="display text-4xl text-[#7ee08f]" data-testid="mission-reward">+RD${reward.toLocaleString('es-DO')}</span>
          </div>
        </div>
        <Button size="lg" className="mt-10 min-w-56" onClick={onContinue} data-testid="mission-continue">
          {t.continue}
        </Button>
      </div>
    </div>
  );
}

export function GameError({ t, message, onRetry, onBack, onPlatform }: { t: Strings; message: string; onRetry(): void; onBack(): void; onPlatform(): void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950 px-6" data-testid="game-error">
      <div className="max-w-lg text-center">
        <p className="display text-5xl text-white">{t.errorTitle}</p>
        <p className="mt-4 text-ink-300">{message}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={onRetry}>{t.retry}</Button>
          <Button variant="secondary" onClick={onBack}>
            {t.backToLauncher}
          </Button>
          <Button variant="ghost" onClick={onPlatform}>
            {t.backToDashboard}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Station name shown for a few seconds when it changes (GTA-style). */
export function RadioBanner({ station }: { station: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 z-20 flex justify-center animate-fade-up" data-testid="radio-banner">
      <div className="rounded-2xl border border-white/10 bg-black/55 px-6 py-3 text-center backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold-300">Radio</p>
        <p className="display hud-text mt-1 text-2xl text-white">{station ?? 'Apagada'}</p>
      </div>
    </div>
  );
}

/** Photo mode: the HUD is hidden; only this discreet help bar remains. */
export function PhotoModeBar({ flash }: { flash: boolean }) {
  return (
    <>
      {flash && <div className="pointer-events-none absolute inset-0 z-30 bg-white/60" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center" data-testid="photo-mode">
        <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/55 px-5 py-2 text-xs text-ink-200 backdrop-blur-md">
          <span className="font-bold uppercase tracking-[0.2em] text-gold-300">Modo foto</span>
          <span>WASD mover · Ratón mirar · Shift rápido</span>
          <span className="font-semibold text-white">Enter: guardar foto</span>
          <span>P: salir</span>
        </div>
      </div>
    </>
  );
}

export function FailBanner({ text }: { text: string }) {
  return (
    <div className={cx('pointer-events-none absolute inset-x-0 top-1/3 z-20 text-center animate-fade-up')}>
      <p className="display hud-text text-7xl text-coral-500">Misión fallida</p>
      <p className="hud-text mt-2 text-xl text-white">{text}</p>
    </div>
  );
}
