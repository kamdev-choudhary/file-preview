import { describe as group, expect, it, vi } from 'vitest';
import { attachZoomPan, disposer, el, escapeHtml } from '../src/ui/dom.js';
import { icon, icons } from '../src/ui/icons.js';

group('el', () => {
  it('creates the requested tag', () => {
    expect(el('div').tagName).toBe('DIV');
  });

  it('sets class, text and html', () => {
    expect(el('p', { class: 'a b' }).className).toBe('a b');
    expect(el('p', { text: 'hi' }).textContent).toBe('hi');
    expect(el('p', { html: '<b>hi</b>' }).innerHTML).toBe('<b>hi</b>');
  });

  it('assigns style objects and dataset', () => {
    expect(el('div', { style: { display: 'none' } }).style.display).toBe('none');
    expect(el('div', { dataset: { page: '3' } }).dataset.page).toBe('3');
  });

  it('binds onX props as listeners', () => {
    const onClick = vi.fn();
    el('button', { onClick }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('prefers a real property over an attribute', () => {
    const input = el('input', { type: 'number', value: '5' });
    expect(input.type).toBe('number');
    expect(input.value).toBe('5');
  });

  it('falls back to setAttribute for non-properties', () => {
    expect(el('div', { 'aria-label': 'x' }).getAttribute('aria-label')).toBe('x');
  });

  it('renders a boolean true as an empty attribute', () => {
    expect(el('div', { inert: true }).hasAttribute('inert')).toBe(true);
  });

  it('skips null, undefined and false props', () => {
    const node = el('div', { title: null, id: undefined, hidden: false });
    expect(node.hasAttribute('title')).toBe(false);
    expect(node.hasAttribute('id')).toBe(false);
    expect(node.hasAttribute('hidden')).toBe(false);
  });

  it('appends children, flattening and skipping empties', () => {
    const node = el('div', {}, ['a', null, undefined, false, el('span', { text: 'b' })]);
    expect(node.childNodes).toHaveLength(2);
    expect(node.textContent).toBe('ab');
  });
});

group('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;');
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<<')).toBe('&lt;&lt;&lt;');
  });
});

group('disposer', () => {
  it('runs added functions', () => {
    const d = disposer();
    const fn = vi.fn();
    d.add(fn);
    d.run();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns the function it was given', () => {
    const fn = vi.fn();
    expect(disposer().add(fn)).toBe(fn);
  });

  it('removes listeners it registered', () => {
    const d = disposer();
    const target = el('button');
    const handler = vi.fn();
    d.listen(target, 'click', handler);
    target.click();
    d.run();
    target.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('empties itself, so a second run is a no-op', () => {
    const d = disposer();
    const fn = vi.fn();
    d.add(fn);
    d.run();
    d.run();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('keeps going when one teardown throws', () => {
    const d = disposer();
    const after = vi.fn();
    d.add(after);
    d.add(() => {
      throw new Error('boom');
    });
    expect(() => d.run()).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it('tears down in reverse order of registration', () => {
    const order: number[] = [];
    const d = disposer();
    d.add(() => order.push(1));
    d.add(() => order.push(2));
    d.run();
    expect(order).toEqual([2, 1]);
  });
});

group('icon', () => {
  it('returns the named glyph', () => {
    expect(icon('close')).toBe(icons.close);
  });

  it('falls back to the generic file glyph', () => {
    expect(icon('nope')).toBe(icons.file);
    expect(icon(undefined)).toBe(icons.file);
  });

  it('marks every glyph aria-hidden, since each sits beside a label', () => {
    for (const [name, svg] of Object.entries(icons)) {
      expect(svg, name).toContain('aria-hidden="true"');
    }
  });
});

group('attachZoomPan', () => {
  const setup = () => {
    const content = el('div');
    const viewport = el('div', {}, [content]);
    document.body.append(viewport);
    return { viewport, content };
  };

  it('starts at scale 1', () => {
    const { viewport, content } = setup();
    expect(attachZoomPan(viewport, content).getScale()).toBe(1);
  });

  it('zooms in and out, and resets', () => {
    const { viewport, content } = setup();
    const z = attachZoomPan(viewport, content);
    z.zoomIn();
    expect(z.getScale()).toBeCloseTo(1.25);
    z.zoomOut();
    expect(z.getScale()).toBeCloseTo(1);
    z.setScale(3);
    z.zoomReset();
    expect(z.getScale()).toBe(1);
  });

  it('clamps to the configured bounds', () => {
    const { viewport, content } = setup();
    const z = attachZoomPan(viewport, content, { min: 0.5, max: 2 });
    z.setScale(99);
    expect(z.getScale()).toBe(2);
    z.setScale(0.01);
    expect(z.getScale()).toBe(0.5);
  });

  it('reports changes, but not no-op changes', () => {
    const { viewport, content } = setup();
    const onChange = vi.fn();
    const z = attachZoomPan(viewport, content, { onChange });
    z.setScale(2);
    z.setScale(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('writes the scale onto the content transform', () => {
    const { viewport, content } = setup();
    attachZoomPan(viewport, content).setScale(2);
    expect(content.style.transform).toBe('scale(2)');
    expect(content.style.transformOrigin).toBe('0 0');
  });

  it('flags the viewport as zoomed only above 1', () => {
    const { viewport, content } = setup();
    const z = attachZoomPan(viewport, content);
    z.setScale(2);
    expect(viewport.classList.contains('is-zoomed')).toBe(true);
    z.zoomReset();
    expect(viewport.classList.contains('is-zoomed')).toBe(false);
  });

  /**
   * The image viewer realigns the content from this callback, which moves it
   * inside the scroller. If the scroll offsets were written first the browser
   * would clamp them against the pre-realignment layout, so the transform and
   * the zoom flag must both be settled by the time listeners run.
   */
  it('notifies with the transform and zoom flag already applied', () => {
    const { viewport, content } = setup();
    const seen: Array<{ transform: string; zoomed: boolean }> = [];
    const z = attachZoomPan(viewport, content, {
      onChange: () =>
        seen.push({
          transform: content.style.transform,
          zoomed: viewport.classList.contains('is-zoomed'),
        }),
    });
    z.setScale(2);
    expect(seen).toEqual([{ transform: 'scale(2)', zoomed: true }]);
  });

  it('stops responding after destroy', () => {
    const { viewport, content } = setup();
    const onChange = vi.fn();
    const z = attachZoomPan(viewport, content, { onChange });
    z.destroy();
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, ctrlKey: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
