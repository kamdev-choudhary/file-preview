import { el, disposer } from '../ui/dom.js';
import { PreviewError } from '../core/errors.js';
import { Kind } from '../core/mime.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

/** Map a MediaError code onto something a person can act on. */
function mediaErrorFor(media: HTMLMediaElement, name: string): PreviewError {
  const code = media.error?.code;
  if (code === 1) return new PreviewError('ABORTED', 'Playback was cancelled.');
  if (code === 2)
    return new PreviewError('NETWORK', 'The connection dropped while loading this media.', {
      hint: 'Check your network and try again.',
    });
  if (code === 3)
    return new PreviewError('DECODE', 'This media file appears to be corrupt.', {
      hint: 'The file could not be decoded. Try downloading it.',
    });
  return new PreviewError('UNSUPPORTED', 'This browser cannot play this media format.', {
    hint: `Nothing is wrong with the file — ${name.split('.').pop()?.toUpperCase() || 'this format'} just is not supported here. Download it to play in another app.`,
  });
}

/**
 * Audio and video.
 *
 * Always streams from the original URL so the browser can range-request: a
 * 2 GB video starts playing immediately instead of buffering in full. That
 * also means codec support is the browser's call, not ours — .mkv and .avi
 * usually fail here even though the file is perfectly fine, so the error text
 * says exactly that.
 */
export default async function mediaViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();
  const isVideo = source.kind === Kind.VIDEO;

  const media = el(isVideo ? 'video' : 'audio', {
    class: isVideo ? 'fp-video' : 'fp-audio',
    controls: true,
    preload: 'metadata',
    playsInline: true,
  });

  ctx.setStatus('Loading media…');

  const ready = new Promise<void>((resolve, reject) => {
    const ok = () => resolve();
    const fail = () => reject(mediaErrorFor(media, source.name));
    media.addEventListener('loadedmetadata', ok, { once: true });
    media.addEventListener('error', fail, { once: true });
    d.add(() => {
      media.removeEventListener('loadedmetadata', ok);
      media.removeEventListener('error', fail);
    });
  });

  media.src = source.displayUrl;

  try {
    await ready;
  } catch (err) {
    // Streaming failed. If the bytes are reachable another way (auth headers,
    // for instance) a buffered blob: URL can still work.
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    if (source.isRemote) {
      try {
        await source.toBlob({ signal, onProgress: ctx.setProgress });
        const retry = new Promise<void>((resolve, reject) => {
          media.addEventListener('loadedmetadata', () => resolve(), { once: true });
          media.addEventListener('error', () => reject(mediaErrorFor(media, source.name)), { once: true });
        });
        media.src = source.objectUrl();
        await retry;
      } catch (err2) {
        d.run();
        throw err2;
      }
    } else {
      d.run();
      throw err;
    }
  }

  if (signal.aborted) {
    d.run();
    throw new DOMException('aborted', 'AbortError');
  }

  const stage = el('div', { class: isVideo ? 'fp-stage fp-stage--video' : 'fp-stage fp-stage--audio' }, [
    isVideo ? media : el('div', { class: 'fp-audio-card' }, [
      el('div', { class: 'fp-audio-title', text: source.name }),
      media,
    ]),
  ]);
  const viewport = el('div', { class: 'fp-viewport fp-viewport--center' }, [stage]);
  container.append(viewport);

  const secs = media.duration;
  // `media` is typed as the union of both elements; only the video branch has
  // intrinsic dimensions, and `isVideo` is what decided which tag was created.
  const video = isVideo ? (media as HTMLVideoElement) : null;
  ctx.setStatus(
    Number.isFinite(secs) && secs > 0
      ? `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}` +
          (video?.videoWidth ? ` · ${video.videoWidth} × ${video.videoHeight}` : '')
      : '',
  );

  return {
    element: viewport,
    destroy: () => {
      // Detaching without pausing leaves audio playing behind a closed modal.
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch {
        /* already torn down */
      }
      d.run();
    },
  };
}
