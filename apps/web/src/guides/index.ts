// Every guide in this folder, ready to show. The .md files are turned into HTML
// by the "guides" plugin in vite.config.ts.
import type { Route } from '../routes';
import type { CompiledGuide } from './compile';

const files = import.meta.glob<CompiledGuide>('./*.md', { eager: true, import: 'default' });

// newest first
export const GUIDES: CompiledGuide[] = Object.values(files).sort((a, b) =>
  b.updated.localeCompare(a.updated),
);

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
