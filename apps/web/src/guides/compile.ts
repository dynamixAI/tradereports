// Turns a guide written in Markdown into what the site shows.
// Runs at build time (from vite.config.ts), so the guide arrives as ready-made HTML.
import { Marked } from 'marked';

export interface GuideMeta {
  title: string;
  description: string;
  // YYYY-MM-DD; shown as "Updated …" and used in the sitemap
  updated: string;
}

export interface CompiledGuide extends GuideMeta {
  slug: string;
  html: string;
  minutes: number;
}

// the bit between the --- lines at the top: "key: value" on each line
export function readFrontMatter(source: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: source.slice(match[0].length) };
}

// "Late payment: what you can charge" -> "late-payment-what-you-can-charge"
export function anchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const marked = new Marked({
  gfm: true,
  renderer: {
    // headings get an id so they can be linked to
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${anchor(text)}">${text}</h${depth}>\n`;
    },
    // other sites open in a new tab and aren't told where the reader came from
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      const t = title ? ` title="${title}"` : '';
      return external
        ? `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
        : `<a href="${href}"${t}>${text}</a>`;
    },
  },
});

export function compileGuide(source: string, slug: string): CompiledGuide {
  const { meta, body } = readFrontMatter(source);
  for (const key of ['title', 'description', 'updated'] as const) {
    if (!meta[key]) throw new Error(`Guide "${slug}" is missing "${key}" at the top`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated ?? '')) {
    throw new Error(`Guide "${slug}": "updated" must look like 2026-11-13`);
  }
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title ?? '',
    description: meta.description ?? '',
    updated: meta.updated ?? '',
    html: marked.parse(body, { async: false }),
    // about 220 words a minute, never less than 1
    minutes: Math.max(1, Math.round(words / 220)),
  };
}
