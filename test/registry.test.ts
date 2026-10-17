import { afterEach, describe as group, expect, it, vi } from 'vitest';
import { listViewers, registerViewer, resolveViewer } from '../src/core/registry.js';
import { toSource } from '../src/core/source.js';
import { Kind } from '../src/core/mime.js';

const cleanups: Array<() => void> = [];
const register = (def: Parameters<typeof registerViewer>[0]) => {
  cleanups.push(registerViewer(def));
};

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const stub = (id: string, score: number) => ({
  id,
  label: id,
  match: () => score,
  load: async () => ({ default: () => ({}) }),
});

group('built-in viewers', () => {
  it.each([
    ['photo.png', 'image'],
    ['report.pdf', 'pdf'],
    ['clip.mp4', 'media'],
    ['song.mp3', 'media'],
    ['data.csv', 'sheet'],
    ['book.xlsx', 'sheet'],
    ['contract.docx', 'docx'],
    ['legacy.doc', 'doc'],
    ['deck.pptx', 'pptx'],
    ['notes.md', 'markdown'],
    ['main.ts', 'text'],
    ['raw.json', 'text'],
    ['page.html', 'text'],
    ['bundle.zip', 'archive'],
    ['face.woff2', 'font'],
  ])('routes %s to the %s viewer', (name, expected) => {
    expect(resolveViewer(toSource(`/files/${name}`))?.id).toBe(expected);
  });

  it('declines formats no bundled engine can render', () => {
    for (const name of ['old.ppt', 'notes.rtf', 'text.odt', 'bundle.rar']) {
      expect(resolveViewer(toSource(`/files/${name}`))).toBeNull();
    }
  });

  it('declines an unknown type rather than guessing', () => {
    expect(resolveViewer(toSource('/files/mystery.qqq'))).toBeNull();
  });

  it('exposes a defensive copy of the registry', () => {
    const list = listViewers();
    list.length = 0;
    expect(listViewers().length).toBeGreaterThan(0);
  });
});

group('registerViewer', () => {
  it('rejects a malformed definition', () => {
    expect(() => registerViewer({} as never)).toThrow(TypeError);
    expect(() => registerViewer({ id: 'x' } as never)).toThrow(TypeError);
    expect(() => registerViewer({ id: 'x', match: () => 1 } as never)).toThrow(TypeError);
  });

  it('replaces a viewer registered under the same id', () => {
    const before = listViewers().length;
    register(stub('dupe', 1));
    register(stub('dupe', 1));
    expect(listViewers().length).toBe(before + 1);
  });

  it('returns an unregister function', () => {
    const before = listViewers().length;
    const off = registerViewer(stub('temp', 1));
    expect(listViewers().length).toBe(before + 1);
    off();
    expect(listViewers().length).toBe(before);
  });

  it('is safe to unregister twice', () => {
    const off = registerViewer(stub('temp2', 1));
    off();
    expect(() => off()).not.toThrow();
  });
});

group('resolveViewer scoring', () => {
  it('prefers the highest score', () => {
    register({ ...stub('low', 1), match: () => 1 });
    register({ ...stub('high', 1), match: () => 99 });
    expect(resolveViewer(toSource('/x.qqq'))?.id).toBe('high');
  });

  it('lets a later registration win a tie, so overrides beat built-ins', () => {
    register({
      id: 'custom-pdf',
      label: 'c',
      match: (s) => (s.kind === Kind.PDF ? 1 : 0),
      load: stub('a', 1).load,
    });
    expect(resolveViewer(toSource('/a.pdf'))?.id).toBe('custom-pdf');
  });

  it('skips excluded ids so a failed viewer can fall back', () => {
    const source = toSource('/a.pdf');
    expect(resolveViewer(source)?.id).toBe('pdf');
    expect(resolveViewer(source, new Set(['pdf']))).toBeNull();
  });

  it('treats a throwing match() as a decline instead of crashing', () => {
    register({
      id: 'broken',
      label: 'broken',
      match: () => {
        throw new Error('boom');
      },
      load: stub('a', 1).load,
    });
    expect(() => resolveViewer(toSource('/a.pdf'))).not.toThrow();
    expect(resolveViewer(toSource('/a.pdf'))?.id).toBe('pdf');
  });

  it('ignores a viewer that scores zero', () => {
    register(stub('never', 0));
    expect(resolveViewer(toSource('/x.qqq'))).toBeNull();
  });

  it('does not eagerly load the viewer implementation', () => {
    const load = vi.fn(async () => ({ default: () => ({}) }));
    register({ id: 'lazy', label: 'lazy', match: () => 50, load });
    resolveViewer(toSource('/x.qqq'));
    expect(load).not.toHaveBeenCalled();
  });
});
