import { useRef, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { safeNext, useAuth } from '../lib/auth.ts';
import { DgLoader } from './brand/Logo.tsx';

export function FullSpinner() {
  return <DgLoader />;
}

/**
 * UX guard only — every protected API call is enforced again by the server.
 * DominicanGames is free: a signed-in account is all a player needs (no payment, no subscription).
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <FullSpinner />;
  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children ? <>{children}</> : <Outlet />;
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <FullSpinner />;
  if (!user) return <Navigate to="/entrar?next=/admin" replace />;
  if (user.role !== 'admin') return <Navigate to="/panel" replace />;
  return children ? <>{children}</> : <Outlet />;
}

/**
 * Auth pages are for visitors who arrive logged out. Someone who was already logged in is sent
 * to their dashboard; someone who logs in / registers on these pages navigates on their own
 * (→ ?next= or the dashboard), so we only look at the state on arrival.
 */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  const loggedInOnArrival = useRef<boolean | null>(null);
  if (ready && loggedInOnArrival.current === null) loggedInOnArrival.current = !!user;
  if (!ready) return <FullSpinner />;
  if (loggedInOnArrival.current) return <Navigate to={safeNext(new URLSearchParams(loc.search).get('next'), '/panel')} replace />;
  return children ? <>{children}</> : <Outlet />;
}
