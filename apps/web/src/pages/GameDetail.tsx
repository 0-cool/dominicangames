import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PublicGame } from '@sd/shared';
import { Api, ApiError, errorMessage } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { useTitle } from '../lib/useTitle.ts';
import { playHref, playable, useCatalog } from '../platform/catalog.ts';
import { webGameModule } from '../games/registry.tsx';
import { DgLoader } from '../components/brand/Logo.tsx';
import { ConceptTag, GameArt } from '../components/brand/GameArt.tsx';
import { GameCard, GameStatusBadge } from '../components/GameCard.tsx';
import { Gallery } from '../components/platform.tsx';
import { Alert, IconArrowLeft, IconCheck, IconLock, IconPlay, LinkButton } from '../components/ui.tsx';

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-white/[0.07] py-3.5 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-[0.18em] text-ink-500">{label}</dt>
      <dd className="text-right text-[15px] text-ink-100">{children}</dd>
    </div>
  );
}

export function GameDetailPage() {
  const { gameId = '' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { games } = useCatalog();
  const [game, setGame] = useState<PublicGame | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  useEffect(() => {
    setGame(null);
    setError(null);
    Api.game(gameId)
      .then((r) => setGame(r.game))
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e) }));
  }, [gameId, user?.id]);
  useTitle(game ? `${game.title}${playable(game) ? '' : ' (Próximamente)'}` : 'Juego', { description: game?.description, image: game?.heroImage ?? game?.coverImage ?? undefined });

  if (error)
    return (
      <div className="mx-auto max-w-xl px-8 pb-24 pt-40 text-center">
        <p className="brand-title text-4xl text-white">{error.status === 404 ? 'Juego no encontrado' : 'No pudimos cargar el juego'}</p>
        <p className="mt-3 text-ink-300">{error.status === 404 ? 'Ese juego no existe o ya no está en el catálogo.' : error.message}</p>
        <LinkButton to="/juegos" className="mt-8">Ver el catálogo</LinkButton>
      </div>
    );
  if (!game) return <div className="pt-24"><DgLoader /></div>;

  const href = playHref(game, !!user);
  const soon = !playable(game);
  const mod = webGameModule(game.id);
  const hero = game.heroImage ?? game.coverImage;
  const others = (games ?? []).filter((g) => g.id !== game.id).slice(0, 3);
  const isSdow = game.id === 'santo-domingo-open-world';
  const isTapon = game.id === 'el-tapon';

  return (
    <div data-testid="game-detail" data-game={game.id}>
      <section className="grain relative isolate flex min-h-[86vh] items-end overflow-hidden">
        {hero ? (
          <img src={hero} alt={`${game.title} — captura dentro del juego`} className="absolute inset-0 -z-20 size-full object-cover animate-kenburns" fetchPriority="high" />
        ) : (
          <div className="absolute inset-y-0 right-0 -z-20 w-[74%] [mask-image:linear-gradient(90deg,transparent_0%,#000_28%)]">
            <GameArt art={game.theme.art} accent={game.theme.accent} accent2={game.theme.accent2} />
          </div>
        )}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,7,13,0.92)_0%,rgba(5,7,13,0.55)_45%,rgba(5,7,13,0.1)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,7,13,0.6)_0%,transparent_25%,transparent_60%,#05070d_100%)]" />
        <div className="mx-auto w-full max-w-[1240px] px-8 pb-16 pt-40">
          <Link to="/juegos" className="mb-8 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white">
            <IconArrowLeft className="size-4" /> Catálogo
          </Link>
          {params.get('gratis') && (
            <Alert tone="success" className="mb-6 max-w-xl" title="¡Juega gratis!">
              {game.title} es gratis con tu cuenta DominicanGames. Crea tu cuenta o entra y juega.
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <GameStatusBadge game={game} />
            {!hero && <ConceptTag />}
          </div>
          {isSdow ? (
            <h1 className="mt-5">
              <span className="display block text-[7rem] text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)]">
                Santo <span className="text-gradient-sun">Domingo</span>
              </span>
              <span className="mt-2 block text-sm font-bold tracking-[0.6em] text-ink-100">OPEN WORLD</span>
            </h1>
          ) : isTapon ? (
            <h1 className="mt-5">
              <span className="display block text-[7.5rem] leading-[0.9] text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)]">
                El <span className="bg-gradient-to-b from-[#ffd23f] to-[#ff7a1a] bg-clip-text text-transparent">Tapón</span>
              </span>
              <span className="mt-3 block text-sm font-bold tracking-[0.5em] text-ink-100">DE SANTO DOMINGO</span>
            </h1>
          ) : (
            <h1 className="brand-title mt-5 text-[5rem] text-white">{game.title}</h1>
          )}
          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink-200">{game.tagline}</p>
          <div className="mt-9 flex items-center gap-4">
            {href ? (
              <LinkButton to={href} size="xl" data-testid="game-play">
                <IconPlay className="size-5" /> Jugar ahora
              </LinkButton>
            ) : (
              <span className="inline-flex h-16 items-center gap-3 rounded-2xl border border-white/20 bg-black/30 px-8 text-sm font-bold uppercase tracking-[0.2em] text-white backdrop-blur" data-testid="game-soon">
                <IconLock className="size-5" /> Próximamente
              </span>
            )}
            {href && (
              <span className="flex items-center gap-2 text-sm text-ink-300">
                <IconCheck className="size-4 text-leaf-500" /> {game.guestPlay && !user ? 'Gratis · juega sin cuenta' : 'Gratis con tu cuenta DominicanGames'}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.5fr_1fr] gap-14 px-8">
          <div>
            <p className="brand-eyebrow mb-4">{soon ? 'Concepto en desarrollo' : 'Sobre el juego'}</p>
            <p className="text-[19px] leading-relaxed text-ink-200">{game.description}</p>
            {soon && (
              <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-6">
                <p className="font-semibold text-white">Todavía no se puede jugar.</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
                  {game.title} es un concepto que DominicanGames tiene en desarrollo. El arte de esta página es conceptual. Anunciaremos su lanzamiento en la comunidad y en tu panel.
                </p>
                <LinkButton to="/juegos/santo-domingo-open-world" variant="secondary" className="mt-5">
                  Mientras tanto, juega Santo Domingo Open World
                </LinkButton>
              </div>
            )}
          </div>
          <dl className="card h-fit px-6 py-2">
            <MetaRow label="Categoría">{game.categories.join(' · ') || '—'}</MetaRow>
            <MetaRow label="Plataforma">{game.platforms.join(' · ') || 'Por anunciar'}</MetaRow>
            <MetaRow label="Disponibilidad">{game.releaseLabel || (soon ? 'Próximamente' : 'Disponible')}</MetaRow>
            <MetaRow label="Precio">{soon ? 'Por anunciar' : 'Gratis'}</MetaRow>
            <MetaRow label="Desarrollador">{game.developer}</MetaRow>
            <MetaRow label="Editor">{game.publisher}</MetaRow>
          </dl>
        </div>
        {game.screenshots.length > 0 && (
          <div className="mx-auto mt-16 max-w-[1240px] px-8">
            <p className="brand-eyebrow mb-5">Capturas dentro del juego</p>
            <Gallery images={game.screenshots} />
          </div>
        )}
      </section>

      {mod?.DetailSections && (
        <Suspense fallback={<DgLoader />}>
          <mod.DetailSections game={game} />
        </Suspense>
      )}

      {others.length > 0 && (
        <section className="border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-[1240px] px-8">
            <p className="brand-eyebrow mb-3">Más de DominicanGames</p>
            <h2 className="brand-title mb-10 text-[2.4rem] text-white">Otros mundos</h2>
            <div className="grid grid-cols-3 gap-5">
              {others.map((g) => (
                <GameCard key={g.id} game={g} signedIn={!!user} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
