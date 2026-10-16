import { PreviewError, toPreviewError } from './errors.js';
import { filenameFromContentDisposition } from './mime.js';

export interface FetchBlobOptions {
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
  maxBytes?: number | undefined;
  onProgress?: ((loaded: number, total: number | null) => void) | undefined;
}

export interface FetchBlobResult {
  blob: Blob;
  /** The server's Content-Type, verbatim and possibly useless. */
  mime: string;
  /** Filename from Content-Disposition, or '' when the server sent none. */
  filename: string;
}

/**
 * Fetch a URL into a Blob, streaming so we can report progress and abort
 * mid-flight. Falls back to a plain `.blob()` when the body is not a readable
 * stream (older Safari, some polyfills).
 */
export async function fetchBlob(url: string, opts: FetchBlobOptions = {}): Promise<FetchBlobResult> {
  const { signal, headers, credentials, maxBytes, onProgress } = opts;

  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers,
      credentials: credentials ?? 'same-origin',
      mode: 'cors',
      redirect: 'follow',
    });
  } catch (err) {
    throw toPreviewError(err);
  }

  if (!res.ok) {
    throw new PreviewError(
      'HTTP',
      `${`The server returned ${res.status} ${res.statusText || ''}`.trim()}.`,
      {
        status: res.status,
        hint:
          res.status === 404
            ? 'The file may have been moved or deleted.'
            : res.status === 401 || res.status === 403
              ? 'You may not have permission to read this file, or a signed URL may have expired.'
              : 'Try again in a moment.',
      },
    );
  }

  const mime = res.headers.get('content-type') || '';
  const filename = filenameFromContentDisposition(res.headers.get('content-disposition'));
  const lengthHeader = res.headers.get('content-length');
  const total = lengthHeader ? Number(lengthHeader) : null;

  if (maxBytes && total && total > maxBytes) {
    throw new PreviewError('TOO_LARGE', 'This file is too large to preview.', {
      hint: `It is ${Math.round(total / 1e6)} MB; the limit is ${Math.round(maxBytes / 1e6)} MB. Download it to open locally.`,
    });
  }

  // No stream available — take the whole body and move on.
  if (!res.body || typeof res.body.getReader !== 'function') {
    const blob = await res.blob();
    onProgress?.(blob.size, blob.size);
    return { blob, mime, filename };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (maxBytes && loaded > maxBytes) {
        await reader.cancel();
        throw new PreviewError('TOO_LARGE', 'This file is too large to preview.', {
          hint: `The limit is ${Math.round(maxBytes / 1e6)} MB. Download it to open locally.`,
        });
      }
      onProgress?.(loaded, total);
    }
  } catch (err) {
    // Abort during read surfaces here rather than at the fetch() call.
    throw toPreviewError(err);
  }

  return {
    blob: new Blob(chunks as BlobPart[], mime ? { type: mime } : undefined),
    mime,
    filename,
  };
}

/** True for URLs a browser can load without any CORS involvement at all. */
export function isSameOriginOrData(url: string): boolean {
  if (/^(data|blob):/i.test(url)) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** Absolute http(s) URL — the only kind the Office Online viewer can accept. */
export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url, globalThis.location?.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Office's servers must reach it, so anything only this machine can see is out.
    return !/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
      u.hostname,
    );
  } catch {
    return false;
  }
}
