import { SeamlessMapsError } from './errors.js';

/** A WGS84 coordinate, in the order the contract names its fields. */
export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/** Throw before spending a request on a coordinate the backend cannot use. */
export function assertCoordinate(value: Coordinate, label: string): void {
  const { latitude, longitude } = value ?? {};
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message: `${label}: latitude must be a number between -90 and 90, received ${String(latitude)}.`,
    });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message: `${label}: longitude must be a number between -180 and 180, received ${String(longitude)}.`,
    });
  }
}

/** The contract nests each coordinate under `point`; callers should not have to. */
export const toPoint = (value: Coordinate): { point: Coordinate } => ({
  point: { latitude: value.latitude, longitude: value.longitude },
});
