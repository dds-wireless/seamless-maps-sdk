# AGENTS.md

Binding working standard for this repository. Read it before non-trivial work.

This is the **public** SDK for the Seamless Maps data plane. The platform that serves that data
plane is a separate, private repository; its governance is heavier because it holds production
state, and only the parts that survive the boundary are kept here (ADR-053 decision 7).

## What this repository is

One npm package, `seamless-maps-sdk`, generated against a contract it does not own. It contains
no platform internals and describes only routes any customer can already call. If a change needs
knowledge of the gateway's internals, it belongs in the platform repository, not here.

## The cycle

Every non-trivial task: **decide -> execute -> verify -> record the decision where it belongs.**

- `make check` must pass before you claim done. CI runs the same steps.
- A decision that changes how this package behaves goes in `docs/adr/`, not in a commit message.
- `CHANGELOG.md` is updated in the same change, under `[Unreleased]`.

**This repository keeps no work ledger.** The platform repository does, because it holds production
state and a governance gate that depends on it; a published client library does not, and an
internal work journal is not something a public repository should carry. ADR-053 decision 7 assumed
otherwise - that assumption did not survive making the repository public, and supersedes cleanly
with a new ADR rather than being edited in place.

## Immutables

- **ADRs are append-only.** Supersede with a new one; adding an ADR is never blocked.
- **`openapi.json` and `src/generated/` are generated.** Never hand-edit. Refresh with
  `pnpm contract:drift --write` then `pnpm generate:types`.
- **No runtime dependencies.** `maplibre-gl` is an optional peer of the `/map` entrypoint only.
- **No real key, token, password or customer email** in a commit message, issue, or log.
  Mask them: `pk_live_...`.

## The contract

The SDK's types come from the OpenAPI document the gateway publishes at `GET /openapi.json`,
unauthenticated. `pnpm contract:drift` diffs the committed copy against production; that is the
gate that keeps this package honest across a repository boundary (ADR-053 decision 2).

Do not correct the contract here. A wrong description is a defect in the platform repository or in
an extracted service; file it there.

## Decisions already made

Re-deriving these wastes a session. They are recorded, with reasoning, in `docs/adr/`:

- The SDK is a public artifact in its own repository; browser keys can be restricted -> ADR-053
- The data plane publishes its own public OpenAPI contract -> ADR-052

Both live in the platform repository. `docs/adr/README.md` records what they say and where.

## Quality gates

`make check`. Tests come first - RED, then GREEN. The
published artifacts are smoke-tested from `dist/`, because a build that typechecks and does not
load is the failure mode that reaches customers.
