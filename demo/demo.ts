import { configure, formatBytes, openPreview, FilePreviewElement } from '../src/index.js';
import type { ChangeDetail, ErrorDetail, LoadDetail } from '../src/index.js';

import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import cssLang from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';

// Retain the custom element definition for the static <file-preview> tag.
void FilePreviewElement;

const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/**
 * Point pdf.js at the worker Vite emits from node_modules, instead of letting
 * the library fall back to its CDN. This is the exact line the docs tell
 * consumers to add, so the demo doubles as a test of that advice.
 */
configure({
  pdfWorkerSrc: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href,

  /**
   * Binary spreadsheets need SheetJS, which is deliberately not a dependency
   * (the npm build is frozen at 0.18.5 with unfixed advisories). Here we pull
   * the maintained build straight from SheetJS's own CDN. CSV, TSV and modern
   * .xlsx work without any of this.
   */
  loaders: {
    // A bare remote URL is not something the bundler can resolve, so it is
    // fetched at runtime via a dynamic specifier the bundler leaves alone.
    xlsx: () => import(/* @vite-ignore */ SHEETJS_CDN),
  },
});

/** Query helper that fails loudly instead of handing back null. */
const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`demo: no element matched "${sel}"`);
  return node;
};

// ------------------------------------------------------------- event log

const logEl = $('#log');
let logLines: string[] = [];

const escapeHtml = (s: unknown): string =>
  String(s).replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string,
  );

function log(kind: string, detail: unknown): void {
  const time = new Date().toLocaleTimeString();
  let body: string;

  if (kind === 'fp-error') {
    const { error } = detail as ErrorDetail;
    body = `<i>${escapeHtml(error?.code ?? '?')}</i> ${escapeHtml(error?.message ?? '')}`;
  } else if (kind === 'fp-load') {
    const { source, viewer } = detail as LoadDetail;
    const size = formatBytes(source?.size) || 'size unknown';
    body = `viewer=<b>${escapeHtml(viewer)}</b> ${escapeHtml(source?.name)} (${escapeHtml(size)})`;
  } else {
    const index = (detail as ChangeDetail | undefined)?.index;
    body = `index=${escapeHtml(index ?? 0)}`;
  }

  logLines = [`${time}  ${kind.padEnd(10)} ${body}`, ...logLines].slice(0, 60);
  logEl.innerHTML = logLines.join('\n');
}

const events = {
  onLoad: (d: LoadDetail) => log('fp-load', d),
  onError: (d: ErrorDetail) => log('fp-error', d),
  onChange: (d: ChangeDetail) => log('fp-change', d),
};

$('#log-clear').addEventListener('click', () => {
  logLines = [];
  logEl.textContent = 'Waiting for events…';
});

// --------------------------------------------------------------- samples

type Category = 'doc' | 'sheet' | 'image' | 'media' | 'code' | 'archive' | 'font';

interface Sample {
  file: string;
  label: string;
  cat: Category;
}

const SAMPLES: Sample[] = [
  { file: 'sample.pdf', label: 'PDF', cat: 'doc' },
  { file: 'sample.docx', label: 'Word', cat: 'doc' },
  { file: 'sample.pptx', label: 'Slides', cat: 'doc' },
  { file: 'sample.csv', label: 'CSV', cat: 'sheet' },
  { file: 'sample.png', label: 'Image', cat: 'image' },
  { file: 'sample.svg', label: 'Vector', cat: 'image' },
  { file: 'sample.md', label: 'Markdown', cat: 'code' },
  { file: 'sample.json', label: 'JSON', cat: 'code' },
  { file: 'sample.js', label: 'JavaScript', cat: 'code' },
  { file: 'sample.zip', label: 'Archive', cat: 'archive' },
];

// Vite serves `public/` from the configured base, which is "./" here so the
// demo also works from a project subpath on GitHub Pages. Resolving against
// BASE_URL rather than the server root is what makes that hold.
const sampleUrl = (f: string): string =>
  new URL(`samples/${f}`, new URL(import.meta.env.BASE_URL, location.href)).href;
const allSampleUrls = (): string[] => SAMPLES.map((s) => sampleUrl(s.file));

const extOf = (file: string): string => (file.split('.').pop() ?? '?').toLowerCase();

/** The page's one repeated component: an extension tile plus a label. */
function chip(ext: string, label: string, cat: Category): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'chip';
  el.dataset.cat = cat;
  const tile = document.createElement('span');
  tile.className = 'chip-ext';
  tile.textContent = ext;
  const text = document.createElement('span');
  text.textContent = label;
  el.append(tile, text);
  return el;
}

const heroSamples = $('#hero-samples');
SAMPLES.forEach((sample, i) => {
  const el = chip(extOf(sample.file), sample.label, sample.cat);
  // Opening the whole set as a gallery makes arrow-key navigation obvious.
  el.addEventListener('click', () => openPreview(allSampleUrls(), { index: i, ...events }));
  heroSamples.append(el);
});

// ---------------------------------------------------------------- inline

const inline = $<FilePreviewElement>('#inline');
inline.addEventListener('fp-load', (e) => log('fp-load', (e as CustomEvent).detail));
inline.addEventListener('fp-error', (e) => log('fp-error', (e as CustomEvent).detail));

const INLINE_SET: Sample[] = [
  { file: 'sample.pdf', label: 'PDF', cat: 'doc' },
  { file: 'sample.md', label: 'Markdown', cat: 'code' },
  { file: 'sample.csv', label: 'CSV', cat: 'sheet' },
  { file: 'sample.docx', label: 'Word', cat: 'doc' },
  { file: 'sample.png', label: 'Image', cat: 'image' },
  { file: 'sample.js', label: 'JavaScript', cat: 'code' },
];

const inlineChips = $('#inline-chips');
INLINE_SET.forEach((sample, i) => {
  const el = chip(extOf(sample.file), sample.label, sample.cat);
  el.classList.toggle('is-active', i === 0);
  el.addEventListener('click', () => {
    for (const c of inlineChips.children) c.classList.toggle('is-active', c === el);
    inline.file = sampleUrl(sample.file);
  });
  inlineChips.append(el);
});
inline.file = sampleUrl(INLINE_SET[0]!.file);

// --------------------------------------------------------- format listing

interface FormatRow {
  name: string;
  cat: Category;
  exts: string[];
  engine: string;
  fidelity: string;
}

const FORMATS: FormatRow[] = [
  {
    name: 'Images',
    cat: 'image',
    exts: ['png', 'jpg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tiff'],
    engine: 'Native decoding, with zoom and pan',
    fidelity: 'exact',
  },
  {
    name: 'PDF',
    cat: 'doc',
    exts: ['pdf'],
    engine: 'pdf.js, rendered one page at a time',
    fidelity: 'exact',
  },
  {
    name: 'Word',
    cat: 'doc',
    exts: ['docx', 'docm'],
    engine: 'mammoth, mapped to semantic HTML',
    fidelity: 'approximate',
  },
  {
    name: 'Legacy Word',
    cat: 'doc',
    exts: ['doc'],
    engine: 'Built-in OLE2 reader, no dependency',
    fidelity: 'text only',
  },
  {
    name: 'PowerPoint',
    cat: 'doc',
    exts: ['pptx', 'pptm'],
    engine: 'Built-in OOXML reader',
    fidelity: 'content only',
  },
  {
    name: 'Spreadsheets',
    cat: 'sheet',
    exts: ['xlsx', 'xlsm'],
    engine: 'Built-in OpenXML parser',
    fidelity: 'values',
  },
  {
    name: 'Legacy sheets',
    cat: 'sheet',
    exts: ['xls', 'ods'],
    engine: 'SheetJS, supplied by you',
    fidelity: 'opt-in',
  },
  {
    name: 'Delimited text',
    cat: 'sheet',
    exts: ['csv', 'tsv'],
    engine: 'Built-in RFC 4180 parser',
    fidelity: 'exact',
  },
  {
    name: 'Markdown',
    cat: 'code',
    exts: ['md', 'markdown', 'mdx'],
    engine: 'marked, sanitised with DOMPurify',
    fidelity: 'rendered',
  },
  {
    name: 'Code',
    cat: 'code',
    exts: ['ts', 'js', 'py', 'go', 'rs', 'java', 'sql', 'yaml', '+40 more'],
    engine: 'highlight.js',
    fidelity: 'highlighted',
  },
  {
    name: 'Structured data',
    cat: 'code',
    exts: ['json', 'jsonl', 'geojson'],
    engine: 'Built-in, pretty-printed',
    fidelity: 'exact',
  },
  {
    name: 'Video',
    cat: 'media',
    exts: ['mp4', 'webm', 'mov', 'ogv'],
    engine: 'Native player, streamed not buffered',
    fidelity: 'exact',
  },
  {
    name: 'Audio',
    cat: 'media',
    exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'],
    engine: 'Native player',
    fidelity: 'exact',
  },
  {
    name: 'Archives',
    cat: 'archive',
    exts: ['zip', 'jar'],
    engine: 'JSZip, listed not extracted',
    fidelity: 'file listing',
  },
  {
    name: 'Fonts',
    cat: 'font',
    exts: ['woff', 'woff2', 'ttf', 'otf'],
    engine: 'FontFace, shown as a live specimen',
    fidelity: 'specimen',
  },
];

const formatsGrid = $('#formats-grid');
for (const row of FORMATS) {
  const card = document.createElement('article');
  card.className = 'fmt';
  card.dataset.cat = row.cat;

  const top = document.createElement('div');
  top.className = 'fmt-top';
  const name = document.createElement('span');
  name.className = 'fmt-name';
  name.textContent = row.name;
  const fidelity = document.createElement('span');
  fidelity.className = 'fmt-fidelity';
  fidelity.textContent = row.fidelity;
  top.append(name, fidelity);

  const exts = document.createElement('div');
  exts.className = 'fmt-exts';
  for (const ext of row.exts) {
    const tag = document.createElement('span');
    tag.className = 'ext';
    tag.textContent = ext;
    exts.append(tag);
  }

  const engine = document.createElement('p');
  engine.className = 'fmt-engine';
  engine.textContent = row.engine;

  card.append(top, exts, engine);
  formatsGrid.append(card);
}

// ------------------------------------------------------------ edge cases

const EDGES = [
  {
    label: '404 Not Found',
    note: 'HTTP error, offers retry and download',
    open: () => openPreview(sampleUrl('does-not-exist.pdf'), events),
  },
  {
    label: 'Cross-origin blocked',
    note: 'CORS, offers opening in a new tab',
    open: () => openPreview('https://example.com/blocked-by-cors.docx', events),
  },
  {
    label: 'No viewer for this type',
    note: 'Falls back to a download card',
    open: () => {
      const blob = new Blob([new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])], {
        type: 'application/vnd.rar',
      });
      openPreview({ blob, name: 'legacy-archive.rar' }, events);
    },
  },
  {
    label: 'Corrupt PDF',
    note: 'Decode error, says what failed',
    open: () => {
      const blob = new Blob(['%PDF-1.4\nthis is not actually a pdf'], { type: 'application/pdf' });
      openPreview({ blob, name: 'broken.pdf' }, events);
    },
  },
  {
    label: 'Mislabelled file',
    note: 'A PNG named .txt still renders as an image',
    open: async () => {
      const res = await fetch(sampleUrl('sample.png'));
      const blob = await res.blob();
      openPreview({ blob, name: 'actually-an-image.txt' }, events);
    },
  },
  {
    label: 'Empty file',
    note: 'Zero bytes, says so rather than hanging',
    open: () => openPreview({ blob: new Blob([]), name: 'empty.csv' }, events),
  },
];

const edgeGrid = $('#errors');
for (const edge of EDGES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'edge';
  const title = document.createElement('span');
  title.className = 'edge-title';
  title.textContent = edge.label;
  const note = document.createElement('span');
  note.className = 'edge-note';
  note.textContent = edge.note;
  button.append(title, note);
  button.addEventListener('click', edge.open);
  edgeGrid.append(button);
}

// ----------------------------------------------------------- local files

const fileInput = $<HTMLInputElement>('#file-input');
$('#pick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length) openPreview(files, events);
  fileInput.value = '';
});

// The hero zone is its own drop target as well as the page-wide one, so the
// affordance and the behaviour are in the same place.
const tryZone = $('#try-zone');
tryZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  tryZone.classList.add('is-over');
});
tryZone.addEventListener('dragleave', () => tryZone.classList.remove('is-over'));
tryZone.addEventListener('drop', () => tryZone.classList.remove('is-over'));
tryZone.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('button')) fileInput.click();
});

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
  tryZone.classList.remove('is-over');
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length) openPreview(files, events);
});

// ------------------------------------------------------- code highlighting

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', cssLang);
hljs.registerLanguage('bash', bash);

for (const block of document.querySelectorAll<HTMLElement>('pre code[class*="language-"]')) {
  const lang = /language-(\w+)/.exec(block.className)?.[1];
  if (!lang || !hljs.getLanguage(lang)) continue;
  block.innerHTML = hljs.highlight(block.textContent ?? '', { language: lang }).value;
}

// ------------------------------------------------------------ copy buttons

for (const button of document.querySelectorAll<HTMLButtonElement>('.copy[data-copy], .code .copy')) {
  button.addEventListener('click', async () => {
    const text = button.dataset.copy ?? button.closest('.code')?.querySelector('code')?.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // A denied clipboard is not worth an error state.
    }
    const original = button.textContent;
    button.textContent = 'Copied';
    button.classList.add('is-done');
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('is-done');
    }, 1400);
  });
}

// ------------------------------------------------------------------- tabs

const tabs = $('#fw-tabs');
const tablist = tabs.querySelector('.tablist')!;
tablist.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
  if (!button) return;
  for (const t of tablist.querySelectorAll('[data-tab]')) {
    t.setAttribute('aria-selected', String(t === button));
  }
  for (const panel of tabs.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.classList.toggle('is-active', panel.dataset.panel === button.dataset.tab);
  }
});

// ------------------------------------------------------- scroll affordances

const nav = $('#nav');
const sentinel = document.createElement('div');
document.body.prepend(sentinel);
new IntersectionObserver(([entry]) => nav.classList.toggle('is-stuck', !entry!.isIntersecting), {
  rootMargin: '0px',
}).observe(sentinel);

/** Mark the link whose target is currently nearest the top of the viewport. */
function spy(links: NodeListOf<HTMLAnchorElement>): void {
  const targets = [...links]
    .map((link) => {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      const el = document.getElementById(id);
      return el ? { link, el } : null;
    })
    .filter((x): x is { link: HTMLAnchorElement; el: HTMLElement } => x !== null);

  if (!targets.length) return;

  const update = (): void => {
    let current = targets[0]!;
    for (const target of targets) {
      if (target.el.getBoundingClientRect().top <= 120) current = target;
    }
    for (const { link } of targets) link.classList.toggle('is-current', link === current.link);
  };

  update();
  addEventListener('scroll', update, { passive: true });
}

spy($('.nav-links').querySelectorAll('a'));
spy($('#toc-nav').querySelectorAll('a'));

// ------------------------------------------------------------------ theme

$('#nav-version').textContent = __APP_VERSION__;

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
