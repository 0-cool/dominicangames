import { formatDop } from '@sd/shared';

export { formatDop };

export const fmtDate = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m}:${String(ss).padStart(2, '0')} min`;
  return `${ss} s`;
}

export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-DO', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

export const fmtMoney = (n: number) => `RD$${Math.round(n).toLocaleString('es-DO')}`;

export const PAYMENT_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  created: { label: 'Creado', tone: 'muted' },
  pending: { label: 'Pendiente', tone: 'warn' },
  succeeded: { label: 'Aprobado', tone: 'ok' },
  failed: { label: 'Rechazado', tone: 'bad' },
  canceled: { label: 'Cancelado', tone: 'muted' },
  refunded: { label: 'Reembolsado', tone: 'warn' },
};

export const MISSION_NAMES: Record<string, string> = {
  m001_bienvenido: 'Bienvenido a Santo Domingo',
  reto_malecon: 'Reto del Malecón',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Espacio',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift Der.',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl Der.',
    AltLeft: 'Alt',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`',
    Mouse0: 'Clic',
  };
  return map[code] ?? code;
}
