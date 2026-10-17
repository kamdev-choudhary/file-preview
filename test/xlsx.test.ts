import { describe as group, expect, it } from 'vitest';
import JSZip from 'jszip';
import { colFromRef, formatExcelDate, parseXlsx, rowFromRef } from '../src/core/xlsx.js';
import { PreviewError } from '../src/core/errors.js';

group('colFromRef', () => {
  it('converts column letters to 0-based indices', () => {
    expect(colFromRef('A')).toBe(0);
    expect(colFromRef('B')).toBe(1);
    expect(colFromRef('Z')).toBe(25);
    expect(colFromRef('AA')).toBe(26);
    expect(colFromRef('AB')).toBe(27);
    expect(colFromRef('AZ')).toBe(51);
    expect(colFromRef('BA')).toBe(52);
    expect(colFromRef('A1')).toBe(0);
    expect(colFromRef('BC42')).toBe(2 * 26 + 3 - 1);
    expect(colFromRef('ab')).toBe(27);
  });
});

group('rowFromRef', () => {
  it('extracts 0-based row indices', () => {
    expect(rowFromRef('A1')).toBe(0);
    expect(rowFromRef('B10')).toBe(9);
    expect(rowFromRef('AA100')).toBe(99);
    expect(rowFromRef('invalid')).toBe(0);
  });
});

group('formatExcelDate', () => {
  it('formats whole-day serial numbers to YYYY-MM-DD', () => {
    expect(formatExcelDate(45292)).toBe('2024-01-01');
  });

  it('formats fractional-day serial numbers with time', () => {
    expect(formatExcelDate(45292.5)).toBe('2024-01-01 12:00');
    expect(formatExcelDate(45292.5005)).toBe('2024-01-01 12:00:43');
  });

  it('returns original string if serial produces invalid date', () => {
    expect(formatExcelDate(NaN)).toBe('NaN');
  });
});

group('parseXlsx', () => {
  async function createMockWorkbook() {
    const zip = new JSZip();

    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sales" sheetId="1" r:id="rId1"/>
    <sheet name="Meta" sheetId="2" r:id="rId2"/>
    <sheet name="Missing" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`,
    );

    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>
</Relationships>`,
    );

    zip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Item</t></si>
  <si><t>Price</t></si>
  <si><r><t>Widget </t></r><r><t>Pro</t></r></si>
</sst>`,
    );

    zip.file(
      'xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="165" formatCode="[$-409]yyyy-mm-dd"/>
  </numFmts>
  <cellXfs count="4">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
    <xf numFmtId="165"/>
    <xf numFmtId="165"/>
  </cellXfs>
</styleSheet>`,
    );

    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C4"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1"><v>Date</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2"><v>49.99</v></c>
      <c r="C2" s="1"><v>45292</v></c>
    </row>
    <!-- Sparse row 4 (row 3 is skipped) with sparse col C (col B is skipped) -->
    <row r="4">
      <c r="A4" t="inlineStr"><is><t>Gadget</t></is></c>
      <c r="C4" s="2"><v>not-a-number</v></c>
      <c r="D4" t="s"><v>999</v></c>
      <c r="E4" t="b"><v>1</v></c>
      <c r="F4" t="e"><v>#N/A</v></c>
    </row>
  </sheetData>
</worksheet>`,
    );

    zip.file(
      'xl/worksheets/sheet2.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="str"><v>Formulas computed</v></c>
    </row>
  </sheetData>
</worksheet>`,
    );

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    return buf;
  }

  it('parses sheets, shared strings, cell types, and date styles', async () => {
    const buf = await createMockWorkbook();
    const sheets = await parseXlsx(buf);

    expect(sheets).toHaveLength(3);

    const [sales, meta, missing] = sheets;
    expect(sales?.name).toBe('Sales');
    expect(sales?.rows[0]).toEqual(['Item', 'Price', 'Date']);
    expect(sales?.rows[1]).toEqual(['Widget Pro', '49.99', '2024-01-01']);
    // Sparse row 3 is empty array
    expect(sales?.rows[2]).toEqual([]);
    // Sparse row 4 has skipped col B as ''
    expect(sales?.rows[3]).toEqual(['Gadget', '', 'not-a-number', '', 'TRUE', '#N/A']);
    expect(sales?.totalRows).toBe(4);

    expect(meta?.name).toBe('Meta');
    expect(meta?.rows).toEqual([['Formulas computed']]);

    expect(missing?.name).toBe('Missing');
    expect(missing?.rows).toEqual([]);
    expect(missing?.totalRows).toBe(0);
  });

  it('honors maxRows and maxCols options', async () => {
    const buf = await createMockWorkbook();
    const sheets = await parseXlsx(buf, { maxRows: 1, maxCols: 2 });

    const sales = sheets[0];
    expect(sales?.rows).toEqual([['Item', 'Price']]);
    expect(sales?.totalRows).toBe(4); // dimension preserved
  });

  it('throws PASSWORD on encrypted workbook files', async () => {
    const zip = new JSZip();
    zip.file('EncryptedPackage', 'encrypted content');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseXlsx(buf)).rejects.toThrow(PreviewError);
    await expect(parseXlsx(buf)).rejects.toMatchObject({ code: 'PASSWORD' });
  });

  it('throws DECODE on corrupt or invalid zip files', async () => {
    const corrupt = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await expect(parseXlsx(corrupt)).rejects.toThrow(PreviewError);
    await expect(parseXlsx(corrupt)).rejects.toMatchObject({ code: 'DECODE' });
  });

  it('throws DECODE on zip without xl/workbook.xml', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'not a workbook');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseXlsx(buf)).rejects.toMatchObject({ code: 'DECODE' });
  });

  it('falls back to default sheet paths when rels file is missing', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="Fallback" sheetId="1"/>
  </sheets>
</workbook>`,
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1"><v>Direct</v></c></row>
  </sheetData>
</worksheet>`,
    );
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const sheets = await parseXlsx(buf);
    expect(sheets[0]?.rows).toEqual([['Direct']]);
  });

  it('aborts when signal is triggered', async () => {
    const buf = await createMockWorkbook();
    const controller = new AbortController();
    controller.abort();

    await expect(parseXlsx(buf, { signal: controller.signal })).rejects.toThrow();
  });
});
