import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Bounded load test (pnpm test:load). Same guarded test database as e2e.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/load/**/*.load-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/worker-setup.ts'],
    fileParallelism: false,
    testTimeout: 300000,
    hookTimeout: 120000,
  },
});
