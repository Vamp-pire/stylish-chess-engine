// 동기화 코드: 무작위 코드 하나로 여러 기기에서 같은 기록(플레이어 성향·연습 과제·직접 입력한 레이팅)을 본다.
// 서버에는 코드의 해시만 저장되고, 마지막 사용 후 30일이 지나면 자동으로 지워진다.
import { exportRecords, importRecords } from '../ui/players';
import { rpc } from './supa';

const KEY = 'stylish.sync.v1';
interface SyncState { code: string; lastSync: number | null }

export function syncState(): SyncState | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
function save(s: SyncState | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 헷갈리는 글자를 뺀 16자 (4자씩 끊어 보여 준다): 추측으로 맞힐 수 없는 길이 */
export function newCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = [...bytes].map((b) => A[b % 32]).join('');
  return raw.match(/.{4}/g)!.join('-');
}
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');

/** 서버 기록을 가져와 합치고, 합친 결과를 다시 올린다. 가져온 플레이어 수를 돌려준다 */
export async function syncNow(code = syncState()?.code): Promise<number> {
  if (!code) throw new Error('no code');
  const remote = await rpc<unknown>('sync_get', { p_code: code });
  let merged = 0;
  if (remote) merged = importRecords(JSON.stringify(remote));
  await rpc('sync_put', { p_code: code, p_data: JSON.parse(exportRecords()) });
  save({ code, lastSync: Date.now() });
  return merged;
}

/** 새 코드를 만들어 지금 기록을 올린다 */
export async function createSync(): Promise<string> {
  const code = newCode();
  await rpc('sync_put', { p_code: code, p_data: JSON.parse(exportRecords()) });
  save({ code, lastSync: Date.now() });
  return code;
}

/** 다른 기기에서 받은 코드로 연결 (서버 기록을 합친다) */
export async function connectSync(code: string): Promise<number> {
  const c = normalizeCode(code);
  if (c.replace(/-/g, '').length < 16) throw new Error('bad code');
  return syncNow(c);
}

export function disconnectSync() { save(null); }

/** 종합 분석이 끝나는 등 기록이 바뀐 뒤 조용히 올린다 (실패해도 화면에는 영향 없음) */
let timer = 0;
export function autoSync() {
  if (!syncState()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => { syncNow().catch(() => { /* 다음 기회에 */ }); }, 3000);
}
