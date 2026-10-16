import { afterEach, describe as group, expect, it, vi } from 'vitest';
import { fetchBlob, isPublicHttpUrl, isSameOriginOrData } from '../src/core/net.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const mockFetch = (res: Response | Error) => {
  const spy = vi.spyOn(globalThis, 'fetch');
  if (res instanceof Error) spy.mockRejectedValue(res);
  else spy.mockResolvedValue(res);
  return spy;
};

/** A streaming body with no Content-Length, so length is unknowable up front. */
const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) return controller.close();
      controller.enqueue(encoder.encode(chunks[i]!));
      i++;
    },
  });
};

group('fetchBlob', () => {
  it('returns the blob, the declared mime and the server filename', async () => {
    mockFetch(
      new Response('hello', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': 'attachment; filename="greeting.txt"',
        },
      }),
    );
    const out = await fetchBlob('https://example.com/x');
    expect(await out.blob.text()).toBe('hello');
    expect(out.mime).toBe('text/plain; charset=utf-8');
    expect(out.filename).toBe('greeting.txt');
  });

  it('returns an empty filename when the server sent no disposition', async () => {
    mockFetch(new Response('x'));
    expect((await fetchBlob('https://example.com/x')).filename).toBe('');
  });

  it('defaults credentials to same-origin', async () => {
    const spy = mockFetch(new Response('x'));
    await fetchBlob('https://example.com/x');
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('passes headers and credentials through', async () => {
    const spy = mockFetch(new Response('x'));
    await fetchBlob('https://example.com/x', {
      headers: { Authorization: 'Bearer t' },
      credentials: 'include',
    });
    expect(spy.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer t' },
      credentials: 'include',
    });
  });

  it('maps a non-2xx response to HTTP, carrying the status', async () => {
    mockFetch(new Response('nope', { status: 500, statusText: 'Server Error' }));
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({
      code: 'HTTP',
      status: 500,
    });
  });

  it('tailors the hint to the status', async () => {
    const hintFor = async (status: number) => {
      mockFetch(new Response('', { status }));
      try {
        await fetchBlob('https://example.com/x');
      } catch (e) {
        return (e as { hint?: string }).hint ?? '';
      }
      throw new Error('expected a rejection');
    };
    expect(await hintFor(404)).toMatch(/moved or deleted/);
    expect(await hintFor(401)).toMatch(/permission|signed URL/);
    expect(await hintFor(403)).toMatch(/permission|signed URL/);
    expect(await hintFor(503)).toMatch(/Try again/);
  });

  it('refuses before downloading when Content-Length busts the limit', async () => {
    const spy = mockFetch(
      new Response('x'.repeat(50), { headers: { 'content-length': '5000000' } }),
    );
    await expect(fetchBlob('https://example.com/big', { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('aborts mid-stream when a lying server exceeds the limit', async () => {
    // No Content-Length, so the only defence is the running total while reading.
    mockFetch(new Response(streamOf(['a'.repeat(400), 'b'.repeat(400)])));
    await expect(fetchBlob('https://example.com/x', { maxBytes: 500 })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });

  it('allows a file that fits the limit exactly', async () => {
    mockFetch(new Response('x'.repeat(100), { headers: { 'content-length': '100' } }));
    await expect(fetchBlob('https://example.com/x', { maxBytes: 100 })).resolves.toBeTruthy();
  });

  it('reports progress with a total when one is known', async () => {
    const onProgress = vi.fn();
    mockFetch(new Response('hello', { headers: { 'content-length': '5' } }));
    await fetchBlob('https://example.com/x', { onProgress });
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.at(-1)).toEqual([5, 5]);
  });

  it('reports progress with a null total when the length is unknown', async () => {
    const onProgress = vi.fn();
    mockFetch(new Response(streamOf(['abc'])));
    await fetchBlob('https://example.com/x', { onProgress });
    expect(onProgress.mock.calls.at(-1)).toEqual([3, null]);
  });

  it('falls back to .blob() when the body is not a stream', async () => {
    const onProgress = vi.fn();
    mockFetch(new Response(null, { headers: { 'content-type': 'text/plain' } }));
    const out = await fetchBlob('https://example.com/x', { onProgress });
    expect(out.blob.size).toBe(0);
    expect(onProgress).toHaveBeenCalledWith(0, 0);
  });

  it('maps a failed fetch to CORS, which is all the browser tells us', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'CORS' });
  });

  it('maps an abort to ABORTED', async () => {
    mockFetch(new DOMException('aborted', 'AbortError'));
    await expect(fetchBlob('https://example.com/x')).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('tags the blob with the served content type', async () => {
    mockFetch(new Response(streamOf(['x']), { headers: { 'content-type': 'image/png' } }));
    expect((await fetchBlob('https://example.com/x')).blob.type).toBe('image/png');
  });
});

group('isSameOriginOrData', () => {
  it('accepts data: and blob: URLs, which involve no CORS at all', () => {
    expect(isSameOriginOrData('data:text/plain,hi')).toBe(true);
    expect(isSameOriginOrData('blob:http://localhost/abc')).toBe(true);
    expect(isSameOriginOrData('DATA:text/plain,hi')).toBe(true);
  });

  it('accepts a relative path', () => {
    expect(isSameOriginOrData('/files/a.pdf')).toBe(true);
  });

  it('rejects another origin', () => {
    expect(isSameOriginOrData('https://other.example.com/a.pdf')).toBe(false);
  });
});

group('isPublicHttpUrl', () => {
  it('accepts a public http(s) URL', () => {
    expect(isPublicHttpUrl('https://example.com/a.docx')).toBe(true);
    expect(isPublicHttpUrl('http://example.com/a.docx')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(isPublicHttpUrl('data:text/plain,hi')).toBe(false);
    expect(isPublicHttpUrl('blob:http://localhost/abc')).toBe(false);
    expect(isPublicHttpUrl('file:///tmp/a.docx')).toBe(false);
  });

  it('rejects hosts only this machine can reach', () => {
    for (const url of [
      'http://localhost/a.docx',
      'http://127.0.0.1/a.docx',
      'http://0.0.0.0/a.docx',
      'http://10.1.2.3/a.docx',
      'http://192.168.0.10/a.docx',
      'http://172.16.0.1/a.docx',
      'http://172.31.255.1/a.docx',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it('does not mistake a public 172.x host for a private one', () => {
    expect(isPublicHttpUrl('http://172.15.0.1/a.docx')).toBe(true);
    expect(isPublicHttpUrl('http://172.32.0.1/a.docx')).toBe(true);
  });
});
