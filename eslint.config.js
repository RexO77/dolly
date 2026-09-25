import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['legacy/', 'node_modules/', 'masters/', 'out/', '.tmp/', 'studio/dist/', 'site/dist/', 'examples/*/masters/', 'examples/*/out/', 'examples/*/.dolly/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      /* Scenarios hand functions to the page, so browser globals are in scope too. */
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['studio/src/**/*.{js,jsx}', 'site/src/**/*.{js,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
];
