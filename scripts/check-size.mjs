/**
 * Budget check for the entry chunk.
 *
 * The entry is what every consumer downloads, whatever file type they preview;
 * the heavy parsers live in lazily-imported chunks and are deliberately out of
 * scope here. A regression in this number means something that should have been
 * lazy got pulled into the critical path, so CI fails on it rather than letting
 * it land quietly.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'dist/index.js');

/** Gzipped bytes. Keep in sync with the figure quoted in the README. */
const LIMIT_GZIP = 20 * 1024;

let raw;
try {
  raw = readFileSync(entry);
} catch {
  console.error('dist/index.js not found — run `pnpm build` first.');
  process.exit(1);
}

const gzip = gzipSync(raw, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

console.log(`entry  ${kb(statSync(entry).size)} raw  ·  ${kb(gzip)} gzipped`);

if (gzip > LIMIT_GZIP) {
  console.error(
    `\nEntry chunk is ${kb(gzip)} gzipped, over the ${kb(LIMIT_GZIP)} budget.\n` +
      'Something that should be lazily imported is probably in the entry now.',
  );
  process.exit(1);
}
console.log(`within the ${kb(LIMIT_GZIP)} budget.`);
