// 국면 캐시: 같은 국면·같은 조건(깊이·후보 수·탐색 수)의 엔진 결과를 다시 계산하지 않는다.
// 같은 사람의 게임은 오프닝 앞부분이 자주 겹치고, 같은 아이디를 다시 분석할 때도 대부분 겹친다.
// 메모리 + IndexedDB(이 브라우저에만). 저장이 안 되는 환경(사생활 보호 창 등)이면 메모리만 쓴다.
import type { EngineLine } from './uci';

const DB = 'stylish-positions', STORE = 'lines', VERSION = 1;
/** 너무 커지지 않게: 이 개수를 넘으면 오래된 것부터 지운다 */
const MAX_ENTRIES = 40000;

type Opts = { depth?: number; multipv?: number; searchmoves?: string[] };
export const positionKey = (fen: string, o: Opts) =>
  // 수 번호(halfmove·fullmove)는 결과와 무관하므로 빼서 다른 판의 같은 국면도 맞춘다
  `${fen.split(' ').slice(0, 4).join(' ')}|d${o.depth ?? 14}|m${o.multipv ?? 3}|${o.searchmoves?.join(',') ?? ''}`;

const memory = new Map<string, EngineLine[]>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE);
        s.createIndex('at', 'at');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function getPosition(key: string): Promise<EngineLine[] | null> {
  const m = memory.get(key);
  if (m) return m;
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => { const v = req.result?.lines ?? null; if (v) memory.set(key, v); resolve(v); };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

let writes = 0;
export async function putPosition(key: string, lines: EngineLine[]) {
  memory.set(key, lines);
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put({ lines, at: Date.now() }, key);
    if (++writes % 500 === 0) prune(db);
  } catch { /* 저장 공간이 없으면 메모리만 */ }
}

function prune(db: IDBDatabase) {
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_ENTRIES;
      if (extra <= 0) return;
      store.index('at').openKeyCursor().onsuccess = (e) => {
        const c = (e.target as IDBRequest<IDBCursor | null>).result;
        if (!c || extra-- <= 0) return;
        store.delete(c.primaryKey);
        c.continue();
      };
    };
  } catch { /* 무시 */ }
}
