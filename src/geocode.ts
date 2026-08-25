import type { ResolvedConfig } from './core/config.js';
import type { Coordinate } from './core/coordinates.js';
import { assertCoordinate } from './core/coordinates.js';
import { request } from './core/http.js';
import type { components } from './generated/dataplane.js';

export type GeocodeSearchResponse = components['schemas']['GeocodeSearchResponse'];
export type GeocodeReverseResponse = components['schemas']['GeocodeReverseResponse'];
export type AutocompleteResponse = components['schemas']['AutocompleteResponse'];
export type GeocodeCandidate = components['schemas']['GeocodeCandidate'];

/**
 * The geocoder answers a no-match with a zero-filled candidate - `method: 'none'`,
 * `confidence: 0`, coordinates `(0, 0)` - rather than the `null` the contract
 * documents. Left as-is, `if (primary)` passes and the caller flies their map to
 * null island, in the Gulf of Guinea.
 *
 * The SDK normalises it to `null`, which is what the contract already promises.
 * `method` is the signal, not the coordinates: `(0, 0)` is a real place, and a
 * genuine match there must survive.
 *
 * Upstream defect; when the geocoder starts sending `null` this becomes a no-op.
 */
const withNoMatchAsNull = (response: GeocodeSearchResponse): GeocodeSearchResponse => {
  const primary = response?.primary as { method?: unknown } | null | undefined;
  if (primary != null && primary.method === 'none') {
    return { ...response, primary: null };
  }
  return response;
};

/** How hard the geocoder tries to match an imperfect query. */
export type Fuzziness = 'strict' | 'balanced' | 'loose';

export interface SearchOptions {
  readonly query: string;
  /** Bias results toward a viewport. */
  readonly near?: Coordinate;
  /** Defaults to `balanced` server-side. */
  readonly fuzziness?: Fuzziness;
  /** Populate `debug_trace` with scoring internals. */
  readonly debug?: boolean;
  readonly signal?: AbortSignal;
}

export interface ReverseOptions extends Coordinate {
  /** Total results including `primary`, so `5` yields `primary` plus four alternates. */
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface AutocompleteOptions {
  readonly query: string;
  readonly near?: Coordinate;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface GeocodeApi {
  search(options: SearchOptions): Promise<GeocodeSearchResponse>;
  reverse(options: ReverseOptions): Promise<GeocodeReverseResponse>;
  autocomplete(options: AutocompleteOptions): Promise<AutocompleteResponse>;
}

export function createGeocodeApi(config: ResolvedConfig): GeocodeApi {
  return {
    async search({ query, near, fuzziness, debug, signal }) {
      if (near !== undefined) assertCoordinate(near, 'near');
      return withNoMatchAsNull(
        await request<GeocodeSearchResponse>(config, {
          method: 'GET',
          path: '/v1/geocode/search',
          query: {
            q: query,
            lat: near?.latitude,
            lng: near?.longitude,
            fuzziness,
            debug,
          },
          signal,
        }),
      );
    },

    async reverse({ latitude, longitude, limit, signal }) {
      assertCoordinate({ latitude, longitude }, 'reverse');
      return request<GeocodeReverseResponse>(config, {
        method: 'GET',
        path: '/v1/geocode/reverse',
        query: { lat: latitude, lng: longitude, limit },
        signal,
      });
    },

    async autocomplete({ query, near, limit, signal }) {
      if (near !== undefined) assertCoordinate(near, 'near');
      return request<AutocompleteResponse>(config, {
        method: 'GET',
        path: '/v1/geocode/autocomplete',
        query: { q: query, lat: near?.latitude, lng: near?.longitude, limit },
        signal,
      });
    },
  };
}
