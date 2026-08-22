import { el, disposer } from '../ui/dom.js';
import { PreviewError, dependencyError } from '../core/errors.js';

/**
 * PowerPoint (.pptx/.pptm).
 *
 * There is no browser-native way to render a slide faithfully, and no small
 * library that does it well. So this viewer does the honest thing: it opens the
 * OOXML package directly, pulls each slide's text and images out in document
 * order, and lays them out as readable slide cards.
 *
 * That is a content preview, not a rendering — layout, theming, animation,
 * charts and SmartArt are not reproduced. The viewer says so in the UI and
 * points at the Office viewer for the real thing.
 */

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

export default async function pptxViewer(ctx) {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Loading presentation engine…');
  let JSZip;
  try {
    ({ default: JSZip } = await import('jszip'));
  } catch (err) {
    throw dependencyError('jszip', err);
  }

  ctx.setStatus('Downloading…');
  const buf = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  ctx.setStatus('Reading slides…');
  let zip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (err) {
    throw new PreviewError('DECODE', 'This presentation could not be opened.', {
      cause: err,
      hint: 'It may be a legacy .ppt file renamed to .pptx, or the upload may be incomplete.',
    });
  }

  const slideFiles = Object.keys(zip.files)
    .filter((p) => SLIDE_RE.test(p))
    .sort((a, b) => Number(SLIDE_RE.exec(a)[1]) - Number(SLIDE_RE.exec(b)[1]));

  if (!slideFiles.length) {
    throw new PreviewError('EMPTY', 'No slides were found in this presentation.', {
      hint: 'The file may not be a PowerPoint presentation.',
    });
  }

  const parser = new DOMParser();
  const objectUrls = [];
  d.add(() => objectUrls.forEach((u) => URL.revokeObjectURL(u)));

  /** relationship id -> object URL, per slide */
  async function relMap(slidePath) {
    const relPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const relFile = zip.file(relPath);
    if (!relFile) return {};
    const doc = parser.parseFromString(await relFile.async('text'), 'application/xml');
    const map = {};
    for (const rel of doc.getElementsByTagName('Relationship')) {
      const target = rel.getAttribute('Target') || '';
      if (!/image/i.test(rel.getAttribute('Type') || '')) continue;
      const resolved = target.replace(/^\.\.\//, 'ppt/').replace(/^\//, '');
      map[rel.getAttribute('Id')] = resolved;
    }
    return map;
  }

  async function mediaUrl(path) {
    const file = zip.file(path);
    if (!file) return null;
    const blob = await file.async('blob');
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  }

  const deck = el('div', { class: 'fp-deck' });
  const viewport = el('div', { class: 'fp-viewport fp-viewport--doc' }, [
    el('div', { class: 'fp-notice' }, [
      'Content preview — text and images are extracted from the file. ' +
        'Slide layout, theming, charts and animations are not reproduced.',
    ]),
    deck,
  ]);

  let index = 0;
  for (const path of slideFiles) {
    index++;
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');

    let doc;
    try {
      doc = parser.parseFromString(await zip.file(path).async('text'), 'application/xml');
    } catch {
      continue; // a single unreadable slide should not kill the deck
    }

    const card = el('section', { class: 'fp-slide' }, [
      el('div', { class: 'fp-slide-num', text: `Slide ${index}` }),
    ]);
    const body = el('div', { class: 'fp-slide-body' });

    // Walk shapes in document order so text lands in roughly reading order.
    for (const sp of doc.getElementsByTagName('p:sp')) {
      const isTitle = Boolean(
        sp.querySelector('ph[type="title"], ph[type="ctrTitle"]') ||
          Array.from(sp.getElementsByTagName('p:ph')).some((ph) =>
            /^(title|ctrTitle)$/.test(ph.getAttribute('type') || ''),
          ),
      );

      const paragraphs = [];
      for (const p of sp.getElementsByTagName('a:p')) {
        const text = Array.from(p.getElementsByTagName('a:t'))
          .map((t) => t.textContent || '')
          .join('')
          .trim();
        if (text) paragraphs.push({ text, level: Number(p.querySelector('pPr')?.getAttribute('lvl') || 0) });
      }
      if (!paragraphs.length) continue;

      if (isTitle) {
        body.append(el('h2', { class: 'fp-slide-title', text: paragraphs.map((p) => p.text).join(' ') }));
      } else {
        const ul = el('ul', { class: 'fp-slide-list' });
        for (const p of paragraphs) {
          ul.append(el('li', { class: `is-lvl-${Math.min(p.level, 4)}`, text: p.text }));
        }
        body.append(ul);
      }
    }

    // Images referenced by this slide.
    const rels = await relMap(path);
    const figures = el('div', { class: 'fp-slide-media' });
    for (const blip of doc.getElementsByTagName('a:blip')) {
      const id =
        blip.getAttribute('r:embed') ||
        blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const target = rels[id];
      if (!target) continue;
      const url = await mediaUrl(target);
      if (url) figures.append(el('img', { class: 'fp-slide-img', src: url, alt: '', loading: 'lazy' }));
    }
    if (figures.childElementCount) body.append(figures);

    if (!body.childElementCount) {
      body.append(el('div', { class: 'fp-empty', text: 'This slide has no extractable text or images.' }));
    }

    // Presenter notes are genuinely useful and cheap to include.
    const notesPath = path.replace('ppt/slides/slide', 'ppt/notesSlides/notesSlide');
    const notesFile = zip.file(notesPath);
    if (notesFile) {
      const nDoc = parser.parseFromString(await notesFile.async('text'), 'application/xml');
      const notes = Array.from(nDoc.getElementsByTagName('a:t'))
        .map((t) => t.textContent || '')
        .join(' ')
        .trim();
      // Notes slides embed the slide number as a lone field; skip those.
      if (notes && notes.replace(/\d+/g, '').trim().length > 2) {
        body.append(
          el('details', { class: 'fp-slide-notes' }, [
            el('summary', { text: 'Presenter notes' }),
            el('p', { text: notes }),
          ]),
        );
      }
    }

    card.append(body);
    deck.append(card);
  }

  container.append(viewport);
  ctx.setStatus(`${slideFiles.length} slide${slideFiles.length === 1 ? '' : 's'}`);

  return { element: viewport, destroy: () => d.run() };
}
