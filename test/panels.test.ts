import { describe as group, expect, it, vi } from 'vitest';
import {
  canUseOfficeViewer,
  errorPanel,
  loadingPanel,
  officeFrame,
  officeViewerUrl,
  unsupportedPanel,
} from '../src/ui/panels.js';
import { PreviewError } from '../src/core/errors.js';
import { toSource } from '../src/core/source.js';
import { getConfig } from '../src/core/config.js';

const config = () => ({ ...getConfig() });
const labels = (panel: HTMLElement) =>
  [...panel.querySelectorAll('.fp-btn')].map((b) => b.textContent?.trim());

group('canUseOfficeViewer', () => {
  it('accepts an Office file at a public URL', () => {
    expect(canUseOfficeViewer(toSource('https://example.com/a.docx'), config())).toBe(true);
  });

  it.each(['xlsx', 'pptx', 'doc', 'xls', 'ppt', 'docm', 'xlsm', 'xlsb', 'pptm'])(
    'accepts .%s',
    (ext) => {
      expect(canUseOfficeViewer(toSource(`https://example.com/a.${ext}`), config())).toBe(true);
    },
  );

  it('refuses a non-Office file', () => {
    expect(canUseOfficeViewer(toSource('https://example.com/a.pdf'), config())).toBe(false);
  });

  it('refuses a URL Microsoft could never reach', () => {
    for (const url of [
      'http://localhost:3000/a.docx',
      'http://127.0.0.1/a.docx',
      'http://192.168.1.5/a.docx',
      'http://10.0.0.1/a.docx',
    ]) {
      expect(canUseOfficeViewer(toSource(url), config()), url).toBe(false);
    }
  });

  it('refuses a local file with no URL at all', () => {
    const source = toSource(new File(['x'], 'a.docx'));
    expect(canUseOfficeViewer(source, config())).toBe(false);
  });

  it('honours the officeViewer kill switch', () => {
    const source = toSource('https://example.com/a.docx');
    expect(canUseOfficeViewer(source, { ...config(), officeViewer: false })).toBe(false);
  });
});

group('officeViewerUrl / officeFrame', () => {
  it('encodes the source URL into the embed URL', () => {
    const url = officeViewerUrl('https://example.com/my file.docx?a=1');
    expect(url).toContain('view.officeapps.live.com');
    expect(url).toContain(encodeURIComponent('https://example.com/my file.docx?a=1'));
  });

  it('sandboxes the frame and sends no referrer', () => {
    const frame = officeFrame(toSource('https://example.com/a.docx')).querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-popups allow-forms',
    );
    expect(frame.referrerPolicy).toBe('no-referrer');
  });
});

group('unsupportedPanel', () => {
  it('badges the extension and names the file', () => {
    const panel = unsupportedPanel(toSource('/a/legacy.rar'));
    expect(panel.querySelector('.fp-panel-badge')?.textContent).toBe('RAR');
    expect(panel.querySelector('.fp-panel-title')?.textContent).toBe('legacy.rar');
  });

  it('offers only the handlers it was given', () => {
    expect(labels(unsupportedPanel(toSource('/a.rar')))).toEqual([]);
    expect(labels(unsupportedPanel(toSource('/a.rar'), { onDownload: () => {} }))).toEqual([
      'Download',
    ]);
  });

  it('wires the download handler', () => {
    const onDownload = vi.fn();
    const panel = unsupportedPanel(toSource('/a.rar'), { onDownload });
    panel.querySelector<HTMLButtonElement>('.fp-btn')!.click();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('falls back to a generic badge with no extension', () => {
    expect(unsupportedPanel(toSource('/noext')).querySelector('.fp-panel-badge')?.textContent).toBe(
      'FILE',
    );
  });
});

group('errorPanel', () => {
  const all = {
    onRetry: () => {},
    onDownload: () => {},
    onOpenTab: () => {},
  };

  it('shows the message, the hint and the code', () => {
    const panel = errorPanel(
      new PreviewError('HTTP', 'The server returned 404.', { hint: 'It may have moved.' }),
      toSource('/a.pdf'),
      {},
    );
    expect(panel.querySelector('.fp-panel-title')?.textContent).toBe('The server returned 404.');
    expect(panel.querySelector('.fp-panel-msg')?.textContent).toBe('It may have moved.');
    expect(panel.querySelector('.fp-panel-meta')?.textContent).toContain('HTTP');
  });

  it('offers retry for failures that might be transient', () => {
    for (const code of ['NETWORK', 'CORS', 'HTTP', 'UNKNOWN', 'DECODE', 'DEPENDENCY'] as const) {
      const panel = errorPanel(new PreviewError(code, 'x'), toSource('/a.pdf'), all);
      expect(labels(panel), code).toContain('Try again');
    }
  });

  it('does not offer retry for failures that will never succeed', () => {
    for (const code of ['PASSWORD', 'UNSUPPORTED', 'TOO_LARGE', 'EMPTY'] as const) {
      const panel = errorPanel(new PreviewError(code, 'x'), toSource('/a.pdf'), all);
      expect(labels(panel), code).not.toContain('Try again');
    }
  });

  it('offers a new tab when the block is ours, not the browser’s', () => {
    const panel = errorPanel(new PreviewError('CORS', 'x'), toSource('/a.pdf'), all);
    expect(labels(panel)).toContain('Open in new tab');
  });

  it('hides download for a CORS failure, where we have no bytes to give', () => {
    const panel = errorPanel(new PreviewError('CORS', 'x'), toSource('/a.pdf'), all);
    expect(labels(panel)).not.toContain('Download');
  });

  it('offers download for a decode failure, where the bytes are fine', () => {
    const panel = errorPanel(new PreviewError('DECODE', 'x'), toSource('/a.pdf'), all);
    expect(labels(panel)).toContain('Download');
  });

  it('treats a missing error as UNKNOWN with a generic message', () => {
    const panel = errorPanel(null, null, {});
    expect(panel.querySelector('.fp-panel-title')?.textContent).toBe(
      'This file could not be previewed.',
    );
    expect(panel.querySelector('.fp-panel-meta')?.textContent).toBe('UNKNOWN');
  });

  it('omits the actions row entirely when nothing applies', () => {
    const panel = errorPanel(new PreviewError('EMPTY', 'x'), null, {});
    expect(panel.querySelector('.fp-panel-actions')).toBeNull();
  });

  it('wires each handler to its button', () => {
    const onRetry = vi.fn();
    const panel = errorPanel(new PreviewError('HTTP', 'x'), toSource('/a.pdf'), { onRetry });
    panel.querySelector<HTMLButtonElement>('.fp-btn')!.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

group('loadingPanel', () => {
  it('starts indeterminate with a default label', () => {
    const p = loadingPanel();
    expect(p.node.querySelector('.fp-progress')?.classList.contains('is-indeterminate')).toBe(true);
    expect(p.node.querySelector('.fp-loading-label')?.textContent).toBe('Loading…');
  });

  it('sets a status, and falls back when cleared', () => {
    const p = loadingPanel();
    p.setStatus('Converting…');
    expect(p.node.querySelector('.fp-loading-label')?.textContent).toBe('Converting…');
    p.setStatus('');
    expect(p.node.querySelector('.fp-loading-label')?.textContent).toBe('Loading…');
  });

  it('becomes determinate once a total is known', () => {
    const p = loadingPanel();
    p.setProgress(500_000, 1_000_000);
    const track = p.node.querySelector('.fp-progress')!;
    expect(track.classList.contains('is-indeterminate')).toBe(false);
    expect(p.node.querySelector<HTMLElement>('.fp-progress-bar')!.style.width).toBe('50.0%');
    expect(p.node.querySelector('.fp-loading-label')?.textContent).toContain('of 1.0 MB');
  });

  it('stays indeterminate but still reports bytes with no total', () => {
    const p = loadingPanel();
    p.setProgress(2048, null);
    expect(p.node.querySelector('.fp-progress')?.classList.contains('is-indeterminate')).toBe(true);
    expect(p.node.querySelector('.fp-loading-label')?.textContent).toBe('Downloading… 2.0 KB');
  });

  it('never reports over 100%', () => {
    const p = loadingPanel();
    p.setProgress(200, 100);
    expect(p.node.querySelector<HTMLElement>('.fp-progress-bar')!.style.width).toBe('100.0%');
  });
});
