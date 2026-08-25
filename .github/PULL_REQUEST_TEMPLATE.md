## What this changes

<!-- The behaviour, not the diff. -->

## Why

<!-- Link the issue. If this reverses a recorded decision, say which and what new evidence moved it. -->

## Test plan

<!-- The commands you ran, and what you saw. -->

```
make check
```

## Checklist

- [ ] A failing test came first, and it now passes
- [ ] `openapi.json` and `src/generated/` are untouched, or were regenerated with
      `pnpm contract:drift --write && pnpm generate:types` - never hand-edited
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No runtime dependency added
- [ ] No real key, token, password or customer email anywhere in the diff
- [ ] Public API changes are reflected in `README.md`
