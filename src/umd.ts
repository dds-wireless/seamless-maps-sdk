/**
 * The UMD entrypoint: everything under one global.
 *
 * Subpath exports do not survive a script tag, so the browser build flattens the
 * map entrypoint into the same namespace. `maplibre-gl` is never imported here -
 * `createMap` reads the `maplibregl` global - so this bundle stays dependency-free.
 */
export * from './index.js';
export * from './map/index.js';
