import { describe as group, expect, it } from 'vitest';
import {
  describe,
  extensionOf,
  filenameFromContentDisposition,
  filenameFromUrl,
  formatBytes,
  Kind,
  kindFromMime,
  looksLikeText,
  shouldPreSniff,
  sniff,
} from '../src/core/mime.js';

/** Build a byte array from a magic-number prefix, padded to a sniffable length. */
const magic = (...head: number[]) => {
  const bytes = new Uint8Array(64);
  bytes.set(head);
  return bytes;
};

const ascii = (s: string, pad = 64) => {
  const bytes = new Uint8Array(pad);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};

group('extensionOf', () => {
  it('lowercases and strips query and hash', () => {
    expect(extensionOf('/files/Report.PDF?token=abc#page=2')).toBe('pdf');
  });

  it('returns empty for a bare filename', () => {
    expect(extensionOf('Makefile')).toBe('');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('uses the last dot', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('survives a missing argument', () => {
    expect(extensionOf()).toBe('');
  });
});

group('filenameFromUrl', () => {
  it('takes the last path segment', () => {
    expect(filenameFromUrl('https://example.com/a/b/report.pdf')).toBe('report.pdf');
  });

  it('decodes percent-encoding', () => {
    expect(filenameFromUrl('https://example.com/q3%20report.xlsx')).toBe('q3 report.xlsx');
  });

  it('falls back when the URL has no path', () => {
    expect(filenameFromUrl('https://example.com/')).toBe('file');
  });

  it('ignores the query string', () => {
    expect(filenameFromUrl('https://example.com/a.pdf?sig=xyz')).toBe('a.pdf');
  });

  it('handles an unparseable URL', () => {
    expect(filenameFromUrl(':::/not/a/url/x.png')).toBe('x.png');
  });
});

group('filenameFromContentDisposition', () => {
  it('reads the quoted plain form', () => {
    expect(filenameFromContentDisposition('attachment; filename="Q3 report.xlsx"')).toBe(
      'Q3 report.xlsx',
    );
  });

  it('reads the unquoted plain form', () => {
    expect(filenameFromContentDisposition('attachment; filename=report.pdf')).toBe('report.pdf');
  });

  it('prefers the RFC 5987 encoded form and decodes it', () => {
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf"),
    ).toBe('résumé.pdf');
  });

  it('returns empty for a header with no filename', () => {
    expect(filenameFromContentDisposition('inline')).toBe('');
    expect(filenameFromContentDisposition(null)).toBe('');
  });
});

group('sniff', () => {
  it('identifies PDF', () => {
    expect(sniff(magic(0x25, 0x50, 0x44, 0x46))).toMatchObject({ kind: Kind.PDF, ext: 'pdf' });
  });

  it('identifies PNG', () => {
    expect(sniff(magic(0x89, 0x50, 0x4e, 0x47))).toMatchObject({ kind: Kind.IMAGE, ext: 'png' });
  });

  it('identifies JPEG', () => {
    expect(sniff(magic(0xff, 0xd8, 0xff))).toMatchObject({ ext: 'jpg' });
  });

  it('separates WEBP from WAV inside a RIFF container', () => {
    const webp = ascii('RIFF');
    webp.set(ascii('WEBP', 4), 8);
    expect(sniff(webp)).toMatchObject({ kind: Kind.IMAGE, ext: 'webp' });

    const wav = ascii('RIFF');
    wav.set(ascii('WAVE', 4), 8);
    expect(sniff(wav)).toMatchObject({ kind: Kind.AUDIO, ext: 'wav' });
  });

  it('reads the ISO-BMFF brand to tell AVIF from MP4', () => {
    const avif = new Uint8Array(64);
    avif.set(ascii('ftyp', 4), 4);
    avif.set(ascii('avif', 4), 8);
    expect(sniff(avif)).toMatchObject({ kind: Kind.IMAGE, ext: 'avif' });

    const mp4 = new Uint8Array(64);
    mp4.set(ascii('ftyp', 4), 4);
    mp4.set(ascii('isom', 4), 8);
    expect(sniff(mp4)).toMatchObject({ kind: Kind.VIDEO, ext: 'mp4' });
  });

  it('flags a ZIP container so OOXML extensions survive', () => {
    expect(sniff(magic(0x50, 0x4b, 0x03, 0x04))).toMatchObject({ zip: true, kind: Kind.ARCHIVE });
  });

  it('returns null for too few bytes and for unrecognised data', () => {
    expect(sniff(new Uint8Array([1, 2]))).toBeNull();
    expect(sniff(magic(0x61, 0x62, 0x63, 0x64))).toBeNull();
  });
});

group('looksLikeText', () => {
  it('accepts plain ASCII', () => {
    expect(looksLikeText(ascii('hello world\n', 12))).toBe(true);
  });

  it('rejects anything containing a NUL byte', () => {
    expect(looksLikeText(new Uint8Array([0x61, 0x00, 0x62]))).toBe(false);
  });

  it('rejects a run of control characters', () => {
    expect(looksLikeText(new Uint8Array(64).fill(0x01))).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(looksLikeText(new Uint8Array(0))).toBe(false);
  });
});

group('describe', () => {
  it('maps a known extension to kind, mime and language', () => {
    expect(describe({ name: 'main.ts' })).toMatchObject({
      ext: 'ts',
      kind: Kind.CODE,
      lang: 'typescript',
    });
  });

  it('lets magic bytes override a lying extension', () => {
    const d = describe({ name: 'notes.txt', bytes: magic(0x25, 0x50, 0x44, 0x46) });
    expect(d.kind).toBe(Kind.PDF);
    expect(d.mime).toBe('application/pdf');
  });

  it('keeps the OOXML extension when the bytes are merely a ZIP', () => {
    const d = describe({ name: 'contract.docx', bytes: magic(0x50, 0x4b, 0x03, 0x04) });
    expect(d.kind).toBe(Kind.DOC);
  });

  it('calls an unknown-extension ZIP an archive', () => {
    const d = describe({ name: 'bundle.xyz', bytes: magic(0x50, 0x4b, 0x03, 0x04) });
    expect(d.kind).toBe(Kind.ARCHIVE);
  });

  it('ignores a generic declared mime', () => {
    expect(describe({ name: 'blob', mime: 'application/octet-stream' }).kind).toBe(Kind.UNKNOWN);
  });

  it('trusts a specific declared mime when the name says nothing', () => {
    expect(describe({ name: 'blob', mime: 'image/png' }).kind).toBe(Kind.IMAGE);
    expect(describe({ name: 'blob', mime: 'application/pdf' }).kind).toBe(Kind.PDF);
    expect(describe({ name: 'blob', mime: 'application/json' })).toMatchObject({
      kind: Kind.JSON,
      lang: 'json',
    });
  });

  it('falls back to text when nothing matches but the bytes decode', () => {
    expect(describe({ name: 'dump', bytes: ascii('plain text here', 15) }).kind).toBe(Kind.TEXT);
  });

  it('recognises extensionless filenames it knows', () => {
    expect(describe({ name: 'Dockerfile' })).toMatchObject({ kind: Kind.CODE, lang: 'dockerfile' });
    expect(describe({ name: 'Makefile' }).lang).toBe('makefile');
  });

  it('strips parameters off the declared mime', () => {
    expect(describe({ name: 'blob', mime: 'text/plain; charset=utf-8' }).kind).toBe(Kind.TEXT);
  });

  it('defaults the name and carries size through', () => {
    expect(describe({ size: 42 })).toMatchObject({ name: 'file', size: 42, kind: Kind.UNKNOWN });
  });

  it('survives no argument at all', () => {
    expect(describe().kind).toBe(Kind.UNKNOWN);
  });

  it('treats .rar and .7z as unknown, since no viewer can open them', () => {
    expect(describe({ name: 'a.rar' }).kind).toBe(Kind.UNKNOWN);
    expect(describe({ name: 'a.7z' }).kind).toBe(Kind.UNKNOWN);
  });
});

group('kindFromMime', () => {
  it('maps families by prefix', () => {
    expect(kindFromMime('image/avif')).toBe(Kind.IMAGE);
    expect(kindFromMime('audio/ogg')).toBe(Kind.AUDIO);
    expect(kindFromMime('video/webm')).toBe(Kind.VIDEO);
    expect(kindFromMime('font/woff2')).toBe(Kind.FONT);
  });

  it('maps exact types that are not a family', () => {
    expect(kindFromMime('text/csv')).toBe(Kind.CSV);
    expect(kindFromMime('text/markdown')).toBe(Kind.MARKDOWN);
    expect(kindFromMime('text/html')).toBe(Kind.HTML);
  });

  it('returns null for uninformative types', () => {
    expect(kindFromMime('application/octet-stream')).toBeNull();
    expect(kindFromMime('')).toBeNull();
    expect(kindFromMime(undefined)).toBeNull();
  });
});

group('shouldPreSniff', () => {
  it('always sniffs local bytes, which are free to read', () => {
    expect(shouldPreSniff({ blob: new Blob(['x']), declaredMime: '', kind: Kind.TEXT })).toBe(true);
  });

  it('sniffs a remote file when the server disagrees with the extension', () => {
    expect(shouldPreSniff({ blob: null, declaredMime: 'image/png', kind: Kind.TEXT })).toBe(true);
  });

  it('does not pay for a download when the signals already agree', () => {
    expect(shouldPreSniff({ blob: null, declaredMime: 'image/png', kind: Kind.IMAGE })).toBe(false);
  });

  it('does not sniff on a generic content-type alone', () => {
    expect(
      shouldPreSniff({ blob: null, declaredMime: 'application/octet-stream', kind: Kind.TEXT }),
    ).toBe(false);
  });
});

group('formatBytes', () => {
  it('uses bytes below 1000', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('switches unit at each power of 1000', () => {
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(1_000_000)).toBe('1.0 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });

  it('drops the decimal once the number is large enough to not need it', () => {
    expect(formatBytes(15_000)).toBe('15 KB');
  });

  it('returns empty for nothing and for non-finite input', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(Infinity)).toBe('');
  });
});
