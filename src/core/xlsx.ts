import { PreviewError, dependencyError } from './errors.js';

/** One tab's worth of spreadsheet grid data. */
export interface SheetData {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
}

export interface ParseXlsxOptions {
  maxRows?: number;
  maxCols?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_ROWS = 2000;
const DEFAULT_MAX_COLS = 200;

/** Convert spreadsheet column letters to 0-based column index: 'A' -> 0, 'Z' -> 25, 'AA' -> 26. */
export function colFromRef(ref: string): number {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      col = col * 26 + (code - 64);
    } else if (code >= 97 && code <= 122) {
      col = col * 26 + (code - 96);
    } else {
      break;
    }
  }
  return Math.max(0, col - 1);
}

/** Extract 0-based row index from cell reference like 'B12' -> 11. */
export function rowFromRef(ref: string): number {
  const digits = ref.replace(/^[A-Za-z]+/, '');
  const r = parseInt(digits, 10);
  return isNaN(r) ? 0 : Math.max(0, r - 1);
}

/** Format an Excel date serial number to YYYY-MM-DD or YYYY-MM-DD HH:mm. */
export function formatExcelDate(serial: number): string {
  // Excel epoch begins 1899-12-30 (accounts for Lotus 1-2-3 1900 leap-year bug).
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(serial);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const frac = serial - Math.floor(serial);
  if (frac > 1e-6) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return ss === '00' ? `${dateStr} ${hh}:${min}` : `${dateStr} ${hh}:${min}:${ss}`;
  }
  return dateStr;
}

/** Built-in Excel date/time format IDs. */
const BUILTIN_DATE_FMT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

function parseXml(xmlText: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is not available');
  }
  return new DOMParser().parseFromString(xmlText, 'application/xml');
}

let JSZipModule: typeof import('jszip') | null = null;
async function getJSZip(): Promise<typeof import('jszip')> {
  if (JSZipModule) return JSZipModule;
  try {
    const mod = await import('jszip');
    JSZipModule = mod.default || mod;
    return JSZipModule;
  } catch (err) {
    throw dependencyError('jszip', err);
  }
}

/**
 * Native, zero-dependency OpenXML XLSX workbook parser.
 *
 * Uses `jszip` (already bundled in fileon for Office docs and archives) and
 * native browser `DOMParser`. Avoids SheetJS entirely.
 */
export async function parseXlsx(
  buf: ArrayBuffer,
  opts: ParseXlsxOptions = {},
): Promise<SheetData[]> {
  const signal = opts.signal;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCols = opts.maxCols ?? DEFAULT_MAX_COLS;

  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const JSZip = await getJSZip();

  let zip: import('jszip');
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/password|encrypt/i.test(message)) {
      throw new PreviewError('PASSWORD', 'This spreadsheet is password protected.', { cause: err });
    }
    throw new PreviewError('DECODE', 'This spreadsheet could not be opened.', {
      cause: err,
      hint: 'The file may be corrupt or not a valid XLSX workbook.',
    });
  }

  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  // Check for encrypted package wrapper
  if (zip.file('EncryptedPackage') || zip.file('EncryptionInfo')) {
    throw new PreviewError('PASSWORD', 'This spreadsheet is password protected.');
  }

  const wbFile = zip.file('xl/workbook.xml');
  if (!wbFile) {
    throw new PreviewError('DECODE', 'This spreadsheet could not be read.', {
      hint: 'The file does not appear to be a valid XLSX workbook.',
    });
  }

  const wbXml = await wbFile.async('string');
  const wbDoc = parseXml(wbXml);

  // 1. Map relationship IDs to target worksheet files
  const relMap = new Map<string, string>();
  const relFile = zip.file('xl/_rels/workbook.xml.rels');
  if (relFile) {
    try {
      const relXml = await relFile.async('string');
      const relDoc = parseXml(relXml);
      const relationships = Array.from(relDoc.getElementsByTagName('Relationship'));
      for (const rel of relationships) {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        if (id && target) {
          let path = target.replace(/\\/g, '/');
          if (path.startsWith('/xl/')) {
            path = path.slice(1);
          } else if (!path.startsWith('xl/')) {
            path = `xl/${path}`;
          }
          relMap.set(id, path);
        }
      }
    } catch {
      // Non-fatal: fallback logic below handles missing rels
    }
  }

  // 2. Parse shared strings pool
  const sharedStrings: string[] = [];
  const sstFile = zip.file('xl/sharedStrings.xml');
  if (sstFile) {
    try {
      const sstXml = await sstFile.async('string');
      const sstDoc = parseXml(sstXml);
      const siElements = Array.from(sstDoc.getElementsByTagName('si'));
      for (const si of siElements) {
        const tElements = Array.from(si.getElementsByTagName('t'));
        let str = '';
        for (const t of tElements) {
          str += t.textContent || '';
        }
        sharedStrings.push(str);
      }
    } catch {
      // Non-fatal: cells will use raw values
    }
  }

  // 3. Parse styles to identify date cells
  const dateXfs = new Set<number>();
  const stylesFile = zip.file('xl/styles.xml');
  if (stylesFile) {
    try {
      const stylesXml = await stylesFile.async('string');
      const stylesDoc = parseXml(stylesXml);

      const customDateFmtIds = new Set<number>();
      const numFmts = Array.from(stylesDoc.getElementsByTagName('numFmt'));
      for (const numFmt of numFmts) {
        const fmtId = parseInt(numFmt.getAttribute('numFmtId') || '', 10);
        const code = numFmt.getAttribute('formatCode') || '';
        if (!isNaN(fmtId) && code) {
          const stripped = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
          if (/[ydhs]/i.test(stripped) || /mm/i.test(stripped)) {
            customDateFmtIds.add(fmtId);
          }
        }
      }

      const cellXfs = stylesDoc.getElementsByTagName('cellXfs')[0];
      if (cellXfs) {
        const xfElements = Array.from(cellXfs.getElementsByTagName('xf'));
        for (let i = 0; i < xfElements.length; i++) {
          const xf = xfElements[i];
          if (!xf) continue;
          const numFmtId = parseInt(xf.getAttribute('numFmtId') || '', 10);
          if (BUILTIN_DATE_FMT_IDS.has(numFmtId) || customDateFmtIds.has(numFmtId)) {
            dateXfs.add(i);
          }
        }
      }
    } catch {
      // Non-fatal: dates will render as serial numbers
    }
  }

  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  // 4. Parse sheets
  const sheetElements = Array.from(wbDoc.getElementsByTagName('sheet'));
  const sheets: SheetData[] = [];

  for (let i = 0; i < sheetElements.length; i++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

    const sheetEl = sheetElements[i];
    if (!sheetEl) continue;
    const name = sheetEl.getAttribute('name') || `Sheet ${i + 1}`;
    const sheetId = sheetEl.getAttribute('sheetId') || String(i + 1);
    const rId = sheetEl.getAttribute('r:id') || sheetEl.getAttribute('id');

    let sheetPath = (rId && relMap.get(rId)) || `xl/worksheets/sheet${sheetId}.xml`;
    let wsFile = zip.file(sheetPath);
    if (!wsFile) {
      wsFile = zip.file(`xl/worksheets/sheet${i + 1}.xml`);
    }

    if (!wsFile) {
      sheets.push({ name, rows: [], totalRows: 0, totalCols: 0 });
      continue;
    }

    const wsXml = await wsFile.async('string');
    const wsDoc = parseXml(wsXml);

    // Dimension bounds if specified
    const dimNode = wsDoc.getElementsByTagName('dimension')[0];
    const dimRef = dimNode?.getAttribute('ref');
    let dimTotalRows = 0;
    let dimTotalCols = 0;
    if (dimRef && dimRef.includes(':')) {
      const parts = dimRef.split(':');
      const start = parts[0];
      const end = parts[1];
      if (start && end) {
        dimTotalRows = Math.max(0, rowFromRef(end) - rowFromRef(start) + 1);
        dimTotalCols = Math.max(0, colFromRef(end) - colFromRef(start) + 1);
      }
    }

    const rowElements = Array.from(wsDoc.getElementsByTagName('row'));
    const rows: string[][] = [];
    let maxColsFound = 0;
    let totalRowCount = rowElements.length;

    for (let r = 0; r < rowElements.length; r++) {
      const rowEl = rowElements[r];
      if (!rowEl) continue;
      const rAttr = rowEl.getAttribute('r');
      const rowIdx = rAttr ? parseInt(rAttr, 10) - 1 : r;

      if (rowIdx >= maxRows) {
        totalRowCount = Math.max(totalRowCount, rowIdx + 1);
        continue;
      }

      while (rows.length < rowIdx) {
        rows.push([]);
      }

      const rowCells: string[] = [];
      const cellElements = Array.from(rowEl.getElementsByTagName('c'));

      for (const cellEl of cellElements) {
        const ref = cellEl.getAttribute('r');
        const colIdx = ref ? colFromRef(ref) : rowCells.length;

        if (colIdx >= maxCols) continue;

        while (rowCells.length < colIdx) {
          rowCells.push('');
        }

        const t = cellEl.getAttribute('t');
        const s = cellEl.getAttribute('s');
        let val = '';

        if (t === 's') {
          const v = cellEl.getElementsByTagName('v')[0]?.textContent?.trim();
          const idx = v ? parseInt(v, 10) : NaN;
          val = !isNaN(idx) && sharedStrings[idx] !== undefined ? (sharedStrings[idx] ?? '') : '';
        } else if (t === 'inlineStr') {
          const tNode = cellEl.getElementsByTagName('t')[0];
          val = tNode?.textContent || '';
        } else if (t === 'b') {
          const v = cellEl.getElementsByTagName('v')[0]?.textContent?.trim();
          val = v === '1' ? 'TRUE' : 'FALSE';
        } else if (t === 'str') {
          val = cellEl.getElementsByTagName('v')[0]?.textContent || '';
        } else if (t === 'e') {
          val = cellEl.getElementsByTagName('v')[0]?.textContent || '#ERROR';
        } else {
          const raw = cellEl.getElementsByTagName('v')[0]?.textContent?.trim() || '';
          if (raw && s && dateXfs.has(parseInt(s, 10))) {
            const num = Number(raw);
            val = !isNaN(num) ? formatExcelDate(num) : raw;
          } else {
            val = raw;
          }
        }

        rowCells[colIdx] = val;
        if (colIdx + 1 > maxColsFound) {
          maxColsFound = colIdx + 1;
        }
      }

      rows.push(rowCells);
    }

    const totalRows = Math.max(totalRowCount, rows.length, dimTotalRows);
    const totalCols = Math.max(maxColsFound, dimTotalCols);

    sheets.push({ name, rows, totalRows, totalCols });
  }

  return sheets;
}
