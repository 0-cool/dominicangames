import { useState } from 'react';
import type { Game } from '@sd/game';
import { DEFAULT_BINDINGS, GAME_ACTIONS, type GameSettings } from '@sd/shared';
import type { Strings } from '../../i18n/index.ts';
import { fmtDuration, fmtKm, keyLabel } from '../../lib/format.ts';
import { SettingsPanel } from '../../components/SettingsPanel.tsx';
import { Button, IconGrid, IconKeyboard, IconLogout, IconMap, IconPlay, IconSave, IconSettings, cx } from '../../components/ui.tsx';
import { DgMark } from '../../components/brand/Logo.tsx';

type Tab = 'summary' | 'settings' | 'controls';

const CONTROL_LABELS: Record<string, string> = {
  forward: 'Avanzar / acelerar',
  backward: 'Retroceder / frenar',
  left: 'Izquierda',
  right: 'Derecha',
  sprint: 'Correr',
  jump: 'Saltar',
  crouch: 'Agacharse',
  interact: 'Interactuar / subir',
  exitVehicle: 'Bajar del vehículo',
  handbrake: 'Freno de mano',
  horn: 'Bocina',
  camera: 'Cambiar cámara (en vehículo)',
  lights: 'Luces del vehículo',
  radio: 'Cambiar emisora (en vehículo)',
  photo: 'Modo foto',
  map: 'Mapa',
  pause: 'Pausa',
};

export function PauseMenu({
  game,
  t,
  settings,
  onSettings,
  onSaveSettings,
  onResume,
  onMap,
  onSave,
  onExit,
  onPlatform,
  saving,
}: {
  game: Game;
  t: Strings;
  settings: GameSettings;
  onSettings(s: GameSettings): void;
  onSaveSettings(): Promise<void>;
  onResume(): void;
  onMap(): void;
  onSave(): void;
  onExit(): void;
  /** Save and go back to the DominicanGames dashboard. */
  onPlatform(): void;
  saving: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [settingsMsg, setSettingsMsg] = useState('');
  const snap = game.snapshot();
  const hud = game.hud();
  const bindings = { ...DEFAULT_BINDINGS, ...settings.controls.bindings };
  const items: [Tab | 'resume' | 'map' | 'save' | 'exit' | 'platform', string, React.ReactNode][] = [
    ['resume', t.resume, <IconPlay key="i" className="size-5" />],
    ['map', t.map, <IconMap key="i" className="size-5" />],
    ['summary', t.stats, <IconMap key="i" className="size-5 opacity-0" />],
    ['settings', t.settings, <IconSettings key="i" className="size-5" />],
    ['controls', t.controls, <IconKeyboard key="i" className="size-5" />],
    ['save', saving === 'saving' ? t.saving : saving === 'saved' ? t.saved : t.saveGame, <IconSave key="i" className="size-5" />],
    ['exit', t.exit, <IconLogout key="i" className="size-5" />],
    ['platform', t.backToPlatform, <IconGrid key="i" className="size-5" />],
  ];
  const click = (k: (typeof items)[number][0]) => {
    if (k === 'resume') onResume();
    else if (k === 'map') onMap();
    else if (k === 'save') onSave();
    else if (k === 'exit') onExit();
    else if (k === 'platform') onPlatform();
    else setTab(k);
  };
  return (
    <div className="absolute inset-0 z-20 flex bg-[linear-gradient(90deg,rgba(7,8,12,0.96)_0%,rgba(7,8,12,0.88)_40%,rgba(7,8,12,0.6)_100%)] backdrop-blur-sm animate-fade-up" data-testid="pause-menu">
      <nav className="flex w-[21.5rem] shrink-0 flex-col justify-center gap-1 px-10">
        <p className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-ink-400">
          <DgMark className="size-4" /> DominicanGames
        </p>
        <p className="display mb-6 text-6xl text-white">{t.paused}</p>
        {items.map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => click(k)}
            data-testid={`pause-${k}`}
            className={cx('flex items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium transition', tab === k ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/[0.06] hover:text-white', k === 'resume' && 'text-gold-300', k === 'platform' && 'mt-3 border-t border-white/[0.07] pt-4')}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
      <section className="scroll-thin my-10 mr-10 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/80 p-8">
        {tab === 'summary' && (
          <div>
            <h2 className="display text-3xl text-white">{hud.mission ? hud.mission.title : 'Exploración libre'}</h2>
            {hud.mission && <p className="mt-2 text-ink-300">{hud.mission.objective}</p>}
            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                [t.money, `RD$${snap.money.toLocaleString('es-DO')}`],
                [t.landmarks, `${snap.discoveredLandmarks.length} / ${game.landmarks.total}`],
                [t.playTime, fmtDuration(snap.stats.playTimeSec)],
                [t.walked, fmtKm(snap.stats.distanceWalked)],
                [t.driven, fmtKm(snap.stats.distanceDriven)],
                [t.topSpeed, `${Math.round(snap.stats.topSpeedKmh)} km/h`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-black/30 p-4">
                  <p className="text-xs text-ink-400">{l}</p>
                  <p className="mt-1 text-xl font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs text-ink-500">{t.attribution}</p>
          </div>
        )}
        {tab === 'settings' && (
          <div>
            <SettingsPanel
              value={settings}
              inGame
              onChange={(s) => {
                setSettingsMsg('');
                onSettings(s);
              }}
            />
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/5 pt-5">
              {settingsMsg && <span className="text-sm text-ink-300">{settingsMsg}</span>}
              <Button
                onClick={async () => {
                  try {
                    await onSaveSettings();
                    setSettingsMsg(t.settingsSaved);
                  } catch {
                    setSettingsMsg(t.saveFailed);
                  }
                }}
              >
                {t.saveSettings}
              </Button>
            </div>
          </div>
        )}
        {tab === 'controls' && (
          <div>
            <h2 className="display text-3xl text-white">{t.controls}</h2>
            <div className="mt-6 grid gap-x-10 gap-y-1 md:grid-cols-2">
              {GAME_ACTIONS.map((a) => (
                <div key={a} className="flex items-center justify-between border-b border-white/[0.05] py-2.5 text-sm">
                  <span className="text-ink-200">{CONTROL_LABELS[a]}</span>
                  <span className="kbd">{keyLabel(bindings[a])}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-b border-white/[0.05] py-2.5 text-sm">
                <span className="text-ink-200">Mirar / cámara</span>
                <span className="kbd">Mouse</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.05] py-2.5 text-sm">
                <span className="text-ink-200">Acercar / alejar cámara</span>
                <span className="kbd">Rueda</span>
              </div>
            </div>
            <p className="mt-6 text-sm text-ink-400">En un motor: inclínate con A/D; a alta velocidad un choque fuerte te tumba. Las flechas del teclado también sirven para moverse.</p>
          </div>
        )}
      </section>
    </div>
  );
}
