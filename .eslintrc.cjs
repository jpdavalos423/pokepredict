module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist/',
    'coverage/',
    '.next/',
    'cdk.out/',
    'node_modules/',
    'playwright-report/',
    'test-results/'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off'
  }
};
