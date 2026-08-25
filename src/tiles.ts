import type { ResolvedConfig } from './core/config.js';
import { request } from './core/http.js';
import type { components } from './generated/dataplane.js';

export type StyleJson = components['schemas']['StyleJson'];

export interface TilesApi {
  /**
   * The style document's URL. Hand this to a renderer together with a request
   * transform that attaches the key - see the `seamless-maps-sdk/map` entrypoint.
   */
  styleUrl(): string;
  /**
   * Fetch the style document directly.
   *
   * The gateway bakes a short-lived session token into `sources.*.tiles`, so the
   * result must be fetched fresh per map session and never cached across sessions.
   */
  style(options?: { readonly signal?: AbortSignal }): Promise<StyleJson>;
}

export const STYLE_PATH = '/v1/tiles/style.json';

export function createTilesApi(config: ResolvedConfig): TilesApi {
  return {
    styleUrl: () => `${config.baseUrl}${STYLE_PATH}`,
    style: (options) =>
      request<StyleJson>(config, { method: 'GET', path: STYLE_PATH, signal: options?.signal }),
  };
}
