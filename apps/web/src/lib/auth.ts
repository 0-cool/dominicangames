import { create } from 'zustand';
import type { PublicUser } from '@sd/shared';
import { Api } from './api.ts';

interface AuthState {
  user: PublicUser | null;
  ready: boolean;
  refresh(): Promise<PublicUser | null>;
  setUser(u: PublicUser | null): void;
  logout(): Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async refresh() {
    try {
      const { user } = await Api.me();
      set({ user, ready: true });
      return user;
    } catch {
      set({ ready: true });
      return null;
    }
  },
  setUser: (user) => set({ user, ready: true }),
  async logout() {
    try {
      await Api.logout();
    } finally {
      set({ user: null });
    }
  },
}));

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = '/panel'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
