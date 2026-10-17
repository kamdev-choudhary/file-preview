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
  </sheets>
</workbook>`,
    );

    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
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
    <numFmt numFmtId="165" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <cellXfs count="3">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
    <xf numFmtId="165"/>
  </cellXfs>
</styleSheet>`,
    );

    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C3"/>
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
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>Gadget</t></is></c>
      <c r="B3" t="b"><v>1</v></c>
      <c r="C3" t="e"><v>#N/A</v></c>
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

    expect(sheets).toHaveLength(2);

    const [sales, meta] = sheets;
    expect(sales?.name).toBe('Sales');
    expect(sales?.rows).toEqual([
      ['Item', 'Price', 'Date'],
      ['Widget Pro', '49.99', '2024-01-01'],
      ['Gadget', 'TRUE', '#N/A'],
    ]);
    expect(sales?.totalRows).toBe(3);
    expect(sales?.totalCols).toBe(3);

    expect(meta?.name).toBe('Meta');
    expect(meta?.rows).toEqual([['Formulas computed']]);
  });

  it('honors maxRows and maxCols options', async () => {
    const buf = await createMockWorkbook();
    const sheets = await parseXlsx(buf, { maxRows: 1, maxCols: 2 });

    const sales = sheets[0];
    expect(sales?.rows).toEqual([['Item', 'Price']]);
    expect(sales?.totalRows).toBe(3); // dimension preserved
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

  it('aborts when signal is triggered', async () => {
    const buf = await createMockWorkbook();
    const controller = new AbortController();
    controller.abort();

    await expect(parseXlsx(buf, { signal: controller.signal })).rejects.toThrow();
  });
});
