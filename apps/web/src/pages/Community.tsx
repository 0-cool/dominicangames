import { useEffect, useState } from 'react';
import { Api, errorMessage, type Community } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { useTitle } from '../lib/useTitle.ts';
import { Container } from '../components/Layout.tsx';
import { DgLoader } from '../components/brand/Logo.tsx';
import { AchievementTile, AnnouncementItem, LeaderboardCard } from '../components/platform.tsx';
import { Alert, IconGamepad, LinkButton, PageHeader } from '../components/ui.tsx';

export function CommunityPage() {
  useTitle('Comunidad', { description: 'Rankings, logros y anuncios de la comunidad de jugadores de DominicanGames.' });
  const { user } = useAuth();
  const [data, setData] = useState<Community | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Api.community().then(setData).catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <Container className="py-16" data-testid="community">
      <PageHeader eyebrow="Comunidad" title="Juega. Compite. Deja tu marca." actions={!user && <LinkButton to="/registro">Unirme gratis</LinkButton>}>
        Rankings construidos con partidas reales, logros que suman puntos DominicanGames y las novedades del equipo. Puedes ocultar tu nombre de los rankings desde tu perfil.
      </PageHeader>
      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <DgLoader />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-5">
            {data.leaderboards.map((b) => (
              <LeaderboardCard key={b.id} board={b} limit={10} />
            ))}
          </div>

          <div className="mt-12 grid grid-cols-[1.6fr_1fr] gap-8">
            <section>
              <p className="brand-eyebrow mb-3">Logros</p>
              <h2 className="brand-title mb-6 text-[1.9rem] text-white">Lo que puedes desbloquear</h2>
              <div className="grid grid-cols-2 gap-3">
                {data.achievements.map((a) => (
                  <AchievementTile key={a.id} a={a} />
                ))}
              </div>
            </section>
            <section>
              <p className="brand-eyebrow mb-3">Anuncios</p>
              <h2 className="brand-title mb-6 text-[1.9rem] text-white">Novedades</h2>
              <div className="space-y-3">
                {data.announcements.length === 0 ? <p className="text-sm text-ink-400">Sin anuncios por ahora.</p> : data.announcements.map((a) => <AnnouncementItem key={a.id} a={a} />)}
              </div>
              <div className="relative mt-6 overflow-hidden rounded-2xl border border-dashed border-white/15 p-6">
                <span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-950">Próximamente</span>
                <h3 className="brand-title mt-4 text-xl text-white">Competencias y torneos</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">Retos semanales, torneos y eventos de la comunidad. Los anunciaremos aquí.</p>
                <IconGamepad className="absolute -bottom-6 -right-6 size-36 text-white/[0.04]" />
              </div>
            </section>
          </div>
        </>
      )}
    </Container>
  );
}
