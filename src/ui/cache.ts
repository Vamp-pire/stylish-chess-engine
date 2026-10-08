// 분석 결과를 이 브라우저(IndexedDB)에 저장해 같은 기보를 다시 열면 즉시 보여준다.
// 저장 실패(사생활 보호 모드 등)는 조용히 무시한다.
import type { GameAnalysis } from '../core/analyzer';

const DB = 'stylish', STORE = 'analyses', VERSION = 1;
/** 판정 규칙이 바뀌면 올려서 예전 결과를 무효화한다 */
const RULES_VERSION = 2;

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

/** 기보 수순(헤더 제외)과 깊이로 키를 만든다 */
export function cacheKey(pgn: string, depth: number) {
  const moves = pgn.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < moves.length; i++) { h ^= moves.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `v${RULES_VERSION}:d${depth}:${(h >>> 0).toString(36)}:${moves.length}`;
}

export async function getCached(key: string): Promise<GameAnalysis | null> {
  const d = await db(); if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as GameAnalysis) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function putCached(key: string, value: GameAnalysis): Promise<void> {
  const d = await db(); if (!d) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
