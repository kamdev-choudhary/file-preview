import { el, disposer } from '../ui/dom.js';
import { PreviewError, dependencyError } from '../core/errors.js';

/**
 * PDF via pdf.js.
 *
 * Pages are rendered to <canvas> only as they scroll into view — a 400-page
 * document costs the same on open as a 2-page one. Each page keeps a
 * placeholder of the right aspect ratio so the scrollbar never jumps.
 */

let pdfjsPromise = null;

async function loadPdfjs(config) {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    let pdfjs;
    try {
      pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    } catch (err) {
      pdfjsPromise = null;
      throw dependencyError('pdfjs-dist', err);
    }
    pdfjs.GlobalWorkerOptions.workerSrc = resolveWorkerSrc(pdfjs, config);
    return pdfjs;
  })();
  return pdfjsPromise;
}

/**
 * pdf.js needs its worker as a separate URL, and there is no single expression
 * that every bundler resolves correctly. Try, in order: an explicit config
 * value, a bundler-resolved asset URL, then a CDN pinned to the exact version
 * that was imported (so worker and main never disagree).
 */
function resolveWorkerSrc(pdfjs, config) {
  if (config.pdfWorkerSrc) return config.pdfWorkerSrc;
  try {
    // Vite and Rollup rewrite this to the emitted asset; webpack 5 handles it too.
    return new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  } catch {
    return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
}

export default async function pdfViewer(ctx) {
  const { source, container, signal, config } = ctx;
  const d = disposer();

  ctx.setStatus('Loading PDF viewer…');
  const pdfjs = await loadPdfjs(config);

  ctx.setStatus('Downloading…');
  const data = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Rendering…');
  let doc;
  const task = pdfjs.getDocument({
    // pdf.js transfers and detaches this buffer; hand it a copy so a retry or a
    // "Download" click still has the original bytes to work with.
    data: data.slice(0),
    // CMaps (CJK text) and the standard-14 font data are separate assets.
    // Without standardFontDataUrl, documents relying on built-in fonts like
    // Helvetica render blank text. Both are version-pinned to the imported
    // build so the data can never disagree with the parser.
    cMapUrl: config.pdfCMapUrl ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl:
      config.pdfStandardFontDataUrl ??
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    isEvalSupported: false,
  });
  d.add(() => task.destroy?.());

  try {
    doc = await task.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new PreviewError('PASSWORD', 'This PDF is password protected.', {
        cause: err,
        hint: 'Preview is not available for encrypted files. Download it to open in a PDF reader.',
      });
    }
    if (err?.name === 'InvalidPDFException') {
      throw new PreviewError('DECODE', 'This file is not a valid PDF.', {
        cause: err,
        hint: 'It may have been truncated during upload, or it may not be a PDF at all.',
      });
    }
    throw new PreviewError('DECODE', 'This PDF could not be opened.', { cause: err });
  }

  d.add(() => doc.destroy?.());

  const total = doc.numPages;
  const scroller = el('div', { class: 'fp-viewport fp-pdf' });
  const pages = [];
  let scale = 1;
  let currentPage = 1;
  let pageListener = null;
  let zoomListener = null;
  // Once the user zooms deliberately, stop refitting on container resize.
  let userZoomed = false;

  // Base width so the document fills a comfortable column at scale 1.
  const first = await doc.getPage(1);
  const baseViewport = first.getViewport({ scale: 1 });
  const fitWidth = () => {
    const avail = scroller.clientWidth - 48;
    return avail > 0 ? Math.min(2, Math.max(0.4, avail / baseViewport.width)) : 1;
  };

  for (let n = 1; n <= total; n++) {
    const wrap = el('div', { class: 'fp-pdf-page', dataset: { page: String(n) } }, [
      el('div', { class: 'fp-pdf-page-num', text: String(n) }),
    ]);
    pages.push({ n, wrap, canvas: null, task: null, rendered: false });
    scroller.append(wrap);
  }

  const sizePlaceholders = () => {
    const ratio = baseViewport.height / baseViewport.width;
    const w = baseViewport.width * scale;
    for (const p of pages) {
      p.wrap.style.width = `${Math.round(w)}px`;
      if (!p.rendered) p.wrap.style.height = `${Math.round(w * ratio)}px`;
    }
  };

  async function renderPage(p) {
    if (p.rendered || signal.aborted) return;
    p.rendered = true; // claim it early so the observer cannot double-fire
    try {
      const page = await doc.getPage(p.n);
      const viewport = page.getViewport({ scale: scale * (globalThis.devicePixelRatio || 1) });
      const canvas = el('canvas', { class: 'fp-pdf-canvas' });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / (globalThis.devicePixelRatio || 1))}px`;
      canvas.style.height = `${Math.floor(viewport.height / (globalThis.devicePixelRatio || 1))}px`;

      p.task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await p.task.promise;
      if (signal.aborted) return;
      p.canvas?.remove();
      p.canvas = canvas;
      p.wrap.style.height = '';
      p.wrap.prepend(canvas);
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') {
        p.rendered = false;
        return;
      }
      p.rendered = false;
      p.wrap.append(el('div', { class: 'fp-pdf-page-error', text: `Page ${p.n} failed to render` }));
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const p = pages[Number(entry.target.dataset.page) - 1];
        if (entry.isIntersecting) {
          renderPage(p);
          // Track the page most in view for the toolbar counter.
          if (entry.intersectionRatio > 0.5 && p.n !== currentPage) {
            currentPage = p.n;
            pageListener?.(currentPage, total);
          }
        }
      }
    },
    { root: scroller, rootMargin: '200% 0px', threshold: [0, 0.5, 1] },
  );
  d.add(() => io.disconnect());

  const rerender = () => {
    for (const p of pages) {
      p.task?.cancel?.();
      p.canvas?.remove();
      p.canvas = null;
      p.rendered = false;
    }
    sizePlaceholders();
    // Repaint whatever is on screen right now.
    for (const p of pages) {
      const r = p.wrap.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (r.bottom > sr.top - 400 && r.top < sr.bottom + 400) renderPage(p);
    }
  };

  const setScale = (next) => {
    const clamped = Math.min(5, Math.max(0.25, next));
    if (Math.abs(clamped - scale) < 0.001) return;
    scale = clamped;
    zoomListener?.(scale);
    rerender();
  };

  container.append(scroller);

  // Size against the real layout, which only exists once we are in the DOM.
  scale = fitWidth();
  sizePlaceholders();
  for (const p of pages) io.observe(p.wrap);

  const ro = new ResizeObserver(() => {
    // Only refit while the user has not taken manual control of zoom.
    if (!userZoomed) {
      const next = fitWidth();
      if (Math.abs(next - scale) > 0.02) setScale(next);
    }
  });
  ro.observe(scroller);
  d.add(() => ro.disconnect());

  const manual = (fn) => () => {
    userZoomed = true;
    fn();
  };

  d.listen(
    scroller,
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      userZoomed = true;
      setScale(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false },
  );

  ctx.setStatus('');

  return {
    element: scroller,
    pageCount: total,
    zoomIn: manual(() => setScale(scale * 1.25)),
    zoomOut: manual(() => setScale(scale / 1.25)),
    zoomReset: () => {
      userZoomed = false;
      setScale(fitWidth());
    },
    onZoomChange: (cb) => {
      zoomListener = cb;
      cb(scale);
    },
    onPageChange: (cb) => {
      pageListener = cb;
      cb(currentPage, total);
    },
    goToPage: (n) => {
      const p = pages[Math.min(total, Math.max(1, n)) - 1];
      if (!p) return;
      renderPage(p);
      p.wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    destroy: () => {
      for (const p of pages) p.task?.cancel?.();
      d.run();
    },
  };
}
