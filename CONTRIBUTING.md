# Contributing

Thanks for helping. This package is small and contract-driven on purpose; most changes are small too.

## Getting set up

```bash
pnpm install
pnpm test          # vitest
pnpm typecheck
pnpm build         # ESM + UMD + .d.ts
make audit         # governance checks (`pnpm audit` is a pnpm builtin - use make)
```

Node 20+ and pnpm 9.

## The rules that are not negotiable

**`src/generated/` and `openapi.json` are generated. Never hand-edit either.**
`openapi.json` is a copy of the document the gateway publishes. Refresh it, then regenerate:

```bash
pnpm contract:drift --write
pnpm generate:types
```

**Tests first.** Write the failing test, then make it pass. Every behaviour in `src/` has one, and
that is what lets the client surface be hand-written rather than generated.

**The hand-written surface is the point.** Generated method names (`postV2DistanceMatrix`) are a
non-goal. `client.matrix({ origins, destinations })` is the product. If a change makes the surface
read more like the wire, it is going the wrong way.

**No runtime dependencies.** `maplibre-gl` stays an optional peer of the `/map` entrypoint only.
A dependency in this package is a dependency in every customer's bundle.

## Changes that need a decision, not a PR

Open an issue first for: a new entrypoint, a change to the error type, anything that alters what
`createMap()` does about attribution, or a new peer dependency. These were settled deliberately and
the reasoning is written down - see the ADRs in `docs/adr/`.

## Commits and releases

[Conventional Commits](https://www.conventionalcommits.org/). Independent semver: this package's
version tracks the SDK, not the API's URL versions, which are deliberately not unified.

`CHANGELOG.md` is updated in the same PR as the change it describes.

## Recording decisions

This repository keeps no work ledger. A decision that changes how the package behaves belongs in
`docs/adr/` - append-only, superseded by a new ADR rather than edited. Everything else is the
commit message and `CHANGELOG.md`. See [AGENTS.md](./AGENTS.md).

## Never in a commit or issue

A real API key, token, password or customer email. Mask them: `pk_live_...`.
