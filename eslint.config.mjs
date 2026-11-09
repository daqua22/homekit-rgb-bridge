import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'artifacts/**'] },
  js.configs.recommended,
  {
    files: ['public/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'document',
          'window',
          'location',
          'history',
          'sessionStorage',
          'fetch',
          'crypto',
          'URLSearchParams',
          'structuredClone',
          'setInterval',
          'setTimeout',
          'clearTimeout',
          'console',
          'innerWidth',
        ].map((x) => [x, 'readonly']),
      ),
    },
  },
  {
    files: ['desktop-assets/*.cjs'],
    languageOptions: { globals: { require: 'readonly', process: 'readonly' } },
  },
  ...ts.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  {
    files: ['desktop-assets/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
