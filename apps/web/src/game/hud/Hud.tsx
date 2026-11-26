import { useEffect, useRef, useState } from 'react';
import type { HudState } from '@sd/game';
import type { Strings } from '../../i18n/index.ts';
import type { MapImage } from '../mapCanvas.ts';
import type { StreetIndex } from '../streetIndex.ts';
import { Minimap } from './Minimap.tsx';
import { IconCloud, IconRain, IconSun, cx } from '../../components/ui.tsx';

export interface Toast {
  id: number;
  title: string;
  text: string;
  kind: 'info' | 'success' | 'warning' | 'landmark';
}

const WEATHER: Record<HudState['weather'], typeof IconSun> = { clear: IconSun, cloudy: IconCloud, rain: IconRain };

function Money({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<number | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    const d = value - prev.current;
    prev.current = value;
    if (d > 0) {
      setDelta(d);
      const t = setTimeout(() => setDelta(null), 2500);
      // count up
      const start = performance.now();
      const from = value - d;
      let raf = 0;
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 900);
        setShown(Math.round(from + d * k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => {
        clearTimeout(t);
        cancelAnimationFrame(raf);
      };
    }
    setShown(value);
  }, [value]);
  return (
    <div className="text-right">
      <p className="display hud-text text-[34px] leading-none text-[#7ee08f]" data-testid="hud-money">
        RD${shown.toLocaleString('es-DO')}
      </p>
      {delta !== null && <p className="display hud-text mt-1 text-xl text-[#7ee08f] animate-fade-up">+RD${delta.toLocaleString('es-DO')}</p>}
    </div>
  );
}

function Speedometer({ hud }: { hud: HudState }) {
  const frac = Math.min(1, hud.rpm / Math.max(1, hud.rpmMax));
  const R = 62;
  const arc = Math.PI * 1.5;
  const start = Math.PI * 0.75;
  const pt = (a: number, r = R) => [80 + Math.cos(a) * r, 80 + Math.sin(a) * r];
  const [sx, sy] = pt(start);
  const [ex, ey] = pt(start + arc * frac);
  const [bx, by] = pt(start + arc);
  const large = arc * frac > Math.PI ? 1 : 0;
  const redline = frac > 0.88;
  return (
    <div className="relative size-40" data-testid="hud-speedometer">
      <svg viewBox="0 0 160 160" className="absolute inset-0">
        <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${bx} ${by}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" strokeLinecap="round" />
        {frac > 0.01 && <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke={redline ? '#ff3d6e' : '#ff8a5c'} strokeWidth="8" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display hud-text text-5xl leading-none text-white">{hud.speedKmh}</span>
        <span className="text-[10px] font-bold tracking-[0.25em] text-ink-300">KM/H</span>
        <span className="mt-1 rounded bg-black/50 px-2 text-sm font-bold text-gold-300">{hud.gear}</span>
      </div>
    </div>
  );
}

export function Hud({ hud, map, streets, toasts, t, showFps, saving }: { hud: HudState; map: MapImage | null; streets: StreetIndex | null; toasts: Toast[]; t: Strings; showFps: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' }) {
  const [street, setStreet] = useState<string | null>(null);
  const lastLookup = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (!streets || now - lastLookup.current < 400) return;
    lastLookup.current = now;
    setStreet(streets.nearest(hud.player.x, hud.player.z));
  }, [hud, streets]);

  const m = hud.mission;
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white" data-testid="hud">
      {/* top-left: mission */}
      {m && (
        <div className="absolute left-6 top-6 w-[min(380px,40vw)] animate-fade-up" data-testid="hud-mission">
          <div className="rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold-300">{m.title}</p>
            <p className="mt-1.5 text-[15px] font-medium leading-snug text-white" data-testid="hud-objective">
              {m.objective}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {Array.from({ length: m.steps }, (_, i) => (
                  <span key={i} className={cx('h-1 flex-1 rounded-full', i < m.step - 1 ? 'bg-gold-400' : i === m.step - 1 ? 'bg-gold-400/60' : 'bg-white/15')} />
                ))}
              </div>
              <span className="text-[11px] text-ink-300">
                {t.step} {m.step} {t.of} {m.steps}
              </span>
            </div>
          </div>
        </div>
      )}
      {showFps && (
        <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-leaf-500">
          {hud.fps} {t.fps} · {Math.round(hud.resolutionScale * 100)}%
        </div>
      )}

      {/* top-center: timer */}
      {m?.timer !== undefined && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 text-center">
          <p className={cx('display hud-text text-6xl', m.timer <= 10 ? 'text-coral-500 animate-pulse' : 'text-white')}>
            {Math.floor(m.timer / 60)}:{String(m.timer % 60).padStart(2, '0')}
          </p>
        </div>
      )}

      {/* top-right: money, clock, toasts */}
      <div className="absolute right-6 top-5 flex flex-col items-end gap-1">
        <Money value={hud.money} />
        <p className="hud-text flex items-center gap-1.5 text-sm font-semibold text-ink-100">
          {(() => {
            const W = WEATHER[hud.weather];
            return <W className="size-4" />;
          })()}
          <span data-testid="hud-clock">{hud.clock}</span>
        </p>
        {saving !== 'idle' && <p className="hud-text text-xs text-ink-300">{saving === 'saving' ? t.saving : saving === 'saved' ? t.saved : t.saveFailed}</p>}
        <div className="mt-3 flex w-[min(360px,36vw)] flex-col gap-2">
          {toasts.map((n) => (
            <div key={n.id} className={cx('rounded-xl border-l-4 bg-black/65 px-4 py-3 backdrop-blur-md animate-toast', n.kind === 'landmark' ? 'border-[#c9a6ff]' : n.kind === 'success' ? 'border-leaf-500' : n.kind === 'warning' ? 'border-coral-500' : 'border-sea-400')} data-testid="hud-toast">
              <p className="text-sm font-semibold text-white">{n.title}</p>
              {n.text && <p className="mt-0.5 text-xs leading-relaxed text-ink-200">{n.text}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* bottom-left: minimap + street */}
      <div className="absolute bottom-6 left-6 flex flex-col items-start gap-2">
        {street && <p className="display hud-text max-w-[260px] truncate text-lg text-white" data-testid="hud-street">{street}</p>}
        {map && <Minimap hud={hud} map={map} />}
      </div>

      {/* bottom-center: subtitles + prompt */}
      <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3 px-6">
        {hud.subtitle && (
          <p className="hud-text max-w-3xl rounded-xl bg-black/55 px-5 py-2.5 text-center text-lg leading-snug backdrop-blur-sm" data-testid="hud-subtitle">
            <span className="font-bold text-gold-300">{hud.subtitle.speaker}: </span>
            {hud.subtitle.text}
          </p>
        )}
        {hud.prompt && (
          <p className="rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-sm font-medium backdrop-blur-sm" data-testid="hud-prompt">
            <PromptText text={hud.prompt} />
          </p>
        )}
      </div>

      {/* bottom-right: vehicle */}
      {hud.mode === 'vehicle' && (
        <div className="absolute bottom-6 right-6 flex flex-col items-end">
          <Speedometer hud={hud} />
          <p className="hud-text -mt-1 text-sm font-semibold text-ink-100">{hud.vehicleName}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold">
            <span className={cx('rounded px-1.5 py-0.5', hud.lights ? 'bg-sky-300/90 text-black' : 'bg-black/40 text-ink-400')} data-testid="hud-lights" title="Luces (L)">
              LUCES
            </span>
            <span className="hud-text max-w-48 truncate text-ink-200" data-testid="hud-radio" title="Emisora (R)">
              {hud.radio ? `♪ ${hud.radio}` : 'Radio apagada'}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-white/15" title="Daños">
            <div className={cx('h-full rounded-full', hud.damage > 0.66 ? 'bg-coral-500' : hud.damage > 0.33 ? 'bg-gold-400' : 'bg-leaf-500')} style={{ width: `${Math.max(4, (1 - hud.damage) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders "E — Subir" with the key as a keycap. */
function PromptText({ text }: { text: string }) {
  const parts = text.split(' · ');
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^(\S+) — (.*)$/);
        return (
          <span key={i} className={cx(i > 0 && 'ml-4')}>
            {m ? (
              <>
                <span className="kbd mr-2">{m[1]}</span>
                {m[2]}
              </>
            ) : (
              p
            )}
          </span>
        );
      })}
    </>
  );
}
