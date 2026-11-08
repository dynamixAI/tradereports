import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// what the page is allowed to load; it can't send data anywhere
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

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

export default defineConfig({
  // GitHub Pages serves the site from /tradereports/
  base: '/tradereports/',
  plugins: [react(), securityPolicy()],
  build: {
    target: 'es2022',
    // the 3D part is about 540 kB and loads on its own after the page appears
    chunkSizeWarningLimit: 600,
  },
});
