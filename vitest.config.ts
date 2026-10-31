import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: { LOG_LEVEL: 'silent' },
    root: './',
    // Unit tests sit next to the code they test, as in a default NestJS project.
    include: ['src/**/*.spec.ts'],
  },
});
