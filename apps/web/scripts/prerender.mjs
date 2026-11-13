// After the normal build: write one ready-made HTML file per page, plus the sitemap and robots.txt.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const ssrOut = `${root}dist-ssr`;

// build the page renderer for Node
await build({
  root,
  logLevel: 'warn',
  build: { ssr: 'src/prerender.tsx', outDir: ssrOut, emptyOutDir: true },
});
const { render, ROUTES, NOT_FOUND, ORIGIN, GUIDE_PAGES, canonical } = await import(
  `${ssrOut}/prerender.js`
);

const template = await readFile(`${dist}/index.html`, 'utf8');

// text going into HTML attributes
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// tells search engines this is a free web app for businesses (data only, never run)
function appData() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TradeReports',
    url: `${ORIGIN}/`,
    description:
      'Turns job software exports and spreadsheets into checked reports for UK tradespeople: money owed, income, VAT and work not invoiced.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any (runs in the browser)',
    browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    publisher: { '@type': 'Organization', name: 'DynamixAI', logo: `${ORIGIN}/icon-512.png` },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

// tells search engines a guide is an article, who wrote it and when (data only, never run)
function articleData(route) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: route.headline,
    description: route.description,
    dateModified: route.updated,
    url: ORIGIN + route.path,
    author: { '@type': 'Organization', name: 'DynamixAI', url: `${ORIGIN}/about` },
    publisher: { '@type': 'Organization', name: 'DynamixAI', logo: `${ORIGIN}/icon-512.png` },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function page(route, html) {
  const url = route === NOT_FOUND ? null : ORIGIN + canonical(route.path);
  const head = [
    `<title>${attr(route.title)}</title>`,
    `<meta name="description" content="${attr(route.description)}" />`,
    url ? `<link rel="canonical" href="${url}" />` : '<meta name="robots" content="noindex" />',
    `<meta property="og:title" content="${attr(route.title)}" />`,
    `<meta property="og:description" content="${attr(route.description)}" />`,
    `<meta property="og:type" content="${route.headline ? 'article' : 'website'}" />`,
    `<meta property="og:site_name" content="TradeReports" />`,
    url ? `<meta property="og:url" content="${url}" />` : '',
    `<meta property="og:image" content="${ORIGIN}/og-image.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="TradeReports: Focus on your trade, not spreadsheets." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    route.path === '/' ? appData() : '',
    route.headline ? articleData(route) : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  let out = template
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/s, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  if (!out.includes(html))
    throw new Error(`could not place the page into index.html for ${route.path}`);
  return out;
}

// "/" is index.html, "/help" is help.html (GitHub Pages serves it without the .html).
// The guides list is guides/index.html, so it can sit in the same folder as the guides.
const fileFor = (path) =>
  path === '/' ? 'index.html' : path === '/guides' ? 'guides/index.html' : `${path.slice(1)}.html`;
await mkdir(`${dist}/guides`, { recursive: true });
for (const route of [...ROUTES, ...GUIDE_PAGES]) {
  await writeFile(`${dist}/${fileFor(route.path)}`, page(route, render(route.path)));
}
// GitHub Pages shows this for any address that doesn't exist
await writeFile(`${dist}/404.html`, page(NOT_FOUND, render(NOT_FOUND.path)));

const today = new Date().toISOString().slice(0, 10);
// guides say when they last changed; other pages use the build date
const urls = [...ROUTES, ...GUIDE_PAGES]
  .filter((r) => r.index)
  .map(
    (r) =>
      `  <url><loc>${ORIGIN}${canonical(r.path)}</loc><lastmod>${r.updated ?? today}</lastmod></url>`,
  )
  .join('\n');
await writeFile(
  `${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
await writeFile(
  `${dist}/robots.txt`,
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);

await rm(ssrOut, { recursive: true, force: true });
console.log(
  `prerendered ${ROUTES.length + GUIDE_PAGES.length + 1} pages (${GUIDE_PAGES.length} guides), sitemap.xml and robots.txt`,
);
