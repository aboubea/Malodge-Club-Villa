import { defineConfig } from 'vitest/config';

/** Unit tests: pure business rules, no database (src/**\/*.spec.ts). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
