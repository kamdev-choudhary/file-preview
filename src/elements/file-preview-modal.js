import { el, disposer } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { modalCss, makeStyles, applyStyles } from "../ui/styles.js";
import { toSources } from "../core/source.js";
import { getConfig } from "../core/config.js";
import "./file-preview.js";

const sheet = makeStyles(modalCss);

/** Elements that can hold focus, for the focus trap. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * `<file-preview-modal>` — full-screen overlay around a `<file-preview>`.
 *
 * Handles the things a modal has to get right and that are easy to get wrong:
 * focus is trapped while open and restored on close, background scroll is
 * locked without the page jumping, Escape and backdrop clicks close, and arrow
 * keys move through a gallery of files.
 */
export class FilePreviewModalElement extends HTMLElement {
  #preview;
  #shell;
  #backdrop;
  #prevBtn;
  #nextBtn;
  #counter;
  /** @type {import('../core/source.js').Source[]} */
  #items = [];
  #index = 0;
  #d = disposer();
  #lastFocused = null;
  #scrollLock = null;
  #ownsSources = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    applyStyles(shadow, sheet);

    this.#backdrop = el("div", { class: "fp-backdrop", part: "backdrop" });
    this.#preview = el("file-preview", {
      theme: this.getAttribute("theme") || "",
    });
    this.#preview.setAttribute("closable", "");
    this.#preview.setAttribute("chrome", "modal");

    this.#prevBtn = el("button", {
      class: "fp-nav fp-nav--prev",
      type: "button",
      "aria-label": "Previous file",
      html: icon("prev"),
      onClick: () => this.go(this.#index - 1),
    });
    this.#nextBtn = el("button", {
      class: "fp-nav fp-nav--next",
      type: "button",
      "aria-label": "Next file",
      html: icon("next"),
      onClick: () => this.go(this.#index + 1),
    });
    this.#counter = el("div", { class: "fp-counter" });

    this.#shell = el("div", { class: "fp-shell", part: "shell" }, [
      this.#preview,
    ]);
    shadow.append(
      this.#backdrop,
      this.#shell,
      this.#prevBtn,
      this.#nextBtn,
      this.#counter,
    );
  }

  connectedCallback() {
    // A custom element constructor must not touch its own attributes — doing so
    // makes document.createElement() throw outright. Set them on connect.
    if (!this.hasAttribute("role")) this.setAttribute("role", "dialog");
    if (!this.hasAttribute("aria-modal"))
      this.setAttribute("aria-modal", "true");
    if (!this.hasAttribute("aria-label"))
      this.setAttribute("aria-label", "File preview");

    this.#backdrop.addEventListener("click", () => this.close());
    this.#preview.addEventListener("fp-close", () => this.close());
    // Re-emit viewer events from the modal so callers can listen in one place.
    for (const type of ["fp-load", "fp-error"]) {
      this.#preview.addEventListener(type, (e) => {
        this.dispatchEvent(new CustomEvent(type, { detail: e.detail }));
      });
    }
  }

  disconnectedCallback() {
    this.#release();
  }

  get open() {
    return this.hasAttribute("open");
  }

  /** The inner `<file-preview>`, if you need direct access. */
  get preview() {
    return this.#preview;
  }

  get index() {
    return this.#index;
  }

  /**
   * Open the modal.
   * @param {any|any[]} input  One file or a gallery of them.
   * @param {{ index?: number, theme?: string }} [opts]
   */
  show(input, opts = {}) {
    const config = getConfig();
    this.#disposeOwnSources();
    this.#items = toSources(input, {
      maxBytes: config.maxBytes,
      headers: config.headers,
      credentials: config.credentials,
    });
    this.#ownsSources = true;
    this.#index = Math.min(
      Math.max(0, opts.index ?? 0),
      Math.max(0, this.#items.length - 1),
    );

    if (opts.theme) this.#preview.setAttribute("theme", opts.theme);
    else if (this.getAttribute("theme"))
      this.#preview.setAttribute("theme", this.getAttribute("theme"));

    if (!this.open) {
      this.#lastFocused = document.activeElement;
      this.setAttribute("open", "");
      this.#lockScroll();
      this.#bindGlobalKeys();
    }

    this.#render();
    // Focus lands inside the dialog so keyboard and screen-reader users are not
    // left behind on the page underneath.
    requestAnimationFrame(() => this.#focusFirst());
    return this;
  }

  /** Jump to a gallery index. */
  go(next) {
    if (!this.#items.length) return;
    const clamped = Math.min(Math.max(0, next), this.#items.length - 1);
    if (clamped === this.#index) return;
    this.#index = clamped;
    this.#render();
    this.dispatchEvent(
      new CustomEvent("fp-change", {
        detail: { index: this.#index, source: this.#items[this.#index] },
      }),
    );
  }

  close() {
    if (!this.open) return;
    this.removeAttribute("open");
    this.#preview.clear();
    this.#release();
    this.dispatchEvent(new CustomEvent("fp-close"));
    // Put focus back where the user left it.
    const target = this.#lastFocused;
    this.#lastFocused = null;
    if (target?.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  // -------------------------------------------------------------- internals

  #render() {
    const source = this.#items[this.#index];
    if (!source) return;
    this.#preview.file = source;

    const many = this.#items.length > 1;
    this.#prevBtn.style.display = many ? "" : "none";
    this.#nextBtn.style.display = many ? "" : "none";
    this.#counter.style.display = many ? "" : "none";
    this.#prevBtn.disabled = this.#index === 0;
    this.#nextBtn.disabled = this.#index === this.#items.length - 1;
    this.#counter.textContent = many
      ? `${this.#index + 1} of ${this.#items.length}`
      : "";
  }

  #bindGlobalKeys() {
    this.#d.listen(
      document,
      "keydown",
      (e) => {
        if (!this.open) return;
        if (e.key === "Escape") {
          e.stopPropagation();
          this.close();
          return;
        }
        if (e.key === "Tab") {
          this.#trapFocus(e);
          return;
        }
        // Don't hijack arrows while the user is typing in a field (the page
        // number box, or the font viewer's editable specimen).
        const active = this.shadowRoot.activeElement;
        const deep = active?.shadowRoot?.activeElement || active;
        if (deep && /^(INPUT|TEXTAREA|SELECT)$/.test(deep.tagName)) return;
        if (deep?.isContentEditable) return;

        if (e.key === "ArrowLeft") this.go(this.#index - 1);
        else if (e.key === "ArrowRight") this.go(this.#index + 1);
      },
      true,
    );
  }

  #focusables() {
    const inner = this.#preview.shadowRoot?.querySelectorAll(FOCUSABLE) || [];
    const outer = this.shadowRoot.querySelectorAll(".fp-nav");
    return [...outer, ...inner].filter(
      (n) => n.offsetParent !== null || n.getClientRects().length > 0,
    );
  }

  #focusFirst() {
    const list = this.#focusables();
    (list[0] || this.#shell).focus?.({ preventScroll: true });
  }

  #trapFocus(e) {
    const list = this.#focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = this.shadowRoot.activeElement;
    const deep = this.#preview.shadowRoot?.activeElement || active;

    if (e.shiftKey && (deep === first || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (deep === last || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  #lockScroll() {
    const body = document.body;
    // Compensate for the scrollbar so the page behind does not shift.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    this.#scrollLock = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.overflow = "hidden";
    if (gap > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + gap}px`;
    }
  }

  #unlockScroll() {
    if (!this.#scrollLock) return;
    document.body.style.overflow = this.#scrollLock.overflow;
    document.body.style.paddingRight = this.#scrollLock.paddingRight;
    this.#scrollLock = null;
  }

  #disposeOwnSources() {
    if (!this.#ownsSources) return;
    for (const s of this.#items) s.destroy();
    this.#items = [];
    this.#ownsSources = false;
  }

  #release() {
    this.#d.run();
    this.#unlockScroll();
    this.#disposeOwnSources();
  }
}

if (!customElements.get("file-preview-modal")) {
  customElements.define("file-preview-modal", FilePreviewModalElement);
}
