import { describe as group, expect, it } from 'vitest';
import docViewer from '../src/viewers/doc.js';
import { Source } from '../src/core/source.js';
import { getConfig } from '../src/core/config.js';
import { PreviewError } from '../src/core/errors.js';
import type { ViewerContext } from '../src/core/registry.js';
import { buildDoc } from './doc-fixture.js';

const PARA = '\r';
const CELL = '\x07';

/**
 * The `.doc` viewer needs no parsing engine — it turns {@link parseDoc} output
 * into DOM and nothing else — so unlike the other viewers it can be driven
 * directly under happy-dom.
 */
function mount(buffer: ArrayBuffer, signal = new AbortController().signal) {
  const container = document.createElement('div');
  const statuses: string[] = [];
  const ctx: ViewerContext = {
    source: new Source({ name: 'legacy.doc', blob: new Blob([buffer]) }),
    container,
    signal,
    config: getConfig(),
    setStatus: (text) => statuses.push(text),
    setProgress: () => {},
    requestFallback: () => {},
  };
  return { ctx, container, statuses };
}

const docOf = (text: string): ArrayBuffer => buildDoc({ pieces: [{ text }] });

group('doc viewer', () => {
  it('renders paragraphs into the shared document styling', async () => {
    const { ctx, container } = mount(docOf(`First.${PARA}Second.${PARA}`));
    await docViewer(ctx);

    const article = container.querySelector('article.fp-doc');
    expect(article).not.toBeNull();
    expect([...article!.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'First.',
      'Second.',
    ]);
  });

  it('renders a table as a real table element', async () => {
    const { container, ctx } = mount(docOf(`A${CELL}B${CELL}${CELL}C${CELL}D${CELL}${CELL}`));
    await docViewer(ctx);

    const rows = [...container.querySelectorAll('table tr')];
    expect(rows.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('pads a ragged table so every row has the same width', async () => {
    // Three cells then two: no uniform stride, so the rows come back ragged.
    const { container, ctx } = mount(
      docOf(`a${CELL}b${CELL}c${CELL}${CELL}d${CELL}e${CELL}${CELL}`),
    );
    await docViewer(ctx);

    const widths = [...container.querySelectorAll('table tr')].map(
      (tr) => tr.querySelectorAll('td').length,
    );
    expect(widths).toEqual([3, 3]);
  });

  it('keeps soft line breaks inside one paragraph', async () => {
    const { container, ctx } = mount(docOf(`Line one\x0Bline two${PARA}`));
    await docViewer(ctx);

    const p = container.querySelector('article.fp-doc > p')!;
    expect(p.querySelectorAll('br')).toHaveLength(1);
    expect(p.textContent).toBe('Line oneline two');
  });

  it('treats document text as text, never as markup', async () => {
    const { container, ctx } = mount(docOf(`<img src=x onerror=alert(1)>${PARA}`));
    await docViewer(ctx);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('article.fp-doc > p')!.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('always states that formatting was not reproduced', async () => {
    const { container, ctx } = mount(docOf(`Plain.${PARA}`));
    await docViewer(ctx);

    const notice = container.querySelector('details.fp-notice')!;
    expect(notice.querySelector('summary')!.textContent).toMatch(/text-only preview/i);
    expect(notice.textContent).toMatch(/formatting is not reproduced/i);
  });

  it('adds the parser warnings to the notice', async () => {
    const { container, ctx } = mount(docOf(`A${CELL}${CELL}`));
    await docViewer(ctx);

    expect(container.querySelector('details.fp-notice')!.textContent).toMatch(/table structure/i);
  });

  it('reports truncation when the configured cap cuts the document short', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}.${PARA}`).join('');
    const { container, ctx } = mount(docOf(long));
    // maxTextBytes halves into the character budget the viewer passes down.
    await docViewer({ ...ctx, config: { ...ctx.config, maxTextBytes: 200 } });

    expect(container.querySelector('details.fp-notice')!.textContent).toMatch(/only its first/i);
  });

  it('clears its status line and returns a destroyable instance', async () => {
    const { ctx, statuses } = mount(docOf(`Plain.${PARA}`));
    const instance = await docViewer(ctx);

    expect(statuses.at(-1)).toBe('');
    expect(instance.element).not.toBeNull();
    expect(() => instance.destroy?.()).not.toThrow();
  });

  it('propagates a parse failure rather than rendering an empty page', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const { ctx } = mount(zip.buffer);
    await expect(docViewer(ctx)).rejects.toThrow(PreviewError);
  });

  it('stops when the signal aborts before parsing', async () => {
    const controller = new AbortController();
    const { ctx } = mount(docOf(`Plain.${PARA}`), controller.signal);
    controller.abort();
    await expect(docViewer(ctx)).rejects.toThrow(DOMException);
  });
});
