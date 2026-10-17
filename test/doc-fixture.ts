/**
 * Minimal writers for the two binary formats `src/core/doc.ts` reads: an OLE2
 * container and the Word stream inside it.
 *
 * Checking in real `.doc` files would hide what each test is actually about,
 * so the fixtures are built byte by byte here instead — the same approach
 * `xlsx.test.ts` takes with JSZip.
 */

const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
const DIR_ENTRY = 128;
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;

export interface CfbStream {
  name: string;
  data: Uint8Array;
}

function padTo(data: Uint8Array, multiple: number): Uint8Array {
  const size = Math.ceil(data.length / multiple) * multiple;
  const out = new Uint8Array(size);
  out.set(data);
  return out;
}

/**
 * Write an OLE2 container.
 *
 * Streams smaller than the 4096-byte cutoff go into the mini stream, exactly
 * as a real writer would, so both read paths in `openCfb` get exercised.
 */
export function buildCfb(streams: CfbStream[]): ArrayBuffer {
  const sectors: Uint8Array[] = [];
  const alloc = (data: Uint8Array): number[] => {
    const padded = padTo(data, SECTOR);
    const chain: number[] = [];
    for (let i = 0; i < padded.length; i += SECTOR) {
      chain.push(sectors.length);
      sectors.push(padded.subarray(i, i + SECTOR));
    }
    return chain;
  };

  const small = streams.filter((s) => s.data.length > 0 && s.data.length < MINI_CUTOFF);
  const large = streams.filter((s) => s.data.length >= MINI_CUTOFF);

  // ---- mini stream: small streams concatenated on 64-byte boundaries ------
  const miniChains = new Map<string, number>();
  const miniParts: Uint8Array[] = [];
  let miniSectorCount = 0;
  for (const s of small) {
    miniChains.set(s.name, miniSectorCount);
    const padded = padTo(s.data, MINI_SECTOR);
    miniParts.push(padded);
    miniSectorCount += padded.length / MINI_SECTOR;
  }
  const miniStream = new Uint8Array(miniSectorCount * MINI_SECTOR);
  {
    let offset = 0;
    for (const part of miniParts) {
      miniStream.set(part, offset);
      offset += part.length;
    }
  }

  // ---- allocate stream data ----------------------------------------------
  const largeChains = new Map<string, number[]>();
  for (const s of large) largeChains.set(s.name, alloc(s.data));

  const rootChain = miniStream.length ? alloc(miniStream) : [];

  // ---- mini FAT: one entry per mini sector, chained within each stream ----
  const miniFat = new Uint32Array(Math.max(1, Math.ceil(miniSectorCount / 128) * 128)).fill(
    FREESECT,
  );
  for (const s of small) {
    const start = miniChains.get(s.name)!;
    const count = Math.ceil(s.data.length / MINI_SECTOR);
    for (let i = 0; i < count; i++) {
      miniFat[start + i] = i === count - 1 ? ENDOFCHAIN : start + i + 1;
    }
  }
  const miniFatChain = miniSectorCount ? alloc(new Uint8Array(miniFat.buffer)) : [];

  // ---- directory ----------------------------------------------------------
  const entries: { name: string; type: number; start: number; size: number }[] = [
    {
      name: 'Root Entry',
      type: 5,
      start: rootChain[0] ?? ENDOFCHAIN,
      size: miniStream.length,
    },
  ];
  for (const s of streams) {
    const isMini = s.data.length > 0 && s.data.length < MINI_CUTOFF;
    entries.push({
      name: s.name,
      type: 2,
      start: isMini
        ? (miniChains.get(s.name) ?? ENDOFCHAIN)
        : (largeChains.get(s.name)?.[0] ?? ENDOFCHAIN),
      size: s.data.length,
    });
  }

  const dirBytes = new Uint8Array(Math.ceil((entries.length * DIR_ENTRY) / SECTOR) * SECTOR);
  const dirView = new DataView(dirBytes.buffer);
  entries.forEach((entry, i) => {
    const base = i * DIR_ENTRY;
    for (let c = 0; c < entry.name.length; c++) {
      dirView.setUint16(base + c * 2, entry.name.charCodeAt(c), true);
    }
    dirView.setUint16(base + 0x40, entry.name.length * 2 + 2, true);
    dirBytes[base + 0x42] = entry.type;
    dirView.setUint32(base + 0x44, FREESECT, true); // left sibling
    dirView.setUint32(base + 0x48, FREESECT, true); // right sibling
    dirView.setUint32(base + 0x4c, FREESECT, true); // child
    dirView.setUint32(base + 0x74, entry.start, true);
    dirView.setUint32(base + 0x78, entry.size, true);
  });
  const dirChain = alloc(dirBytes);

  // ---- FAT, which must also describe its own sectors ---------------------
  const contentSectors = sectors.length;
  let fatSectorCount = 1;
  while (Math.ceil((contentSectors + fatSectorCount) / (SECTOR / 4)) > fatSectorCount) {
    fatSectorCount++;
  }
  const fat = new Uint32Array(fatSectorCount * (SECTOR / 4)).fill(FREESECT);
  const link = (chain: number[]): void => {
    chain.forEach((sector, i) => {
      fat[sector] = i === chain.length - 1 ? ENDOFCHAIN : chain[i + 1]!;
    });
  };
  for (const chain of largeChains.values()) link(chain);
  link(rootChain);
  link(miniFatChain);
  link(dirChain);
  const fatSectorIds: number[] = [];
  for (let i = 0; i < fatSectorCount; i++) {
    fatSectorIds.push(contentSectors + i);
    fat[contentSectors + i] = FATSECT;
  }

  // ---- header -------------------------------------------------------------
  const header = new Uint8Array(SECTOR);
  const hv = new DataView(header.buffer);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  hv.setUint16(0x18, 0x003e, true); // minor version
  hv.setUint16(0x1a, 0x0003, true); // major version
  hv.setUint16(0x1c, 0xfffe, true); // little endian
  hv.setUint16(0x1e, 9, true); // 512-byte sectors
  hv.setUint16(0x20, 6, true); // 64-byte mini sectors
  hv.setUint32(0x2c, fatSectorCount, true);
  hv.setUint32(0x30, dirChain[0] ?? ENDOFCHAIN, true);
  hv.setUint32(0x38, MINI_CUTOFF, true);
  hv.setUint32(0x3c, miniFatChain[0] ?? ENDOFCHAIN, true);
  hv.setUint32(0x40, miniFatChain.length, true);
  hv.setUint32(0x44, ENDOFCHAIN, true); // no DIFAT sectors needed at this size
  hv.setUint32(0x48, 0, true);
  for (let i = 0; i < 109; i++) {
    hv.setUint32(0x4c + i * 4, fatSectorIds[i] ?? FREESECT, true);
  }

  // ---- assemble -----------------------------------------------------------
  const fatBytes = new Uint8Array(fat.buffer);
  const total = SECTOR + (contentSectors + fatSectorCount) * SECTOR;
  const out = new Uint8Array(total);
  out.set(header, 0);
  sectors.forEach((s, i) => out.set(s, SECTOR + i * SECTOR));
  out.set(fatBytes, SECTOR + contentSectors * SECTOR);
  return out.buffer;
}

/** One run of characters, written either as Windows-1252 or as UTF-16LE. */
export interface DocPiece {
  text: string;
  /** Default true: 8-bit. Set false to emit a UTF-16LE run. */
  compressed?: boolean;
}

export interface BuildDocOptions {
  pieces: DocPiece[];
  /** Defaults to Word 97. */
  nFib?: number;
  encrypted?: boolean;
  complex?: boolean;
  /** Defaults to the real character count; override to test clamping. */
  ccpText?: number;
  /** Which table stream to point the FIB at. Defaults to 1. */
  whichTable?: 0 | 1;
  /** Emit a Prc property blob ahead of the piece table. */
  prcGrpprl?: Uint8Array;
  /** Override the declared lcbClx, to truncate the piece table. */
  lcbClx?: number;
  /**
   * Override csw / cslw. The FIB is laid out to match, so these change where
   * fibRgFcLcb lands rather than corrupting the header.
   */
  csw?: number;
  cslw?: number;
}

const FIB_CSW = 14;
const FIB_CSLW = 22;
const FIB_CB_RGFCLCB = 93;

/** Offsets of the variable-length FIB sections, for a given csw / cslw. */
const rgLwOf = (csw: number): number => 0x22 + csw * 2 + 2;
const rgFcLcbOf = (csw: number, cslw: number): number => rgLwOf(csw) + cslw * 4 + 2;
const TEXT_START = 0x400;

/** Write a `WordDocument` + table stream pair describing the given pieces. */
export function buildWordStreams(options: BuildDocOptions): CfbStream[] {
  const {
    pieces,
    nFib = 193,
    encrypted = false,
    complex = false,
    whichTable = 1,
    prcGrpprl,
    csw = FIB_CSW,
    cslw = FIB_CSLW,
  } = options;

  const RG_LW = rgLwOf(csw);
  const RG_FCLCB = rgFcLcbOf(csw, cslw);

  // ---- character data, laid out after the FIB ----------------------------
  const runs: { offset: number; length: number; compressed: boolean }[] = [];
  const chunks: Uint8Array[] = [];
  let cursor = TEXT_START;
  for (const piece of pieces) {
    const compressed = piece.compressed !== false;
    const bytes = compressed
      ? Uint8Array.from([...piece.text].map((c) => c.charCodeAt(0) & 0xff))
      : new Uint8Array(new Uint16Array([...piece.text].map((c) => c.charCodeAt(0))).buffer);
    runs.push({ offset: cursor, length: piece.text.length, compressed });
    chunks.push(bytes);
    cursor += bytes.length;
  }

  const wordDoc = new Uint8Array(cursor);
  const wv = new DataView(wordDoc.buffer);
  let writeAt = TEXT_START;
  for (const chunk of chunks) {
    wordDoc.set(chunk, writeAt);
    writeAt += chunk.length;
  }

  const ccpText = options.ccpText ?? pieces.reduce((n, p) => n + p.text.length, 0);

  wv.setUint16(0, 0xa5ec, true);
  wv.setUint16(2, nFib, true);
  // fWhichTblStm picks the table stream; add fComplex / fEncrypted when asked.
  wv.setUint16(
    0x0a,
    (whichTable ? 0x0200 : 0) | (encrypted ? 0x0100 : 0) | (complex ? 0x0004 : 0),
    true,
  );
  wv.setUint16(0x20, csw, true);
  wv.setUint16(RG_LW - 2, cslw, true);
  // fibRgLw97 puts ccpText fourth; a shorter cslw leaves it out entirely.
  if (cslw > 3) wv.setUint32(RG_LW + 3 * 4, ccpText, true);
  wv.setUint16(RG_FCLCB - 2, FIB_CB_RGFCLCB, true);

  // ---- the piece table, written into the table stream --------------------
  const plc = new Uint8Array((runs.length + 1) * 4 + runs.length * 8);
  const pv = new DataView(plc.buffer);
  let cp = 0;
  runs.forEach((run, i) => {
    pv.setUint32(i * 4, cp, true);
    cp += run.length;
  });
  pv.setUint32(runs.length * 4, cp, true);
  runs.forEach((run, i) => {
    const base = (runs.length + 1) * 4 + i * 8;
    const fc = run.compressed ? (run.offset << 1) | 0x40000000 : run.offset;
    pv.setUint32(base + 2, fc >>> 0, true);
  });

  // A real Clx may carry Prc property blobs before the piece table.
  const prc = prcGrpprl ? new Uint8Array(3 + prcGrpprl.length) : new Uint8Array(0);
  if (prcGrpprl) {
    prc[0] = 0x01;
    new DataView(prc.buffer).setInt16(1, prcGrpprl.length, true);
    prc.set(prcGrpprl, 3);
  }

  const clx = new Uint8Array(prc.length + 5 + plc.length);
  clx.set(prc, 0);
  clx[prc.length] = 0x02;
  new DataView(clx.buffer).setUint32(prc.length + 1, plc.length, true);
  clx.set(plc, prc.length + 5);

  // Offset the Clx inside the table stream so fcClx is exercised, not assumed 0.
  const fcClx = 16;
  const table = new Uint8Array(fcClx + clx.length);
  table.set(clx, fcClx);
  wv.setUint32(RG_FCLCB + 33 * 8, fcClx, true);
  wv.setUint32(RG_FCLCB + 33 * 8 + 4, options.lcbClx ?? clx.length, true);

  return [
    { name: 'WordDocument', data: wordDoc },
    { name: whichTable ? '1Table' : '0Table', data: table },
  ];
}

/** Build a complete `.doc` file in one call. */
export function buildDoc(options: BuildDocOptions, extra: CfbStream[] = []): ArrayBuffer {
  return buildCfb([...buildWordStreams(options), ...extra]);
}

/** Build a Word 6.0/95 file, which stores text contiguously between fcMin and fcMac. */
export function buildWord95(text: string, complex = false): ArrayBuffer {
  const start = 0x200;
  const wordDoc = new Uint8Array(start + text.length);
  const wv = new DataView(wordDoc.buffer);
  wv.setUint16(0, 0xa5ec, true);
  wv.setUint16(2, 104, true);
  wv.setUint16(0x0a, complex ? 0x0004 : 0, true);
  wv.setUint32(0x18, start, true); // fcMin
  wv.setUint32(0x1c, start + text.length, true); // fcMac
  for (let i = 0; i < text.length; i++) wordDoc[start + i] = text.charCodeAt(i) & 0xff;
  return buildCfb([{ name: 'WordDocument', data: wordDoc }]);
}
