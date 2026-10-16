# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/kamdev-choudhary/previewkit/security/advisories/new)
rather than opening a public issue.

Include what you can: the affected version, a file or URL that reproduces it,
and what an attacker gets out of it. I will acknowledge within a few days and
aim to ship a fix or a clear explanation of why it is not one.

## Threat model

This library renders **untrusted files inside the host page's origin**. It is
not a sandbox. The security-relevant decisions follow from that:

- **Markdown and `.docx` HTML are sanitised with DOMPurify** before they touch
  the DOM. Any new code path that assigns file-derived content to `innerHTML`
  without sanitising it is a bug — report it as one.
- **HTML files are shown as highlighted source, never rendered.** Rendering a
  previewed `.html` file would execute it in your origin.
- **`.pptx` and `.zip` are parsed as data.** Text and images are extracted;
  nothing from the archive is executed or evaluated.
- **The Office Online fallback is opt-out and never automatic.** It sends the
  file's URL to Microsoft, so it only ever runs on an explicit user click, in a
  sandboxed `<iframe>` with `referrerpolicy="no-referrer"`. Disable it entirely
  with `configure({ officeViewer: false })`.
- **SheetJS is deliberately not a dependency.** Its npm release is frozen at
  0.18.5 with unfixed prototype-pollution and ReDoS advisories that trigger
  while parsing untrusted spreadsheets — exactly this library's job. Binary
  spreadsheet support is opt-in, so the choice of build and the risk stay with
  the application that wants it. See the README for how to enable it, and
  prefer SheetJS's own CDN distribution over the npm package.
- **Size limits are enforced before buffering**, so a hostile `Content-Length`
  cannot be used to exhaust memory. Tune with `configure({ maxBytes })`.

### What is out of scope

- A malicious file causing a _failed preview_ is expected behaviour, not a
  vulnerability. Every parser here can be made to give up; that path is typed
  (`DECODE`) and shows an error panel.
- Vulnerabilities in opt-in dependencies you supplied yourself, including
  SheetJS via `configure({ loaders })`.
- Denial of service from previewing an enormous file you chose to allow by
  raising `maxBytes`.

## Content Security Policy

The defaults fetch a few pdf.js assets from a version-pinned CDN. Under a strict
CSP, point them at local copies instead:

```js
configure({
  pdfWorkerSrc: '/assets/pdf.worker.min.mjs',
  pdfCMapUrl: '/assets/cmaps/',
  pdfStandardFontDataUrl: '/assets/standard_fonts/',
});
```

## Supported versions

Pre-1.0: only the latest minor receives fixes.
