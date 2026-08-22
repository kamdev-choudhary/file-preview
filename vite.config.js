import { defineConfig } from "vite";

/** Demo-site build / dev server. `npm run dev` serves index.html. */
export default defineConfig({
  root: ".",
  build: { outDir: "dist-demo", target: "es2020" },
  server: { open: true },
});
