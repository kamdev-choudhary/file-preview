import { FilePreviewElement } from './elements/file-preview.js';
import { FilePreviewModalElement } from './elements/file-preview-modal.js';
import { configure, getConfig } from './core/config.js';
import { registerViewer, listViewers } from './core/registry.js';
import { Source, toSource, toSources } from './core/source.js';
import { PreviewError } from './core/errors.js';
import { Kind, describe, formatBytes } from './core/mime.js';

import type { PreviewInput } from './core/source.js';
import type { ChangeDetail } from './elements/file-preview-modal.js';
import type { ErrorDetail, LoadDetail } from './elements/file-preview.js';

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

export type { ChangeDetail, ErrorDetail, LoadDetail, PreviewInput };
export type { FileDescriptor, ReadOptions, SourceDefaults, SourceInit } from './core/source.js';
export type { PreviewConfig, XlsxLoader } from './core/config.js';
export type { PreviewErrorCode, PreviewErrorOptions } from './core/errors.js';
export type { FileKind, FileTypeDescriptor, SniffResult } from './core/mime.js';
export type {
  ToolbarAction,
  ViewerContext,
  ViewerDefinition,
  ViewerFactory,
  ViewerInstance,
} from './core/registry.js';
export type { ShowOptions } from './elements/file-preview-modal.js';

/** One reusable modal per document — opening a second would fight over focus. */
let singleton: FilePreviewModalElement | null = null;

function modal(): FilePreviewModalElement {
  if (singleton?.isConnected) return singleton;
  singleton = new FilePreviewModalElement();
  document.body.append(singleton);
  return singleton;
}

export interface OpenPreviewOptions {
  /** Which file in a gallery to open on. */
  index?: number;
  theme?: 'light' | 'dark';
  onLoad?(detail: LoadDetail): void;
  onError?(detail: ErrorDetail): void;
  onChange?(detail: ChangeDetail): void;
  onClose?(): void;
}

export interface PreviewHandle {
  element: FilePreviewModalElement;
  close(): void;
  go(index: number): void;
}

/** Open a file (or a gallery) in the full-screen modal. */
export function openPreview(
  input: PreviewInput | PreviewInput[],
  options: OpenPreviewOptions = {},
): PreviewHandle {
  const host = modal();
  const { onLoad, onError, onClose, onChange, ...rest } = options;

  const cleanup: Array<() => void> = [];

  // Rebind per call so a second openPreview() does not accumulate listeners
  // from the first.
  const bind = <T>(type: string, fn: ((detail: T) => void) | undefined): void => {
    if (!fn) return;
    const handler = (e: Event): void => fn((e as CustomEvent<T>).detail);
    host.addEventListener(type, handler);
    cleanup.push(() => host.removeEventListener(type, handler));
  };

  const onCloseOnce = (): void => {
    while (cleanup.length) cleanup.pop()?.();
    onClose?.();
  };
  host.addEventListener('fp-close', onCloseOnce, { once: true });
  cleanup.push(() => host.removeEventListener('fp-close', onCloseOnce));

  bind<LoadDetail>('fp-load', onLoad);
  bind<ErrorDetail>('fp-error', onError);
  bind<ChangeDetail>('fp-change', onChange);

  host.show(input, rest);

  return {
    element: host,
    close: () => host.close(),
    go: (i: number) => host.go(i),
  };
}

/** Alias that reads better for galleries. */
export const openGallery = openPreview;

export interface RenderPreviewOptions {
  theme?: 'light' | 'dark';
  toolbar?: boolean;
  bordered?: boolean;
  minHeight?: string;
}

/** Render a file into an existing container, inline. */
export function renderPreview(
  target: Element | string,
  input: PreviewInput,
  options: RenderPreviewOptions = {},
): FilePreviewElement {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new PreviewError('EMPTY', `No element matched "${String(target)}".`);

  let element =
    host instanceof FilePreviewElement
      ? host
      : host.querySelector<FilePreviewElement>(':scope > file-preview');
  if (!element) {
    element = new FilePreviewElement();
    host.append(element);
  }

  if (options.theme) element.setAttribute('theme', options.theme);
  if (options.toolbar === false) element.setAttribute('toolbar', 'false');
  if (options.bordered) element.setAttribute('bordered', '');
  if (options.minHeight) element.style.setProperty('--fp-min-height', options.minHeight);

  element.file = input;
  return element;
}

declare global {
  interface HTMLElementTagNameMap {
    'file-preview': FilePreviewElement;
    'file-preview-modal': FilePreviewModalElement;
  }
}

export default { openPreview, renderPreview, configure, registerViewer };
