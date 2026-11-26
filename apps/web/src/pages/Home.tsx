import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, type PublicGame } from '@sd/shared';
import { Api, type Community } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { useTitle } from '../lib/useTitle.ts';
import { featuredGame, playHref, playable, useCatalog } from '../platform/catalog.ts';
import { DgMark } from '../components/brand/Logo.tsx';
import { GameCard, GameCover, GameStatusBadge } from '../components/GameCard.tsx';
import { AchievementIcon, AnnouncementItem, Gallery, LeaderboardCard, SectionHeading } from '../components/platform.tsx';
import { IconArrowRight, IconCalendar, IconCheck, IconGamepad, IconGlobe, IconGrid, IconHeart, IconPeople, IconPlay, IconSpark, IconTrophy, IconUser, LinkButton, cx } from '../components/ui.tsx';

/** Real in-game captures of Santo Domingo Open World (DominicanGames' first title). */
const SLIDES = [
  { src: '/img/games/santo-domingo-open-world/hero-malecon-anochecer.jpg', place: 'El Malecón', time: 'Anochecer' },
  { src: '/img/games/santo-domingo-open-world/hero.jpg', place: 'Zona Colonial', time: 'Atardecer' },
  { src: '/img/games/santo-domingo-open-world/hero-lluvia-noche.jpg', place: 'Calle El Conde', time: 'Aguacero de noche' },
  { src: '/img/games/santo-domingo-open-world/hero-obelisco.jpg', place: 'Obelisco del Malecón', time: 'Hora dorada' },
  { src: '/img/games/santo-domingo-open-world/hero-malecon-noche.jpg', place: 'Avenida George Washington', time: 'Noche' },
];
const SLIDE_MS = 6500;

function usePlayTarget(game: PublicGame | null) {
  const { user } = useAuth();
  if (game) return playHref(game, !!user) ?? `/juegos/${game.id}`;
  return user ? '/jugar' : '/registro?next=%2Fjugar';
}

function Hero({ featured }: { featured: PublicGame | null }) {
  const [i, setI] = useState(0);
  const play = usePlayTarget(featured);
  useEffect(() => {
    SLIDES.slice(1).forEach((s) => {
      const img = new Image();
      img.src = s.src;
    });
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, []);
  const slide = SLIDES[i];
  return (
    <section className="grain relative isolate flex min-h-[max(100svh,760px)] items-center overflow-hidden" data-testid="home-hero">
      {SLIDES.map((s, n) => (
        <div key={s.src} className={cx('absolute inset-0 -z-20 transition-opacity duration-[1400ms]', n === i ? 'opacity-100' : 'opacity-0')} aria-hidden={n !== i}>
          <img key={n === i ? `${s.src}-${i}` : s.src} src={s.src} alt={n === i ? `${s.place} en Santo Domingo Open World` : ''} className={cx('size-full object-cover', n === i && 'animate-kenburns')} fetchPriority={n === 0 ? 'high' : 'low'} />
        </div>
      ))}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,7,13,0.94)_0%,rgba(5,7,13,0.72)_34%,rgba(5,7,13,0.18)_64%,rgba(5,7,13,0.35)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,7,13,0.55)_0%,transparent_22%,transparent_70%,#05070d_100%)]" />

      <div className="mx-auto w-full max-w-[1400px] px-8 pb-28 pt-36">
        <div className="max-w-[760px]">
          <p className="flex items-center gap-3 animate-fade-up">
            <DgMark className="size-6" />
            <span className="text-[11px] font-bold uppercase tracking-[0.34em] text-ink-200">La casa del gaming dominicano</span>
          </p>
          <h1 className="brand-title mt-8 text-[5.6rem] leading-[0.94] text-white drop-shadow-[0_8px_40px_rgba(0,0,0,0.55)]" aria-label="Tu mundo. Tus reglas. Tu juego.">
            <span className="block animate-fade-up [animation-delay:80ms]">TU MUNDO.</span>
            <span className="block animate-fade-up [animation-delay:200ms]">TUS REGLAS.</span>
            <span className="text-gradient-dg block animate-fade-up [animation-delay:320ms]">TU JUEGO.</span>
          </h1>
          <p className="mt-8 max-w-[560px] text-lg leading-relaxed text-ink-200 animate-fade-up [animation-delay:440ms]">
            Descubre nuevos mundos, explora experiencias y juega desde un solo lugar. Bienvenido a {BRAND.name}.
          </p>
          <div className="mt-10 flex items-center gap-4 animate-fade-up [animation-delay:560ms]">
            <LinkButton to={play} size="xl" data-testid="hero-play">
              <IconPlay className="size-5" /> Jugar ahora
            </LinkButton>
            <a href="#juegos" className="inline-flex h-16 items-center gap-3 rounded-2xl border border-white/25 px-8 text-base font-bold uppercase tracking-[0.08em] text-white transition hover:border-white/60 hover:bg-white/[0.06]" data-testid="hero-explore">
              <IconGrid className="size-5" /> Explorar juegos
            </a>
          </div>
          <ul className="mt-9 flex items-center gap-7 text-sm text-ink-300 animate-fade-up [animation-delay:680ms]">
            {['Registro gratis', 'Sin descargas', 'Una cuenta para todos los juegos'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <IconCheck className="size-4 text-dg-red-400" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* “now showing” location tag — inspired by in-game location callouts */}
      <div className="absolute bottom-10 right-8 w-[340px]">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-ink-400">
            <span className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-dg-red-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-dg-red-500" />
              </span>
              En pantalla
            </span>
            <span className="text-ink-500">Captura real</span>
          </div>
          <p key={slide.place} className="brand-title mt-3 text-lg text-white animate-fade-up">{slide.place}</p>
          <p className="text-sm text-ink-300">
            {slide.time} · <span className="text-sun-300">Santo Domingo Open World</span>
          </p>
          <div className="mt-4 flex gap-1.5">
            {SLIDES.map((s, n) => (
              <button key={s.src} onClick={() => setI(n)} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15" aria-label={`Ver ${s.place}`}>
                <span className={cx('block h-full rounded-full bg-white', n === i ? 'w-full transition-[width] ease-linear' : n < i ? 'w-full' : 'w-0')} style={n === i ? { transitionDuration: `${SLIDE_MS}ms` } : undefined} key={n === i ? `p${i}` : n} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <a href="#destacado" className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 transition hover:text-white" aria-label="Bajar al juego destacado">
        Desliza
        <span className="mx-auto mt-2 block h-8 w-px bg-gradient-to-b from-ink-400 to-transparent" />
      </a>
    </section>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/[0.08] py-3.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500">{label}</dt>
      <dd className="mt-1 text-[15px] text-ink-100">{children}</dd>
    </div>
  );
}

function Featured({ game }: { game: PublicGame | null }) {
  const play = usePlayTarget(game);
  return (
    <section id="destacado" className="scroll-mt-20 py-28">
      <div className="mx-auto max-w-[1400px] px-8">
        <SectionHeading eyebrow="Juego destacado · Título oficial #01" title={<>El primer mundo<br />de DominicanGames</>} />
        {!game ? (
          <div className="h-[560px] animate-pulse rounded-[28px] bg-white/[0.03]" />
        ) : (
          <>
            <div className="grid grid-cols-[1.4fr_1fr] overflow-hidden rounded-[28px] border border-white/[0.08] bg-ink-850 shadow-glow" data-testid="featured-game">
              <div className="group relative min-h-[560px] overflow-hidden">
                <GameCover game={game} variant="hero" className="absolute inset-0" imgClassName="transition duration-[1.6s] group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink-850" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-8 left-8">
                  <p className="display text-[4.4rem] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                    Santo <span className="text-gradient-sun">Domingo</span>
                  </p>
                  <p className="mt-1 text-xs font-bold tracking-[0.5em] text-ink-100">OPEN WORLD</p>
                </div>
              </div>
              <div className="flex flex-col p-10">
                <div className="flex items-center gap-3">
                  <GameStatusBadge game={game} />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">Por {game.developer}</span>
                </div>
                <h3 className="brand-title mt-5 text-[2.1rem] uppercase text-white">{game.title}</h3>
                <p className="mt-4 text-[16px] leading-relaxed text-ink-300">{game.description}</p>
                <dl className="mt-7 grid grid-cols-2 gap-x-8">
                  <Meta label="Categoría">{game.categories.join(' · ')}</Meta>
                  <Meta label="Plataforma">{game.platforms.join(' · ') || 'Por anunciar'}</Meta>
                  <Meta label="Disponibilidad">{game.releaseLabel || 'Disponible'}</Meta>
                  <Meta label="Precio">Gratis</Meta>
                </dl>
                <div className="mt-auto flex items-center gap-4 pt-8">
                  <LinkButton to={play} size="xl" className="flex-1" data-testid="featured-play">
                    <IconPlay className="size-5" /> Jugar ahora
                  </LinkButton>
                  <LinkButton to={`/juegos/${game.id}`} variant="secondary" size="xl" className="px-6 normal-case tracking-normal">
                    Ver el juego
                  </LinkButton>
                </div>
              </div>
            </div>
            <Gallery images={game.screenshots.slice(0, 5)} className="mt-5" />
          </>
        )}
      </div>
    </section>
  );
}


/** “X ya está disponible gratis” from the live catalog (never hard-coded). */
function liveText(games: PublicGame[] | null): string {
  const live = (games ?? []).filter(playable).map((g) => g.title);
  if (!live.length) return 'Muy pronto, nuestros primeros mundos.';
  const names = live.length === 1 ? live[0] : `${live.slice(0, -1).join(', ')} y ${live[live.length - 1]}`;
  return `${names} ${live.length === 1 ? 'ya está disponible' : 'ya están disponibles'} gratis.`;
}

function Catalog({ games }: { games: PublicGame[] | null }) {
  const { user } = useAuth();
  return (
    <section id="juegos" className="scroll-mt-20 border-y border-white/[0.06] bg-ink-900/50 py-28">
      <div className="mx-auto max-w-[1400px] px-8">
        <SectionHeading
          eyebrow="Catálogo"
          title={<>Una plataforma.<br />Múltiples mundos.</>}
          action={
            <LinkButton to="/juegos" variant="secondary" className="mb-2">
              Ver todo el catálogo <IconArrowRight className="size-4" />
            </LinkButton>
          }
        >
          {liveText(games)} Estos son los próximos mundos que estamos imaginando.
        </SectionHeading>
        {!games ? (
          <div className="grid grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-[440px] animate-pulse rounded-[22px] bg-white/[0.03]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-5" data-testid="catalog-grid">
            {games.map((g) => (
              <GameCard key={g.id} game={g} signedIn={!!user} />
            ))}
          </div>
        )}
        <p className="mt-6 text-sm text-ink-500">Los títulos marcados como “Próximamente” son conceptos en desarrollo con arte conceptual: todavía no se pueden jugar.</p>
      </div>
    </section>
  );
}

function Why() {
  const items: [ReactNode, string, string][] = [
    [<IconUser key="i" className="size-6" />, 'Una sola cuenta', 'Regístrate una vez y entra a todos los juegos con el mismo usuario, avatar, logros y progreso.'],
    [<IconGrid key="i" className="size-6" />, 'Múltiples juegos', 'Un catálogo que crece: mundo abierto hoy; motores, carreras y supervivencia en camino.'],
    [<IconHeart key="i" className="size-6" />, 'Registro gratis', 'Crear tu cuenta y jugar Santo Domingo Open World no cuesta nada. Sin suscripciones ni pagos obligatorios.'],
    [<IconSpark key="i" className="size-6" />, 'Nuevas experiencias', 'Juegos originales que corren en el navegador de tu computadora: sin descargas ni instalaciones.'],
    [<IconGlobe key="i" className="size-6" />, 'Creatividad dominicana', 'Hechos en República Dominicana, con nuestras calles, nuestro ritmo y nuestro sabor.'],
    [<IconPeople key="i" className="size-6" />, 'Comunidad en crecimiento', 'Rankings, logros y anuncios para jugar con —y contra— la gente de aquí.'],
  ];
  return (
    <section className="dg-grid-bg relative py-28">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[0.9fr_1.6fr] gap-16 px-8">
        <div className="sticky top-28 self-start">
          <p className="brand-eyebrow mb-4">¿Por qué DominicanGames?</p>
          <h2 className="brand-title text-[3.1rem] text-white">
            Hecho aquí.
            <br />
            <span className="text-gradient-flag">Para jugar aquí.</span>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-300">Una plataforma dominicana para descubrir, jugar y crecer junto a una comunidad que habla tu idioma.</p>
          <LinkButton to="/registro" size="lg" className="mt-9">
            Crear cuenta gratis
          </LinkButton>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {items.map(([icon, title, text], n) => (
            <div key={title} className="card group relative overflow-hidden p-7 transition hover:border-white/15">
              <span className="absolute right-6 top-5 font-brand text-4xl font-extrabold text-white/[0.04] transition group-hover:text-white/[0.08]">{String(n + 1).padStart(2, '0')}</span>
              <span className={cx('flex size-12 items-center justify-center rounded-2xl', n % 2 ? 'bg-dg-red-500/12 text-dg-red-400' : 'bg-dg-blue-500/12 text-dg-blue-300')}>{icon}</span>
              <h3 className="brand-title mt-5 text-lg text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommunitySection() {
  const [data, setData] = useState<Community | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Api.community().then(setData).catch(() => setFailed(true));
  }, []);
  const points = data?.leaderboards.find((b) => b.id === 'dg_puntos');
  const trial = data?.leaderboards.find((b) => b.id === 'sdow_reto_malecon');
  return (
    <section className="border-t border-white/[0.06] bg-ink-900/40 py-28" id="comunidad">
      <div className="mx-auto max-w-[1400px] px-8">
        <SectionHeading
          eyebrow="Comunidad"
          title={<>Juega. Compite.<br />Deja tu marca.</>}
          action={
            <LinkButton to="/comunidad" variant="secondary" className="mb-2">
              Ir a la comunidad <IconArrowRight className="size-4" />
            </LinkButton>
          }
        >
          Rankings y logros con partidas reales de la comunidad — sin estadísticas inventadas.
        </SectionHeading>
        {failed && <p className="text-sm text-ink-400">La comunidad no está disponible en este momento.</p>}
        {!data && !failed ? (
          <div className="grid grid-cols-3 gap-5">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-80 animate-pulse rounded-2xl bg-white/[0.03]" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-3 gap-5">
            {points && <LeaderboardCard board={points} />}
            {trial && <LeaderboardCard board={trial} />}
            <div className="card flex flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-dg-red-500/10 text-dg-red-400">
                  <IconCalendar className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">Anuncios</h3>
                  <p className="text-xs text-ink-400">Novedades del equipo DominicanGames</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {data.announcements.slice(0, 2).map((a) => (
                  <AnnouncementItem key={a.id} a={a} />
                ))}
                {data.announcements.length === 0 && <p className="text-sm text-ink-400">Sin anuncios por ahora.</p>}
              </div>
            </div>
            <div className="card col-span-2 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-300">
                    <IconTrophy className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">Logros para desbloquear</h3>
                    <p className="text-xs text-ink-400">Cada logro suma puntos DominicanGames a tu perfil</p>
                  </div>
                </div>
                <span className="text-xs text-ink-500">{data.achievements.length} logros</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.achievements.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2 pr-3 text-xs text-ink-200" title={a.description}>
                    <AchievementIcon icon={a.icon} className="size-3.5 text-gold-300" /> {a.title}
                    <span className="text-ink-500">{a.points}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 p-6">
              <span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-950">Próximamente</span>
              <h3 className="brand-title mt-4 text-xl text-white">Competencias</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">Torneos, retos semanales y premios para la comunidad. Te avisaremos aquí y en tu panel cuando abran.</p>
              <IconGamepad className="absolute -bottom-6 -right-6 size-36 text-white/[0.04]" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FinalCta({ featured }: { featured: PublicGame | null }) {
  const { user } = useAuth();
  const play = usePlayTarget(featured);
  return (
    <section className="relative isolate overflow-hidden py-36">
      <img src="/img/games/santo-domingo-open-world/hero-malecon-noche.jpg" alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(5,7,13,0.55),rgba(5,7,13,0.92)_70%)]" />
      <div className="mx-auto max-w-4xl px-8 text-center">
        <DgMark className="mx-auto size-14" />
        <h2 className="brand-title mt-8 text-[4rem] text-white">
          Una cuenta.
          <br />
          <span className="text-gradient-dg">Todos los mundos.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-300">Crea tu cuenta gratis y entra a Santo Domingo Open World en menos de un minuto.</p>
        <div className="mt-10 flex justify-center gap-4">
          {user ? (
            <LinkButton to={play} size="xl">
              <IconPlay className="size-5" /> Jugar ahora
            </LinkButton>
          ) : (
            <>
              <LinkButton to="/registro" size="xl" data-testid="final-register">
                Crear cuenta gratis
              </LinkButton>
              <LinkButton to="/entrar" variant="outline" size="xl">
                Entrar
              </LinkButton>
            </>
          )}
        </div>
        <p className="mt-8 text-xs uppercase tracking-[0.3em] text-ink-500">{BRAND.tagline}</p>
      </div>
    </section>
  );
}

export function HomePage() {
  useTitle('');
  const { games } = useCatalog();
  const featured = games ? featuredGame(games) : null;
  return (
    <>
      <Hero featured={featured} />
      <Featured game={featured} />
      <Catalog games={games} />
      <Why />
      <CommunitySection />
      <FinalCta featured={featured} />
      <Link to="/juegos" className="sr-only">
        Catálogo de juegos
      </Link>
    </>
  );
}
