/**
 * ESLint (flat config) — règles des hooks React en ERREUR, sans exception.
 *
 * Paquets (devDependencies) : eslint 9, typescript-eslint 8,
 * eslint-plugin-react-hooks 7 (connaît `useEffectEvent`). `npm run lint` :
 * 0 erreur exigée ; les avertissements (any, variables inutilisées) restent
 * visibles sans bloquer.
 */
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'web-build/**',
      'coverage/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'promo-video/**',
      'ton-proxy/**',
      'bot/**',
      '**/*.generated.ts',
    ],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}', 'ui/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint.plugin,
    },
    // Des directives historiques visent `no-var-requires` (hors de cette config).
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-control-regex': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
