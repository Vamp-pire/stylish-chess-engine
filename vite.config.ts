import { defineConfig } from 'vitest/config';

// 멀티스레드 Stockfish(SharedArrayBuffer)를 쓰려면 교차 출처 격리 헤더가 필요하다.
// 배포(Vercel)에서는 vercel.json에서 같은 헤더를 준다.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  test: { testTimeout: 120_000 },
});
