/**
 * Syntax highlighting, one grammar at a time.
 *
 * `highlight.js/lib/common` bundles ~40 grammars into a single 198 kB chunk,
 * which every text or code preview paid for regardless of the file's language.
 * Importing the core plus exactly one grammar cuts that to roughly 30 kB for
 * the common case.
 *
 * The map is explicit rather than a templated `import()` so the bundler can see
 * every target statically and emit one small chunk per language. Only the
 * languages `mime.ts` can actually produce are listed; anything else falls back
 * to unhighlighted text, which is a perfectly good result.
 */
import type { HLJSApi } from 'highlight.js';

type GrammarLoader = () => Promise<{ default: unknown }>;

const GRAMMARS: Record<string, GrammarLoader> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  go: () => import('highlight.js/lib/languages/go'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  less: () => import('highlight.js/lib/languages/less'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  php: () => import('highlight.js/lib/languages/php'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  python: () => import('highlight.js/lib/languages/python'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
};

/** True when a grammar for this language is available to load. */
export function canHighlight(lang: string | undefined): boolean {
  return Boolean(lang && lang in GRAMMARS);
}

let corePromise: Promise<HLJSApi> | null = null;
const registered = new Set<string>();

/**
 * Highlight `code` as `lang`, returning HTML, or null when highlighting is not
 * possible. Never throws: highlighting is a nicety and plain text is the
 * fallback, so a missing chunk or a broken grammar must not fail the preview.
 */
export async function highlight(code: string, lang: string | undefined): Promise<string | null> {
  const loadGrammar = lang ? GRAMMARS[lang] : undefined;
  if (!lang || !loadGrammar) return null;

  try {
    corePromise ??= import('highlight.js/lib/core').then((m) => m.default);
    const hljs = await corePromise;

    if (!registered.has(lang)) {
      const mod = await loadGrammar();
      // Registering the same language twice is harmless but pointless; the
      // guard also keeps repeated previews of one language to a single import.
      hljs.registerLanguage(lang, mod.default as Parameters<HLJSApi['registerLanguage']>[1]);
      registered.add(lang);
    }

    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    // A blocked chunk (offline, strict CSP) or an unusable grammar: fall back.
    corePromise = null;
    return null;
  }
}
