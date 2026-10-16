/**
 * Generates test fixtures into public/samples so the demo works offline and the
 * Office viewers can be exercised without hunting for real documents.
 *
 * These are synthetic minimum-viable files: valid enough to parse, not
 * representative of what Word or PowerPoint actually emit. Drag a real document
 * onto the demo to check fidelity.
 *
 *   node scripts/make-samples.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/samples');
mkdirSync(out, { recursive: true });

const write = (name, data) => {
  writeFileSync(resolve(out, name), data);
  console.log('  ', name);
};

// ---------------------------------------------------------------- plain text

write(
  'sample.md',
  `# Markdown sample

A preview of **GitHub-flavoured Markdown**, rendered and sanitised.

## Features

- Lazy-loaded viewers — this page did not download the PDF engine
- Tables, code, and task lists
- [Links open in a new tab](https://example.com)

### A table

| Format | Engine | Fidelity |
| ------ | ------ | -------- |
| PDF    | pdf.js | Exact |
| DOCX   | mammoth | Approximate |
| PPTX   | custom OOXML reader | Text + images |

### Task list

- [x] Detect the file type from magic bytes
- [x] Fall back when the extension lies
- [ ] Read your mind

### Code

\`\`\`js
import { openPreview } from '@quartix/file-preview';

openPreview('https://example.com/report.pdf', {
  onError: ({ error }) => console.warn(error.code, error.message),
});
\`\`\`

> Anything rendered here is sanitised with DOMPurify first — a previewed file
> is untrusted input by definition.
`,
);

write(
  'sample.json',
  JSON.stringify(
    {
      name: '@quartix/file-preview',
      detection: { order: ['magic bytes', 'extension', 'declared MIME'] },
      viewers: [
        'image',
        'pdf',
        'sheet',
        'docx',
        'pptx',
        'markdown',
        'text',
        'archive',
        'font',
        'media',
      ],
      limits: { maxBytes: 104857600, maxTextBytes: 5242880 },
      nested: { deeply: { values: [1, 2, 3, null, true], unicode: 'héllo — wörld ✓' } },
    },
    null,
    2,
  ),
);

write(
  'sample.csv',
  [
    'id,product,region,units,revenue,notes',
    '1,Widget,North,1240,15480.50,"Steady, no issues"',
    '2,Gadget,South,880,22990.00,"Contains a comma, and ""quotes"""',
    '3,Doohickey,East,0,0.00,Discontinued',
    '4,Thingamajig,West,2310,41200.75,"Multi-line',
    'note field"',
    '5,Gizmo,North,145,3620.25,',
  ].join('\n'),
);

write(
  'sample.js',
  `// Syntax highlighting comes from highlight.js, loaded only for code files.
export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

class Pipeline {
  #stages = [];
  use(stage) { this.#stages.push(stage); return this; }
  async run(input) {
    let value = input;
    for (const stage of this.#stages) value = await stage(value);
    return value;
  }
}

export default new Pipeline();
`,
);

// --------------------------------------------------------------------- SVG

write(
  'sample.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4d8bff"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="400" height="260" rx="16" fill="url(#g)"/>
  <circle cx="120" cy="110" r="52" fill="#fff" opacity=".9"/>
  <rect x="196" y="70" width="130" height="18" rx="9" fill="#fff" opacity=".85"/>
  <rect x="196" y="100" width="96" height="14" rx="7" fill="#fff" opacity=".6"/>
  <rect x="196" y="124" width="112" height="14" rx="7" fill="#fff" opacity=".6"/>
  <text x="200" y="215" font-family="system-ui, sans-serif" font-size="18"
        fill="#fff" text-anchor="middle">Scalable vector sample</text>
</svg>`,
);

// --------------------------------------------------------------------- PDF
// Hand-assembled so byte offsets in the xref table are exact.

function buildPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    null, // 4: page 1 content stream
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    null, // 6: page 2 content stream
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const page = (title, sub) =>
    `BT /F1 22 Tf 40 220 Td (${title}) Tj ET\n` +
    `BT /F1 12 Tf 40 190 Td (${sub}) Tj ET\n` +
    `1 0 0 RG 3 w 40 60 m 380 60 l S`;

  const stream = (content) => `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objects[3] = stream(page('Page one', 'Rendered by pdf.js, lazily per page.'));
  objects[5] = stream(page('Page two', 'Scroll to render - pages load on demand.'));

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
write('sample.pdf', buildPdf());

// -------------------------------------------------------------------- DOCX

const CT_DOCX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_ROOT = (target, type) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${type}" Target="${target}"/>
</Relationships>`;

const p = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p('Quarterly Summary', 'Title')}
    ${p('Generated fixture for the docx viewer', 'Subtitle')}
    ${p('Overview', 'Heading1')}
    ${p('This document is converted to semantic HTML by mammoth. Styling is mapped, not reproduced: page geometry, headers and footers are intentionally dropped.')}
    ${p('Findings', 'Heading1')}
    ${p('Revenue rose across every region except East, which was discontinued mid-quarter.')}
    ${p('Notes', 'Heading2')}
    ${p('For pixel-accurate rendering, use the "Open in Office viewer" action on a publicly reachable URL.')}
    <w:p><w:r><w:t xml:space="preserve">Bold and italic runs are preserved: </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t xml:space="preserve">, </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Region</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Units</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>North</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1385</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>South</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>880</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

const docx = new JSZip();
docx.file('[Content_Types].xml', CT_DOCX);
docx.file(
  '_rels/.rels',
  RELS_ROOT(
    'word/document.xml',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  ),
);
docx.file('word/document.xml', DOCUMENT_XML);
write('sample.docx', await docx.generateAsync({ type: 'nodebuffer' }));

// -------------------------------------------------------------------- PPTX

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PML = 'http://schemas.openxmlformats.org/presentationml/2006/main';

const textShape = (paras, isTitle) => `
  <p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${isTitle ? 2 : 3}" name="${isTitle ? 'Title' : 'Body'}"/>
      <p:nvPr>${isTitle ? '<p:ph type="title"/>' : '<p:ph type="body" idx="1"/>'}</p:nvPr>
    </p:nvSpPr>
    <p:txBody>
      <a:bodyPr/>
      ${paras
        .map(
          ({ text, lvl = 0 }) =>
            `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r><a:t>${text}</a:t></a:r></a:p>`,
        )
        .join('')}
    </p:txBody>
  </p:sp>`;

const slideXml = (title, bullets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="${PML}" xmlns:a="${A}"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    ${textShape([{ text: title }], true)}
    ${textShape(bullets, false)}
  </p:spTree></p:cSld>
</p:sld>`;

const notesXml = (text) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="${PML}" xmlns:a="${A}">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/>
    <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;

const pptx = new JSZip();
pptx.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`,
);
pptx.file(
  '_rels/.rels',
  RELS_ROOT(
    'ppt/presentation.xml',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  ),
);
pptx.file(
  'ppt/presentation.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="${PML}"/>`,
);

const decks = [
  [
    'Universal file preview',
    [
      { text: 'One component, every file type' },
      { text: 'Framework-free web component', lvl: 1 },
      { text: 'Lazy-loaded viewers', lvl: 1 },
    ],
  ],
  [
    'How detection works',
    [
      { text: 'Magic bytes first' },
      { text: 'Extension decides OOXML', lvl: 1 },
      { text: 'Declared MIME last', lvl: 1 },
      { text: 'A .txt that is really a PDF still renders as a PDF' },
    ],
  ],
  [
    'Fidelity caveat',
    [
      { text: 'Text and images are extracted from the package' },
      { text: 'Layout and theming are not reproduced', lvl: 1 },
      { text: 'Use the Office viewer for exact rendering', lvl: 1 },
    ],
  ],
];

decks.forEach(([title, bullets], i) => {
  const n = i + 1;
  pptx.file(`ppt/slides/slide${n}.xml`, slideXml(title, bullets));
  pptx.file(
    `ppt/slides/_rels/slide${n}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  pptx.file(
    `ppt/notesSlides/notesSlide${n}.xml`,
    notesXml(`Presenter note for slide ${n}: this text lives in notesSlide${n}.xml.`),
  );
});
write('sample.pptx', await pptx.generateAsync({ type: 'nodebuffer' }));

// ------------------------------------------------------------------- ZIP

const zip = new JSZip();
zip.file('README.md', '# Archive fixture\n\nListed by the archive viewer.\n');
zip.folder('src').file('index.js', 'export default 42;\n');
zip.folder('src').folder('utils').file('debounce.js', 'export const noop = () => {};\n');
zip.folder('assets').file('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
zip.file('package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2));
write('sample.zip', await zip.generateAsync({ type: 'nodebuffer' }));

// -------------------------------------------------------------------- PNG
// 1×1 transparent PNG is too boring to look at; build a small gradient by hand.

function buildPng(size = 256) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = Math.round((x / size) * 255);
      raw[o++] = Math.round((y / size) * 200) + 40;
      raw[o++] = 240 - Math.round(((x + y) / (2 * size)) * 180);
    }
  }
  const { deflateSync } = require('node:zlib');
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
write('sample.png', buildPng());

console.log('\nFixtures written to public/samples');
