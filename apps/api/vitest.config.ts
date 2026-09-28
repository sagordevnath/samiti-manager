import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Full-suite runs on a loaded dev machine need more headroom than the
    // 5s/10s defaults; individual files stay well under these caps isolated.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxConcurrency: 8,
  },
});
