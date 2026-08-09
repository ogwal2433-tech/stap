import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    // Integration suites each build the full Express app, which eagerly pulls
    // puppeteer in via the guards router. Loading that many copies in worker
    // threads exhausts memory — separate processes keep each one isolated.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/services/**', 'src/lib/**'],
      exclude: ['node_modules', 'dist', 'src/__tests__', 'src/db/seed.ts'],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   75,
        statements: 80,
      },
    },
  },
});
