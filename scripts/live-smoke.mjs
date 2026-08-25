#!/usr/bin/env node
/**
 * Fire the built SDK at a running gateway and check every operation answers.
 *
 * Not part of `pnpm test` - it needs a stack and a key, and a public repository
 * cannot hold one. Run it against a local stack before a release:
 *
 *   SEAMLESS_API_KEY=... node scripts/live-smoke.mjs --gateway http://localhost:8080
 *
 * With no key it will mint one from a control plane and revoke it afterwards,
 * which is how it is run against a local stack.
 */
import { createClient } from '../dist/index.js';
import { ATTRIBUTION, attributionFrom, createTransformRequest } from '../dist/map/index.js';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};

const gateway = flag('gateway', process.env['SEAMLESS_GATEWAY_URL'] ?? 'http://localhost:8080');
const controlPlane = flag('control-plane', process.env['CONTROL_PLANE_URL'] ?? 'http://localhost:4000');

const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  } catch (error) {
    results.push(false);
    const extra = error?.code ? ` [${error.code}${error.status ? ` ${error.status}` : ''}]` : '';
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}\n        ${error?.message ?? error}${extra}`);
  }
};

const minted = [];
async function mintKey() {
  const email = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.local';
  const password = process.env['SEED_ADMIN_PASSWORD'];
  if (!password) throw new Error('set SEAMLESS_API_KEY, or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD to mint one');

  const post = async (path, body, token) => {
    const response = await fetch(`${controlPlane}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, json: await response.json().catch(() => null) };
  };

  const login = await post('/v1/auth/login', { email, password });
  const token = login.json?.access_token;
  if (!token) throw new Error(`control-plane login failed (${login.status})`);

  const services = await fetch(`${controlPlane}/v1/services`, {
    headers: { authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .then((j) => j?.items ?? []);

  // One key across all three services keeps the smoke run close to what a
  // customer with a single key actually experiences.
  const keys = {};
  for (const slug of ['geocoding', 'tile-service', 'travel-oracle']) {
    const service = services.find((s) => s.slug === slug);
    if (!service) throw new Error(`service '${slug}' is not registered in the control plane`);
    const created = await post(
      `/v1/services/${service.id}/api-keys`,
      { name: `sdk-live-smoke-${slug}` },
      token,
    );
    const secret = created.json?.api_key ?? created.json?.key;
    if (!secret) throw new Error(`could not mint a key for '${slug}' (${created.status})`);
    keys[slug] = secret;
    minted.push({ id: created.json.id, token });
  }
  return keys;
}

async function revoke() {
  for (const { id, token } of minted) {
    await fetch(`${controlPlane}/v1/api-keys/${id}/revoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  if (minted.length > 0)
    console.log(`\n  (revoked ${minted.length} smoke key${minted.length === 1 ? '' : 's'})`);
}

console.log(`\n  seamless-maps-sdk :: live smoke against ${gateway}\n`);

const supplied = process.env['SEAMLESS_API_KEY'];
const keys = supplied
  ? { geocoding: supplied, 'tile-service': supplied, 'travel-oracle': supplied }
  : await mintKey();

const geo = createClient({ apiKey: keys['geocoding'], baseUrl: gateway });
const tiles = createClient({ apiKey: keys['tile-service'], baseUrl: gateway });
const oracle = createClient({ apiKey: keys['travel-oracle'], baseUrl: gateway });

try {
  await check('geocode.search resolves a freeform address', async () => {
    const { primary } = await geo.geocode.search({ query: 'W Pender St Vancouver' });
    if (!primary) throw new Error('nothing matched');
    return `${primary.matched?.street ?? '?'} @ ${primary.lat?.toFixed(4)},${primary.lon?.toFixed(4)} (${primary.method})`;
  });

  await check('a search that matches nothing reports primary as null', async () => {
    // The geocoder sends a zero-filled candidate at (0,0); the SDK normalises it.
    const { primary } = await geo.geocode.search({ query: 'zzzz no such street anywhere zzzz' });
    if (primary !== null) throw new Error(`expected null, got ${JSON.stringify(primary)?.slice(0, 80)}`);
    return 'normalised, no flight to null island';
  });

  await check('geocode.search accepts a viewport bias', async () => {
    const { primary } = await geo.geocode.search({
      query: 'W Pender St',
      near: { latitude: 49.2871, longitude: -123.1215 },
      fuzziness: 'balanced',
    });
    return primary ? `${primary.matched?.street ?? '?'} (${primary.method})` : 'no match';
  });

  await check('geocode.reverse names a coordinate', async () => {
    const result = await geo.geocode.reverse({ latitude: 49.2871, longitude: -123.1215, limit: 3 });
    const { street, house_number: houseNumber, city } = result?.matched ?? {};
    if (!street) throw new Error(`no street matched: ${JSON.stringify(result)?.slice(0, 120)}`);
    return `${houseNumber ?? ''} ${street}, ${city ?? '?'} (${result.match_tier}, ${Math.round(result.distance_m)}m)`.trim();
  });

  await check('geocode.autocomplete suggests', async () => {
    const { suggestions } = await geo.geocode.autocomplete({ query: 'gran', limit: 5 });
    if (!suggestions?.length) throw new Error('no suggestions returned');
    return `${suggestions.length}: ${suggestions
      .map((s) => s.label)
      .slice(0, 2)
      .join(', ')}`;
  });

  await check('geocode rejects a bad limit as a typed validation error', async () => {
    try {
      await geo.geocode.reverse({ latitude: 49.28, longitude: -123.12, limit: 9999 });
    } catch (error) {
      if (error.code !== 'invalid_request') throw new Error(`expected invalid_request, got ${error.code}`);
      return `${error.status} -> ${error.code}`;
    }
    throw new Error('the gateway accepted an out-of-range limit');
  });

  await check('matrix returns the whole grid in one request', async () => {
    const result = await oracle.matrix({
      origins: [{ latitude: 49.2871, longitude: -123.1215 }],
      destinations: [
        { latitude: 49.2606, longitude: -123.246 },
        { latitude: 49.1967, longitude: -123.1815 },
      ],
    });
    if (!Array.isArray(result?.data)) throw new Error('no data array');
    return `${result.data.length} pair(s), summary ${JSON.stringify(result.summary)}`;
  });

  await check('matrix rejects an impossible coordinate before spending a request', async () => {
    try {
      await oracle.matrix({
        origins: [{ latitude: 999, longitude: 0 }],
        destinations: [{ latitude: 49.2, longitude: -123.1 }],
      });
    } catch (error) {
      if (!/latitude/.test(error.message)) throw new Error(`unexpected: ${error.message}`);
      return 'refused client-side';
    }
    throw new Error('an out-of-range latitude was sent to the gateway');
  });

  await check('tiles.style carries session-tokened tile URLs', async () => {
    const style = await tiles.tiles.style();
    const source = Object.values(style?.sources ?? {})[0];
    const url = source?.tiles?.[0];
    if (!url) throw new Error('style has no tile URLs');
    if (!url.includes('token=')) throw new Error(`tile URL carries no session token: ${url}`);
    return `${Object.keys(style.sources).length} source(s), tiles tokenised`;
  });

  await check('the style carries the credit its licences require', async () => {
    const style = await tiles.tiles.style();
    const credit = attributionFrom(style);
    if (!credit.includes('OpenStreetMap') || !credit.includes('OpenMapTiles')) {
      throw new Error(`unexpected attribution: ${credit}`);
    }
    if (credit !== ATTRIBUTION) console.log(`        note: live credit differs from the bundled constant`);
    return 'OSM + OpenMapTiles';
  });

  await check('a tokenised tile fetches without the API key', async () => {
    const style = await tiles.tiles.style();
    const template = Object.values(style.sources)[0].tiles[0];
    const url = template.replace('{z}', '10').replace('{x}', '161').replace('{y}', '350');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`tile returned ${response.status}`);
    return `${response.status}, ${response.headers.get('content-type')}`;
  });

  await check('the request transform authenticates only the style request', async () => {
    const transform = createTransformRequest(tiles);
    const style = transform(tiles.tiles.styleUrl(), 'Style');
    if (!style.headers?.Authorization) throw new Error('style request was not authenticated');
    const tile = transform(`${gateway}/v1/tiles/10/161/350?token=x`, 'Tile');
    if (tile.headers) throw new Error('a tile request carried the API key');
    const foreign = transform('https://evil.example/style.json', 'Style');
    if (foreign.headers) throw new Error('the key was offered to a third-party host');
    return 'style only, own origin only';
  });

  await check('a revoked or bogus key is rejected as a typed error', async () => {
    const bogus = createClient({
      apiKey: 'definitely-not-a-real-key',
      baseUrl: gateway,
      retry: { maxRetries: 0 },
    });
    try {
      await bogus.geocode.search({ query: 'x' });
    } catch (error) {
      if (error.status !== 401 && error.status !== 403)
        throw new Error(`expected 401/403, got ${error.status}`);
      return `${error.status} -> ${error.code}`;
    }
    throw new Error('a bogus key was accepted');
  });
} finally {
  await revoke();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed > 0 ? 1 : 0);
