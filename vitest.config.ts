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
      exclude: [
        // Integration surface, deliberately not unit tested. Each of these
        // needs a real engine (pdf.js, mammoth, JSZip, SheetJS) or a real
        // layout pass to mean anything, so mocking them would assert that the
        // mocks work rather than that the viewers do. `viewers/highlight.ts` is
        // the exception and IS covered: it is pure module plumbing.
        'src/viewers/archive.ts',
        'src/viewers/docx.ts',
        'src/viewers/font.ts',
        'src/viewers/image.ts',
        'src/viewers/markdown.ts',
        'src/viewers/media.ts',
        'src/viewers/pdf.ts',
        'src/viewers/pptx.ts',
        'src/viewers/sheet.ts',
        'src/viewers/text.ts',
        // Element shells: lifecycle, focus management and shadow DOM wiring.
        // These want a browser-based test run, not happy-dom.
        'src/elements/**',
        // A CSS string and a re-export barrel. Nothing to assert.
        'src/ui/styles.ts',
        'src/index.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 85 },
    },
  },
});
