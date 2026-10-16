import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Tests against the throwaway "<dev>_isolated_test" database. Run them with
// `pnpm test:isolated` (scripts/test-isolated.mjs), never directly.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/isolated/**/*.isolated-spec.ts'],
    fileParallelism: false,
  },
});
