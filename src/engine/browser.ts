// 브라우저: Stockfish 19 lite WASM(단일 스레드)을 Web Worker로 여러 개 띄워 엔진 풀로 묶는다.
// 멀티스레드 빌드는 깊이 고정 탐색에서 특정 국면이 수십 배 느려지는 경우가 있어(예: 0.2초 → 5.7초)
// 단일 스레드 엔진을 여러 개 동시에 돌리는 방식으로 속도를 낸다.
import { UciEngine } from './uci';
import { EnginePool } from './pool';

async function createWorkerEngine(base: string): Promise<UciEngine> {
  const worker = new Worker(base + 'stockfish-19-lite-single.js');
  const engine = new UciEngine(
    {
      send: (line) => worker.postMessage(line),
      onLine: (cb) => worker.addEventListener('message', (e) => cb(String(e.data).trim())),
    },
    () => worker.terminate(),
  );
  await engine.init({ Hash: 16 });
  return engine;
}

/** 엔진 개수: 코어 수 - 1 (화면 처리 몫), 최대 4. 휴대폰·메모리 적은 기기는 2 */
export function poolSize() {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  // 창 폭이 아니라 입력 장치로 판단한다 (PC에서 창을 좁게 써도 엔진을 줄이지 않도록)
  const mobile = matchMedia('(pointer: coarse)').matches || memory <= 4;
  return Math.max(1, Math.min(mobile ? 2 : 4, cores - 1));
}

export async function createBrowserEngine(base = '/engine/'): Promise<{ engine: EnginePool }> {
  const n = poolSize();
  const engines = await Promise.all(Array.from({ length: n }, () => createWorkerEngine(base)));
  return { engine: new EnginePool(engines) };
}
