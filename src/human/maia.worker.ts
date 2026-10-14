// Maia3 Worker: 모델을 한 번 받아 두고 여러 분석이 같이 쓴다.
// 모델(약 45MB)은 25MB 이하 조각으로 받아 합치고, 브라우저 Cache Storage에 저장해 두 번째부터는 내려받지 않는다.
// WebGPU가 되는 기기는 그래픽카드로 계산한다 (측정: 80국면 CPU 20.7초 → WebGPU 7.6초, 상위 수 같음, 확률 차 0.001).
// 안 되거나 도중에 실패하면 지금처럼 CPU(wasm)로.
import * as ort from 'onnxruntime-web/wasm';
import { createMaia3, type HumanModel, type HumanPolicy, type HumanQuery } from './maia3';

export type ToMaia =
  | { type: 'init'; url: string }
  | { type: 'predict'; id: number; queries: HumanQuery[] };

export type FromMaia =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'result'; id: number; policies: HumanPolicy[] | null };

const post = (m: FromMaia) => (self as unknown as Worker).postMessage(m);
const CACHE = 'stylish-maia';

// COOP/COEP 헤더가 없으니 멀티스레드는 쓸 수 없다
ort.env.wasm.numThreads = 1;

interface Manifest { version: string; size: number; parts: string[] }

/** 조각 목록(…json)을 보고 조각들을 받아 하나로 합친다. 합친 파일은 버전별로 캐시한다 */
async function fetchParts(manifestUrl: string, cacheName: string, file: string, ext: string, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const manifest = (await (await fetch(manifestUrl, { cache: 'no-cache' })).json()) as Manifest;
  const key = new URL(`${file}-${manifest.version}.${ext}`, manifestUrl).href;
  const cache = await caches.open(cacheName).catch(() => null);
  const hit = await cache?.match(key);
  if (hit) return new Uint8Array(await hit.arrayBuffer());

  const bytes = new Uint8Array(manifest.size);
  let loaded = 0, lastPct = -1;
  for (const part of manifest.parts) {
    const res = await fetch(new URL(part, manifestUrl));
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, loaded);
      loaded += value.length;
      const pct = Math.floor((loaded / manifest.size) * 100);
      if (pct !== lastPct) { lastPct = pct; onProgress(loaded, manifest.size); }
    }
  }
  if (loaded !== manifest.size) throw new Error('size mismatch');
  // 예전 버전은 지우고 새 것만 남긴다 (저장 실패는 무시: 다음에 다시 받으면 됨)
  if (cache) {
    for (const k of await cache.keys()) if (k.url !== key) await cache.delete(k);
    await cache.put(key, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {});
  }
  return bytes;
}

const fetchModel = (url: string) => fetchParts(url, CACHE, 'maia3', 'onnx', (loaded, total) => post({ type: 'progress', loaded, total }));

/** 시험 예측: 결과가 비었거나 숫자가 아니면 그 계산 방식은 쓰지 않는다 */
const PROBE = [
  { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', elo: 1500, oppElo: 1500 },
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', elo: 1500, oppElo: 1500 },
];
async function probe(m: HumanModel) {
  const out = await m.predict(PROBE);
  if (out.length !== PROBE.length || out.some((p) => !p.length || p.some((x) => !Number.isFinite(x.p)))) throw new Error('probe failed');
}

/** WebGPU로 모델을 만든다. 안 되면 null */
async function createGpuModel(manifestUrl: string, bytes: Uint8Array): Promise<HumanModel | null> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    // 모델이 fp16이라 shader-f16이 없는 그래픽카드에서는 돌지 않는다 (WebGPU용 wasm을 받기 전에 거른다)
    if (!adapter?.features.has('shader-f16')) return null;
    const ortGpu = await import('onnxruntime-web/webgpu');
    ortGpu.env.wasm.numThreads = 1;
    // WebGPU용 wasm은 25MB가 넘어 조각으로 올려 두었다 (scripts/split-ort-gpu.mjs)
    ortGpu.env.wasm.wasmBinary = await fetchParts(new URL('../ort-gpu/ort-gpu.json', manifestUrl).href, 'stylish-ort-gpu', 'ort-gpu', 'wasm', () => {});
    const m = await createMaia3(ortGpu as unknown as typeof ort, bytes, { executionProviders: ['webgpu'] });
    await probe(m);
    return m;
  } catch {
    return null;
  }
}

/** GPU 모델이 도중에 실패하면 CPU 모델로 바꿔 다시 예측한다 */
function withFallback(gpu: HumanModel, makeCpu: () => Promise<HumanModel>): HumanModel {
  let cpu: Promise<HumanModel> | null = null;
  return {
    async predict(queries) {
      if (!cpu) {
        try { return await gpu.predict(queries); } catch { cpu = makeCpu(); }
      }
      return (await cpu).predict(queries);
    },
  };
}

let model: Promise<HumanModel | null> | null = null;

self.onmessage = async (e: MessageEvent<ToMaia>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    model ??= fetchModel(msg.url)
      .then(async (bytes) => {
        const gpu = await createGpuModel(msg.url, bytes);
        console.info(`[maia] ${gpu ? 'webgpu' : 'wasm'}`);
        return gpu ? withFallback(gpu, () => createMaia3(ort, bytes)) : createMaia3(ort, bytes);
      })
      .then((m) => { post({ type: 'ready' }); return m; })
      .catch((err) => { post({ type: 'failed', message: err instanceof Error ? err.message : String(err) }); return null; });
  } else if (msg.type === 'predict') {
    const m = await model;
    const policies = m ? await m.predict(msg.queries).catch(() => null) : null;
    post({ type: 'result', id: msg.id, policies });
  }
};
