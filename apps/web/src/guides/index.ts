// Every guide in this folder, ready to show. The .md files are turned into HTML
// by the "guides" plugin in vite.config.ts.
import type { Route } from '../routes';
import { todayInLondon, type CompiledGuide } from './compile';

const files = import.meta.glob<CompiledGuide | null>('./*.md', {
  eager: true,
  import: 'default',
});

// newest first; guides not due yet arrive as null in the built site
export const GUIDES: CompiledGuide[] = Object.values(files)
  .filter((g): g is CompiledGuide => g !== null)
  .sort((a, b) => b.published.localeCompare(a.published));

// only true on your own computer, where upcoming guides are shown for checking
export function scheduled(g: CompiledGuide): boolean {
  return g.published > todayInLondon();
}

export function findGuide(path: string): CompiledGuide | undefined {
  const slug = /^\/guides\/([a-z0-9-]+)$/.exec(path)?.[1];
  return GUIDES.find((g) => g.slug === slug);
}

// what the browser tab, Google and the sitemap get for a guide
export function guideRoute(g: CompiledGuide): Route {
  return {
    path: `/guides/${g.slug}`,
    title: `${g.title} | TradeReports`,
    description: g.description,
    index: true,
  };
}

// "2026-11-13" -> "13 November 2026"
export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
