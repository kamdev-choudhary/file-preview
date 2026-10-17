/**
 * Interactivity for the landing page.
 *
 * Astro renders the markup at build time, so this only has to attach
 * behaviour: the drop target, the sample chips, the inline switcher, the
 * deliberate failures and the event log. The library is aliased to `../src`
 * in astro.config.mjs, so the page exercises the real source rather than a
 * published build that may be a version behind.
 */
import { configure, formatBytes, openPreview, FilePreviewElement } from 'fileon';
import type { ChangeDetail, ErrorDetail, LoadDetail } from 'fileon';

// Retain the custom element definition for the static <file-preview> tag.
void FilePreviewElement;

const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/**
 * Binary spreadsheets need SheetJS, which is deliberately not a dependency of
 * the library (the npm build is frozen at 0.18.5 with unfixed advisories).
 * Here we pull the maintained build from SheetJS's own CDN. CSV, TSV and
 * modern .xlsx need none of this.
 */
configure({
  /*
   * Point pdf.js at the worker Vite emits from node_modules rather than
   * letting the library fall back to its CDN. This is the exact line the
   * configuration page tells readers to add, so the site doubles as a test
   * of that advice.
   */
  pdfWorkerSrc: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href,

  loaders: {
    // A bare remote URL is not something the bundler can resolve, so it is
    // fetched at runtime via a dynamic specifier the bundler leaves alone.
    xlsx: () => import(/* @vite-ignore */ SHEETJS_CDN),
  },
});

const $ = <T extends Element = HTMLElement>(sel: string): T | null =>
  document.querySelector<T>(sel);

const logEl = $('#log');

// Nothing below belongs to a docs page; bail rather than throwing on them.
if (logEl) {
  let lines: string[] = [];

  const escapeHtml = (s: unknown): string =>
    String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

  const log = (kind: string, detail: unknown): void => {
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
      body = `index=${escapeHtml((detail as ChangeDetail | undefined)?.index ?? 0)}`;
    }

    lines = [`${time}  ${kind.padEnd(10)} ${body}`, ...lines].slice(0, 60);
    logEl.innerHTML = lines.join('\n');
  };

  const events = {
    onLoad: (d: LoadDetail) => log('fp-load', d),
    onError: (d: ErrorDetail) => log('fp-error', d),
    onChange: (d: ChangeDetail) => log('fp-change', d),
  };

  $('#log-clear')?.addEventListener('click', () => {
    lines = [];
    logEl.textContent = 'Waiting for events…';
  });

  // ------------------------------------------------------------- samples

  const base = import.meta.env.BASE_URL;
  const sampleUrl = (file: string): string =>
    new URL(`samples/${file}`, new URL(base, location.href)).href;

  const heroChips = [...document.querySelectorAll<HTMLButtonElement>('.fo-chipline [data-index]')];
  const gallery = heroChips.map((c) => sampleUrl(c.dataset.file!));

  for (const chipEl of heroChips) {
    chipEl.addEventListener('click', () => {
      // Opening the whole set makes the gallery's arrow keys discoverable.
      openPreview(gallery, { index: Number(chipEl.dataset.index), ...events });
    });
  }

  // -------------------------------------------------------------- inline

  const inline = $<FilePreviewElement>('#inline');
  const inlineChips = $('#inline-chips');

  if (inline && inlineChips) {
    inline.addEventListener('fp-load', (e) => log('fp-load', (e as CustomEvent).detail));
    inline.addEventListener('fp-error', (e) => log('fp-error', (e as CustomEvent).detail));

    const chips = [...inlineChips.querySelectorAll<HTMLButtonElement>('[data-file]')];
    for (const chipEl of chips) {
      chipEl.addEventListener('click', () => {
        for (const other of chips) other.classList.toggle('is-active', other === chipEl);
        inline.file = sampleUrl(chipEl.dataset.file!);
      });
    }
    if (chips[0]) inline.file = sampleUrl(chips[0].dataset.file!);
  }

  // ---------------------------------------------------------- edge cases

  const EDGES: Record<string, () => void | Promise<void>> = {
    notfound: () => void openPreview(sampleUrl('does-not-exist.pdf'), events),
    cors: () => void openPreview('https://example.com/blocked-by-cors.docx', events),
    unsupported: () => {
      const blob = new Blob([new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])], {
        type: 'application/vnd.rar',
      });
      openPreview({ blob, name: 'legacy-archive.rar' }, events);
    },
    corrupt: () => {
      const blob = new Blob(['%PDF-1.4\nthis is not actually a pdf'], { type: 'application/pdf' });
      openPreview({ blob, name: 'broken.pdf' }, events);
    },
    mislabelled: async () => {
      const res = await fetch(sampleUrl('sample.png'));
      openPreview({ blob: await res.blob(), name: 'actually-an-image.txt' }, events);
    },
    empty: () => void openPreview({ blob: new Blob([]), name: 'empty.csv' }, events),
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-edge]')) {
    button.addEventListener('click', () => void EDGES[button.dataset.edge!]?.());
  }

  // --------------------------------------------------------- local files

  const fileInput = $<HTMLInputElement>('#file-input');
  const zone = $('#try-zone');

  if (fileInput) {
    $('#pick')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const files = [...(fileInput.files ?? [])];
      if (files.length) openPreview(files, events);
      fileInput.value = '';
    });

    // The hero zone is its own drop target as well as the page-wide one, so
    // the affordance and the behaviour sit in the same place.
    zone?.addEventListener('click', () => fileInput.click());
    zone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    });
    zone?.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  }

  const dropzone = $('#dropzone');
  let dragDepth = 0;

  addEventListener('dragenter', (e: DragEvent) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    dragDepth++;
    dropzone?.classList.add('is-active');
  });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone?.classList.remove('is-active');
  });
  addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone?.classList.remove('is-active');
    zone?.classList.remove('is-over');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) openPreview(files, events);
  });
}

// ------------------------------------------------------------- copy buttons
// These also appear on docs pages, so they live outside the guard above.

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy!);
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
