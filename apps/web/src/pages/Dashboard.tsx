import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PublicGame } from '@sd/shared';
import { Api, errorMessage, type Dashboard } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { PAYMENT_STATUS, fmtDate, fmtDateTime, fmtDuration, formatDop } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { playable } from '../platform/catalog.ts';
import { Container } from '../components/Layout.tsx';
import { Avatar } from '../components/brand/Avatar.tsx';
import { DgLoader } from '../components/brand/Logo.tsx';
import { GameCover, GameStatusBadge } from '../components/GameCard.tsx';
import { AchievementTile, AnnouncementItem } from '../components/platform.tsx';
import { Alert, Badge, Card, IconArrowRight, IconCheck, IconCrown, IconKeyboard, IconLifebuoy, IconPlay, IconSettings, IconTrophy, IconUser, LinkButton, cx } from '../components/ui.tsx';

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.round(s / 86400)} días`;
  return fmtDate(iso);
}

function ContinueCard({ d, game }: { d: Dashboard; game: PublicGame }) {
  const recent = d.continue?.reason === 'recent';
  const last = d.recentlyPlayed.find((r) => r.gameId === game.id);
  const progress = d.progress.find((p) => p.gameId === game.id);
  return (
    <div className="group relative isolate flex min-h-[340px] overflow-hidden rounded-[26px] border border-white/[0.08]" data-testid="continue-card" data-reason={d.continue?.reason}>
      <GameCover game={game} variant="hero" className="absolute inset-0 -z-20" imgClassName="transition duration-[1.6s] group-hover:scale-[1.04]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,7,13,0.95)_0%,rgba(5,7,13,0.7)_45%,rgba(5,7,13,0.15)_100%)]" />
      <div className="flex w-full flex-col justify-end p-9">
        <p className="brand-eyebrow">{recent ? 'Continuar jugando' : 'Juego destacado'}</p>
        <h2 className="brand-title mt-3 text-[2.4rem] text-white">{game.title}</h2>
        <p className="mt-2 max-w-md text-sm text-ink-300">
          {recent && last ? `Última partida ${timeAgo(last.lastPlayedAt)} · ${last.sessions} ${last.sessions === 1 ? 'sesión' : 'sesiones'}` : game.tagline}
          {progress ? ` · ${progress.summary}` : ''}
        </p>
        {progress?.completion != null && (
          <div className="mt-4 flex max-w-sm items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-dg" style={{ width: `${Math.round(progress.completion * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold text-ink-300">{Math.round(progress.completion * 100)}%</span>
          </div>
        )}
        <div className="mt-7 flex items-center gap-4">
          <LinkButton to={game.launchPath ?? `/juegos/${game.id}`} size="xl" data-testid="continue-playing">
            <IconPlay className="size-5" /> {recent ? 'Continuar jugando' : 'Jugar ahora'}
          </LinkButton>
          <Link to={`/juegos/${game.id}`} className="text-sm font-medium text-ink-300 hover:text-white">
            Ver el juego →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  useTitle('Mi panel', { noindex: true });
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Api.dashboard()
      .then((r) => {
        setD(r);
        setUser(r.user);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [setUser]);
  if (!user) return null;
  if (error) return <Container className="py-16"><Alert tone="error">{error}</Alert></Container>;
  if (!d) return <DgLoader label="Cargando tu panel" />;
  const byId = new Map(d.games.map((g) => [g.id, g]));
  const continueGame = d.continue ? byId.get(d.continue.gameId) : undefined;
  const available = d.games.filter(playable);
  const upcoming = d.games.filter((g) => !playable(g));
  const unlocked = d.achievements.list.filter((a) => a.unlockedAt);
  const locked = d.achievements.list.filter((a) => !a.unlockedAt);
  const welcome = params.get('bienvenida') === '1';

  return (
    <Container className="py-12" data-testid="dashboard">
      {/* identity */}
      <div className="mb-8 flex items-center justify-between gap-8">
        <div className="flex items-center gap-5">
          <Avatar avatar={user.avatar} username={user.username} className="size-[72px] text-2xl" ring />
          <div>
            <p className="brand-eyebrow">{welcome ? 'Cuenta creada' : 'Mi panel'}</p>
            <h1 className="brand-title mt-2 text-[2.4rem] text-white" data-testid="dashboard-welcome">
              {welcome ? `¡Bienvenido, ${user.username}!` : `¡Klk, ${user.username}!`}
            </h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-ink-400">
              <span>Miembro desde {fmtDate(user.createdAt)}</span>
              {user.founder && (
                <Badge tone="warn">
                  <IconCrown className="size-3" /> Fundador
                </Badge>
              )}
              <span className="flex items-center gap-1.5">
                <IconTrophy className="size-4 text-gold-300" /> {d.achievements.points} pts · {d.achievements.unlocked}/{d.achievements.total} logros
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <LinkButton to="/perfil" variant="secondary" size="sm" className="h-10 px-4">
            <IconUser className="size-4" /> Perfil y cuenta
          </LinkButton>
          <LinkButton to="/ajustes" variant="secondary" size="sm" className="h-10 px-4">
            <IconSettings className="size-4" /> Ajustes de juego
          </LinkButton>
        </div>
      </div>

      {welcome && (
        <Alert tone="success" className="mb-6" title="Tu cuenta DominicanGames está lista">
          Es gratis y sirve para todos nuestros juegos. Ya puedes jugar Santo Domingo Open World.
        </Alert>
      )}
      {!user.emailVerified && (
        <Alert tone="info" className="mb-6" title="Confirma tu correo cuando puedas">
          Puedes jugar desde ya. Confirmar tu correo protege tu cuenta y te permite recuperarla.{' '}
          <Link to="/verifica-tu-correo" className="font-semibold underline">
            Reenviar enlace
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-[1.65fr_1fr] gap-6">
        {continueGame ? <ContinueCard d={d} game={continueGame} /> : <Card className="p-8 text-ink-300">No hay juegos disponibles en este momento.</Card>}
        <Card className="flex flex-col p-6">
          <h2 className="flex items-center justify-between font-semibold text-white">
            Jugados recientemente
            <span className="text-xs font-normal text-ink-500">{d.recentlyPlayed.length}</span>
          </h2>
          {d.recentlyPlayed.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center">
              <p className="text-sm text-ink-200">Aún no has jugado.</p>
              <p className="mt-1 text-xs text-ink-400">Tu historial aparecerá aquí después de tu primera partida.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2" data-testid="recently-played">
              {d.recentlyPlayed.map((r) => {
                const g = byId.get(r.gameId);
                if (!g) return null;
                return (
                  <li key={r.gameId}>
                    <Link to={g.launchPath && g.playable ? g.launchPath : `/juegos/${g.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
                      <GameCover game={g} variant="hero" className="h-12 w-20 shrink-0 rounded-lg" tag={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{g.title}</span>
                        <span className="block text-xs text-ink-400">
                          {timeAgo(r.lastPlayedAt)} · {fmtDuration(r.seconds)} jugados
                        </span>
                      </span>
                      <IconPlay className="size-4 text-ink-500" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-auto border-t border-white/[0.06] pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500">Accesos rápidos</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  ['/ajustes', 'Gráficos y controles', <IconKeyboard key="i" className="size-4" />],
                  ['/perfil', 'Avatar y seguridad', <IconUser key="i" className="size-4" />],
                  ['/soporte', 'Soporte', <IconLifebuoy key="i" className="size-4" />],
                ] as [string, string, React.ReactNode][]
              ).map(([to, label, icon]) => (
                <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.06] px-2 py-3 text-center text-ink-300 hover:border-white/15 hover:text-white">
                  {icon}
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* progress */}
      <div className="mt-6 grid grid-cols-[1.65fr_1fr] gap-6">
        <Card className="p-7">
          <h2 className="font-semibold text-white">Tu progreso</h2>
          {d.progress.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">Todavía no hay progreso guardado. Tu partida se guarda en tu cuenta automáticamente mientras juegas.</p>
          ) : (
            d.progress.map((p) => {
              const g = byId.get(p.gameId);
              return (
                <div key={p.gameId} className="mt-5" data-testid={`progress-${p.gameId}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink-100">{g?.title ?? p.gameId}</p>
                    <span className="text-xs text-ink-500">{p.updatedAt ? `Guardado ${fmtDateTime(p.updatedAt)}` : ''}</span>
                  </div>
                  {p.stats.length > 0 && (
                    <div className="mt-3 grid grid-cols-6 gap-2">
                      {p.stats.map((s) => (
                        <div key={s.label} className="rounded-xl bg-black/25 p-3">
                          <p className="text-[11px] text-ink-400">{s.label}</p>
                          <p className="mt-1 font-semibold text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <ul className="mt-4 divide-y divide-white/5">
                    {p.milestones.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="text-ink-200">{m.title}</span>
                        {m.status === 'completed' ? (
                          <Badge tone="ok">
                            <IconCheck className="size-3" /> Completada{m.detail ? ` · ${m.detail}` : ''}
                          </Badge>
                        ) : m.status === 'started' ? (
                          <Badge tone="sun">En curso</Badge>
                        ) : m.status === 'failed' ? (
                          <Badge tone="bad">Fallida</Badge>
                        ) : (
                          <Badge>Pendiente</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold text-white">Anuncios</h2>
          <div className="mt-4 space-y-3">
            {d.announcements.length === 0 ? <p className="text-sm text-ink-400">Sin anuncios por ahora.</p> : d.announcements.slice(0, 3).map((a) => <AnnouncementItem key={a.id} a={a} />)}
          </div>
        </Card>
      </div>

      {/* achievements */}
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="brand-eyebrow mb-2">Logros</p>
            <h2 className="brand-title text-[1.9rem] text-white">
              {d.achievements.unlocked} de {d.achievements.total} desbloqueados
            </h2>
          </div>
          <span className="flex items-center gap-2 text-sm text-ink-300">
            <IconTrophy className="size-5 text-gold-300" /> {d.achievements.points} puntos DominicanGames
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3" data-testid="achievements">
          {[...unlocked, ...locked].map((a) => (
            <AchievementTile key={a.id} a={a} />
          ))}
        </div>
      </section>

      {/* games */}
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="brand-eyebrow mb-2">Juegos</p>
            <h2 className="brand-title text-[1.9rem] text-white">Disponibles y próximos</h2>
          </div>
          <Link to="/juegos" className="flex items-center gap-1.5 text-sm text-ink-300 hover:text-white">
            Catálogo completo <IconArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...available, ...upcoming].map((g) => (
            <Link key={g.id} to={`/juegos/${g.id}`} className={cx('group relative overflow-hidden rounded-2xl border border-white/[0.07]', !playable(g) && 'opacity-90')}>
              <GameCover game={g} variant="hero" className="aspect-[16/10]" imgClassName="transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <GameStatusBadge game={g} />
                <p className="mt-2 font-semibold text-white">{g.title}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {d.payments.length > 0 && (
        <section className="mt-12">
          <Card className="p-6">
            <h2 className="font-semibold text-white">Historial de compras</h2>
            <p className="mt-1 text-sm text-ink-400">Pagos del acceso original a Santo Domingo Open World, antes de que DominicanGames fuera gratis. No tienes nada pendiente por pagar.</p>
            <ul className="mt-4 divide-y divide-white/5">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-ink-200">
                    {formatDop(p.amount)} · {fmtDateTime(p.paidAt ?? p.createdAt)} · Ref. {p.id.slice(0, 8).toUpperCase()}
                    {p.provider === 'sandbox' && ' · prueba'}
                  </span>
                  <Badge tone={PAYMENT_STATUS[p.status]?.tone ?? 'muted'}>{PAYMENT_STATUS[p.status]?.label ?? p.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </Container>
  );
}
