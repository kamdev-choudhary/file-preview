/**
 * File-type identification.
 *
 * Three signals, in order of trustworthiness:
 *   1. magic bytes  — cannot be faked by a careless server, but is blind to the
 *                     difference between docx/xlsx/pptx (all are just ZIPs)
 *   2. extension    — usually right, and the only thing that separates OOXML
 *   3. declared MIME— frequently `application/octet-stream` or plain wrong
 *
 * `describe()` merges them with those caveats encoded.
 */

/** Broad category a viewer registers against. */
export const Kind = {
  IMAGE: 'image',
  PDF: 'pdf',
  AUDIO: 'audio',
  VIDEO: 'video',
  TEXT: 'text',
  CODE: 'code',
  MARKDOWN: 'markdown',
  JSON: 'json',
  CSV: 'csv',
  SHEET: 'sheet',
  DOC: 'doc',
  SLIDES: 'slides',
  ARCHIVE: 'archive',
  HTML: 'html',
  FONT: 'font',
  UNKNOWN: 'unknown',
} as const;

/** The value side of {@link Kind}. */
export type FileKind = (typeof Kind)[keyof typeof Kind];

/** One extension's worth of type knowledge. */
interface TypeInfo {
  mime: string;
  kind: FileKind;
  lang?: string;
}

/** Everything detection could work out about a file. */
export interface FileTypeDescriptor {
  name: string;
  ext: string;
  mime: string;
  kind: FileKind;
  lang: string | undefined;
  size: number | undefined;
}

/** What {@link sniff} can conclude from leading bytes alone. */
export interface SniffResult {
  mime: string;
  kind: FileKind;
  ext: string;
  /** True for a ZIP container, which may really be docx/xlsx/pptx/odt/jar. */
  zip?: boolean;
}

const T = (mime: string, kind: FileKind, lang?: string): TypeInfo => ({ mime, kind, lang });

/** extension -> { mime, kind, lang? } */
const BY_EXT: Record<string, TypeInfo> = {
  // ---- images -------------------------------------------------------------
  png: T('image/png', Kind.IMAGE),
  jpg: T('image/jpeg', Kind.IMAGE),
  jpeg: T('image/jpeg', Kind.IMAGE),
  jfif: T('image/jpeg', Kind.IMAGE),
  gif: T('image/gif', Kind.IMAGE),
  webp: T('image/webp', Kind.IMAGE),
  avif: T('image/avif', Kind.IMAGE),
  bmp: T('image/bmp', Kind.IMAGE),
  ico: T('image/x-icon', Kind.IMAGE),
  svg: T('image/svg+xml', Kind.IMAGE),
  apng: T('image/apng', Kind.IMAGE),
  heic: T('image/heic', Kind.IMAGE),
  heif: T('image/heif', Kind.IMAGE),
  tif: T('image/tiff', Kind.IMAGE),
  tiff: T('image/tiff', Kind.IMAGE),

  // ---- documents ----------------------------------------------------------
  pdf: T('application/pdf', Kind.PDF),
  doc: T('application/msword', Kind.DOC),
  docx: T('application/vnd.openxmlformats-officedocument.wordprocessingml.document', Kind.DOC),
  docm: T('application/vnd.ms-word.document.macroEnabled.12', Kind.DOC),
  odt: T('application/vnd.oasis.opendocument.text', Kind.DOC),
  rtf: T('application/rtf', Kind.DOC),

  xls: T('application/vnd.ms-excel', Kind.SHEET),
  xlsx: T('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Kind.SHEET),
  xlsm: T('application/vnd.ms-excel.sheet.macroEnabled.12', Kind.SHEET),
  xlsb: T('application/vnd.ms-excel.sheet.binary.macroEnabled.12', Kind.SHEET),
  ods: T('application/vnd.oasis.opendocument.spreadsheet', Kind.SHEET),

  ppt: T('application/vnd.ms-powerpoint', Kind.SLIDES),
  pptx: T('application/vnd.openxmlformats-officedocument.presentationml.presentation', Kind.SLIDES),
  pptm: T('application/vnd.ms-powerpoint.presentation.macroEnabled.12', Kind.SLIDES),
  odp: T('application/vnd.oasis.opendocument.presentation', Kind.SLIDES),

  // ---- data / text --------------------------------------------------------
  csv: T('text/csv', Kind.CSV),
  tsv: T('text/tab-separated-values', Kind.CSV),
  json: T('application/json', Kind.JSON, 'json'),
  jsonl: T('application/x-ndjson', Kind.JSON, 'json'),
  ndjson: T('application/x-ndjson', Kind.JSON, 'json'),
  json5: T('application/json5', Kind.JSON, 'json'),
  geojson: T('application/geo+json', Kind.JSON, 'json'),
  md: T('text/markdown', Kind.MARKDOWN, 'markdown'),
  markdown: T('text/markdown', Kind.MARKDOWN, 'markdown'),
  mdx: T('text/markdown', Kind.MARKDOWN, 'markdown'),
  txt: T('text/plain', Kind.TEXT),
  log: T('text/plain', Kind.TEXT),
  text: T('text/plain', Kind.TEXT),
  rst: T('text/plain', Kind.TEXT),
  htm: T('text/html', Kind.HTML, 'xml'),
  html: T('text/html', Kind.HTML, 'xml'),

  // ---- code ---------------------------------------------------------------
  js: T('text/javascript', Kind.CODE, 'javascript'),
  mjs: T('text/javascript', Kind.CODE, 'javascript'),
  cjs: T('text/javascript', Kind.CODE, 'javascript'),
  jsx: T('text/jsx', Kind.CODE, 'javascript'),
  ts: T('text/typescript', Kind.CODE, 'typescript'),
  tsx: T('text/tsx', Kind.CODE, 'typescript'),
  css: T('text/css', Kind.CODE, 'css'),
  scss: T('text/x-scss', Kind.CODE, 'scss'),
  less: T('text/x-less', Kind.CODE, 'less'),
  py: T('text/x-python', Kind.CODE, 'python'),
  rb: T('text/x-ruby', Kind.CODE, 'ruby'),
  go: T('text/x-go', Kind.CODE, 'go'),
  rs: T('text/x-rust', Kind.CODE, 'rust'),
  java: T('text/x-java', Kind.CODE, 'java'),
  kt: T('text/x-kotlin', Kind.CODE, 'kotlin'),
  swift: T('text/x-swift', Kind.CODE, 'swift'),
  c: T('text/x-c', Kind.CODE, 'c'),
  h: T('text/x-c', Kind.CODE, 'c'),
  cpp: T('text/x-c++', Kind.CODE, 'cpp'),
  cc: T('text/x-c++', Kind.CODE, 'cpp'),
  hpp: T('text/x-c++', Kind.CODE, 'cpp'),
  cs: T('text/x-csharp', Kind.CODE, 'csharp'),
  php: T('text/x-php', Kind.CODE, 'php'),
  sh: T('text/x-sh', Kind.CODE, 'bash'),
  bash: T('text/x-sh', Kind.CODE, 'bash'),
  zsh: T('text/x-sh', Kind.CODE, 'bash'),
  ps1: T('text/x-powershell', Kind.CODE, 'powershell'),
  sql: T('text/x-sql', Kind.CODE, 'sql'),
  yml: T('text/yaml', Kind.CODE, 'yaml'),
  yaml: T('text/yaml', Kind.CODE, 'yaml'),
  toml: T('text/x-toml', Kind.CODE, 'ini'),
  ini: T('text/x-ini', Kind.CODE, 'ini'),
  cfg: T('text/x-ini', Kind.CODE, 'ini'),
  conf: T('text/x-ini', Kind.CODE, 'ini'),
  env: T('text/plain', Kind.CODE, 'bash'),
  xml: T('application/xml', Kind.CODE, 'xml'),
  svelte: T('text/x-svelte', Kind.CODE, 'xml'),
  vue: T('text/x-vue', Kind.CODE, 'xml'),
  dockerfile: T('text/x-dockerfile', Kind.CODE, 'dockerfile'),
  graphql: T('application/graphql', Kind.CODE, 'graphql'),
  gql: T('application/graphql', Kind.CODE, 'graphql'),
  diff: T('text/x-diff', Kind.CODE, 'diff'),
  patch: T('text/x-diff', Kind.CODE, 'diff'),

  // ---- media --------------------------------------------------------------
  mp3: T('audio/mpeg', Kind.AUDIO),
  wav: T('audio/wav', Kind.AUDIO),
  ogg: T('audio/ogg', Kind.AUDIO),
  oga: T('audio/ogg', Kind.AUDIO),
  m4a: T('audio/mp4', Kind.AUDIO),
  aac: T('audio/aac', Kind.AUDIO),
  flac: T('audio/flac', Kind.AUDIO),
  opus: T('audio/opus', Kind.AUDIO),
  weba: T('audio/webm', Kind.AUDIO),
  mp4: T('video/mp4', Kind.VIDEO),
  m4v: T('video/mp4', Kind.VIDEO),
  webm: T('video/webm', Kind.VIDEO),
  mov: T('video/quicktime', Kind.VIDEO),
  ogv: T('video/ogg', Kind.VIDEO),
  mkv: T('video/x-matroska', Kind.VIDEO),
  avi: T('video/x-msvideo', Kind.VIDEO),

  // ---- archives -----------------------------------------------------------
  zip: T('application/zip', Kind.ARCHIVE),
  jar: T('application/java-archive', Kind.ARCHIVE),
  // Not ZIP containers — JSZip cannot list these, so they fall through to the
  // download card rather than a broken archive view.
  rar: T('application/vnd.rar', Kind.UNKNOWN),
  '7z': T('application/x-7z-compressed', Kind.UNKNOWN),
  tar: T('application/x-tar', Kind.UNKNOWN),
  gz: T('application/gzip', Kind.UNKNOWN),

  // ---- fonts --------------------------------------------------------------
  woff: T('font/woff', Kind.FONT),
  woff2: T('font/woff2', Kind.FONT),
  ttf: T('font/ttf', Kind.FONT),
  otf: T('font/otf', Kind.FONT),
};

/** Filenames with no extension that we still recognise. */
const BY_FILENAME: Record<string, TypeInfo> = {
  dockerfile: T('text/x-dockerfile', Kind.CODE, 'dockerfile'),
  makefile: T('text/x-makefile', Kind.CODE, 'makefile'),
  '.gitignore': T('text/plain', Kind.CODE, 'bash'),
  '.env': T('text/plain', Kind.CODE, 'bash'),
  license: T('text/plain', Kind.TEXT),
  readme: T('text/markdown', Kind.MARKDOWN, 'markdown'),
};

/** MIME types that carry no information — never let these beat a real signal. */
const GENERIC_MIME = new Set<string>([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
  'content/unknown',
  'application/download',
  'application/force-download',
  'application/x-download',
  'application/unknown',
]);

export function extensionOf(name: string = ''): string {
  const clean = String(name).split(/[?#]/)[0] ?? '';
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** Derive a display filename from a URL, falling back to something sane. */
export function filenameFromUrl(url: string, fallback: string = 'file'): string {
  try {
    const u = new URL(url, globalThis.location?.href || 'http://localhost/');
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    return last || fallback;
  } catch {
    const bare = (String(url).split(/[?#]/)[0] ?? '').split('/').filter(Boolean).pop();
    return bare ? decodeURIComponent(bare) : fallback;
  }
}

/** Pull `filename` out of a Content-Disposition header, RFC 5987 form included. */
export function filenameFromContentDisposition(header: string | null | undefined): string {
  if (!header) return '';
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent((star[2] ?? '').trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] ?? plain[1] ?? '').trim() : '';
}

const ascii = (bytes: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + len));

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0): boolean =>
  sig.every((b, i) => bytes[offset + i] === b);

/**
 * Identify a file from its leading bytes.
 * @param bytes At least the first ~64 bytes.
 */
export function sniff(bytes: Uint8Array | null | undefined): SniffResult | null {
  if (!bytes || bytes.length < 4) return null;

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46]))
    return { mime: 'application/pdf', kind: Kind.PDF, ext: 'pdf' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]))
    return { mime: 'image/png', kind: Kind.IMAGE, ext: 'png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff]))
    return { mime: 'image/jpeg', kind: Kind.IMAGE, ext: 'jpg' };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]))
    return { mime: 'image/gif', kind: Kind.IMAGE, ext: 'gif' };
  if (startsWith(bytes, [0x42, 0x4d])) return { mime: 'image/bmp', kind: Kind.IMAGE, ext: 'bmp' };
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]))
    return { mime: 'image/x-icon', kind: Kind.IMAGE, ext: 'ico' };
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]))
    return { mime: 'image/tiff', kind: Kind.IMAGE, ext: 'tiff' };

  // RIFF containers: WEBP and WAV and AVI share the outer header.
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const form = ascii(bytes, 8, 4);
    if (form === 'WEBP') return { mime: 'image/webp', kind: Kind.IMAGE, ext: 'webp' };
    if (form === 'WAVE') return { mime: 'audio/wav', kind: Kind.AUDIO, ext: 'wav' };
    if (form === 'AVI ') return { mime: 'video/x-msvideo', kind: Kind.VIDEO, ext: 'avi' };
  }

  // ISO-BMFF: `ftyp` at offset 4, brand at 8 decides image vs audio vs video.
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand.startsWith('avif') || brand.startsWith('avis'))
      return { mime: 'image/avif', kind: Kind.IMAGE, ext: 'avif' };
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1'))
      return { mime: 'image/heic', kind: Kind.IMAGE, ext: 'heic' };
    if (brand.startsWith('M4A')) return { mime: 'audio/mp4', kind: Kind.AUDIO, ext: 'm4a' };
    return { mime: 'video/mp4', kind: Kind.VIDEO, ext: 'mp4' };
  }

  if (ascii(bytes, 0, 4) === 'OggS') return { mime: 'audio/ogg', kind: Kind.AUDIO, ext: 'ogg' };
  if (ascii(bytes, 0, 4) === 'fLaC') return { mime: 'audio/flac', kind: Kind.AUDIO, ext: 'flac' };
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0))
    return { mime: 'audio/mpeg', kind: Kind.AUDIO, ext: 'mp3' };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]))
    return { mime: 'video/x-matroska', kind: Kind.VIDEO, ext: 'mkv' };

  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21]))
    return { mime: 'application/vnd.rar', kind: Kind.UNKNOWN, ext: 'rar' };
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf]))
    return {
      mime: 'application/x-7z-compressed',
      kind: Kind.UNKNOWN,
      ext: '7z',
    };
  if (startsWith(bytes, [0x1f, 0x8b]))
    return { mime: 'application/gzip', kind: Kind.UNKNOWN, ext: 'gz' };

  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]))
    // Legacy OLE2 container: .doc/.xls/.ppt. The extension decides which.
    return { mime: 'application/x-ole-storage', kind: Kind.UNKNOWN, ext: '' };

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]))
    // Could be zip/docx/xlsx/pptx/odt/jar. `zip: true` tells describe() to keep
    // whatever the extension claimed rather than collapsing it to "archive".
    return {
      mime: 'application/zip',
      kind: Kind.ARCHIVE,
      ext: 'zip',
      zip: true,
    };

  if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74]))
    // {\rt
    return { mime: 'application/rtf', kind: Kind.DOC, ext: 'rtf' };
  if (ascii(bytes, 0, 4) === 'wOFF') return { mime: 'font/woff', kind: Kind.FONT, ext: 'woff' };
  if (ascii(bytes, 0, 4) === 'wOF2') return { mime: 'font/woff2', kind: Kind.FONT, ext: 'woff2' };

  return null;
}

/** True if the buffer looks like decodable UTF-8 text rather than binary. */
export function looksLikeText(bytes: Uint8Array | null | undefined, sampleSize = 4096): boolean {
  if (!bytes?.length) return false;
  const n = Math.min(bytes.length, sampleSize);
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i] ?? 0;
    if (b === 0) return false; // a NUL byte means binary
    // Control characters other than tab/LF/CR/FF/ESC
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) suspicious++;
  }
  return suspicious / n < 0.05;
}

export interface DescribeInput {
  name?: string;
  mime?: string;
  bytes?: Uint8Array | undefined;
  size?: number | undefined;
}

/** Merge every available signal into one descriptor. */
export function describe({
  name = '',
  mime = '',
  bytes,
  size,
}: DescribeInput = {}): FileTypeDescriptor {
  const ext = extensionOf(name);
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase();

  const fromExt = BY_EXT[ext] ?? BY_FILENAME[base] ?? null;
  const bareMime = (String(mime).split(';')[0] ?? '').trim().toLowerCase();
  const declared = GENERIC_MIME.has(bareMime) ? null : bareMime;
  const sniffed = bytes ? sniff(bytes) : null;

  let kind: FileKind = fromExt?.kind ?? Kind.UNKNOWN;
  let resolvedMime: string = fromExt?.mime ?? declared ?? 'application/octet-stream';
  let lang: string | undefined = fromExt?.lang;

  if (sniffed && !sniffed.zip) {
    // Bytes beat the extension: a ".txt" that is really a PDF renders as a PDF.
    if (sniffed.kind !== Kind.UNKNOWN && sniffed.kind !== kind) {
      kind = sniffed.kind;
      resolvedMime = sniffed.mime;
      lang = undefined;
    }
  } else if (sniffed?.zip && !fromExt) {
    // A ZIP with an unknown extension is just an archive.
    kind = Kind.ARCHIVE;
    resolvedMime = 'application/zip';
  }

  // Nothing matched, but the bytes decode as text — show it as text rather than
  // dead-ending on a download card.
  if (kind === Kind.UNKNOWN && bytes && looksLikeText(bytes)) {
    kind = declared?.startsWith('text/') || !declared ? Kind.TEXT : kind;
    if (kind === Kind.TEXT) resolvedMime = declared || 'text/plain';
  }

  // Trust a specific declared MIME when the filename told us nothing.
  if (kind === Kind.UNKNOWN && declared) {
    if (declared.startsWith('image/')) kind = Kind.IMAGE;
    else if (declared.startsWith('audio/')) kind = Kind.AUDIO;
    else if (declared.startsWith('video/')) kind = Kind.VIDEO;
    else if (declared === 'application/pdf') kind = Kind.PDF;
    else if (declared === 'application/json') {
      kind = Kind.JSON;
      lang = 'json';
    } else if (declared.startsWith('text/')) kind = Kind.TEXT;
    if (kind !== Kind.UNKNOWN) resolvedMime = declared;
  }

  return {
    name: name || 'file',
    ext,
    mime: resolvedMime,
    kind,
    lang,
    size,
  };
}

/** Coarse kind implied by a MIME type alone, or null if it says nothing useful. */
export function kindFromMime(mime: string | null | undefined): FileKind | null {
  const m = (String(mime || '').split(';')[0] ?? '').trim().toLowerCase();
  if (!m || GENERIC_MIME.has(m)) return null;
  if (m.startsWith('image/')) return Kind.IMAGE;
  if (m.startsWith('audio/')) return Kind.AUDIO;
  if (m.startsWith('video/')) return Kind.VIDEO;
  if (m.startsWith('font/')) return Kind.FONT;
  if (m === 'application/pdf') return Kind.PDF;
  if (m === 'application/json') return Kind.JSON;
  if (m === 'text/markdown') return Kind.MARKDOWN;
  if (m === 'text/csv' || m === 'text/tab-separated-values') return Kind.CSV;
  if (m === 'text/html') return Kind.HTML;
  if (m.startsWith('text/')) return Kind.TEXT;
  return null;
}

/**
 * Should we read the file's leading bytes before picking a viewer?
 *
 * Magic bytes outrank the filename, but reading them costs a download for a
 * remote URL — so only pay that price when it can actually change the outcome:
 * when the bytes are already local (free), or when the server's Content-Type
 * disagrees with the extension about what this file even is.
 */
export function shouldPreSniff(source: {
  blob: Blob | null;
  declaredMime: string;
  kind: FileKind;
}): boolean {
  if (source.blob) return true;
  const declared = kindFromMime(source.declaredMime);
  return Boolean(declared && declared !== source.kind);
}

/** Human-readable byte count. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
