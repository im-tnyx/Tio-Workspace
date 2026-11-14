const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),
  { ignores: ['.expo/**', 'node_modules/**', 'dist/**'] },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'expo-sqlite', message: 'Database work belongs to a later authorized slice.' },
          { name: '@supabase/supabase-js', message: 'Auth and cloud adapters are not Phase 1.1.' },
          { name: 'expo-secure-store', message: 'No authentication/key services in this shell.' }
        ],
        patterns: [{ group: ['@/features/*/data/**'], message: 'Screens cannot import feature persistence internals.' }]
      }]
    }
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/features/**'], message: 'Shared UI and tokens must remain feature-independent.' }] }]
    }
  }
];
