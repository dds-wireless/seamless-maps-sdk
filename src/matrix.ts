import type { ResolvedConfig } from './core/config.js';
import type { Coordinate } from './core/coordinates.js';
import { assertCoordinate, toPoint } from './core/coordinates.js';
import { SeamlessMapsError } from './core/errors.js';
import { request } from './core/http.js';
import type { components } from './generated/dataplane.js';

export type MatrixResponse = components['schemas']['MatrixResponse'];

export interface MatrixOptions {
  readonly origins: readonly Coordinate[];
  readonly destinations: readonly Coordinate[];
  /** Local departure time, `YYYY-MM-DDTHH:mm`. Selects the day-of-week speed profile. */
  readonly departAt?: string;
  readonly signal?: AbortSignal;
}

const assertNonEmpty = (points: readonly Coordinate[], label: string): void => {
  // Deliberately not `Array.isArray`: it narrows a `readonly Coordinate[]` to
  // `any[]` and costs the element type on the line below.
  if (points === undefined || points === null || points.length === 0) {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message: `matrix: \`${label}\` must contain at least one coordinate.`,
    });
  }
  points.forEach((point, index) => assertCoordinate(point, `${label}[${index}]`));
};

/**
 * Travel time and distance for every origin-destination pair.
 *
 * One call returns the whole grid and is billed as a single request regardless of
 * how many pairs it contains, so batch rather than looping.
 *
 * Match results on `originIndex`/`destinationIndex` rather than response order.
 */
export function createMatrixApi(config: ResolvedConfig) {
  return async function matrix({
    origins,
    destinations,
    departAt,
    signal,
  }: MatrixOptions): Promise<MatrixResponse> {
    assertNonEmpty(origins, 'origins');
    assertNonEmpty(destinations, 'destinations');
    return request<MatrixResponse>(config, {
      method: 'POST',
      path: '/v2/distance-matrix',
      body: {
        origins: origins.map(toPoint),
        destinations: destinations.map(toPoint),
        ...(departAt === undefined ? {} : { options: { departAt } }),
      },
      signal,
    });
  };
}
