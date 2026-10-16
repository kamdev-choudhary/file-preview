/**
 * RFC 4180 CSV/TSV parser.
 *
 * Written by hand rather than pulled in as a dependency: it is ~60 lines, and
 * it means previewing a CSV — by far the most common data file — needs no
 * optional peer dependency at all.
 *
 * Handles quoted fields, embedded delimiters, embedded newlines, escaped
 * doubled quotes, and CRLF or LF line endings.
 */

export interface ParseCsvOptions {
  /** Force a delimiter instead of detecting one. */
  delimiter?: string | undefined;
  /** Stop after this many rows. */
  maxRows?: number | undefined;
}

export interface ParseCsvResult {
  rows: string[][];
  /** True when `maxRows` cut the input short. */
  truncated: boolean;
  delimiter: string;
}

/** Guess the delimiter by counting candidates outside quoted regions. */
export function detectDelimiter(sample: string): string {
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
      else if (ch === '\n' && !inQuotes && count > 0) break; // first row is enough
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string, opts: ParseCsvOptions = {}): ParseCsvResult {
  // A BOM would otherwise show up inside the first cell.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delimiter = opts.delimiter || detectDelimiter(text.slice(0, 8192));
  const maxRows = opts.maxRows ?? Infinity;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let truncated = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) {
        truncated = i < text.length - 1;
        break;
      }
    } else {
      field += ch;
    }
  }

  // Trailing field/row with no terminating newline.
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline produces one empty row; drop it.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === '') rows.pop();

  return { rows, truncated, delimiter };
}

/** Serialise back to CSV, quoting only where required. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>, delimiter = ','): string {
  const needsQuote = new RegExp(`["\\n\\r${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = cell == null ? '' : String(cell);
          return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delimiter),
    )
    .join('\r\n');
}
