import { defineConfig } from 'vitest/config';

/**
 * Database tests (test/**\/*.db.spec.ts): run against TEST_DATABASE_URL, an empty
 * PostgreSQL database that the tests fill and wipe. Never point it at real data.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.db.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
