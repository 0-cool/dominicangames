import { useEffect } from 'react';
import { BRAND } from '@sd/shared';

/**
 * Client-side head management (titles, description, canonical, Open Graph) for in-app navigation.
 * The production server also injects these tags into the HTML for crawlers and social networks
 * (apps/server/src/platform/seo.ts), so both stay in sync.
 */
export interface SeoOptions {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
}

export const DEFAULT_DESCRIPTION = 'DominicanGames: la plataforma de videojuegos hecha en República Dominicana. Una cuenta gratis para descubrir y jugar todos nuestros mundos, empezando por Santo Domingo Open World.';

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]:not([hreflang])`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function fullTitle(title?: string) {
  return title ? `${title} · ${BRAND.name}` : `${BRAND.name} — Juegos hechos en República Dominicana`;
}

export function useSeo({ title, description, image, noindex }: SeoOptions) {
  useEffect(() => {
    const t = fullTitle(title);
    const url = `${location.origin}${location.pathname}`;
    document.title = t;
    setMeta('name', 'description', description ?? DEFAULT_DESCRIPTION);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setMeta('property', 'og:title', t);
    setMeta('property', 'og:description', description ?? DEFAULT_DESCRIPTION);
    setMeta('property', 'og:url', url);
    if (image) setMeta('property', 'og:image', image.startsWith('http') ? image : `${location.origin}${image}`);
    setLink('canonical', url);
  }, [title, description, image, noindex]);
}
