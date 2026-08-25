# Architecture decisions

This package's own decisions live here, numbered from `001`. ADRs are **append-only**: supersede
one with a new ADR rather than editing it.

_No SDK-local ADRs yet._

## Decisions inherited from the platform

The two decisions that created this repository were taken in the private platform repository,
where the evidence for them lives. They are binding here and are summarised so that a contributor
without access to that repository can still see the reasoning.

### ADR-052 - the data plane publishes its own public OpenAPI contract

The customer-facing API is described by a machine-readable OpenAPI document, distinct from the
control plane's, generated from the tenant packs and held true by contract tests. It is served
**unauthenticated** at `GET /openapi.json` on the gateway. That document is this package's source
of truth; `openapi.json` here is a committed copy of it.

### ADR-053 - the SDK is a public artifact, and browser keys can be restricted

- The SDK lives in its own **public** repository, not in the private monorepo. It holds no
  platform internals and describes only routes any customer can already call.
- **Drift is caught against production, not against a file.** CI fetches the live document and
  diffs it against the committed copy - stronger than co-location, and it works across the
  repository boundary. See `scripts/check-contract-drift.mjs`.
- **One package**, subpath entrypoints, `maplibre-gl` an _optional_ peer of `/map` only.
  **ESM and UMD**, because the first consumer loads its map libraries as browser globals through
  Ember's `app.import`, which cannot consume ESM or CJS. CJS is omitted until asked for.
- **Apache-2.0**, for the patent grant and the trademark clause: the code is licensed, the name
  is not. **Independent semver** - the package version does not track the API's URL versions.
- An API key can be restricted to a set of origins, and **a restricted key is browser-only**: the
  gateway rejects a request that omits `Origin`, because allowing it would let anyone who lifts a
  key from a page use it with `curl`. Server-side code needs its own key.
- The SDK **owns only this platform's concerns**: the session-token handshake, the style URL and
  the request transform. Not a competitor's fallback path, not one consumer's renderer
  workarounds. `/map` exports renderer-agnostic primitives with an opinionated `createMap()`
  layered on, so a consumer pinned to a different `maplibre-gl` major can still use it.
- `createMap()` **warns** when attribution is disabled and exports the required credit as a
  constant: ODbL and CC-BY are licence terms, not style preferences.
- Governance is **ported, not copied**, and each repository keeps its own ledger.
