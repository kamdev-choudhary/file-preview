import { el, disposer } from '../ui/dom.js';
import { PreviewError, dependencyError } from '../core/errors.js';
import { formatBytes, extensionOf } from '../core/mime.js';
import type { ViewerContext, ViewerInstance } from '../core/registry.js';

/**
 * ZIP archives — a browsable file tree rather than a blank "cannot preview".
 * JSZip is already a dependency for pptx, so this costs nothing extra.
 */
export default async function archiveViewer(ctx: ViewerContext): Promise<ViewerInstance> {
  const { source, container, signal } = ctx;
  const d = disposer();

  ctx.setStatus('Loading archive reader…');
  let JSZip: typeof import('jszip');
  try {
    ({ default: JSZip } = await import('jszip'));
  } catch (err) {
    throw dependencyError('jszip', err);
  }

  ctx.setStatus('Downloading…');
  const buf = await source.arrayBuffer({ signal, onProgress: ctx.setProgress });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');

  let zip: import('jszip');
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (err) {
    throw new PreviewError('DECODE', 'This archive could not be opened.', {
      cause: err,
      hint: 'Only ZIP-based archives can be listed. RAR, 7z and tar are not supported.',
    });
  }

  const entries = Object.values(zip.files)
    .filter((f) => !f.dir)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length) {
    throw new PreviewError('EMPTY', 'This archive is empty.');
  }

  const list = el('div', { class: 'fp-filelist', role: 'list' });
  let totalUncompressed = 0;

  for (const entry of entries) {
    // `_data` is internal to JSZip but the only place the uncompressed size
    // lives for a file that has not been decompressed yet.
    const size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    totalUncompressed += size;
    const depth = entry.name.split('/').length - 1;
    const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
    const dir = entry.name.slice(0, entry.name.length - base.length);

    list.append(
      el(
        'div',
        { class: 'fp-filerow', role: 'listitem', style: { paddingLeft: `${12 + depth * 14}px` } },
        [
          el('span', {
            class: 'fp-fileicon',
            text: (extensionOf(base) || '?').slice(0, 4).toUpperCase(),
          }),
          el('span', { class: 'fp-filename' }, [
            dir ? el('span', { class: 'fp-filedir', text: dir }) : null,
            el('span', { text: base }),
          ]),
          el('span', { class: 'fp-filesize', text: size ? formatBytes(size) : '' }),
        ],
      ),
    );
  }

  const viewport = el('div', { class: 'fp-viewport fp-viewport--list' }, [
    el('div', { class: 'fp-notice' }, [
      `${entries.length.toLocaleString()} files · ${formatBytes(totalUncompressed)} uncompressed. ` +
        'Listing only — extract the archive to open its contents.',
    ]),
    list,
  ]);

  container.append(viewport);
  ctx.setStatus(`${entries.length.toLocaleString()} entries`);

  return { element: viewport, destroy: () => d.run() };
}
