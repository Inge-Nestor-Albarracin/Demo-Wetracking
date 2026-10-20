import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e and concurrency tests write data, so they only run against the
// dedicated test database (TEST_DATABASE_URL, see test/support/test-database.ts).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/worker-setup.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
