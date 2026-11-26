import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { PublicGame } from '@sd/shared';
import { RequireAuth } from '../components/Guards.tsx';
import { DgLoader } from '../components/brand/Logo.tsx';
import { LauncherPage } from '../pages/Launcher.tsx';

/**
 * DominicanGames web ⇄ game integration (client side). The catalog (title, status, images, launch path…) comes
 * from the API; a web game module only provides what is specific to its game:
 *   - the routes that launch and run it (rendered inside the platform shell or full screen),
 *   - optional extra sections for its catalog page.
 * Routes are behind the platform account (RequireAuth) unless the game allows guest play (El Tapón); the server
 * authorizes each API call again.
 * To add a game: create games/<catalog-id>/, register it below and point its catalog `launchPath` at its route.
 */
export interface WebGameModule {
  id: string;
  DetailSections?: LazyExoticComponent<ComponentType<{ game: PublicGame }>>;
  /** Routes rendered inside the platform layout (header + footer), e.g. the launcher. */
  siteRoutes: RouteObject[];
  /** Full-screen routes, e.g. the game itself. */
  fullscreenRoutes: RouteObject[];
}

// Santo Domingo Open World — the engine (three.js + Rapier) is a lazy chunk loaded only on /juego.
const SdowGameScreen = lazy(() => import('../game/GameScreen.tsx'));
// El Tapón — Canvas 2D arcade game, its own lazy chunk. Guests can play: no RequireAuth on its route.
const TaponScreen = lazy(() => import('./el-tapon/TaponScreen.tsx'));

export const WEB_GAME_MODULES: Record<string, WebGameModule> = {
  'santo-domingo-open-world': {
    id: 'santo-domingo-open-world',
    DetailSections: lazy(() => import('./santo-domingo-open-world/DetailSections.tsx')),
    // The existing, working routes are kept: /jugar (launcher) and /juego (game).
    siteRoutes: [{ element: <RequireAuth />, children: [{ path: '/jugar', element: <LauncherPage /> }] }],
    fullscreenRoutes: [
      {
        path: '/juego',
        element: (
          <RequireAuth>
            <Suspense fallback={<DgLoader fullscreen label="Cargando Santo Domingo Open World" />}>
              <SdowGameScreen />
            </Suspense>
          </RequireAuth>
        ),
      },
    ],
  },
  'el-tapon': {
    id: 'el-tapon',
    DetailSections: lazy(() => import('./el-tapon/DetailSections.tsx')),
    siteRoutes: [],
    fullscreenRoutes: [
      {
        path: '/juegos/el-tapon/jugar',
        element: (
          <Suspense fallback={<DgLoader fullscreen label="Cargando El Tapón" />}>
            <TaponScreen />
          </Suspense>
        ),
      },
    ],
  },
};

export const webGameModule = (id: string): WebGameModule | undefined => WEB_GAME_MODULES[id];
