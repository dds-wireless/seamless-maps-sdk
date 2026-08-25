# seamless-maps-sdk

The official client for the **Seamless Maps** data plane: geocoding, distance matrices and
self-hosted vector basemaps, behind one API key.

[![npm](https://img.shields.io/npm/v/seamless-maps-sdk)](https://www.npmjs.com/package/seamless-maps-sdk)
[![licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](./LICENSE)

```bash
npm install seamless-maps-sdk
```

## Quickstart

```ts
import { createClient } from 'seamless-maps-sdk';

const client = createClient({ apiKey: process.env.SEAMLESS_MAPS_API_KEY });

const { primary, alternates } = await client.geocode.search({ query: 'W Pender St, Vancouver' });

const matrix = await client.matrix({
  origins: [{ latitude: 49.2871, longitude: -123.1215 }],
  destinations: [
    { latitude: 49.2606, longitude: -123.246 },
    { latitude: 49.1967, longitude: -123.1815 },
  ],
});
```

One `matrix()` call returns the whole grid and is billed as **one** request no matter how many
pairs it holds. Batch; do not loop. Match results on `originIndex` / `destinationIndex` rather
than assuming response order.

## A basemap

```ts
import maplibregl from 'maplibre-gl';
import { createMap } from 'seamless-maps-sdk/map';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = createMap({
  client,
  maplibre: maplibregl,
  container: 'map',
  center: [-123.1215, 49.2871],
  zoom: 11,
});
```

`maplibre-gl` is an **optional peer dependency** of the `/map` entrypoint only. Installing this
package for geocoding or matrices pulls in no renderer.

`createMap()` is a convenience over three primitives you can use directly with any renderer:

```ts
import { createTransformRequest, attributionFrom, ATTRIBUTION } from 'seamless-maps-sdk/map';

const style = await client.tiles.style(); // fetch fresh per session
const transformRequest = createTransformRequest(client);
const credit = attributionFrom(style);
```

The gateway authenticates the **style** request with your key, then bakes a short-lived session
token into the tile URLs it returns. Tiles carry that token; fonts and sprites are public. So only
the style request needs the key - and `createTransformRequest` attaches it only to a style request
aimed at your configured gateway, never to a third-party host.

### Attribution is a licence term

The basemap is OpenStreetMap data (ODbL) rendered through the OpenMapTiles schema (CC-BY). The
credit must stay visible on any deployed map. Disable MapLibre's attribution control only if you
render the credit yourself; `createMap()` warns and hands you the exact string.

## Browser keys

A key restricted to a set of origins is **browser-only**: the gateway requires an `Origin` header
and rejects a request without one. That is deliberate - a key lifted from a page must not work
from `curl`. Server-side and native-mobile code needs its own, unrestricted key.

Restrict a key in the consumer portal under **API keys → Where will this key be used? → Browser**.
Restrictions are spoofable by anything that can set a header, so pair them with the per-key usage
view: an unfamiliar traffic pattern is how a leaked key is actually caught.

## Errors

Every failure is a `SeamlessMapsError`. Branch on `code`, never on `message`.

```ts
import { SeamlessMapsError } from 'seamless-maps-sdk';

try {
  await client.geocode.search({ query: 'W Pender St' });
} catch (error) {
  if (error instanceof SeamlessMapsError) {
    if (error.code === 'rate_limit_exceeded') retryIn(error.retryAfterSeconds);
    else if (error.code === 'service_not_in_plan') showUpgrade(error.upgradeUrl);
    else if (error.status === 401) reauthenticate();
  }
}
```

Four services sit behind the gateway and each rejects in its own framework's shape. The SDK
collapses all of them - plus transport failures, timeouts and aborts - into that one type.

## Retries

Transient failures are retried twice by default with jittered exponential backoff, honouring the
gateway's `retry_after_seconds`. A **timed-out `matrix()` is not retried**: it is billed once per
request and the contract has no idempotency key, so a retry could bill you twice for a call that
in fact succeeded. Tune or disable with `createClient({ retry: { maxRetries: 0 } })`.

## Script tag / UMD

For loaders that cannot consume ESM - Ember's `app.import`, a plain `<script>` - a UMD bundle
exposes everything, map included, under `SeamlessMaps`:

```html
<script src="https://unpkg.com/seamless-maps-sdk/dist/seamless-maps-sdk.umd.js"></script>
<script>
  const client = SeamlessMaps.createClient({ apiKey: 'pk_live_...' });
</script>
```

Load `maplibre-gl` with its own script tag first if you need `SeamlessMaps.createMap`; it is read
from the `maplibregl` global.

## API

| Call                                                          | Returns                                            |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `client.geocode.search({ query, near?, fuzziness?, debug? })` | ranked candidates for a freeform address           |
| `client.geocode.reverse({ latitude, longitude, limit? })`     | the address at a coordinate                        |
| `client.geocode.autocomplete({ query, near?, limit? })`       | suggestions for a partial query                    |
| `client.matrix({ origins, destinations, departAt? })`         | travel time and distance for every pair            |
| `client.tiles.styleUrl()`                                     | the style document's URL                           |
| `client.tiles.style()`                                        | the style document, with session-tokened tile URLs |

`createClient` also takes `baseUrl`, `timeoutMs`, `retry` and a `fetch` override.

Types are generated from the published OpenAPI document, which ships in the package as
`seamless-maps-sdk/openapi.json` and is also served unauthenticated at `GET /openapi.json` on the
gateway.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security reports: [SECURITY.md](./SECURITY.md).

## Licence

Apache-2.0. The licence covers the code, not the Seamless Maps name or marks.
