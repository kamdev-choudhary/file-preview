/** Tiny DOM helpers shared by the viewers. No framework, no dependencies. */

/**
 * @param {string} tag
 * @param {Record<string, any>} [props] `class`, `text`, `html`, dataset, or any property/attribute
 * @param {(Node|string|null|undefined)[]} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // callers must pass sanitised HTML
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Escape for interpolation into an HTML string. */
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Bundle listeners/timers so a viewer's destroy() is one call. */
export function disposer() {
  const fns = [];
  return {
    add(fn) {
      fns.push(fn);
      return fn;
    },
    listen(target, type, handler, opts) {
      target.addEventListener(type, handler, opts);
      fns.push(() => target.removeEventListener(type, handler, opts));
    },
    run() {
      while (fns.length) {
        try {
          fns.pop()();
        } catch {
          /* a failing teardown must not block the rest */
        }
      }
    },
  };
}

/**
 * Pan + zoom behaviour shared by the image and PDF viewers.
 * Wheel/ctrl-wheel to zoom, drag to pan, double-click to toggle fit.
 *
 * @param {HTMLElement} viewport  Scroll/clip container
 * @param {HTMLElement} content   The thing that scales
 */
export function attachZoomPan(viewport, content, opts = {}) {
  const min = opts.min ?? 0.1;
  const max = opts.max ?? 8;
  const onChange = opts.onChange;
  let scale = 1;
  let panning = false;
  let startX = 0;
  let startY = 0;
  let scrollX = 0;
  let scrollY = 0;
  const d = disposer();

  const apply = (next, origin) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === scale) return;
    // Keep the point under the cursor stationary while scaling.
    const rect = viewport.getBoundingClientRect();
    const ox = origin ? origin.x - rect.left : rect.width / 2;
    const oy = origin ? origin.y - rect.top : rect.height / 2;
    const ratio = clamped / scale;
    const nextLeft = (viewport.scrollLeft + ox) * ratio - ox;
    const nextTop = (viewport.scrollTop + oy) * ratio - oy;
    scale = clamped;
    content.style.transform = `scale(${scale})`;
    content.style.transformOrigin = '0 0';
    viewport.scrollLeft = nextLeft;
    viewport.scrollTop = nextTop;
    viewport.classList.toggle('is-zoomed', scale > 1.001);
    onChange?.(scale);
  };

  d.listen(
    viewport,
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling
      e.preventDefault();
      apply(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), { x: e.clientX, y: e.clientY });
    },
    { passive: false },
  );

  d.listen(viewport, 'pointerdown', (e) => {
    if (e.button !== 0 || scale <= 1.001) return;
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollX = viewport.scrollLeft;
    scrollY = viewport.scrollTop;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('is-panning');
  });
  d.listen(viewport, 'pointermove', (e) => {
    if (!panning) return;
    viewport.scrollLeft = scrollX - (e.clientX - startX);
    viewport.scrollTop = scrollY - (e.clientY - startY);
  });
  const endPan = (e) => {
    if (!panning) return;
    panning = false;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    viewport.classList.remove('is-panning');
  };
  d.listen(viewport, 'pointerup', endPan);
  d.listen(viewport, 'pointercancel', endPan);

  d.listen(viewport, 'dblclick', (e) => {
    apply(scale > 1.001 ? 1 : 2, { x: e.clientX, y: e.clientY });
  });

  return {
    zoomIn: () => apply(scale * 1.25),
    zoomOut: () => apply(scale / 1.25),
    zoomReset: () => apply(1),
    setScale: (v) => apply(v),
    getScale: () => scale,
    destroy: () => d.run(),
  };
}
