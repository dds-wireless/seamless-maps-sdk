import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // A browser SDK has no logger to inject; console.warn is the channel, and
      // createMap() lets the caller take it over with `onWarning`.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Plain-JS tooling: no type information available, and printing is the job.
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', fetch: 'readonly' } },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
  // Tests poke at dynamic shapes on purpose - stubbed fetch, a UMD bundle loaded
  // into a bare vm context. The unsafe-* family has nothing to tell us there.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
