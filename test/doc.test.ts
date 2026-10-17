import { describe as group, expect, it } from 'vitest';
import { isCfb, openCfb } from '../src/core/cfb.js';
import { parseDoc, type DocBlock } from '../src/core/doc.js';
import { PreviewError } from '../src/core/errors.js';
import { buildCfb, buildDoc, buildWord95, buildWordStreams } from './doc-fixture.js';

const bytesOf = (buffer: ArrayBuffer): Uint8Array<ArrayBuffer> => new Uint8Array(buffer);

/** Build a one-piece document from a raw character stream. */
const docOf = (text: string, compressed = true): ArrayBuffer =>
  buildDoc({ pieces: [{ text, compressed }] });

const paragraphs = (blocks: DocBlock[]): string[] =>
  blocks.filter((b) => b.type === 'paragraph').map((b) => b.text);

const tables = (blocks: DocBlock[]): string[][][] =>
  blocks.filter((b) => b.type === 'table').map((b) => b.rows);

/** Word's control characters, spelled out so the fixtures stay readable. */
const PARA = '\r';
const CELL = '\x07';
const FIELD = { begin: '\x13', sep: '\x14', end: '\x15' };

group('isCfb', () => {
  it('recognises the OLE2 signature', () => {
    expect(isCfb(bytesOf(buildCfb([{ name: 'Stream', data: new Uint8Array(10) }])))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCfb(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(isCfb(new Uint8Array([1, 2]))).toBe(false);
    expect(isCfb(null)).toBe(false);
    expect(isCfb(undefined)).toBe(false);
  });
});

group('openCfb', () => {
  it('lists the root entry alongside the streams', () => {
    const cfb = openCfb(buildCfb([{ name: 'Alpha', data: new Uint8Array(8) }]));
    expect(cfb.entries.map((e) => e.name)).toEqual(['Root Entry', 'Alpha']);
  });

  it('reads a small stream out of the mini stream', () => {
    const data = Uint8Array.from({ length: 100 }, (_, i) => i);
    const cfb = openCfb(buildCfb([{ name: 'Small', data }]));
    expect(cfb.read('Small')).toEqual(data);
  });

  it('reads a large stream out of the regular sectors', () => {
    const data = Uint8Array.from({ length: 9000 }, (_, i) => i & 0xff);
    const cfb = openCfb(buildCfb([{ name: 'Large', data }]));
    expect(cfb.read('Large')).toEqual(data);
  });

  it('keeps several streams of both sizes apart', () => {
    const small = Uint8Array.from({ length: 70 }, () => 1);
    const large = Uint8Array.from({ length: 5000 }, () => 2);
    const other = Uint8Array.from({ length: 70 }, () => 3);
    const cfb = openCfb(
      buildCfb([
        { name: 'One', data: small },
        { name: 'Two', data: large },
        { name: 'Three', data: other },
      ]),
    );
    expect(cfb.read('One')).toEqual(small);
    expect(cfb.read('Two')).toEqual(large);
    expect(cfb.read('Three')).toEqual(other);
  });

  it('looks streams up without regard to case', () => {
    const cfb = openCfb(buildCfb([{ name: 'WordDocument', data: new Uint8Array(4) }]));
    expect(cfb.has('worddocument')).toBe(true);
    expect(cfb.read('WORDDOCUMENT')).not.toBeNull();
  });

  it('returns null for an absent stream', () => {
    const cfb = openCfb(buildCfb([{ name: 'Alpha', data: new Uint8Array(4) }]));
    expect(cfb.has('Missing')).toBe(false);
    expect(cfb.read('Missing')).toBeNull();
  });

  it('rejects a buffer without the signature', () => {
    const buf = new Uint8Array(1024);
    expect(() => openCfb(buf.buffer)).toThrow(PreviewError);
    expect(() => openCfb(buf.buffer)).toThrow(/not a legacy Office document/i);
  });

  it('rejects a truncated container', () => {
    const buf = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => openCfb(buf.buffer)).toThrow(/too short/i);
  });

  it('rejects an impossible sector size', () => {
    const buf = bytesOf(buildCfb([{ name: 'Alpha', data: new Uint8Array(8) }]));
    new DataView(buf.buffer).setUint16(0x1e, 7, true);
    expect(() => openCfb(buf.buffer)).toThrow(/unreadable sector layout/i);
  });
});

group('parseDoc: text', () => {
  it('splits a character stream into paragraphs', () => {
    const { blocks } = parseDoc(docOf(`First.${PARA}Second.${PARA}Third.${PARA}`));
    expect(paragraphs(blocks)).toEqual(['First.', 'Second.', 'Third.']);
  });

  it('drops empty paragraphs and trims surrounding space', () => {
    const { blocks } = parseDoc(docOf(`  Padded.  ${PARA}${PARA}   ${PARA}Next.${PARA}`));
    expect(paragraphs(blocks)).toEqual(['Padded.', 'Next.']);
  });

  it('keeps a trailing paragraph that has no final mark', () => {
    const { blocks } = parseDoc(docOf(`One.${PARA}Unterminated.`));
    expect(paragraphs(blocks)).toEqual(['One.', 'Unterminated.']);
  });

  it('decodes Windows-1252 punctuation rather than Latin-1 controls', () => {
    // 0x93/0x94 are smart quotes in cp1252 and C1 controls in Latin-1.
    const raw = `He said \x93hi\x94 \x97 then left\x85${PARA}`;
    const { blocks } = parseDoc(docOf(raw));
    expect(paragraphs(blocks)).toEqual(['He said “hi” — then left…']);
  });

  it('decodes a UTF-16 piece', () => {
    const { blocks } = parseDoc(docOf(`Ünïcode — ✓${PARA}`, false));
    expect(paragraphs(blocks)).toEqual(['Ünïcode — ✓']);
  });

  it('stitches 8-bit and 16-bit pieces back into one stream', () => {
    const buffer = buildDoc({
      pieces: [
        { text: 'Plain ascii, ' },
        { text: 'then ünicode', compressed: false },
        { text: `, then ascii.${PARA}` },
      ],
    });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['Plain ascii, then ünicode, then ascii.']);
  });

  it('turns a soft line break into a newline inside one paragraph', () => {
    const { blocks } = parseDoc(docOf(`Line one\x0Bline two${PARA}`));
    expect(paragraphs(blocks)).toEqual(['Line one\nline two']);
  });

  it('treats a page break as a paragraph boundary', () => {
    const { blocks } = parseDoc(docOf(`Before\x0CAfter${PARA}`));
    expect(paragraphs(blocks)).toEqual(['Before', 'After']);
  });

  it('keeps non-breaking hyphens and drops optional ones', () => {
    const { blocks } = parseDoc(docOf(`re\x1Fenter co\x1Eop${PARA}`));
    expect(paragraphs(blocks)).toEqual(['reenter co‑op']);
  });

  it('drops picture and annotation anchors', () => {
    const { blocks } = parseDoc(docOf(`Text\x01with\x02anchors\x08here${PARA}`));
    expect(paragraphs(blocks)).toEqual(['Textwithanchorshere']);
  });

  it('stops at ccpText so footnotes and headers stay out of the body', () => {
    const body = `Body text.${PARA}`;
    const buffer = buildDoc({
      pieces: [{ text: `${body}A footnote.${PARA}` }],
      ccpText: body.length,
    });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['Body text.']);
  });
});

group('parseDoc: fields', () => {
  it('shows a field result and hides its instruction', () => {
    const raw = `See ${FIELD.begin}HYPERLINK "http://x"${FIELD.sep}the site${FIELD.end} now.${PARA}`;
    const { blocks, warnings } = parseDoc(docOf(raw));
    expect(paragraphs(blocks)).toEqual(['See the site now.']);
    expect(warnings.some((w) => /field/i.test(w))).toBe(true);
  });

  it('drops a field that has no result', () => {
    const raw = `Page ${FIELD.begin}PAGE${FIELD.end}done${PARA}`;
    expect(paragraphs(parseDoc(docOf(raw)).blocks)).toEqual(['Page done']);
  });

  it('handles a field nested inside another field instruction', () => {
    const raw = `${FIELD.begin}IF ${FIELD.begin}PAGE${FIELD.end} > 1${FIELD.sep}result${FIELD.end}!${PARA}`;
    expect(paragraphs(parseDoc(docOf(raw)).blocks)).toEqual(['result!']);
  });
});

group('parseDoc: tables', () => {
  it('reconstructs a uniform table', () => {
    const raw = `A${CELL}B${CELL}${CELL}C${CELL}D${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    ]);
  });

  it('keeps an empty cell instead of reading it as a row break', () => {
    // The regression this guards: "A | (empty) | C" has the same cell marks as
    // two one-cell rows, and only the stride tells them apart.
    const raw = `A${CELL}${CELL}C${CELL}${CELL}D${CELL}E${CELL}F${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([
      [
        ['A', '', 'C'],
        ['D', 'E', 'F'],
      ],
    ]);
  });

  it('handles a trailing empty cell on every row', () => {
    const raw = `A${CELL}${CELL}${CELL}B${CELL}${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([
      [
        ['A', ''],
        ['B', ''],
      ],
    ]);
  });

  it('reads a single-column table', () => {
    const raw = `one${CELL}${CELL}two${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([[['one'], ['two']]]);
  });

  it('falls back to cell marks when no uniform stride exists', () => {
    // Three cells then two: a merged-cell layout with no regular stride.
    const raw = `a${CELL}b${CELL}c${CELL}${CELL}d${CELL}e${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([
      [
        ['a', 'b', 'c'],
        ['d', 'e'],
      ],
    ]);
  });

  it('joins the paragraphs of a multi-paragraph cell', () => {
    const raw = `first${CELL}line one${PARA}line two${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([[['first', 'line one\nline two']]]);
  });

  it('separates body paragraphs from the table around them', () => {
    const raw = `Before.${PARA}A${CELL}B${CELL}${CELL}After.${PARA}`;
    const { blocks } = parseDoc(docOf(raw));
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Before.' },
      { type: 'table', rows: [['A', 'B']] },
      { type: 'paragraph', text: 'After.' },
    ]);
  });

  it('reads two tables separated by a paragraph', () => {
    const raw = `A${CELL}${CELL}Middle.${PARA}B${CELL}${CELL}`;
    expect(tables(parseDoc(docOf(raw)).blocks)).toEqual([[['A']], [['B']]]);
  });

  it('warns that table structure is inferred', () => {
    const { warnings } = parseDoc(docOf(`A${CELL}${CELL}`));
    expect(warnings.some((w) => /table/i.test(w))).toBe(true);
  });

  it('does not warn about tables in a document that has none', () => {
    const { warnings } = parseDoc(docOf(`Just text.${PARA}`));
    expect(warnings).toEqual([]);
  });
});

group('parseDoc: limits', () => {
  it('reports truncation when the character cap is hit', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.${PARA}`).join('');
    const { blocks, truncated } = parseDoc(docOf(text), { maxChars: 60 });
    expect(truncated).toBe(true);
    expect(paragraphs(blocks).length).toBeLessThan(50);
    expect(paragraphs(blocks)[0]).toBe('Paragraph 0.');
  });

  it('does not report truncation for a document that fits', () => {
    expect(parseDoc(docOf(`Short.${PARA}`), { maxChars: 10_000 }).truncated).toBe(false);
  });

  it('stops immediately on an aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => parseDoc(docOf(`Text.${PARA}`), { signal: controller.signal })).toThrow(
      DOMException,
    );
  });
});

group('parseDoc: failure modes', () => {
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (err) {
      return err instanceof PreviewError ? err.code : 'NOT_PREVIEW_ERROR';
    }
    return 'NO_THROW';
  };

  it('names a .docx that was given a .doc extension', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(() => parseDoc(zip.buffer)).toThrow(/modern Word document/i);
    expect(codeOf(() => parseDoc(zip.buffer))).toBe('DECODE');
  });

  it('rejects a file that is not an Office container at all', () => {
    const junk = new TextEncoder().encode('not a word document at all');
    expect(codeOf(() => parseDoc(junk.buffer))).toBe('DECODE');
  });

  it('identifies an Excel workbook in a .doc container', () => {
    const buffer = buildCfb([{ name: 'Workbook', data: new Uint8Array(200) }]);
    expect(() => parseDoc(buffer)).toThrow(/Excel spreadsheet/i);
  });

  it('identifies a PowerPoint presentation in a .doc container', () => {
    const buffer = buildCfb([{ name: 'PowerPoint Document', data: new Uint8Array(200) }]);
    expect(() => parseDoc(buffer)).toThrow(/PowerPoint presentation/i);
  });

  it('rejects an Office container with no Word stream', () => {
    const buffer = buildCfb([{ name: 'Something', data: new Uint8Array(200) }]);
    expect(() => parseDoc(buffer)).toThrow(/no readable Word content/i);
  });

  it('rejects a Word stream with the wrong magic number', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    new DataView(streams[0]!.data.buffer).setUint16(0, 0x1234, true);
    expect(() => parseDoc(buildCfb(streams))).toThrow(/not a Word document/i);
  });

  it('reports a password-protected document as such', () => {
    const buffer = buildDoc({ pieces: [{ text: `Secret.${PARA}` }], encrypted: true });
    expect(codeOf(() => parseDoc(buffer))).toBe('PASSWORD');
    expect(() => parseDoc(buffer)).toThrow(/password protected/i);
  });

  it('reports a missing table stream', () => {
    const [wordDoc] = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    expect(() => parseDoc(buildCfb([wordDoc!]))).toThrow(/missing its text index/i);
  });

  it('reports an out-of-range Clx pointer', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    // fcClx sits at fibRgFcLcb + 33 * 8; push it past the table stream.
    new DataView(streams[0]!.data.buffer).setUint32(0x9a + 33 * 8, 0xffff, true);
    expect(() => parseDoc(buildCfb(streams))).toThrow(/unreadable text index/i);
  });

  it('reports a document whose body is empty', () => {
    expect(codeOf(() => parseDoc(docOf(`${PARA}  ${PARA}`)))).toBe('EMPTY');
  });

  it('warns that a fast-saved document may be out of order', () => {
    const buffer = buildDoc({ pieces: [{ text: `Text.${PARA}` }], complex: true });
    expect(parseDoc(buffer).warnings.some((w) => /fast-saved/i.test(w))).toBe(true);
  });
});

group('parseDoc: Word 6.0/95', () => {
  it('recovers plain text from a simple Word 95 file', () => {
    const { blocks, warnings } = parseDoc(buildWord95(`Old file.${PARA}Second line.${PARA}`));
    expect(paragraphs(blocks)).toEqual(['Old file.', 'Second line.']);
    expect(warnings.some((w) => /Word 6\.0\/95/i.test(w))).toBe(true);
  });

  it('declines a fast-saved Word 95 file rather than guessing', () => {
    expect(() => parseDoc(buildWord95(`Text.${PARA}`, true))).toThrow(/Word 6\.0\/95/i);
  });

  it('declines a Word 95 file with an impossible text range', () => {
    const buffer = buildWord95(`Text.${PARA}`);
    const cfb = openCfb(buffer);
    const stream = cfb.read('WordDocument')!;
    // fcMac before fcMin: nothing sane to read.
    new DataView(stream.buffer, stream.byteOffset).setUint32(0x1c, 4, true);
    const rebuilt = buildCfb([{ name: 'WordDocument', data: stream }]);
    expect(() => parseDoc(rebuilt)).toThrow(PreviewError);
  });
});

group('parseDoc: structural variations', () => {
  it('reads the 0Table stream when fWhichTblStm is clear', () => {
    const buffer = buildDoc({ pieces: [{ text: `Zero table.${PARA}` }], whichTable: 0 });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['Zero table.']);
  });

  it('skips Prc property blobs that precede the piece table', () => {
    const buffer = buildDoc({
      pieces: [{ text: `After a Prc.${PARA}` }],
      prcGrpprl: new Uint8Array([0x16, 0x24, 0x01, 0x00]),
    });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['After a Prc.']);
  });

  it('ignores a zero-length piece', () => {
    const buffer = buildDoc({ pieces: [{ text: '' }, { text: `Real text.${PARA}` }] });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['Real text.']);
  });

  it('falls back to the full budget when the FIB declares no ccpText', () => {
    // cslw of 3 leaves the ccpText slot out of fibRgLw entirely.
    const buffer = buildDoc({ pieces: [{ text: `No ccpText.${PARA}` }], cslw: 3 });
    expect(paragraphs(parseDoc(buffer).blocks)).toEqual(['No ccpText.']);
  });

  it('tolerates a field separator with no field open', () => {
    expect(paragraphs(parseDoc(docOf(`a${FIELD.sep}b${PARA}`)).blocks)).toEqual(['ab']);
  });

  it('rejects a FIB whose csw runs past the stream', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    new DataView(streams[0]!.data.buffer).setUint16(0x20, 0xffff, true); // csw
    expect(() => parseDoc(buildCfb(streams))).toThrow(/malformed header/i);
  });

  it('rejects a FIB whose cslw runs past the stream', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    new DataView(streams[0]!.data.buffer).setUint16(0x3e, 0xffff, true); // cslw
    expect(() => parseDoc(buildCfb(streams))).toThrow(/malformed header/i);
  });

  it('rejects a FIB that declares too few fibRgFcLcb entries to hold fcClx', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    new DataView(streams[0]!.data.buffer).setUint16(0x98, 4, true); // cbRgFcLcb
    expect(() => parseDoc(buildCfb(streams))).toThrow(/malformed header/i);
  });

  it('rejects a piece table truncated by its own declared length', () => {
    const buffer = buildDoc({ pieces: [{ text: `Hi.${PARA}` }], lcbClx: 4 });
    expect(() => parseDoc(buffer)).toThrow(/unreadable text index/i);
  });

  it('survives a Clx whose tag byte is nonsense', () => {
    const streams = buildWordStreams({ pieces: [{ text: `Hi.${PARA}` }] });
    streams[1]!.data[16] = 0x7f; // where the Pcdt tag should be
    expect(() => parseDoc(buildCfb(streams))).toThrow(/unreadable text index/i);
  });
});

group('parseDoc: Word 6.0/95 extras', () => {
  it('resolves fields in a Word 95 file', () => {
    const raw = `See ${FIELD.begin}REF x${FIELD.sep}it${FIELD.end}.${PARA}`;
    const { blocks, warnings } = parseDoc(buildWord95(raw));
    expect(paragraphs(blocks)).toEqual(['See it.']);
    expect(warnings.some((w) => /field/i.test(w))).toBe(true);
  });

  it('declines a Word 95 file whose text is all whitespace', () => {
    expect(() => parseDoc(buildWord95(`   ${PARA}  ${PARA}`))).toThrow(/Word 6\.0\/95/i);
  });

  it('reports truncation in a Word 95 file', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Line ${i}.${PARA}`).join('');
    expect(parseDoc(buildWord95(text), { maxChars: 40 }).truncated).toBe(true);
  });
});

group('openCfb: damaged containers', () => {
  it('stops rather than looping on a cyclic FAT', () => {
    const buf = bytesOf(buildCfb([{ name: 'Large', data: new Uint8Array(9000).fill(7) }]));
    const view = new DataView(buf.buffer);
    const firstFatSector = view.getUint32(0x4c, true);
    // Point sector 0 back at itself; the chain must terminate anyway.
    view.setUint32(512 + firstFatSector * 512, 0, true);
    const cfb = openCfb(buf.buffer);
    expect(cfb.read('Large')!.length).toBeLessThanOrEqual(9000);
  });

  it('returns only what is present when a chain runs past the end of the file', () => {
    const buf = bytesOf(buildCfb([{ name: 'Large', data: new Uint8Array(9000).fill(7) }]));
    const view = new DataView(buf.buffer);
    const dirSector = view.getUint32(0x30, true);
    const entry = 512 + dirSector * 512 + 128; // entry 1: the stream
    view.setUint32(entry + 0x78, 90_000, true); // claim ten times the real size
    const fatSector = view.getUint32(0x4c, true);
    // Redirect the chain's head at a sector well past the end of the buffer.
    view.setUint32(512 + fatSector * 512 + view.getUint32(entry + 0x74, true) * 4, 9999, true);
    const cfb = openCfb(buf.buffer);
    expect(cfb.read('Large')!.length).toBeLessThan(90_000);
  });

  it('reads a zero-length stream as empty', () => {
    const cfb = openCfb(buildCfb([{ name: 'Empty', data: new Uint8Array(0) }]));
    expect(cfb.read('Empty')).toEqual(new Uint8Array(0));
  });

  it('still reports streams when the root entry is missing', () => {
    const buf = bytesOf(buildCfb([{ name: 'Small', data: new Uint8Array(80).fill(3) }]));
    const view = new DataView(buf.buffer);
    const dirSector = view.getUint32(0x30, true);
    buf[512 + dirSector * 512 + 0x42] = 0; // root entry type -> unknown
    const cfb = openCfb(buf.buffer);
    expect(cfb.entries.map((e) => e.name)).toEqual(['Small']);
    expect(cfb.read('Small')).toEqual(new Uint8Array(0));
  });
});
