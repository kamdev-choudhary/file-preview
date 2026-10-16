import { el } from './dom.js';
import { icon } from './icons.js';
import { isPublicHttpUrl } from '../core/net.js';
import { Kind, formatBytes } from '../core/mime.js';
import type { Source } from '../core/source.js';
import type { PreviewConfig } from '../core/config.js';
import type { PreviewError } from '../core/errors.js';

/** Office file kinds the Microsoft viewer can actually open. */
const OFFICE_EXT = /^(docx?|docm|xlsx?|xlsm|xlsb|pptx?|pptm)$/i;

/**
 * The Office Online viewer renders a public URL server-side and gives
 * pixel-accurate output that no client-side parser can match. The catch is real
 * and worth stating plainly to the user: the URL is sent to Microsoft, and the
 * file must be publicly reachable. So this is always an explicit user action —
 * never something the library does on its own.
 */
export function canUseOfficeViewer(source: Source, config: PreviewConfig): boolean {
  return Boolean(
    config.officeViewer &&
      OFFICE_EXT.test(source.ext) &&
      source.url &&
      isPublicHttpUrl(source.url),
  );
}

export function officeViewerUrl(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

/** Swap the stage over to a Microsoft-hosted iframe render. */
export function officeFrame(source: Source): HTMLElement {
  const frame = el('iframe', {
    class: 'fp-frame',
    src: officeViewerUrl(source.url),
    title: `${source.name} — Microsoft Office viewer`,
    // The frame is third-party content; give it only what it needs.
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
    referrerPolicy: 'no-referrer',
    loading: 'eager',
  });
  return el('div', { class: 'fp-viewport fp-viewport--frame' }, [frame]);
}

function actionButton(
  label: string,
  iconName: string,
  onClick: () => void,
  variant = '',
): HTMLElement {
  return el('button', { class: `fp-btn ${variant}`.trim(), type: 'button', onClick }, [
    el('span', { class: 'fp-btn-icon', html: icon(iconName) }),
    el('span', { text: label }),
  ]);
}

export interface UnsupportedHandlers {
  onDownload?: (() => void) | null;
  onOfficeViewer?: (() => void) | null;
}

/**
 * Shown when no viewer can render the file. Not an error — the file is fine,
 * we just cannot draw it — so it reads as an offer, not a failure.
 */
export function unsupportedPanel(
  source: Source,
  { onDownload, onOfficeViewer }: UnsupportedHandlers = {},
): HTMLElement {
  const label = source.ext ? source.ext.toUpperCase() : 'FILE';
  return el('div', { class: 'fp-panel' }, [
    el('div', { class: 'fp-panel-badge', text: label.slice(0, 5) }),
    el('h3', { class: 'fp-panel-title', text: source.name }),
    el('p', {
      class: 'fp-panel-msg',
      text:
        `${formatBytes(source.size) || 'This file'}${source.size ? ' · ' : ''}` +
        'No preview is available for this file type.',
    }),
    el('div', { class: 'fp-panel-actions' }, [
      onDownload ? actionButton('Download', 'download', onDownload, 'is-primary') : null,
      onOfficeViewer ? actionButton('Open in Office viewer', 'external', onOfficeViewer) : null,
    ]),
  ]);
}

export interface ErrorHandlers {
  onRetry?: (() => void) | null;
  onDownload?: (() => void) | null;
  onOfficeViewer?: (() => void) | null;
  onOpenTab?: (() => void) | null;
}

/**
 * Error state. The recovery buttons are chosen from the error code, so the user
 * always gets the action that can actually help.
 */
export function errorPanel(
  error: PreviewError | null | undefined,
  source: Source | null | undefined,
  handlers: ErrorHandlers = {},
): HTMLElement {
  const { onRetry, onDownload, onOfficeViewer, onOpenTab } = handlers;
  const code = error?.code ?? 'UNKNOWN';

  const actions: HTMLElement[] = [];
  // Retrying a transient network problem is the first thing worth trying.
  if (onRetry && ['NETWORK', 'CORS', 'HTTP', 'UNKNOWN', 'DECODE', 'DEPENDENCY'].includes(code)) {
    actions.push(actionButton('Try again', 'retry', onRetry, 'is-primary'));
  }
  // A CORS block stops *us* reading the file; the browser can still open it.
  if (onOpenTab && ['CORS', 'NETWORK', 'HTTP'].includes(code)) {
    actions.push(actionButton('Open in new tab', 'external', onOpenTab));
  }
  if (onOfficeViewer) {
    actions.push(actionButton('Open in Office viewer', 'external', onOfficeViewer));
  }
  if (onDownload && code !== 'CORS') {
    actions.push(actionButton('Download', 'download', onDownload));
  }

  return el('div', { class: 'fp-panel fp-panel--error' }, [
    el('div', { class: 'fp-panel-icon', html: icon('alert') }),
    el('h3', {
      class: 'fp-panel-title',
      text: error?.message || 'This file could not be previewed.',
    }),
    error?.hint ? el('p', { class: 'fp-panel-msg', text: error.hint }) : null,
    el('p', {
      class: 'fp-panel-meta',
      text: `${source?.name || ''}${source?.name ? ' · ' : ''}${code}`,
    }),
    actions.length ? el('div', { class: 'fp-panel-actions' }, actions) : null,
  ]);
}

export interface LoadingPanel {
  node: HTMLElement;
  setStatus(text: string): void;
  setProgress(loaded: number, total: number | null): void;
}

/** Determinate when Content-Length was present, indeterminate otherwise. */
export function loadingPanel(): LoadingPanel {
  const bar = el('div', { class: 'fp-progress-bar' });
  const track = el('div', { class: 'fp-progress is-indeterminate' }, [bar]);
  const label = el('div', { class: 'fp-loading-label', text: 'Loading…' });
  const node = el('div', { class: 'fp-loading' }, [
    el('div', { class: 'fp-spinner', 'aria-hidden': 'true' }),
    label,
    track,
  ]);
  return {
    node,
    setStatus(text) {
      label.textContent = text || 'Loading…';
    },
    setProgress(loaded, total) {
      if (total && total > 0) {
        track.classList.remove('is-indeterminate');
        bar.style.width = `${Math.min(100, (loaded / total) * 100).toFixed(1)}%`;
        label.textContent = `Downloading… ${formatBytes(loaded)} of ${formatBytes(total)}`;
      } else {
        label.textContent = `Downloading… ${formatBytes(loaded)}`;
      }
    },
  };
}

export { Kind };
