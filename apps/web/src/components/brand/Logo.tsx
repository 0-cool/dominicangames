import { useId } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * DominicanGames mark — “the World Grid”: four worlds on one platform. Three tiles in the colours of the
 * Dominican flag and the fourth one is “play”. The cross-shaped gap between them is the platform that
 * connects every world. Original artwork (no third-party brand references).
 */
export function DgMark({ className, animated = false, mono = false }: { className?: string; animated?: boolean; mono?: boolean }) {
  const id = useId().replace(/:/g, '');
  const blue = mono ? '#ffffff' : `url(#${id}b)`;
  const red = mono ? '#ffffff' : `url(#${id}r)`;
  const tile = (delay: number) => (animated ? { style: { animation: 'var(--animate-tile)', animationDelay: `${delay}ms`, transformOrigin: 'center', transformBox: 'fill-box' as const } } : {});
  return (
    <svg viewBox="0 0 32 32" className={cx('shrink-0', className ?? 'size-8')} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b98ff" />
          <stop offset="1" stopColor="#2747e6" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b84" />
          <stop offset="1" stopColor="#e3173e" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3.4" fill={blue} {...tile(0)} />
      <rect x="17" y="1.5" width="13.5" height="13.5" rx="3.4" fill={red} {...tile(160)} />
      <rect x="1.5" y="17" width="13.5" height="13.5" rx="3.4" fill={red} {...tile(480)} />
      <path d="M19.2 18.9v10.2c0 .9 1 1.5 1.8 1l8.4-5.1c.7-.5.7-1.6 0-2l-8.4-5.1c-.8-.5-1.8.1-1.8 1Z" fill="#ffffff" {...tile(320)} />
    </svg>
  );
}

/** Full lockup: mark + DOMINICANGAMES wordmark (+ optional tagline). */
export function Logo({ size = 'md', tagline = false, className }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean; className?: string }) {
  const s = { sm: { mark: 'size-7', text: 'text-[13px]', tag: 'text-[7.5px]' }, md: { mark: 'size-8', text: 'text-[15px]', tag: 'text-[8px]' }, lg: { mark: 'size-12', text: 'text-[23px]', tag: 'text-[10px]' } }[size];
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <DgMark className={s.mark} />
      <span className="leading-none">
        <span className={cx('block font-brand font-extrabold tracking-[-0.02em] text-white', s.text)}>
          DOMINICAN<span className="text-dg-red-500">GAMES</span>
        </span>
        {tagline && <span className={cx('mt-1.5 block font-bold tracking-[0.32em] text-ink-400', s.tag)}>ONE PLATFORM. MULTIPLE WORLDS.</span>}
      </span>
    </span>
  );
}

/** Platform loading state (route transitions, lazy chunks). */
export function DgLoader({ label = 'Cargando', fullscreen = false }: { label?: string; fullscreen?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-4 text-ink-400', fullscreen ? 'fixed inset-0 z-50 bg-ink-950' : 'min-h-[50vh]')} role="status" aria-live="polite">
      <DgMark className="size-12" animated />
      <span className="text-[11px] font-bold uppercase tracking-[0.3em]">{label}</span>
    </div>
  );
}
