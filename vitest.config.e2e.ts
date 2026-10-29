import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: { LOG_LEVEL: 'silent' },
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
