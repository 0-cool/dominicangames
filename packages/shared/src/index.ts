export * from './geo.ts';
export * from './schemas.ts';
export * from './world-types.ts';
export * from './platform.ts';

/** Formats an amount in centavos as Dominican pesos (used for historical payments and future optional products). */
export function formatDop(amountMinor: number): string {
  return `RD$${(amountMinor / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type PaymentStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';

/** The signed-in player as seen by the web client: one DominicanGames identity for every game. */
export interface PublicUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: string;
  /** Preset avatar id (see AVATARS) or null for the initials avatar. */
  avatar: string | null;
  showInRankings: boolean;
  locale: 'es' | 'en';
  /** Bought the original RD$100 access before the platform became free (cosmetic “Fundador” badge). */
  founder: boolean;
}
export * from './tapon.ts';
