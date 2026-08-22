import { el, disposer, escapeHtml } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';
import { Kind, formatBytes } from '../core/mime.js';

/**
 * Plain text, source code, JSON and raw HTML.
 *
 * Highlighting is optional: highlight.js is imported lazily and only when the
 * file actually has a known language, so a 10 MB log file never pays for it.
 * Very large files are truncated with an explicit notice rather than locking
 * the main thread trying to lay out a million DOM nodes.
 */
export default async function textViewer(ctx) {
  const { source, container, signal, config } = ctx;
  const d = disposer();

  ctx.setStatus('Downloading…');
  const blob = await source.toBlob({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  const limit = config.maxTextBytes;
  const truncated = blob.size > limit;
  const slice = truncated ? blob.slice(0, limit) : blob;

  let text;
  try {
    text = await slice.text();
  } catch (err) {
    throw new PreviewError('DECODE', 'This file could not be read as text.', { cause: err });
  }

  // A lone replacement char is normal in valid text; a flood of them means we
  // guessed wrong about the encoding and should say so instead of showing mojibake.
  const replacement = (text.match(/�/g) || []).length;
  if (replacement > 0 && replacement / Math.max(text.length, 1) > 0.02) {
    throw new PreviewError('DECODE', 'This file does not appear to be UTF-8 text.', {
      hint: 'It may be binary, or use a legacy encoding this viewer cannot detect.',
    });
  }

  let lang = source.descriptor.lang;
  let body = text;

  // Pretty-print JSON so a minified payload is actually readable.
  if (source.kind === Kind.JSON && !/^\s*$/.test(text)) {
    lang = 'json';
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Invalid or NDJSON — show it verbatim rather than failing the preview.
    }
  }

  ctx.setStatus('');

  const code = el('code', { class: 'fp-code' });
  const pre = el('pre', { class: 'fp-pre' }, [code]);
  const gutter = el('div', { class: 'fp-gutter', 'aria-hidden': 'true' });
  const wrap = el('div', { class: 'fp-text' }, [gutter, pre]);
  const viewport = el('div', { class: 'fp-viewport fp-viewport--text' }, [wrap]);

  let highlighted = false;
  if (lang) {
    try {
      const { default: hljs } = await import('highlight.js/lib/common');
      if (hljs.getLanguage(lang)) {
        code.innerHTML = hljs.highlight(body, { language: lang, ignoreIllegals: true }).value;
        highlighted = true;
      }
    } catch {
      // Highlighting is a nicety; plain text is a perfectly good fallback.
    }
  }
  if (!highlighted) code.textContent = body;

  // Line numbers as a parallel column, so selecting the code never copies them.
  const lineCount = body.split('\n').length;
  gutter.innerHTML = Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join('');

  if (truncated) {
    viewport.append(
      el('div', { class: 'fp-notice' }, [
        `Showing the first ${formatBytes(limit)} of ${formatBytes(blob.size)}. Download the file to see all of it.`,
      ]),
    );
  }

  container.append(viewport);

  let wrapLines = false;
  const toggleWrap = {
    id: 'wrap',
    label: 'Wrap lines',
    icon: 'wrap',
    toggled: false,
    run() {
      wrapLines = !wrapLines;
      this.toggled = wrapLines;
      wrap.classList.toggle('is-wrapped', wrapLines);
    },
  };

  const copy = {
    id: 'copy',
    label: 'Copy',
    icon: 'copy',
    async run() {
      try {
        await navigator.clipboard.writeText(body);
        ctx.setStatus('Copied to clipboard');
        setTimeout(() => ctx.setStatus(''), 1600);
      } catch {
        ctx.setStatus('Could not copy — clipboard access was denied');
        setTimeout(() => ctx.setStatus(''), 2400);
      }
    },
  };

  return { element: viewport, actions: [toggleWrap, copy], destroy: () => d.run() };
}

export { escapeHtml };
