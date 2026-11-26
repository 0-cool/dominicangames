import { useEffect, useState } from 'react';
import type { PublicGame } from '@sd/shared';
import { Api, errorMessage } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';

/**
 * DominicanGames catalog on the client. Pages never hard-code the list of games: the catalog comes from the API
 * (admin-managed), so publishing a new game or marking one as upcoming needs no front-end change.
 */
let cache: { key: string; at: number; games: PublicGame[] } | null = null;

export function invalidateCatalog() {
  cache = null;
}

export function useCatalog() {
  const userKey = useAuth((s) => `${s.user?.id ?? 'anon'}:${s.user?.role ?? ''}`);
  const [games, setGames] = useState<PublicGame[] | null>(cache?.key === userKey ? cache.games : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (cache && cache.key === userKey && Date.now() - cache.at < 60_000) {
      setGames(cache.games);
      return;
    }
    let stop = false;
    Api.games()
      .then(({ games }) => {
        cache = { key: userKey, at: Date.now(), games };
        if (!stop) setGames(games);
      })
      .catch((e) => !stop && setError(errorMessage(e)));
    return () => {
      stop = true;
    };
  }, [userKey]);
  return { games, error };
}

export const playable = (g: PublicGame) => g.playable && !!g.launchPath;
export const featuredGame = (games: PublicGame[]) => games.find((g) => g.featured && playable(g)) ?? games.find(playable) ?? null;

/** Where the PLAY button of a game leads: its launcher, through sign-up/login when needed (not for guest-play games). */
export function playHref(g: PublicGame, signedIn: boolean): string | null {
  if (!playable(g)) return null;
  return signedIn || g.guestPlay ? g.launchPath! : `/registro?next=${encodeURIComponent(g.launchPath!)}`;
}

