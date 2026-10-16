/**
 * Typed errors. Every failure the user can see carries a `code`, so the error
 * panel can pick the right recovery affordance (retry / download / open in
 * Office viewer) instead of dumping a stack trace.
 */

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

export interface PreviewErrorOptions {
  cause?: unknown;
  /** Secondary line under the message — what the user can do about it. */
  hint?: string;
  /** HTTP status, when code === 'HTTP'. */
  status?: number;
}

export class PreviewError extends Error {
  override readonly name = 'PreviewError';
  readonly code: PreviewErrorCode;
  readonly hint: string | undefined;
  readonly status: number | undefined;

  /**
   * @param code    Machine-readable failure class.
   * @param message Shown to the user. Write it as a sentence.
   */
  constructor(code: PreviewErrorCode, message: string, opts: PreviewErrorOptions = {}) {
    super(message, { cause: opts.cause });
    this.code = code;
    this.hint = opts.hint;
    this.status = opts.status;
  }
}

/** Wrap anything thrown into a PreviewError without losing the original. */
export function toPreviewError(err: unknown, fallbackCode: PreviewErrorCode = 'UNKNOWN'): PreviewError {
  if (err instanceof PreviewError) return err;

  if (err instanceof Error && err.name === 'AbortError') {
    return new PreviewError('ABORTED', 'Preview cancelled.', { cause: err });
  }

  // A bare `TypeError: Failed to fetch` is what a browser gives for both a dead
  // network and a CORS rejection — they are deliberately indistinguishable from
  // script. Report it as the ambiguous case rather than guessing.
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return new PreviewError('CORS', 'Could not download this file from its URL.', {
      cause: err,
      hint:
        'The server may be offline, or it may not send the CORS headers ' +
        'that let this page read the file. Try opening it in a new tab.',
    });
  }

  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  return new PreviewError(fallbackCode, message || 'Unknown error', { cause: err });
}

/**
 * A missing lazy dependency is a packaging problem, not a user problem — say so
 * clearly rather than surfacing a module-resolution stack trace.
 */
export function dependencyError(pkg: string, cause?: unknown): PreviewError {
  return new PreviewError('DEPENDENCY', 'The viewer for this file type could not be loaded.', {
    cause,
    hint: `"${pkg}" failed to load. If you are offline or behind a strict CSP, this chunk may have been blocked.`,
  });
}
