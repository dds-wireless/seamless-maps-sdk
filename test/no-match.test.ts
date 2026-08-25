import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/index.js';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const clientFor = (body: unknown) =>
  createClient({
    apiKey: 'k',
    baseUrl: 'https://gw.test',
    fetch: vi.fn(async () => json(body)),
  });

// The geocoder answers a no-match with a zero-filled candidate at (0, 0) rather
// than the null the contract documents. Left alone, `if (primary)` passes and the
// caller flies their map to null island.
const noMatch = {
  query: 'nowhere at all',
  primary: {
    lat: 0.0,
    lon: 0.0,
    confidence: 0.0,
    score: [7, 2, 5, 0.0, 0.0, 0, 0.0],
    method: 'none',
    matched: { city: null, state: null, country: null, street: null, house_number: null },
    road_lat: null,
    road_lon: null,
  },
  alternates: [],
  candidates_evaluated: 0,
  debug_trace: null,
};

const realMatch = {
  query: 'W Pender St Vancouver',
  primary: {
    lat: 49.28577591452208,
    lon: -123.1178922472431,
    confidence: 0.55,
    method: 'street_centroid',
    matched: {
      city: 'Greater Vancouver',
      state: null,
      country: null,
      street: 'west pender street',
      house_number: null,
    },
  },
  alternates: [],
};

describe('a search that matched nothing', () => {
  it('reports primary as null, as the contract promises', async () => {
    const result = await clientFor(noMatch).geocode.search({ query: 'nowhere at all' });
    expect(result.primary).toBeNull();
  });

  it('leaves the rest of the response untouched', async () => {
    const result = await clientFor(noMatch).geocode.search({ query: 'nowhere at all' });
    expect(result.query).toBe('nowhere at all');
    expect(result.alternates).toEqual([]);
    expect(result.candidates_evaluated).toBe(0);
  });

  it('does not touch a real match', async () => {
    const result = await clientFor(realMatch).geocode.search({ query: 'W Pender St Vancouver' });
    expect(result.primary).not.toBeNull();
    expect(result.primary?.lat).toBeCloseTo(49.2857, 3);
  });

  it('keeps a legitimate result that happens to sit at (0, 0)', async () => {
    // Null island is a real place on the map. Only `method: 'none'` means no match.
    const atOrigin = {
      query: 'x',
      primary: { lat: 0, lon: 0, confidence: 0.9, method: 'address_point' },
      alternates: [],
    };
    const result = await clientFor(atOrigin).geocode.search({ query: 'x' });
    expect(result.primary).not.toBeNull();
  });

  it('tolerates a response that already sends null', async () => {
    const result = await clientFor({ query: 'x', primary: null, alternates: [] }).geocode.search({
      query: 'x',
    });
    expect(result.primary).toBeNull();
  });
});
