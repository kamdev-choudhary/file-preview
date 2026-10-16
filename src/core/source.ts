import { describe, filenameFromUrl, formatBytes } from './mime.js';
import type { FileKind, FileTypeDescriptor } from './mime.js';
import { fetchBlob, isSameOriginOrData } from './net.js';
import { PreviewError, toPreviewError } from './errors.js';

/** A file described by URL plus optional metadata the server may not provide. */
export interface FileDescriptor {
  url?: string;
  src?: string;
  href?: string;
  blob?: Blob;
  file?: File | Blob;
  data?: ArrayBuffer | ArrayBufferView | Blob | string;
  buffer?: ArrayBuffer | ArrayBufferView | Blob | string;
  name?: string;
  filename?: string;
  type?: string;
  mime?: string;
  contentType?: string;
  size?: number;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  maxBytes?: number;
}

/** Anything the library accepts as "a file". */
export type PreviewInput =
  string | File | Blob | ArrayBuffer | ArrayBufferView | FileDescriptor | Source;

/** Defaults applied to every input in one call. */
export interface SourceDefaults {
  name?: string | undefined;
  type?: string | undefined;
  maxBytes?: number | undefined;
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
}

export interface SourceInit {
  name?: string | undefined;
  mime?: string | undefined;
  size?: number | undefined;
  url?: string | undefined;
  blob?: Blob | null | undefined;
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
  maxBytes?: number | undefined;
}

export interface ReadOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((loaded: number, total: number | null) => void) | undefined;
}

/**
 * One normalised handle to "a file", whatever the caller actually passed.
 *
 * The important property is laziness: constructing a Source never touches the
 * network. Viewers that can stream straight from a URL (img/video/audio/iframe)
 * read `.displayUrl` and never download anything into JS memory; viewers that
 * must parse bytes (docx/xlsx/pptx/text) call `.arrayBuffer()` and pay for the
 * download exactly once, cached for the lifetime of the Source.
 */
export class Source {
  url: string;
  blob: Blob | null;
  headers: Record<string, string> | undefined;
  credentials: RequestCredentials | undefined;
  maxBytes: number | undefined;
  name: string;
  /** The MIME the caller or server claimed, before detection weighed in. */
  declaredMime: string;
  size: number | undefined;
  descriptor: FileTypeDescriptor;

  #objectUrl = '';
  #blobPromise: Promise<Blob> | null = null;
  #sniffed = false;
  #destroyed = false;

  constructor(init: SourceInit) {
    this.url = init.url || '';
    this.blob = init.blob || null;
    this.headers = init.headers;
    this.credentials = init.credentials;
    this.maxBytes = init.maxBytes;

    this.name = init.name || (this.url ? filenameFromUrl(this.url) : 'file');
    this.declaredMime = init.mime || this.blob?.type || '';
    this.size = init.size ?? this.blob?.size ?? undefined;

    this.descriptor = describe({
      name: this.name,
      mime: this.declaredMime,
      size: this.size,
    });
  }

  get kind(): FileKind {
    return this.descriptor.kind;
  }

  get mime(): string {
    return this.descriptor.mime;
  }

  get ext(): string {
    return this.descriptor.ext;
  }

  get sizeLabel(): string {
    return formatBytes(this.size);
  }

  /** True when bytes live on a remote server we may not be allowed to read. */
  get isRemote(): boolean {
    return Boolean(this.url) && !this.blob && !isSameOriginOrData(this.url);
  }

  /**
   * A URL safe to hand to <img>/<video>/<iframe>. Prefers the original remote
   * URL (streams, no memory cost, no CORS requirement for media elements) and
   * only materialises a blob: URL when the bytes are already local.
   */
  get displayUrl(): string {
    if (this.url && !this.blob) return this.url;
    if (this.blob) return this.objectUrl();
    return '';
  }

  /** Lazily created blob: URL, revoked in destroy(). */
  objectUrl(): string {
    if (!this.blob) return this.url;
    if (!this.#objectUrl) this.#objectUrl = URL.createObjectURL(this.blob);
    return this.#objectUrl;
  }

  /** Download (once) and cache the bytes. */
  async toBlob(opts: ReadOptions = {}): Promise<Blob> {
    if (this.blob) return this.blob;
    if (this.#blobPromise) return this.#blobPromise;
    if (!this.url) throw new PreviewError('EMPTY', 'This preview has no file to show.');

    this.#blobPromise = (async () => {
      const { blob, mime, filename } = await fetchBlob(this.url, {
        signal: opts.signal,
        headers: this.headers,
        credentials: this.credentials,
        maxBytes: this.maxBytes,
        onProgress: opts.onProgress,
      });
      this.blob = blob;
      this.size = blob.size;
      // The server's headers are usually better evidence than a guessed URL
      // extension — fold them in, but never let a generic type erase what we
      // already worked out.
      if (filename && !/\./.test(this.name)) this.name = filename;
      if (mime && !this.declaredMime) this.declaredMime = mime;
      this.#redescribe();
      return blob;
    })().catch((err: unknown) => {
      // Don't cache failures; a retry should genuinely retry.
      this.#blobPromise = null;
      throw toPreviewError(err);
    });

    return this.#blobPromise;
  }

  async arrayBuffer(opts?: ReadOptions): Promise<ArrayBuffer> {
    const blob = await this.toBlob(opts);
    return blob.arrayBuffer();
  }

  async text(opts?: ReadOptions): Promise<string> {
    const blob = await this.toBlob(opts);
    return blob.text();
  }

  /**
   * Read just the head of the file and re-run detection against real bytes.
   * Cheap for local blobs; for remote URLs it implies downloading the file, so
   * only viewers that need certainty should call it.
   */
  async refine(opts?: ReadOptions): Promise<FileTypeDescriptor> {
    if (this.#sniffed) return this.descriptor;
    const blob = await this.toBlob(opts);
    const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    this.#sniffed = true;
    this.#redescribe(head);
    return this.descriptor;
  }

  #redescribe(bytes?: Uint8Array): void {
    this.descriptor = describe({
      name: this.name,
      mime: this.declaredMime,
      size: this.size,
      bytes,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#objectUrl) {
      URL.revokeObjectURL(this.#objectUrl);
      this.#objectUrl = '';
    }
  }
}

/**
 * Accept anything reasonable and produce a Source.
 *
 * Supported inputs:
 *   - `string`                     URL, data: URI, or blob: URL
 *   - `File`                       name + type come along for free
 *   - `Blob`                       needs `name`/`type` overrides to be useful
 *   - `ArrayBuffer` / TypedArray   ditto
 *   - `{ url | blob | data, name?, type?, size?, headers?, credentials? }`
 *   - `Source`                     returned untouched
 */
export function toSource(input: unknown, defaults: SourceDefaults = {}): Source {
  if (input instanceof Source) return input;

  if (input == null || input === '') {
    throw new PreviewError('EMPTY', 'No file was provided to preview.');
  }

  const common = {
    maxBytes: defaults.maxBytes,
    headers: defaults.headers,
    credentials: defaults.credentials,
  };

  if (typeof input === 'string') {
    return new Source({ ...common, url: input, name: defaults.name, mime: defaults.type });
  }

  // File first — it is a Blob, but carries a name we must not discard.
  if (typeof File !== 'undefined' && input instanceof File) {
    return new Source({
      ...common,
      blob: input,
      name: defaults.name || input.name,
      mime: defaults.type || input.type,
      size: input.size,
    });
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Source({
      ...common,
      blob: input,
      name: defaults.name || 'file',
      mime: defaults.type || input.type,
      size: input.size,
    });
  }

  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const type = defaults.type || 'application/octet-stream';
    const blob = new Blob([input as BlobPart], { type });
    return new Source({
      ...common,
      blob,
      name: defaults.name || 'file',
      mime: type,
      size: blob.size,
    });
  }

  if (typeof input === 'object') {
    const d = input as FileDescriptor;
    const name = d.name || d.filename || defaults.name;
    const mime = d.type || d.mime || d.contentType || defaults.type;
    const opts: SourceInit & SourceDefaults = {
      ...common,
      headers: d.headers ?? common.headers,
      credentials: d.credentials ?? common.credentials,
      maxBytes: d.maxBytes ?? common.maxBytes,
      name,
      mime,
      size: d.size,
    };

    const payload = d.blob ?? d.file ?? d.data ?? d.buffer;
    if (payload != null && typeof payload !== 'string') {
      // Re-enter so File/Blob/ArrayBuffer handling stays in one place.
      return toSource(payload, { ...opts, name, type: mime });
    }
    const url = d.url ?? d.src ?? d.href ?? (typeof payload === 'string' ? payload : '');
    if (url) return new Source({ ...opts, url });
  }

  throw new PreviewError('UNSUPPORTED', 'That input could not be read as a file.', {
    hint: 'Pass a URL string, a File, a Blob, an ArrayBuffer, or { url, name, type }.',
  });
}

/** Normalise an array of inputs, keeping index order for gallery navigation. */
export function toSources(inputs: unknown, defaults?: SourceDefaults): Source[] {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  return list.map((i) => toSource(i, defaults));
}
