import { configure, formatBytes, openPreview } from '../src/index.js';
import type { ChangeDetail, ErrorDetail, FilePreviewElement, LoadDetail } from '../src/index.js';

/**
 * Point pdf.js at the worker Vite emits from node_modules, instead of letting
 * the library fall back to its CDN. This is the exact line the README tells
 * consumers to add, so the demo doubles as a test of that advice.
 */
configure({
  pdfWorkerSrc: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href,

  /**
   * Binary spreadsheets need SheetJS, which is deliberately not a dependency
   * (the npm build is frozen at 0.18.5 with unfixed advisories). Here we pull
   * the maintained build straight from SheetJS's own CDN. CSV and TSV work
   * without any of this.
   */
  loaders: {
    // A bare remote URL is not something the bundler can resolve, so it is
    // fetched at runtime via a dynamic specifier the bundler leaves alone.
    xlsx: () => import(/* @vite-ignore */ SHEETJS_CDN),
  },
});

const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/** Query helper that fails loudly instead of handing back null. */
const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`demo: no element matched "${sel}"`);
  return node;
};

const logEl = $('#log');
let logLines: string[] = [];

function log(kind: string, detail: unknown): void {
  const time = new Date().toLocaleTimeString();
  let line: string;
  if (kind === 'fp-error') {
    const { error } = detail as ErrorDetail;
    line = `${time}  ${kind.padEnd(10)} ${error?.code ?? '?'} — ${error?.message ?? ''}`;
  } else if (kind === 'fp-load') {
    const { source, viewer } = detail as LoadDetail;
    line = `${time}  ${kind.padEnd(10)} viewer="${viewer}" file="${source?.name}" (${formatBytes(source?.size) || 'size unknown'})`;
  } else {
    const index = (detail as ChangeDetail | undefined)?.index;
    line = `${time}  ${kind.padEnd(10)} ${JSON.stringify(index ?? {})}`;
  }
  logLines = [line, ...logLines].slice(0, 40);
  logEl.textContent = logLines.join('\n');
}

const events = {
  onLoad: (d: LoadDetail) => log('fp-load', d),
  onError: (d: ErrorDetail) => log('fp-error', d),
  onChange: (d: ChangeDetail) => log('fp-change', d),
};

// --------------------------------------------------------------- sample set

const SAMPLES = [
  {
    file: 'sample.png',
    label: 'PNG image',
    note: 'Zoom and pan · generated gradient',
  },
  {
    file: 'sample.svg',
    label: 'SVG vector',
    note: 'Scales without pixelation',
  },
  {
    file: 'sample.pdf',
    label: 'PDF document',
    note: '2 pages · lazily rendered',
  },
  {
    file: 'sample.docx',
    label: 'Word document',
    note: 'mammoth → semantic HTML',
  },
  {
    file: 'sample.pptx',
    label: 'PowerPoint deck',
    note: '3 slides · text + notes',
  },
  {
    file: 'sample.csv',
    label: 'CSV data',
    note: 'Built-in parser · quoted fields',
  },
  { file: 'sample.json', label: 'JSON', note: 'Pretty-printed + highlighted' },
  { file: 'sample.md', label: 'Markdown', note: 'Rendered and sanitised' },
  { file: 'sample.js', label: 'JavaScript', note: 'Syntax highlighted' },
  { file: 'sample.zip', label: 'ZIP archive', note: 'Browsable file listing' },
];

// Vite serves `public/` from the site root, so these are absolute paths.
const sampleUrl = (f: string): string => new URL(`/samples/${f}`, location.href).href;
const allSampleUrls = () => SAMPLES.map((s) => sampleUrl(s.file));

function extBadge(file: string): string {
  return (file.split('.').pop() || '?').toUpperCase();
}

const samplesEl = $('#samples');
SAMPLES.forEach((sample, i) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.type = 'button';
  card.innerHTML = `
    <span class="card-badge">${extBadge(sample.file)}</span>
    <span class="card-body">
      <span class="card-title"></span>
      <span class="card-note"></span>
    </span>`;
  card.querySelector('.card-title')!.textContent = sample.label;
  card.querySelector('.card-note')!.textContent = sample.note;
  // Opening the whole set as a gallery makes the arrow-key navigation obvious.
  card.addEventListener('click', () => openPreview(allSampleUrls(), { index: i, ...events }));
  samplesEl.append(card);
});

$('#open-gallery').addEventListener('click', () =>
  openPreview(allSampleUrls(), { index: 0, ...events }),
);

// ------------------------------------------------------------------ inline

const inline = $<FilePreviewElement>('#inline');
inline.addEventListener('fp-load', (e) => log('fp-load', (e as CustomEvent).detail));
inline.addEventListener('fp-error', (e) => log('fp-error', (e as CustomEvent).detail));

const INLINE_SET = [
  'sample.pdf',
  'sample.md',
  'sample.csv',
  'sample.docx',
  'sample.png',
  'sample.js',
];
const chips = $('#inline-chips');
INLINE_SET.forEach((file, i) => {
  const chip = document.createElement('button');
  chip.className = 'chip' + (i === 0 ? ' is-active' : '');
  chip.type = 'button';
  chip.textContent = file.replace('sample.', '');
  chip.addEventListener('click', () => {
    for (const c of chips.children) c.classList.toggle('is-active', c === chip);
    inline.file = sampleUrl(file);
  });
  chips.append(chip);
});
inline.file = sampleUrl(INLINE_SET[0]!);

// ------------------------------------------------------------- URL preview

$('#url-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $<HTMLInputElement>('#url-input').value.trim();
  if (url) openPreview(url, events);
});

// ---------------------------------------------------------- error showcase

const ERRORS = [
  {
    label: '404 Not Found',
    note: 'HTTP error → retry + download',
    open: () => openPreview(sampleUrl('does-not-exist.pdf'), events),
  },
  {
    label: 'Cross-origin blocked',
    note: 'CORS → open in new tab',
    open: () => openPreview('https://example.com/blocked-by-cors.docx', events),
  },
  {
    label: 'Unsupported type',
    note: 'No viewer → download card',
    open: () => {
      const blob = new Blob([new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])], {
        type: 'application/vnd.rar',
      });
      openPreview({ blob, name: 'legacy-archive.rar' }, events);
    },
  },
  {
    label: 'Corrupt PDF',
    note: 'Decode error → clear message',
    open: () => {
      const blob = new Blob(['%PDF-1.4\nthis is not actually a pdf'], {
        type: 'application/pdf',
      });
      openPreview({ blob, name: 'broken.pdf' }, events);
    },
  },
  {
    label: 'Mislabelled file',
    note: 'Magic bytes win over extension',
    open: async () => {
      // A real PNG named ".txt" — detection should still show the image.
      const res = await fetch(sampleUrl('sample.png'));
      const blob = await res.blob();
      openPreview({ blob, name: 'actually-an-image.txt' }, events);
    },
  },
  {
    label: 'Empty file',
    note: 'Zero bytes → honest message',
    open: () => openPreview({ blob: new Blob([]), name: 'empty.csv' }, events),
  },
];

const errorsEl = $('#errors');
for (const err of ERRORS) {
  const card = document.createElement('button');
  card.className = 'card card-error';
  card.type = 'button';
  card.innerHTML = `<span class="card-body">
      <span class="card-title"></span><span class="card-note"></span>
    </span>`;
  card.querySelector('.card-title')!.textContent = err.label;
  card.querySelector('.card-note')!.textContent = err.note;
  card.addEventListener('click', err.open);
  errorsEl.append(card);
}

// ---------------------------------------------------------- local files

const fileInput = $<HTMLInputElement>('#file-input');
$('#pick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length) openPreview(files, events);
  fileInput.value = '';
});

// Drag and drop anywhere on the page.
const dropzone = $('#dropzone');
let dragDepth = 0;

window.addEventListener('dragenter', (e: DragEvent) => {
  if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
  dragDepth++;
  dropzone.classList.add('is-active');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropzone.classList.remove('is-active');
});
window.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('is-active');
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length) openPreview(files, events);
});

// ------------------------------------------------------------------ theme

const themeBtn = $('#theme');
const stored = localStorage.getItem('fp-demo-theme');
if (stored) document.documentElement.dataset.theme = stored;

themeBtn.addEventListener('click', () => {
  const current =
    document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('fp-demo-theme', next);
  // Push the same choice into the components.
  inline.setAttribute('theme', next);
  document.querySelectorAll('file-preview-modal').forEach((m) => m.setAttribute('theme', next));
});
