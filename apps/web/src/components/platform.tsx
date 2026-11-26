import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AchievementView, AnnouncementView, Leaderboard } from '@sd/shared';
import { fmtDate } from '../lib/format.ts';
import { Avatar } from './brand/Avatar.tsx';
import { IconArrowLeft, IconArrowRight, IconCar, IconCrown, IconFlag, IconLandmark, IconLock, IconMegaphone, IconMoto, IconShield, IconSpeed, IconStar, IconTimer, IconTrophy, IconWalk, IconX, cx } from './ui.tsx';

const ICONS: Record<string, (p: { className?: string }) => ReactNode> = {
  star: IconStar,
  shield: IconShield,
  crown: IconCrown,
  flag: IconFlag,
  moto: IconMoto,
  timer: IconTimer,
  landmark: IconLandmark,
  car: IconCar,
  walk: IconWalk,
  speed: IconSpeed,
};

export function AchievementIcon({ icon, className }: { icon: string; className?: string }) {
  const I = ICONS[icon] ?? IconTrophy;
  return <I className={className} />;
}

/** One achievement tile (locked achievements are shown dimmed with their requirement). */
export function AchievementTile({ a, compact = false }: { a: AchievementView; compact?: boolean }) {
  const unlocked = !!a.unlockedAt;
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl border p-4 transition', unlocked ? 'border-gold-400/25 bg-gold-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]')} data-testid={`achievement-${a.id}`} data-unlocked={unlocked}>
      <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', unlocked ? 'bg-gradient-to-br from-gold-300 to-sun-500 text-ink-950 shadow-[0_8px_24px_-8px_rgba(255,194,61,0.7)]' : 'bg-white/[0.05] text-ink-500')}>
        {unlocked ? <AchievementIcon icon={a.icon} className="size-5" /> : <IconLock className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className={cx('text-sm font-semibold', unlocked ? 'text-white' : 'text-ink-300')}>{a.title}</p>
        {!compact && <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{a.description}</p>}
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {a.points} pts{unlocked && a.unlockedAt ? ` · ${fmtDate(a.unlockedAt)}` : ''}
        </p>
      </div>
    </div>
  );
}

/** A leaderboard with real entries, or an honest empty state. */
export function LeaderboardCard({ board, limit = 5, className }: { board: Leaderboard; limit?: number; className?: string }) {
  return (
    <div className={cx('card flex flex-col p-6', className)} data-testid={`leaderboard-${board.id}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-300">
          <IconTrophy className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold text-white">{board.title}</h3>
          <p className="text-xs text-ink-400">{board.description}</p>
        </div>
      </div>
      {board.entries.length === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink-200">Todavía no hay nadie aquí.</p>
          <p className="mt-1 text-xs text-ink-400">El ranking se llena con partidas reales. ¡Juega y sé el primero!</p>
        </div>
      ) : (
        <ol className="mt-5 space-y-1.5">
          {board.entries.slice(0, limit).map((e) => (
            <li key={`${e.rank}-${e.username}`} className="flex items-center gap-3 rounded-xl px-2 py-2 odd:bg-white/[0.025]">
              <span className={cx('w-6 text-center font-brand text-sm font-bold', e.rank === 1 ? 'text-gold-300' : e.rank === 2 ? 'text-ink-200' : e.rank === 3 ? 'text-sun-300' : 'text-ink-500')}>{e.rank}</span>
              {e.guest ? <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-ink-300">{e.username.slice(0, 1).toUpperCase()}</span> : <Avatar avatar={e.avatar} username={e.username} className="size-8" />}
              <span className="flex-1 truncate text-sm font-medium text-ink-100">
                {e.username}
                {e.guest && <span className="ml-2 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Invitado</span>}
              </span>
              <span className="font-mono text-sm text-ink-200">{e.display}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AnnouncementItem({ a }: { a: AnnouncementView }) {
  return (
    <article className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5" data-testid="announcement">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">
        <IconMegaphone className="size-3.5 text-dg-red-400" />
        {fmtDate(a.publishedAt)}
        {a.pinned && <span className="rounded bg-dg-red-500/15 px-1.5 py-0.5 text-[10px] text-dg-red-300">Destacado</span>}
      </div>
      <h3 className="mt-2 font-semibold text-white">{a.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{a.body}</p>
      {a.linkUrl && (
        <Link to={a.linkUrl} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-dg-blue-300 hover:text-white">
          {a.linkLabel || 'Ver más'} <IconArrowRight className="size-4" />
        </Link>
      )}
    </article>
  );
}

/** Full-screen screenshot viewer (← → to browse, Esc to close). */
export function Lightbox({ images, index, onClose, onIndex }: { images: { src: string; alt: string }[]; index: number; onClose(): void; onIndex(i: number): void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', on);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, onIndex]);
  const img = images[index];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Galería" onClick={onClose}>
      <figure className="relative max-h-[86vh] max-w-[86vw]" onClick={(e) => e.stopPropagation()}>
        <img src={img.src} alt={img.alt} className="max-h-[80vh] rounded-xl object-contain shadow-2xl" />
        <figcaption className="mt-3 flex items-center justify-between text-sm text-ink-300">
          <span>{img.alt}</span>
          <span className="text-ink-500">
            {index + 1} / {images.length} · Captura dentro del juego
          </span>
        </figcaption>
      </figure>
      <button className="absolute left-6 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), onIndex((index - 1 + images.length) % images.length))} aria-label="Anterior">
        <IconArrowLeft />
      </button>
      <button className="absolute right-6 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), onIndex((index + 1) % images.length))} aria-label="Siguiente">
        <IconArrowRight />
      </button>
      <button className="absolute right-6 top-6 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={onClose} aria-label="Cerrar">
        <IconX />
      </button>
    </div>
  );
}

/** Screenshot gallery with a lightbox. Shows up to `max` tiles (full rows) and a “+N” tile for the rest. */
export function Gallery({ images, className, max = 9 }: { images: { src: string; alt: string }[]; className?: string; max?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const shown = images.slice(0, max);
  const more = images.length - shown.length;
  return (
    <>
      <div className={cx('grid grid-cols-4 gap-3', className)}>
        {shown.map((s, i) => (
          <button key={s.src} onClick={() => setOpen(i)} className={cx('group relative overflow-hidden rounded-xl border border-white/[0.06]', i === 0 ? 'col-span-2 row-span-2' : '')} aria-label={`Ver captura: ${s.alt}`}>
            <img src={s.src} alt={s.alt} loading="lazy" className="aspect-video size-full object-cover transition duration-700 group-hover:scale-105" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-left text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">{s.alt}</span>
            {more > 0 && i === shown.length - 1 && <span className="absolute inset-0 flex items-center justify-center bg-black/60 font-brand text-2xl font-bold text-white">+{more}</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </>
  );
}

/** Section heading used across platform pages. */
export function SectionHeading({ eyebrow, title, children, action, center = false }: { eyebrow: string; title: ReactNode; children?: ReactNode; action?: ReactNode; center?: boolean }) {
  return (
    <div className={cx('mb-12 flex items-end justify-between gap-10', center && 'flex-col items-center text-center')}>
      <div className={cx('max-w-2xl', center && 'mx-auto')}>
        <p className="brand-eyebrow mb-4">{eyebrow}</p>
        <h2 className="brand-title text-[3.1rem] text-white">{title}</h2>
        {children && <p className="mt-4 text-[17px] leading-relaxed text-ink-300">{children}</p>}
      </div>
      {action}
    </div>
  );
}
