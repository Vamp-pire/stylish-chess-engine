import { defineConfig } from 'vitest/config';

export default defineConfig({
  worker: { format: 'es' },
  test: { testTimeout: 120_000 },
});
