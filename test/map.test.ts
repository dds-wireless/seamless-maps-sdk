import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/index.js';
import { ATTRIBUTION, attributionFrom, createMap, createTransformRequest } from '../src/map/index.js';

const client = createClient({ apiKey: 'pk_test_key', baseUrl: 'https://gw.test' });

describe('createTransformRequest', () => {
  const transform = createTransformRequest(client);

  it('attaches the key to a Style request aimed at the gateway', () => {
    expect(transform('https://gw.test/v1/tiles/style.json', 'Style')).toEqual({
      url: 'https://gw.test/v1/tiles/style.json',
      headers: { Authorization: 'Bearer pk_test_key' },
    });
  });

  it('never sends the key to a third-party host', () => {
    // The whole point of the origin check: a style that references a foreign
    // sprite host must not leak the customer's key to it.
    expect(transform('https://evil.test/v1/tiles/style.json', 'Style')).toEqual({
      url: 'https://evil.test/v1/tiles/style.json',
    });
  });

  it('is not fooled by a host that merely starts with the gateway origin', () => {
    expect(transform('https://gw.test.evil.test/v1/tiles/style.json', 'Style')).toEqual({
      url: 'https://gw.test.evil.test/v1/tiles/style.json',
    });
  });

  it('leaves tiles, fonts and sprites unauthenticated', () => {
    // Tiles carry the gateway's short-lived session token; fonts and sprites are public.
    for (const kind of ['Tile', 'Glyphs', 'SpriteJSON', 'SpriteImage', 'Source'] as const) {
      expect(transform('https://gw.test/v1/tiles/3/1/2?token=abc', kind)).toEqual({
        url: 'https://gw.test/v1/tiles/3/1/2?token=abc',
      });
    }
  });

  it('tolerates a url the URL parser rejects', () => {
    expect(transform('not-a-url', 'Style')).toEqual({ url: 'not-a-url' });
  });
});

describe('attributionFrom', () => {
  it('prefers the credit the live style carries', () => {
    const style = { sources: { openmaptiles: { attribution: '© Somebody else' } } };
    expect(attributionFrom(style as never)).toBe('© Somebody else');
  });

  it('falls back to the required credit when the style omits it', () => {
    expect(attributionFrom({ sources: {} } as never)).toBe(ATTRIBUTION);
    expect(attributionFrom(undefined)).toBe(ATTRIBUTION);
  });

  it('names both required parties', () => {
    expect(ATTRIBUTION).toContain('OpenStreetMap');
    expect(ATTRIBUTION).toContain('OpenMapTiles');
  });
});

describe('createMap', () => {
  const fakeMaplibre = () => {
    const ctor = vi.fn(function Map(this: unknown, opts: unknown) {
      (this as { opts: unknown }).opts = opts;
    });
    return { Map: ctor } as never;
  };

  it('builds a map against the gateway style with the transform wired in', () => {
    const maplibre = fakeMaplibre();
    createMap({ client, container: 'map', maplibre, center: [-123.1, 49.28], zoom: 11 });
    const opts = (maplibre as unknown as { Map: { mock: { calls: unknown[][] } } }).Map.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(opts['style']).toBe('https://gw.test/v1/tiles/style.json');
    expect(opts['container']).toBe('map');
    expect(opts['center']).toEqual([-123.1, 49.28]);
    expect(opts['zoom']).toBe(11);
    expect(typeof opts['transformRequest']).toBe('function');
  });

  it('explains itself when maplibre-gl is nowhere to be found', () => {
    expect(() => createMap({ client, container: 'map' })).toThrow(/maplibre-gl/);
  });

  it('accepts maplibre-gl from the browser global, as the UMD build requires', () => {
    const maplibre = fakeMaplibre();
    (globalThis as { maplibregl?: unknown }).maplibregl = maplibre;
    try {
      expect(() => createMap({ client, container: 'map' })).not.toThrow();
    } finally {
      delete (globalThis as { maplibregl?: unknown }).maplibregl;
    }
  });

  it('warns, with the required credit, when attribution is switched off', () => {
    const maplibre = fakeMaplibre();
    const onWarning = vi.fn();
    createMap({ client, container: 'map', maplibre, attributionControl: false, onWarning });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0]![0]).toContain('OpenStreetMap');
  });

  it('stays quiet when attribution is left on', () => {
    const onWarning = vi.fn();
    createMap({ client, container: 'map', maplibre: fakeMaplibre(), onWarning });
    expect(onWarning).not.toHaveBeenCalled();
  });
});
