import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '@sd/shared';
import { useAuth } from '../lib/auth.ts';
import { useCatalog } from '../platform/catalog.ts';
import { Avatar } from './brand/Avatar.tsx';
import { GameArt } from './brand/GameArt.tsx';
import { Badge, IconCrown, IconGrid, IconLogout, IconPlay, IconSettings, IconShield, IconUser, LinkButton, Logo, cx } from './ui.tsx';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  const items: [string, string, React.ReactNode][] = [
    ['/panel', 'Mi panel', <IconGrid key="i" className="size-4" />],
    ['/perfil', 'Perfil y cuenta', <IconUser key="i" className="size-4" />],
    ['/ajustes', 'Ajustes de juego', <IconSettings key="i" className="size-4" />],
    ...(user.role === 'admin' ? ([['/admin', 'Administración', <IconShield key="i" className="size-4" />]] as [string, string, React.ReactNode][]) : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-sm text-ink-200 transition hover:bg-white/[0.07]" aria-haspopup="menu" aria-expanded={open} data-testid="user-menu">
        <Avatar avatar={user.avatar} username={user.username} className="size-8" />
        <span className="max-w-36 truncate font-medium">{user.username}</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-50 mt-2 w-64 overflow-hidden p-1.5 animate-fade-up">
          <div className="flex items-center gap-3 border-b border-white/5 px-3 py-3">
            <Avatar avatar={user.avatar} username={user.username} className="size-10" />
            <div className="min-w-0 text-xs text-ink-400">
              <p className="truncate text-sm font-semibold text-ink-100">{user.username}</p>
              <p className="truncate">{user.email}</p>
              {user.founder && (
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gold-300">
                  <IconCrown className="size-3" /> Fundador
                </span>
              )}
            </div>
          </div>
          {items.map(([to, label, icon]) => (
            <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-white/[0.06] hover:text-white">
              {icon}
              {label}
            </Link>
          ))}
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              nav('/');
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-200 hover:bg-white/[0.06] hover:text-white"
            data-testid="logout"
          >
            <IconLogout className="size-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

/** “Juegos” dropdown: the live catalog (available + upcoming) straight from the API. */
function GamesMenu() {
  const { games } = useCatalog();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setOpen(false), [pathname]);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    timer.current = setTimeout(() => setOpen(false), 120);
  };
  const active = pathname.startsWith('/juegos') || pathname === '/jugar';
  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <Link to="/juegos" className={cx('relative flex items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium transition', active ? 'text-white' : 'text-ink-300 hover:text-white')} aria-haspopup="true" aria-expanded={open}>
        Juegos
        <svg viewBox="0 0 12 12" className={cx('size-2.5 transition', open && 'rotate-180')} aria-hidden>
          <path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {active && <span className="absolute inset-x-3.5 -bottom-[17px] h-0.5 rounded-full bg-dg-red-500" />}
      </Link>
      {open && games && (
        <div className="absolute left-1/2 top-full z-50 w-[760px] -translate-x-1/2 pt-4">
          <div className="card grid grid-cols-[1.25fr_1fr] gap-2 overflow-hidden p-2 animate-fade-up">
            {games.slice(0, 1).map((g) => (
              <Link key={g.id} to={`/juegos/${g.id}`} className="group relative row-span-3 flex min-h-64 flex-col justify-end overflow-hidden rounded-xl p-5">
                {g.coverImage ? <img src={g.coverImage} alt="" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" /> : <GameArt art={g.theme.art} accent={g.theme.accent} accent2={g.theme.accent2} className="absolute inset-0 size-full" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="relative">
                  <Badge tone={g.playable ? 'ok' : 'muted'}>{g.playable ? 'Disponible gratis' : g.releaseLabel || 'Próximamente'}</Badge>
                  <p className="brand-title mt-2 text-xl text-white">{g.title}</p>
                  <p className="mt-1 text-xs text-ink-300">{g.tagline}</p>
                </div>
              </Link>
            ))}
            {games.slice(1, 4).map((g) => (
              <Link key={g.id} to={`/juegos/${g.id}`} className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.05]">
                <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg">
                  {g.coverImage ? <img src={g.coverImage} alt="" className="size-full object-cover" /> : <GameArt art={g.theme.art} accent={g.theme.accent} accent2={g.theme.accent2} className="size-full" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{g.title}</span>
                  <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wider" style={{ color: g.theme.accent }}>
                    {g.playable ? 'Disponible' : g.releaseLabel || 'Próximamente'}
                  </span>
                </span>
              </Link>
            ))}
            <Link to="/juegos" className="col-start-2 mx-2 mb-1 mt-auto flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-xs font-semibold text-ink-200 hover:border-white/25 hover:text-white">
              Ver todo el catálogo <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ transparent = false }: { transparent?: boolean }) {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const solid = !transparent || scrolled;
  const navCls = ({ isActive }: { isActive: boolean }) => cx('relative px-3.5 py-2 text-[13.5px] font-medium transition', isActive ? 'text-white' : 'text-ink-300 hover:text-white');
  const bar = (isActive: boolean) => isActive && <span className="absolute inset-x-3.5 -bottom-[17px] h-0.5 rounded-full bg-dg-red-500" />;
  return (
    <header className={cx('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300', solid ? 'border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-xl' : 'border-b border-transparent bg-gradient-to-b from-black/60 to-transparent')}>
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-6 px-8">
        <Link to="/" aria-label={`${BRAND.name} — inicio`} className="shrink-0">
          <Logo />
        </Link>
        <nav className="ml-6 flex items-center" aria-label="Principal">
          <NavLink to="/" end className={navCls}>
            {({ isActive }) => (
              <>
                Inicio
                {bar(isActive)}
              </>
            )}
          </NavLink>
          <GamesMenu />
          <NavLink to="/comunidad" className={navCls}>
            {({ isActive }) => (
              <>
                Comunidad
                {bar(isActive)}
              </>
            )}
          </NavLink>
          <NavLink to="/soporte" className={navCls}>
            {({ isActive }) => (
              <>
                Soporte
                {bar(isActive)}
              </>
            )}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <LinkButton to="/panel" variant="ghost" size="sm" className="h-9 px-3.5" data-testid="nav-panel">
                <IconGrid className="size-4" /> Mi panel
              </LinkButton>
              <LinkButton to="/jugar" size="sm" className="h-9 px-4 uppercase tracking-wider" data-testid="nav-play">
                <IconPlay className="size-3.5" /> Jugar
              </LinkButton>
              <span className="mx-1 h-6 w-px bg-white/10" />
              <UserMenu />
            </>
          ) : (
            <>
              <LinkButton to="/entrar" variant="ghost" size="sm" className="h-9 px-4">
                Entrar
              </LinkButton>
              <LinkButton to="/registro" size="sm" className="h-9 px-4">
                Crear cuenta gratis
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.07] bg-ink-950">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1.6fr_1fr_1fr_1fr] gap-12 px-8 py-16">
        <div className="space-y-5">
          <Logo tagline />
          <p className="max-w-sm text-sm leading-relaxed text-ink-400">
            DominicanGames es una plataforma de videojuegos nacida en República Dominicana: una sola cuenta para descubrir y jugar todos nuestros mundos.
          </p>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-ink-300">
            <span className="flex gap-0.5" aria-hidden>
              <span className="size-2 rounded-[2px] bg-dg-blue-500" />
              <span className="size-2 rounded-[2px] bg-dg-red-500" />
            </span>
            {BRAND.origin}
          </p>
        </div>
        <div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">Juegos</p>
          <ul className="space-y-2.5 text-sm text-ink-300">
            <li><Link className="hover:text-white" to="/juegos/santo-domingo-open-world">Santo Domingo Open World</Link></li>
            <li><Link className="hover:text-white" to="/juegos/el-tapon">El Tapón</Link></li>
            <li><Link className="hover:text-white" to="/juegos">Catálogo completo</Link></li>
            <li><Link className="hover:text-white" to="/juegos#proximamente">Próximamente</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">Plataforma</p>
          <ul className="space-y-2.5 text-sm text-ink-300">
            <li><Link className="hover:text-white" to="/registro">Crear cuenta gratis</Link></li>
            <li><Link className="hover:text-white" to="/panel">Mi panel</Link></li>
            <li><Link className="hover:text-white" to="/comunidad">Comunidad</Link></li>
            <li><Link className="hover:text-white" to="/soporte">Soporte</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">Legal</p>
          <ul className="space-y-2.5 text-sm text-ink-300">
            <li><Link className="hover:text-white" to="/terminos">Términos y condiciones</Link></li>
            <li><Link className="hover:text-white" to="/privacidad">Política de privacidad</Link></li>
            <li><Link className="hover:text-white" to="/creditos">Créditos y licencias</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.05]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-8 py-6 text-xs text-ink-500">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
          </p>
          <p className="max-w-3xl text-right">
            Proyectos originales e independientes; no afiliados a Rockstar Games, Take-Two Interactive ni a ninguna institución pública. Santo Domingo Open World usa datos de mapa ©{' '}
            <a className="underline hover:text-ink-300" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              colaboradores de OpenStreetMap
            </a>{' '}
            (ODbL); sus negocios son ficticios.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Standard page shell (everything except full-bleed pages and the game). */
export function SiteLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0); // (newer browsers return a Promise here; effects must not return it)
  }, [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="relative flex-1 pt-[72px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_55%_60%_at_20%_-10%,rgba(61,100,255,0.16),transparent),radial-gradient(ellipse_50%_55%_at_85%_-15%,rgba(255,46,77,0.14),transparent)]" />
        <div className="relative">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Full-bleed public pages (home, game pages): transparent header over a hero image. */
export function ImmersiveLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-dvh">
      <Header transparent />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function Container({ children, className, narrow, ...rest }: { children: React.ReactNode; className?: string; narrow?: boolean } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> & { 'data-testid'?: string }) {
  return (
    <div className={cx('mx-auto px-8', narrow ? 'max-w-xl' : 'max-w-[1240px]', className)} {...rest}>
      {children}
    </div>
  );
}
