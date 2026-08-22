export type PreviewErrorCode =
  | 'NETWORK'
  | 'CORS'
  | 'HTTP'
  | 'ABORTED'
  | 'TOO_LARGE'
  | 'UNSUPPORTED'
  | 'DECODE'
  | 'PASSWORD'
  | 'DEPENDENCY'
  | 'EMPTY'
  | 'UNKNOWN';

export class PreviewError extends Error {
  readonly code: PreviewErrorCode;
  readonly hint?: string;
  readonly status?: number;
}

export type FileKind =
  | 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'code' | 'markdown'
  | 'json' | 'csv' | 'sheet' | 'doc' | 'slides' | 'archive' | 'html'
  | 'font' | 'unknown';

export declare const Kind: Readonly<Record<string, FileKind>>;

/** A file described by URL plus optional metadata the server may not provide. */
export interface FileDescriptor {
  url?: string;
  src?: string;
  href?: string;
  blob?: Blob;
  file?: File | Blob;
  data?: ArrayBuffer | ArrayBufferView | Blob | string;
  name?: string;
  type?: string;
  size?: number;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  maxBytes?: number;
}

/** Anything the library accepts as "a file". */
export type PreviewInput =
  | string
  | File
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | FileDescriptor
  | Source;

export declare class Source {
  readonly name: string;
  readonly url: string;
  readonly blob: Blob | null;
  readonly size?: number;
  readonly kind: FileKind;
  readonly mime: string;
  readonly ext: string;
  readonly sizeLabel: string;
  readonly isRemote: boolean;
  readonly displayUrl: string;
  objectUrl(): string;
  toBlob(opts?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number | null) => void }): Promise<Blob>;
  arrayBuffer(opts?: { signal?: AbortSignal }): Promise<ArrayBuffer>;
  text(opts?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export declare function toSource(input: PreviewInput, defaults?: Partial<FileDescriptor>): Source;
export declare function toSources(input: PreviewInput | PreviewInput[], defaults?: Partial<FileDescriptor>): Source[];

export interface PreviewConfig {
  /** Refuse to buffer files larger than this, in bytes. Default 100 MB. */
  maxBytes: number;
  /** Truncate text/code files past this size. Default 5 MB. */
  maxTextBytes: number;
  /** Explicit URL for the pdf.js worker. Recommended for offline/CSP setups. */
  pdfWorkerSrc: string | null;
  /** Allow the "Open in Microsoft Office viewer" action. Default true. */
  officeViewer: boolean;
  /**
   * Injection points for heavy parsers.
   *
   * `xlsx` has no default: the npm build of SheetJS is frozen at 0.18.5 with
   * unfixed prototype-pollution and ReDoS advisories that trigger while parsing
   * untrusted files. Opt in explicitly if you need binary spreadsheets:
   *   configure({ loaders: { xlsx: () => import('xlsx') } })
   * CSV and TSV use a built-in parser and never need this.
   */
  loaders: {
    xlsx?: (() => Promise<unknown>) | null;
  };
  /** Headers sent with every remote fetch. */
  headers?: Record<string, string>;
  /** Credentials mode for remote fetches. Default 'same-origin'. */
  credentials: RequestCredentials;
  /** Locale for dates/numbers in the spreadsheet viewer. */
  locale?: string;
}

export declare function configure(patch: Partial<PreviewConfig>): PreviewConfig;
export declare function getConfig(): PreviewConfig;

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  toggled?: boolean;
  run(): void;
}

export interface ViewerContext {
  source: Source;
  container: HTMLElement;
  signal: AbortSignal;
  config: PreviewConfig;
  setStatus(text: string): void;
  setProgress(loaded: number, total: number | null): void;
  requestFallback(reason?: Error): void;
}

export interface ViewerInstance {
  element?: HTMLElement;
  destroy?(): void;
  actions?: ToolbarAction[];
  pageCount?: number;
  goToPage?(page: number): void;
  onPageChange?(cb: (page: number, total: number) => void): void;
  zoomIn?(): void;
  zoomOut?(): void;
  zoomReset?(): void;
  onZoomChange?(cb: (scale: number) => void): void;
}

export interface ViewerDefinition {
  id: string;
  label: string;
  /** Higher wins. Return 0 to decline. Later registrations win ties. */
  match(source: Source): number;
  load(): Promise<{ default: (ctx: ViewerContext) => Promise<ViewerInstance> | ViewerInstance }>;
}

/** Register a custom viewer, or override a built-in by reusing its id. */
export declare function registerViewer(def: ViewerDefinition): () => void;
export declare function listViewers(): ViewerDefinition[];

export interface LoadDetail {
  source: Source;
  viewer: string;
}
export interface ErrorDetail {
  source: Source | null;
  error: PreviewError;
}
export interface ChangeDetail {
  index: number;
  source: Source;
}

export declare class FilePreviewElement extends HTMLElement {
  /** Assign any accepted input to load it. */
  file: PreviewInput | null;
  /** The resolved source, once loading has begun. */
  readonly source: Source | null;
  src: string;
  reload(): void;
  clear(): void;
  download(): Promise<void>;

  addEventListener(
    type: 'fp-load',
    listener: (ev: CustomEvent<LoadDetail>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'fp-error',
    listener: (ev: CustomEvent<ErrorDetail>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export declare class FilePreviewModalElement extends HTMLElement {
  readonly open: boolean;
  readonly index: number;
  readonly preview: FilePreviewElement;
  show(input: PreviewInput | PreviewInput[], opts?: { index?: number; theme?: 'light' | 'dark' }): this;
  go(index: number): void;
  close(): void;
}

export interface OpenPreviewOptions {
  index?: number;
  theme?: 'light' | 'dark';
  onLoad?(detail: LoadDetail): void;
  onError?(detail: ErrorDetail): void;
  onChange?(detail: ChangeDetail): void;
  onClose?(): void;
}

export interface PreviewHandle {
  element: FilePreviewModalElement;
  close(): void;
  go(index: number): void;
}

/** Open a file, or a gallery of files, in the full-screen modal. */
export declare function openPreview(
  input: PreviewInput | PreviewInput[],
  options?: OpenPreviewOptions,
): PreviewHandle;

/** Alias of `openPreview`, clearer at call sites that pass an array. */
export declare const openGallery: typeof openPreview;

/** Render a file inline inside an existing element. */
export declare function renderPreview(
  target: Element | string,
  input: PreviewInput,
  options?: {
    theme?: 'light' | 'dark';
    toolbar?: boolean;
    bordered?: boolean;
    minHeight?: string;
  },
): FilePreviewElement;

export declare function describe(input: {
  name?: string;
  mime?: string;
  bytes?: Uint8Array;
  size?: number;
}): { name: string; ext: string; mime: string; kind: FileKind; lang?: string; size?: number };

export declare function formatBytes(n: number | null | undefined): string;

declare global {
  interface HTMLElementTagNameMap {
    'file-preview': FilePreviewElement;
    'file-preview-modal': FilePreviewModalElement;
  }
}

declare const _default: {
  openPreview: typeof openPreview;
  renderPreview: typeof renderPreview;
  configure: typeof configure;
  registerViewer: typeof registerViewer;
};
export default _default;
