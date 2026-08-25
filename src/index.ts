export { createClient } from './client.js';
export type { SeamlessMapsClient } from './client.js';

export { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from './core/config.js';
export type { ClientOptions, ResolvedConfig, RetryOptions } from './core/config.js';

export { SeamlessMapsError } from './core/errors.js';
export type { ErrorDetail, GatewayErrorCode, SdkErrorCode, SeamlessMapsErrorCode } from './core/errors.js';

export { assertCoordinate } from './core/coordinates.js';
export type { Coordinate } from './core/coordinates.js';

export type {
  AutocompleteOptions,
  AutocompleteResponse,
  Fuzziness,
  GeocodeApi,
  GeocodeCandidate,
  GeocodeReverseResponse,
  GeocodeSearchResponse,
  ReverseOptions,
  SearchOptions,
} from './geocode.js';

export type { MatrixOptions, MatrixResponse } from './matrix.js';
export type { StyleJson, TilesApi } from './tiles.js';
export { STYLE_PATH } from './tiles.js';

export type { components, operations, paths } from './generated/dataplane.js';
