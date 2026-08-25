import type { ClientOptions, ResolvedConfig } from './core/config.js';
import { resolveConfig } from './core/config.js';
import type { GeocodeApi } from './geocode.js';
import { createGeocodeApi } from './geocode.js';
import type { MatrixOptions, MatrixResponse } from './matrix.js';
import { createMatrixApi } from './matrix.js';
import type { TilesApi } from './tiles.js';
import { createTilesApi } from './tiles.js';

export interface SeamlessMapsClient {
  readonly geocode: GeocodeApi;
  /** Travel time and distance for every origin-destination pair, in one billed request. */
  matrix(options: MatrixOptions): Promise<MatrixResponse>;
  readonly tiles: TilesApi;
  /** Normalised configuration, for the map entrypoint and for diagnostics. */
  readonly config: ResolvedConfig;
}

/**
 * Build a client for the Seamless Maps data plane.
 *
 * ```ts
 * const client = createClient({ apiKey: 'pk_live_...' });
 * const { candidates } = await client.geocode.search({ query: '1050 W Pender St' });
 * ```
 *
 * A key restricted to a set of origins is browser-only: the gateway rejects it
 * when `Origin` is absent, so server-side code needs a separate unrestricted key.
 */
export function createClient(options: ClientOptions): SeamlessMapsClient {
  const config = resolveConfig(options);
  return {
    geocode: createGeocodeApi(config),
    matrix: createMatrixApi(config),
    tiles: createTilesApi(config),
    config,
  };
}
