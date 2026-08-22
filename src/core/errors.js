/**
 * Typed errors. Every failure the user can see carries a `code`, so the error
 * panel can pick the right recovery affordance (retry / download / open in
 * Office viewer) instead of dumping a stack trace.
 */

/** @typedef {'NETWORK'|'CORS'|'HTTP'|'ABORTED'|'TOO_LARGE'|'UNSUPPORTED'|'DECODE'|'PASSWORD'|'DEPENDENCY'|'EMPTY'|'UNKNOWN'} PreviewErrorCode */

export class PreviewError extends Error {
  /**
   * @param {PreviewErrorCode} code
   * @param {string} message  Shown to the user. Write it as a sentence.
   * @param {{ cause?: unknown, hint?: string, status?: number }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message, { cause: opts.cause });
    this.name = "PreviewError";
    this.code = code;
    /** Secondary line under the message — what the user can do about it. */
    this.hint = opts.hint;
    /** HTTP status, when code === 'HTTP'. */
    this.status = opts.status;
  }
}

/** Wrap anything thrown into a PreviewError without losing the original. */
export function toPreviewError(err, fallbackCode = "UNKNOWN") {
  if (err instanceof PreviewError) return err;
  if (err?.name === "AbortError") {
    return new PreviewError("ABORTED", "Preview cancelled.", { cause: err });
  }
  // A bare `TypeError: Failed to fetch` is what a browser gives for both a dead
  // network and a CORS rejection — they are deliberately indistinguishable from
  // script. Report it as the ambiguous case rather than guessing.
  if (err instanceof TypeError && /fetch/i.test(err.message || "")) {
    return new PreviewError(
      "CORS",
      "Could not download this file from its URL.",
      {
        cause: err,
        hint:
          "The server may be offline, or it may not send the CORS headers " +
          "that let this page read the file. Try opening it in a new tab.",
      },
    );
  }
  const message = err?.message || String(err ?? "Unknown error");
  return new PreviewError(fallbackCode, message, { cause: err });
}

/**
 * A missing lazy dependency is a packaging problem, not a user problem — say so
 * clearly rather than surfacing a module-resolution stack trace.
 */
export function dependencyError(pkg, cause) {
  return new PreviewError(
    "DEPENDENCY",
    `The viewer for this file type could not be loaded.`,
    {
      cause,
      hint: `"${pkg}" failed to load. If you are offline or behind a strict CSP, this chunk may have been blocked.`,
    },
  );
}
