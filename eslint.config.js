import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'server/src/generated/',
    'server/storage-data/',
    'server/tmp-uploads/',
  ]),

  js.configs.recommended,

  // Shared rules for all JavaScript
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Unused args starting with "_" are allowed (e.g. Express error handler's `_next`)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // Node.js code: the API server and tooling config files
  {
    files: ['server/**/*.js', '*.js', 'client/vite.config.js'],
    languageOptions: { globals: globals.node },
    rules: {
      // Use the pino logger instead of console.* so logs are structured
      'no-console': 'warn',
    },
  },

  // Command-line tools (server/perf): Node scripts whose output IS the console.
  {
    files: ['server/perf/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Browser code: the React app
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },

  // Tests and test helpers are never hot-reloaded, so the HMR export rule doesn't apply.
  {
    files: ['client/src/**/*.test.{js,jsx}', 'client/src/test-utils/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Must be last: turns off stylistic rules that would fight with Prettier
  prettier,
]);
