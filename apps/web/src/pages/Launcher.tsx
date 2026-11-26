import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectCapabilities, type Capabilities } from '@sd/game/capabilities';
import { PRESETS, defaultGameSettings, gameSettingsSchema, type GameSettings, type GraphicsPreset } from '@sd/shared';
import { Api, errorMessage, type AccountOverview } from '../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { Container } from '../components/Layout.tsx';
import { Alert, Badge, Button, Card, IconCheck, IconCpu, IconKeyboard, IconPlay, IconX, PageHeader, Spinner, cx } from '../components/ui.tsx';

const PRESET_LABEL: Record<GraphicsPreset, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto', ultra: 'Ultra' };

export const CONTROLS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], 'Moverse / conducir'],
  [['Mouse'], 'Mirar / cámara'],
  [['Shift'], 'Correr'],
  [['Espacio'], 'Saltar · freno de mano'],
  [['E'], 'Interactuar · subir a un vehículo'],
  [['F'], 'Bajarse del vehículo'],
  [['H'], 'Bocina'],
  [['V'], 'Cámara del vehículo'],
  [['L'], 'Luces del vehículo'],
  [['R'], 'Cambiar emisora de radio'],
  [['P'], 'Modo foto (Enter guarda la imagen)'],
  [['M'], 'Mapa'],
  [['Esc'], 'Pausa'],
];

export function LauncherPage() {
  useTitle('Jugar Santo Domingo Open World', { noindex: true });
  const nav = useNavigate();
  const caps = useMemo<Capabilities>(() => detectCapabilities(), []);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Api.getSettings()
      .then((r) => {
        const p = r.settings ? gameSettingsSchema.safeParse(r.settings) : null;
        setSettings(p?.success ? p.data : defaultGameSettings(caps.suggested));
      })
      .catch(() => setSettings(defaultGameSettings(caps.suggested)));
    Api.overview().then(setOverview).catch(() => undefined);
  }, [caps.suggested]);

  async function start() {
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      await Api.putSettings(settings);
      nav('/juego');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const choose = (p: GraphicsPreset) => settings && setSettings({ ...settings, graphics: { ...settings.graphics, preset: p, ...PRESETS[p] } });
  const m001 = overview?.missions.find((m) => m.missionId === 'm001_bienvenido');

  return (
    <Container className="py-14">
      <PageHeader eyebrow="Santo Domingo Open World · Lanzador" title="Listo para salir a la calle">
        Gratis con tu cuenta DominicanGames. Revisamos tu equipo para elegir la mejor calidad; puedes cambiarla cuando quieras desde el menú de pausa.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card className="overflow-hidden">
          <div className="relative">
            <img src="/img/games/santo-domingo-open-world/shot-el-conde.jpg" alt="Calle El Conde dentro del juego" className="aspect-[16/8] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-transparent" />
            <div className="absolute bottom-5 left-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-300">{m001?.status === 'completed' ? 'Exploración libre' : overview?.save ? 'Misión 1 · en curso' : 'Misión 1'}</p>
              <p className="display text-3xl text-white">{m001?.status === 'completed' ? 'Sigue explorando la ciudad' : 'Bienvenido a Santo Domingo'}</p>
            </div>
          </div>
          <div className="p-6">
            {overview?.save ? (
              <p className="text-sm text-ink-300">
                Partida guardada · {fmtMoney(overview.save.money)} · {overview.save.landmarks} monumentos · {fmtDateTime(overview.save.updatedAt)}
              </p>
            ) : (
              <p className="text-sm text-ink-300">Empiezas en Gazcue, cerca del colmado de Don Ramón.</p>
            )}
            <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.18em] text-ink-400">Calidad gráfica</p>
            {!settings ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'ultra'] as GraphicsPreset[]).map((p) => (
                  <button key={p} onClick={() => choose(p)} data-testid={`launcher-preset-${p}`} className={cx('relative rounded-xl border px-2 py-3 text-center transition', settings.graphics.preset === p ? 'border-dg-red-500 bg-dg-red-500/10' : 'border-white/10 hover:border-white/25')}>
                    <span className="display block text-xl text-white">{PRESET_LABEL[p]}</span>
                    {caps.suggested === p && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-sea-400">Recomendado</span>}
                  </button>
                ))}
              </div>
            )}
            {error && <Alert tone="error" className="mt-4">{error}</Alert>}
            {!caps.supported && (
              <Alert tone="error" className="mt-4" title="Tu navegador no puede ejecutar el juego">
                {caps.reasons.join(' ')} Prueba con la última versión de Chrome, Edge o Firefox y activa la aceleración por hardware.
              </Alert>
            )}
            <Button size="xl" className="mt-6 w-full" onClick={start} loading={busy} disabled={!settings || !caps.supported} data-testid="start-game">
              <IconPlay className="size-5" /> Iniciar juego
            </Button>
            <p className="mt-3 text-center text-xs text-ink-500">Gratis · Sin descargas · Tu partida se guarda en tu cuenta DominicanGames</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 text-white">
              <IconCpu className="size-5 text-sun-400" />
              <h2 className="font-semibold">Tu equipo</h2>
            </div>
            <ul className="space-y-2.5 text-sm">
              <Check ok={caps.webgl2} label="WebGL 2" />
              <Check ok={caps.wasm} label="WebAssembly (física)" />
              <Check ok={!caps.software} label="Aceleración por hardware" warn />
              <li className="flex justify-between gap-4 text-ink-400">
                <span>Gráficos</span>
                <span className="max-w-[60%] truncate text-right text-ink-200" title={caps.renderer}>{caps.renderer}</span>
              </li>
              <li className="flex justify-between text-ink-400">
                <span>Núcleos de CPU</span>
                <span className="text-ink-200">{caps.cores}</span>
              </li>
              {caps.memoryGB !== null && (
                <li className="flex justify-between text-ink-400">
                  <span>Memoria</span>
                  <span className="text-ink-200">{caps.memoryGB} GB o más</span>
                </li>
              )}
            </ul>
            {caps.reasons.length > 0 && caps.supported && <Alert tone="warning" className="mt-4">{caps.reasons.join(' ')}</Alert>}
            <div className="mt-4">
              <Badge tone="sea" >Calidad recomendada: {PRESET_LABEL[caps.suggested]}</Badge>
            </div>
          </Card>
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 text-white">
              <IconKeyboard className="size-5 text-sun-400" />
              <h2 className="font-semibold">Controles</h2>
            </div>
            <ul className="grid gap-2 text-sm">
              {CONTROLS.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-3">
                  <span className="text-ink-300">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <span key={k} className="kbd">{k}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Container>
  );
}

function Check({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  return (
    <li className="flex items-center justify-between text-ink-400">
      <span>{label}</span>
      {ok ? <IconCheck className="size-4 text-leaf-500" /> : <IconX className={cx('size-4', warn ? 'text-gold-400' : 'text-coral-500')} />}
    </li>
  );
}
