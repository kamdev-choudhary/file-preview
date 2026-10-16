import { afterEach, describe as group, expect, it } from 'vitest';
import { configure, getConfig } from '../src/core/config.js';

const initial = { ...getConfig(), loaders: { ...getConfig().loaders } };

afterEach(() => {
  configure(initial);
});

group('configure', () => {
  it('ships safe defaults', () => {
    const c = getConfig();
    expect(c.maxBytes).toBe(100 * 1024 * 1024);
    expect(c.maxTextBytes).toBe(5 * 1024 * 1024);
    expect(c.credentials).toBe('same-origin');
    expect(c.officeViewer).toBe(true);
  });

  it('does not bundle a SheetJS loader by default', () => {
    expect(getConfig().loaders.xlsx).toBeNull();
  });

  it('patches only the keys given', () => {
    configure({ maxBytes: 1 });
    expect(getConfig().maxBytes).toBe(1);
    expect(getConfig().maxTextBytes).toBe(initial.maxTextBytes);
  });

  it('merges loaders rather than replacing the whole object', () => {
    const xlsx = async () => ({});
    configure({ loaders: { xlsx } });
    expect(getConfig().loaders.xlsx).toBe(xlsx);
    configure({ maxBytes: 2 });
    expect(getConfig().loaders.xlsx).toBe(xlsx);
  });

  it('returns a snapshot, not the live object', () => {
    const snapshot = configure({ maxBytes: 3 });
    configure({ maxBytes: 4 });
    expect(snapshot.maxBytes).toBe(3);
    expect(getConfig().maxBytes).toBe(4);
  });

  it('tolerates an empty patch', () => {
    expect(() => configure()).not.toThrow();
  });
});
