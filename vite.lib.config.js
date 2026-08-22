import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Library build.
 *
 * ESM only, with code-splitting left ON: every heavy parser (pdf.js, SheetJS,
 * mammoth, JSZip, highlight.js) is reached through a dynamic `import()`, so it
 * lands in its own chunk and is only fetched by the browser when a file of that
 * type is actually previewed. Bundling them into one file would defeat that.
 */
export default defineConfig({
  // The demo's public/ folder must not be copied into the published package.
  publicDir: false,
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    // Vite 8 bundles with rolldown/oxc; 'esbuild' would need a separate install.
    minify: "oxc",
    // Off deliberately: the maps are dominated by pdf.js and mammoth internals
    // and would quadruple the tarball for something consumers rarely step into.
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.js"),
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [
    {
      name: "copy-types",
      writeBundle() {
        const dir = resolve(import.meta.dirname, "dist");
        mkdirSync(dir, { recursive: true });
        copyFileSync(
          resolve(import.meta.dirname, "src/index.d.ts"),
          resolve(dir, "index.d.ts"),
        );
      },
    },
  ],
});
