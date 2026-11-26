import { Link } from 'react-router-dom';
import type { PublicGame } from '@sd/shared';
import { playHref, playable } from '../platform/catalog.ts';
import { ConceptTag, GameArt } from './brand/GameArt.tsx';
import { Badge, IconLock, IconPlay, cx } from './ui.tsx';

export function GameStatusBadge({ game }: { game: PublicGame }) {
  if (game.status === 'published') return <Badge tone="ok">{game.releaseLabel || 'Disponible'}</Badge>;
  if (game.status === 'development') return <Badge tone="blue">En desarrollo · solo admins</Badge>;
  return <Badge tone="white">{game.releaseLabel || 'Próximamente'}</Badge>;
}

/** Cover art: real game imagery when the catalog has it, otherwise labelled original concept art. */
export function GameCover({ game, variant = 'cover', className, imgClassName, tag = true }: { game: PublicGame; variant?: 'cover' | 'hero'; className?: string; imgClassName?: string; tag?: boolean }) {
  const src = variant === 'cover' ? (game.coverImage ?? game.heroImage) : (game.heroImage ?? game.coverImage);
  const positioned = /\b(absolute|fixed)\b/.test(className ?? '');
  return (
    <div className={cx(!positioned && 'relative', 'overflow-hidden', className)}>
      {src ? (
        <img src={src} alt={`${game.title} — captura dentro del juego`} loading="lazy" className={cx('size-full object-cover', imgClassName)} />
      ) : (
        <>
          <GameArt art={game.theme.art} accent={game.theme.accent} accent2={game.theme.accent2} className={cx('size-full', imgClassName)} />
          {tag && (
            <span className="absolute right-3 top-3">
              <ConceptTag />
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Catalog card. Playable games show a real PLAY action (their launcher); upcoming concepts are clearly marked
 * “Próximamente” and only link to their information page — they never pretend to be playable.
 */
export function GameCard({ game, signedIn, size = 'md' }: { game: PublicGame; signedIn: boolean; size?: 'md' | 'lg' }) {
  const href = playHref(game, signedIn);
  const soon = !playable(game);
  return (
    <article className={cx('group relative flex flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-ink-850 transition duration-500 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]', size === 'lg' ? 'min-h-[520px]' : 'min-h-[440px]')} data-testid={`game-card-${game.id}`}>
      <Link to={`/juegos/${game.id}`} className="absolute inset-0 z-10" aria-label={`Ver ${game.title}`} />
      <GameCover game={game} className="absolute inset-0" imgClassName="transition duration-[1.2s] ease-out group-hover:scale-[1.06]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,13,0.15)_0%,rgba(5,7,13,0.05)_35%,rgba(5,7,13,0.85)_72%,#05070d_100%)]" />
      <div className="absolute inset-x-0 top-0 h-1 opacity-80" style={{ background: `linear-gradient(90deg, ${game.theme.accent}, ${game.theme.accent2 ?? game.theme.accent})` }} />
      <div className="relative mt-auto p-6">
        <GameStatusBadge game={game} />
        <h3 className="brand-title mt-3 text-[1.55rem] text-white">{game.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-300">{game.tagline}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {game.categories.slice(0, 3).map((c) => (
            <span key={c} className="rounded-md bg-white/[0.07] px-2 py-1 text-[11px] font-medium text-ink-200">
              {c}
            </span>
          ))}
        </div>
        <div className="relative z-20 mt-5 flex items-center gap-3">
          {href ? (
            <Link to={href} className="inline-flex h-11 items-center gap-2 rounded-xl bg-dg px-5 text-sm font-bold uppercase tracking-wider text-white shadow-red transition hover:brightness-110" data-testid={`play-${game.id}`}>
              <IconPlay className="size-4" /> Jugar gratis
            </Link>
          ) : (
            <span className="inline-flex h-11 cursor-default items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold uppercase tracking-[0.18em] text-ink-300" aria-disabled>
              <IconLock className="size-4" /> {soon ? 'Próximamente' : 'No disponible'}
            </span>
          )}
          <Link to={`/juegos/${game.id}`} className="text-sm font-medium text-ink-300 transition hover:text-white">
            Ver más →
          </Link>
        </div>
      </div>
    </article>
  );
}
