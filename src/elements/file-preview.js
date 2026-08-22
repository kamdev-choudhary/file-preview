import { el, disposer } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { css, makeStyles, applyStyles } from '../ui/styles.js';
import {
  errorPanel,
  unsupportedPanel,
  loadingPanel,
  officeFrame,
  canUseOfficeViewer,
} from '../ui/panels.js';
import { toSource, Source } from '../core/source.js';
import { resolveViewer } from '../core/registry.js';
import { getConfig } from '../core/config.js';
import { toPreviewError, PreviewError } from '../core/errors.js';
import { formatBytes, shouldPreSniff } from '../core/mime.js';

const sheet = makeStyles(css);

/**
 * `<file-preview>` — renders one file.
 *
 * Attributes: src, name, type, theme, toolbar, bordered, inline, download
 * Properties: .file (any accepted source), .source (resolved Source)
 * Events:     fp-load, fp-error, fp-close
 */
export class FilePreviewElement extends HTMLElement {
  static observedAttributes = ['src', 'name', 'type', 'theme', 'toolbar', 'download'];

  #root;
  #stageHost;
  #stage;
  #controls;
  #toolbar;
  #leadSlot;
  #titleEl;
  #subtitleEl;
  #statusEl;
  #actionsHost;
  #zoomGroup;
  #pageGroup;
  #zoomLabel;
  #pageInput;
  #pageTotal;
  /** @type {Source|null} */
  #source = null;
  /** @type {import('../core/registry.js').ViewerInstance|null} */
  #instance = null;
  #abort = null;
  #loadToken = 0;
  #failedViewers = new Set();
  #d = disposer();
  #connected = false;
  #pendingInput = undefined;
  #usingOfficeFrame = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    applyStyles(shadow, sheet);

    this.#titleEl = el('div', { class: 'fp-title' });
    this.#subtitleEl = el('div', { class: 'fp-subtitle' });
    this.#statusEl = el('div', { class: 'fp-status' });
    this.#actionsHost = el('div', { class: 'fp-actions', style: { display: 'contents' } });

    this.#zoomLabel = el('span', { class: 'fp-zoomlabel', text: '100%' });
    this.#zoomGroup = el('div', { class: 'fp-zoomgroup is-hidden', style: { display: 'none' } });

    this.#pageInput = el('input', {
      class: 'fp-pageinput',
      type: 'number',
      min: '1',
      'aria-label': 'Page number',
    });
    this.#pageTotal = el('span', { text: '/ 1' });
    this.#pageGroup = el('div', { class: 'fp-pagegroup', style: { display: 'none' } });

    // Leading slot: holds the close button in modal chrome, where convention
    // (Drive, OneDrive, Photos) puts dismissal at the top-left, not the right.
    this.#leadSlot = el('div', { class: 'fp-lead' });

    this.#toolbar = el('div', { class: 'fp-toolbar', part: 'toolbar' }, [
      this.#leadSlot,
      el('div', { class: 'fp-titlewrap' }, [this.#titleEl, this.#subtitleEl]),
      el('div', { class: 'fp-spacer' }),
      this.#statusEl,
      this.#actionsHost,
    ]);

    // Page and zoom controls float over the content in a bottom-centre pill
    // rather than competing with the filename for room in the top bar.
    this.#controls = el('div', { class: 'fp-controls', part: 'controls' }, [
      this.#pageGroup,
      el('div', { class: 'fp-sep fp-sep--controls' }),
      this.#zoomGroup,
    ]);

    this.#stage = el('div', { class: 'fp-stage', part: 'content' });
    this.#stageHost = el('div', { class: 'fp-stage-host', part: 'stage' }, [
      this.#stage,
      this.#controls,
    ]);
    this.#root = el('div', { class: 'fp-root' }, [this.#toolbar, this.#stageHost]);
    shadow.append(this.#root);

    this.#buildToolbarGroups();
  }

  // -------------------------------------------------------------- lifecycle

  connectedCallback() {
    this.#connected = true;
    // `closest()` stops at the shadow boundary, so it can never see the modal
    // that hosts us. Check the shadow root's host as well.
    const shadowHost = this.getRootNode()?.host;
    const insideModal =
      Boolean(this.closest('file-preview-modal')) ||
      shadowHost?.tagName === 'FILE-PREVIEW-MODAL';
    if (!this.hasAttribute('inline') && !insideModal) {
      this.setAttribute('inline', '');
    }
    if (this.#pendingInput !== undefined) {
      const input = this.#pendingInput;
      this.#pendingInput = undefined;
      this.file = input;
    } else if (this.getAttribute('src')) {
      this.#loadFromAttributes();
    }
  }

  disconnectedCallback() {
    this.#connected = false;
    this.#teardown();
  }

  attributeChangedCallback(name, prev, next) {
    if (prev === next) return;
    if (!this.#connected) return;
    if (name === 'src' || name === 'name' || name === 'type') this.#loadFromAttributes();
    if (name === 'toolbar') this.#toolbar.classList.toggle('is-hidden', next === 'false' || next === 'none');
    if (name === 'download') this.#syncToolbar();
  }

  // ------------------------------------------------------------- public API

  /** Any accepted input: URL string, File, Blob, ArrayBuffer, or descriptor. */
  set file(input) {
    if (!this.#connected) {
      // Setting a property before the element is upgraded/attached is normal;
      // hold it and load on connect rather than dropping it.
      this.#pendingInput = input;
      return;
    }
    if (input == null) {
      this.clear();
      return;
    }
    this.#load(input);
  }

  get file() {
    return this.#source;
  }

  /** The resolved Source, once loading has started. */
  get source() {
    return this.#source;
  }

  get src() {
    return this.getAttribute('src') || '';
  }
  set src(v) {
    if (v == null) this.removeAttribute('src');
    else this.setAttribute('src', v);
  }

  /** Re-run the current load from scratch. */
  reload() {
    if (!this.#source) return;
    this.#failedViewers.clear();
    this.#load(this.#source);
  }

  /** Tear down the current preview and show nothing. */
  clear() {
    this.#teardown();
    this.#stage.replaceChildren();
    this.#source = null;
    this.#titleEl.textContent = '';
    this.#subtitleEl.textContent = '';
    this.#statusEl.textContent = '';
    this.#syncToolbar();
  }

  /** Trigger a browser download of the current file. */
  async download() {
    const source = this.#source;
    if (!source) return;
    try {
      // Prefer the already-buffered bytes; only fall back to a raw link when we
      // have nothing local (a cross-origin URL we were never allowed to read).
      const blob = source.blob || (await source.toBlob({ signal: this.#abort?.signal }));
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: source.name || 'download' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      if (source.url) window.open(source.url, '_blank', 'noopener,noreferrer');
    }
  }

  // ---------------------------------------------------------------- toolbar

  #buildToolbarGroups() {
    const tool = (name, label, onClick) =>
      el('button', {
        class: 'fp-tool',
        type: 'button',
        title: label,
        'aria-label': label,
        html: icon(name),
        onClick,
      });

    // Zoom
    const zoomOut = tool('zoomOut', 'Zoom out', () => this.#instance?.zoomOut?.());
    const zoomIn = tool('zoomIn', 'Zoom in', () => this.#instance?.zoomIn?.());
    const zoomFit = tool('fit', 'Reset zoom', () => this.#instance?.zoomReset?.());
    this.#zoomGroup.append(zoomOut, this.#zoomLabel, zoomIn, zoomFit);
    Object.assign(this.#zoomGroup.style, { display: 'none', alignItems: 'center', gap: '2px' });

    // Pages
    const prev = tool('prev', 'Previous page', () => this.#stepPage(-1));
    const next = tool('next', 'Next page', () => this.#stepPage(1));
    this.#pageInput.addEventListener('change', () => {
      const n = Number(this.#pageInput.value);
      if (Number.isFinite(n)) this.#instance?.goToPage?.(n);
    });
    this.#pageGroup.append(
      prev,
      el('span', { class: 'fp-pageind' }, [this.#pageInput, this.#pageTotal]),
      next,
    );
    Object.assign(this.#pageGroup.style, { display: 'none', alignItems: 'center', gap: '2px' });
  }

  #stepPage(delta) {
    const n = Number(this.#pageInput.value) + delta;
    this.#instance?.goToPage?.(n);
  }

  /** Rebuild the toolbar for the currently mounted viewer. */
  #syncToolbar() {
    this.#actionsHost.replaceChildren();
    this.#leadSlot.replaceChildren();

    // Dismissal sits top-left in modal chrome, matching Drive/OneDrive/Photos.
    if (this.hasAttribute('closable')) {
      this.#leadSlot.append(
        el('button', {
          class: 'fp-tool fp-tool--close',
          type: 'button',
          title: 'Close (Esc)',
          'aria-label': 'Close preview',
          html: icon('close'),
          onClick: () =>
            this.dispatchEvent(new CustomEvent('fp-close', { bubbles: true, composed: true })),
        }),
      );
    }

    if (!this.#source) {
      this.#zoomGroup.style.display = 'none';
      this.#pageGroup.style.display = 'none';
      this.#syncControlsVisibility();
      return;
    }

    const tool = (name, label, onClick, extra = {}) =>
      el('button', {
        class: 'fp-tool',
        type: 'button',
        title: label,
        'aria-label': label,
        html: icon(name),
        onClick,
        ...extra,
      });

    const frag = [];

    // Viewer-contributed actions (copy, wrap, view source, …)
    for (const action of this.#instance?.actions || []) {
      const btn = el('button', {
        class: `fp-tool${action.toggled ? ' is-toggled' : ''}`,
        type: 'button',
        title: action.label,
        'aria-label': action.label,
        html: icon(action.icon || 'file'),
        onClick: () => {
          action.run();
          btn.classList.toggle('is-toggled', Boolean(action.toggled));
          btn.title = action.label;
          btn.setAttribute('aria-label', action.label);
        },
      });
      frag.push(btn);
    }

    if (canUseOfficeViewer(this.#source, getConfig()) && !this.#usingOfficeFrame) {
      frag.push(tool('external', 'Open in Microsoft Office viewer', () => this.#showOfficeFrame()));
    }

    if (this.getAttribute('download') !== 'false') {
      frag.push(tool('download', 'Download', () => this.download()));
    }

    if (frag.length) this.#actionsHost.append(...frag);
    this.#syncControlsVisibility();
  }

  /** Hide the floating pill entirely when neither group has anything to show. */
  #syncControlsVisibility() {
    const pages = this.#pageGroup.style.display !== 'none';
    const zoom = this.#zoomGroup.style.display !== 'none';
    this.#controls.classList.toggle('is-hidden', !pages && !zoom);
    this.#controls.querySelector('.fp-sep--controls')?.classList.toggle('is-hidden', !(pages && zoom));
  }

  // ------------------------------------------------------------------ load

  #updateSubtitle(source) {
    this.#subtitleEl.textContent = [
      source.ext ? source.ext.toUpperCase() : source.mime,
      formatBytes(source.size),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  #loadFromAttributes() {
    const src = this.getAttribute('src');
    if (!src) return;
    this.#load({
      url: src,
      name: this.getAttribute('name') || undefined,
      type: this.getAttribute('type') || undefined,
    });
  }

  #teardown() {
    this.#abort?.abort();
    this.#abort = null;
    try {
      this.#instance?.destroy?.();
    } catch {
      /* a broken viewer must not block teardown */
    }
    this.#instance = null;
    this.#d.run();
    this.#usingOfficeFrame = false;
  }

  async #load(input) {
    const token = ++this.#loadToken;
    this.#teardown();
    this.#stage.replaceChildren();

    const config = getConfig();
    let source;
    try {
      source =
        input instanceof Source
          ? input
          : toSource(input, {
              maxBytes: config.maxBytes,
              headers: config.headers,
              credentials: config.credentials,
            });
    } catch (err) {
      this.#renderError(toPreviewError(err), null);
      return;
    }

    // Revoke the previous source's object URL, but never one we were handed.
    if (this.#source && this.#source !== source && this.#source !== input) this.#source.destroy();
    this.#source = source;

    this.#titleEl.textContent = source.name;
    this.#titleEl.title = source.name;
    this.#updateSubtitle(source);
    this.#syncToolbar();

    const abort = new AbortController();
    this.#abort = abort;

    const loader = loadingPanel();
    this.#stage.append(loader.node);

    const ctx = {
      source,
      container: this.#stage,
      signal: abort.signal,
      config,
      setStatus: (t) => {
        if (token !== this.#loadToken) return;
        loader.setStatus(t);
        this.#statusEl.textContent = t || '';
      },
      setProgress: (l, t) => {
        if (token === this.#loadToken) loader.setProgress(l, t);
      },
      requestFallback: () => this.#showUnsupported(),
    };

    try {
      // Magic bytes outrank the filename, so consult them *before* choosing a
      // viewer whenever that is cheap or the signals disagree. Skipping this
      // would let a PNG named ".txt" reach the text viewer and fail to decode.
      if (shouldPreSniff(source)) {
        ctx.setStatus('Identifying file…');
        try {
          await source.refine({ signal: abort.signal, onProgress: ctx.setProgress });
          if (token !== this.#loadToken) return;
          this.#updateSubtitle(source);
        } catch (err) {
          if (token !== this.#loadToken) return;
          this.#renderError(toPreviewError(err), source);
          return;
        }
      }

      let viewer = resolveViewer(source, this.#failedViewers);

      // Still nothing. Read the first bytes and try again — this rescues
      // extensionless URLs and servers that lie about Content-Type.
      if (!viewer && (source.blob || source.url)) {
        ctx.setStatus('Identifying file…');
        try {
          await source.refine({ signal: abort.signal, onProgress: ctx.setProgress });
          if (token !== this.#loadToken) return;
          this.#updateSubtitle(source);
          viewer = resolveViewer(source, this.#failedViewers);
        } catch (err) {
          if (token !== this.#loadToken) return;
          this.#renderError(toPreviewError(err), source);
          return;
        }
      }

      if (!viewer) {
        if (token !== this.#loadToken) return;
        this.#showUnsupported();
        return;
      }

      const mod = await viewer.load();
      if (token !== this.#loadToken) return;

      const factory = mod.default;
      const instance = await factory(ctx);
      if (token !== this.#loadToken) {
        instance?.destroy?.();
        return;
      }

      this.#instance = instance || {};
      loader.node.remove();
      this.#wireViewerState();
      this.#syncToolbar();

      this.dispatchEvent(
        new CustomEvent('fp-load', {
          bubbles: true,
          composed: true,
          detail: { source, viewer: viewer.id },
        }),
      );
    } catch (err) {
      if (token !== this.#loadToken) return;
      const pe = toPreviewError(err);
      if (pe.code === 'ABORTED') return;

      // A viewer that blew up on a file it claimed is worth retrying with the
      // next-best match — a .docx that is really a zip, say.
      const failedId = resolveViewer(source, this.#failedViewers)?.id;
      if (failedId && !this.#failedViewers.has(failedId) && pe.code === 'DECODE') {
        this.#failedViewers.add(failedId);
        const alt = resolveViewer(source, this.#failedViewers);
        if (alt) {
          this.#load(source);
          return;
        }
      }
      this.#renderError(pe, source);
    }
  }

  #wireViewerState() {
    const inst = this.#instance;
    if (!inst) return;

    const hasZoom = typeof inst.zoomIn === 'function';
    this.#zoomGroup.style.display = hasZoom ? 'flex' : 'none';
    if (hasZoom) {
      inst.onZoomChange?.((scale) => {
        this.#zoomLabel.textContent = `${Math.round(scale * 100)}%`;
      });
    }

    const hasPages = Number(inst.pageCount) > 1;
    this.#pageGroup.style.display = hasPages ? 'flex' : 'none';
    if (hasPages) {
      this.#pageInput.max = String(inst.pageCount);
      this.#pageTotal.textContent = `/ ${inst.pageCount}`;
      inst.onPageChange?.((page, total) => {
        this.#pageInput.value = String(page);
        this.#pageTotal.textContent = `/ ${total}`;
      });
    }
  }

  #showOfficeFrame() {
    if (!this.#source) return;
    this.#teardown();
    this.#stage.replaceChildren();
    this.#usingOfficeFrame = true;
    this.#stage.append(officeFrame(this.#source));
    this.#statusEl.textContent = 'Rendered by Microsoft';
    this.#syncToolbar();
  }

  #showUnsupported() {
    if (!this.#source) return;
    this.#stage.replaceChildren();
    const config = getConfig();
    this.#stage.append(
      unsupportedPanel(this.#source, {
        onDownload: () => this.download(),
        onOfficeViewer: canUseOfficeViewer(this.#source, config)
          ? () => this.#showOfficeFrame()
          : null,
      }),
    );
    this.#statusEl.textContent = '';
    this.dispatchEvent(
      new CustomEvent('fp-error', {
        bubbles: true,
        composed: true,
        detail: {
          source: this.#source,
          error: new PreviewError('UNSUPPORTED', 'No preview is available for this file type.'),
        },
      }),
    );
  }

  #renderError(error, source) {
    this.#stage.replaceChildren();
    const config = getConfig();
    this.#stage.append(
      errorPanel(error, source, {
        onRetry: () => this.reload(),
        onDownload: source ? () => this.download() : null,
        onOpenTab: source?.url ? () => window.open(source.url, '_blank', 'noopener,noreferrer') : null,
        onOfficeViewer:
          source && canUseOfficeViewer(source, config) ? () => this.#showOfficeFrame() : null,
      }),
    );
    this.#statusEl.textContent = '';
    this.dispatchEvent(
      new CustomEvent('fp-error', { bubbles: true, composed: true, detail: { source, error } }),
    );
  }
}

if (!customElements.get('file-preview')) {
  customElements.define('file-preview', FilePreviewElement);
}
