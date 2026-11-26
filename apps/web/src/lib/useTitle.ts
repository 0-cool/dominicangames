import { useSeo, type SeoOptions } from '../platform/seo.ts';

/** Page title (“<title> · DominicanGames”) plus description/canonical/Open Graph for in-app navigation. */
export function useTitle(title: string, opts: Omit<SeoOptions, 'title'> = {}) {
  useSeo({ title: title || undefined, ...opts });
}
