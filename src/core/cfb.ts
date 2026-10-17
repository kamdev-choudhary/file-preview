/**
 * Compound File Binary Format (OLE2 / CFBF) reader.
 *
 * CFBF is a filesystem inside a file: fixed-size sectors chained through a FAT,
 * with a directory tree naming the streams. Legacy Office formats (.doc, .xls,
 * .ppt) are all CFBF containers — the interesting bytes live in named streams
 * such as `WordDocument` and `1Table`.
 *
 * This reader is deliberately read-only and minimal: open the container, list
 * the entries, pull a stream out by name. Enough for {@link parseDoc}, and
 * reusable if .xls or .ppt ever grow a native path.
 *
 * Reference: [MS-CFB].
 */

import { PreviewError } from './errors.js';

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Sector ids at or below this address real sectors; higher values are markers. */
const MAXREGSECT = 0xfffffffa;

/** Directory entry object types. */
const TYPE_STREAM = 2;
const TYPE_ROOT = 5;

/** Bytes per directory entry. */
const DIR_ENTRY_SIZE = 128;

/** One named stream or storage in the container's directory. */
export interface CfbEntry {
  name: string;
  /** 2 = stream, 1 = storage, 5 = root. */
  type: number;
  /** First sector of this entry's chain (in the FAT, or the mini FAT if small). */
  start: number;
  size: number;
}

/** An opened container. Streams are extracted lazily by {@link CfbFile.read}. */
export interface CfbFile {
  entries: CfbEntry[];
  /** Case-insensitive lookup; returns null when the stream is absent. */
  read(name: string): Uint8Array | null;
  has(name: string): boolean;
}

function startsWithSignature(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

/** True if the buffer opens with the OLE2 magic number. */
export function isCfb(bytes: Uint8Array | null | undefined): boolean {
  return Boolean(bytes && bytes.length >= 8 && startsWithSignature(bytes));
}

/**
 * Walk a sector chain, guarding against the cycles and runaway lengths that a
 * corrupt (or hostile) FAT can describe.
 *
 * @param max Hard ceiling on chain length — the sector count of the container.
 */
function followChain(fat: Uint32Array, start: number, max: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  let sector = start;
  while (sector <= MAXREGSECT && out.length < max) {
    if (seen.has(sector)) break; // cyclic FAT
    seen.add(sector);
    out.push(sector);
    sector = fat[sector] ?? 0xfffffffe;
  }
  return out;
}

/** Concatenate a chain's sectors into one buffer, stopping at `size` bytes. */
function readChain(
  src: Uint8Array,
  chain: number[],
  offsetOf: (sector: number) => number,
  chunk: number,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size);
  let written = 0;
  for (const sector of chain) {
    if (written >= size) break;
    const offset = offsetOf(sector);
    const n = Math.min(chunk, size - written);
    // A truncated download gives a valid-looking FAT pointing past the end.
    if (offset < 0 || offset + n > src.length) break;
    out.set(src.subarray(offset, offset + n), written);
    written += n;
  }
  return written === size ? out : out.subarray(0, written);
}

function decodeEntryName(bytes: Uint8Array, offset: number): string {
  // 64 bytes of UTF-16LE; cbName counts bytes including the NUL terminator.
  const cbName = bytes[offset + 0x40]! | (bytes[offset + 0x41]! << 8);
  const chars = Math.max(0, Math.min(32, Math.floor(cbName / 2) - 1));
  let name = '';
  for (let i = 0; i < chars; i++) {
    const code = bytes[offset + i * 2]! | (bytes[offset + i * 2 + 1]! << 8);
    if (code === 0) break;
    name += String.fromCharCode(code);
  }
  return name;
}

/**
 * Open an OLE2 container.
 *
 * @throws PreviewError('DECODE') when the buffer is not a readable container.
 */
export function openCfb(buffer: ArrayBuffer): CfbFile {
  const bytes = new Uint8Array(buffer);
  if (!isCfb(bytes)) {
    throw new PreviewError('DECODE', 'This file is not a legacy Office document.', {
      hint: 'The expected OLE2 container signature is missing.',
    });
  }
  if (bytes.length < 512) {
    throw new PreviewError('DECODE', 'This file is too short to be a valid document.');
  }

  const view = new DataView(buffer);
  const sectorShift = view.getUint16(0x1e, true);
  const miniSectorShift = view.getUint16(0x20, true);
  // Only the two shifts the spec defines are safe; anything else means the
  // header is garbage and every offset computed from it would be too.
  if ((sectorShift !== 9 && sectorShift !== 12) || miniSectorShift !== 6) {
    throw new PreviewError('DECODE', 'This document uses an unreadable sector layout.');
  }

  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const fatSectorCount = view.getUint32(0x2c, true);
  const dirStart = view.getUint32(0x30, true);
  const miniCutoff = view.getUint32(0x38, true);
  const miniFatStart = view.getUint32(0x3c, true);
  const miniFatCount = view.getUint32(0x40, true);
  const difatStart = view.getUint32(0x44, true);
  const difatCount = view.getUint32(0x48, true);

  // Sector 0 begins immediately after the 512-byte header, whatever the
  // sector size — for 4096-byte sectors the header is padded out to a sector.
  const headerSize = sectorSize > 512 ? sectorSize : 512;
  const offsetOf = (sector: number): number => headerSize + sector * sectorSize;
  const totalSectors = Math.ceil(Math.max(0, bytes.length - headerSize) / sectorSize);
  const perSector = sectorSize / 4;

  const u32 = (offset: number): number =>
    offset + 4 <= bytes.length ? view.getUint32(offset, true) : 0xfffffffe;

  // ---- DIFAT: the list of sectors that hold the FAT ------------------------
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i++) {
    const sector = view.getUint32(0x4c + i * 4, true);
    if (sector > MAXREGSECT) break;
    fatSectors.push(sector);
  }
  let difatSector = difatStart;
  const seenDifat = new Set<number>();
  for (let n = 0; n < difatCount && difatSector <= MAXREGSECT; n++) {
    if (seenDifat.has(difatSector)) break;
    seenDifat.add(difatSector);
    const base = offsetOf(difatSector);
    for (let i = 0; i < perSector - 1 && fatSectors.length < fatSectorCount; i++) {
      const sector = u32(base + i * 4);
      if (sector > MAXREGSECT) continue;
      fatSectors.push(sector);
    }
    difatSector = u32(base + (perSector - 1) * 4);
  }

  // ---- FAT -----------------------------------------------------------------
  const fat = new Uint32Array(fatSectors.length * perSector);
  let w = 0;
  for (const sector of fatSectors) {
    const base = offsetOf(sector);
    for (let i = 0; i < perSector; i++) fat[w++] = u32(base + i * 4);
  }

  // ---- Directory -----------------------------------------------------------
  const dirChain = followChain(fat, dirStart, totalSectors);
  const dirBytes = readChain(bytes, dirChain, offsetOf, sectorSize, dirChain.length * sectorSize);
  const entries: CfbEntry[] = [];
  for (let offset = 0; offset + DIR_ENTRY_SIZE <= dirBytes.length; offset += DIR_ENTRY_SIZE) {
    const type = dirBytes[offset + 0x42] ?? 0;
    if (type !== TYPE_STREAM && type !== TYPE_ROOT) continue;
    const dv = new DataView(dirBytes.buffer, dirBytes.byteOffset + offset, DIR_ENTRY_SIZE);
    entries.push({
      name: decodeEntryName(dirBytes, offset),
      type,
      start: dv.getUint32(0x74, true),
      // 64-bit size; the high word is only meaningful for v4 and is never
      // large enough here to matter, so clamp rather than risk a bogus length.
      size: dv.getUint32(0x78, true),
    });
  }

  const root = entries.find((e) => e.type === TYPE_ROOT) ?? null;

  // ---- Mini FAT and the mini stream ---------------------------------------
  let miniFat: Uint32Array | null = null;
  let miniStream: Uint8Array | null = null;

  function ensureMini(): void {
    if (miniFat) return;
    const chain = followChain(fat, miniFatStart, totalSectors).slice(0, miniFatCount || undefined);
    const raw = readChain(bytes, chain, offsetOf, sectorSize, chain.length * sectorSize);
    miniFat = new Uint32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    if (root) {
      const rootChain = followChain(fat, root.start, totalSectors);
      miniStream = readChain(bytes, rootChain, offsetOf, sectorSize, root.size);
    } else {
      miniStream = new Uint8Array(0);
    }
  }

  function readEntry(entry: CfbEntry): Uint8Array {
    if (entry.size === 0) return new Uint8Array(0);
    if (entry.size < miniCutoff && entry.type !== TYPE_ROOT) {
      ensureMini();
      const mini = miniStream ?? new Uint8Array(0);
      const chain = followChain(
        miniFat ?? new Uint32Array(0),
        entry.start,
        Math.ceil(mini.length / miniSectorSize) + 1,
      );
      return readChain(mini, chain, (s) => s * miniSectorSize, miniSectorSize, entry.size);
    }
    const chain = followChain(fat, entry.start, totalSectors);
    return readChain(bytes, chain, offsetOf, sectorSize, entry.size);
  }

  const find = (name: string): CfbEntry | undefined => {
    const target = name.toLowerCase();
    return entries.find((e) => e.type === TYPE_STREAM && e.name.toLowerCase() === target);
  };

  return {
    entries,
    has: (name) => Boolean(find(name)),
    read(name) {
      const entry = find(name);
      return entry ? readEntry(entry) : null;
    },
  };
}
