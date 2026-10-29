import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: { LOG_LEVEL: 'silent' },
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    // Starting a PostgreSQL container can take longer than the default timeout.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
