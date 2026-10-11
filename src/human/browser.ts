// 메인 스레드: Maia3 Worker를 처음 분석할 때 띄우고(지연 로딩), 상태를 화면에 알린다.
import type { HumanModel, HumanPolicy, HumanQuery } from './maia3';
import type { FromMaia, ToMaia } from './maia.worker';
import MaiaWorker from './maia.worker?worker';

/** 모델 조각 목록 (scripts/fetch-maia.mjs가 만든다. 캐시는 목록의 version으로 구분) */
const MODEL_URL = 'maia/maia3.json';

export type HumanStatus =
  | { state: 'idle' }
  | { state: 'loading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'failed'; message: string };

let status: HumanStatus = { state: 'idle' };
const listeners = new Set<(s: HumanStatus) => void>();
export const humanStatus = () => status;
export function onHumanStatus(fn: (s: HumanStatus) => void) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(s: HumanStatus) { status = s; listeners.forEach((fn) => fn(s)); }

let modelPromise: Promise<HumanModel | null> | null = null;

/** 모델을 준비한다. 실패하면 null (분석은 규칙 기반 예측으로 계속) */
export function getHumanModel(): Promise<HumanModel | null> {
  modelPromise ??= new Promise((resolve) => {
    let worker: Worker;
    try { worker = new MaiaWorker(); } catch (err) {
      setStatus({ state: 'failed', message: String(err) });
      resolve(null);
      return;
    }
    let seq = 0;
    const pending = new Map<number, (p: HumanPolicy[] | null) => void>();
    const model: HumanModel = {
      predict(queries: HumanQuery[]) {
        const id = ++seq;
        return new Promise((ok, fail) => {
          pending.set(id, (p) => (p ? ok(p) : fail(new Error('Maia 예측 실패'))));
          worker.postMessage({ type: 'predict', id, queries } satisfies ToMaia);
        });
      },
    };
    worker.onmessage = (e: MessageEvent<FromMaia>) => {
      const msg = e.data;
      if (msg.type === 'progress') setStatus({ state: 'loading', loaded: msg.loaded, total: msg.total });
      else if (msg.type === 'ready') { setStatus({ state: 'ready' }); resolve(model); }
      else if (msg.type === 'failed') { setStatus({ state: 'failed', message: msg.message }); worker.terminate(); resolve(null); }
      else if (msg.type === 'result') { pending.get(msg.id)?.(msg.policies); pending.delete(msg.id); }
    };
    worker.onerror = (e) => {
      setStatus({ state: 'failed', message: e.message });
      pending.forEach((fn) => fn(null)); pending.clear();
      resolve(null);
    };
    setStatus({ state: 'loading', loaded: 0, total: 0 });
    worker.postMessage({ type: 'init', url: new URL(import.meta.env.BASE_URL + MODEL_URL, location.href).href } satisfies ToMaia);
  });
  return modelPromise;
}
