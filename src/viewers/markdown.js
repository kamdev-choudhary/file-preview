import { el, disposer } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';

/**
 * Markdown, rendered.
 *
 * The output is sanitised with DOMPurify before it ever reaches the DOM —
 * a previewed file is untrusted input by definition, and it renders inside the
 * host page's shadow root, not a sandboxed frame.
 */
export default async function markdownViewer(ctx) {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Downloading…');
  const text = await source.text({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Rendering…');
  let html;
  try {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([
      import('marked'),
      import('dompurify'),
    ]);
    const raw = await marked.parse(text, { gfm: true, breaks: false, async: true });
    html = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'rel'],
    });
  } catch (err) {
    throw new PreviewError('DECODE', 'This Markdown file could not be rendered.', { cause: err });
  }

  const article = el('article', { class: 'fp-markdown', html });

  // Links inside a preview should never navigate the host page away.
  for (const a of article.querySelectorAll('a[href]')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
  }
  // Relative image paths cannot resolve for an uploaded file; flag them rather
  // than leaving a silent broken-image icon.
  for (const img of article.querySelectorAll('img')) {
    img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(
      el('span', { class: 'fp-inline-missing', text: `[missing image: ${img.getAttribute('src') || ''}]` }),
    ), { once: true });
  }

  const viewport = el('div', { class: 'fp-viewport fp-viewport--doc' }, [article]);
  container.append(viewport);
  ctx.setStatus('');

  let showSource = false;
  const sourceToggle = {
    id: 'source',
    label: 'View source',
    icon: 'code',
    toggled: false,
    run() {
      showSource = !showSource;
      this.toggled = showSource;
      this.label = showSource ? 'View rendered' : 'View source';
      article.classList.toggle('is-hidden', showSource);
      if (showSource && !viewport.querySelector('.fp-pre')) {
        viewport.append(el('pre', { class: 'fp-pre fp-pre--plain' }, [el('code', { text })]));
      } else {
        viewport.querySelector('.fp-pre')?.classList.toggle('is-hidden', !showSource);
      }
    },
  };

  return { element: viewport, actions: [sourceToggle], destroy: () => d.run() };
}
