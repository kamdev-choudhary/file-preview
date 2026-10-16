## What this changes

<!-- One or two sentences. What was wrong, or what is now possible. -->

## Why

<!-- The reasoning. If this adds a dependency or bytes to the entry chunk, make
     the case here. -->

## Checklist

- [ ] `pnpm verify` passes
- [ ] Added or updated tests for anything in `src/core/`
- [ ] No new runtime dependency (or justified above)
- [ ] Nothing heavy moved into the entry chunk (`pnpm size` still passes)
- [ ] README/CHANGELOG updated if the public API changed
