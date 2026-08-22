/** Library-wide defaults. Override once at startup with `configure()`. */
const config = {
  /** Refuse to buffer anything bigger than this (bytes). Media streams anyway. */
  maxBytes: 100 * 1024 * 1024,

  /** Text/code files above this are truncated rather than choking the DOM. */
  maxTextBytes: 5 * 1024 * 1024,

  /**
   * Where pdf.js should load its worker from. Leave null to auto-resolve
   * (bundler asset first, then a version-pinned CDN). Set this to a local URL
   * if you are offline or run a strict CSP.
   */
  pdfWorkerSrc: null,

  /**
   * Allow the "Open in Microsoft Office viewer" fallback for Office files.
   * It works only for publicly reachable URLs and sends the URL to Microsoft,
   * so it is offered as an explicit user action, never used automatically.
   */
  officeViewer: true,

  /**
   * Injection points for heavy parsers.
   *
   * `xlsx` has no default on purpose. The npm build of SheetJS is frozen at
   * 0.18.5 and carries unfixed prototype-pollution and ReDoS advisories that
   * trigger on exactly the thing this library does — parsing untrusted files.
   * Rather than ship that to every consumer, the binary-spreadsheet viewer asks
   * you to supply SheetJS yourself, so you choose the build and own the risk:
   *
   *   configure({ loaders: { xlsx: () => import('xlsx') } })
   *
   * CSV and TSV never need this — they use the built-in parser.
   *
   * @type {{ xlsx?: () => Promise<any> }}
   */
  loaders: {
    xlsx: null,
  },

  /** Default headers/credentials for every remote fetch. */
  headers: undefined,
  credentials: 'same-origin',

  /** Locale used for number/date formatting inside the spreadsheet viewer. */
  locale: undefined,
};

export function configure(patch = {}) {
  const { loaders, ...rest } = patch;
  Object.assign(config, rest);
  // Merge loaders so setting one does not wipe the others.
  if (loaders) Object.assign(config.loaders, loaders);
  return { ...config };
}

export function getConfig() {
  return config;
}
