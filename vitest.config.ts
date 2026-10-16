import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The library is a pair of custom elements; even the "pure" core modules
    // touch Blob, File and URL.createObjectURL. happy-dom is an order of
    // magnitude cheaper to boot than a real browser and covers all of it.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The viewers and element shells are integration surface: they need a
      // real engine (pdf.js, mammoth) or a layout pass to mean anything, so
      // they are excluded from the line target rather than faked.
      exclude: ['src/viewers/**', 'src/ui/styles.ts', 'src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
