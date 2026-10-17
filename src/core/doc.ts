/**
 * Legacy Word (`.doc`) text extraction — no dependencies.
 *
 * `.doc` is not a zipped XML package like `.docx`; it is an OLE2 container (see
 * {@link openCfb}) holding a `WordDocument` stream whose header, the FIB, points
 * into a table stream for everything else. Crucially the document's characters
 * are *not* stored contiguously: fast-saved files scatter them, and a piece
 * table (the `Clx`) records where each run really lives and whether it was
 * written as 8-bit Windows-1252 or 16-bit Unicode. Reassembling that is the
 * whole job here.
 *
 * What this deliberately does not do is read formatting. Character and
 * paragraph properties live in a separate stylesheet-plus-exception-run
 * structure (STSH / PAPX / CHPX FKPs) whose size dwarfs this file, and the
 * payoff — bold, fonts, margins — is the part of a document a reader can most
 * easily do without. So the output is text, paragraphs and table cells: the
 * same bargain the `.pptx` viewer already makes, and the honest one when the
 * alternative is a 20MB WASM office suite. When layout matters, the toolbar's
 * "Open in Office viewer" is still the right answer.
 *
 * Reference: [MS-DOC].
 */

import { openCfb } from './cfb.js';
import { PreviewError } from './errors.js';

/** A paragraph of text, or a table reconstructed from its cell marks. */
export type DocBlock = { type: 'paragraph'; text: string } | { type: 'table'; rows: string[][] };

/** Everything {@link parseDoc} could recover. */
export interface DocData {
  blocks: DocBlock[];
  /** Conversion losses worth telling the reader about. Never silent. */
  warnings: string[];
  /** True when the character cap cut the document short. */
  truncated: boolean;
}

export interface ParseDocOptions {
  /** Stop after this many characters of body text. */
  maxChars?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_CHARS = 500_000;

/** Word 97 and later; earlier builds lay the FIB out differently. */
const NFIB_WORD97 = 193;

/** Index of the fcClx/lcbClx pair within fibRgFcLcb97. */
const CLX_PAIR_INDEX = 33;

const FLAG_COMPLEX = 0x0004;
const FLAG_ENCRYPTED = 0x0100;
const FLAG_WHICH_TBL_STM = 0x0200;

/** Special characters in a Word character stream. */
const CELL_MARK = 0x07;
const LINE_BREAK = 0x0b;
const PAGE_BREAK = 0x0c;
const PARA_MARK = 0x0d;
const FIELD_BEGIN = 0x13;
const FIELD_SEPARATOR = 0x14;
const FIELD_END = 0x15;
const NB_HYPHEN = 0x1e;
const OPT_HYPHEN = 0x1f;

/**
 * Windows-1252 has printable characters where Latin-1 has C1 controls, and
 * Word uses them heavily — smart quotes, dashes, ellipsis. Decoding 8-bit
 * runs as Latin-1 would turn every apostrophe into a control character.
 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const aborted = (signal?: AbortSignal): boolean => Boolean(signal?.aborted);

function throwIfAborted(signal?: AbortSignal): void {
  if (aborted(signal)) throw new DOMException('aborted', 'AbortError');
}

/** One run of characters, located by the piece table. */
interface Piece {
  /** Byte offset into the WordDocument stream. */
  offset: number;
  /** Character count (not byte count). */
  length: number;
  /** True when the run is 8-bit Windows-1252 rather than UTF-16LE. */
  compressed: boolean;
}

/**
 * Locate the piece table inside the Clx.
 *
 * A Clx is a run of optional Prc blobs (tag 0x01) holding shared property sets,
 * terminated by the one Pcdt (tag 0x02) we actually want.
 */
function readPieceTable(clx: Uint8Array): Piece[] {
  const view = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);
  let i = 0;
  while (i < clx.length) {
    const tag = clx[i];
    if (tag === 0x01) {
      if (i + 3 > clx.length) break;
      // cbGrpprl is signed in the spec; a negative value means a corrupt Clx.
      const cbGrpprl = view.getInt16(i + 1, true);
      if (cbGrpprl < 0) break;
      i += 3 + cbGrpprl;
    } else if (tag === 0x02) {
      if (i + 5 > clx.length) break;
      const lcb = view.getUint32(i + 1, true);
      const start = i + 5;
      const end = Math.min(start + lcb, clx.length);
      return readPlcPcd(clx.subarray(start, end));
    } else {
      break;
    }
  }
  return [];
}

/**
 * A PLC is a parallel array: n+1 character positions followed by n 8-byte
 * descriptors, so the count falls out of the total length.
 */
function readPlcPcd(plc: Uint8Array): Piece[] {
  if (plc.length < 16) return [];
  const view = new DataView(plc.buffer, plc.byteOffset, plc.byteLength);
  const count = Math.floor((plc.length - 4) / 12);
  if (count <= 0) return [];

  const cps: number[] = [];
  for (let i = 0; i <= count; i++) cps.push(view.getUint32(i * 4, true));

  const pieces: Piece[] = [];
  const pcdBase = (count + 1) * 4;
  for (let i = 0; i < count; i++) {
    const offset = pcdBase + i * 8;
    if (offset + 8 > plc.length) break;
    const fc = view.getUint32(offset + 2, true);
    // Bit 30 flags an 8-bit run, and the remaining address is then doubled.
    const compressed = (fc & 0x40000000) !== 0;
    const address = fc & 0x3fffffff;
    const length = (cps[i + 1] ?? 0) - (cps[i] ?? 0);
    if (length <= 0) continue;
    pieces.push({
      offset: compressed ? address >>> 1 : address,
      length,
      compressed,
    });
  }
  return pieces;
}

/** Decode one piece's characters out of the WordDocument stream. */
function decodePiece(stream: Uint8Array, piece: Piece, limit: number): string {
  const take = Math.min(piece.length, limit);
  if (take <= 0) return '';
  let out = '';
  if (piece.compressed) {
    const end = Math.min(piece.offset + take, stream.length);
    for (let i = piece.offset; i < end; i++) {
      const byte = stream[i]!;
      out += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80]! : byte);
    }
  } else {
    const end = Math.min(piece.offset + take * 2, stream.length - 1);
    for (let i = piece.offset; i < end; i += 2) {
      out += String.fromCharCode(stream[i]! | (stream[i + 1]! << 8));
    }
  }
  return out;
}

/** A run of text plus the mark that ended it. */
interface Segment {
  text: string;
  /** True when a cell mark (0x07) terminated this run rather than a ¶. */
  cell: boolean;
}

/**
 * Turn a raw character stream into terminated segments, resolving field codes
 * and mapping Word's control characters on the way.
 */
function segment(raw: string): { segments: Segment[]; sawField: boolean } {
  const segments: Segment[] = [];
  // Each entry is a field nesting level; true while inside its instruction
  // half, which is machine text ("HYPERLINK \\l ...") the reader must not see.
  const fields: boolean[] = [];
  let sawField = false;
  let buf = '';

  const end = (cell: boolean): void => {
    segments.push({ text: buf, cell });
    buf = '';
  };

  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);

    if (code === FIELD_BEGIN) {
      fields.push(true);
      sawField = true;
      continue;
    }
    if (code === FIELD_SEPARATOR) {
      if (fields.length) fields[fields.length - 1] = false;
      continue;
    }
    if (code === FIELD_END) {
      fields.pop();
      continue;
    }
    if (fields.some(Boolean)) continue;

    if (code === PARA_MARK || code === PAGE_BREAK) end(false);
    else if (code === CELL_MARK) end(true);
    else if (code === LINE_BREAK) buf += '\n';
    else if (code === NB_HYPHEN) buf += '‑';
    else if (code === OPT_HYPHEN) continue;
    else if (code === 0x09 || code >= 0x20) buf += raw[i];
    // Everything else is a picture, footnote or annotation anchor with no
    // textual content of its own — dropping it is the correct rendering.
  }
  if (buf) end(false);

  return { segments, sawField };
}

/**
 * Split a table's flat run of cell marks into rows.
 *
 * Word ends every cell with 0x07 and then ends the row with one more 0x07
 * carrying no text. An empty cell therefore looks exactly like a row mark, and
 * only the paragraph properties — a whole second parser — say which is which.
 *
 * What rescues us is that an ordinary table has a fixed column count, so the
 * row marks must land at a regular stride. Searching for the smallest stride
 * where every boundary position is empty recovers the real shape, empty cells
 * included. Tables with merged cells have no such stride; those fall back to
 * treating each empty mark as a break, which is approximate but never throws.
 */
function resolveRows(segs: string[]): string[][] {
  const n = segs.length;
  // A stride spanning the whole run always "matches", because the final row
  // mark is the last segment — it would turn every ragged table into one long
  // row. Only a stride that repeats is evidence of a real column count, so
  // require at least two rows; one-row tables reach the same answer below.
  for (let cols = 1; cols * 2 + 2 <= n; cols++) {
    const stride = cols + 1; // the row mark occupies the extra slot
    if (n % stride !== 0) continue;
    let uniform = true;
    for (let i = stride - 1; i < n; i += stride) {
      if (segs[i] !== '') {
        uniform = false;
        break;
      }
    }
    if (!uniform) continue;
    const rows: string[][] = [];
    for (let i = 0; i < n; i += stride) rows.push(segs.slice(i, i + cols));
    return rows;
  }

  const rows: string[][] = [];
  let cur: string[] = [];
  for (const s of segs) {
    if (s === '') {
      if (cur.length) rows.push(cur);
      cur = [];
    } else {
      cur.push(s);
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/** Group segments into paragraphs and tables. */
function buildBlocks(segments: Segment[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  // Every cell mark in the current table, row marks included, kept flat so
  // resolveRows() can see the stride.
  let cellMarks: string[] = [];
  let lastMarkEmpty = false;
  let pending = '';

  const flushTable = (): void => {
    if (!cellMarks.length) return;
    const rows = resolveRows(cellMarks);
    if (rows.length) blocks.push({ type: 'table', rows });
    cellMarks = [];
    lastMarkEmpty = false;
  };

  for (const seg of segments) {
    pending += seg.text;

    if (seg.cell) {
      const text = pending.trim();
      cellMarks.push(text);
      lastMarkEmpty = text === '';
      pending = '';
      continue;
    }

    // A ¶ inside a cell that has not closed yet: a multi-paragraph cell. Rows
    // always end on a row mark, so an unclosed cell is the only way to be here
    // with table text still open.
    //
    // Known gap: when the *first* cell of a table is itself multi-paragraph,
    // nothing has marked the table open yet and its opening paragraph reads as
    // body text. Only sprmPFInTable in the paragraph properties distinguishes
    // the two, and reading those means a second parser over the PAPX FKPs. The
    // text is still shown, just above the table rather than inside its first
    // cell, so the cost of being wrong here is low.
    if (cellMarks.length && !lastMarkEmpty) {
      pending += '\n';
      continue;
    }

    flushTable();
    const text = pending.trim();
    if (text) blocks.push({ type: 'paragraph', text });
    pending = '';
  }

  flushTable();
  const tail = pending.trim();
  if (tail) blocks.push({ type: 'paragraph', text: tail });

  return blocks;
}

/** Name the file a user has most likely handed us by mistake. */
function describeNonWordContainer(has: (name: string) => boolean): string | null {
  if (has('Workbook') || has('Book')) return 'an Excel spreadsheet';
  if (has('PowerPoint Document')) return 'a PowerPoint presentation';
  return null;
}

/**
 * Extract the body text of a legacy `.doc` file.
 *
 * @throws PreviewError on anything the reader cannot honestly render.
 */
export function parseDoc(buffer: ArrayBuffer, options: ParseDocOptions = {}): DocData {
  const { maxChars = DEFAULT_MAX_CHARS, signal } = options;
  throwIfAborted(signal);

  // A ZIP here is a .docx wearing the wrong extension — a common enough
  // mistake that a generic "not a legacy document" would just confuse.
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    throw new PreviewError('DECODE', 'This is a modern Word document named ".doc".', {
      hint: 'Rename it to .docx and it will preview with its formatting intact.',
    });
  }

  const cfb = openCfb(buffer);
  const stream = cfb.read('WordDocument');

  if (!stream || stream.length < 68) {
    const other = describeNonWordContainer(cfb.has);
    if (other) {
      throw new PreviewError('DECODE', `This is ${other}, not a Word document.`, {
        hint: 'Rename it to the correct extension and it will preview properly.',
      });
    }
    throw new PreviewError('DECODE', 'This document has no readable Word content.');
  }

  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  if (view.getUint16(0, true) !== 0xa5ec) {
    throw new PreviewError('DECODE', 'This file is not a Word document.', {
      hint: 'Its header does not identify it as one, even though it is an Office container.',
    });
  }

  const nFib = view.getUint16(2, true);
  const flags = view.getUint16(0x0a, true);

  if (flags & FLAG_ENCRYPTED) {
    throw new PreviewError('PASSWORD', 'This document is password protected.', {
      hint: 'Remove the password in Word and try again.',
    });
  }

  if (nFib < NFIB_WORD97) {
    return parseWord95(stream, view, flags, maxChars);
  }

  // ---- Walk the FIB's variable-length sections to reach fibRgFcLcb --------
  const csw = view.getUint16(0x20, true);
  const rgLwOffset = 0x22 + csw * 2;
  if (rgLwOffset + 2 > stream.length) {
    throw new PreviewError('DECODE', 'This document has a malformed header.');
  }
  const cslw = view.getUint16(rgLwOffset, true);
  const rgLw = rgLwOffset + 2;
  const rgFcLcbCount = rgLw + cslw * 4;
  if (rgFcLcbCount + 2 > stream.length) {
    throw new PreviewError('DECODE', 'This document has a malformed header.');
  }
  const cbRgFcLcb = view.getUint16(rgFcLcbCount, true);
  const rgFcLcb = rgFcLcbCount + 2;

  // ccpText — the length of the main document, excluding footnotes, headers
  // and text boxes, which share the same character stream after it.
  const ccpText = cslw > 3 ? view.getUint32(rgLw + 3 * 4, true) : 0;

  const clxPairOffset = rgFcLcb + CLX_PAIR_INDEX * 8;
  if (CLX_PAIR_INDEX >= cbRgFcLcb || clxPairOffset + 8 > stream.length) {
    throw new PreviewError('DECODE', 'This document has a malformed header.');
  }
  const fcClx = view.getUint32(clxPairOffset, true);
  const lcbClx = view.getUint32(clxPairOffset + 4, true);

  // ---- The table stream, named for the bit that selects it ----------------
  const tableName = flags & FLAG_WHICH_TBL_STM ? '1Table' : '0Table';
  const table = cfb.read(tableName);
  if (!table) {
    throw new PreviewError('DECODE', 'This document is missing its text index.', {
      hint: `The "${tableName}" stream is absent, so the file is likely damaged.`,
    });
  }
  throwIfAborted(signal);

  if (!lcbClx || fcClx + lcbClx > table.length) {
    throw new PreviewError('DECODE', 'This document has an unreadable text index.');
  }

  const pieces = readPieceTable(table.subarray(fcClx, fcClx + lcbClx));
  if (!pieces.length) {
    throw new PreviewError('DECODE', 'This document has an unreadable text index.');
  }

  // ---- Reassemble the body ------------------------------------------------
  const budget = Math.min(maxChars, ccpText || maxChars);
  let raw = '';
  let consumed = 0;
  let truncated = false;

  for (const piece of pieces) {
    if (consumed >= budget) {
      truncated = consumed < (ccpText || 0);
      break;
    }
    throwIfAborted(signal);
    raw += decodePiece(stream, piece, budget - consumed);
    consumed += piece.length;
  }
  if (ccpText && consumed > budget) truncated = true;

  const { segments, sawField } = segment(raw);
  const blocks = buildBlocks(segments);

  if (!blocks.length) {
    throw new PreviewError('EMPTY', 'This document appears to be empty.', {
      hint: 'It may contain only images, text boxes or shapes, which this viewer cannot show. Try the Office viewer.',
    });
  }

  const warnings: string[] = [];
  if (blocks.some((b) => b.type === 'table')) {
    warnings.push(
      'Table structure is inferred from cell marks, so an unusual layout may group cells differently than Word does.',
    );
  }
  if (sawField) {
    warnings.push(
      'Field results are shown as they were last saved; field codes themselves are hidden.',
    );
  }
  if (flags & FLAG_COMPLEX) {
    warnings.push('This file was fast-saved, so revision fragments may appear out of order.');
  }

  return { blocks, warnings, truncated };
}

/**
 * Word 6.0/95 fallback.
 *
 * These predate the piece table: unless the file was fast-saved, the body is
 * one contiguous 8-bit run between fcMin and fcMac, at fixed offsets that
 * later versions reused as reserved fields.
 */
function parseWord95(stream: Uint8Array, view: DataView, flags: number, maxChars: number): DocData {
  const unsupported = new PreviewError('UNSUPPORTED', 'This is a Word 6.0/95 document.', {
    hint: 'Open it in Word or the Office viewer and save it as .docx for a full preview.',
  });

  if (flags & FLAG_COMPLEX) throw unsupported;

  const fcMin = view.getUint32(0x18, true);
  const fcMac = view.getUint32(0x1c, true);
  if (fcMin < 64 || fcMac <= fcMin || fcMac > stream.length) throw unsupported;

  const length = Math.min(fcMac - fcMin, maxChars);
  const piece: Piece = { offset: fcMin, length, compressed: true };
  const raw = decodePiece(stream, piece, length);

  const { segments, sawField } = segment(raw);
  const blocks = buildBlocks(segments);
  if (!blocks.length) throw unsupported;

  const warnings = ['This is a Word 6.0/95 file; only its plain text could be recovered.'];
  if (sawField) {
    warnings.push(
      'Field results are shown as they were last saved; field codes themselves are hidden.',
    );
  }

  return { blocks, warnings, truncated: fcMac - fcMin > length };
}
