// Maia3 Worker: 모델을 한 번 받아 두고 여러 분석이 같이 쓴다.
// 모델(약 45MB)은 25MB 이하 조각으로 받아 합치고, 브라우저 Cache Storage에 저장해 두 번째부터는 내려받지 않는다.
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

/** 조각 목록(maia3.json)을 보고 조각들을 받아 하나로 합친다. 합친 모델은 버전별로 캐시한다 */
async function fetchModel(manifestUrl: string): Promise<Uint8Array> {
  const manifest = (await (await fetch(manifestUrl, { cache: 'no-cache' })).json()) as Manifest;
  const key = new URL(`maia3-${manifest.version}.onnx`, manifestUrl).href;
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(key);
  if (hit) return new Uint8Array(await hit.arrayBuffer());

  const bytes = new Uint8Array(manifest.size);
  let loaded = 0, lastPct = -1;
  for (const part of manifest.parts) {
    const res = await fetch(new URL(part, manifestUrl));
    if (!res.ok || !res.body) throw new Error(`모델을 받지 못했습니다 (${res.status})`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, loaded);
      loaded += value.length;
      const pct = Math.floor((loaded / manifest.size) * 100);
      if (pct !== lastPct) { lastPct = pct; post({ type: 'progress', loaded, total: manifest.size }); }
    }
  }
  if (loaded !== manifest.size) throw new Error('모델 크기가 맞지 않습니다');
  // 예전 버전 모델은 지우고 새 모델만 남긴다 (저장 실패는 무시: 다음에 다시 받으면 됨)
  if (cache) {
    for (const k of await cache.keys()) if (k.url !== key) await cache.delete(k);
    await cache.put(key, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {});
  }
  return bytes;
}

let model: Promise<HumanModel | null> | null = null;

self.onmessage = async (e: MessageEvent<ToMaia>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    model ??= fetchModel(msg.url)
      .then((bytes) => createMaia3(ort, bytes))
      .then((m) => { post({ type: 'ready' }); return m; })
      .catch((err) => { post({ type: 'failed', message: err instanceof Error ? err.message : String(err) }); return null; });
  } else if (msg.type === 'predict') {
    const m = await model;
    const policies = m ? await m.predict(msg.queries).catch(() => null) : null;
    post({ type: 'result', id: msg.id, policies });
  }
};
