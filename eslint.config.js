import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
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

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Unused args starting with "_" are allowed (e.g. Express error handler's `_next`)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      // Use the pino logger instead of console.* so logs are structured
      'no-console': 'warn',
    },
  },

  // Must be last: turns off stylistic rules that would fight with Prettier
  prettier,
]);
