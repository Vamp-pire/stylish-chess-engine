// 브라우저: Stockfish 19 lite WASM(단일 스레드)을 Web Worker로 띄운다.
// 멀티스레드 빌드는 깊이 고정 탐색에서 특정 국면이 수십 배 느려지는 경우가 있어(예: 0.2초 → 5.7초)
// 속도가 일정하고 Node 테스트와 같은 결과를 내는 단일 스레드 빌드만 쓴다.
import { UciEngine } from './uci';

export async function createBrowserEngine(base = '/engine/'): Promise<{ engine: UciEngine }> {
  const worker = new Worker(base + 'stockfish-19-lite-single.js');
  const engine = new UciEngine(
    {
      send: (line) => worker.postMessage(line),
      onLine: (cb) => worker.addEventListener('message', (e) => cb(String(e.data).trim())),
    },
    () => worker.terminate(),
  );
  await engine.init({ Hash: 32 });
  return { engine };
}
