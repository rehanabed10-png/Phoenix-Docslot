import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    fileParallelism: false,
    isolate: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
