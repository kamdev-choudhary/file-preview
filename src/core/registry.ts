import { Kind } from './mime.js';
import type { FileKind } from './mime.js';
import type { Source } from './source.js';
import type { PreviewConfig } from './config.js';

/** A button a viewer contributes to the toolbar. */
export interface ToolbarAction {
  id: string;
  /** Mutable: a toggle action may rewrite its own label when it fires. */
  label: string;
  icon?: string;
  toggled?: boolean;
  run(): void | Promise<void>;
}

/** What the host element hands a viewer when it mounts. */
export interface ViewerContext {
  source: Source;
  container: HTMLElement;
  signal: AbortSignal;
  config: PreviewConfig;
  setStatus(text: string): void;
  setProgress(loaded: number, total: number | null): void;
  requestFallback(reason?: Error): void;
}

/** What a viewer hands back. Every member beyond `element` is optional. */
export interface ViewerInstance {
  element?: HTMLElement;
  destroy?(): void;
  actions?: ToolbarAction[];
  pageCount?: number;
  goToPage?(page: number): void;
  onPageChange?(cb: (page: number, total: number) => void): void;
  zoomIn?(): void;
  zoomOut?(): void;
  zoomReset?(): void;
  onZoomChange?(cb: (scale: number) => void): void;
}

export type ViewerFactory = (ctx: ViewerContext) => Promise<ViewerInstance> | ViewerInstance;

export interface ViewerDefinition {
  id: string;
  label: string;
  /** Higher wins. Return 0 to decline. Later registrations win ties. */
  match(source: Source): number;
  load(): Promise<{ default: ViewerFactory }>;
}

/**
 * Viewer registry.
 *
 * A viewer is a small object with `match(source) -> number` and a `load()` that
 * dynamically imports the real implementation. Keeping `load()` behind a
 * dynamic import is what stops pdf.js / SheetJS / mammoth from being downloaded
 * by someone who only ever previews a PNG.
 *
 * `match` returns a priority score; the highest non-zero wins. Custom viewers
 * registered later win ties, so an app can override a built-in by returning a
 * higher score for the types it cares about.
 */
const viewers: ViewerDefinition[] = [];

/** Register a custom viewer, or override a built-in by reusing its id. */
export function registerViewer(def: ViewerDefinition): () => void {
  if (!def?.id || typeof def.match !== 'function' || typeof def.load !== 'function') {
    throw new TypeError('registerViewer() needs { id, match, load }');
  }
  // Re-registering an id replaces it, so hot-reload and overrides behave.
  const existing = viewers.findIndex((v) => v.id === def.id);
  if (existing >= 0) viewers.splice(existing, 1, def);
  else viewers.push(def);
  return () => {
    const i = viewers.indexOf(def);
    if (i >= 0) viewers.splice(i, 1);
  };
}

export function listViewers(): ViewerDefinition[] {
  return viewers.slice();
}

/**
 * Best viewer for a source, or null when nothing can render it.
 * Later registrations win ties so user overrides beat built-ins.
 *
 * @param exclude Viewer ids already tried and failed.
 */
export function resolveViewer(
  source: Source,
  exclude?: ReadonlySet<string>,
): ViewerDefinition | null {
  let best: ViewerDefinition | null = null;
  let bestScore = 0;
  for (const v of viewers) {
    if (exclude?.has(v.id)) continue;
    let score = 0;
    try {
      score = v.match(source) || 0;
    } catch {
      score = 0;
    }
    if (score >= bestScore && score > 0) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Built-ins. Order here is only cosmetic; `match` scores decide the winner.
// ---------------------------------------------------------------------------

const kindIs =
  (...kinds: FileKind[]) =>
  (s: Source): number =>
    kinds.includes(s.kind) ? 1 : 0;

registerViewer({
  id: 'image',
  label: 'Image',
  match: kindIs(Kind.IMAGE),
  load: () => import('../viewers/image.js'),
});

registerViewer({
  id: 'pdf',
  label: 'PDF',
  match: kindIs(Kind.PDF),
  load: () => import('../viewers/pdf.js'),
});

registerViewer({
  id: 'media',
  label: 'Media',
  match: kindIs(Kind.AUDIO, Kind.VIDEO),
  load: () => import('../viewers/media.js'),
});

registerViewer({
  id: 'sheet',
  label: 'Spreadsheet',
  match: kindIs(Kind.SHEET, Kind.CSV),
  load: () => import('../viewers/sheet.js'),
});

registerViewer({
  id: 'docx',
  label: 'Document',
  // mammoth reads OOXML only; .rtf/.odt score lower and get the download
  // card plus an Office-viewer offer instead of a broken render.
  match: (s) => (s.kind === Kind.DOC && /^(docx|docm)$/.test(s.ext) ? 1 : 0),
  load: () => import('../viewers/docx.js'),
});

registerViewer({
  id: 'doc',
  label: 'Document',
  // Legacy binary Word, read natively. Text only — see src/core/doc.ts.
  match: (s) => (s.kind === Kind.DOC && s.ext === 'doc' ? 1 : 0),
  load: () => import('../viewers/doc.js'),
});

registerViewer({
  id: 'pptx',
  label: 'Slides',
  match: (s) => (s.kind === Kind.SLIDES && /^(pptx|pptm)$/.test(s.ext) ? 1 : 0),
  load: () => import('../viewers/pptx.js'),
});

registerViewer({
  id: 'markdown',
  label: 'Markdown',
  match: kindIs(Kind.MARKDOWN),
  load: () => import('../viewers/markdown.js'),
});

registerViewer({
  id: 'text',
  label: 'Text',
  match: kindIs(Kind.TEXT, Kind.CODE, Kind.JSON, Kind.HTML),
  load: () => import('../viewers/text.js'),
});

registerViewer({
  id: 'archive',
  label: 'Archive',
  match: kindIs(Kind.ARCHIVE),
  load: () => import('../viewers/archive.js'),
});

registerViewer({
  id: 'font',
  label: 'Font',
  match: kindIs(Kind.FONT),
  load: () => import('../viewers/font.js'),
});
