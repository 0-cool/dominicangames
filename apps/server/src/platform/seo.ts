import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRAND } from '@sd/shared';
import type { Ctx } from '../app.ts';
import { isListed, type GameRow } from './catalog.ts';

/**
 * SEO & discoverability: robots.txt, sitemap.xml, and per-route <head> tags injected into the SPA's index.html in
 * production (social networks do not run JavaScript, so titles, descriptions, Open Graph images, canonical URLs
 * and JSON-LD must be in the HTML). Spanish first; hreflang is ready for English pages under /en.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** JSON for <script type="application/ld+json"> (no HTML-breaking sequences). */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

const DEFAULT_DESCRIPTION = 'DominicanGames: la plataforma de videojuegos hecha en República Dominicana. Una cuenta gratis para descubrir y jugar todos nuestros mundos, empezando por Santo Domingo Open World.';
const DEFAULT_IMAGE = '/img/brand/og-dominicangames.jpg';

/** Routes worth indexing (everything else gets noindex). */
const PUBLIC_PAGES: { path: string; title: string; description: string; priority: string }[] = [
  { path: '/', title: `${BRAND.name} — Juegos hechos en República Dominicana`, description: DEFAULT_DESCRIPTION, priority: '1.0' },
  { path: '/juegos', title: `Juegos · ${BRAND.name}`, description: 'Catálogo de DominicanGames: juegos disponibles gratis en tu navegador y próximos lanzamientos creados en República Dominicana.', priority: '0.9' },
  { path: '/comunidad', title: `Comunidad · ${BRAND.name}`, description: 'Rankings, logros y anuncios de la comunidad de jugadores de DominicanGames.', priority: '0.6' },
  { path: '/soporte', title: `Soporte · ${BRAND.name}`, description: 'Ayuda con tu cuenta de DominicanGames y con nuestros juegos.', priority: '0.3' },
  { path: '/terminos', title: `Términos y condiciones · ${BRAND.name}`, description: 'Términos y condiciones de la plataforma DominicanGames.', priority: '0.2' },
  { path: '/privacidad', title: `Política de privacidad · ${BRAND.name}`, description: 'Cómo DominicanGames trata tus datos personales.', priority: '0.2' },
  { path: '/creditos', title: `Créditos y licencias · ${BRAND.name}`, description: 'Créditos, licencias y fuentes de datos de los juegos de DominicanGames.', priority: '0.2' },
];
const NOINDEX_PREFIXES = ['/panel', '/cuenta', '/perfil', '/ajustes', '/admin', '/juego', '/jugar', '/pago', '/verificar', '/verifica-tu-correo', '/restablecer', '/registro', '/entrar', '/recuperar'];

interface HeadTags {
  title: string;
  description: string;
  path: string;
  image: string;
  type: 'website' | 'video.game' | 'article';
  noindex: boolean;
  jsonLd: unknown[];
}

function organization(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: `${origin}/`,
    logo: `${origin}/img/brand/dominicangames-mark-512.png`,
    slogan: BRAND.tagline,
    description: DEFAULT_DESCRIPTION,
    address: { '@type': 'PostalAddress', addressCountry: 'DO' },
  };
}

function videoGame(origin: string, g: GameRow) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: g.title,
    url: `${origin}/juegos/${g.id}`,
    description: g.description,
    image: g.heroImage || g.coverImage ? `${origin}${g.heroImage ?? g.coverImage}` : undefined,
    genre: g.categories,
    gamePlatform: g.platforms.length ? g.platforms : undefined,
    applicationCategory: 'Game',
    operatingSystem: 'Web browser',
    inLanguage: 'es',
    author: { '@type': 'Organization', name: g.developer },
    publisher: { '@type': 'Organization', name: g.publisher },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'DOP', availability: 'https://schema.org/InStock', url: `${origin}/juegos/${g.id}` },
  };
}

export async function headFor(ctx: Ctx, rawPath: string): Promise<HeadTags> {
  const origin = ctx.cfg.APP_ORIGIN.replace(/\/$/, '');
  const path = (rawPath.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
  const base: HeadTags = { title: PUBLIC_PAGES[0].title, description: DEFAULT_DESCRIPTION, path, image: DEFAULT_IMAGE, type: 'website', noindex: false, jsonLd: [] };
  if (path === '/') return { ...base, jsonLd: [organization(origin), { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND.name, url: `${origin}/`, inLanguage: 'es' }] };
  const page = PUBLIC_PAGES.find((p) => p.path === path);
  if (page) return { ...base, title: page.title, description: page.description };
  const m = path.match(/^\/juegos\/([a-z0-9-]{3,64})$/);
  if (m) {
    const g = await ctx.catalog.get(m[1]);
    if (g && isListed(g, null)) {
      const soon = g.status === 'coming_soon';
      return {
        ...base,
        title: `${g.title}${soon ? ' (Próximamente)' : ''} · ${BRAND.name}`,
        description: (g.description || g.tagline).slice(0, 300),
        image: g.heroImage ?? g.coverImage ?? DEFAULT_IMAGE,
        type: soon ? 'website' : 'video.game',
        jsonLd: g.status === 'published' ? [videoGame(origin, g)] : [],
      };
    }
    return { ...base, title: `Juego no encontrado · ${BRAND.name}`, noindex: true };
  }
  // a game's own play page (e.g. /juegos/el-tapon/jugar): shareable title and image, but not indexed
  const play = path.match(/^\/juegos\/([a-z0-9-]{3,64})\/jugar$/);
  if (play) {
    const g = await ctx.catalog.get(play[1]);
    if (g && g.launchPath === path && isListed(g, null)) return { ...base, title: `Jugar ${g.title} · ${BRAND.name}`, description: (g.description || g.tagline).slice(0, 300), image: g.heroImage ?? g.coverImage ?? DEFAULT_IMAGE, noindex: true };
  }
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return { ...base, noindex: true };
  return { ...base, title: `Página no encontrada · ${BRAND.name}`, noindex: true };
}

export function renderHead(origin: string, h: HeadTags): string {
  const url = `${origin.replace(/\/$/, '')}${h.path === '/' ? '/' : h.path}`;
  const img = /^https?:/.test(h.image) ? h.image : `${origin.replace(/\/$/, '')}${h.image}`;
  return [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" />`,
    h.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<link rel="canonical" href="${esc(url)}" />`,
    `<link rel="alternate" hreflang="es" href="${esc(url)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${BRAND.name}" />`,
    `<meta property="og:locale" content="es_DO" />`,
    `<meta property="og:type" content="${h.type}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    ...(h.image === DEFAULT_IMAGE ? ['<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />'] : []),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(h.title)}" />`,
    `<meta name="twitter:description" content="${esc(h.description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    ...h.jsonLd.map((o) => `<script type="application/ld+json">${ld(o)}</script>`),
  ].join('\n    ');
}

const SEO_BLOCK = /<!--dg:seo:start-->[\s\S]*?<!--dg:seo:end-->/;

export function seoRoutes(app: FastifyInstance, ctx: Ctx) {
  const origin = () => ctx.cfg.APP_ORIGIN.replace(/\/$/, '');

  app.get('/robots.txt', async (_req, reply) => {
    reply.type('text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=3600');
    const disallow = ['/api/', '/sandbox-pay/', ...NOINDEX_PREFIXES].map((p) => `Disallow: ${p}`).join('\n');
    return `# ${BRAND.name} — ${BRAND.tagline}\nUser-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${origin()}/sitemap.xml\n`;
  });

  app.get('/sitemap.xml', async (_req, reply) => {
    const games = (await ctx.catalog.all()).filter((g) => isListed(g, null));
    const urls = [
      ...PUBLIC_PAGES.map((p) => ({ loc: `${origin()}${p.path}`, lastmod: null as string | null, priority: p.priority })),
      ...games.map((g) => ({ loc: `${origin()}/juegos/${g.id}`, lastmod: g.updatedAt.toISOString().slice(0, 10), priority: g.status === 'published' ? '0.9' : '0.5' })),
    ];
    reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls
      .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority><xhtml:link rel="alternate" hreflang="es" href="${esc(u.loc)}"/></url>`)
      .join('\n')}\n</urlset>\n`;
  });
}

/** Production SPA fallback: index.html with the route's head tags (dev uses Vite + the client-side useSeo hook). */
export function createIndexRenderer(ctx: Ctx, distDir: string) {
  const file = resolve(distDir, 'index.html');
  let template: string | null = null;
  return async (url: string): Promise<string | null> => {
    if (template === null) template = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!template) return null;
    const head = renderHead(ctx.cfg.APP_ORIGIN, await headFor(ctx, url));
    return SEO_BLOCK.test(template) ? template.replace(SEO_BLOCK, `<!--dg:seo:start-->\n    ${head}\n    <!--dg:seo:end-->`) : template.replace('</head>', `    ${head}\n  </head>`);
  };
}
