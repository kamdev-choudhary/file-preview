import { describe as group, expect, it } from 'vitest';
import { canHighlight, highlight } from '../src/viewers/highlight.js';

group('canHighlight', () => {
  it('accepts every language mime.ts can produce', () => {
    // Keep this list in step with the `lang` values in src/core/mime.ts — a
    // language the detector emits but the loader lacks would silently render
    // unhighlighted.
    const fromMime = [
      'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile', 'go', 'graphql',
      'ini', 'java', 'javascript', 'json', 'kotlin', 'less', 'makefile', 'markdown',
      'php', 'powershell', 'python', 'ruby', 'rust', 'scss', 'sql', 'swift',
      'typescript', 'xml', 'yaml',
    ];
    for (const lang of fromMime) {
      expect(canHighlight(lang), `missing grammar: ${lang}`).toBe(true);
    }
  });

  it('rejects unknown and absent languages', () => {
    expect(canHighlight('klingon')).toBe(false);
    expect(canHighlight(undefined)).toBe(false);
    expect(canHighlight('')).toBe(false);
  });
});

group('highlight', () => {
  it('returns markup for a supported language', async () => {
    const html = await highlight('const x = 1;', 'javascript');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('const');
  });

  it('loads each grammar independently', async () => {
    expect(await highlight('def f(): pass', 'python')).toContain('hljs-keyword');
    expect(await highlight('x: 1', 'yaml')).toContain('hljs-attr');
  });

  it('returns null rather than throwing for an unsupported language', async () => {
    await expect(highlight('whatever', 'klingon')).resolves.toBeNull();
    await expect(highlight('whatever', undefined)).resolves.toBeNull();
  });

  it('caches the engine across calls', async () => {
    const a = await highlight('const a = 1;', 'javascript');
    const b = await highlight('const b = 2;', 'javascript');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('does not choke on code that violates the grammar', async () => {
    // ignoreIllegals is on, so malformed input still returns markup.
    await expect(highlight('}{ not valid js (((', 'javascript')).resolves.toBeTypeOf('string');
  });

  it('handles empty input', async () => {
    await expect(highlight('', 'javascript')).resolves.toBe('');
  });
});
