import { z } from 'zod';

/**
 * DominicanGames Core — shared contracts between the API, the web client and game modules.
 * “One platform. Multiple worlds.”: one account, one catalog, many games.
 */

export const BRAND = {
  name: 'DominicanGames',
  tagline: 'ONE PLATFORM. MULTIPLE WORLDS.',
  taglineEs: 'Una plataforma. Múltiples mundos.',
  origin: 'Hecho en República Dominicana',
} as const;

// ───────────────────────────── Catalog ─────────────────────────────
export const GAME_STATUSES = ['published', 'development', 'coming_soon', 'hidden'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  published: 'Disponible',
  development: 'En desarrollo (solo administradores)',
  coming_soon: 'Próximamente',
  hidden: 'Oculto',
};

export const gameIdSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones (ej. moto-rd)');

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal, ej. #ff2e4d');
/** Site-relative image path (served by the web app) — external hosts are blocked by the CSP. */
const imagePath = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/[a-zA-Z0-9_\-./]+\.(?:jpg|jpeg|png|webp|svg)$/, 'Ruta de imagen del sitio, ej. /img/games/mi-juego/cover.jpg');
/** Internal SPA path only (no protocol, no //host) — prevents open redirects from catalog data. */
export const internalPathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)[a-zA-Z0-9_\-./?=&%#]*$/, 'Ruta interna del sitio, ej. /jugar');

export const gameThemeSchema = z.object({ accent: hex, accent2: hex.optional(), art: z.string().max(32).optional() });

/** Editable catalog fields. Kept WITHOUT defaults so a partial update never resets fields it did not send. */
const gameFields = {
  title: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(4000),
  status: z.enum(GAME_STATUSES),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  categories: z.array(z.string().trim().min(1).max(32)).max(8),
  platforms: z.array(z.string().trim().min(1).max(40)).max(6),
  developer: z.string().trim().min(1).max(80),
  publisher: z.string().trim().min(1).max(80),
  releaseLabel: z.string().trim().max(60),
  launchPath: internalPathSchema.nullable(),
  coverImage: imagePath.nullable(),
  heroImage: imagePath.nullable(),
  screenshots: z.array(z.object({ src: imagePath, alt: z.string().trim().max(140) })).max(24),
  theme: gameThemeSchema,
  /** Visitors can play without an account (scores need a nickname). */
  guestPlay: z.boolean(),
};

/** Admin → create a game. */
export const gameInputSchema = z.object({
  id: gameIdSchema,
  ...gameFields,
  tagline: gameFields.tagline.default(''),
  description: gameFields.description.default(''),
  featured: gameFields.featured.default(false),
  guestPlay: gameFields.guestPlay.default(false),
  sortOrder: gameFields.sortOrder.default(100),
  categories: gameFields.categories.default([]),
  platforms: gameFields.platforms.default([]),
  developer: gameFields.developer.default('DominicanGames'),
  publisher: gameFields.publisher.default('DominicanGames'),
  releaseLabel: gameFields.releaseLabel.default(''),
  launchPath: gameFields.launchPath.default(null),
  coverImage: gameFields.coverImage.default(null),
  heroImage: gameFields.heroImage.default(null),
  screenshots: gameFields.screenshots.default([]),
  theme: gameFields.theme.default({ accent: '#ff2e4d' }),
});
export type GameInput = z.infer<typeof gameInputSchema>;
/** Admin → edit a game: only the fields sent are changed. */
export const gameUpdateSchema = z.object(gameFields).partial();
export type GameUpdate = z.infer<typeof gameUpdateSchema>;

export interface PublicGame {
  id: string;
  title: string;
  tagline: string;
  description: string;
  status: GameStatus;
  featured: boolean;
  sortOrder: number;
  categories: string[];
  platforms: string[];
  developer: string;
  publisher: string;
  releaseLabel: string;
  launchPath: string | null;
  coverImage: string | null;
  heroImage: string | null;
  screenshots: { src: string; alt: string }[];
  theme: { accent: string; accent2?: string; art?: string };
  /** Visitors can play without an account. */
  guestPlay: boolean;
  /** True when the current visitor may launch it (published, or development for admins). */
  playable: boolean;
  updatedAt: string;
}

// ───────────────────────────── Identity ─────────────────────────────
export interface AvatarDef {
  id: string;
  label: string;
  /** Gradient colours of the avatar disc. */
  from: string;
  to: string;
  /** Glyph key drawn by the web client (original line icons). */
  glyph: 'palm' | 'moto' | 'bus' | 'baseball' | 'domino' | 'sun' | 'wave' | 'mango' | 'helmet' | 'arch' | 'guitar' | 'car';
}

/** Original preset avatars (no uploads → no storage or moderation costs). */
export const AVATARS: readonly AvatarDef[] = [
  { id: 'palma', label: 'Palma', from: '#10b981', to: '#0ea5e9', glyph: 'palm' },
  { id: 'motor', label: 'Motor', from: '#f59e0b', to: '#ef4444', glyph: 'moto' },
  { id: 'guagua', label: 'Guagua', from: '#facc15', to: '#f97316', glyph: 'bus' },
  { id: 'pelota', label: 'Pelota', from: '#3b82f6', to: '#1e3a8a', glyph: 'baseball' },
  { id: 'domino', label: 'Dominó', from: '#64748b', to: '#0f172a', glyph: 'domino' },
  { id: 'sol', label: 'Sol caribeño', from: '#fde047', to: '#fb923c', glyph: 'sun' },
  { id: 'ola', label: 'Ola', from: '#22d3ee', to: '#2563eb', glyph: 'wave' },
  { id: 'mango', label: 'Mango', from: '#fb923c', to: '#16a34a', glyph: 'mango' },
  { id: 'casco', label: 'Casco', from: '#ff2e4d', to: '#7c1d2e', glyph: 'helmet' },
  { id: 'colonial', label: 'Zona Colonial', from: '#d6a46b', to: '#8b5a2b', glyph: 'arch' },
  { id: 'bachata', label: 'Bachata', from: '#a855f7', to: '#ec4899', glyph: 'guitar' },
  { id: 'carro', label: 'Carro', from: '#2f5bff', to: '#ff2e4d', glyph: 'car' },
];
export const AVATAR_IDS = AVATARS.map((a) => a.id) as [string, ...string[]];

export const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Mínimo 3 caracteres')
      .max(24, 'Máximo 24 caracteres')
      .regex(/^[a-zA-Z0-9_.]+$/, 'Solo letras, números, punto y guion bajo'),
    avatar: z.enum(AVATAR_IDS).nullable(),
    showInRankings: z.boolean(),
    locale: z.enum(['es', 'en']),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// ───────────────────────────── Sessions / achievements / community ─────────────────────────────
export const sessionStartSchema = z.object({ gameId: gameIdSchema });

export interface AchievementView {
  id: string;
  gameId: string | null;
  title: string;
  description: string;
  icon: string;
  points: number;
  unlockedAt: string | null;
}

export interface RankingEntry {
  rank: number;
  username: string;
  avatar: string | null;
  value: number;
  /** Pre-formatted value for display (e.g. “4:12 min”, “15 / 15”). */
  display: string;
  /** A visitor without an account who entered a nickname (El Tapón). */
  guest?: boolean;
}

export interface Leaderboard {
  id: string;
  gameId: string | null;
  title: string;
  description: string;
  unit: string;
  entries: RankingEntry[];
}

const announcementFields = {
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  gameId: gameIdSchema.nullable(),
  linkUrl: internalPathSchema.nullable(),
  linkLabel: z.string().trim().max(40).nullable(),
  published: z.boolean(),
  pinned: z.boolean(),
};
export const announcementInputSchema = z.object({
  ...announcementFields,
  gameId: announcementFields.gameId.default(null),
  linkUrl: announcementFields.linkUrl.default(null),
  linkLabel: announcementFields.linkLabel.default(null),
  published: announcementFields.published.default(true),
  pinned: announcementFields.pinned.default(false),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
/** Partial update without defaults (never resets fields that were not sent). */
export const announcementUpdateSchema = z.object(announcementFields).partial();

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  gameId: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  pinned: boolean;
  publishedAt: string;
}
