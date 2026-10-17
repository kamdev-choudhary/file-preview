import { describe as group, expect, it } from 'vitest';
import { listViewers } from '../src/core/registry.js';

/**
 * Every built-in viewer is reached through a dynamic `import()` so it stays out
 * of the entry chunk. The upside is lazy loading; the downside is that a broken
 * import path or a bad default export only shows up when a user opens that
 * exact file type. Loading each one here moves that failure into CI.
 */
group('built-in viewer modules', () => {
  const builtins = listViewers();

  it('registers the expected set', () => {
    expect(builtins.map((v) => v.id).sort()).toEqual([
      'archive',
      'doc',
      'docx',
      'font',
      'image',
      'markdown',
      'media',
      'pdf',
      'pptx',
      'sheet',
      'text',
    ]);
  });

  it.each(builtins.map((v) => [v.id, v] as const))(
    '%s resolves to a module with a callable default export',
    async (_id, viewer) => {
      const mod = await viewer.load();
      expect(mod.default).toBeTypeOf('function');
    },
  );

  it.each(builtins.map((v) => [v.id, v] as const))('%s has a usable label', (_id, viewer) => {
    expect(viewer.label).toBeTruthy();
  });
});
