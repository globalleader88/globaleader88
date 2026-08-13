import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws when imported outside an RSC context; stub it so
      // server modules can be unit-tested in the node environment.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
