# DominicanGames — brand & design system

**Name:** DominicanGames · **Tagline:** ONE PLATFORM. MULTIPLE WORLDS. (Spanish copy: “Una plataforma. Múltiples
mundos.”) · **Positioning:** La casa del gaming dominicano — a serious, premium gaming company made in the Dominican
Republic. Primary language: Spanish (English prepared).

## Logo — “the World Grid”

Four tiles on one platform: three tiles in the blue/red of the Dominican flag and the fourth one is **play**. The
cross-shaped gap between them is the platform that connects every world. Original artwork; it references the flag's
colours and cross without reproducing the flag or the coat of arms.

| Asset | File |
|---|---|
| Mark + wordmark (React) | `apps/web/src/components/brand/Logo.tsx` (`DgMark`, `Logo`, `DgLoader`) |
| Favicon | `apps/web/public/favicon.svg` |
| 512 px mark (JSON-LD logo, touch icon) | `apps/web/public/img/brand/dominicangames-mark-512.png` |
| Open Graph image | `apps/web/public/img/brand/og-dominicangames.jpg` |

Wordmark: `DOMINICAN` white + `GAMES` DG Red, Unbounded ExtraBold, tracking −2 %. Minimum mark size 16 px.

## Colour

| Token | Value | Use |
|---|---|---|
| `ink-950 … ink-100` | `#05070d` → `#eceef6` | Navy-tinted night surfaces and text |
| `dg-red-500` | `#ff2e4d` | Primary actions (one per view), accents, active nav |
| `dg-blue-500` / `dg-blue-300` | `#3d64ff` / `#93adff` | Focus rings, links, secondary highlights |
| `.bg-dg` | red gradient | Primary buttons |
| `.text-gradient-dg`, `.text-gradient-flag` | gradients | Headline emphasis |
| Status | `leaf` ok · `gold` warn/achievements · `coral` error | Badges and alerts |

Each **game keeps its own identity** inside the platform: Santo Domingo Open World = sunset palette (`sun-*`,
`.bg-sun`, `.text-gradient-sun`) + Anton (`.display`). Catalog entries carry `theme.accent/accent2` for cards.

## Typography

| Role | Font | Class |
|---|---|---|
| Platform display (headlines, wordmark) | Unbounded (variable, SIL OFL, vendored in `src/assets/fonts/unbounded`) | `.brand-title`, `font-brand` |
| UI / body | Inter Variable (OFL, `@fontsource-variable/inter`) | default |
| Game identity (Santo Domingo Open World, in-game HUD) | Anton (OFL) | `.display` |
| Eyebrows | Inter Bold 11 px, +28 % tracking, uppercase, DG Red | `.brand-eyebrow` |

Scale (desktop): hero 5.6 rem · section 3.1 rem · page 2.6 rem · card 1.55 rem · body 15–17 px.

## Components & patterns

* Buttons (`components/ui.tsx`): `primary` (DG Red), `secondary` (glass), `outline`, `ghost`, `white`; sizes up to
  `xl` (uppercase, used for **JUGAR AHORA / EXPLORAR JUEGOS / CONTINUAR JUGANDO**).
* Cards: `.card` (22–28 px radius, hairline border, deep shadow). Game cards (`components/GameCard.tsx`) always show
  status; upcoming titles show a lock + “Próximamente” and never a play action.
* Concept art (`components/brand/GameArt.tsx`): original vector posters for titles without game imagery, always
  labelled “Arte conceptual”.
* Avatars (`components/brand/Avatar.tsx` + `AVATARS` in `@sd/shared`): 12 original glyph avatars on gradient discs,
  or the initial on a hashed gradient. No uploads (no storage/moderation cost).
* Loading: `DgLoader` (animated World Grid) for platform routes; the game loading screen adds “DominicanGames
  presenta”.
* Motion: fade-up reveals, slow Ken Burns on cinematic imagery, cross-fading hero slideshow; all disabled with
  `prefers-reduced-motion`.
* Imagery: **real in-game captures** of Santo Domingo Open World (golden hour, night, rain) rendered with the
  engine's photo mode (`apps/web/harness.html?mode=photo…`), labelled “Captura real del juego”. The hero's
  location tag is inspired by in-game location callouts. No stock images.

## Voice

Spanish from the Dominican Republic, warm and direct (“¡Klk!”, “Súbete y dale”), never misleading: no invented
statistics, concepts are labelled as concepts, and “gratis” means free.
