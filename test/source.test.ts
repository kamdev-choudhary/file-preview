import { beforeEach, describe as group, expect, it, vi } from 'vitest';
import { Source, toSource, toSources } from '../src/core/source.js';
import { PreviewError } from '../src/core/errors.js';
import { Kind } from '../src/core/mime.js';

group('Source construction', () => {
  it('derives the name from the URL when none is given', () => {
    const s = new Source({ url: 'https://example.com/docs/report.pdf' });
    expect(s.name).toBe('report.pdf');
    expect(s.kind).toBe(Kind.PDF);
    expect(s.ext).toBe('pdf');
  });

  it('prefers an explicit name over the URL', () => {
    const s = new Source({ url: 'https://api.example.com/files/8fa21c', name: 'Q3.xlsx' });
    expect(s.name).toBe('Q3.xlsx');
    expect(s.kind).toBe(Kind.SHEET);
  });

  it('falls back to "file" with neither name nor URL', () => {
    expect(new Source({ blob: new Blob(['x']) }).name).toBe('file');
  });

  it('takes size from the blob when not declared', () => {
    expect(new Source({ blob: new Blob(['hello']) }).size).toBe(5);
  });

  it('formats a size label and tolerates an unknown size', () => {
    expect(new Source({ url: '/a.pdf', size: 1500 }).sizeLabel).toBe('1.5 KB');
    expect(new Source({ url: '/a.pdf' }).sizeLabel).toBe('');
  });

  it('never touches the network during construction', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    new Source({ url: 'https://example.com/huge.pdf' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

group('Source.isRemote', () => {
  it('is false for local bytes', () => {
    expect(new Source({ blob: new Blob(['x']) }).isRemote).toBe(false);
  });

  it('is false for a data URI', () => {
    expect(new Source({ url: 'data:text/plain,hello' }).isRemote).toBe(false);
  });

  it('is false for a same-origin path', () => {
    expect(new Source({ url: '/local/a.pdf' }).isRemote).toBe(false);
  });

  it('is true for a cross-origin URL', () => {
    expect(new Source({ url: 'https://other.example.com/a.pdf' }).isRemote).toBe(true);
  });
});

group('Source.displayUrl and objectUrl', () => {
  it('prefers the remote URL so media can stream', () => {
    const url = 'https://example.com/video.mp4';
    expect(new Source({ url }).displayUrl).toBe(url);
  });

  it('materialises a blob: URL only for local bytes', () => {
    const s = new Source({ blob: new Blob(['x']) });
    expect(s.displayUrl).toMatch(/^blob:/);
  });

  it('reuses one object URL across calls', () => {
    const s = new Source({ blob: new Blob(['x']) });
    expect(s.objectUrl()).toBe(s.objectUrl());
  });

  it('is empty with no url and no blob', () => {
    expect(new Source({}).displayUrl).toBe('');
  });

  it('revokes the object URL on destroy, and destroy is idempotent', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const s = new Source({ blob: new Blob(['x']) });
    s.objectUrl();
    s.destroy();
    s.destroy();
    expect(revoke).toHaveBeenCalledTimes(1);
    revoke.mockRestore();
  });

  it('does not revoke anything when no object URL was ever made', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    new Source({ url: '/a.pdf' }).destroy();
    expect(revoke).not.toHaveBeenCalled();
    revoke.mockRestore();
  });
});

group('Source byte access', () => {
  it('returns local bytes without fetching', async () => {
    const blob = new Blob(['hello']);
    const s = new Source({ blob });
    expect(await s.toBlob()).toBe(blob);
    expect(await s.text()).toBe('hello');
    expect(await s.arrayBuffer()).toBeInstanceOf(ArrayBuffer);
  });

  it('refuses to download when there is nothing to download', async () => {
    await expect(new Source({}).toBlob()).rejects.toMatchObject({ code: 'EMPTY' });
  });

  it('downloads once and caches the result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('body', { headers: { 'content-type': 'text/plain' } }),
    );
    const s = new Source({ url: 'https://example.com/a.txt' });
    await Promise.all([s.toBlob(), s.toBlob()]);
    await s.toBlob();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('does not cache a failure, so retry genuinely retries', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok'));
    const s = new Source({ url: 'https://example.com/a.txt' });
    await expect(s.toBlob()).rejects.toMatchObject({ code: 'CORS' });
    await expect(s.toBlob()).resolves.toBeInstanceOf(Blob);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('folds the server filename in when the URL gave no extension', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('%PDF-1.7', {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="real.pdf"',
        },
      }),
    );
    const s = new Source({ url: 'https://example.com/files/8fa21c' });
    await s.toBlob();
    expect(s.name).toBe('real.pdf');
    expect(s.kind).toBe(Kind.PDF);
    fetchSpy.mockRestore();
  });

  it('re-runs detection against real bytes in refine()', async () => {
    const pdfBytes = new Uint8Array(64);
    pdfBytes.set([0x25, 0x50, 0x44, 0x46]);
    const s = new Source({ blob: new Blob([pdfBytes]), name: 'mislabelled.txt' });
    expect(s.kind).toBe(Kind.TEXT);
    await s.refine();
    expect(s.kind).toBe(Kind.PDF);
  });
});

group('toSource', () => {
  it('returns an existing Source untouched', () => {
    const s = new Source({ url: '/a.pdf' });
    expect(toSource(s)).toBe(s);
  });

  it('accepts a URL string', () => {
    expect(toSource('https://example.com/a.png').kind).toBe(Kind.IMAGE);
  });

  it('keeps a File name and type', () => {
    const f = new File(['x'], 'photo.png', { type: 'image/png' });
    const s = toSource(f);
    expect(s.name).toBe('photo.png');
    expect(s.kind).toBe(Kind.IMAGE);
  });

  it('names a bare Blob "file" unless told otherwise', () => {
    expect(toSource(new Blob(['x'])).name).toBe('file');
    expect(toSource(new Blob(['x']), { name: 'given.txt' }).name).toBe('given.txt');
  });

  it('wraps an ArrayBuffer and a typed array', () => {
    expect(toSource(new ArrayBuffer(8), { name: 'a.bin' }).size).toBe(8);
    expect(toSource(new Uint8Array(4), { name: 'a.bin' }).size).toBe(4);
  });

  it('reads a descriptor object', () => {
    const s = toSource({
      url: 'https://api.example.com/files/1',
      name: 'Q3 report.xlsx',
      headers: { Authorization: 'Bearer t' },
      credentials: 'include',
    });
    expect(s.kind).toBe(Kind.SHEET);
    expect(s.headers).toEqual({ Authorization: 'Bearer t' });
    expect(s.credentials).toBe('include');
  });

  it('accepts the src and href aliases', () => {
    expect(toSource({ src: '/a.pdf' }).kind).toBe(Kind.PDF);
    expect(toSource({ href: '/a.pdf' }).kind).toBe(Kind.PDF);
  });

  it('unwraps a descriptor carrying a payload', () => {
    const s = toSource({ data: new Blob(['x']), name: 'inline.txt', type: 'text/plain' });
    expect(s.name).toBe('inline.txt');
    expect(s.blob).toBeInstanceOf(Blob);
  });

  it('lets a descriptor override the shared defaults', () => {
    const s = toSource({ url: '/a.pdf', maxBytes: 5 }, { maxBytes: 100 });
    expect(s.maxBytes).toBe(5);
  });

  it('applies shared defaults when the descriptor is silent', () => {
    const s = toSource({ url: '/a.pdf' }, { credentials: 'include' });
    expect(s.credentials).toBe('include');
  });

  it('rejects nothing at all with EMPTY', () => {
    for (const bad of [null, undefined, '']) {
      expect(() => toSource(bad)).toThrow(PreviewError);
      try {
        toSource(bad);
      } catch (e) {
        expect((e as PreviewError).code).toBe('EMPTY');
      }
    }
  });

  it('rejects input it cannot read with UNSUPPORTED', () => {
    for (const bad of [42, true, Symbol('x'), {}, { name: 'no-url.txt' }]) {
      try {
        toSource(bad);
        throw new Error(`expected toSource to reject ${String(bad)}`);
      } catch (e) {
        expect((e as PreviewError).code).toBe('UNSUPPORTED');
      }
    }
  });
});

group('toSources', () => {
  it('wraps a single input into a one-element array', () => {
    expect(toSources('/a.pdf')).toHaveLength(1);
  });

  it('keeps index order for gallery navigation', () => {
    const out = toSources(['/a.png', '/b.pdf', '/c.mp4']);
    expect(out.map((s) => s.kind)).toEqual([Kind.IMAGE, Kind.PDF, Kind.VIDEO]);
  });

  it('passes defaults down to every item', () => {
    const out = toSources(['/a.pdf', '/b.pdf'], { credentials: 'include' });
    expect(out.every((s) => s.credentials === 'include')).toBe(true);
  });
});
