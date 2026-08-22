/**
 * All component styling, scoped inside the shadow root so it can never collide
 * with the host page and the host page can never accidentally restyle it.
 *
 * Colours are tokens on :host, which means a consumer can retheme the whole
 * component from outside with plain CSS custom properties:
 *   file-preview { --fp-accent: #e11d48; }
 *
 * Dark mode follows the OS by default; `theme="dark"` / `theme="light"` on the
 * element forces it either way.
 */
export const css = `
:host {
  --fp-bg: #ffffff;
  --fp-bg-sunken: #f4f5f7;
  --fp-bg-raised: #ffffff;
  --fp-surface: #ffffff;
  --fp-border: #e3e5e9;
  --fp-border-strong: #cdd1d8;
  --fp-text: #16181d;
  --fp-text-dim: #646b78;
  --fp-text-faint: #8b929e;
  --fp-accent: #2563eb;
  --fp-accent-text: #ffffff;
  --fp-danger: #dc2626;
  --fp-shadow: 0 1px 2px rgba(16,18,29,.06), 0 8px 24px rgba(16,18,29,.08);
  --fp-radius: 12px;
  --fp-radius-sm: 8px;
  --fp-toolbar-h: 52px;
  --fp-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --fp-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  display: block;
  position: relative;
  color: var(--fp-text);
  font-family: var(--fp-font);
  font-size: 14px;
  line-height: 1.5;
  background: var(--fp-bg);
  border-radius: var(--fp-radius);
  contain: layout paint;
}

@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --fp-bg: #14161a;
    --fp-bg-sunken: #0d0f12;
    --fp-bg-raised: #1c1f25;
    --fp-surface: #1c1f25;
    --fp-border: #2a2e36;
    --fp-border-strong: #3a3f4a;
    --fp-text: #e9ebef;
    --fp-text-dim: #9aa2b1;
    --fp-text-faint: #6e7684;
    --fp-accent: #4d8bff;
    --fp-shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.45);
  }
}
:host([theme="dark"]) {
  --fp-bg: #14161a;
  --fp-bg-sunken: #0d0f12;
  --fp-bg-raised: #1c1f25;
  --fp-surface: #1c1f25;
  --fp-border: #2a2e36;
  --fp-border-strong: #3a3f4a;
  --fp-text: #e9ebef;
  --fp-text-dim: #9aa2b1;
  --fp-text-faint: #6e7684;
  --fp-accent: #4d8bff;
  --fp-shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.45);
}

/**
 * Modal chrome.
 *
 * The shell — top bar, canvas, controls pill — is dark in both themes, the way
 * Drive, OneDrive and Photos all do it: a neutral dark surround makes images
 * and pages read better and stops the viewer competing with the host page.
 * Document *content* still uses the themed surface tokens, so a Word file or a
 * spreadsheet keeps its light page on that dark canvas in light mode.
 */
:host([chrome="modal"]) {
  --fp-chrome-bg: #1e2024;
  --fp-chrome-canvas: #17191c;
  --fp-chrome-text: #f2f4f7;
  --fp-chrome-dim: #a8b0bd;
  --fp-chrome-border: rgba(255, 255, 255, 0.10);
  --fp-chrome-hover: rgba(255, 255, 255, 0.10);
  --fp-toolbar-h: 60px;
  --fp-controls-bg: rgba(38, 41, 46, 0.92);
  --fp-controls-border: rgba(255, 255, 255, 0.12);
  --fp-controls-text: #d4dae3;
  --fp-controls-text-strong: #ffffff;
  --fp-controls-hover: rgba(255, 255, 255, 0.12);
  --fp-controls-input-bg: rgba(255, 255, 255, 0.09);
  border-radius: 0;
  background: var(--fp-chrome-canvas);
}
:host([chrome="modal"]) .fp-root { background: var(--fp-chrome-canvas); border-radius: 0; }
:host([chrome="modal"]) .fp-toolbar {
  background: var(--fp-chrome-bg);
  border-bottom: 1px solid var(--fp-chrome-border);
  border-radius: 0;
  padding: 0 14px 0 10px;
  gap: 4px;
}
:host([chrome="modal"]) .fp-title { color: var(--fp-chrome-text); font-size: 15px; }
:host([chrome="modal"]) .fp-subtitle,
:host([chrome="modal"]) .fp-status { color: var(--fp-chrome-dim); }
:host([chrome="modal"]) .fp-titlewrap { margin-left: 6px; }
:host([chrome="modal"]) .fp-tool { color: var(--fp-chrome-dim); }
:host([chrome="modal"]) .fp-tool:hover:not(:disabled) {
  background: var(--fp-chrome-hover);
  color: var(--fp-chrome-text);
}
:host([chrome="modal"]) .fp-tool.is-toggled {
  background: var(--fp-chrome-hover);
  color: #fff;
  border-color: transparent;
}
:host([chrome="modal"]) .fp-tool--close { width: 38px; height: 38px; border-radius: 50%; }
:host([chrome="modal"]) .fp-sep { background: var(--fp-chrome-border); }
:host([chrome="modal"]) .fp-stage-host { background: var(--fp-chrome-canvas); }
:host([chrome="modal"]) .fp-loading { background: var(--fp-chrome-canvas); }
:host([chrome="modal"]) .fp-loading-label { color: var(--fp-chrome-dim); }
:host([chrome="modal"]) .fp-panel-title { color: var(--fp-chrome-text); }
:host([chrome="modal"]) .fp-panel-msg,
:host([chrome="modal"]) .fp-panel-meta { color: var(--fp-chrome-dim); }
:host([chrome="modal"]) .fp-panel-badge {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--fp-chrome-border);
  color: var(--fp-chrome-dim);
}
:host([chrome="modal"]) .fp-notice {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--fp-chrome-border);
  color: var(--fp-chrome-dim);
}
:host([chrome="modal"]) .fp-notice--collapsible summary { color: var(--fp-chrome-text); }
/* Give the content room to breathe under the floating pill. */
:host([chrome="modal"]) .fp-viewport--doc { padding: 28px 20px 84px; }
:host([chrome="modal"]) .fp-pdf { padding: 22px 0 84px; background: var(--fp-chrome-canvas); }
:host([chrome="modal"]) .fp-viewport--center { padding: 24px 24px 76px; }

*, *::before, *::after { box-sizing: border-box; }

.fp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
  background: var(--fp-bg);
}
:host([bordered]) .fp-root { border: 1px solid var(--fp-border); }

/* ---------------------------------------------------------------- toolbar */
.fp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--fp-toolbar-h);
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--fp-border);
  background: var(--fp-bg-raised);
  flex: none;
  border-radius: inherit;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.fp-toolbar.is-hidden { display: none; }

.fp-lead { display: flex; align-items: center; flex: none; }
.fp-lead:empty { display: none; }

.fp-titlewrap { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.fp-title {
  font-weight: 590;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fp-subtitle {
  font-size: 12px;
  color: var(--fp-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fp-spacer { flex: 1 1 auto; min-width: 8px; }

.fp-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  min-width: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--fp-radius-sm);
  background: transparent;
  color: var(--fp-text-dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  flex: none;
  transition: background .12s, color .12s, border-color .12s;
}
.fp-tool:hover:not(:disabled) { background: var(--fp-bg-sunken); color: var(--fp-text); }
.fp-tool:disabled { opacity: .38; cursor: default; }
.fp-tool.is-toggled { background: var(--fp-bg-sunken); color: var(--fp-accent); border-color: var(--fp-border); }
.fp-tool svg { width: 18px; height: 18px; flex: none; }
.fp-tool:focus-visible, .fp-btn:focus-visible, .fp-tab:focus-visible {
  outline: 2px solid var(--fp-accent);
  outline-offset: 2px;
}

.fp-pageind {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fp-text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fp-pageinput {
  width: 3.2em;
  height: 28px;
  text-align: center;
  border: 1px solid var(--fp-border);
  border-radius: 6px;
  background: var(--fp-bg);
  color: var(--fp-text);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.fp-pageinput::-webkit-outer-spin-button,
.fp-pageinput::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.fp-zoomlabel {
  font-size: 12px;
  color: var(--fp-text-dim);
  font-variant-numeric: tabular-nums;
  min-width: 3.4em;
  text-align: center;
}
.fp-sep { width: 1px; height: 22px; background: var(--fp-border); flex: none; }
.fp-status {
  font-size: 12px;
  color: var(--fp-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 30ch;
}

/* ------------------------------------------------------------------ stage */
.fp-stage-host {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--fp-bg-sunken);
  overflow: hidden;
}
:host([inline]) .fp-stage-host { min-height: var(--fp-min-height, 320px); }

/* Viewers mount here; the controls pill is a sibling so a reload cannot wipe it. */
.fp-stage { position: absolute; inset: 0; }

/* Floating page/zoom pill, bottom-centre over the content. */
.fp-controls {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid var(--fp-controls-border, var(--fp-border));
  background: var(--fp-controls-bg, var(--fp-bg-raised));
  color: var(--fp-controls-text, var(--fp-text-dim));
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  opacity: 1;
  transition: opacity 0.18s;
}
.fp-controls.is-hidden { display: none; }
.fp-controls .fp-tool { height: 30px; min-width: 30px; color: inherit; }
.fp-controls .fp-tool:hover:not(:disabled) {
  background: var(--fp-controls-hover, var(--fp-bg-sunken));
  color: var(--fp-controls-text-strong, var(--fp-text));
}
.fp-controls .fp-zoomlabel, .fp-controls .fp-pageind { color: inherit; }
.fp-sep--controls { height: 18px; background: var(--fp-controls-border, var(--fp-border)); }
.fp-controls .fp-pageinput {
  background: var(--fp-controls-input-bg, var(--fp-bg));
  border-color: var(--fp-controls-border, var(--fp-border));
  color: inherit;
}

.fp-viewport {
  position: absolute;
  inset: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.fp-viewport--center {
  display: grid;
  place-items: center;
  padding: 16px;
}
.fp-viewport--center.is-zoomed { place-items: start; cursor: grab; }
.fp-viewport--center.is-panning { cursor: grabbing; }
.fp-viewport--doc { padding: 24px 16px 48px; }
.fp-viewport--text { padding: 0; background: var(--fp-bg); }
.fp-viewport--sheet { display: flex; flex-direction: column; padding: 0; background: var(--fp-bg); }
.fp-viewport--list { padding: 0; background: var(--fp-bg); }
.fp-viewport--frame { padding: 0; overflow: hidden; }

.fp-stage { display: inline-block; will-change: transform; }
.fp-image {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - var(--fp-toolbar-h) - 64px);
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
:host([inline]) .fp-image { max-height: 100%; }
.fp-viewport--center.is-zoomed .fp-image { max-width: none; max-height: none; }

.fp-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }

/* --------------------------------------------------------------- loading */
.fp-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--fp-bg-sunken);
  z-index: 3;
}
.fp-spinner {
  width: 30px; height: 30px;
  border: 2.5px solid var(--fp-border-strong);
  border-top-color: var(--fp-accent);
  border-radius: 50%;
  animation: fp-spin .7s linear infinite;
}
@keyframes fp-spin { to { transform: rotate(360deg); } }
.fp-loading-label { font-size: 13px; color: var(--fp-text-dim); font-variant-numeric: tabular-nums; }
.fp-progress {
  width: min(240px, 60%);
  height: 4px;
  border-radius: 999px;
  background: var(--fp-border);
  overflow: hidden;
}
.fp-progress-bar { height: 100%; width: 0; background: var(--fp-accent); border-radius: inherit; transition: width .18s ease-out; }
.fp-progress.is-indeterminate .fp-progress-bar { width: 40%; animation: fp-slide 1.1s ease-in-out infinite; }
@keyframes fp-slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }

@media (prefers-reduced-motion: reduce) {
  .fp-spinner { animation-duration: 2s; }
  .fp-progress.is-indeterminate .fp-progress-bar { animation-duration: 2.4s; }
  * { scroll-behavior: auto !important; }
}

/* ------------------------------------------------------- panels / errors */
.fp-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 24px;
  text-align: center;
}
.fp-panel-badge {
  display: grid;
  place-items: center;
  width: 62px; height: 62px;
  border-radius: 14px;
  background: var(--fp-bg-raised);
  border: 1px solid var(--fp-border);
  color: var(--fp-text-dim);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: .04em;
  margin-bottom: 4px;
}
.fp-panel-icon { color: var(--fp-danger); margin-bottom: 2px; }
.fp-panel-icon svg { width: 40px; height: 40px; }
.fp-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  max-width: 46ch;
  overflow-wrap: anywhere;
}
.fp-panel-msg { margin: 0; font-size: 13px; color: var(--fp-text-dim); max-width: 52ch; }
.fp-panel-meta { margin: 0; font-size: 12px; color: var(--fp-text-faint); font-variant-numeric: tabular-nums; }
.fp-panel-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }

.fp-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--fp-border-strong);
  border-radius: var(--fp-radius-sm);
  background: var(--fp-surface);
  color: var(--fp-text);
  font: inherit;
  font-size: 13px;
  font-weight: 520;
  cursor: pointer;
  transition: background .12s, border-color .12s;
}
.fp-btn:hover { background: var(--fp-bg-sunken); }
.fp-btn.is-primary {
  background: var(--fp-accent);
  border-color: var(--fp-accent);
  color: var(--fp-accent-text);
}
.fp-btn.is-primary:hover { filter: brightness(1.08); }
.fp-btn-icon { display: inline-flex; }
.fp-btn-icon svg { width: 16px; height: 16px; }

.fp-notice {
  margin: 0 0 14px;
  padding: 9px 13px;
  border: 1px solid var(--fp-border);
  border-left: 3px solid var(--fp-accent);
  border-radius: var(--fp-radius-sm);
  background: var(--fp-bg-raised);
  color: var(--fp-text-dim);
  font-size: 12.5px;
}
/* Keep notices aligned with the document column instead of spanning the
   full canvas, where they would collide with the gallery counter. */
.fp-viewport--doc > .fp-notice { max-width: 860px; margin-inline: auto; }
.fp-notice--collapsible summary { cursor: pointer; color: var(--fp-text); }
.fp-notice ul { margin: 8px 0 0; padding-left: 18px; }
.fp-notice li { margin: 2px 0; }
.fp-empty { padding: 40px; text-align: center; color: var(--fp-text-faint); }
.fp-inline-missing { color: var(--fp-text-faint); font-style: italic; font-size: 12px; }
.is-hidden { display: none !important; }

/* ------------------------------------------------------------ text/code */
.fp-text { display: flex; align-items: flex-start; min-height: 100%; font-family: var(--fp-mono); font-size: 12.5px; line-height: 1.6; }
.fp-gutter {
  flex: none;
  padding: 16px 10px 16px 14px;
  text-align: right;
  color: var(--fp-text-faint);
  background: var(--fp-bg-sunken);
  border-right: 1px solid var(--fp-border);
  user-select: none;
  position: sticky;
  left: 0;
  font-variant-numeric: tabular-nums;
}
.fp-gutter span { display: block; }
.fp-pre { margin: 0; padding: 16px; flex: 1 1 auto; min-width: 0; overflow: visible; }
.fp-pre--plain { font-family: var(--fp-mono); font-size: 12.5px; white-space: pre-wrap; }
.fp-code { font-family: inherit; white-space: pre; display: block; }
.fp-text.is-wrapped .fp-code { white-space: pre-wrap; overflow-wrap: anywhere; }
.fp-text.is-wrapped .fp-gutter { display: none; }

/* highlight.js tokens, themed from our own variables */
.fp-code .hljs-comment, .fp-code .hljs-quote { color: var(--fp-text-faint); font-style: italic; }
.fp-code .hljs-keyword, .fp-code .hljs-selector-tag, .fp-code .hljs-literal { color: #c678dd; }
.fp-code .hljs-string, .fp-code .hljs-attr { color: #7bb36a; }
.fp-code .hljs-number, .fp-code .hljs-symbol, .fp-code .hljs-bullet { color: #d19a66; }
.fp-code .hljs-title, .fp-code .hljs-section, .fp-code .hljs-name { color: #61afef; }
.fp-code .hljs-type, .fp-code .hljs-built_in, .fp-code .hljs-class { color: #e5c07b; }
.fp-code .hljs-variable, .fp-code .hljs-template-variable { color: #e06c75; }
.fp-code .hljs-meta, .fp-code .hljs-tag { color: var(--fp-text-dim); }
.fp-code .hljs-deletion { color: #e06c75; }
.fp-code .hljs-addition { color: #7bb36a; }
.fp-code .hljs-emphasis { font-style: italic; }
.fp-code .hljs-strong { font-weight: 700; }

/* ----------------------------------------------------- documents / pages */
.fp-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 56px 64px;
  background: var(--fp-surface);
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius);
  box-shadow: var(--fp-shadow);
}
.fp-doc, .fp-markdown { font-size: 15px; line-height: 1.7; overflow-wrap: break-word; }
.fp-markdown { max-width: 820px; margin: 0 auto; }
.fp-doc > :first-child, .fp-markdown > :first-child { margin-top: 0; }
.fp-doc > :last-child, .fp-markdown > :last-child { margin-bottom: 0; }
.fp-doc h1, .fp-markdown h1 { font-size: 1.9em; margin: 1.4em 0 .5em; line-height: 1.25; }
.fp-doc h2, .fp-markdown h2 { font-size: 1.45em; margin: 1.4em 0 .5em; line-height: 1.3; }
.fp-doc h3, .fp-markdown h3 { font-size: 1.18em; margin: 1.3em 0 .4em; }
.fp-doc h4, .fp-markdown h4, .fp-doc h5, .fp-markdown h5 { font-size: 1em; margin: 1.2em 0 .4em; }
.fp-doc p, .fp-markdown p { margin: 0 0 1em; }
.fp-doc-title { font-size: 2.1em !important; margin-bottom: .2em !important; }
.fp-doc-subtitle { color: var(--fp-text-dim); font-size: 1.1em; margin-top: 0 !important; }
.fp-doc img, .fp-markdown img { max-width: 100%; height: auto; border-radius: var(--fp-radius-sm); }
.fp-doc a, .fp-markdown a { color: var(--fp-accent); text-decoration: underline; text-underline-offset: 2px; }
.fp-doc blockquote, .fp-markdown blockquote {
  margin: 1em 0;
  padding: 2px 0 2px 16px;
  border-left: 3px solid var(--fp-border-strong);
  color: var(--fp-text-dim);
}
.fp-doc table, .fp-markdown table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: .93em;
  display: block;
  overflow-x: auto;
}
.fp-doc th, .fp-doc td, .fp-markdown th, .fp-markdown td {
  border: 1px solid var(--fp-border);
  padding: 7px 11px;
  text-align: left;
  vertical-align: top;
}
.fp-doc th, .fp-markdown th { background: var(--fp-bg-sunken); font-weight: 600; }
.fp-markdown pre {
  background: var(--fp-bg-sunken);
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius-sm);
  padding: 13px 15px;
  overflow-x: auto;
  font-family: var(--fp-mono);
  font-size: 12.5px;
  line-height: 1.6;
}
.fp-markdown code {
  font-family: var(--fp-mono);
  font-size: .88em;
  background: var(--fp-bg-sunken);
  border: 1px solid var(--fp-border);
  border-radius: 5px;
  padding: .12em .4em;
}
.fp-markdown pre code { background: none; border: 0; padding: 0; font-size: inherit; }
.fp-markdown hr { border: 0; border-top: 1px solid var(--fp-border); margin: 2em 0; }
.fp-markdown ul, .fp-markdown ol, .fp-doc ul, .fp-doc ol { padding-left: 1.6em; margin: 0 0 1em; }
.fp-markdown li, .fp-doc li { margin: .25em 0; }
.fp-markdown input[type="checkbox"] { margin-right: .4em; }

/* --------------------------------------------------------------- pdf */
.fp-pdf { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 18px 0 40px; background: var(--fp-bg-sunken); }
.fp-pdf-page {
  position: relative;
  background: #fff;
  box-shadow: var(--fp-shadow);
  border-radius: 4px;
  overflow: hidden;
  flex: none;
}
.fp-pdf-canvas { display: block; }
.fp-pdf-page-num {
  position: absolute;
  top: 8px; right: 8px;
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(0,0,0,.55);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  opacity: 0;
  transition: opacity .15s;
}
.fp-pdf-page:hover .fp-pdf-page-num { opacity: 1; }
.fp-pdf-page-error { padding: 24px; text-align: center; color: var(--fp-danger); font-size: 13px; }

/* ------------------------------------------------------------- sheets */
.fp-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 10px 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--fp-border);
  background: var(--fp-bg-raised);
  flex: none;
}
.fp-tab {
  flex: none;
  padding: 7px 14px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--fp-text-dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.fp-tab:hover { color: var(--fp-text); }
.fp-tab[aria-selected="true"] {
  background: var(--fp-bg);
  border-color: var(--fp-border);
  color: var(--fp-text);
  font-weight: 560;
}
.fp-grid-host { flex: 1 1 auto; min-height: 0; overflow: auto; }
.fp-grid { border-collapse: separate; border-spacing: 0; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.fp-grid th, .fp-grid td {
  border-right: 1px solid var(--fp-border);
  border-bottom: 1px solid var(--fp-border);
  padding: 5px 9px;
  text-align: left;
  white-space: nowrap;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fp-grid td.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.fp-grid-colhead, .fp-grid-rowhead, .fp-grid-corner {
  background: var(--fp-bg-sunken);
  color: var(--fp-text-faint);
  font-weight: 500;
  font-size: 11.5px;
  text-align: center !important;
  position: sticky;
  z-index: 1;
}
.fp-grid-colhead { top: 0; }
.fp-grid-rowhead { left: 0; min-width: 46px; }
.fp-grid-corner { top: 0; left: 0; z-index: 2; }
.fp-grid tbody tr:hover td { background: var(--fp-bg-sunken); }

/* ------------------------------------------------------------- slides */
.fp-deck { display: flex; flex-direction: column; gap: 18px; max-width: 900px; margin: 0 auto; }
.fp-slide {
  position: relative;
  background: var(--fp-surface);
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius);
  box-shadow: var(--fp-shadow);
  padding: 30px 34px;
  min-height: 180px;
}
.fp-slide-num {
  position: absolute;
  top: 12px; right: 16px;
  font-size: 11px;
  color: var(--fp-text-faint);
  font-variant-numeric: tabular-nums;
}
.fp-slide-title { margin: 0 0 14px; font-size: 1.35em; line-height: 1.3; }
.fp-slide-list { margin: 0 0 12px; padding-left: 1.3em; }
.fp-slide-list li { margin: .3em 0; }
.fp-slide-list li.is-lvl-1 { margin-left: 1.1em; font-size: .96em; color: var(--fp-text-dim); }
.fp-slide-list li.is-lvl-2 { margin-left: 2.2em; font-size: .93em; color: var(--fp-text-dim); }
.fp-slide-list li.is-lvl-3, .fp-slide-list li.is-lvl-4 { margin-left: 3.2em; font-size: .9em; color: var(--fp-text-faint); }
.fp-slide-media { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.fp-slide-img { max-width: min(100%, 320px); max-height: 220px; border-radius: var(--fp-radius-sm); border: 1px solid var(--fp-border); object-fit: contain; }
.fp-slide-notes { margin-top: 14px; font-size: 13px; color: var(--fp-text-dim); }
.fp-slide-notes summary { cursor: pointer; color: var(--fp-text-faint); font-size: 12px; }
.fp-slide-notes p { margin: 8px 0 0; }

/* ------------------------------------------------------------ archive */
.fp-filelist { font-size: 13px; }
.fp-filerow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--fp-border);
}
.fp-filerow:hover { background: var(--fp-bg-sunken); }
.fp-fileicon {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px; height: 22px;
  border-radius: 5px;
  background: var(--fp-bg-sunken);
  border: 1px solid var(--fp-border);
  color: var(--fp-text-faint);
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: .03em;
}
.fp-filename { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-filedir { color: var(--fp-text-faint); }
.fp-filesize { flex: none; color: var(--fp-text-faint); font-size: 12px; font-variant-numeric: tabular-nums; }

/* --------------------------------------------------------------- fonts */
.fp-font { max-width: 840px; margin: 0 auto; }
.fp-font-alphabet {
  font-size: 30px;
  line-height: 1.45;
  padding: 22px 24px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius);
  background: var(--fp-surface);
  overflow-wrap: anywhere;
  margin-bottom: 22px;
}
.fp-font-row { display: flex; align-items: baseline; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--fp-border); }
.fp-font-size { flex: none; width: 46px; font-size: 11px; color: var(--fp-text-faint); font-variant-numeric: tabular-nums; }
.fp-font-label { margin: 24px 0 8px; font-size: 12px; color: var(--fp-text-faint); text-transform: uppercase; letter-spacing: .06em; }
.fp-font-editable {
  font-size: 26px;
  padding: 18px 20px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius);
  background: var(--fp-surface);
  min-height: 90px;
  outline: none;
}
.fp-font-editable:focus { border-color: var(--fp-accent); }

/* ---------------------------------------------------- audio / video */
.fp-stage--video { width: 100%; height: 100%; display: grid; place-items: center; }
.fp-video { max-width: 100%; max-height: 100%; display: block; border-radius: var(--fp-radius-sm); background: #000; }
.fp-stage--audio { width: min(520px, 100%); }
.fp-audio-card {
  padding: 26px 24px;
  border: 1px solid var(--fp-border);
  border-radius: var(--fp-radius);
  background: var(--fp-surface);
  box-shadow: var(--fp-shadow);
  text-align: center;
}
.fp-audio-title { font-weight: 560; margin-bottom: 16px; overflow-wrap: anywhere; }
.fp-audio { width: 100%; }
`;

/**
 * Styles for the modal host element. Kept separate because the modal owns the
 * backdrop and the viewport-sized shell, while the inline element does not.
 */
export const modalCss = `
:host {
  position: fixed;
  inset: 0;
  z-index: var(--fp-z, 9999);
  display: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
:host([open]) { display: block; }

/**
 * Full-bleed shell. Earlier this was an inset rounded card floating on a
 * blurred backdrop, which wasted screen space and left the nav arrows stranded
 * outside the frame. Drive/OneDrive/Photos all go edge-to-edge instead: the
 * viewer *is* the screen, and its own top bar carries the identity and actions.
 */
.fp-backdrop {
  position: absolute;
  inset: 0;
  background: #17191c;
  animation: fp-fade .14s ease-out;
}
.fp-shell {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fp-pop .18s cubic-bezier(.2,.8,.3,1);
}
@keyframes fp-fade { from { opacity: 0; } }
@keyframes fp-pop { from { opacity: 0; transform: scale(.994); } }
@media (prefers-reduced-motion: reduce) {
  .fp-backdrop, .fp-shell { animation: none; }
}

file-preview { flex: 1 1 auto; min-height: 0; }

/*
 * Arrows sit just inside the content edges and are vertically centred on the
 * canvas, not the whole screen — otherwise the top bar pushes them off-centre.
 */
.fp-nav {
  position: absolute;
  top: calc(60px + (100% - 60px) / 2);
  transform: translateY(-50%);
  width: 46px; height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%;
  background: rgba(38,41,46,.86);
  color: #fff;
  cursor: pointer;
  z-index: 6;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 18px rgba(0,0,0,.3);
  transition: background .12s, opacity .12s, transform .12s;
}
.fp-nav:hover:not(:disabled) { background: rgba(56,60,68,.96); }
.fp-nav:active:not(:disabled) { transform: translateY(-50%) scale(.94); }
.fp-nav:disabled { opacity: 0; pointer-events: none; }
.fp-nav svg { width: 22px; height: 22px; }
.fp-nav--prev { left: 18px; }
.fp-nav--next { right: 18px; }
.fp-nav:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

/* Gallery position indicator, top-right of the canvas so it never collides
   with the page/zoom pill at bottom-centre. */
.fp-counter {
  position: absolute;
  top: calc(60px + 16px);
  right: 18px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(38,41,46,.86);
  color: #e8ebef;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  z-index: 6;
  pointer-events: none;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

@media (max-width: 640px) {
  .fp-nav { width: 40px; height: 40px; }
  .fp-nav--prev { left: 8px; }
  .fp-nav--next { right: 8px; }
  .fp-counter { top: calc(56px + 10px); right: 10px; }
}
`;

/** Build a constructable stylesheet when supported, else a <style> element. */
export function makeStyles(text) {
  if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      return { sheet };
    } catch {
      /* fall through to the <style> path */
    }
  }
  const style = document.createElement('style');
  style.textContent = text;
  return { style };
}

/** Attach either representation to a shadow root. */
export function applyStyles(root, made) {
  if (made.sheet) root.adoptedStyleSheets = [...root.adoptedStyleSheets, made.sheet];
  else root.append(made.style.cloneNode(true));
}
