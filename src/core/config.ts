/** A lazily-imported module that resolves to SheetJS, or to something wrapping it. */
export type XlsxLoader = () => Promise<unknown>;

export interface PreviewConfig {
  /** Refuse to buffer anything bigger than this (bytes). Media streams anyway. */
  maxBytes: number;
  /** Text/code files above this are truncated rather than choking the DOM. */
  maxTextBytes: number;
  /**
   * Where pdf.js should load its worker from. Leave null to auto-resolve
   * (bundler asset first, then a version-pinned CDN). Set this to a local URL
   * if you are offline or run a strict CSP.
   */
  pdfWorkerSrc: string | null;
  /**
   * Where pdf.js finds its CMap and standard-font data. Both default to a
   * version-pinned CDN. Point them at local copies for offline or CSP setups —
   * without standard font data, PDFs using Helvetica/Times render blank text.
   */
  pdfCMapUrl: string | null;
  pdfStandardFontDataUrl: string | null;
  /**
   * Allow the "Open in Microsoft Office viewer" fallback for Office files.
   * It works only for publicly reachable URLs and sends the URL to Microsoft,
   * so it is offered as an explicit user action, never used automatically.
   */
  officeViewer: boolean;
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
   */
  loaders: {
    xlsx: XlsxLoader | null;
  };
  /** Default headers sent with every remote fetch. */
  headers: Record<string, string> | undefined;
  /** Credentials mode for remote fetches. */
  credentials: RequestCredentials;
  /** Locale used for number/date formatting inside the spreadsheet viewer. */
  locale: string | undefined;
}

/** Library-wide defaults. Override once at startup with `configure()`. */
const config: PreviewConfig = {
  maxBytes: 100 * 1024 * 1024,
  maxTextBytes: 5 * 1024 * 1024,
  pdfWorkerSrc: null,
  pdfCMapUrl: null,
  pdfStandardFontDataUrl: null,
  officeViewer: true,
  loaders: {
    xlsx: null,
  },
  headers: undefined,
  credentials: 'same-origin',
  locale: undefined,
};

/** Patch the shared config. Returns a snapshot of the result. */
export function configure(patch: Partial<PreviewConfig> = {}): PreviewConfig {
  const { loaders, ...rest } = patch;
  Object.assign(config, rest);
  // Merge loaders so setting one does not wipe the others.
  if (loaders) Object.assign(config.loaders, loaders);
  return { ...config, loaders: { ...config.loaders } };
}

/** The live config object. Treat it as read-only. */
export function getConfig(): PreviewConfig {
  return config;
}
