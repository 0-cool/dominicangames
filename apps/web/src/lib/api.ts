import type { AchievementView, AnnouncementView, GameSettings, Leaderboard, ProfileUpdate, PublicGame, PublicUser, SaveData, TaponFinishInput, TaponFinishResult, TaponLeaderboard, TaponRunTicket } from '@sd/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function csrf(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  if (!csrfPromise || force) {
    csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => {
        if (!r.ok) throw new ApiError(r.status, 'csrf_unavailable', 'No se pudo contactar el servidor.');
        return r.json() as Promise<{ token: string }>;
      })
      .then((j) => (csrfToken = j.token))
      .finally(() => (csrfPromise = null));
  }
  return csrfPromise;
}

interface ReqOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
}

/** JSON API call with session cookie + CSRF header. Throws ApiError with the server's Spanish message. */
export async function api<T>(path: string, opts: ReqOpts = {}, retried = false): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrf();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & { error?: string; message?: string; fields?: { path: string; message: string }[] }) | null;
  if (!res.ok) {
    if (res.status === 403 && data?.error === 'csrf' && !retried) {
      await csrf(true);
      return api<T>(path, opts, true);
    }
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Error ${res.status}`, data?.fields);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Ocurrió un error inesperado.');

// ───────────── Typed endpoints ─────────────
/** DG Monetization status (everything is off: DominicanGames is free). */
export interface MonetizationStatus {
  enabled: boolean;
  payments: { enabled: boolean; provider: string; sandbox: boolean; products: { code: string; title: string; description: string; amountMinor: number; currency: string; kind: string }[] };
  ads: { enabled: boolean };
  sponsorships: { enabled: boolean };
}

export interface PaymentRow {
  id: string;
  status: 'created' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  amount: number;
  currency: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
  failureReason?: string | null;
}

export interface MissionRow {
  missionId: string;
  status: 'started' | 'completed' | 'failed';
  completedAt: string | null;
  stats: Record<string, number> | null;
}

export interface AccountOverview {
  user: PublicUser;
  payments: PaymentRow[];
  missions: MissionRow[];
  save: { updatedAt: string; money: number; landmarks: number; stats: Partial<SaveData['stats']> } | null;
}

export interface GameProgress {
  gameId: string;
  summary: string;
  stats: { label: string; value: string }[];
  milestones: { id: string; title: string; status: 'pending' | 'started' | 'completed' | 'failed'; detail?: string }[];
  completion: number | null;
  updatedAt: string | null;
}

export interface Dashboard {
  user: PublicUser;
  continue: { gameId: string; lastPlayedAt: string | null; reason: 'recent' | 'featured' } | null;
  recentlyPlayed: { gameId: string; lastPlayedAt: string; sessions: number; seconds: number }[];
  games: PublicGame[];
  progress: GameProgress[];
  achievements: { list: AchievementView[]; points: number; unlocked: number; total: number };
  announcements: AnnouncementView[];
  payments: PaymentRow[];
}

export interface AdminArcadeRun {
  id: string;
  gameId: string;
  userId: string | null;
  name: string;
  guest: boolean;
  status: 'saved' | 'pending' | 'verified' | 'rejected';
  hidden: boolean;
  score: number | null;
  distanceM: number | null;
  durationMs: number | null;
  reasons: string[] | null;
  finishedAt: string | null;
}

export interface Community {
  leaderboards: Leaderboard[];
  announcements: AnnouncementView[];
  achievements: AchievementView[];
}

export const Api = {
  me: () => api<{ user: PublicUser | null }>('/api/auth/me'),
  register: (b: { email: string; username: string; password: string; acceptTerms: boolean }) => api<{ user: PublicUser }>('/api/auth/register', { method: 'POST', body: b }),
  login: (b: { email: string; password: string }) => api<{ user: PublicUser }>('/api/auth/login', { method: 'POST', body: b }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  verifyEmail: (token: string) => api<{ ok: true }>('/api/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: () => api<{ ok: true }>('/api/auth/resend-verification', { method: 'POST' }),
  forgotPassword: (email: string) => api<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, password: string) => api<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
  changePassword: (currentPassword: string, newPassword: string) => api<{ ok: true }>('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  updateProfile: (patch: ProfileUpdate) => api<{ user: PublicUser }>('/api/account/profile', { method: 'PATCH', body: patch }),
  overview: () => api<AccountOverview>('/api/account/overview'),

  // DominicanGames Core
  games: () => api<{ games: PublicGame[] }>('/api/platform/games'),
  game: (id: string) => api<{ game: PublicGame }>(`/api/platform/games/${encodeURIComponent(id)}`),
  dashboard: () => api<Dashboard>('/api/platform/dashboard'),
  community: () => api<Community>('/api/platform/community'),
  startSession: (gameId: string) => api<{ sessionId: string; startedAt: string }>('/api/platform/sessions', { method: 'POST', body: { gameId } }),
  heartbeat: (sessionId: string) => api<{ ok: boolean }>(`/api/platform/sessions/${encodeURIComponent(sessionId)}/heartbeat`, { method: 'POST' }),
  endSession: (sessionId: string, keepalive = false) => api<{ ok: boolean }>(`/api/platform/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', keepalive }),

  // DG Monetization (off) + history of purchases made before the platform became free
  monetization: () => api<MonetizationStatus>('/api/payments/config'),
  payment: (id: string) => api<{ payment: PaymentRow }>(`/api/payments/${encodeURIComponent(id)}`),

  access: () => api<{ access: 'free'; gameId: string; canPlay: boolean; emailVerified: boolean }>('/api/game/access'),
  getSave: () => api<{ save: SaveData | null; updatedAt: string | null }>('/api/game/save'),
  putSave: (save: SaveData, keepalive = false) => api<{ ok: true }>('/api/game/save', { method: 'PUT', body: save, keepalive }),
  missions: () => api<{ missions: MissionRow[] }>('/api/game/missions'),
  postMission: (b: { missionId: string; status: 'started' | 'completed' | 'failed'; stats?: Record<string, number> }) => api<{ ok: true }>('/api/game/missions', { method: 'POST', body: b }),
  getSettings: () => api<{ settings: GameSettings | null }>('/api/game/settings'),
  putSettings: (s: GameSettings) => api<{ ok: true }>('/api/game/settings', { method: 'PUT', body: s }),

  // El Tapón (arcade: guests and accounts)
  taponStartRun: () => api<TaponRunTicket>('/api/arcade/el-tapon/runs', { method: 'POST' }),
  taponFinishRun: (runId: string, b: TaponFinishInput) => api<TaponFinishResult>(`/api/arcade/el-tapon/runs/${encodeURIComponent(runId)}/finish`, { method: 'POST', body: b }),
  taponLeaderboard: (period: 'all' | 'week', limit = 10) => api<TaponLeaderboard>(`/api/arcade/el-tapon/leaderboard?period=${period}&limit=${limit}`),
  adminArcadeRuns: (status?: string) => api<{ runs: AdminArcadeRun[] }>(`/api/admin/arcade/runs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  adminHideArcadeRun: (id: string, hidden: boolean) => api<{ ok: true; hidden: boolean }>(`/api/admin/arcade/runs/${encodeURIComponent(id)}`, { method: 'PATCH', body: { hidden } }),

  supportTicket: (b: { email?: string; subject: string; message: string; category: string }) => api<{ ok: true; id: string }>('/api/support/tickets', { method: 'POST', body: b }),
  devMailbox: () => api<{ emails: { id: string; to: string; subject: string; text: string; createdAt: string }[] }>('/api/dev/mailbox'),
};

/** Fetch a world asset (the server checks the DominicanGames session and that the game is available). */
export function fetchGameAsset(path: string): Promise<Response> {
  return fetch(`/api/game/assets/${path}`, { credentials: 'same-origin' }).then((r) => {
    if (r.status === 401) throw new ApiError(401, 'unauthorized', 'Tu sesión expiró. Vuelve a entrar con tu cuenta DominicanGames.');
    if (r.status === 403) throw new ApiError(403, 'game_unavailable', 'Este juego no está disponible en este momento.');
    return r;
  });
}
