import { el, disposer } from '../ui/dom.js';
import { parseDoc, type DocBlock } from '../core/doc.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

/**
 * Legacy Word documents (.doc) via the built-in OLE2 reader.
 *
 * `.doc` predates OOXML, so mammoth — which unzips a `.docx` package — cannot
 * touch it. {@link parseDoc} reads the binary container directly and recovers
 * the text: paragraphs and table cells, no formatting. That is a content
 * preview, not a rendering, and this viewer says so rather than letting a
 * reader assume the original looked like this.
 *
 * Nothing here interpolates HTML — every string goes in as `textContent` — so
 * there is no sanitiser in this path and nothing for a crafted file to inject.
 */
export default async function docViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Downloading…');
  const buffer = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Reading document…');
  const { blocks, warnings, truncated } = parseDoc(buffer, {
    maxChars: Math.max(1, Math.floor(ctx.config.maxTextBytes / 2)),
    signal,
  });

  const article = el('article', { class: 'fp-doc' });
  for (const block of blocks) article.append(renderBlock(block));

  const page = el('div', { class: 'fp-page' }, [article]);
  const viewport = el('div', { class: 'fp-viewport fp-viewport--doc' }, [page]);

  const notes = [
    'Formatting is not reproduced: this reader recovers text, paragraphs and tables only.',
    ...warnings,
  ];
  if (truncated) {
    notes.push('The document was long, so only its first portion is shown.');
  }

  viewport.prepend(
    el('details', { class: 'fp-notice fp-notice--collapsible' }, [
      el('summary', { text: 'Text-only preview of a legacy .doc file' }),
      el(
        'ul',
        {},
        notes.map((n) => el('li', { text: n })),
      ),
    ]),
  );

  container.append(viewport);
  ctx.setStatus('');

  return { element: viewport, destroy: () => d.run() };
}

/**
 * Text may carry soft line breaks. Append it as text nodes plus `<br>` so the
 * document's own characters never reach an HTML parser.
 */
function appendLines(node: HTMLElement, text: string): HTMLElement {
  text.split('\n').forEach((line, i) => {
    if (i > 0) node.append(el('br'));
    node.append(document.createTextNode(line));
  });
  return node;
}

function renderBlock(block: DocBlock): HTMLElement {
  if (block.type === 'paragraph') return appendLines(el('p'), block.text);

  // Rows can come back ragged when a trailing cell was empty; pad them so the
  // grid lines up instead of collapsing on the short rows.
  const cols = block.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const tbody = el('tbody');
  for (const row of block.rows) {
    const tr = el('tr');
    for (let c = 0; c < cols; c++) tr.append(appendLines(el('td'), row[c] ?? ''));
    tbody.append(tr);
  }
  return el('table', {}, [tbody]);
}
