import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Library build.
 *
 * ESM only, with code-splitting left ON: every heavy parser (pdf.js, SheetJS,
 * mammoth, JSZip, highlight.js) is reached through a dynamic `import()`, so it
 * lands in its own chunk and is only fetched by the browser when a file of that
 * type is actually previewed. Bundling them into one file would defeat that.
 */
export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.js'),
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'copy-types',
      closeBundle() {
        copyFileSync(
          resolve(import.meta.dirname, 'src/index.d.ts'),
          resolve(import.meta.dirname, 'dist/index.d.ts'),
        );
      },
    },
  ],
});
