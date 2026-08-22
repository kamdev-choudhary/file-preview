import { describe, filenameFromUrl, formatBytes } from './mime.js';
import { fetchBlob, isSameOriginOrData } from './net.js';
import { PreviewError, toPreviewError } from './errors.js';

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
  /**
   * @param {{
   *   name?: string, mime?: string, size?: number,
   *   url?: string, blob?: Blob,
   *   headers?: Record<string,string>, credentials?: RequestCredentials,
   *   maxBytes?: number,
   * }} init
   */
  constructor(init) {
    this.url = init.url || '';
    this.blob = init.blob || null;
    this.headers = init.headers;
    this.credentials = init.credentials;
    this.maxBytes = init.maxBytes;

    this.name = init.name || (this.url ? filenameFromUrl(this.url) : 'file');
    this.declaredMime = init.mime || this.blob?.type || '';
    this.size = init.size ?? this.blob?.size ?? undefined;

    /** @type {ReturnType<typeof describe>} */
    this.descriptor = describe({ name: this.name, mime: this.declaredMime, size: this.size });

    this._objectUrl = '';
    /** @type {Promise<Blob>|null} */
    this._blobPromise = null;
    this._sniffed = false;
    this._destroyed = false;
  }

  get kind() {
    return this.descriptor.kind;
  }
  get mime() {
    return this.descriptor.mime;
  }
  get ext() {
    return this.descriptor.ext;
  }
  get sizeLabel() {
    return formatBytes(this.size);
  }
  /** True when bytes live on a remote server we may not be allowed to read. */
  get isRemote() {
    return Boolean(this.url) && !this.blob && !isSameOriginOrData(this.url);
  }

  /**
   * A URL safe to hand to <img>/<video>/<iframe>. Prefers the original remote
   * URL (streams, no memory cost, no CORS requirement for media elements) and
   * only materialises a blob: URL when the bytes are already local.
   */
  get displayUrl() {
    if (this.url && !this.blob) return this.url;
    if (this.blob) return this.objectUrl();
    return '';
  }

  /** Lazily created blob: URL, revoked in destroy(). */
  objectUrl() {
    if (!this.blob) return this.url;
    if (!this._objectUrl) this._objectUrl = URL.createObjectURL(this.blob);
    return this._objectUrl;
  }

  /**
   * Download (once) and cache the bytes.
   * @param {{ signal?: AbortSignal, onProgress?: (loaded:number,total:number|null)=>void }} [opts]
   */
  async toBlob(opts = {}) {
    if (this.blob) return this.blob;
    if (this._blobPromise) return this._blobPromise;
    if (!this.url) throw new PreviewError('EMPTY', 'This preview has no file to show.');

    this._blobPromise = (async () => {
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
      this._redescribe();
      return blob;
    })().catch((err) => {
      // Don't cache failures; a retry should genuinely retry.
      this._blobPromise = null;
      throw toPreviewError(err);
    });

    return this._blobPromise;
  }

  /** @param {{ signal?: AbortSignal, onProgress?: Function }} [opts] */
  async arrayBuffer(opts) {
    const blob = await this.toBlob(opts);
    return blob.arrayBuffer();
  }

  /** @param {{ signal?: AbortSignal, onProgress?: Function }} [opts] */
  async text(opts) {
    const blob = await this.toBlob(opts);
    return blob.text();
  }

  /**
   * Read just the head of the file and re-run detection against real bytes.
   * Cheap for local blobs; for remote URLs it implies downloading the file, so
   * only viewers that need certainty should call it.
   */
  async refine(opts) {
    if (this._sniffed) return this.descriptor;
    const blob = await this.toBlob(opts);
    const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    this._sniffed = true;
    this._redescribe(head);
    return this.descriptor;
  }

  _redescribe(bytes) {
    this.descriptor = describe({
      name: this.name,
      mime: this.declaredMime,
      size: this.size,
      bytes,
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = '';
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
 *
 * @param {any} input
 * @param {{ name?: string, type?: string, maxBytes?: number, headers?: Record<string,string>, credentials?: RequestCredentials }} [defaults]
 * @returns {Source}
 */
export function toSource(input, defaults = {}) {
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
    const blob = new Blob([input], { type });
    return new Source({ ...common, blob, name: defaults.name || 'file', mime: type, size: blob.size });
  }

  if (typeof input === 'object') {
    const name = input.name || input.filename || defaults.name;
    const mime = input.type || input.mime || input.contentType || defaults.type;
    const opts = {
      ...common,
      headers: input.headers ?? common.headers,
      credentials: input.credentials ?? common.credentials,
      maxBytes: input.maxBytes ?? common.maxBytes,
      name,
      mime,
      size: input.size,
    };

    const payload = input.blob ?? input.file ?? input.data ?? input.buffer;
    if (payload != null && typeof payload !== 'string') {
      // Re-enter so File/Blob/ArrayBuffer handling stays in one place.
      return toSource(payload, { ...opts, name, type: mime });
    }
    const url = input.url ?? input.src ?? input.href ?? (typeof payload === 'string' ? payload : '');
    if (url) return new Source({ ...opts, url });
  }

  throw new PreviewError(
    'UNSUPPORTED',
    'That input could not be read as a file.',
    { hint: 'Pass a URL string, a File, a Blob, an ArrayBuffer, or { url, name, type }.' },
  );
}

/** Normalise an array of inputs, keeping index order for gallery navigation. */
export function toSources(inputs, defaults) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  return list.map((i) => toSource(i, defaults));
}
