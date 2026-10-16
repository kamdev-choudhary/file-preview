import { el, disposer } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

const SPECIMEN = 'The quick brown fox jumps over the lazy dog';
const SIZES = [48, 32, 24, 18, 14];

/** Font files, shown as a live specimen using the FontFace API. */
export default async function fontViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Loading font…');
  const buf = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  // A unique family name keeps repeated previews from colliding in the registry.
  const family = `fp-font-${Math.random().toString(36).slice(2, 9)}`;
  let face: FontFace;
  try {
    face = new FontFace(family, buf);
    await face.load();
    document.fonts.add(face);
  } catch (err) {
    throw new PreviewError('DECODE', 'This font could not be loaded.', {
      cause: err,
      hint: 'The file may be corrupt, or use a format this browser does not accept.',
    });
  }
  d.add(() => {
    try {
      document.fonts.delete(face);
    } catch {
      /* already gone */
    }
  });

  const sample = el('div', { class: 'fp-font' }, [
    el('div', { class: 'fp-font-alphabet', style: { fontFamily: family } }, [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      el('br'),
      'abcdefghijklmnopqrstuvwxyz',
      el('br'),
      '0123456789 !?&@#$%()[]{}',
    ]),
    ...SIZES.map((size) =>
      el('div', { class: 'fp-font-row' }, [
        el('span', { class: 'fp-font-size', text: `${size}px` }),
        el('span', { style: { fontFamily: family, fontSize: `${size}px` }, text: SPECIMEN }),
      ]),
    ),
  ]);

  // Let the viewer double as a quick typing test.
  const editable = el('div', {
    class: 'fp-font-editable',
    contentEditable: 'true',
    spellcheck: false,
    style: { fontFamily: family },
    text: 'Click here and type to test the font…',
  });
  sample.append(el('div', { class: 'fp-font-label', text: 'Try it' }), editable);

  const viewport = el('div', { class: 'fp-viewport fp-viewport--doc' }, [sample]);
  container.append(viewport);
  ctx.setStatus('');

  return { element: viewport, destroy: () => d.run() };
}
