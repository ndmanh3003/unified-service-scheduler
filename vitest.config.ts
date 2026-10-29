import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: { LOG_LEVEL: 'silent' },
    root: './',
    include: ['test/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Unit tests are added together with the booking services.
    passWithNoTests: true,
  },
});
