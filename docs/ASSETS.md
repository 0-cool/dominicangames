# Assets — sources, licences and budgets

Every visual and audio asset in the game is **original and generated from code** in this repository. There are
no third-party models, textures, sounds, music or fonts inside the game engine. The DominicanGames website uses three
open fonts (Inter, Unbounded, Anton) and original brand artwork.

## Inventory

| Category | How it is made | Where | Licence |
|---|---|---|---|
| City geometry (streets, sidewalks, curbs, markings, buildings, walls, coast, plazas) | Generated from OpenStreetMap by `tools/world-builder` | `apps/server/game-data/world` | Derived from ODbL data — © OpenStreetMap contributors |
| Procedural infill buildings | Generated inside real blocks where OSM lacks footprints | same | Original |
| Landmarks (Catedral, Alcázar, Fortaleza Ozama, obelisks, Palacio Nacional dome, gates…) | Simplified procedural models on real footprints | `buildings.ts`, `props.ts` | Original |
| Textures (asphalt, pavers, sidewalks, plaster, stone, roofs, grass, sand, water…) | GPU-baked procedural noise at load time | `packages/game/src/render/textures.ts` | Original |
| Façades (windows, shutters, jalousies, iron grilles, roll-up shop doors, arcades, cornices, night lights) | Fragment shader | `render/materials.ts` | Original |
| Street props (palms, trees, poles, power lines, water tanks, plastic chairs, coolers, dominoes tables, bins, benches, parked vehicles…) | Procedural geometry | `world/propGeometries.ts`, `world/geomkit.ts`, `world/foliage.ts` | Original |
| Shop signs | Canvas-rendered text atlas with **fictional** business names | `world/signs.ts`, builder `NAMES` | Original |
| Vehicles (10 models: compact, sedan, concho, SUV, big SUV, pickup, guagua, motorcycle, motoconcho, delivery) | Procedural geometry, generic names (e.g. “Motor Faro 150”) — no manufacturer logos | `vehicles/vehicleMeshes.ts` | Original |
| Characters (player, Don Ramón, pedestrians) | Procedural low-poly humanoids with GPU vertex skinning | `characters/Humanoid.ts` | Original |
| Audio (engines, horns, crashes, footsteps, ambience, birds, dogs, rain, thunder) | WebAudio synthesis | `audio/Audio.ts` | Original |
| Music (colmado bachata/merengue loops) | Procedurally composed and synthesised at runtime — no samples, no existing songs | `audio/Audio.ts` | Original |
| Website images (Santo Domingo Open World) | In-engine screenshots; the cinematic set in `img/games/santo-domingo-open-world/` was rendered with the engine's photo mode (`harness.html?mode=photo&x=…&time=…&weather=…&preset=ultra`) at golden hour, night and rain | `apps/web/public/img`, `apps/web/public/img/games/santo-domingo-open-world` | Original |
| DominicanGames brand (World Grid mark, wordmark, favicon, OG image, 512 px mark) | Hand-written SVG; OG image composed from an in-game capture | `components/brand/Logo.tsx`, `public/favicon.svg`, `public/img/brand/` | Original |
| Concept art for upcoming titles (Moto RD, Caribbean Racing, Island Survival) | Hand-written vector illustrations, always labelled “Arte conceptual” | `components/brand/GameArt.tsx` | Original |
| Player avatars (12 presets) | Hand-written line glyphs on gradients | `components/brand/Avatar.tsx`, `AVATARS` in `@sd/shared` | Original |
| El Tapón sprites (motoconchista, passengers, carro público, Sonata mamey, OMSA, guagua, platanera + plantains, police and traffic-enforcement vehicles/officers, everyday traffic, obstacles, street buildings and props) | Side-view SVG drawn in code — invented names, 555 phone numbers, no logos or official insignia | `packages/tapon/src/art/`, exported by `packages/tapon/scripts/export-assets.ts` to `apps/web/public/games/el-tapon/` (sizes and collision boxes in [EL_TAPON_ASSETS.md](EL_TAPON_ASSETS.md)) | Original |
| El Tapón audio (motorcycle engine, horns, whistle, siren, plantain slide-whistle, crash, UI) and music | WebAudio synthesis; music from the shared procedural radio | `packages/tapon/src/audio.ts`, `packages/game/src/audio/Radio.ts` | Original |
| El Tapón catalog images (cover, hero, 9 screenshots) | Captured from the game itself (dev harness, seeded runs) | `apps/web/public/img/games/el-tapon/` | Original |
| Fonts | Inter (variable), Anton (npm `@fontsource*`); Unbounded (variable, latin subset vendored in `apps/web/src/assets/fonts/unbounded` with its licence) | | SIL OFL 1.1 |

## Polygon and memory budgets

| Item | Budget | Current |
|---|---|---|
| Chunk (250×250 m) static geometry | ≤ 25 k triangles | 376,685 triangles across 116 chunks (avg ≈ 3.2 k; max chunk ≈ 1 MB GLB) |
| Vehicle | ≤ 3 k triangles | est. 1–2.5 k |
| Humanoid | ≤ 1.5 k triangles | est. ~1 k |
| Tree / palm | ≤ 300 triangles (cards) | est. 80–250 |
| Baked textures | ≤ 64 MB VRAM | est. ≈ 60 MB (to profile on hardware) |

## Replacing assets later

The pipeline is data-driven: a future art pass can replace procedural meshes per layer (GLB from Blender) and
textures (KTX2) without touching gameplay code. Keep the rules: original or properly licensed work only, no
real brand logos, no copyrighted music.
