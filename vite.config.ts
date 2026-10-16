import { defineConfig } from 'vite';

/** Demo-site build / dev server. `pnpm dev` serves index.html. */
export default defineConfig({
  root: '.',
  // The demo is published to GitHub Pages under /<repo>/, so assets must be
  // referenced relatively rather than from the server root.
  base: './',
  // Not an SPA: without this, Vite answers every unknown path with index.html,
  // so the demo's "404" card would receive 200 + HTML instead of a real 404.
  appType: 'mpa',
  build: { outDir: 'dist-demo', target: 'es2020' },
  server: { open: true },
});
