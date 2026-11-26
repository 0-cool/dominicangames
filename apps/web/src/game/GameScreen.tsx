import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Game, type GameEvent, type HudState, type MissionStats } from '@sd/game';
import { defaultGameSettings, gameSettingsSchema, saveDataSchema, type GameSettings, type SaveData } from '@sd/shared';
import { detectCapabilities } from '@sd/game/capabilities';
import { Api, ApiError, errorMessage, fetchGameAsset } from '../lib/api.ts';
import { PlaySession } from '../platform/session.ts';
import { reportError } from '../lib/telemetry.ts';
import { useTitle } from '../lib/useTitle.ts';
import { strings } from '../i18n/index.ts';
import { renderMapImage, type MapImage } from './mapCanvas.ts';
import { StreetIndex } from './streetIndex.ts';
import { Hud, type Toast } from './hud/Hud.tsx';
import { MapOverlay } from './hud/MapOverlay.tsx';
import { PauseMenu } from './hud/PauseMenu.tsx';
import { ClickToPlay, FailBanner, GameError, LoadingScreen, MissionComplete, PhotoModeBar, RadioBanner } from './hud/Overlays.tsx';

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'map' | 'complete' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Debug hooks (window.__SD_DEBUG__) only in development builds or explicit end-to-end test builds. */
const DEBUG = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';
/** Catalog id of this game on DominicanGames. */
const GAME_ID = 'santo-domingo-open-world';

export default function GameScreen() {
  useTitle('Jugando Santo Domingo Open World', { noindex: true });
  const nav = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, _setPhase] = useState<Phase>('loading');
  const phaseRef = useRef<Phase>('loading');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    _setPhase(p);
  };
  const [progress, setProgress] = useState({ p: 0, label: 'Preparando…' });
  const [hud, setHud] = useState<HudState | null>(null);
  const [radioBanner, setRadioBanner] = useState<{ station: string | null; at: number } | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const [photoFlash, setPhotoFlash] = useState(false);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [mapImg, setMapImg] = useState<MapImage | null>(null);
  const [streets, setStreets] = useState<StreetIndex | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [complete, setComplete] = useState<{ title: string; stats: MissionStats; reward: number; landmarks: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [firstTime, setFirstTime] = useState(true);
  const mapFrom = useRef<'playing' | 'paused'>('playing');
  const toastId = useRef(0);
  const savingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** DominicanGames play session (recently played / continue playing / analytics). */
  const session = useRef<PlaySession | null>(null);
  const t = strings(settings?.language);

  const toast = useCallback((n: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-3), { ...n, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), n.kind === 'landmark' ? 7000 : 4500);
  }, []);

  const save = useCallback(async (data: SaveData, keepalive = false) => {
    const parsed = saveDataSchema.safeParse(data);
    if (!parsed.success) return;
    setSaving('saving');
    clearTimeout(savingTimer.current);
    try {
      await Api.putSave(parsed.data, keepalive);
      setSaving('saved');
    } catch (e) {
      setSaving('error');
      if (!(e instanceof ApiError && e.status === 0)) reportError(e, 'save');
    }
    savingTimer.current = setTimeout(() => setSaving('idle'), 2200);
  }, []);

  // ───────────── lifecycle ─────────────
  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 size-full block outline-none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Juego Santo Domingo Open World');
    canvas.dataset.testid = 'game-canvas';
    host.current?.appendChild(canvas);
    setPhase('loading');
    setProgress({ p: 0, label: 'Preparando…' });
    setError('');

    const onEvent = (e: GameEvent) => {
      if (cancelled) return;
      switch (e.type) {
        case 'notification':
          toast({ title: e.title, text: e.text, kind: e.kind ?? 'info' });
          break;
        case 'missionStarted':
          toast({ title: `Misión: ${e.title}`, text: '', kind: 'info' });
          Api.postMission({ missionId: e.missionId, status: 'started' }).catch(() => undefined);
          break;
        case 'missionComplete':
          gameRef.current?.setPaused(true);
          setComplete({ title: e.title, stats: e.stats, reward: e.reward, landmarks: e.landmarks });
          setPhase('complete');
          Api.postMission({ missionId: e.missionId, status: 'completed', stats: { ...e.stats } }).catch((err) => reportError(err, 'mission'));
          break;
        case 'missionFailed':
          setFailed(e.reason);
          setTimeout(() => setFailed(null), 4000);
          Api.postMission({ missionId: e.missionId, status: 'failed' }).catch(() => undefined);
          break;
        case 'save':
          void save(e.data);
          break;
        case 'pauseRequest':
          if (phaseRef.current === 'playing') pause();
          break;
        case 'toggleMap':
          if (phaseRef.current === 'playing') openMap('playing');
          break;
        case 'radio': {
          const at = Date.now();
          setRadioBanner({ station: e.station, at });
          setTimeout(() => setRadioBanner((b) => (b && b.at === at ? null : b)), 3200);
          break;
        }
        case 'photoMode':
          setPhotoMode(e.active);
          break;
        case 'photoTaken': {
          const a = document.createElement('a');
          a.href = e.dataUrl;
          a.download = `santo-domingo-open-world-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
          a.click();
          setPhotoFlash(true);
          setTimeout(() => setPhotoFlash(false), 140);
          break;
        }
      }
    };

    (async () => {
      // Yield once: React StrictMode (development) mounts, unmounts and remounts effects
      // synchronously — this avoids booting a second engine that is immediately discarded.
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
      try {
        const caps = detectCapabilities();
        if (!caps.supported) throw new Error(caps.reasons.join(' '));
        setProgress({ p: 0.02, label: 'Cargando tu partida…' });
        const [s, sv, ms] = await Promise.all([Api.getSettings(), Api.getSave(), Api.missions()]);
        const parsedSettings = s.settings ? gameSettingsSchema.safeParse(s.settings) : null;
        const gs = parsedSettings?.success ? parsedSettings.data : defaultGameSettings(caps.suggested);
        if (cancelled) return;
        setSettings(gs);
        setFirstTime(!sv.save);
        const parsedSave = sv.save ? saveDataSchema.safeParse(sv.save) : null;
        game = new Game({
          canvas,
          fetchAsset: fetchGameAsset,
          settings: gs,
          save: parsedSave?.success ? parsedSave.data : null,
          completedMissions: ms.missions.filter((m) => m.status === 'completed').map((m) => m.missionId),
          onHud: (h) => !cancelled && setHud(h),
          onEvent,
          onProgress: (p, label) => !cancelled && setProgress({ p: 0.04 + p * 0.94, label }),
          debug: DEBUG,
        });
        gameRef.current = game;
        await game.init();
        if (cancelled) return;
        setProgress({ p: 0.99, label: 'Dibujando el mapa…' });
        const img = renderMapImage(game.world, 1);
        setMapImg(img);
        setStreets(new StreetIndex(game.world.roads));
        game.setPaused(true);
        game.start();
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError && e.status === 401 ? 'Tu sesión expiró. Vuelve a entrar con tu cuenta DominicanGames.' : e instanceof ApiError && e.status === 403 ? 'Este juego no está disponible en este momento.' : errorMessage(e);
        setError(msg);
        setPhase('error');
        reportError(e, 'game.init');
      }
    })();

    return () => {
      cancelled = true;
      game?.dispose();
      gameRef.current = null;
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // The session ends when the player leaves the game screen (exit, navigation or closing the tab).
  useEffect(
    () => () => {
      void session.current?.end(true);
    },
    [],
  );

  // ───────────── controls ─────────────
  const play = () => {
    const g = gameRef.current;
    if (!g) return;
    setFirstTime(false);
    setPhase('playing');
    g.setPaused(false);
    g.activate();
    if (!session.current) {
      session.current = new PlaySession(GAME_ID);
      void session.current.start();
    }
  };
  const pause = () => {
    const g = gameRef.current;
    if (!g) return;
    setPhase('paused');
    g.setPaused(true);
  };
  const resume = () => {
    const g = gameRef.current;
    if (!g) return;
    setPhase('playing');
    g.setPaused(false);
    g.activate();
  };
  const openMap = (from: 'playing' | 'paused') => {
    const g = gameRef.current;
    if (!g || !mapImg) return;
    mapFrom.current = from;
    setPhase('map');
    g.setPaused(true);
  };
  const closeMap = () => {
    if (mapFrom.current === 'playing') resume();
    else setPhase('paused');
  };
  /** Save, close the play session and leave: to the launcher or back to the DominicanGames dashboard. */
  const exit = async (to: '/jugar' | '/panel' = '/jugar') => {
    const g = gameRef.current;
    if (g) await save(g.snapshot());
    await session.current?.end();
    nav(to);
  };

  // pointer lock lost (Esc in the browser) → pause; Esc while paused → resume
  useEffect(() => {
    const onLock = () => {
      if (!document.pointerLockElement && phaseRef.current === 'playing') {
        if (gameRef.current?.photoMode) gameRef.current.setPhotoMode(false);
        pause();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && phaseRef.current === 'paused') {
        e.preventDefault();
        resume();
      }
    };
    const onHide = () => {
      const g = gameRef.current;
      if (!g || phaseRef.current === 'loading' || phaseRef.current === 'error') return;
      if (document.visibilityState === 'hidden') {
        if (phaseRef.current === 'playing') pause();
        void save(g.snapshot(), true);
      }
    };
    const onPageHide = () => {
      const g = gameRef.current;
      if (g && phaseRef.current !== 'loading' && phaseRef.current !== 'error') void save(g.snapshot(), true);
    };
    document.addEventListener('pointerlockchange', onLock);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('pointerlockchange', onLock);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const g = gameRef.current;
  return (
    <div className="fixed inset-0 overflow-hidden bg-black" data-testid="game-screen" data-phase={phase}>
      <div ref={host} className="absolute inset-0" />
      {photoMode && phase === 'playing' && <PhotoModeBar flash={photoFlash} />}
      {radioBanner && !photoMode && phase === 'playing' && <RadioBanner key={radioBanner.at} station={radioBanner.station} />}
      {hud && !photoMode && (phase === 'playing' || phase === 'paused') && <Hud hud={hud} map={mapImg} streets={streets} toasts={phase === 'playing' ? toasts : []} t={t} showFps={!!settings?.graphics.showFps} saving={saving} />}
      {failed && phase === 'playing' && <FailBanner text={failed} />}
      {phase === 'loading' && <LoadingScreen progress={progress.p} label={progress.label} t={t} />}
      {phase === 'ready' && <ClickToPlay t={t} onPlay={play} firstTime={firstTime} />}
      {phase === 'paused' && g && settings && (
        <PauseMenu
          game={g}
          t={t}
          settings={settings}
          saving={saving}
          onSettings={(s) => {
            setSettings(s);
            g.applySettings(s);
          }}
          onSaveSettings={async () => {
            if (settings) await Api.putSettings(settings);
          }}
          onResume={resume}
          onMap={() => openMap('paused')}
          onSave={() => void save(g.snapshot())}
          onExit={() => void exit('/jugar')}
          onPlatform={() => void exit('/panel')}
        />
      )}
      {phase === 'map' && g && mapImg && <MapOverlay game={g} map={mapImg} t={t} onClose={closeMap} />}
      {phase === 'complete' && complete && (
        <MissionComplete
          t={t}
          {...complete}
          onContinue={() => {
            setComplete(null);
            resume();
          }}
        />
      )}
      {phase === 'error' && <GameError t={t} message={error} onRetry={() => setAttempt((a) => a + 1)} onBack={() => nav('/jugar')} onPlatform={() => nav('/panel')} />}
    </div>
  );
}
