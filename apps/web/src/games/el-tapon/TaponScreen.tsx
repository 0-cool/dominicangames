import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TAPON_GAME_ID, guestNameSchema, type TaponFinishResult, type TaponLeaderboard, type TaponRunTicket } from '@sd/shared';
import { AVENUES, STAGE_M, TaponGame, stageName, type FinishedRun, type TaponState, type Volumes } from '@sd/tapon';
import { Api, ApiError, errorMessage } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.ts';
import { reportError } from '../../lib/telemetry.ts';
import { useTitle } from '../../lib/useTitle.ts';
import { PlaySession } from '../../platform/session.ts';
import { Avatar } from '../../components/brand/Avatar.tsx';
import { DgMark } from '../../components/brand/Logo.tsx';
import { IconArrowLeft, IconCheck, IconKeyboard, IconPlay, IconTrophy, Spinner, cx } from '../../components/ui.tsx';

/** Debug hooks (window.__TAPON__) only in development builds or explicit end-to-end test builds. */
const DEBUG = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';
const REF_W = 1920;
const REF_H = 1080;
const MIN_W = 1280;
const MIN_H = 720;
/** A prefetched run ticket older than this is replaced (the server keeps unfinished runs for a day). */
const TICKET_MAX_AGE_MS = 40 * 60_000;

// ───────────────────────── local preferences (this browser only) ─────────────────────────
const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, v: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode: preferences are not kept */
    }
  },
};
const KEY_BEST = 'dg.tapon.best';
const KEY_NICK = 'dg.tapon.nick';
const KEY_VOL = 'dg.tapon.volumes';
const KEY_MUTED = 'dg.tapon.muted';

type Submit =
  | { kind: 'none' }
  | { kind: 'offline' }
  | { kind: 'guest'; error?: string }
  | { kind: 'saving' }
  | { kind: 'done'; res: TaponFinishResult }
  | { kind: 'error'; message: string; retry: boolean };

interface Ticket {
  t: TaponRunTicket;
  at: number;
  /** Account the run was registered for (null = guest run: the score is saved with a nickname). */
  owner: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-DO');
const km = (m: number) => `${(m / 1000).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;

/** Is this device keyboard-capable? (touch-only phones and tablets are not supported: PC game). */
const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

export default function TaponScreen() {
  useTitle('Jugar El Tapón', { noindex: true });
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TaponGame | null>(null);
  const [state, setState] = useState<TaponState>('loading');
  const [error, setError] = useState('');
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [best, setBest] = useState<number>(() => store.get(KEY_BEST, 0));
  const [volumes, setVolumes] = useState<Volumes>(() => store.get(KEY_VOL, { master: 0.8, music: 0.6, sfx: 0.9 }));
  const [muted, setMuted] = useState<boolean>(() => store.get(KEY_MUTED, false));
  const [last, setLast] = useState<FinishedRun | null>(null);
  const [submit, setSubmit] = useState<Submit>({ kind: 'none' });
  const [board, setBoard] = useState<{ week: TaponLeaderboard | null; all: TaponLeaderboard | null }>({ week: null, all: null });
  const [ticketState, setTicketState] = useState<'loading' | 'ready' | 'offline' | 'login' | 'unavailable'>('loading');
  const ticket = useRef<Ticket | null>(null);
  const runTicket = useRef<Ticket | null>(null);
  const fetching = useRef(false);
  const session = useRef<PlaySession | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  // ───────────── run tickets (server seed + secret), fetched ahead so a run starts instantly ─────────────
  const prefetch = useCallback(() => {
    if (fetching.current) return;
    fetching.current = true;
    const owner = userRef.current?.id ?? null;
    // a slow server never blocks the PLAY button for more than a few seconds (the run is then unranked)
    const slow = setTimeout(() => setTicketState((s) => (s === 'loading' ? 'offline' : s)), 5000);
    Api.taponStartRun()
      .then((t) => {
        ticket.current = { t, at: Date.now(), owner };
        setTicketState('ready');
      })
      .catch((e) => {
        ticket.current = null;
        if (e instanceof ApiError && e.status === 401) setTicketState('login');
        else if (e instanceof ApiError && e.status === 403) setTicketState('unavailable');
        else setTicketState('offline');
      })
      .finally(() => {
        clearTimeout(slow);
        fetching.current = false;
      });
  }, []);

  useEffect(() => {
    if (!authReady) return;
    // a ticket belongs to who was signed in when it was issued
    ticket.current = null;
    prefetch();
  }, [authReady, user?.id, prefetch]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = ticket.current;
      if (t && Date.now() - t.at > TICKET_MAX_AGE_MS) {
        ticket.current = null;
        prefetch();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [prefetch]);

  const refreshBoards = useCallback(() => {
    Promise.all([Api.taponLeaderboard('week', 8), Api.taponLeaderboard('all', 8)])
      .then(([week, all]) => {
        setBoard({ week, all });
        const mine = Math.max(week.me?.best ?? 0, all.me?.best ?? 0);
        if (mine) setBest((b) => Math.max(b, mine));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (authReady) refreshBoards();
  }, [authReady, user?.id, refreshBoards]);

  // ───────────── submitting a finished run ─────────────
  const send = useCallback(
    async (run: FinishedRun, guestName?: string) => {
      const tk = runTicket.current;
      if (!tk || !run.ticket) return;
      setSubmit({ kind: 'saving' });
      try {
        const res = await Api.taponFinishRun(tk.t.runId, { secret: tk.t.secret, score: run.score, stats: run.stats, replay: { simVersion: run.simVersion, steps: run.steps, inputs: run.inputs }, guestName });
        setSubmit({ kind: 'done', res });
        if (guestName) store.set(KEY_NICK, guestName);
        if (res.status === 'verified') refreshBoards();
      } catch (e) {
        // guests go back to the nickname form (another name, or simply “Guardar” again after a network error)
        if (guestName !== undefined) setSubmit({ kind: 'guest', error: errorMessage(e) });
        else setSubmit({ kind: 'error', message: errorMessage(e), retry: !(e instanceof ApiError) || e.status === 429 || e.status >= 500 });
      }
    },
    [refreshBoards],
  );

  // ───────────── the game ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || touchOnly()) return;
    let game: TaponGame;
    try {
      game = new TaponGame({
        canvas,
        debug: DEBUG,
        best: store.get(KEY_BEST, 0),
        volumes: store.get(KEY_VOL, { master: 0.8, music: 0.6, sfx: 0.9 }),
        takeTicket: () => {
          const t = ticket.current;
          ticket.current = null;
          runTicket.current = t && Date.now() - t.at < TICKET_MAX_AGE_MS ? t : null;
          prefetch();
          return runTicket.current ? { seed: runTicket.current.t.seed, ref: runTicket.current.t.runId } : null;
        },
        onEvent: (e) => {
          if (e.type === 'state') setState(e.state);
          else if (e.type === 'muted') {
            setMuted(e.muted);
            store.set(KEY_MUTED, e.muted);
          } else if (e.type === 'started') {
            setLast(null);
            setSubmit({ kind: 'none' });
            if (userRef.current && !session.current) {
              session.current = new PlaySession(TAPON_GAME_ID);
              void session.current.start();
            }
          } else if (e.type === 'gameOver') {
            const run = e.run;
            setLast(run);
            setBest((b) => {
              const nb = Math.max(b, run.score);
              store.set(KEY_BEST, nb);
              return nb;
            });
            const tk = runTicket.current;
            if (!run.ticket || !tk) setSubmit({ kind: 'offline' });
            else if (tk.owner) void send(run);
            else setSubmit({ kind: 'guest' });
          }
        },
      });
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    gameRef.current = game;
    game.setMuted(store.get(KEY_MUTED, false));
    game.init().catch((e) => {
      reportError(e, 'tapon-init');
      setError('No se pudo iniciar El Tapón en este navegador. Prueba con la última versión de Chrome, Edge o Firefox.');
    });
    const onBlur = () => game.pause();
    const onVis = () => document.visibilityState === 'hidden' && game.pause();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      game.dispose();
      gameRef.current = null;
      void session.current?.end();
      session.current = null;
    };
  }, [prefetch, send]);

  // ───────────── window size: 16:9 stage, desktop only ─────────────
  useEffect(() => {
    const on = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const tooSmall = view.w < MIN_W || view.h < MIN_H;
  useEffect(() => {
    if (tooSmall) gameRef.current?.pause();
  }, [tooSmall]);
  const stageW = Math.min(view.w, (view.h * 16) / 9);
  const stageH = (stageW * 9) / 16;
  const k = stageW / REF_W;

  const g = () => gameRef.current;
  const start = () => {
    if (tooSmall) return;
    g()?.start();
  };
  const changeVolumes = (v: Volumes) => {
    setVolumes(v);
    store.set(KEY_VOL, v);
    g()?.setVolumes(v);
  };
  const toggleMute = () => {
    const m = !muted;
    g()?.setMuted(m);
    setMuted(m);
    store.set(KEY_MUTED, m);
  };

  if (touchOnly()) return <TouchOnly />;

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black" data-testid="tapon-screen" data-state={state}>
      <div className="relative" style={{ width: stageW, height: stageH }}>
        <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label="El Tapón: la calle, el tráfico y tu motoconcho" />
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left text-white" style={{ width: REF_W, height: REF_H, transform: `scale(${k})` }}>
          {state === 'loading' && !error && <Loading />}
          {state === 'menu' && !tooSmall && (
            <Menu best={best} board={board} signedIn={!!user} ticketState={ticketState} onPlay={start} muted={muted} onMute={toggleMute} />
          )}
          {state === 'paused' && !tooSmall && <Paused onResume={() => g()?.resume()} onRestart={start} onMenu={() => g()?.menu()} volumes={volumes} onVolumes={changeVolumes} muted={muted} onMute={toggleMute} />}
          {state === 'over' && last && !tooSmall && (
            <GameOver run={last} best={best} submit={submit} onSend={(name) => void send(last, name)} onAgain={start} onMenu={() => g()?.menu()} board={board.week} />
          )}
          {state === 'playing' && (
            <button type="button" onClick={() => g()?.pause()} className="pointer-events-auto absolute bottom-6 left-7 rounded-xl bg-black/40 px-4 py-2 text-[18px] font-semibold text-white/80 backdrop-blur hover:bg-black/60" aria-label="Pausa">
              Esc · Pausa
            </button>
          )}
          {error && <Problem title="El Tapón no pudo arrancar">{error}</Problem>}
        </div>
        {tooSmall && <TooSmall w={view.w} h={view.h} />}
      </div>
    </div>
  );
}

// ───────────────────────── overlays (designed at 1920×1080, scaled with the stage) ─────────────────────────
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('pointer-events-auto rounded-[36px] border border-white/10 bg-[rgba(9,11,18,0.82)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md', className)}>{children}</div>;
}

function Title({ size = 150 }: { size?: number }) {
  // generous line height: the accent of the Ó must not be clipped by the gradient text box
  return (
    <h1 style={{ fontSize: size, lineHeight: 1 }}>
      <span className="block font-display tracking-[0.01em] text-white drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]">EL</span>
      <span className="-mt-[0.12em] block bg-gradient-to-b from-[#ffd23f] via-[#ffb03a] to-[#ff7a1a] bg-clip-text pt-[0.08em] font-display text-transparent">TAPÓN</span>
    </h1>
  );
}

function BigButton({ children, onClick, primary = false, autoFocus = false, disabled = false, testId }: { children: ReactNode; onClick(): void; primary?: boolean; autoFocus?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      disabled={disabled}
      data-testid={testId}
      className={cx(
        'pointer-events-auto inline-flex h-[84px] items-center justify-center gap-4 rounded-[22px] px-12 text-[30px] font-extrabold uppercase tracking-[0.08em] outline-none transition focus-visible:ring-[6px] focus-visible:ring-white/70 disabled:opacity-50',
        primary ? 'bg-gradient-to-b from-[#ffb03a] to-[#ff6b1a] text-[#1b1e23] shadow-[0_18px_40px_-12px_rgba(255,122,26,0.8)] hover:brightness-110' : 'border-2 border-white/25 bg-white/5 text-white hover:bg-white/15',
      )}
    >
      {children}
    </button>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[46px] min-w-[46px] items-center justify-center rounded-[10px] border-b-4 border-white/30 bg-white/15 px-3 font-sans text-[22px] font-bold text-white">{children}</kbd>;
}

function Controls() {
  const item = (keys: string[], label: string) => (
    <div className="flex items-center gap-3">
      <span className="flex gap-1.5">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
      <span className="text-[20px] text-white/85">{label}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_auto] gap-x-10 gap-y-3">
      {item(['W', '↑'], 'Subir de carril')}
      {item(['Esc'], 'Pausa')}
      {item(['S', '↓'], 'Bajar de carril')}
      {item(['R'], 'Reiniciar')}
      <span />
      {item(['M'], 'Silencio')}
    </div>
  );
}

function Board({ data, title }: { data: TaponLeaderboard | null; title: string }) {
  return (
    <div>
      <p className="mb-3 text-[18px] font-bold uppercase tracking-[0.22em] text-[#ffd23f]">{title}</p>
      {!data ? (
        <Spinner className="size-8" />
      ) : data.entries.length === 0 ? (
        <p className="text-[20px] text-white/70">Todavía no hay nadie. ¡Sé el primero!</p>
      ) : (
        <ol className="space-y-1.5" data-testid={`tapon-board-${data.period}`}>
          {data.entries.slice(0, 8).map((e) => (
            <li key={`${e.rank}-${e.name}-${e.at}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 odd:bg-white/[0.05]">
              <span className={cx('w-9 text-center font-display text-[26px]', e.rank === 1 ? 'text-[#ffd23f]' : 'text-white/60')}>{e.rank}</span>
              {e.guest ? (
                <span className="flex size-10 items-center justify-center rounded-full bg-white/10 text-[18px] font-bold text-white/70">{e.name.slice(0, 1).toUpperCase()}</span>
              ) : (
                <Avatar avatar={e.avatar} username={e.name} className="size-10" />
              )}
              <span className="min-w-0 flex-1 truncate text-[22px] font-semibold" title={e.guest ? `${e.name} (invitado)` : e.name}>
                {e.name}
                {e.guest && <span className="ml-2 align-middle text-[13px] font-bold uppercase tracking-wider text-white/45">inv.</span>}
              </span>
              <span className="font-display text-[28px] tabular-nums">{fmt(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SoundButton({ muted, onMute }: { muted: boolean; onMute(): void }) {
  return (
    <button type="button" onClick={onMute} className="pointer-events-auto rounded-xl border border-white/20 bg-black/40 px-4 py-2 text-[18px] font-semibold text-white/85 hover:bg-black/60" data-testid="tapon-mute">
      {muted ? 'Sonido: apagado (M)' : 'Sonido: encendido (M)'}
    </button>
  );
}

function Menu({ best, board, signedIn, ticketState, onPlay, muted, onMute }: { best: number; board: { week: TaponLeaderboard | null; all: TaponLeaderboard | null }; signedIn: boolean; ticketState: string; onPlay(): void; muted: boolean; onMute(): void }) {
  const [tab, setTab] = useState<'week' | 'all'>('week');
  const notReady = ticketState === 'loading';
  // the PLAY button gets the keyboard focus as soon as it can be used (Enter starts the run)
  useEffect(() => {
    if (!notReady) document.querySelector<HTMLButtonElement>('[data-testid="tapon-play"]')?.focus();
  }, [notReady]);
  return (
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.86)_0%,rgba(5,7,13,0.55)_45%,rgba(5,7,13,0.15)_100%)]" data-testid="tapon-menu">
      <div className="pointer-events-auto absolute left-[110px] top-[86px] flex items-center gap-4 text-[20px] font-semibold text-white/80">
        <Link to="/juegos/el-tapon" className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/10">
          <IconArrowLeft className="size-6" /> DominicanGames
        </Link>
      </div>
      <div className="absolute left-[120px] top-[160px] w-[780px]">
        <Title size={124} />
        <p className="mt-5 text-[27px] leading-snug text-white/90">Sobrevive al tapón de Santo Domingo en motoconcho: rebasa, esquiva y lleva a tus pasajeros.</p>
        <div className="mt-8 flex items-center gap-8">
          <BigButton primary autoFocus onClick={onPlay} disabled={notReady || ticketState === 'unavailable'} testId="tapon-play">
            {notReady ? <Spinner className="size-8" /> : <IconPlay className="size-8" />} Jugar
          </BigButton>
          {best > 0 && (
            <div>
              <p className="text-[17px] font-bold uppercase tracking-[0.22em] text-white/60">Tu récord</p>
              <p className="font-display text-[50px] leading-none">{fmt(best)}</p>
            </div>
          )}
        </div>
        <div className="mt-5 min-h-[64px] max-w-[720px] text-[20px] leading-relaxed text-white/75">
          {ticketState === 'offline' && <p className="text-[#ffb74d]">Sin conexión con el servidor: puedes jugar, pero tus partidas no entrarán en la tabla.</p>}
          {ticketState === 'login' && (
            <p className="text-[#ffb74d]">
              Para guardar puntuaciones hace falta una cuenta.{' '}
              <Link className="pointer-events-auto underline" to="/entrar?next=/juegos/el-tapon/jugar">
                Entra con tu cuenta
              </Link>
              .
            </p>
          )}
          {ticketState === 'unavailable' && <p className="text-[#ffb74d]">El Tapón no está disponible en este momento.</p>}
          {!signedIn && ticketState !== 'login' && ticketState !== 'unavailable' && (
            <p>
              Juegas como invitado: al terminar puedes poner tu apodo en la tabla.{' '}
              <Link className="pointer-events-auto font-semibold text-[#ffd23f] underline-offset-4 hover:underline" to="/registro?next=/juegos/el-tapon/jugar">
                Crea tu cuenta gratis
              </Link>{' '}
              para guardar con tu nombre y ganar logros.
            </p>
          )}
        </div>
      </div>
      <div className="absolute bottom-[96px] left-[120px] rounded-[26px] border border-white/10 bg-black/45 px-8 py-6 backdrop-blur-sm">
        <p className="mb-4 flex items-center gap-3 text-[17px] font-bold uppercase tracking-[0.22em] text-white/60">
          <IconKeyboard className="size-6" /> Controles · menús con el mouse
        </p>
        <Controls />
      </div>
      <Panel className="absolute right-[110px] top-[180px] w-[620px] p-9">
        <div className="mb-6 flex items-center gap-3">
          <IconTrophy className="size-8 text-[#ffd23f]" />
          <p className="flex-1 text-[28px] font-bold">Récords</p>
          <div className="flex rounded-xl bg-white/10 p-1 text-[18px] font-semibold">
            {(['week', 'all'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setTab(p)} className={cx('rounded-lg px-4 py-1.5', tab === p ? 'bg-white text-[#1b1e23]' : 'text-white/75 hover:text-white')}>
                {p === 'week' ? 'Semana' : 'Siempre'}
              </button>
            ))}
          </div>
        </div>
        <Board data={tab === 'week' ? board.week : board.all} title={tab === 'week' ? 'Últimos 7 días' : 'De todos los tiempos'} />
        {tab === 'all' && board.all?.me && <p className="mt-4 text-[19px] text-white/70">Tu mejor puntuación: {fmt(board.all.me.best)}{board.all.me.rank ? ` · puesto ${board.all.me.rank}` : ''}</p>}
        <p className="mt-6 text-[16px] leading-relaxed text-white/50">Solo cuentan partidas verificadas por el servidor. Las de invitados aparecen con su apodo.</p>
      </Panel>
      <div className="absolute bottom-[96px] right-[110px] flex items-center gap-4">
        <SoundButton muted={muted} onMute={onMute} />
      </div>
      <p className="absolute bottom-[34px] left-[120px] right-[110px] text-[15px] leading-relaxed text-white/55">
        Juego de humor y ficción. No está afiliado a la Policía Nacional, la DIGESETT (antes AMET), la OMSA ni a ninguna marca de vehículos. Arte original.
      </p>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="flex items-center gap-5 text-[22px]">
      <span className="w-[140px] text-white/80">{label}</span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="h-3 flex-1 accent-[#ff8a3d]" />
      <span className="w-[60px] text-right tabular-nums text-white/70">{Math.round(value * 100)}</span>
    </label>
  );
}

function Paused({ onResume, onRestart, onMenu, volumes, onVolumes, muted, onMute }: { onResume(): void; onRestart(): void; onMenu(): void; volumes: Volumes; onVolumes(v: Volumes): void; muted: boolean; onMute(): void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55" data-testid="tapon-paused">
      <Panel className="w-[760px] p-12 text-center">
        <p className="font-display text-[110px] leading-none">PAUSA</p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <BigButton primary autoFocus onClick={onResume} testId="tapon-resume">
            <IconPlay className="size-8" /> Continuar (Esc)
          </BigButton>
          <div className="flex gap-4">
            <BigButton onClick={onRestart}>Reiniciar (R)</BigButton>
            <BigButton onClick={onMenu}>Menú</BigButton>
          </div>
        </div>
        <div className="mt-10 space-y-4 text-left">
          <Slider label="General" value={volumes.master} onChange={(v) => onVolumes({ ...volumes, master: v })} />
          <Slider label="Música" value={volumes.music} onChange={(v) => onVolumes({ ...volumes, music: v })} />
          <Slider label="Efectos" value={volumes.sfx} onChange={(v) => onVolumes({ ...volumes, sfx: v })} />
          <div className="pt-2 text-center">
            <SoundButton muted={muted} onMute={onMute} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] px-5 py-3">
      <p className="text-[15px] font-bold uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className="font-display text-[34px] leading-tight tabular-nums">{value}</p>
    </div>
  );
}

function GameOver({ run, best, submit, onSend, onAgain, onMenu, board }: { run: FinishedRun; best: number; submit: Submit; onSend(name?: string): void; onAgain(): void; onMenu(): void; board: TaponLeaderboard | null }) {
  const s = run.stats;
  const stage = Math.floor(s.distanceM / STAGE_M);
  const record = run.score >= best && run.score > 0;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60" data-testid="tapon-over">
      <Panel className="flex w-[1640px] gap-12 p-12">
        <div className="flex-1">
          <p className="text-[22px] font-bold uppercase tracking-[0.3em] text-[#ff8a80]">Se acabaron los cascos</p>
          <div className="mt-2 flex items-end gap-6">
            <p className="font-display text-[150px] leading-[0.9] tabular-nums" data-testid="tapon-score">
              {fmt(run.score)}
            </p>
            <p className="mb-5 text-[28px] text-white/70">puntos</p>
            {record && <span className="mb-7 rounded-xl bg-[#ffd23f] px-4 py-1.5 text-[22px] font-extrabold uppercase tracking-wider text-[#1b1e23]">¡Nuevo récord!</span>}
          </div>
          <p className="mt-2 text-[24px] text-white/75">
            {km(s.distanceM)} · {stageName(stage)}
            {stage < AVENUES.length - 1 ? <span className="text-white/55"> · a {fmt((stage + 1) * STAGE_M - s.distanceM)} m de la {AVENUES[stage + 1]}</span> : ''}
          </p>
          <div className="mt-7 grid grid-cols-4 gap-3">
            <Stat label="Rebases" value={fmt(s.overtakes)} />
            <Stat label="Por un pelo" value={fmt(s.closeCalls)} />
            <Stat label="Por el medio" value={fmt(s.squeezes)} />
            <Stat label="Plátanos" value={fmt(s.plantainsDodged)} />
            <Stat label="Pasajeros" value={fmt(s.passengers)} />
            <Stat label="Viajes" value={fmt(s.ridesCompleted)} />
            <Stat label="Cascos" value={fmt(s.helmets)} />
            <Stat label="Mejor racha" value={`×${Math.min(5, 1 + 0.5 * s.maxCombo).toLocaleString('es-DO')}`} />
          </div>
          <div className="mt-8 min-h-[150px]">
            <SubmitBox submit={submit} onSend={onSend} />
          </div>
          <div className="mt-8 flex gap-4">
            <BigButton primary autoFocus={submit.kind !== 'guest'} onClick={onAgain} testId="tapon-again">
              <IconPlay className="size-8" /> Otra vez (R)
            </BigButton>
            <BigButton onClick={onMenu}>Menú</BigButton>
          </div>
        </div>
        <div className="w-[560px] border-l border-white/10 pl-12">
          <Board data={board} title="Récords de la semana" />
        </div>
      </Panel>
    </div>
  );
}

function SubmitBox({ submit, onSend }: { submit: Submit; onSend(name?: string): void }) {
  const [nick, setNick] = useState(() => store.get(KEY_NICK, ''));
  const [local, setLocal] = useState('');
  const line = (icon: ReactNode, text: ReactNode, tone = 'text-white/85') => (
    <p className={cx('flex items-center gap-3 text-[24px]', tone)} data-testid="tapon-submit-status">
      {icon}
      <span>{text}</span>
    </p>
  );
  switch (submit.kind) {
    case 'none':
      return null;
    case 'offline':
      return line(null, 'Esta partida no entró en la tabla: no había conexión con el servidor cuando empezó.', 'text-[#ffb74d]');
    case 'saving':
      return line(<Spinner className="size-7" />, 'Guardando y verificando tu partida…');
    case 'error':
      return (
        <div className="flex items-center gap-5">
          {line(null, submit.message, 'text-[#ff8a80]')}
          {submit.retry && (
            <button type="button" onClick={() => onSend()} className="pointer-events-auto rounded-xl border border-white/25 px-5 py-2 text-[20px] font-semibold hover:bg-white/10">
              Reintentar
            </button>
          )}
        </div>
      );
    case 'done': {
      const r = submit.res;
      if (r.status === 'verified')
        return (
          <div className="space-y-2">
            {line(<IconCheck className="size-8 text-[#9ff2a6]" />, r.rank ? <>Partida verificada · <b>puesto {r.rank}</b> de todos los tiempos{r.weekRank ? ` · ${r.weekRank} de la semana` : ''}</> : 'Partida verificada y guardada.', 'text-white')}
            {r.unlocked.length > 0 && line(<IconTrophy className="size-7 text-[#ffd23f]" />, <>Logro desbloqueado: {r.unlocked.map((a) => a.title).join(', ')}</>, 'text-[#ffd23f]')}
          </div>
        );
      if (r.status === 'pending') return line(<Spinner className="size-7" />, 'Tu partida se está verificando; aparecerá en la tabla en unos minutos.');
      if (r.status === 'saved') return line(<IconCheck className="size-8 text-white/60" />, r.personalBest ? `Guardada en tu historial. Tu récord verificado sigue siendo ${fmt(r.personalBest)}.` : 'Guardada en tu historial.');
      return line(null, 'No pudimos validar esta partida, así que no entra en la tabla.', 'text-[#ff8a80]');
    }
    case 'guest': {
      const submitNick = () => {
        const p = guestNameSchema.safeParse(nick);
        if (!p.success) return setLocal(p.error.issues[0]?.message ?? 'Apodo no válido');
        setLocal('');
        onSend(p.data);
      };
      return (
        <form
          className="pointer-events-auto"
          onSubmit={(e) => {
            e.preventDefault();
            submitNick();
          }}
        >
          <label htmlFor="tapon-nick" className="text-[20px] font-bold uppercase tracking-[0.18em] text-white/70">
            Pon tu apodo en la tabla
          </label>
          <div className="mt-3 flex items-center gap-4">
            <input
              id="tapon-nick"
              data-testid="tapon-nick"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={16}
              autoFocus
              autoComplete="nickname"
              placeholder="Tu apodo"
              className="h-[72px] w-[420px] rounded-2xl border-2 border-white/25 bg-black/40 px-6 text-[30px] font-semibold text-white outline-none placeholder:text-white/35 focus:border-[#ffb03a]"
            />
            <button type="submit" className="h-[72px] rounded-2xl bg-white px-8 text-[24px] font-extrabold uppercase tracking-wider text-[#1b1e23] hover:bg-[#ffd23f]" data-testid="tapon-save">
              Guardar
            </button>
          </div>
          {(local || submit.error) && <p className="mt-2 text-[20px] text-[#ff8a80]">{local || submit.error}</p>}
          <p className="mt-3 text-[18px] text-white/60">
            O{' '}
            <Link to="/registro?next=/juegos/el-tapon/jugar" className="font-semibold text-[#ffd23f] hover:underline">
              crea una cuenta gratis
            </Link>{' '}
            para guardar con tu nombre y ganar logros.
          </p>
        </form>
      );
    }
  }
}


function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-[#05070d]">
      <DgMark className="size-28" animated />
      <Title size={110} />
      <p className="flex items-center gap-4 text-[26px] text-white/70">
        <Spinner className="size-8" /> Preparando la calle…
      </p>
    </div>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#05070d]">
      <Panel className="w-[900px] p-14 text-center">
        <p className="text-[44px] font-bold">{title}</p>
        <p className="mt-4 text-[24px] leading-relaxed text-white/75">{children}</p>
        <div className="mt-10 flex justify-center gap-4">
          <BigButton primary onClick={() => location.reload()}>
            Reintentar
          </BigButton>
          <Link to="/juegos/el-tapon" className="inline-flex h-[84px] items-center rounded-[22px] border-2 border-white/25 px-10 text-[26px] font-bold hover:bg-white/10">
            Volver
          </Link>
        </div>
      </Panel>
    </div>
  );
}

/** The window is smaller than the minimum 1280×720 (the run pauses until it is big enough again). */
function TooSmall({ w, h }: { w: number; h: number }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#05070d]/95 p-8 text-center text-white" data-testid="tapon-too-small">
      <div className="max-w-md">
        <p className="text-2xl font-bold">Agranda la ventana</p>
        <p className="mt-3 text-ink-300">
          El Tapón necesita al menos {MIN_W} × {MIN_H} px (ahora: {w} × {h}). Maximiza el navegador o sal de la pantalla dividida; la partida queda en pausa.
        </p>
        <Link to="/juegos/el-tapon" className="mt-6 inline-block text-sm font-semibold text-gold-300 hover:text-white">
          ← Volver a El Tapón
        </Link>
      </div>
    </div>
  );
}

function TouchOnly() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#05070d] p-8 text-center text-white" data-testid="tapon-touch">
      <div className="max-w-sm">
        <p className="text-2xl font-bold">El Tapón se juega en PC</p>
        <p className="mt-3 text-ink-300">Necesitas un teclado (W/S o las flechas). Ábrelo desde una computadora para jugar.</p>
        <Link to="/juegos/el-tapon" className="mt-6 inline-block font-semibold text-gold-300 hover:text-white">
          ← Ver El Tapón
        </Link>
      </div>
    </div>
  );
}
