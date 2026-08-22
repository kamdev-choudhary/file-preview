# Markdown sample

A preview of **GitHub-flavoured Markdown**, rendered and sanitised.

## Features

- Lazy-loaded viewers — this page did not download the PDF engine
- Tables, code, and task lists
- [Links open in a new tab](https://example.com)

### A table

| Format | Engine | Fidelity |
| ------ | ------ | -------- |
| PDF    | pdf.js | Exact |
| DOCX   | mammoth | Approximate |
| PPTX   | custom OOXML reader | Text + images |

### Task list

- [x] Detect the file type from magic bytes
- [x] Fall back when the extension lies
- [ ] Read your mind

### Code

```js
import { openPreview } from '@quartix/file-preview';

openPreview('https://example.com/report.pdf', {
  onError: ({ error }) => console.warn(error.code, error.message),
});
```

> Anything rendered here is sanitised with DOMPurify first — a previewed file
> is untrusted input by definition.
