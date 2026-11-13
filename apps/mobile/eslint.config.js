// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // ARCHITECTURE.md §6.1: narrow explicitly, never assert.
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error'],
      'import/order': [
        'error',
        {
          groups: [
            ['builtin', 'external', 'internal'],
            ['parent', 'sibling', 'index'],
          ],
          'newlines-between': 'never',
        },
      ],
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
