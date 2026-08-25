# Security policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting -
[Report a vulnerability](https://github.com/dds-wireless/seamless-maps-sdk/security/advisories/new) -
or email `security@ddswireless.com`.

Please include what you were doing, what happened, and the smallest reproduction you have. We
acknowledge within three business days and will tell you our assessment and intended fix window.

Reports about the **hosted API** rather than this package are welcome at the same address.

## Supported versions

Until `1.0.0`, only the latest minor line receives fixes.

## Handling your API key

- **A key restricted to a set of origins is browser-only.** The gateway requires an `Origin`
  header on a restricted key and rejects a request without one, so a key lifted from a page does
  not work from `curl`. Use a separate, unrestricted key for server-side and native-mobile code,
  and never ship that one to a browser.
- **Restrictions do not prevent theft.** `Origin` is client-supplied. They raise the cost of
  casual reuse; they do not stop a determined attacker. Pair them with the per-key usage view in
  the consumer portal, and rotate on anything unfamiliar.
- **This SDK sends your key to exactly one place.** Requests go to the configured `baseUrl`, and
  `createTransformRequest` attaches the key only to a _style_ request whose parsed origin matches
  that gateway. A style document referencing a third-party sprite or font host cannot harvest it.
- **Do not commit keys.** Read them from the environment, or from your app's runtime config.

## What this package does not do

It stores nothing, sends no telemetry, and has no runtime dependencies. `maplibre-gl` is an
optional peer dependency, installed only if you use the map entrypoint.
