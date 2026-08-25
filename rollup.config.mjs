import nodeResolve from '@rollup/plugin-node-resolve';
import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';

const banner = '/*! seamless-maps-sdk | Apache-2.0 | https://github.com/dds-wireless/seamless-maps-sdk */';

const js = () => [nodeResolve({ extensions: ['.ts', '.js'] }), esbuild({ target: 'es2022', minify: false })];

export default [
  // ESM, one file per entrypoint, so `seamless-maps-sdk` never pulls in the map code.
  {
    input: { index: 'src/index.ts', 'map/index': 'src/map/index.ts' },
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      banner,
      sourcemap: true,
    },
    plugins: js(),
  },
  // UMD, everything flattened, for script tags, CDNs and loaders that cannot read ESM.
  {
    input: 'src/umd.ts',
    output: {
      file: 'dist/seamless-maps-sdk.umd.js',
      format: 'umd',
      name: 'SeamlessMaps',
      banner,
      sourcemap: true,
      globals: { 'maplibre-gl': 'maplibregl' },
    },
    external: ['maplibre-gl'],
    plugins: js(),
  },
  { input: 'src/index.ts', output: { file: 'dist/index.d.ts', format: 'es' }, plugins: [dts()] },
  { input: 'src/map/index.ts', output: { file: 'dist/map/index.d.ts', format: 'es' }, plugins: [dts()] },
];
