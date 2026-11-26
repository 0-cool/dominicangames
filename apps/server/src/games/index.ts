import type { GameModule } from '../platform/modules.ts';
import { elTapon } from './el-tapon/index.ts';
import { santoDomingoOpenWorld } from './santo-domingo-open-world/index.ts';

/**
 * Game modules bundled with this DominicanGames server. To add a game: implement `GameModule` in
 * `games/<catalog-id>/`, add it here and create/publish its catalog entry from Admin → Juegos.
 * Catalog entries without a module (e.g. “Próximamente” concepts) are listed but never playable.
 */
export const GAME_MODULES: readonly GameModule[] = [santoDomingoOpenWorld, elTapon];
