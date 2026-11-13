import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCsp } from './src/csp';
import { compileGuide, isLive, todayInLondon } from './src/guides/compile';
import { SITE } from './src/site';

// what the page is allowed to load and contact; see src/csp.ts
const CSP = buildCsp(SITE.counter);

// add the policy to the built page only; dev needs inline scripts
function securityPolicy(): Plugin {
  return {
    name: 'security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

// guides are written in Markdown; this turns each one into HTML while building.
// A guide with a later publish date is left out of the built site until that day
// (the daily deploy picks it up). On your own computer (npm run dev) you see them all.
function guides(): Plugin {
  let building = false;
  // GUIDES_TODAY=2026-12-01 npm run build shows the site as it will be on that day
  const today = process.env.GUIDES_TODAY ?? todayInLondon();
  return {
    name: 'guides',
    configResolved(config) {
      building = config.command === 'build';
    },
    transform(code, id) {
      if (!id.endsWith('.md')) return null;
      const slug = id.split('/').pop()?.replace(/\.md$/, '') ?? '';
      const guide = compileGuide(code, slug);
      const out = building && !isLive(guide.published, today) ? null : guide;
      return { code: `export default ${JSON.stringify(out)};`, map: null };
    },
  };
}

export default defineConfig({
  // served from the root of tradereports.co.uk
  base: '/',
  plugins: [react(), securityPolicy(), guides()],
  build: {
    target: 'es2022',
    // the 3D part is about 540 kB and loads on its own after the page appears
    chunkSizeWarningLimit: 600,
  },
});
