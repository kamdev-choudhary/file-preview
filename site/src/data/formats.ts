/** Hue groups. Each one owns a colour that the whole site reuses. */
export type Category = 'doc' | 'sheet' | 'image' | 'media' | 'code' | 'archive' | 'font';

export interface FormatRow {
  name: string;
  cat: Category;
  exts: string[];
  engine: string;
  /** Plain-language honesty about how close the preview is to the original. */
  fidelity: string;
}

export const FORMATS: FormatRow[] = [
  {
    name: 'Images',
    cat: 'image',
    exts: ['png', 'jpg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tiff'],
    engine: 'Native decoding, with zoom and pan',
    fidelity: 'exact',
  },
  {
    name: 'PDF',
    cat: 'doc',
    exts: ['pdf'],
    engine: 'pdf.js, rendered one page at a time',
    fidelity: 'exact',
  },
  {
    name: 'Word',
    cat: 'doc',
    exts: ['docx', 'docm'],
    engine: 'mammoth, mapped to semantic HTML',
    fidelity: 'approximate',
  },
  {
    name: 'Legacy Word',
    cat: 'doc',
    exts: ['doc'],
    engine: 'Built-in OLE2 reader, no dependency',
    fidelity: 'text only',
  },
  {
    name: 'PowerPoint',
    cat: 'doc',
    exts: ['pptx', 'pptm'],
    engine: 'Built-in OOXML reader',
    fidelity: 'content only',
  },
  {
    name: 'Spreadsheets',
    cat: 'sheet',
    exts: ['xlsx', 'xlsm'],
    engine: 'Built-in OpenXML parser',
    fidelity: 'values',
  },
  {
    name: 'Legacy sheets',
    cat: 'sheet',
    exts: ['xls', 'ods'],
    engine: 'SheetJS, supplied by you',
    fidelity: 'opt-in',
  },
  {
    name: 'Delimited text',
    cat: 'sheet',
    exts: ['csv', 'tsv'],
    engine: 'Built-in RFC 4180 parser',
    fidelity: 'exact',
  },
  {
    name: 'Markdown',
    cat: 'code',
    exts: ['md', 'markdown', 'mdx'],
    engine: 'marked, sanitised with DOMPurify',
    fidelity: 'rendered',
  },
  {
    name: 'Code',
    cat: 'code',
    exts: ['ts', 'js', 'py', 'go', 'rs', 'java', 'sql', 'yaml', '+40 more'],
    engine: 'highlight.js',
    fidelity: 'highlighted',
  },
  {
    name: 'Structured data',
    cat: 'code',
    exts: ['json', 'jsonl', 'geojson'],
    engine: 'Built-in, pretty-printed',
    fidelity: 'exact',
  },
  {
    name: 'Video',
    cat: 'media',
    exts: ['mp4', 'webm', 'mov', 'ogv'],
    engine: 'Native player, streamed not buffered',
    fidelity: 'exact',
  },
  {
    name: 'Audio',
    cat: 'media',
    exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'],
    engine: 'Native player',
    fidelity: 'exact',
  },
  {
    name: 'Archives',
    cat: 'archive',
    exts: ['zip', 'jar'],
    engine: 'JSZip, listed not extracted',
    fidelity: 'file listing',
  },
  {
    name: 'Fonts',
    cat: 'font',
    exts: ['woff', 'woff2', 'ttf', 'otf'],
    engine: 'FontFace, shown as a live specimen',
    fidelity: 'specimen',
  },
];

export interface SampleFile {
  file: string;
  label: string;
  cat: Category;
}

/** Generated into `public/samples` by `pnpm run samples`. */
export const SAMPLES: SampleFile[] = [
  { file: 'sample.pdf', label: 'PDF', cat: 'doc' },
  { file: 'sample.docx', label: 'Word', cat: 'doc' },
  { file: 'sample.pptx', label: 'Slides', cat: 'doc' },
  { file: 'sample.csv', label: 'CSV', cat: 'sheet' },
  { file: 'sample.png', label: 'Image', cat: 'image' },
  { file: 'sample.svg', label: 'Vector', cat: 'image' },
  { file: 'sample.md', label: 'Markdown', cat: 'code' },
  { file: 'sample.json', label: 'JSON', cat: 'code' },
  { file: 'sample.js', label: 'JavaScript', cat: 'code' },
  { file: 'sample.zip', label: 'Archive', cat: 'archive' },
];

/** The subset the inline viewer switches between. */
export const INLINE_SET: SampleFile[] = [
  { file: 'sample.pdf', label: 'PDF', cat: 'doc' },
  { file: 'sample.md', label: 'Markdown', cat: 'code' },
  { file: 'sample.csv', label: 'CSV', cat: 'sheet' },
  { file: 'sample.docx', label: 'Word', cat: 'doc' },
  { file: 'sample.png', label: 'Image', cat: 'image' },
  { file: 'sample.js', label: 'JavaScript', cat: 'code' },
];

export const extOf = (file: string): string => (file.split('.').pop() ?? '?').toLowerCase();
