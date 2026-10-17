/**
 * Vite's ambient types, for the demo only.
 *
 * The library itself must not depend on these: `src/` is consumed by whatever
 * bundler the user brings, so it cannot assume `import.meta.env` exists. The
 * demo is built by Vite and can.
 */
/// <reference types="vite/client" />

/** Injected by `define` in vite.config.ts so the nav can show the real version. */
declare const __APP_VERSION__: string;
