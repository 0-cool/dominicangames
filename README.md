# DominicanGames — ONE PLATFORM. MULTIPLE WORLDS.

**DominicanGames** es la plataforma de videojuegos nacida en República Dominicana: una sola cuenta gratis para
descubrir y jugar todos nuestros mundos desde el navegador de tu computadora.

Su primer título oficial es **Santo Domingo Open World**: un mundo abierto original ambientado en la Zona Colonial,
el Malecón y Gazcue, construido a partir de datos reales de OpenStreetMap, con motores y carros, tráfico, peatones,
día/noche, lluvia, misiones y progreso guardado en tu cuenta. **Registrarse y jugar es gratis** — el antiguo pago
de RD$100 fue eliminado (ver [docs/DOMINICANGAMES_INTEGRATION.md](docs/DOMINICANGAMES_INTEGRATION.md)).

El segundo es **El Tapón**: un arcade 2D de lado para PC en el que eres motoconchista en la hora pico de Santo
Domingo, entre carros públicos, Sonatas mamey, la OMSA, guaguas, la platanera y los agentes de tránsito. Se juega
**sin cuenta** (los invitados ponen su apodo en la tabla de récords) y las puntuaciones que entran en la tabla se
verifican en el servidor. Ver [docs/EL_TAPON.md](docs/EL_TAPON.md).

> Proyectos independientes. No están afiliados ni respaldados por Rockstar Games, Take-Two Interactive ni ninguna
> institución pública. No contienen material de GTA. Todos los negocios del juego son ficticios.
> Datos de mapa © colaboradores de OpenStreetMap (ODbL).

## Contenido

```
apps/web            Plataforma web (React 19, Vite 8, Tailwind 4): portada, catálogo, panel, cuenta, admin + juegos
  src/platform        SDK del cliente: catálogo, sesiones de juego (PlaySession), SEO
  src/games           Registro de módulos de juego web (Santo Domingo Open World: /jugar y /juego;
                      El Tapón: /juegos/el-tapon/jugar, sin cuenta)
apps/server         API (Fastify 5, Drizzle ORM, PostgreSQL)
  src/platform        DominicanGames Core: catálogo, sesiones, logros, rankings, anuncios, panel, SEO
  src/games           Módulos de juego del servidor (santo-domingo-open-world, el-tapon: partidas, récords, verificación)
  src/monetization    DG Monetization (desactivado: la plataforma es gratis)
packages/game       Motor de Santo Domingo Open World (three.js r187, Rapier 0.21, WebAudio)
packages/tapon      El Tapón: simulación determinista y justa, arte original (SVG), Canvas 2D, audio procedural
packages/shared     Esquemas Zod y tipos compartidos (incluye contratos de la plataforma)
tools/world-builder OSM → calles, aceras, edificios, monumentos → chunks GLB
data/osm            Extracto de OpenStreetMap (ODbL)
e2e                 Pruebas Playwright (sitio, recorrido completo gratis, El Tapón como invitado)
docs                Integración, arquitectura, marca, módulos de juego, monetización, seguridad, despliegue, QA…
```

## Requisitos

* Node.js ≥ 20.19 (recomendado 22 LTS) y npm 10+
* PostgreSQL 16+
* Navegador de escritorio con WebGL 2 (Chrome o Edge recientes)

## Puesta en marcha (desarrollo)

```bash
npm install
cp .env.example .env               # Windows PowerShell: Copy-Item .env.example .env
#   completa CSRF_SECRET (32+ caracteres aleatorios):
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up -d               # PostgreSQL 16 del proyecto en 127.0.0.1:55432 (Docker Desktop abierto)
npm run world:build                # genera los datos del mundo desde OpenStreetMap (≈30 s)
npm run db:migrate                 # crea/actualiza el esquema (hace un respaldo JSON antes de migrar)
npm run dev                        # API en :4000 y sitio en http://localhost:5173
```

La base de Docker usa el puerto **55432** (no 5432) para no chocar con otro PostgreSQL de tu computadora
(uno instalado en Windows u otro proyecto). `DATABASE_URL` en `.env.example` ya apunta ahí.

Sin Docker: instala PostgreSQL 16, crea el usuario `sd` y las bases `sd_open_world` y
`sd_open_world_test` (ver `tools/db/init-test-db.sql`) y pon su usuario, contraseña y puerto en `DATABASE_URL`
(`.env`) y, para `npm test`, en `TEST_DATABASE_URL`.

**Si algo falla al conectar**, los comandos explican la causa en lugar de mostrar un error técnico:

| Mensaje | Qué hacer |
| --- | --- |
| *rechazó el usuario "sd"* | En ese puerto responde otro PostgreSQL o la contraseña no coincide: usa la base del proyecto (`docker compose up -d`) o corrige `DATABASE_URL`. |
| *no hay ningún PostgreSQL escuchando* | Abre Docker Desktop y ejecuta `docker compose up -d`. |
| *la base de datos … no existe* | Con Docker se crea sola; en tu propio servidor créala (`CREATE DATABASE sd_open_world OWNER sd;`). |

En desarrollo los correos no se envían: aparecen en la “Bandeja de desarrollo” de las páginas de verificación
(`DEV_MAILBOX=true`). La verificación de correo se pide pero **no** bloquea el juego.

Crear un administrador (panel en `/admin`: catálogo de juegos, usuarios, anuncios, analítica):

```bash
npm run admin:create -- tu@correo.com 'una-clave-larga' admin   # clave de 10+ caracteres; "admin" = nombre de usuario
```

`db:rollback` **no** es un paso de instalación: deshace la migración de la plataforma y solo se usa para volver atrás.

### Base de datos: respaldos y migraciones reversibles

```bash
npm run db:backup                  # respaldo JSON de todas las tablas en backups/
npm run db:migrate                 # aplica migraciones pendientes (respaldo automático previo)
npm run db:rollback -- 0002_el_tapon                  # revierte El Tapón (con respaldo; las migraciones se deshacen de la más nueva a la más vieja)
npm run db:rollback -- 0001_dominicangames_platform   # revierte la migración de la plataforma (con respaldo)
```

La migración `0002_el_tapon` agrega El Tapón al catálogo, la tabla `arcade_runs` (partidas y récords) y la opción
“jugar sin cuenta” (`games.guest_play`). No toca las partidas de Santo Domingo Open World.

La migración `0001_dominicangames_platform` conserva todas las partidas, ajustes y misiones existentes y las asigna a
Santo Domingo Open World. Detalles en [docs/DOMINICANGAMES_INTEGRATION.md](docs/DOMINICANGAMES_INTEGRATION.md#4-database-migration-0001_dominicangames_platform).

## Pruebas

```bash
npm run typecheck                  # TypeScript en todos los paquetes
npm test                           # Vitest: API + migración (PostgreSQL), contratos compartidos, motor, world-builder
npx playwright test                # E2E: sitio, seguridad, SEO y recorrido completo cuenta nueva → jugar gratis
```

La prueba de aceptación crítica (`e2e/journey.spec.ts`) crea una cuenta nueva, lanza Santo Domingo Open World sin
pagos ni datos de pago, juega (caminar, saltar, conducir carro y motor, mapa, guardar, Misión 1), vuelve a
DominicanGames y comprueba “Jugados recientemente”. Usa SwiftShader (WebGL por software) y los ganchos de depuración
del motor (solo en builds de desarrollo/E2E). En una máquina nueva instala el navegador con
`npx playwright install chromium`. El recorrido completo tarda ~10 minutos.

## Producción

Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Resumen: `npm run build`, configurar variables (SMTP, secretos,
`APP_ORIGIN`), `npm run db:migrate`, `node apps/server/dist/index.js` detrás de HTTPS. La API sirve la web con
etiquetas SEO por ruta (título, descripción, Open Graph, canonical, JSON-LD), `robots.txt` y `sitemap.xml`.
No hace falta ningún proveedor de pagos: DG Monetization está desactivado.

## Controles (Santo Domingo Open World)

| Tecla | Acción |
|---|---|
| W A S D / flechas | moverse · conducir |
| Mouse · rueda | cámara · distancia |
| Shift | correr |
| Espacio | saltar · freno de mano |
| E | interactuar · subir a un vehículo |
| F | bajarse |
| H | bocina |
| V | cámara del vehículo |
| L | luces del vehículo (se encienden solas al anochecer) |
| R | cambiar emisora de radio (bachata, merengue, dembow, típico) |
| P | modo foto · Enter guarda la imagen en PNG |
| M | mapa (clic para marcar destino) |
| Esc | pausa (incluye “Volver a DominicanGames”) |

Detalles del último pase de pulido (gráficos, iluminación, audio y acciones): [docs/POLISH_PASS.md](docs/POLISH_PASS.md).

## Controles (El Tapón)

| Tecla | Acción |
|---|---|
| W / ↑ | subir de carril |
| S / ↓ | bajar de carril |
| Esc | pausa (volumen, reiniciar, menú) |
| R | reiniciar (en pausa o al perder) |
| M | silencio |
| Mouse | menús |

Solo PC (ventana de al menos 1280 × 720). Para regenerar los sprites, las imágenes de la galería y la tabla de
medidas: `npx tsx packages/tapon/scripts/export-assets.ts` (ver [docs/EL_TAPON_ASSETS.md](docs/EL_TAPON_ASSETS.md)).

## Documentación

* [Integración DominicanGames: auditoría, plan y migración](docs/DOMINICANGAMES_INTEGRATION.md)
* [Arquitectura y decisiones](docs/ARCHITECTURE.md)
* [Integrar un juego nuevo (módulos)](docs/GAME_INTEGRATION.md)
* [El Tapón: diseño, reglas, justicia y verificación](docs/EL_TAPON.md) · [Sprites y medidas](docs/EL_TAPON_ASSETS.md)
* [Marca y sistema de diseño](docs/BRAND.md)
* [DG Monetization (desactivado)](docs/MONETIZATION.md) · [Pagos heredados](docs/PAYMENTS.md)
* [Hoja de ruta](docs/ROADMAP.md)
* [Seguridad](docs/SECURITY.md) · [Despliegue](docs/DEPLOYMENT.md) · [Servicios externos](docs/EXTERNAL_SERVICES.md)
* [Rendimiento](docs/PERFORMANCE.md) · [Assets y licencias](docs/ASSETS.md) · [Riesgos](docs/RISKS.md)
* [QA y criterios de aceptación](docs/QA_CHECKLIST.md)

## Licencias

Código y contenido original: © 2026 DominicanGames (definir licencia). Datos derivados de OpenStreetMap: ODbL 1.0.
Tipografías: Inter, Unbounded y Anton (SIL OFL 1.1). Dependencias: ver `package-lock.json` (MIT / Apache-2.0 / OFL-1.1).
#   d o m i n i c a n g a m e s  
 