import type { SeamlessMapsClient } from '../client.js';
import { SeamlessMapsError } from '../core/errors.js';
import type { StyleJson } from '../tiles.js';

/**
 * The credit this basemap's data and style require, verbatim from the style the
 * tile service serves. OpenStreetMap is ODbL and the OpenMapTiles schema is CC-BY:
 * these are licence terms, not a style preference, and must stay visible on any
 * deployed map.
 */
export const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> © OpenMapTiles';

/**
 * The credit a given style document carries, falling back to {@link ATTRIBUTION}.
 * Prefer this over the constant: the served style is the authority, and reading it
 * means a change upstream reaches the map without an SDK release.
 */
export function attributionFrom(style: StyleJson | undefined): string {
  for (const source of Object.values(style?.sources ?? {})) {
    const credit = (source as { attribution?: unknown } | undefined)?.attribution;
    if (typeof credit === 'string' && credit.trim() !== '') return credit;
  }
  return ATTRIBUTION;
}

/**
 * MapLibre's `ResourceType`. The named members are the ones this SDK reasons about;
 * `(string & {})` keeps the union open without discarding their autocompletion.
 */
export type ResourceType =
  'Style' | 'Source' | 'Tile' | 'Glyphs' | 'SpriteImage' | 'SpriteJSON' | (string & {});

export interface TransformedRequest {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

export type TransformRequest = (url: string, resourceType?: ResourceType) => TransformedRequest;

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * The request hook a GL renderer needs in order to talk to this gateway.
 *
 * Only the **style** request is authenticated, and only when it is aimed at the
 * configured gateway. The gateway answers it by baking a short-lived session token
 * into the tile URLs, so tiles authenticate themselves and fonts and sprites are
 * public. Comparing parsed origins (rather than a prefix) is what stops a style
 * that references `https://gw.test.evil.test` from harvesting the key.
 *
 * Renderer-agnostic on purpose: it is a plain function of a URL, so it can be
 * handed to MapLibre, to a Leaflet GL bridge, or to a hand-rolled fetch.
 */
export function createTransformRequest(client: SeamlessMapsClient): TransformRequest {
  const gatewayOrigin = originOf(client.config.baseUrl);
  const authorization = `Bearer ${client.config.apiKey}`;

  return (url, resourceType) => {
    if (resourceType === 'Style' && gatewayOrigin !== undefined && originOf(url) === gatewayOrigin) {
      return { url, headers: { Authorization: authorization } };
    }
    return { url };
  };
}

/** The slice of `maplibre-gl` {@link createMap} needs, so the peer stays optional. */
export interface MapLibreModule {
  new (options: Record<string, unknown>): unknown;
}
export interface MapLibreNamespace {
  readonly Map: MapLibreModule;
}

export interface CreateMapOptions {
  readonly client: SeamlessMapsClient;
  /** A DOM element or its id, as MapLibre accepts. */
  readonly container: unknown;
  /**
   * The `maplibre-gl` module. Omit it and the browser global `maplibregl` is used,
   * which is how the UMD build works under a loader that cannot consume ESM.
   */
  readonly maplibre?: MapLibreNamespace;
  readonly center?: readonly [number, number];
  readonly zoom?: number;
  /** Passing `false` removes the credit the basemap licences require. */
  readonly attributionControl?: unknown;
  /** Receives SDK warnings. Defaults to `console.warn`. */
  readonly onWarning?: (message: string) => void;
  /** Anything else MapLibre's `Map` accepts, passed through untouched. */
  readonly [option: string]: unknown;
}

const resolveMapLibre = (options: CreateMapOptions): MapLibreNamespace => {
  const candidate = options.maplibre ?? (globalThis as { maplibregl?: MapLibreNamespace }).maplibregl;
  if (candidate === undefined || typeof candidate.Map !== 'function') {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message:
        'createMap needs maplibre-gl. Install it (`pnpm add maplibre-gl`) and pass it as `maplibre`, ' +
        'or load the UMD build so the `maplibregl` global is available.',
    });
  }
  return candidate;
};

/**
 * An opinionated basemap: the gateway's style, the request transform and the
 * licence credit, wired up.
 *
 * Everything it does is available as a primitive - {@link createTransformRequest},
 * `client.tiles.styleUrl()`, {@link ATTRIBUTION} - so a consumer pinned to a
 * different renderer, or to a `maplibre-gl` major this package does not promise,
 * can assemble the same map without this function.
 */
export function createMap(options: CreateMapOptions): unknown {
  const { client, container, maplibre, onWarning, ...rest } = options;
  const gl = resolveMapLibre(options);
  void maplibre;

  // The credit is a licence term, not a style preference - but refusing to build
  // the map would be this SDK deciding a compliance question on the customer's
  // behalf, and would break anyone rendering their own attribution control.
  // So: say it loudly, once, with the exact string they now owe (ADR-053).
  if (rest['attributionControl'] === false) {
    const warn = onWarning ?? ((message: string) => console.warn(message));
    warn(
      '[seamless-maps-sdk] attributionControl is disabled. The basemap is OpenStreetMap (ODbL) ' +
        'and OpenMapTiles (CC-BY); this credit must remain visible somewhere on any deployed map: ' +
        ATTRIBUTION,
    );
  }

  return new gl.Map({
    ...rest,
    container,
    style: client.tiles.styleUrl(),
    transformRequest: createTransformRequest(client),
  });
}
