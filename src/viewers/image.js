import { el, disposer, attachZoomPan } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';

/**
 * Images, including SVG.
 *
 * Loads straight from `displayUrl` so a remote image streams through the normal
 * <img> path — no fetch, no CORS requirement, no copy in JS memory. Only if
 * that fails do we fall back to downloading the bytes, which covers servers
 * that require auth headers an <img> tag cannot send.
 */
export default async function imageViewer(ctx) {
  const { source, container, signal } = ctx;
  const d = disposer();

  const img = el('img', {
    class: 'fp-image',
    alt: source.name,
    decoding: 'async',
    draggable: false,
  });

  const stage = el('div', { class: 'fp-stage' }, [img]);
  const viewport = el('div', { class: 'fp-viewport fp-viewport--center' }, [stage]);

  const load = (src) =>
    new Promise((resolve, reject) => {
      const onLoad = () => resolve();
      const onError = () => reject(new Error('decode failed'));
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
      d.add(() => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      });
      img.src = src;
    });

  ctx.setStatus('Loading image…');
  try {
    await load(source.displayUrl);
  } catch {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    // Direct load failed — the URL may need auth headers, or be blocked.
    // Buffer it and retry from a blob: URL before giving up.
    try {
      await source.toBlob({ signal, onProgress: ctx.setProgress });
      await load(source.objectUrl());
    } catch (err) {
      d.run();
      throw err instanceof PreviewError
        ? err
        : new PreviewError('DECODE', 'This image could not be displayed.', {
            cause: err,
            hint: 'The file may be corrupt, or in a format this browser does not support.',
          });
    }
  }

  if (signal.aborted) {
    d.run();
    throw new DOMException('aborted', 'AbortError');
  }

  let zoomListener = null;
  const zoom = attachZoomPan(viewport, stage, { onChange: (s) => zoomListener?.(s) });
  d.add(zoom.destroy);

  ctx.setStatus(
    img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}` : '',
  );

  container.append(viewport);

  return {
    element: viewport,
    zoomIn: zoom.zoomIn,
    zoomOut: zoom.zoomOut,
    zoomReset: zoom.zoomReset,
    onZoomChange: (cb) => {
      zoomListener = cb;
    },
    destroy: () => d.run(),
  };
}
