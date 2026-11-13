import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCsp } from './src/csp';
import { compileGuide } from './src/guides/compile';
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

// guides are written in Markdown; this turns each one into HTML while building
function guides(): Plugin {
  return {
    name: 'guides',
    transform(code, id) {
      if (!id.endsWith('.md')) return null;
      const slug = id.split('/').pop()?.replace(/\.md$/, '') ?? '';
      return { code: `export default ${JSON.stringify(compileGuide(code, slug))};`, map: null };
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
