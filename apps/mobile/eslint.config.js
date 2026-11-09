// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
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
