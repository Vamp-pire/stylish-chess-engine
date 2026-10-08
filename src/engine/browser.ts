// 브라우저: Stockfish 19 WASM을 Web Worker로 띄운다.
// 교차 출처 격리(crossOriginIsolated)가 되어 있으면 멀티스레드 빌드를 쓴다.
import { UciEngine } from './uci';

export async function createBrowserEngine(base = '/engine/'): Promise<{ engine: UciEngine; threads: number }> {
  const multi = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
  const file = multi ? 'stockfish-19-lite.js' : 'stockfish-19-lite-single.js';
  const worker = new Worker(base + file);
  const engine = new UciEngine(
    {
      send: (line) => worker.postMessage(line),
      onLine: (cb) => worker.addEventListener('message', (e) => cb(String(e.data).trim())),
    },
    () => worker.terminate(),
  );
  const threads = multi ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  await engine.init({ Threads: threads, Hash: 32 });
  return { engine, threads };
}
