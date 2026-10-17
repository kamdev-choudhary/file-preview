import { describe as group, expect, it } from 'vitest';
import { css, modalCss } from '../src/ui/styles.js';

/** Top-level selectors and their declaration block, in source order. */
const rules = (sheet: string): Array<{ selector: string; body: string }> => {
  const out: Array<{ selector: string; body: string }> = [];
  // Strip comments first so a `{` inside prose cannot be mistaken for a block.
  const clean = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '{') {
      if (depth === 0) {
        selector = clean.slice(start, i).trim().replace(/\s+/g, ' ');
        start = i + 1;
      }
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        if (selector && !selector.startsWith('@')) {
          out.push({ selector, body: clean.slice(start, i) });
        }
        start = i + 1;
      }
    }
  }
  return out;
};

const declare = (sheet: string, selector: string): string =>
  rules(sheet)
    .filter((r) => r.selector === selector)
    .map((r) => r.body)
    .join(';');

group('component stylesheet', () => {
  /**
   * Two unrelated elements once both answered to `.fp-stage`: the element's own
   * absolutely-positioned mount point and the image viewer's zoom/pan wrapper.
   * The cascade merged them, so `inset: 0` escaped onto every image and pinned
   * it to the top-left corner where no centring rule could reach it. Nothing in
   * the build catches a selector collision, so assert it here.
   */
  it('declares every top-level selector exactly once', () => {
    const seen = new Map<string, number>();
    for (const { selector } of rules(css)) {
      seen.set(selector, (seen.get(selector) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([s]) => s)).toEqual([]);
  });

  it('keeps the mount point and the zoom target apart', () => {
    expect(declare(css, '.fp-stage')).toContain('inset: 0');
    // The image is the zoom target now; positioning it would undo the centring.
    expect(declare(css, '.fp-image')).toContain('transform');
    expect(declare(css, '.fp-image')).not.toMatch(/position:|inset:/);
  });

  /**
   * Percentage maxima need a definite containing block. The centred viewport
   * is one; an auto-sized wrapper inside it is not, which is how an oversized
   * video came to render at its intrinsic size and spill out of view.
   */
  it('fits content against the viewport, not a wrapper', () => {
    const centre = declare(css, '.fp-viewport--center');
    expect(centre).toContain('display: flex');
    expect(declare(css, '.fp-video')).toContain('max-height: 100%');
    // The inline image fits the viewport; the modal one fits the screen.
    expect(declare(css, ':host([inline]) .fp-image')).toContain('max-height: 100%');
    expect(declare(css, '.fp-image')).toMatch(/max-height:/);
    // Nothing may sit between the viewport and the content it has to measure.
    expect(css).not.toContain('fp-canvas');
  });

  it('centres the image viewport on both axes', () => {
    const centre = declare(css, '.fp-viewport--center');
    expect(centre).toContain('justify-content: center');
    expect(centre).toContain('align-items: center');
  });

  it('start-aligns per axis, not on zoom alone', () => {
    expect(declare(css, '.fp-viewport--center.is-overflow-x')).toContain(
      'justify-content: flex-start',
    );
    expect(declare(css, '.fp-viewport--center.is-overflow-y')).toContain('align-items: flex-start');
    // Zoom controls the cursor only; alignment follows the measured overflow.
    const zoomed = declare(css, '.fp-viewport--center.is-zoomed');
    expect(zoomed).not.toMatch(/align-items|justify-content/);
  });

  /**
   * Zoom scales the fitted layout box. Dropping the image's max-width/height
   * while zoomed would snap a downscaled photo to its natural size first, so a
   * 1.25x step on a 6000px image became a jump of several hundred percent.
   */
  it('never releases the image fit constraints while zoomed', () => {
    for (const { selector, body } of rules(css)) {
      if (selector.includes('.fp-image') && selector.includes('is-zoomed')) {
        expect(body, selector).not.toMatch(/max-(width|height):\s*none/);
      }
    }
  });

  it('ships a separate host block for the modal shell', () => {
    expect(declare(modalCss, ':host')).toContain('position: fixed');
  });
});
