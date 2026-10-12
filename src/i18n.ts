// 언어(한국어/영어). 화면 문구는 tr('한국어', 'English')로 쓴다.
// 메인 스레드: 주소 ?lang= → 저장된 선택 → 브라우저 언어 순. 분석 Worker는 메인이 보낸 값을 setLang으로 받는다.
export type Lang = 'ko' | 'en';
const KEY = 'stylish-lang';

function detect(): Lang {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
    if (q === 'ko' || q === 'en') { globalThis.localStorage?.setItem(KEY, q); return q; }
    const saved = globalThis.localStorage?.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* Worker·사생활 보호 모드 */ }
  return /^ko/i.test(globalThis.navigator?.language ?? 'ko') ? 'ko' : 'en';
}

let lang: Lang = detect();
export const getLang = () => lang;
export function setLang(l: Lang) { lang = l; }
/** 언어를 바꾸고 저장한다 (화면은 새로 그려야 함) */
export function saveLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
}
export const tr = (ko: string, en: string) => (lang === 'en' ? en : ko);
