import { el, disposer } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';
import { parseCsv, toCsv } from '../core/csv.js';
import { Kind } from '../core/mime.js';
import type { ToolbarAction, ViewerContext, ViewerInstance } from '../core/registry.js';

/** One tab's worth of grid data, already capped to what we will render. */
interface SheetData {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
}

/**
 * Spreadsheets and delimited text, rendered as a real grid with sticky headers.
 *
 * Two paths:
 *   - CSV/TSV      built-in parser, zero dependencies
 *   - xlsx/xls/ods SheetJS, which the host application injects via
 *                  `configure({ loaders: { xlsx: () => import('xlsx') } })`
 *
 * SheetJS is not a hard dependency because its npm build is frozen at 0.18.5
 * with unfixed prototype-pollution and ReDoS advisories. Making it opt-in keeps
 * that decision — and that risk — with the application that chooses to take it.
 *
 * Only the active sheet is turned into DOM, and it is capped; a 200k-row export
 * would otherwise lock up the tab. The cap is always reported, never silent.
 */

const MAX_ROWS = 2000;
const MAX_COLS = 200;

/** Spreadsheet-style column label: 0 -> A, 26 -> AA. */
function colLabel(n: number): string {
  let s = '';
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const NUMERIC = /^-?[\d,]*\.?\d+(?:[eE][+-]?\d+)?%?$/;

export default async function sheetViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  let sheets: SheetData[];
  let copySource: (sheet: SheetData) => string;

  if (source.kind === Kind.CSV) {
    sheets = await loadDelimited(ctx);
    copySource = (s) => toCsv(s.rows);
  } else {
    const loaded = await loadWorkbook(ctx);
    sheets = loaded.sheets;
    copySource = loaded.toCsv;
  }

  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (!sheets.length) throw new PreviewError('EMPTY', 'This file has no data.');

  const viewport = el('div', { class: 'fp-viewport fp-viewport--sheet' });
  const gridHost = el('div', { class: 'fp-grid-host' });
  const tabs = el('div', { class: 'fp-tabs', role: 'tablist' });
  let notice: HTMLElement | null = null;
  const firstSheet = sheets[0];
  if (!firstSheet) throw new PreviewError('EMPTY', 'This file has no data.');
  let active: SheetData = firstSheet;

  function renderSheet(sheet: SheetData): void {
    active = sheet;
    gridHost.replaceChildren();
    notice?.remove();
    notice = null;

    if (!sheet.rows.length) {
      gridHost.append(el('div', { class: 'fp-empty', text: 'This sheet is empty.' }));
      ctx.setStatus('');
      return;
    }

    const cols = Math.min(
      sheet.totalCols ?? Math.max(...sheet.rows.map((r) => r.length)),
      MAX_COLS,
    );

    const table = el('table', { class: 'fp-grid' });
    const headRow = el('tr', {}, [el('th', { class: 'fp-grid-corner' })]);
    for (let c = 0; c < cols; c++) {
      headRow.append(el('th', { class: 'fp-grid-colhead', text: colLabel(c) }));
    }
    const tbody = el('tbody');

    sheet.rows.slice(0, MAX_ROWS).forEach((row, r) => {
      const tr = el('tr', {}, [el('th', { class: 'fp-grid-rowhead', text: String(r + 1) })]);
      for (let c = 0; c < cols; c++) {
        const raw = row[c];
        const value = raw == null ? '' : String(raw);
        const td = el('td', { text: value });
        if (value && NUMERIC.test(value.trim())) td.classList.add('is-num');
        tr.append(td);
      }
      tbody.append(tr);
    });

    table.append(el('thead', {}, [headRow]), tbody);
    gridHost.append(table);

    const shownRows = Math.min(sheet.rows.length, MAX_ROWS);
    if (sheet.totalRows > shownRows || (sheet.totalCols ?? cols) > cols) {
      notice = el('div', {
        class: 'fp-notice',
        text:
          `Showing ${shownRows.toLocaleString()} of ${sheet.totalRows.toLocaleString()} rows` +
          ` and ${cols} of ${sheet.totalCols ?? cols} columns. Download the file to see everything.`,
      });
      viewport.append(notice);
    }

    ctx.setStatus(
      `${sheet.totalRows.toLocaleString()} rows × ${(sheet.totalCols ?? cols).toLocaleString()} cols`,
    );
  }

  if (sheets.length > 1) {
    for (const sheet of sheets) {
      tabs.append(
        el('button', {
          class: 'fp-tab',
          type: 'button',
          role: 'tab',
          text: sheet.name,
          'aria-selected': String(sheet === active),
          onClick: (e: Event) => {
            for (const t of tabs.children) t.setAttribute('aria-selected', 'false');
            (e.currentTarget as HTMLElement).setAttribute('aria-selected', 'true');
            renderSheet(sheet);
          },
        }),
      );
    }
    viewport.append(tabs);
  }

  viewport.append(gridHost);
  container.append(viewport);
  renderSheet(active);

  const copyAction: ToolbarAction = {
    id: 'csv',
    label: 'Copy sheet as CSV',
    icon: 'copy',
    async run() {
      try {
        await navigator.clipboard.writeText(copySource(active));
        ctx.setStatus('Copied as CSV');
      } catch {
        ctx.setStatus('Could not copy — clipboard access was denied');
      }
      setTimeout(() => renderSheet(active), 1800);
    },
  };

  return { element: viewport, actions: [copyAction], destroy: () => d.run() };
}

/** CSV/TSV via the built-in parser. */
async function loadDelimited(ctx: ViewerContext): Promise<SheetData[]> {
  const { source, signal, config } = ctx;
  ctx.setStatus('Downloading…');
  const blob = await source.toBlob({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  const capped = blob.size > config.maxTextBytes;
  const text = await (capped ? blob.slice(0, config.maxTextBytes) : blob).text();

  ctx.setStatus('Parsing…');
  const delimiter = source.ext === 'tsv' ? '\t' : undefined;
  const { rows } = parseCsv(text, { delimiter });
  if (!rows.length) throw new PreviewError('EMPTY', 'This file has no rows.');

  return [
    {
      name: source.name,
      rows,
      totalRows: rows.length,
      totalCols: Math.max(...rows.map((r) => r.length)),
    },
  ];
}

/** Binary workbooks via a host-supplied SheetJS. */
async function loadWorkbook(
  ctx: ViewerContext,
): Promise<{ sheets: SheetData[]; toCsv: (sheet: SheetData) => string }> {
  const { source, signal, config } = ctx;
  const loader = config.loaders?.xlsx;

  if (typeof loader !== 'function') {
    throw new PreviewError('DEPENDENCY', 'Spreadsheet preview is not set up in this app.', {
      hint:
        'Binary spreadsheets need SheetJS, which is not bundled by default because ' +
        'its npm release has unfixed security advisories. Enable it with: ' +
        "configure({ loaders: { xlsx: () => import('xlsx') } })",
    });
  }

  ctx.setStatus('Loading spreadsheet engine…');
  // SheetJS is supplied by the host app, so it arrives as `unknown`. Narrow it
  // to the handful of members this viewer actually touches.
  let XLSX: SheetJsModule;
  try {
    const mod = (await loader()) as { default?: SheetJsModule } & SheetJsModule;
    XLSX = mod?.default && typeof mod.default.read === 'function' ? mod.default : mod;
    if (typeof XLSX?.read !== 'function') throw new Error('loader did not return SheetJS');
  } catch (err) {
    throw new PreviewError('DEPENDENCY', 'The spreadsheet engine could not be loaded.', {
      cause: err,
      hint: 'The configured `loaders.xlsx` did not resolve to a SheetJS module.',
    });
  }

  ctx.setStatus('Downloading…');
  const buf = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Parsing…');
  let wb: SheetJsWorkbook;
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/password|encrypt/i.test(message)) {
      throw new PreviewError('PASSWORD', 'This spreadsheet is password protected.', {
        cause: err,
        hint: 'Download it and open it in Excel or Numbers.',
      });
    }
    throw new PreviewError('DECODE', 'This spreadsheet could not be read.', {
      cause: err,
      hint: 'The file may be corrupt or in an unsupported variant of the format.',
    });
  }

  const sheets: SheetData[] = (wb.SheetNames || []).map((name) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { name, rows: [], totalRows: 0, totalCols: 0 };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const totalRows = range.e.r - range.s.r + 1;
    const totalCols = range.e.c - range.s.c + 1;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
      range: {
        s: range.s,
        e: { r: Math.min(range.e.r, range.s.r + MAX_ROWS - 1), c: range.e.c },
      },
    });
    return { name, rows, totalRows, totalCols };
  });

  return { sheets, toCsv: (s) => toCsv(s.rows) };
}

/**
 * The slice of SheetJS this viewer uses, typed structurally.
 *
 * `xlsx` is an optional peer that is deliberately not installed (see the module
 * comment), so we cannot import its types. Describing only what we call keeps
 * the contract explicit and means a wrong loader fails at the boundary rather
 * than somewhere deep in the render.
 */
interface SheetJsRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

interface SheetJsWorkbook {
  SheetNames: string[];
  Sheets: Record<string, { '!ref'?: string } | undefined>;
}

interface SheetJsModule {
  read(data: ArrayBuffer, opts: { type: string; cellDates: boolean; cellStyles: boolean }): SheetJsWorkbook;
  utils: {
    decode_range(ref: string): SheetJsRange;
    sheet_to_json(
      ws: unknown,
      opts: {
        header: 1;
        raw: boolean;
        defval: string;
        blankrows: boolean;
        range: { s: { r: number; c: number }; e: { r: number; c: number } };
      },
    ): string[][];
  };
}
