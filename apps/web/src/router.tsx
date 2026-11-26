import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom';
import { GuestOnly, FullSpinner, RequireAdmin, RequireAuth } from './components/Guards.tsx';
import { Container, ImmersiveLayout, SiteLayout } from './components/Layout.tsx';
import { LinkButton } from './components/ui.tsx';
import { HomePage } from './pages/Home.tsx';
import { CatalogPage } from './pages/Catalog.tsx';
import { GameDetailPage } from './pages/GameDetail.tsx';
import { CommunityPage } from './pages/Community.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { CheckEmailPage, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth.tsx';
import { LegacyPaymentRedirect, PaymentResultPage } from './pages/payment.tsx';
import { ProfilePage, SettingsPage, SupportPage } from './pages/account.tsx';
import { CreditsPage, NotFoundPage, PrivacyPage, TermsPage } from './pages/legal.tsx';
import { WEB_GAME_MODULES } from './games/registry.tsx';
import { reportError } from './lib/telemetry.ts';

// Heavy, rarely-needed bundles load on demand (each game engine is its own lazy chunk, see games/registry.tsx).
const AdminPage = lazy(() => import('./pages/admin/Admin.tsx'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<FullSpinner />}>{children}</Suspense>;

function RouteError() {
  const err = useRouteError();
  reportError(err, 'route');
  return (
    <Container narrow className="py-28 text-center">
      <h1 className="brand-title text-5xl text-white">Algo salió mal</h1>
      <p className="mt-3 text-ink-300">Recarga la página. Si el problema sigue, escríbenos desde Soporte.</p>
      <LinkButton to="/" className="mt-8">Ir al inicio</LinkButton>
    </Container>
  );
}

const modules = Object.values(WEB_GAME_MODULES);

/**
 * DominicanGames routes. Platform pages (Spanish URLs; English pages will live under /en) + the routes each
 * game module registers. Guards are UX only: the server authorizes every API call.
 */
export const router = createBrowserRouter([
  // Full-screen game routes (Santo Domingo Open World: /juego).
  ...modules.flatMap((m) => m.fullscreenRoutes.map((r) => ({ ...r, errorElement: <RouteError /> }))),
  {
    element: <ImmersiveLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/juegos/:gameId', element: <GameDetailPage /> },
    ],
  },
  {
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/registro', element: <RegisterPage /> },
          { path: '/entrar', element: <LoginPage /> },
          { path: '/recuperar', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/juegos', element: <CatalogPage /> },
      { path: '/comunidad', element: <CommunityPage /> },
      { path: '/verificar', element: <VerifyEmailPage /> },
      { path: '/restablecer', element: <ResetPasswordPage /> },
      { path: '/terminos', element: <TermsPage /> },
      { path: '/privacidad', element: <PrivacyPage /> },
      { path: '/creditos', element: <CreditsPage /> },
      { path: '/soporte', element: <SupportPage /> },
      // The RD$100 purchase page is gone — old links land on the (free) game page.
      { path: '/pago', element: <LegacyPaymentRedirect /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/panel', element: <DashboardPage /> },
          { path: '/cuenta', element: <Navigate to="/panel" replace /> },
          { path: '/verifica-tu-correo', element: <CheckEmailPage /> },
          { path: '/perfil', element: <ProfilePage /> },
          { path: '/ajustes', element: <SettingsPage /> },
          { path: '/pago/resultado', element: <PaymentResultPage /> },
        ],
      },
      // Game launchers and other in-layout game routes (Santo Domingo Open World: /jugar).
      ...modules.flatMap((m) => m.siteRoutes),
      {
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: (
              <S>
                <AdminPage />
              </S>
            ),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
