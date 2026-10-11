import { defineConfig } from 'vitest/config';

export default defineConfig({
  worker: { format: 'es' },
  // onnxruntime-web은 import.meta.url로 wasm을 찾으므로 사전 번들링하지 않는다
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: { testTimeout: 120_000 },
});
