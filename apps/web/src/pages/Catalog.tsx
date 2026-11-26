import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth.ts';
import { useTitle } from '../lib/useTitle.ts';
import { playable, useCatalog } from '../platform/catalog.ts';
import { Container } from '../components/Layout.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { Alert, PageHeader, cx } from '../components/ui.tsx';

type Filter = 'all' | 'available' | 'soon';

export function CatalogPage() {
  useTitle('Juegos', { description: 'Catálogo de DominicanGames: juegos disponibles gratis en tu navegador y próximos lanzamientos creados en República Dominicana.' });
  const { user } = useAuth();
  const { games, error } = useCatalog();
  const [filter, setFilter] = useState<Filter>('all');
  const categories = useMemo(() => [...new Set((games ?? []).flatMap((g) => g.categories))], [games]);
  const [category, setCategory] = useState<string | null>(null);
  const list = (games ?? []).filter((g) => (filter === 'all' ? true : filter === 'available' ? playable(g) : !playable(g))).filter((g) => !category || g.categories.includes(category));
  const available = (games ?? []).filter(playable);
  const soon = (games ?? []).filter((g) => !playable(g));
  return (
    <Container className="py-16">
      <PageHeader eyebrow="Catálogo" title="Todos los mundos de DominicanGames">
        Juegos originales creados en República Dominicana. Los disponibles se juegan gratis desde el navegador de tu computadora con tu cuenta DominicanGames.
      </PageHeader>
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}
      <div className="mb-8 flex items-center justify-between gap-6 border-b border-white/[0.07] pb-5">
        <div role="tablist" className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {(
            [
              ['all', `Todos${games ? ` · ${games.length}` : ''}`],
              ['available', `Disponibles${games ? ` · ${available.length}` : ''}`],
              ['soon', `Próximamente${games ? ` · ${soon.length}` : ''}`],
            ] as [Filter, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cx('rounded-lg px-4 py-2 text-sm font-medium transition', filter === k ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-ink-200')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(category === c ? null : c)} className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition', category === c ? 'border-dg-red-500/60 bg-dg-red-500/10 text-white' : 'border-white/10 text-ink-300 hover:border-white/25')}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {!games ? (
        <div className="grid grid-cols-3 gap-6">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-[520px] animate-pulse rounded-[22px] bg-white/[0.03]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-400">No hay juegos con esos filtros.</p>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {list.map((g) => (
            <GameCard key={g.id} game={g} signedIn={!!user} size="lg" />
          ))}
        </div>
      )}
      <div id="proximamente" className="mt-14 scroll-mt-24 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm leading-relaxed text-ink-400">
        <strong className="text-ink-200">Sobre los títulos “Próximamente”.</strong> Son conceptos que DominicanGames tiene en desarrollo; se muestran con arte conceptual original y no se pueden jugar todavía. Anunciaremos cada lanzamiento en la sección de anuncios y en tu panel.
      </div>
    </Container>
  );
}
