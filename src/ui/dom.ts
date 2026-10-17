/** Tiny DOM helpers shared by the viewers. No framework, no dependencies. */

/**
 * Props accepted by {@link el}. `class`, `text`, `html`, `style` and `dataset`
 * are special-cased; `onX` keys become listeners; anything else is set as a
 * property when the element has one, and as an attribute otherwise.
 */
export interface ElProps {
  class?: string;
  text?: string;
  /** Callers must pass sanitised HTML. */
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}

export type ElChild = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps,
  children?: ElChild[],
): HTMLElementTagNameMap[K];
export function el(tag: string, props?: ElProps, children?: ElChild[]): HTMLElement;
export function el(tag: string, props: ElProps = {}, children: ElChild[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html')
      node.innerHTML = String(value); // callers must pass sanitised HTML
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in node && key !== 'list') {
      (node as unknown as Record<string, unknown>)[key] = value;
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
export function escapeHtml(s: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(s).replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export interface Disposer {
  add<T extends () => void>(fn: T): T;
  listen<T extends EventTarget>(
    target: T,
    type: string,
    handler: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ): void;
  run(): void;
}

/** Bundle listeners/timers so a viewer's destroy() is one call. */
export function disposer(): Disposer {
  const fns: Array<() => void> = [];
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
          fns.pop()?.();
        } catch {
          /* a failing teardown must not block the rest */
        }
      }
    },
  };
}

export interface ZoomPanOptions {
  min?: number;
  max?: number;
  onChange?: (scale: number) => void;
}

export interface ZoomPanController {
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  setScale(v: number): void;
  getScale(): number;
  destroy(): void;
}

/**
 * Pan + zoom behaviour shared by the image and PDF viewers.
 * Wheel/ctrl-wheel to zoom, drag to pan, double-click to toggle fit.
 *
 * @param viewport Scroll/clip container
 * @param content  The thing that scales
 */
export function attachZoomPan(
  viewport: HTMLElement,
  content: HTMLElement,
  opts: ZoomPanOptions = {},
): ZoomPanController {
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

  const apply = (next: number, origin?: { x: number; y: number }): void => {
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
    viewport.classList.toggle('is-zoomed', scale > 1.001);
    onChange?.(scale);
    viewport.scrollLeft = nextLeft;
    viewport.scrollTop = nextTop;
  };

  d.listen(
    viewport,
    'wheel',
    ((e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling
      e.preventDefault();
      apply(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), { x: e.clientX, y: e.clientY });
    }) as EventListener,
    { passive: false },
  );

  d.listen(viewport, 'pointerdown', ((e: PointerEvent) => {
    if (e.button !== 0 || scale <= 1.001) return;
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollX = viewport.scrollLeft;
    scrollY = viewport.scrollTop;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('is-panning');
  }) as EventListener);

  d.listen(viewport, 'pointermove', ((e: PointerEvent) => {
    if (!panning) return;
    viewport.scrollLeft = scrollX - (e.clientX - startX);
    viewport.scrollTop = scrollY - (e.clientY - startY);
  }) as EventListener);

  const endPan = ((e: PointerEvent) => {
    if (!panning) return;
    panning = false;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    viewport.classList.remove('is-panning');
  }) as EventListener;
  d.listen(viewport, 'pointerup', endPan);
  d.listen(viewport, 'pointercancel', endPan);

  d.listen(viewport, 'dblclick', ((e: MouseEvent) => {
    apply(scale > 1.001 ? 1 : 2, { x: e.clientX, y: e.clientY });
  }) as EventListener);

  return {
    zoomIn: () => apply(scale * 1.25),
    zoomOut: () => apply(scale / 1.25),
    zoomReset: () => apply(1),
    setScale: (v: number) => apply(v),
    getScale: () => scale,
    destroy: () => d.run(),
  };
}
