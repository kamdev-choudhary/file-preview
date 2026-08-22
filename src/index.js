import { FilePreviewElement } from './elements/file-preview.js';
import { FilePreviewModalElement } from './elements/file-preview-modal.js';
import { configure, getConfig } from './core/config.js';
import { registerViewer, listViewers } from './core/registry.js';
import { Source, toSource, toSources } from './core/source.js';
import { PreviewError } from './core/errors.js';
import { Kind, describe, formatBytes } from './core/mime.js';

export {
  FilePreviewElement,
  FilePreviewModalElement,
  configure,
  getConfig,
  registerViewer,
  listViewers,
  Source,
  toSource,
  toSources,
  PreviewError,
  Kind,
  describe,
  formatBytes,
};

/** One reusable modal per document — opening a second would fight over focus. */
let singleton = null;

function modal() {
  if (singleton?.isConnected) return singleton;
  singleton = document.createElement('file-preview-modal');
  document.body.append(singleton);
  return singleton;
}

/**
 * Open a file (or a gallery) in the full-screen modal.
 *
 * @param {any|any[]} input  URL string, File, Blob, ArrayBuffer, descriptor, or an array of them
 * @param {{
 *   index?: number,
 *   theme?: 'light'|'dark',
 *   onLoad?: (detail: any) => void,
 *   onError?: (detail: any) => void,
 *   onClose?: () => void,
 *   onChange?: (detail: any) => void,
 * }} [options]
 * @returns {{ close: () => void, go: (i: number) => void, element: FilePreviewModalElement }}
 */
export function openPreview(input, options = {}) {
  const host = modal();
  const { onLoad, onError, onClose, onChange, ...rest } = options;

  // Rebind per call so a second openPreview() does not accumulate listeners
  // from the first.
  const bind = (type, fn) => {
    if (!fn) return;
    const handler = (e) => fn(e.detail);
    host.addEventListener(type, handler);
    cleanup.push(() => host.removeEventListener(type, handler));
  };
  const cleanup = [];

  const onCloseOnce = () => {
    while (cleanup.length) cleanup.pop()();
    onClose?.();
  };
  host.addEventListener('fp-close', onCloseOnce, { once: true });
  cleanup.push(() => host.removeEventListener('fp-close', onCloseOnce));

  bind('fp-load', onLoad);
  bind('fp-error', onError);
  bind('fp-change', onChange);

  host.show(input, rest);

  return {
    element: host,
    close: () => host.close(),
    go: (i) => host.go(i),
  };
}

/** Alias that reads better for galleries. */
export const openGallery = openPreview;

/**
 * Render a file into an existing container, inline.
 *
 * @param {Element|string} target  Element or CSS selector
 * @param {any} input
 * @param {{ theme?: 'light'|'dark', toolbar?: boolean, bordered?: boolean, minHeight?: string }} [options]
 * @returns {FilePreviewElement}
 */
export function renderPreview(target, input, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new PreviewError('EMPTY', `No element matched "${target}".`);

  let element = host instanceof FilePreviewElement ? host : host.querySelector(':scope > file-preview');
  if (!element) {
    element = document.createElement('file-preview');
    host.append(element);
  }

  if (options.theme) element.setAttribute('theme', options.theme);
  if (options.toolbar === false) element.setAttribute('toolbar', 'false');
  if (options.bordered) element.setAttribute('bordered', '');
  if (options.minHeight) element.style.setProperty('--fp-min-height', options.minHeight);

  element.file = input;
  return element;
}

export default { openPreview, renderPreview, configure, registerViewer };
