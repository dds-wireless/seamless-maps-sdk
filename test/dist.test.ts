import { existsSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const dist = new URL('../dist/', import.meta.url);
const at = (p: string) => new URL(p, dist).pathname;
const built = existsSync(at('seamless-maps-sdk.umd.js'));

// `pnpm build` has to have run. Skipped rather than failed so `pnpm test` is
// usable mid-edit; CI runs build before test, so there it always executes.
describe.skipIf(!built)('the published artifacts', () => {
  it('exposes the ESM entrypoint', async () => {
    const mod = await import(at('index.js'));
    expect(typeof mod.createClient).toBe('function');
    expect(typeof mod.SeamlessMapsError).toBe('function');
  });

  it('exposes the map subpath separately, so geocoding-only consumers skip it', async () => {
    const mod = await import(at('map/index.js'));
    expect(typeof mod.createMap).toBe('function');
    expect(mod.ATTRIBUTION).toContain('OpenMapTiles');
  });

  it('loads the UMD bundle as a browser global', () => {
    const source = readFileSync(at('seamless-maps-sdk.umd.js'), 'utf8');
    // A <script> tag, faithfully: a fresh global with no `module`, `exports` or
    // `define`, so the UMD wrapper has to take its browser-global branch.
    const scope = createContext({ console });
    runInContext(source, scope);
    const sdk = (scope as Record<string, unknown>)['SeamlessMaps'] as Record<string, unknown> | undefined;
    expect(sdk).toBeDefined();
    expect(typeof sdk!['createClient']).toBe('function');
    // Flattened, because a script tag cannot reach a subpath export.
    expect(typeof sdk!['createMap']).toBe('function');
    expect(typeof sdk!['createTransformRequest']).toBe('function');
  });

  it('loads through an AMD loader, as Ember app.import needs', () => {
    const source = readFileSync(at('seamless-maps-sdk.umd.js'), 'utf8');
    let registeredName: string | null | undefined;
    let exported: Record<string, unknown> | undefined;
    const define = (name: unknown, deps: unknown, factory?: (exports: Record<string, unknown>) => void) => {
      if (typeof name !== 'string') {
        factory = deps as typeof factory;
        registeredName = null;
      } else {
        registeredName = name;
      }
      if (typeof deps === 'function') factory = deps as typeof factory;
      exported = {};
      factory!(exported);
    };
    (define as unknown as { amd: boolean }).amd = true;
    runInContext(source, createContext({ define, console }));

    // Anonymous: `app.import` with an `amd` transformation names it at import time.
    expect(registeredName).toBeNull();
    expect(typeof exported!['createClient']).toBe('function');
    expect(typeof exported!['createMap']).toBe('function');
  });

  it('bundles no dependencies into the UMD build', () => {
    const source = readFileSync(at('seamless-maps-sdk.umd.js'), 'utf8');
    expect(source).not.toContain('node_modules');
    expect(source.length).toBeLessThan(60_000);
  });

  it('ships types for both entrypoints', () => {
    expect(existsSync(at('index.d.ts'))).toBe(true);
    expect(existsSync(at('map/index.d.ts'))).toBe(true);
  });
});
