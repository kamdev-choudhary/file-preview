import { describe as group, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, toCsv } from '../src/core/csv.js';

group('detectDelimiter', () => {
  it('picks the comma in ordinary CSV', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('picks the tab in TSV', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('picks a semicolon in European CSV', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });

  it('ignores delimiters inside quoted fields', () => {
    expect(detectDelimiter('"a,b,c,d,e"\tx\ty')).toBe('\t');
  });

  it('defaults to comma when nothing stands out', () => {
    expect(detectDelimiter('single')).toBe(',');
  });
});

group('parseCsv', () => {
  it('parses the simple case', () => {
    expect(parseCsv('a,b\n1,2')).toMatchObject({
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      delimiter: ',',
      truncated: false,
    });
  });

  it('keeps delimiters inside quoted fields', () => {
    expect(parseCsv('name,note\nAda,"born 1815, London"').rows[1]).toEqual([
      'Ada',
      'born 1815, London',
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"she said ""hi"""').rows).toEqual([['she said "hi"']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('"line one\nline two",x').rows).toEqual([['line one\nline two', 'x']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM instead of leaking it into the first cell', () => {
    expect(parseCsv('﻿id,name').rows[0]).toEqual(['id', 'name']);
  });

  it('drops the single empty row a trailing newline produces', () => {
    expect(parseCsv('a\nb\n').rows).toEqual([['a'], ['b']]);
  });

  it('keeps genuinely empty fields', () => {
    expect(parseCsv('a,,c').rows).toEqual([['a', '', 'c']]);
  });

  it('keeps a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2').rows).toHaveLength(2);
  });

  it('honours an explicit delimiter over detection', () => {
    expect(parseCsv('a;b', { delimiter: ';' }).rows).toEqual([['a', 'b']]);
  });

  it('reports truncation when maxRows cuts the file short', () => {
    const out = parseCsv('1\n2\n3\n4\n', { maxRows: 2 });
    expect(out.rows).toEqual([['1'], ['2']]);
    expect(out.truncated).toBe(true);
  });

  it('does not report truncation when maxRows happens to match', () => {
    expect(parseCsv('1\n2', { maxRows: 5 }).truncated).toBe(false);
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('').rows).toEqual([]);
  });

  it('parses a ragged row without padding it', () => {
    expect(parseCsv('a,b,c\n1,2').rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
    ]);
  });
});

group('toCsv', () => {
  it('leaves plain values unquoted', () => {
    expect(toCsv([['a', 'b']])).toBe('a,b');
  });

  it('quotes only the cells that need it', () => {
    expect(toCsv([['plain', 'has,comma']])).toBe('plain,"has,comma"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it('quotes cells containing newlines', () => {
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"');
  });

  it('joins rows with CRLF', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv([[null, undefined, 'x']])).toBe(',,x');
  });

  it('escapes a regex-special delimiter safely', () => {
    expect(toCsv([['a|b', 'c']], '|')).toBe('"a|b"|c');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['id', 'note'],
      ['1', 'has,comma and "quotes"'],
      ['2', 'has\nnewline'],
    ];
    expect(parseCsv(toCsv(rows)).rows).toEqual(rows);
  });
});
