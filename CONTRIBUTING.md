# Contributing

Thanks for taking the time. This is a small, dependency-conscious library, so
the bar for new code is mostly about keeping it that way.

## Getting set up

The repo uses [pnpm](https://pnpm.io). Node 20.19+ or 22.12+ is required (Vite 8
will not run on older versions).

```bash
corepack enable          # one-time: makes the pinned pnpm available
pnpm install
pnpm samples             # generate the demo's test fixtures
pnpm dev                 # demo at localhost:5173
```

## The commands that matter

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Demo site with HMR                             |
| `pnpm test`       | Unit tests (vitest)                            |
| `pnpm test:watch` | Same, in watch mode                            |
| `pnpm typecheck`  | `tsc --noEmit` over src, test and demo         |
| `pnpm lint`       | oxlint                                         |
| `pnpm format`     | Prettier, writing in place                     |
| `pnpm build`      | Library build + generated `.d.ts`              |
| `pnpm size`       | Fails if the entry chunk busts its gzip budget |
| `pnpm verify`     | Everything CI runs, in one go                  |

Run `pnpm verify` before opening a PR. CI runs the same thing plus a Node
version matrix.

## How the code is laid out

```
src/
  core/      detection, config, networking, the Source abstraction, registry
  ui/        shared DOM helpers, styles, icons, error/loading panels
  viewers/   one module per file type, each lazily imported
  elements/  the two custom elements
  index.ts   public API
```

Three conventions carry most of the design:

**Everything heavy is lazily imported.** pdf.js, mammoth, JSZip, SheetJS and
each highlight.js grammar live behind a dynamic `import()` so they land in their
own chunk. The entry bundle has a gzip budget enforced by `pnpm size`; if your
change pushes something into the entry that should have stayed lazy, that check
fails. This is the single most important constraint in the codebase.

**Errors are typed, and the message is UI.** Every user-visible failure is a
`PreviewError` with a `code`, and the error panel picks its recovery buttons
from that code. Write messages as full sentences aimed at the person looking at
the screen, and put the "what you can do about it" in `hint`.

**Previewed files are untrusted input.** Anything that becomes HTML goes through
DOMPurify first. Do not add a path that sets `innerHTML` from file content
without sanitising it.

## Adding a viewer

A viewer is a module whose default export takes a `ViewerContext` and returns a
`ViewerInstance`. Register it in `src/core/registry.ts` with a `match()` that
scores the kinds it handles and a `load()` that dynamically imports it:

```ts
registerViewer({
  id: 'my-format',
  label: 'My format',
  match: (source) => (source.ext === 'myf' ? 1 : 0),
  load: () => import('../viewers/my-format.js'),
});
```

Consumers can do the same from outside via the exported `registerViewer`, and
reusing a built-in `id` replaces it.

## Tests

Pure logic — detection, parsing, the registry, `Source` — is unit tested and
should stay that way; those modules are where bugs are cheapest to catch. The
viewers need a real rendering engine to mean anything and are excluded from the
coverage target rather than mocked into a shape that proves nothing.

If you fix a bug in `core/`, add the case that was broken.

## Commits and PRs

- One logical change per PR, with a description of what breaks if it is wrong.
- Keep comments about _why_, not _what_. The existing code is a good guide.
- No new runtime dependency without a note in the PR explaining why the
  alternative — writing the 60 lines — is worse.

## Reporting bugs

A file that reproduces the problem is worth more than anything else. If you
cannot share the file, the output of this is the next best thing:

```js
import { describe } from 'previewkit';
console.log(describe({ name: file.name, mime: file.type, size: file.size }));
```
