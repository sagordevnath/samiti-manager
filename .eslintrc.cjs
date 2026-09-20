/**
 * Root ESLint config. Workspaces inherit this via their own .eslintrc.cjs
 * (or this one directly) — see eslint-import-resolver-typescript below.
 */
module.exports = {
  root: true,
  env: { es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true, project: ['./tsconfig.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'] },
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'import/order': ['warn', { groups: [['builtin', 'external'], 'internal', 'parent', 'sibling'], 'newlines-between': 'never' }],
    'no-console': 'off',
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs', '*.config.ts'],
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      env: { jest: true },
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
