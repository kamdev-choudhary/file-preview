import { describe as group, expect, it } from 'vitest';
import { dependencyError, PreviewError, toPreviewError } from '../src/core/errors.js';

group('PreviewError', () => {
  it('carries a code, a hint and a status', () => {
    const e = new PreviewError('HTTP', 'Server said no.', { hint: 'Try later.', status: 503 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PreviewError');
    expect(e.code).toBe('HTTP');
    expect(e.message).toBe('Server said no.');
    expect(e.hint).toBe('Try later.');
    expect(e.status).toBe(503);
  });

  it('preserves the original cause', () => {
    const cause = new Error('root');
    expect(new PreviewError('UNKNOWN', 'wrapped', { cause }).cause).toBe(cause);
  });
});

group('toPreviewError', () => {
  it('passes a PreviewError straight through', () => {
    const e = new PreviewError('DECODE', 'bad bytes');
    expect(toPreviewError(e)).toBe(e);
  });

  it('maps an AbortError to ABORTED', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(toPreviewError(abort).code).toBe('ABORTED');
  });

  it('maps a failed fetch to CORS, since the browser will not say which it was', () => {
    const e = toPreviewError(new TypeError('Failed to fetch'));
    expect(e.code).toBe('CORS');
    expect(e.hint).toMatch(/CORS/);
  });

  it('does not treat an unrelated TypeError as a network failure', () => {
    expect(toPreviewError(new TypeError('x is not a function')).code).toBe('UNKNOWN');
  });

  it('honours the fallback code', () => {
    expect(toPreviewError(new Error('boom'), 'DECODE').code).toBe('DECODE');
  });

  it('keeps the original message', () => {
    expect(toPreviewError(new Error('specific detail')).message).toBe('specific detail');
  });

  it('stringifies a non-Error throw', () => {
    expect(toPreviewError('just a string').message).toBe('just a string');
    expect(toPreviewError(null).message).toBe('Unknown error');
    expect(toPreviewError(undefined).message).toBe('Unknown error');
  });
});

group('dependencyError', () => {
  it('names the package and explains it is a packaging problem', () => {
    const e = dependencyError('pdfjs-dist', new Error('chunk load failed'));
    expect(e.code).toBe('DEPENDENCY');
    expect(e.hint).toContain('pdfjs-dist');
  });
});
