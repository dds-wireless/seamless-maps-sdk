# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic
versioning independently of the API's URL versions.

## [Unreleased]

## [0.1.0] - 2026-08-24

First release.

### Added

- `createClient({ apiKey })` with `geocode.search`, `geocode.reverse`, `geocode.autocomplete`,
  `matrix` and `tiles`, hand-written over types generated from the published OpenAPI document.
- Coordinates are passed as `{ latitude, longitude }` and validated before a request is spent;
  the contract's `{ point: { ... } }` nesting is applied by the SDK.
- `SeamlessMapsError`, one error type collapsing the gateway envelope, the two upstream
  frameworks' validation shapes, bare text bodies, transport failures, timeouts and aborts.
  Branch on `code`.
- Retries for rate limits, transport failures and upstream flaps, with jittered exponential
  backoff honouring `retry_after_seconds`. A timed-out `matrix()` is deliberately not retried.
- `seamless-maps-sdk/map`: `createTransformRequest`, `attributionFrom`, `ATTRIBUTION` and an
  opinionated `createMap()`. `maplibre-gl` is an optional peer of this entrypoint only.
- ESM and UMD builds, the latter exposing everything under the `SeamlessMaps` global for loaders
  that cannot consume ESM.
- `pnpm contract:drift`, which diffs the committed contract against the one production serves.

### Fixed

- A geocoder search that matches nothing now reports `primary: null`. The service answers with a
  zero-filled candidate at coordinates `(0, 0)` and `method: 'none'`, so the obvious guard -
  `if (primary) map.flyTo(primary)` - would otherwise send a map to null island. A genuine match
  at `(0, 0)` is preserved: the normalisation keys on `method`, not on the coordinates.

[Unreleased]: https://github.com/dds-wireless/seamless-maps-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dds-wireless/seamless-maps-sdk/releases/tag/v0.1.0
