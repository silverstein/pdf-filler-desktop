import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: 'default',
    coverage: {
      enabled: false,
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});

