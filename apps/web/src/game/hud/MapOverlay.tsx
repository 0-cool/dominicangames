import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, HudMarker } from '@sd/game';
import type { Strings } from '../../i18n/index.ts';
import { streetLabels, type MapImage } from '../mapCanvas.ts';
import { MARKER_STYLE, drawMarker, drawPlayerArrow, drawRoute } from './Minimap.tsx';
import { Button, IconX, cx } from '../../components/ui.tsx';

interface View {
  x: number;
  z: number;
  zoom: number; // screen px per metre
}

const LEGEND: [HudMarker['kind'], string][] = [
  ['checkpoint', 'Objetivo / punto de control'],
  ['npc', 'Personaje'],
  ['vehicle', 'Vehículo de la misión'],
  ['activity', 'Actividad'],
  ['landmark', 'Monumento por descubrir'],
  ['landmark_found', 'Monumento descubierto'],
];

export function MapOverlay({ game, map, t, onClose }: { game: Game; map: MapImage; t: Strings; onClose(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const player = game.player.position;
  const [view, setView] = useState<View>({ x: player.x, z: player.z, zoom: 0.9 });
  const [markers, setMarkers] = useState<HudMarker[]>(() => game.hud().markers);
  const [route, setRoute] = useState<number[]>(() => game.hud().route);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vz: number; moved: boolean } | null>(null);
  const labels = useMemo(() => streetLabels(game.world.roads), [game]);
  const landmarks = game.world.manifest.landmarks;
  const found = new Set(game.landmarks.discovered());
  const heading = game.hud().player.heading;
  const pb = game.world.manifest.playBounds;

  const size = () => {
    const el = wrap.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: window.innerWidth, h: window.innerHeight };
  };
  const toScreen = useCallback(
    (x: number, z: number, v: View = view): [number, number] => {
      const { w, h } = size();
      return [w / 2 + (x - v.x) * v.zoom, h / 2 + (z - v.z) * v.zoom];
    },
    [view],
  );
  const toWorld = (sx: number, sy: number): [number, number] => {
    const { w, h } = size();
    return [view.x + (sx - w / 2) / view.zoom, view.z + (sy - h / 2) / view.zoom];
  };

  // draw
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const { w, h } = size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d3a50';
    ctx.fillRect(0, 0, w, h);
    const k = view.zoom / map.scale;
    const [ox, oy] = toScreen(map.minX, map.minZ);
    ctx.imageSmoothingEnabled = view.zoom < 3;
    ctx.drawImage(map.canvas, ox, oy, map.width * k, map.height * k);

    // street labels
    if (view.zoom > 1.1) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) {
        if (!l.major && view.zoom < 2.2) continue;
        const [sx, sy] = toScreen(l.x, l.z);
        if (sx < -100 || sy < -40 || sx > w + 100 || sy > h + 40) continue;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(l.angle);
        ctx.font = `${l.major ? 600 : 500} ${l.major ? 12 : 10.5}px Inter Variable, system-ui, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,12,18,0.85)';
        ctx.strokeText(l.name, 0, 0);
        ctx.fillStyle = l.major ? '#f1f3f8' : '#c9cfdb';
        ctx.fillText(l.name, 0, 0);
        ctx.restore();
      }
    }
    // route
    if (route.length >= 4) {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < route.length; i += 2) pts.push(toScreen(route[i], route[i + 1]));
      drawRoute(ctx, pts, 4);
    }
    // markers (landmarks with names)
    for (const m of markers) {
      const [sx, sy] = toScreen(m.x, m.z);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      drawMarker(ctx, sx, sy, m.kind, m.kind.startsWith('landmark') ? 1.15 : 1.35);
      if (m.label && (m.kind.startsWith('landmark') ? view.zoom > 0.75 || hover === m.label : true)) {
        ctx.font = '600 12px Inter Variable, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(10,12,18,0.9)';
        ctx.strokeText(m.label, sx + 14, sy);
        ctx.fillStyle = MARKER_STYLE[m.kind].fill;
        ctx.fillText(m.label, sx + 14, sy);
      }
    }
    const [px, py] = toScreen(player.x, player.z);
    drawPlayerArrow(ctx, px, py, (heading * Math.PI) / 180, 11);
  }, [view, markers, route, labels, map, toScreen, hover, player, heading]);

  // keyboard: close with M / Esc
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mapKey = game.settings.controls.bindings.map ?? 'KeyM';
      if (e.code === 'Escape' || e.code === mapKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', on, { capture: true });
    return () => window.removeEventListener('keydown', on, { capture: true });
  }, [onClose, game]);

  const clampView = (v: View): View => ({ zoom: Math.min(6, Math.max(0.25, v.zoom)), x: Math.min(pb.maxX, Math.max(pb.minX, v.x)), z: Math.min(pb.maxZ, Math.max(pb.minZ, v.z)) });

  const setWaypoint = (x: number, z: number) => {
    if (x < pb.minX || x > pb.maxX || z < pb.minZ || z > pb.maxZ) return;
    game.setWaypoint(x, z);
    setMarkers(game.hud().markers);
    setRoute(game.network.route(player.x, player.z, x, z));
  };
  const clearWaypoint = () => {
    game.clearWaypoint();
    setMarkers(game.hud().markers);
    setRoute(game.hud().route);
  };

  return (
    <div className="absolute inset-0 z-30 flex bg-ink-950/95 animate-fade-up" data-testid="map-overlay">
      <div
        ref={wrap}
        className="relative flex-1 cursor-grab active:cursor-grabbing"
        onWheel={(e) => {
          const r = wrap.current!.getBoundingClientRect();
          const [wx, wz] = toWorld(e.clientX - r.left, e.clientY - r.top);
          const zoom = Math.min(6, Math.max(0.25, view.zoom * Math.exp(-e.deltaY * 0.0015)));
          const { w, h } = size();
          // keep the point under the cursor fixed
          setView(clampView({ zoom, x: wx - (e.clientX - r.left - w / 2) / zoom, z: wz - (e.clientY - r.top - h / 2) / zoom }));
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (d.moved) setView((v) => clampView({ ...v, x: d.vx - dx / v.zoom, z: d.vz - dy / v.zoom }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const r = wrap.current!.getBoundingClientRect();
            const [wx, wz] = toWorld(e.clientX - r.left, e.clientY - r.top);
            setWaypoint(wx, wz);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearWaypoint();
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" data-testid="map-canvas" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-6 py-4 text-xs text-ink-300">
          <span>{t.mapHelp}</span>
          <span>{t.attribution}</span>
        </div>
      </div>
      <aside className="scroll-thin flex w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-ink-900/90 p-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-3xl text-white">{t.map}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-ink-300 hover:bg-white/10 hover:text-white" aria-label={t.close}>
            <IconX />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setView((v) => ({ ...v, x: player.x, z: player.z }))}>
            {t.center}
          </Button>
          {markers.some((m) => m.label === 'Destino') && (
            <Button size="sm" variant="ghost" onClick={clearWaypoint}>
              Quitar destino
            </Button>
          )}
        </div>
        <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.18em] text-ink-400">Monumentos · {found.size}/{landmarks.length}</p>
        <ul className="space-y-1">
          {landmarks.map((l) => (
            <li key={l.id}>
              <button
                onMouseEnter={() => setHover(l.name)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setView((v) => ({ ...v, x: l.x, z: l.z, zoom: Math.max(v.zoom, 1.6) }))}
                onDoubleClick={() => setWaypoint(l.x, l.z)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/[0.06]"
                title="Clic: ver en el mapa · Doble clic: marcar destino"
              >
                <span className={cx('size-2.5 shrink-0 rounded-full', found.has(l.id) ? 'bg-[#8d84a8]' : 'bg-[#c9a6ff]')} />
                <span className={found.has(l.id) ? 'text-ink-200' : 'text-ink-400'}>{found.has(l.id) ? l.name : `${l.name}`}</span>
                {found.has(l.id) && <span className="ml-auto text-[10px] text-ink-500">{t.discovered}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.18em] text-ink-400">{t.legend}</p>
        <ul className="space-y-1.5 text-sm text-ink-300">
          {LEGEND.map(([k, label]) => (
            <li key={k} className="flex items-center gap-2.5">
              <span className="flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-ink-950" style={{ background: MARKER_STYLE[k].fill }}>
                {MARKER_STYLE[k].glyph}
              </span>
              {label}
            </li>
          ))}
          <li className="flex items-center gap-2.5">
            <span className="h-1 w-4 rounded bg-gold-400" /> Ruta del GPS
          </li>
        </ul>
      </aside>
    </div>
  );
}
