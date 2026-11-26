import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { GAME_STATUSES, GAME_STATUS_LABEL, gameInputSchema, type AnnouncementView, type GameStatus, type PublicGame } from '@sd/shared';
import { Api, api, errorMessage, type AdminArcadeRun } from '../../lib/api.ts';
import { PAYMENT_STATUS, fmtDateTime, fmtDuration, formatDop } from '../../lib/format.ts';
import { useTitle } from '../../lib/useTitle.ts';
import { invalidateCatalog } from '../../platform/catalog.ts';
import { Container } from '../../components/Layout.tsx';
import { Avatar } from '../../components/brand/Avatar.tsx';
import { GameCover } from '../../components/GameCard.tsx';
import { Alert, Badge, Button, Card, Checkbox, IconCrown, IconStar, IconX, Input, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui.tsx';

interface Metrics {
  users: number;
  verifiedUsers: number;
  newUsers7d: number;
  activeSessions24h: number;
  errors24h: number;
  openTickets: number;
  games: { gameId: string; title: string; status: GameStatus; launches: number; launches24h: number; launches7d: number; players: number; players7d: number; playSeconds: number }[];
  monetization: { enabled: boolean; legacyFounders: number; legacyRevenueMinor: number; paymentsByStatus: Record<string, number> };
  server: { uptimeSec: number; rssMB: number; heapMB: number; node: string };
}
interface AdminUser {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  emailVerified: boolean;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  founder: boolean;
}
interface AdminPayment {
  id: string;
  userId: string;
  email: string;
  provider: string;
  providerReference: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  failureReason: string | null;
}
interface LogRow {
  id: string;
  createdAt: string;
  [k: string]: unknown;
}

type Tab = 'overview' | 'games' | 'users' | 'news' | 'scores' | 'payments' | 'errors' | 'audit' | 'tickets';

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let stop = false;
    setError('');
    api<T>(path)
      .then((d) => !stop && setData(d))
      .catch((e) => !stop && setError(errorMessage(e)));
    return () => {
      stop = true;
    };
  }, [path, n]);
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold', tone ?? 'text-white')}>{value}</p>
    </Card>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-ink-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad<Metrics>('/api/admin/metrics');
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-6 gap-4">
        <Tile label="Cuentas DominicanGames" value={data.users} />
        <Tile label="Correos verificados" value={data.verifiedUsers} />
        <Tile label="Cuentas nuevas (7 días)" value={data.newUsers7d} tone="text-dg-blue-300" />
        <Tile label="Sesiones web activas (24 h)" value={data.activeSessions24h} />
        <Tile label="Errores (24 h)" value={data.errors24h} tone={data.errors24h ? 'text-[#ff9fb6]' : undefined} />
        <Tile label="Tickets abiertos" value={data.openTickets} />
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5">
          <p className="text-sm font-semibold text-white">Analítica por juego</p>
          <p className="text-xs text-ink-500">Lanzamientos = sesiones de juego iniciadas desde la plataforma</p>
        </div>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-ink-400">
            <tr>
              {['Juego', 'Estado', 'Lanzamientos', '24 h', '7 días', 'Jugadores', 'Jugadores 7 d', 'Tiempo jugado'].map((h) => (
                <th key={h} className="px-6 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.games.map((g) => (
              <tr key={g.gameId}>
                <td className="px-6 py-3 font-medium text-ink-100">{g.title}</td>
                <td className="px-6 py-3"><StatusBadge status={g.status} /></td>
                <td className="px-6 py-3 text-ink-200">{g.launches}</td>
                <td className="px-6 py-3 text-ink-200">{g.launches24h}</td>
                <td className="px-6 py-3 text-ink-200">{g.launches7d}</td>
                <td className="px-6 py-3 text-ink-200">{g.players}</td>
                <td className="px-6 py-3 text-ink-200">{g.players7d}</td>
                <td className="px-6 py-3 text-ink-200">{fmtDuration(g.playSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">DG Monetization</p>
            <Badge tone={data.monetization.enabled ? 'warn' : 'muted'}>{data.monetization.enabled ? 'Activado' : 'Desactivado'}</Badge>
          </div>
          <p className="mt-2 text-sm text-ink-400">La plataforma es gratis. Pagos, anuncios y patrocinios están desactivados; ver docs/MONETIZATION.md.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/25 p-4">
              <p className="text-xs text-ink-400">Fundadores (compra original)</p>
              <p className="mt-1 text-xl font-semibold text-gold-300">{data.monetization.legacyFounders}</p>
            </div>
            <div className="rounded-xl bg-black/25 p-4">
              <p className="text-xs text-ink-400">Ingresos históricos (aprobados)</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatDop(data.monetization.legacyRevenueMinor)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.monetization.paymentsByStatus).map(([k, v]) => (
              <Badge key={k} tone={PAYMENT_STATUS[k]?.tone ?? 'muted'}>
                {PAYMENT_STATUS[k]?.label ?? k}: {v}
              </Badge>
            ))}
            {Object.keys(data.monetization.paymentsByStatus).length === 0 && <span className="text-sm text-ink-400">Sin pagos registrados.</span>}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-semibold text-white">Servidor</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-black/25 p-4"><dt className="text-xs text-ink-400">Activo</dt><dd className="mt-1 text-white">{Math.round(data.server.uptimeSec / 60)} min</dd></div>
            <div className="rounded-xl bg-black/25 p-4"><dt className="text-xs text-ink-400">Memoria</dt><dd className="mt-1 text-white">{data.server.rssMB} MB (heap {data.server.heapMB} MB)</dd></div>
            <div className="col-span-2 rounded-xl bg-black/25 p-4"><dt className="text-xs text-ink-400">Node</dt><dd className="mt-1 text-white">{data.server.node}</dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: GameStatus }) {
  const tone = status === 'published' ? 'ok' : status === 'development' ? 'blue' : status === 'coming_soon' ? 'white' : 'muted';
  return <Badge tone={tone}>{GAME_STATUS_LABEL[status]}</Badge>;
}

// ───────────── Games (catalog) ─────────────
interface GameForm {
  id: string;
  title: string;
  tagline: string;
  description: string;
  status: GameStatus;
  featured: boolean;
  sortOrder: string;
  categories: string;
  platforms: string;
  developer: string;
  publisher: string;
  releaseLabel: string;
  launchPath: string;
  coverImage: string;
  heroImage: string;
  screenshots: string;
  accent: string;
  accent2: string;
  art: string;
  guestPlay: boolean;
}

const emptyForm: GameForm = { id: '', title: '', tagline: '', description: '', status: 'coming_soon', featured: false, sortOrder: '100', categories: '', platforms: '', developer: 'DominicanGames', publisher: 'DominicanGames', releaseLabel: 'Próximamente', launchPath: '', coverImage: '', heroImage: '', screenshots: '', accent: '#ff2e4d', accent2: '#3d64ff', art: '', guestPlay: false };

function toForm(g: PublicGame): GameForm {
  return {
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    description: g.description,
    status: g.status,
    featured: g.featured,
    sortOrder: String(g.sortOrder),
    categories: g.categories.join(', '),
    platforms: g.platforms.join(', '),
    developer: g.developer,
    publisher: g.publisher,
    releaseLabel: g.releaseLabel,
    launchPath: g.launchPath ?? '',
    coverImage: g.coverImage ?? '',
    heroImage: g.heroImage ?? '',
    screenshots: g.screenshots.map((x) => `${x.src} | ${x.alt}`).join('\n'),
    accent: g.theme.accent,
    accent2: g.theme.accent2 ?? '',
    art: g.theme.art ?? '',
    guestPlay: g.guestPlay,
  };
}

function fromForm(f: GameForm) {
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    id: f.id.trim(),
    title: f.title,
    tagline: f.tagline,
    description: f.description,
    status: f.status,
    featured: f.featured,
    sortOrder: Number(f.sortOrder) || 0,
    categories: list(f.categories),
    platforms: list(f.platforms),
    developer: f.developer,
    publisher: f.publisher,
    releaseLabel: f.releaseLabel,
    launchPath: f.launchPath.trim() || null,
    coverImage: f.coverImage.trim() || null,
    heroImage: f.heroImage.trim() || null,
    screenshots: f.screenshots
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [src, ...alt] = l.split('|');
        return { src: src.trim(), alt: alt.join('|').trim() };
      }),
    theme: { accent: f.accent, ...(f.accent2 ? { accent2: f.accent2 } : {}), ...(f.art ? { art: f.art } : {}) },
    guestPlay: f.guestPlay,
  };
}

function GameEditor({ game, onClose, onSaved }: { game: PublicGame | null; onClose(): void; onSaved(): void }) {
  const [f, setF] = useState<GameForm>(game ? toForm(game) : emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof GameForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  async function save() {
    setError('');
    const body = fromForm(f);
    const parsed = gameInputSchema.safeParse(body);
    if (!parsed.success) return setError(`${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`);
    setBusy(true);
    try {
      if (game) {
        const { id: _id, ...patch } = parsed.data;
        void _id;
        await api(`/api/admin/games/${game.id}`, { method: 'PATCH', body: patch });
      } else await api('/api/admin/games', { method: 'POST', body: parsed.data });
      invalidateCatalog();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="scroll-thin h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-ink-900 p-8" onClick={(e) => e.stopPropagation()} data-testid="game-editor">
        <div className="flex items-center justify-between">
          <h2 className="brand-title text-2xl text-white">{game ? `Editar: ${game.title}` : 'Nuevo juego'}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-ink-300 hover:bg-white/10" aria-label="Cerrar"><IconX /></button>
        </div>
        {error && <Alert tone="error" className="mt-5">{error}</Alert>}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Input label="Identificador (URL)" value={f.id} onChange={set('id')} disabled={!!game} hint="ej. moto-rd — no se puede cambiar después" />
          <Input label="Título" value={f.title} onChange={set('title')} />
          <div className="col-span-2"><Input label="Lema" value={f.tagline} onChange={set('tagline')} /></div>
          <div className="col-span-2"><Textarea label="Descripción" value={f.description} onChange={set('description')} /></div>
          <Select label="Estado" value={f.status} onChange={set('status')}>
            {GAME_STATUSES.map((st) => (
              <option key={st} value={st}>{GAME_STATUS_LABEL[st]}</option>
            ))}
          </Select>
          <Input label="Etiqueta de disponibilidad" value={f.releaseLabel} onChange={set('releaseLabel')} hint="ej. Gratis · Acceso anticipado, Próximamente" />
          <Input label="Categorías" value={f.categories} onChange={set('categories')} hint="Separadas por coma" />
          <Input label="Plataformas" value={f.platforms} onChange={set('platforms')} hint="Solo plataformas confirmadas" />
          <Input label="Desarrollador" value={f.developer} onChange={set('developer')} />
          <Input label="Editor" value={f.publisher} onChange={set('publisher')} />
          <Input label="Ruta de lanzamiento" value={f.launchPath} onChange={set('launchPath')} hint="Ruta interna del juego, ej. /jugar. Requerida para publicar." />
          <Input label="Orden" type="number" value={f.sortOrder} onChange={set('sortOrder')} />
          <Input label="Portada (vertical)" value={f.coverImage} onChange={set('coverImage')} hint="/img/games/<id>/cover.jpg" />
          <Input label="Imagen principal (horizontal)" value={f.heroImage} onChange={set('heroImage')} hint="/img/games/<id>/hero.jpg" />
          <div className="col-span-2"><Textarea label="Capturas (una por línea: ruta | descripción)" value={f.screenshots} onChange={set('screenshots')} /></div>
          <Input label="Color principal" value={f.accent} onChange={set('accent')} hint="#rrggbb" />
          <Input label="Color secundario" value={f.accent2} onChange={set('accent2')} hint="#rrggbb (opcional)" />
          <Select label="Arte conceptual (sin imágenes)" value={f.art} onChange={set('art')}>
            <option value="">Genérico DominicanGames</option>
            <option value="moto">Motor al atardecer</option>
            <option value="racing">Carreras nocturnas</option>
            <option value="island">Isla tropical</option>
          </Select>
          <div className="flex items-end pb-2">
            <Checkbox checked={f.featured} onChange={set('featured')}>Juego destacado en la portada</Checkbox>
          </div>
          <div className="col-span-2">
            <Checkbox checked={f.guestPlay} onChange={set('guestPlay')}>Se puede jugar sin cuenta (invitados). Solo para juegos que lo soportan, como El Tapón.</Checkbox>
          </div>
        </div>
        <Alert tone="info" className="mt-6">Un juego “Disponible” necesita un módulo de juego instalado en la plataforma y su ruta de lanzamiento. Los conceptos se publican como “Próximamente”: aparecen en el catálogo pero nunca se pueden jugar.</Alert>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy} data-testid="game-save">Guardar</Button>
        </div>
      </div>
    </div>
  );
}

function Games() {
  const { data, error, reload } = useLoad<{ games: PublicGame[] }>('/api/admin/games');
  const [editing, setEditing] = useState<PublicGame | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  async function quick(g: PublicGame, patch: Record<string, unknown>) {
    setMsg('');
    try {
      await api(`/api/admin/games/${g.id}`, { method: 'PATCH', body: patch });
      invalidateCatalog();
      reload();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4" data-testid="admin-games">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">El catálogo alimenta la portada, la página de juegos, el panel de cada jugador y el sitemap.</p>
        <Button onClick={() => setEditing('new')} data-testid="game-new">Nuevo juego</Button>
      </div>
      {msg && <Alert tone="error">{msg}</Alert>}
      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-ink-400">
            <tr>
              {['', 'Juego', 'Estado', 'Destacado', 'Orden', 'Lanzamiento', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.games.map((g) => (
              <tr key={g.id} className="align-middle">
                <td className="w-28 px-4 py-3"><GameCover game={g} variant="hero" className="h-12 w-20 rounded-lg" tag={false} /></td>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-100">{g.title}</p>
                  <p className="font-mono text-xs text-ink-500">{g.id}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => quick(g, { featured: !g.featured })} className={cx('rounded-lg p-1.5', g.featured ? 'text-gold-300' : 'text-ink-600 hover:text-ink-300')} aria-label="Destacar">
                    <IconStar className="size-5" />
                  </button>
                </td>
                <td className="px-4 py-3 text-ink-300">{g.sortOrder}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-400">{g.launchPath ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {g.status !== 'published' && g.launchPath && <Button size="sm" variant="secondary" onClick={() => quick(g, { status: 'published' })}>Publicar</Button>}
                    {g.status !== 'coming_soon' && <Button size="sm" variant="ghost" onClick={() => quick(g, { status: 'coming_soon' })}>Próximamente</Button>}
                    {g.status !== 'hidden' && <Button size="sm" variant="ghost" onClick={() => quick(g, { status: 'hidden' })}>Ocultar</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setEditing(g)}>Editar</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <GameEditor
          game={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ───────────── Announcements ─────────────
function News() {
  const { data, error, reload } = useLoad<{ announcements: (AnnouncementView & { published: boolean })[] }>('/api/admin/announcements');
  const [f, setF] = useState({ title: '', body: '', linkUrl: '', linkLabel: '', pinned: false });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/announcements', { method: 'POST', body: { title: f.title, body: f.body, linkUrl: f.linkUrl.trim() || null, linkLabel: f.linkLabel.trim() || null, pinned: f.pinned } });
      setF({ title: '', body: '', linkUrl: '', linkLabel: '', pinned: false });
      setMsg({ tone: 'success', text: 'Anuncio publicado.' });
      reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function act(id: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    try {
      await api(`/api/admin/announcements/${id}`, { method, body });
      reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    }
  }
  return (
    <div className="grid grid-cols-[1fr_1.3fr] gap-6">
      <Card className="h-fit p-6">
        <p className="font-semibold text-white">Nuevo anuncio</p>
        <div className="mt-4 space-y-4">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea label="Texto" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Enlace (ruta interna)" value={f.linkUrl} onChange={(e) => setF({ ...f, linkUrl: e.target.value })} placeholder="/juegos" />
            <Input label="Texto del enlace" value={f.linkLabel} onChange={(e) => setF({ ...f, linkLabel: e.target.value })} placeholder="Ver más" />
          </div>
          <Checkbox checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })}>Destacar (aparece primero)</Checkbox>
          <Button onClick={create} loading={busy} disabled={f.title.length < 3 || f.body.length < 3}>Publicar anuncio</Button>
        </div>
      </Card>
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {!data ? (
          <Spinner />
        ) : data.announcements.length === 0 ? (
          <p className="text-sm text-ink-400">Sin anuncios.</p>
        ) : (
          data.announcements.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-center gap-2">
                <Badge tone={a.published ? 'ok' : 'muted'}>{a.published ? 'Publicado' : 'Oculto'}</Badge>
                {a.pinned && <Badge tone="red">Destacado</Badge>}
                <span className="ml-auto text-xs text-ink-500">{fmtDateTime(a.publishedAt)}</span>
              </div>
              <p className="mt-2 font-semibold text-white">{a.title}</p>
              <p className="mt-1 text-sm text-ink-300">{a.body}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => act(a.id, 'PATCH', { published: !a.published })}>{a.published ? 'Ocultar' : 'Publicar'}</Button>
                <Button size="sm" variant="ghost" onClick={() => act(a.id, 'PATCH', { pinned: !a.pinned })}>{a.pinned ? 'Quitar destacado' : 'Destacar'}</Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm('¿Eliminar este anuncio?') && act(a.id, 'DELETE')}>Eliminar</Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose(): void; onChanged(): void }) {
  const { data, error, reload } = useLoad<{ user: AdminUser & { suspendedReason?: string | null; showInRankings: boolean }; legacyAccess: { accessStatus: string; activatedAt: string | null } | null; games: { gameId: string; lastPlayedAt: string; sessions: number; seconds: number }[]; payments: AdminPayment[]; audit: LogRow[] }>(`/api/admin/users/${id}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function act(path: string, body?: unknown) {
    setBusy(true);
    setMsg('');
    try {
      await api(path, { method: 'POST', body });
      reload();
      onChanged();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="scroll-thin h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-ink-900 p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Usuario</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-ink-300 hover:bg-white/10" aria-label="Cerrar">
            <IconX />
          </button>
        </div>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {msg && <Alert tone="error" className="mt-4">{msg}</Alert>}
        {!data ? (
          <Spinner />
        ) : (
          <div className="mt-5 space-y-6">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-400">Correo</dt>
              <dd className="text-ink-100">{data.user.email}</dd>
              <dt className="text-ink-400">Usuario</dt>
              <dd className="text-ink-100">{data.user.username}</dd>
              <dt className="text-ink-400">Rol</dt>
              <dd className="text-ink-100">{data.user.role}</dd>
              <dt className="text-ink-400">Estado</dt>
              <dd>{data.user.status === 'active' ? <Badge tone="ok">Activo</Badge> : <Badge tone="bad">Suspendido</Badge>}</dd>
              <dt className="text-ink-400">Fundador</dt>
              <dd className="text-ink-100">{data.legacyAccess?.accessStatus === 'active' ? 'Sí (compró el acceso original)' : 'No'}</dd>
              <dt className="text-ink-400">En rankings</dt>
              <dd className="text-ink-100">{data.user.showInRankings ? 'Visible' : 'Oculto'}</dd>
              <dt className="text-ink-400">Registrado</dt>
              <dd className="text-ink-100">{fmtDateTime(data.user.createdAt)}</dd>
              <dt className="text-ink-400">Último acceso</dt>
              <dd className="text-ink-100">{fmtDateTime(data.user.lastLoginAt)}</dd>
            </dl>
            <div className="flex gap-3">
              {!data.user.emailVerified && (
                <Button variant="secondary" size="sm" loading={busy} onClick={() => act(`/api/admin/users/${id}/verify-email`)}>
                  Marcar correo como verificado
                </Button>
              )}
              {data.user.status === 'active' ? (
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy}
                  onClick={() => {
                    const reason = window.prompt('Motivo de la suspensión (queda en la auditoría):');
                    if (reason) void act(`/api/admin/users/${id}/suspend`, { reason });
                  }}
                >
                  Suspender
                </Button>
              ) : (
                <Button variant="secondary" size="sm" loading={busy} onClick={() => act(`/api/admin/users/${id}/restore`)}>
                  Reactivar
                </Button>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Juegos</p>
              {data.games.length === 0 ? (
                <p className="text-sm text-ink-400">Todavía no ha jugado.</p>
              ) : (
                <ul className="divide-y divide-white/5 text-sm">
                  {data.games.map((g) => (
                    <li key={g.gameId} className="flex justify-between py-2 text-ink-200">
                      <span className="font-mono text-xs">{g.gameId}</span>
                      <span className="text-ink-400">{g.sessions} sesiones · {fmtDuration(g.seconds)} · {fmtDateTime(g.lastPlayedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Compras anteriores</p>
              {data.payments.length === 0 ? (
                <p className="text-sm text-ink-400">Sin pagos.</p>
              ) : (
                <ul className="divide-y divide-white/5 text-sm">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2">
                      <span className="text-ink-200">
                        {formatDop(p.amount)} · {p.provider} · {fmtDateTime(p.createdAt)}
                      </span>
                      <Badge tone={PAYMENT_STATUS[p.status]?.tone ?? 'muted'}>{PAYMENT_STATUS[p.status]?.label ?? p.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Auditoría</p>
              <ul className="space-y-1.5 text-xs">
                {data.audit.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 text-ink-300">
                    <span className="font-mono">{String(a.action)}</span>
                    <span className="text-ink-500">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useLoad<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(`/api/admin/users?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por correo o usuario" className="w-full max-w-sm rounded-xl border border-white/10 bg-ink-900 px-4 py-2 text-sm" />
        <Button type="submit" size="sm" className="h-10">Buscar</Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table head={['Usuario', 'Correo', 'Verificado', 'Insignias', 'Estado', 'Registro']}>
            {data.users.map((u) => (
              <tr key={u.id} onClick={() => setOpen(u.id)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-medium text-ink-100">
                  <span className="flex items-center gap-2.5">
                    <Avatar avatar={u.avatar} username={u.username} className="size-7" />
                    {u.username} {u.role === 'admin' && <Badge tone="red">admin</Badge>}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-300">{u.email}</td>
                <td className="px-4 py-3">{u.emailVerified ? <Badge tone="ok">Sí</Badge> : <Badge>No</Badge>}</td>
                <td className="px-4 py-3">{u.founder ? <Badge tone="warn"><IconCrown className="size-3" /> Fundador</Badge> : <span className="text-ink-600">—</span>}</td>
                <td className="px-4 py-3">{u.status === 'active' ? <Badge tone="ok">Activo</Badge> : <Badge tone="bad">Suspendido</Badge>}</td>
                <td className="px-4 py-3 text-ink-400">{fmtDateTime(u.createdAt)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} size={data.pageSize} onPage={setPage} />
        </>
      )}
      {open && <UserDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage(p: number): void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between text-sm text-ink-400">
      <span>{total} en total</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <span className="px-2 py-1.5">{page} / {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}

function Payments() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, error, reload } = useLoad<{ payments: AdminPayment[]; total: number; page: number; pageSize: number }>(`/api/admin/payments?page=${page}${status ? `&status=${status}` : ''}`);
  async function refund(p: AdminPayment) {
    if (!window.confirm(`¿Reembolsar ${formatDop(p.amount)} a ${p.email}? Se retira su insignia Fundador (el juego sigue siendo gratis para esa cuenta).`)) return;
    try {
      await api(`/api/admin/payments/${p.id}/refund`, { method: 'POST' });
      setMsg({ tone: 'success', text: 'Reembolso registrado.' });
      reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    }
  }
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Compras anteriores (legado)">El acceso de RD$100 ya no se vende: aquí queda el historial de esas compras y los reembolsos. DG Monetization está desactivado.</Alert>
      <div className="flex flex-wrap gap-2">
        {['', 'succeeded', 'pending', 'created', 'failed', 'canceled', 'refunded'].map((s) => (
          <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }} className={cx('rounded-full px-3 py-1 text-sm', status === s ? 'bg-white/15 text-white' : 'text-ink-400 hover:text-white')}>
            {s ? PAYMENT_STATUS[s].label : 'Todos'}
          </button>
        ))}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table head={['Fecha', 'Usuario', 'Monto', 'Proveedor', 'Referencia', 'Estado', '']}>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-ink-400">{fmtDateTime(p.createdAt)}</td>
                <td className="px-4 py-3 text-ink-200">{p.email}</td>
                <td className="px-4 py-3 text-ink-100">{formatDop(p.amount)}</td>
                <td className="px-4 py-3 text-ink-300">{p.provider}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-400">{p.providerReference ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={PAYMENT_STATUS[p.status]?.tone ?? 'muted'}>{PAYMENT_STATUS[p.status]?.label ?? p.status}</Badge>
                  {p.failureReason && <p className="mt-1 text-xs text-ink-500">{p.failureReason}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === 'succeeded' && (
                    <Button size="sm" variant="secondary" onClick={() => refund(p)}>
                      Reembolsar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} size={data.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Logs({ kind }: { kind: 'errors' | 'audit' | 'tickets' }) {
  const { data, error } = useLoad<Record<string, LogRow[]>>(`/api/admin/${kind}`);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const rows = data[kind] ?? [];
  if (!rows.length) return <p className="text-sm text-ink-400">Nada por aquí.</p>;
  if (kind === 'errors')
    return (
      <Table head={['Fecha', 'Origen', 'Mensaje', 'Contexto']}>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-3 text-ink-400">{fmtDateTime(r.createdAt)}</td>
            <td className="px-4 py-3"><Badge tone={r.source === 'client' ? 'warn' : 'bad'}>{String(r.source)}</Badge></td>
            <td className="px-4 py-3 text-ink-200">{String(r.message).slice(0, 300)}</td>
            <td className="px-4 py-3 font-mono text-xs text-ink-500">{JSON.stringify(r.context ?? {}).slice(0, 200)}</td>
          </tr>
        ))}
      </Table>
    );
  if (kind === 'audit')
    return (
      <Table head={['Fecha', 'Acción', 'Actor', 'Objetivo', 'IP']}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap px-4 py-3 text-ink-400">{fmtDateTime(r.createdAt)}</td>
            <td className="px-4 py-3 font-mono text-xs text-ink-100">{String(r.action)}</td>
            <td className="px-4 py-3 font-mono text-xs text-ink-400">{String(r.actorUserId ?? '—').slice(0, 8)}</td>
            <td className="px-4 py-3 text-xs text-ink-400">{r.targetType ? `${String(r.targetType)}:${String(r.targetId).slice(0, 8)}` : '—'}</td>
            <td className="px-4 py-3 text-xs text-ink-500">{String(r.ip ?? '—')}</td>
          </tr>
        ))}
      </Table>
    );
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.status === 'open' ? 'warn' : 'ok'}>{String(r.status)}</Badge>
            <Badge>{String(r.category)}</Badge>
            <span className="text-sm font-semibold text-white">{String(r.subject)}</span>
            <span className="ml-auto text-xs text-ink-500">{fmtDateTime(r.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-300">{String(r.message)}</p>
          <p className="mt-2 text-xs text-ink-500">De: {String(r.email)}</p>
        </Card>
      ))}
    </div>
  );
}

const RUN_STATUS: Record<AdminArcadeRun['status'], [string, 'ok' | 'warn' | 'bad' | 'muted' | 'blue']> = {
  verified: ['Verificada', 'ok'],
  pending: ['Verificando', 'blue'],
  saved: ['Guardada', 'muted'],
  rejected: ['Rechazada', 'bad'],
};

/** El Tapón high scores: latest submitted runs, with the option to hide an entry from the public tables. */
function ArcadeRuns() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad<{ runs: AdminArcadeRun[] }>(`/api/admin/arcade/runs${status ? `?status=${status}` : ''}`);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  async function toggle(r: AdminArcadeRun) {
    setBusy(r.id);
    setErr('');
    try {
      await Api.adminHideArcadeRun(r.id, !r.hidden);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="space-y-4" data-testid="admin-scores">
      <div className="flex items-end gap-4">
        <div className="w-60">
          <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="verified">Verificadas (en la tabla)</option>
            <option value="pending">Verificando</option>
            <option value="saved">Guardadas (historial)</option>
            <option value="rejected">Rechazadas</option>
          </Select>
        </div>
        <p className="pb-2 text-sm text-ink-400">El Tapón · las partidas ocultas no salen en las tablas públicas. Los apodos de invitados pasan un filtro de palabras; aquí puedes ocultar cualquier otro.</p>
      </div>
      {(error || err) && <Alert tone="error">{error || err}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.runs.length === 0 ? (
        <p className="text-sm text-ink-400">Todavía no hay partidas guardadas.</p>
      ) : (
        <Table head={['Fecha', 'Jugador', 'Puntos', 'Distancia', 'Duración', 'Estado', '']}>
          {data.runs.map((r) => (
            <tr key={r.id} className={cx(r.hidden && 'opacity-50')}>
              <td className="whitespace-nowrap px-4 py-3 text-ink-400">{r.finishedAt ? fmtDateTime(r.finishedAt) : '—'}</td>
              <td className="px-4 py-3 text-ink-100">
                {r.name}
                {r.guest && <span className="ml-2 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Invitado</span>}
              </td>
              <td className="px-4 py-3 font-mono text-ink-100">{r.score?.toLocaleString('es-DO') ?? '—'}</td>
              <td className="px-4 py-3 text-ink-300">{r.distanceM !== null ? `${r.distanceM.toLocaleString('es-DO')} m` : '—'}</td>
              <td className="px-4 py-3 text-ink-300">{r.durationMs !== null ? fmtDuration(Math.round(r.durationMs / 1000)) : '—'}</td>
              <td className="px-4 py-3">
                <Badge tone={RUN_STATUS[r.status][1]}>{RUN_STATUS[r.status][0]}</Badge>
                {r.hidden && <Badge tone="warn" className="ml-1">Oculta</Badge>}
                {r.reasons?.length ? <p className="mt-1 font-mono text-[11px] text-ink-500">{r.reasons.join(', ')}</p> : null}
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => void toggle(r)}>
                  {r.hidden ? 'Mostrar' : 'Ocultar'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export default function AdminPage() {
  useTitle('Administración', { noindex: true });
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: [Tab, string][] = [
    ['overview', 'Resumen'],
    ['games', 'Juegos'],
    ['users', 'Usuarios'],
    ['news', 'Anuncios'],
    ['scores', 'Puntuaciones'],
    ['payments', 'Compras (legado)'],
    ['errors', 'Errores'],
    ['audit', 'Auditoría'],
    ['tickets', 'Soporte'],
  ];
  return (
    <Container className="max-w-[1400px] py-14">
      <PageHeader eyebrow="DominicanGames Core" title="Administración" />
      <div role="tablist" className="mb-6 flex flex-wrap gap-1 rounded-xl bg-black/30 p-1">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('rounded-lg px-4 py-2 text-sm font-medium', tab === k ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-ink-200')}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'games' && <Games />}
      {tab === 'news' && <News />}
      {tab === 'users' && <Users />}
      {tab === 'scores' && <ArcadeRuns />}
      {tab === 'payments' && <Payments />}
      {(tab === 'errors' || tab === 'audit' || tab === 'tickets') && <Logs key={tab} kind={tab} />}
    </Container>
  );
}
