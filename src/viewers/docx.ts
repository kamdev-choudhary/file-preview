import { el, disposer } from '../ui/dom.js';
import { PreviewError, dependencyError } from '../core/errors.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

/**
 * Word documents (.docx/.docm) via mammoth.
 *
 * mammoth deliberately maps Word's styling onto clean semantic HTML rather than
 * trying to reproduce the page. That gives a readable, responsive, selectable
 * document — but it is explicitly not pixel-accurate: headers/footers, exact
 * pagination, columns and text boxes are dropped. When fidelity matters the
 * toolbar's "Open in Office viewer" action is the honest answer, so we surface
 * any conversion warnings instead of hiding them.
 */
export default async function docxViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Loading document engine…');
  let mammoth: typeof import('mammoth/mammoth.browser.js').default;
  let DOMPurify: typeof import('dompurify').default;
  try {
    [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
      import('mammoth/mammoth.browser.js'),
      import('dompurify'),
    ]);
  } catch (err) {
    throw dependencyError('mammoth', err);
  }

  ctx.setStatus('Downloading…');
  const arrayBuffer = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Converting…');
  let result: import('mammoth/mammoth.browser.js').MammothResult;
  try {
    result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        // Inline images as data URIs so nothing has to be fetched later.
        convertImage: mammoth.images.imgElement(async (image) => {
          const b64 = await image.read('base64');
          return { src: `data:${image.contentType};base64,${b64}` };
        }),
        styleMap: [
          "p[style-name='Title'] => h1.fp-doc-title:fresh",
          "p[style-name='Subtitle'] => p.fp-doc-subtitle:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote.is-intense:fresh",
        ],
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/zip|end of central directory|corrupt/i.test(message)) {
      throw new PreviewError('DECODE', 'This document could not be opened.', {
        cause: err,
        hint: 'It may be a legacy .doc file renamed to .docx, or the upload may be incomplete.',
      });
    }
    throw new PreviewError('DECODE', 'This Word document could not be converted.', { cause: err });
  }

  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  const clean = DOMPurify.sanitize(result.value || '', {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });

  if (!clean.trim()) {
    throw new PreviewError('EMPTY', 'This document appears to be empty.', {
      hint: 'It may contain only images, text boxes or shapes, which this viewer cannot show. Try the Office viewer.',
    });
  }

  const article = el('article', { class: 'fp-doc', html: clean });
  for (const a of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
  }

  const page = el('div', { class: 'fp-page' }, [article]);
  const viewport = el('div', { class: 'fp-viewport fp-viewport--doc' }, [page]);

  // Tell the user when the conversion actually lost something.
  const warnings = (result.messages || []).filter((m) => m.type === 'warning');
  if (warnings.length) {
    const detail = el('details', { class: 'fp-notice fp-notice--collapsible' }, [
      el('summary', {
        text: `Approximate rendering — ${warnings.length} formatting ${warnings.length === 1 ? 'feature was' : 'features were'} simplified`,
      }),
      el(
        'ul',
        {},
        warnings.slice(0, 12).map((m) => el('li', { text: m.message })),
      ),
    ]);
    viewport.prepend(detail);
  }

  container.append(viewport);
  ctx.setStatus('');

  return { element: viewport, destroy: () => d.run() };
}
