import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_BINDINGS, GAME_ACTIONS, PRESETS, type GameAction, type GameSettings, type GraphicsPreset } from '@sd/shared';
import { keyLabel } from '../lib/format.ts';
import { cx } from './ui.tsx';

const ACTION_LABELS: Record<GameAction, string> = {
  forward: 'Avanzar / acelerar',
  backward: 'Retroceder / frenar',
  left: 'Izquierda',
  right: 'Derecha',
  sprint: 'Correr',
  jump: 'Saltar',
  crouch: 'Agacharse',
  interact: 'Interactuar / subir al vehículo',
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

const PRESET_INFO: Record<GraphicsPreset, { label: string; desc: string }> = {
  low: { label: 'Bajo', desc: 'Gráficos integrados y laptops' },
  medium: { label: 'Medio', desc: 'Equilibrado' },
  high: { label: 'Alto', desc: 'GPU dedicada' },
  ultra: { label: 'Ultra', desc: 'GPU potente' },
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-ink-100">{label}</p>
        {hint && <p className="text-xs text-ink-400">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-6 w-11 rounded-full transition', checked ? 'bg-sun-500' : 'bg-white/15')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function Slider({ value, min, max, step, onChange, format, label }: { value: number; min: number; max: number; step: number; onChange(v: number): void; format(v: number): string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-40" />
      <span className="w-14 text-right font-mono text-xs text-ink-300">{format(value)}</span>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsPanel({ value, onChange, inGame = false }: { value: GameSettings; onChange(s: GameSettings): void; inGame?: boolean }) {
  const [tab, setTab] = useState<'graphics' | 'audio' | 'controls' | 'general'>('graphics');
  const [capturing, setCapturing] = useState<GameAction | null>(null);
  const g = value.graphics;
  const setG = (patch: Partial<GameSettings['graphics']>) => onChange({ ...value, graphics: { ...g, ...patch } });
  const setPreset = (p: GraphicsPreset) => onChange({ ...value, graphics: { ...g, preset: p, ...PRESETS[p] } });
  const setA = (k: keyof GameSettings['audio'], v: number) => onChange({ ...value, audio: { ...value.audio, [k]: v } });
  const setC = (patch: Partial<GameSettings['controls']>) => onChange({ ...value, controls: { ...value.controls, ...patch } });
  const bindings = { ...DEFAULT_BINDINGS, ...value.controls.bindings } as Record<GameAction, string>;

  useEffect(() => {
    if (!capturing) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape' || capturing === 'pause') setC({ bindings: { ...bindings, [capturing]: e.code } });
      setCapturing(null);
    };
    window.addEventListener('keydown', on, { capture: true });
    return () => window.removeEventListener('keydown', on, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const conflicts = new Set(GAME_ACTIONS.filter((a) => GAME_ACTIONS.some((b) => b !== a && bindings[b] === bindings[a] && !((a === 'jump' && b === 'handbrake') || (a === 'handbrake' && b === 'jump')))));

  const tabs = [
    ['graphics', 'Gráficos'],
    ['audio', 'Audio'],
    ['controls', 'Controles'],
    ['general', 'General'],
  ] as const;

  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 rounded-xl bg-black/30 p-1">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('flex-1 rounded-lg px-3 py-2 text-sm font-medium transition', tab === k ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-ink-200')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'graphics' && (
        <div>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {(Object.keys(PRESET_INFO) as GraphicsPreset[]).map((p) => (
              <button key={p} onClick={() => setPreset(p)} data-testid={`preset-${p}`} className={cx('rounded-xl border px-2 py-3 text-center transition', g.preset === p ? 'border-sun-500 bg-sun-500/10' : 'border-white/10 hover:border-white/25')}>
                <span className="display block text-lg text-white">{PRESET_INFO[p].label}</span>
                <span className="block text-[11px] text-ink-400">{PRESET_INFO[p].desc}</span>
              </button>
            ))}
          </div>
          <Row label="Escala de resolución" hint="Menos de 100 % mejora el rendimiento">
            <Slider label="Escala de resolución" value={g.resolutionScale} min={0.5} max={2} step={0.05} onChange={(v) => setG({ resolutionScale: v })} format={pct} />
          </Row>
          <Row label="Resolución dinámica" hint="Baja la resolución automáticamente si los FPS caen">
            <Toggle label="Resolución dinámica" checked={g.dynamicResolution} onChange={(v) => setG({ dynamicResolution: v })} />
          </Row>
          <Row label="Sombras">
            <select aria-label="Sombras" value={g.shadows} onChange={(e) => setG({ shadows: e.target.value as 'off' | 'low' | 'high' })} className="rounded-lg border border-white/10 bg-ink-900 px-3 py-1.5 text-sm">
              <option value="off">Apagadas</option>
              <option value="low">Bajas</option>
              <option value="high">Altas</option>
            </select>
          </Row>
          <Row label="Distancia de dibujado">
            <Slider label="Distancia de dibujado" value={g.drawDistance} min={200} max={1600} step={50} onChange={(v) => setG({ drawDistance: v })} format={(v) => `${v} m`} />
          </Row>
          <Row label="Densidad de tráfico">
            <Slider label="Densidad de tráfico" value={g.trafficDensity} min={0} max={1} step={0.05} onChange={(v) => setG({ trafficDensity: v })} format={pct} />
          </Row>
          <Row label="Densidad de peatones">
            <Slider label="Densidad de peatones" value={g.pedestrianDensity} min={0} max={1} step={0.05} onChange={(v) => setG({ pedestrianDensity: v })} format={pct} />
          </Row>
          <Row label="Campo de visión">
            <Slider label="Campo de visión" value={g.fov} min={55} max={100} step={1} onChange={(v) => setG({ fov: v })} format={(v) => `${v}°`} />
          </Row>
          <Row label="Resplandor (bloom)">
            <Toggle label="Bloom" checked={g.bloom} onChange={(v) => setG({ bloom: v })} />
          </Row>
          <Row label="Oclusión ambiental" hint="Costosa: recomendada solo en Ultra">
            <Toggle label="Oclusión ambiental" checked={g.ambientOcclusion} onChange={(v) => setG({ ambientOcclusion: v })} />
          </Row>
          <Row label="Antialiasing (SMAA)">
            <Toggle label="Antialiasing" checked={g.antialias} onChange={(v) => setG({ antialias: v })} />
          </Row>
          <Row label="Desenfoque de velocidad" hint="Sensación de velocidad al conducir rápido; desactívalo si te marea">
            <Toggle label="Desenfoque de velocidad" checked={g.motionBlur} onChange={(v) => setG({ motionBlur: v })} />
          </Row>
          <Row label="Mostrar FPS">
            <Toggle label="Mostrar FPS" checked={g.showFps} onChange={(v) => setG({ showFps: v })} />
          </Row>
          {!inGame && <p className="mt-3 text-xs text-ink-400">Los cambios se aplican la próxima vez que abras el juego. Dentro del juego se aplican al instante.</p>}
        </div>
      )}

      {tab === 'audio' && (
        <div>
          {(
            [
              ['master', 'Volumen general'],
              ['music', 'Música de los colmados'],
              ['sfx', 'Efectos (motores, bocinas, choques)'],
              ['ambience', 'Ambiente (ciudad, mar, pájaros)'],
            ] as const
          ).map(([k, l]) => (
            <Row key={k} label={l}>
              <Slider label={l} value={value.audio[k]} min={0} max={1} step={0.05} onChange={(v) => setA(k, v)} format={pct} />
            </Row>
          ))}
        </div>
      )}

      {tab === 'controls' && (
        <div>
          <Row label="Sensibilidad del mouse">
            <Slider label="Sensibilidad del mouse" value={value.controls.mouseSensitivity} min={0.1} max={5} step={0.1} onChange={(v) => setC({ mouseSensitivity: v })} format={(v) => v.toFixed(1)} />
          </Row>
          <Row label="Invertir eje vertical">
            <Toggle label="Invertir eje Y" checked={value.controls.invertY} onChange={(v) => setC({ invertY: v })} />
          </Row>
          <div className="mt-4 mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Teclas</p>
            <button onClick={() => setC({ bindings: { ...DEFAULT_BINDINGS } })} className="text-xs text-sun-400 hover:underline">
              Restablecer
            </button>
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {GAME_ACTIONS.map((a) => (
              <div key={a} className="flex items-center justify-between border-b border-white/[0.05] py-2">
                <span className="text-sm text-ink-200">{ACTION_LABELS[a]}</span>
                <button onClick={() => setCapturing(a)} className={cx('kbd min-w-16 py-1', capturing === a && 'animate-pulse border-sun-500 bg-sun-500/20', conflicts.has(a) && capturing !== a && 'border-coral-500 text-[#ff9fb6]')}>
                  {capturing === a ? 'Pulsa…' : keyLabel(bindings[a])}
                </button>
              </div>
            ))}
          </div>
          {conflicts.size > 0 && <p className="mt-3 text-xs text-[#ff9fb6]">Hay teclas repetidas (marcadas en rojo).</p>}
          <p className="mt-3 text-xs text-ink-400">Las flechas siempre funcionan para moverse. Saltar y freno de mano comparten la barra espaciadora a propósito.</p>
        </div>
      )}

      {tab === 'general' && (
        <div>
          <Row label="Idioma del juego" hint="La interfaz del juego está preparada para inglés; los diálogos y textos de misión están en español.">
            <select aria-label="Idioma" value={value.language} onChange={(e) => onChange({ ...value, language: e.target.value as 'es' | 'en' })} className="rounded-lg border border-white/10 bg-ink-900 px-3 py-1.5 text-sm">
              <option value="es">Español</option>
              <option value="en">English (beta)</option>
            </select>
          </Row>
        </div>
      )}
    </div>
  );
}
