// 가벼운 서버(Supabase) 연결: 그룹 유형 지도·동기화 코드에서만 쓴다. 분석은 지금처럼 브라우저에서.
// 로그인은 가입 없는 익명 로그인 + Cloudflare Turnstile(사람 확인). 처음 쓸 때만 라이브러리를 불러온다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { tr } from '../i18n';

// 둘 다 공개용 값 (브라우저에 들어가도 되는 키). 무엇을 읽고 쓸 수 있는지는 데이터베이스 함수가 검사한다
export const SUPABASE_URL = 'https://ugxrqdgsqyvqatveqhuu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fTpXPFYm0wl62vxftVxCOA_XFkfYPuT';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFXU6KjA28R7orwQ';

let clientPromise: Promise<SupabaseClient> | null = null;
export function supa(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'stylish.auth' } }));
  return clientPromise;
}

// ───────────── Turnstile (사람 확인) ─────────────
type Turnstile = { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
let tsPromise: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  tsPromise ??= new Promise((resolve, reject) => {
    const w = window as unknown as { turnstile?: Turnstile };
    if (w.turnstile) { resolve(w.turnstile); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => { tsPromise = null; reject(new Error(tr('사람 확인 기능을 불러오지 못했어요. 광고 차단기를 잠시 꺼 보세요.', "Couldn't load the human check. Try pausing your ad blocker."))); };
    document.head.appendChild(s);
  });
  return tsPromise;
}

/** 사람 확인 토큰. 대부분은 보이지 않게 통과하고, 필요할 때만 화면 아래에 체크 칸이 뜬다 */
async function captchaToken(): Promise<string> {
  const ts = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'ts-box';
    document.body.appendChild(box);
    let id = '';
    const done = () => { try { ts.remove(id); } catch { /* 무시 */ } box.remove(); };
    id = ts.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      callback: (t: string) => { done(); resolve(t); },
      'error-callback': () => { done(); reject(new Error(tr('사람 확인에 실패했어요. 잠시 후 다시 시도해 주세요.', 'The human check failed. Please try again shortly.'))); },
      'timeout-callback': () => { done(); reject(new Error(tr('사람 확인 시간이 지났어요. 다시 시도해 주세요.', 'The human check timed out. Please try again.'))); },
    });
  });
}

/** 익명 로그인된 클라이언트 (없으면 사람 확인 후 익명 로그인) */
export async function signedIn(): Promise<SupabaseClient> {
  const c = await supa();
  const { data } = await c.auth.getSession();
  if (data.session) return c;
  const captchaTokenValue = await captchaToken();
  const { error } = await c.auth.signInAnonymously({ options: { captchaToken: captchaTokenValue } });
  if (error) throw new Error(tr('서버에 연결하지 못했어요: ', 'Could not connect to the server: ') + error.message);
  return c;
}

/** 서버 함수 호출 (오류는 사람이 읽을 수 있는 말로) */
export async function rpc<T>(name: string, args: Record<string, unknown>, needLogin = true): Promise<T> {
  const c = needLogin ? await signedIn() : await supa();
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

function friendlyError(msg: string): string {
  if (/banned word/.test(msg)) return tr('쓸 수 없는 단어가 들어 있어요.', 'That contains a word that is not allowed.');
  if (/bad nickname/.test(msg)) return tr('닉네임은 16자 이하로, 쓸 수 없는 단어 없이 정해 주세요.', 'Nicknames must be 16 characters or fewer with no blocked words.');
  if (/name length/.test(msg)) return tr('그룹 이름은 1~30자로 정해 주세요.', 'Group names must be 1–30 characters.');
  if (/too many groups/.test(msg)) return tr('하루에 그룹은 5개까지 만들 수 있어요.', 'You can create up to 5 groups a day.');
  if (/group full/.test(msg)) return tr('이 그룹은 200명이 다 찼어요.', 'This group is full (200 members).');
  if (/no group/.test(msg)) return tr('그룹을 찾을 수 없어요. 코드를 확인해 주세요.', 'Group not found. Please check the code.');
  if (/too large/.test(msg)) return tr('기록이 너무 커서 동기화할 수 없어요. 안 쓰는 플레이어를 지워 주세요.', 'Your records are too large to sync. Delete players you no longer need.');
  return msg;
}
