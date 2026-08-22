# @quartix/file-preview

A framework-free web component that previews **almost any file** — images, PDFs, Word,
PowerPoint, spreadsheets, video, audio, code, Markdown, archives and fonts — from a URL,
a `File`, a `Blob`, an `ArrayBuffer` or a data URI.

Drop it inline in a page, or open it full-screen in a Drive-style modal.

```js
import { openPreview } from '@quartix/file-preview';

openPreview('https://example.com/report.pdf');
```

---

## Why this one

- **No framework.** Two custom elements. Works in React, Vue, Svelte, Angular, or plain HTML.
- **Nothing loads until it's needed.** The entry bundle is ~15 kB gzipped. pdf.js, mammoth
  and JSZip live in separate chunks fetched only when you actually open that file type.
- **Detection that isn't fooled.** Magic bytes outrank the file extension, which outranks the
  server's `Content-Type`. A PNG named `.txt` still renders as an image.
- **Errors you can act on.** Every failure is typed (`CORS`, `HTTP`, `PASSWORD`, `TOO_LARGE`…)
  and the panel offers the recovery that actually applies — retry, open in a new tab, download.
- **Styling stays yours.** Everything is in a shadow root; theme it with CSS custom properties.

---

## Install

```bash
npm install @quartix/file-preview
```

Binary spreadsheets (`.xlsx`, `.xls`, `.ods`) need one extra step — see
[Spreadsheets](#spreadsheets-xlsx-xls-ods). CSV and TSV work out of the box.

---

## Quick start

### Full-screen modal

```js
import { openPreview } from '@quartix/file-preview';

// A URL
openPreview('https://example.com/contract.docx');

// A File from an <input>
input.addEventListener('change', (e) => openPreview(e.target.files[0]));

// A gallery — arrow keys navigate
openPreview([fileA, fileB, fileC], { index: 1 });
```

### Inline in a page

```html
<file-preview src="/docs/handbook.pdf" bordered></file-preview>
```

```js
import '@quartix/file-preview';   // registers the elements
```

Or imperatively:

```js
import { renderPreview } from '@quartix/file-preview';

renderPreview('#viewer', myFile, { minHeight: '600px', bordered: true });
```

---

## Supported files

| Category | Formats | Engine | Fidelity |
| --- | --- | --- | --- |
| Images | png, jpg, gif, webp, avif, svg, bmp, ico, tiff¹ | native | exact, zoom + pan |
| PDF | pdf | pdf.js | exact, lazy per-page |
| Word | docx, docm | mammoth | **approximate** — semantic HTML, not page layout |
| PowerPoint | pptx, pptm | built-in OOXML reader | **content only** — text, images, notes |
| Spreadsheets | xlsx, xls, xlsb, ods | SheetJS *(opt-in)* | values as a grid |
| Delimited | csv, tsv | built-in parser | full, RFC 4180 |
| Markdown | md, markdown, mdx | marked + DOMPurify | rendered + sanitised |
| Code / text | 50+ extensions | highlight.js | syntax highlighted |
| Data | json, jsonl, geojson | built-in | pretty-printed |
| Video | mp4, webm, mov, ogv² | native | streams, no full download |
| Audio | mp3, wav, ogg, m4a, flac, opus | native | streams |
| Archives | zip, jar | JSZip | file listing |
| Fonts | woff, woff2, ttf, otf | FontFace | live specimen |

Anything unrecognised gets a clean download card rather than a broken view.

¹ TIFF and HEIC depend on browser support; Safari handles both, Chrome does not.
² `.mkv` and `.avi` are detected but usually cannot be decoded by browsers — the error says so explicitly.

### A note on Office fidelity

`.docx` and `.pptx` are converted **in the browser**, so nothing leaves the user's machine —
but they are not pixel-accurate. Word documents become clean semantic HTML (headings, tables,
bold/italic, inline images); page geometry, headers/footers and text boxes are dropped.
PowerPoint files give you text, images and presenter notes, not slide layout or theming.

When exact rendering matters and the file sits at a **public URL**, the toolbar offers
*Open in Microsoft Office viewer*, which renders it server-side at full fidelity. That sends
the URL to Microsoft, so it is always an explicit user action — never automatic. Disable it
entirely with `configure({ officeViewer: false })`.

---

## API

### `openPreview(input, options?)`

Opens the full-screen modal. Returns a handle.

```js
const handle = openPreview(files, {
  index: 0,
  theme: 'dark',
  onLoad:   ({ source, viewer }) => {},
  onError:  ({ source, error })  => console.warn(error.code, error.message),
  onChange: ({ index, source })  => {},
  onClose:  () => {},
});

handle.go(2);
handle.close();
```

`input` accepts a URL string, `File`, `Blob`, `ArrayBuffer`, a data URI, a descriptor object,
or an array of any of those.

### `renderPreview(target, input, options?)`

Renders inline into an element or selector. Returns the `<file-preview>` element.

```js
renderPreview('#viewer', '/report.pdf', {
  theme: 'dark',      // 'light' | 'dark' — omit to follow the OS
  toolbar: true,
  bordered: true,
  minHeight: '520px',
});
```

### Descriptor objects

When a URL alone doesn't carry enough information — no extension, a signed URL, or a private
endpoint that needs headers:

```js
openPreview({
  url: 'https://api.example.com/files/8fa21c',
  name: 'Q3 report.xlsx',        // gives the viewer an extension to work with
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  headers: { Authorization: `Bearer ${token}` },
  credentials: 'include',
});
```

### Elements

```html
<file-preview
  src="/file.pdf"
  name="Report.pdf"      <!-- overrides the name derived from the URL -->
  type="application/pdf" <!-- overrides the server's Content-Type -->
  theme="dark"
  toolbar="false"        <!-- hide the toolbar -->
  download="false"       <!-- hide the download button -->
  bordered
></file-preview>
```

```js
const el = document.querySelector('file-preview');

el.file = someBlob;        // assign any accepted input
el.source;                 // the resolved Source
el.reload();
el.clear();
await el.download();
```

**Events** (all bubble and cross the shadow boundary):

| Event | `detail` |
| --- | --- |
| `fp-load` | `{ source, viewer }` |
| `fp-error` | `{ source, error }` |
| `fp-close` | — |
| `fp-change` | `{ index, source }` (modal only) |

---

## Configuration

Call once at startup.

```js
import { configure } from '@quartix/file-preview';

configure({
  maxBytes: 100 * 1024 * 1024,   // refuse to buffer files larger than this
  maxTextBytes: 5 * 1024 * 1024, // truncate text/code past this
  officeViewer: true,            // allow the Microsoft viewer action
  credentials: 'same-origin',
  headers: { 'X-Tenant': 'acme' },
  locale: 'en-GB',
});
```

### pdf.js assets

By default pdf.js pulls its worker and font data from a version-pinned CDN. That works with no
setup, but **if you are offline, self-hosted, or run a strict CSP**, point it at local copies:

```js
configure({
  pdfWorkerSrc: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href,
});
```

That one line works in Vite, webpack 5 and Rollup. For full offline support, also copy
`node_modules/pdfjs-dist/standard_fonts/` and `cmaps/` into your public directory and set
`pdfStandardFontDataUrl` and `pdfCMapUrl`.

### Spreadsheets (xlsx, xls, ods)

Binary spreadsheets need SheetJS, which this package **deliberately does not bundle**.
The npm release of `xlsx` is frozen at 0.18.5 and carries two unfixed high-severity advisories
([prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
[ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)) that trigger while parsing untrusted
files — exactly what a file previewer does. Shipping it as a dependency would put that advisory
on every project that installs this one, so the choice stays yours.

**Recommended** — the maintained build from SheetJS's own CDN, which fixes both:

```js
configure({
  loaders: {
    xlsx: () => import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'),
  },
});
```

Or install it yourself and accept the npm version:

```bash
npm install xlsx
```

```js
configure({ loaders: { xlsx: () => import('xlsx') } });
```

Without this, `.xlsx` files show a clear message explaining the setup step.
**CSV and TSV never need it** — they use a built-in RFC 4180 parser.

---

## Theming

Override the custom properties on the element from ordinary CSS:

```css
file-preview {
  --fp-accent: #e11d48;
  --fp-radius: 16px;
  --fp-font: 'Inter', system-ui, sans-serif;
  --fp-min-height: 600px;
}
```

Useful tokens: `--fp-bg`, `--fp-bg-sunken`, `--fp-bg-raised`, `--fp-surface`, `--fp-border`,
`--fp-text`, `--fp-text-dim`, `--fp-accent`, `--fp-danger`, `--fp-radius`, `--fp-mono`.

Dark mode follows the OS. Force it with `theme="dark"` or `theme="light"`.

Shadow parts are exposed for structural tweaks:
`::part(toolbar)`, `::part(stage)`, `::part(content)`, `::part(controls)`,
`::part(backdrop)`, `::part(shell)`.

---

## Error handling

Every failure surfaces as a `PreviewError` with a stable `code`:

| Code | Meaning |
| --- | --- |
| `CORS` | The server did not allow this page to read the file |
| `HTTP` | Non-2xx response (`error.status` has the code) |
| `NETWORK` | Connection failed mid-transfer |
| `TOO_LARGE` | Exceeded `maxBytes` |
| `PASSWORD` | Encrypted PDF or workbook |
| `DECODE` | Corrupt or not the format it claimed |
| `UNSUPPORTED` | No viewer for this type |
| `DEPENDENCY` | A parser could not be loaded (e.g. SheetJS not configured) |
| `EMPTY` | Nothing to show |
| `ABORTED` | Superseded by another load, or closed |

```js
openPreview(url, {
  onError: ({ error }) => {
    if (error.code === 'CORS') showCorsHelp();
    else track('preview_failed', { code: error.code });
  },
});
```

A browser cannot distinguish a CORS rejection from a dead server — both surface as an opaque
`TypeError`. The `CORS` message says so honestly rather than guessing.

---

## Custom viewers

Register your own, or override a built-in by reusing its `id`. Highest score wins.

```js
import { registerViewer } from '@quartix/file-preview';

registerViewer({
  id: 'dicom',
  label: 'DICOM',
  match: (source) => (source.ext === 'dcm' ? 1 : 0),
  load: () => import('./dicom-viewer.js'),   // default export = factory
});
```

```js
// dicom-viewer.js
export default async function dicomViewer({ source, container, signal, setStatus }) {
  const buf = await source.arrayBuffer({ signal });
  const el = renderDicom(buf);
  container.append(el);
  return {
    element: el,
    destroy: () => el.remove(),
    actions: [{ id: 'invert', label: 'Invert', icon: 'fit', run: () => {} }],
  };
}
```

---

## Framework use

### React

```jsx
import { useEffect, useRef } from 'react';
import '@quartix/file-preview';

export function Preview({ file }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.file = file; }, [file]);
  return <file-preview ref={ref} bordered style={{ '--fp-min-height': '520px' }} />;
}
```

`openPreview()` works from anywhere — an event handler is usually simpler than mounting.

### Vue

```vue
<template>
  <file-preview :src="url" bordered />
</template>

<script setup>
import '@quartix/file-preview';
defineProps({ url: String });
</script>
```

Tell Vue the tags are custom elements:

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('file-preview') } } });
```

### Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the module or component that uses the tags.

---

## Keyboard

| Key | Action |
| --- | --- |
| `Esc` | Close the modal |
| `←` / `→` | Previous / next file in a gallery |
| `Tab` | Cycles within the modal (focus is trapped, and restored on close) |
| `Ctrl`/`⌘` + scroll | Zoom images and PDFs |

---

## Browser support

Modern evergreen browsers — Chrome, Edge, Firefox, Safari 16.4+. Requires ES modules, custom
elements, and shadow DOM. No IE, no legacy Edge.

---

## Security

Previewed files are untrusted input, and this library treats them that way:

- Markdown and `.docx` HTML are sanitised with **DOMPurify** before touching the DOM.
- The Office Online fallback runs in a sandboxed `<iframe>` with `referrerpolicy="no-referrer"`,
  and is only ever reachable by explicit user action.
- pdf.js runs with `isEvalSupported: false`.
- SheetJS is not bundled, for the reasons above.

Everything else is parsed locally — no file content is uploaded anywhere.

---

## Development

```bash
npm install
node scripts/make-samples.mjs   # generate test fixtures
npm run dev                     # demo at localhost:5173
npm run build                   # library build into dist/
```

---

## License

MIT
