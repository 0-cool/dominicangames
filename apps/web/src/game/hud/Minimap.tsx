import { useEffect, useRef } from 'react';
import type { HudMarker, HudState } from '@sd/game';
import type { MapImage } from '../mapCanvas.ts';

export const MARKER_STYLE: Record<HudMarker['kind'], { fill: string; ring: string; glyph: string; edge: boolean; r: number }> = {
  objective: { fill: '#ffc23d', ring: '#3a2a00', glyph: '★', edge: true, r: 8 },
  checkpoint: { fill: '#ffc23d', ring: '#3a2a00', glyph: '●', edge: true, r: 8 },
  npc: { fill: '#2fd3c0', ring: '#003a33', glyph: '!', edge: true, r: 8 },
  vehicle: { fill: '#4da3ff', ring: '#002244', glyph: '⛟', edge: true, r: 8 },
  activity: { fill: '#ff6a3d', ring: '#3a1000', glyph: '⏱', edge: false, r: 8 },
  landmark: { fill: '#c9a6ff', ring: '#2a1550', glyph: '?', edge: false, r: 6.5 },
  landmark_found: { fill: '#8d84a8', ring: '#1a1626', glyph: '✓', edge: false, r: 5.5 },
};

export function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, kind: HudMarker['kind'], scale = 1) {
  const st = MARKER_STYLE[kind];
  const r = st.r * scale;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5 * scale, 0, Math.PI * 2);
  ctx.fillStyle = st.ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.fillStyle = '#0b0d13';
  ctx.font = `bold ${Math.round(r * 1.25)}px Inter Variable, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(st.glyph, x, y + 0.5);
}

export function drawPlayerArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.25);
  ctx.lineTo(size * 0.85, size * 0.9);
  ctx.lineTo(0, size * 0.45);
  ctx.lineTo(-size * 0.85, size * 0.9);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0b0d13';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

export function drawRoute(ctx: CanvasRenderingContext2D, pts: [number, number][], width: number) {
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, c] of [
    [width + 3, 'rgba(40,24,0,0.8)'],
    [width, '#ffc23d'],
  ] as const) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke();
  }
}

/** Rotating, speed-zoomed circular minimap (heading up). */
export function Minimap({ hud, map, size = 210 }: { hud: HudState; map: MapImage; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoom = useRef(1.6);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = hud.mode === 'vehicle' ? Math.max(0.55, 1.45 - hud.speedKmh / 110) : 1.9;
    zoom.current += (target - zoom.current) * 0.12;
    const z = zoom.current;
    const { x: px, z: pz, heading } = hud.player;
    const rot = (-heading * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const R = size / 2;
    const cx = R;
    const cy = R + size * 0.12;
    const toScreen = (wx: number, wz: number): [number, number] => {
      const dx = (wx - px) * z;
      const dy = (wz - pz) * z;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d3a50';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const k = z / map.scale;
    ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.canvas, -(px - map.minX) * map.scale, -(pz - map.minZ) * map.scale);
    ctx.restore();

    // GPS route
    if (hud.route.length >= 4) {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < hud.route.length; i += 2) pts.push(toScreen(hud.route[i], hud.route[i + 1]));
      drawRoute(ctx, pts, 3.5);
    }
    // subtle vignette
    const g = ctx.createRadialGradient(R, R, R * 0.6, R, R, R);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // markers (important ones stick to the rim when off-screen)
    const ordered = [...hud.markers].sort((a, b) => (MARKER_STYLE[a.kind].edge ? 1 : 0) - (MARKER_STYLE[b.kind].edge ? 1 : 0));
    for (const m of ordered) {
      let [sx, sy] = toScreen(m.x, m.z);
      const dx = sx - R;
      const dy = sy - R;
      const d = Math.hypot(dx, dy);
      const lim = R - 11;
      if (d > lim) {
        if (!MARKER_STYLE[m.kind].edge) continue;
        sx = R + (dx / d) * lim;
        sy = R + (dy / d) * lim;
      }
      drawMarker(ctx, sx, sy, m.kind, 0.9);
    }
    drawPlayerArrow(ctx, cx, cy, 0, 8);
    ctx.restore();

    // rim + north
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const nx = R + Math.sin(rot) * (R - 12) * 1;
    const ny = R - Math.cos(rot) * (R - 12);
    ctx.beginPath();
    ctx.arc(nx, ny, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0d13';
    ctx.fill();
    ctx.fillStyle = '#ff6a3d';
    ctx.font = 'bold 11px Inter Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);
  }, [hud, map, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.6)]" aria-label="Minimapa" />;
}
