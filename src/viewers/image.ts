import { el, disposer, attachZoomPan } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

/**
 * Images, including SVG.
 *
 * Loads straight from `displayUrl` so a remote image streams through the normal
 * <img> path — no fetch, no CORS requirement, no copy in JS memory. Only if
 * that fails do we fall back to downloading the bytes, which covers servers
 * that require auth headers an <img> tag cannot send.
 */
export default async function imageViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  const img = el('img', {
    class: 'fp-image',
    alt: source.name,
    decoding: 'async',
    draggable: false,
  });

  // The image is the flex item itself rather than sitting in a wrapper: that
  // is what lets its percentage max-width/max-height resolve against the
  // viewport, so an oversized image fits instead of overflowing.
  const viewport = el('div', { class: 'fp-viewport fp-viewport--center' }, [img]);

  const load = (src: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
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

  /**
   * Centre the image on whichever axis still has room, and start-align only
   * the one that does not. The image keeps its fitted layout box at every zoom
   * level (the transform is what grows), so the rendered size is that box
   * times the scale — compare it against the viewport's content box.
   */
  const syncAlignment = (scale: number): void => {
    const cs = getComputedStyle(viewport);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availX = viewport.clientWidth - (Number.isFinite(padX) ? padX : 0);
    const availY = viewport.clientHeight - (Number.isFinite(padY) ? padY : 0);
    // Sub-pixel slack: an image fitted to exactly 100% must not read as overflowing.
    const overX = img.clientWidth * scale > availX + 0.5;
    const overY = img.clientHeight * scale > availY + 0.5;
    viewport.classList.toggle('is-overflow-x', overX);
    viewport.classList.toggle('is-overflow-y', overY);
    /*
     * Scale about the centre on an axis with room to spare. Centring only the
     * layout box is not enough: the box keeps its fitted size at every zoom
     * level, so growing from a corner origin would walk the image down and to
     * the right of the centre it was placed at. An overflowing axis switches
     * back to the start edge, which is the anchor attachZoomPan computes its
     * scroll offsets from — and at the crossover the scaled size equals the
     * viewport, where both origins put the content in the same place.
     */
    img.style.transformOrigin = `${overX ? '0' : '50%'} ${overY ? '0' : '50%'}`;
  };

  let zoomListener: ((scale: number) => void) | null = null;
  const zoom = attachZoomPan(viewport, img, {
    onChange: (s) => {
      syncAlignment(s);
      zoomListener?.(s);
    },
  });
  d.add(zoom.destroy);

  ctx.setStatus(img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}` : '');

  container.append(viewport);
  // Alignment needs real layout, which only exists once we are in the document.
  syncAlignment(zoom.getScale());

  // A narrower viewport can push a fitted image into overflow at scale 1.
  const ro = new ResizeObserver(() => syncAlignment(zoom.getScale()));
  ro.observe(viewport);
  d.add(() => ro.disconnect());

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
