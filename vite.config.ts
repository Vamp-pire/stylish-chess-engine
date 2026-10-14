import { defineConfig, type Plugin } from 'vitest/config';

// WebGPU용 onnxruntime wasm(약 27MB)은 Cloudflare Pages 파일 한도(25MB)를 넘는다.
// Maia Worker가 조각(public/ort-gpu, scripts/split-ort-gpu.mjs)을 받아 wasmBinary로 넣으므로 이 파일은 쓰이지 않는다: 빌드에서 뺀다
const dropOrtGpuWasm = (): Plugin => ({
  name: 'drop-ort-gpu-wasm',
  generateBundle(_, bundle) { for (const k of Object.keys(bundle)) if (/asyncify[^/]*\.wasm$/.test(k)) delete bundle[k]; },
});

export default defineConfig({
  worker: { format: 'es', plugins: () => [dropOrtGpuWasm()] },
  plugins: [dropOrtGpuWasm()],
  // 분석 앱은 /app (app.html). 첫 화면(index.html)과 유형 소개 등은 빌드 후 scripts/build-pages.mjs가 만든다
  build: { rollupOptions: { input: { app: 'app.html' } } },
  // onnxruntime-web은 import.meta.url로 wasm을 찾으므로 사전 번들링하지 않는다
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  // 엔진·Maia 모델 준비(beforeAll)는 CPU가 바쁠 때 10초를 넘길 수 있다
  test: { testTimeout: 120_000, hookTimeout: 120_000, setupFiles: ['test/setup-lang.ts'] },
});
