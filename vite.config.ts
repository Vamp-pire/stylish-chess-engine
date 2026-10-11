import { defineConfig } from 'vitest/config';

export default defineConfig({
  worker: { format: 'es' },
  // onnxruntime-web은 import.meta.url로 wasm을 찾으므로 사전 번들링하지 않는다
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  // 엔진·Maia 모델 준비(beforeAll)는 CPU가 바쁠 때 10초를 넘길 수 있다
  test: { testTimeout: 120_000, hookTimeout: 120_000 },
});
