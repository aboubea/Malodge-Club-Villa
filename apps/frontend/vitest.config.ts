import { defineConfig } from 'vitest/config';

/** Unit tests of the interface's rules (src/**\/*.spec.ts), without a browser. */
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
