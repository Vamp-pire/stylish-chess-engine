// 사이트 공통 메뉴 (정적 페이지 build-pages.mjs와 분석 앱 main.ts가 함께 쓴다).
// 큰 주제 4개 + 펼치는 칸. 동작(열기·닫기·키보드)은 public/menu.js가 맡는다.

/** 앱 화면 주소. 영어면 lang=en을 붙인다 */
const app = (lang, q) => `/app?${q}${lang === 'en' ? '&lang=en' : ''}`;
const page = (lang, path) => (lang === 'en' ? `/en${path}` : path);

/** @type {{ key: string, ko: string, en: string, items: { ko: string, en: string, dko: string, den: string, href: (lang: string) => string, view?: string, tab?: string, isNew?: boolean }[] }[]} */
export const MENU = [
  { key: 'analyze', ko: '분석', en: 'Analyze', items: [
    { ko: '아이디로 분석', en: 'Analyze a username', dko: 'Chess.com·Lichess 최근 게임으로 내 유형 알아보기', den: 'Find your type from recent Chess.com or Lichess games', href: (l) => app(l, 'tab=user'), view: 'analyze', tab: 'lichessUser' },
    { ko: '기보(PGN) 분석', en: 'Analyze a PGN', dko: '기보를 붙여넣어 한 판의 모든 수를 평가', den: 'Paste a game and rate every move', href: (l) => app(l, 'tab=pgn'), view: 'analyze', tab: 'paste' },
    { ko: '유형 비교', en: 'Compare types', dko: '친구에게 비교 링크를 보내 나란히 보기', den: 'Send a friend a link and see your types side by side', href: (l) => app(l, 'view=compare'), view: 'compare' },
    { ko: 'Lichess 북마클릿', en: 'Lichess bookmarklet', dko: '보고 있던 Lichess 게임을 버튼 한 번에 분석 (PC)', den: 'Analyze the Lichess game you are viewing in one click (PC)', href: (l) => app(l, 'view=bookmarklet'), view: 'bookmarklet', isNew: true },
  ] },
  { key: 'records', ko: '내 기록', en: 'My records', items: [
    { ko: '내 프로필', en: 'My profiles', dko: '저장한 플레이어와 쌓인 유형·정확도', den: 'Saved players with their combined type and accuracy', href: (l) => app(l, 'view=players'), view: 'players' },
    { ko: '연습 과제', en: 'Practice', dko: '내 게임에서 놓친 기회로 만든 이번 주 문제', den: "This week's problems from chances you missed", href: (l) => app(l, 'view=practice'), view: 'practice' },
    { ko: '월간 결산', en: 'Monthly recap', dko: '한 달 동안의 유형·정확도 변화를 카드 한 장으로', den: "A month's type and accuracy change on one card", href: (l) => app(l, 'view=recap'), view: 'recap', isNew: true },
    { ko: '기기 동기화·백업', en: 'Sync & backup', dko: '코드 하나로 휴대폰과 PC에서 같은 기록 보기', den: 'See the same records on your phone and PC with one code', href: (l) => app(l, 'view=sync'), view: 'sync', isNew: true },
  ] },
  { key: 'community', ko: '커뮤니티', en: 'Community', items: [
    { ko: '오늘의 유형 맞히기', en: 'Daily type guess', dko: '하루 한 문제, 수 4개로 유형 맞히고 결과 공유', den: 'One puzzle a day: guess the type from four moves and share', href: (l) => app(l, 'view=daily'), view: 'daily', isNew: true },
    { ko: '그룹 유형 지도', en: 'Group type maps', dko: '친구·커뮤니티의 유형을 16칸 지도로', den: "Your friends' and community's types on a 16-cell map", href: (l) => app(l, 'view=groups'), view: 'groups', isNew: true },
    { ko: '코치와 두기', en: 'Play the coach', dko: '수마다 스타일을 알려 주는 코치와 대국', den: 'A coach that names the style of every move', href: (l) => app(l, 'view=coach'), view: 'coach' },
  ] },
  { key: 'learn', ko: '알아보기', en: 'Learn', items: [
    { ko: '체스 유형 16가지', en: '16 chess types', dko: '4글자 유형이 뜻하는 것', den: 'What the four letters mean', href: (l) => page(l, '/types/') },
    { ko: '유형 궁합', en: 'Type matchups', dko: '136가지 조합, 서로를 상대하는 법', den: '136 pairings and how to play each other', href: (l) => page(l, '/types/match/'), isNew: true },
    { ko: '유형별 오프닝', en: 'Openings by type', dko: '유형에 어울리는 백·흑 오프닝', den: 'White and Black openings that suit each type', href: (l) => page(l, '/types/openings'), isNew: true },
    { ko: '스타일 사전', en: 'Style guide', dko: '수 하나를 평가하는 19가지 스타일', den: 'The 19 styles used to rate a move', href: (l) => app(l, 'view=guide'), view: 'guide' },
    { ko: '소개', en: 'About', dko: 'Stylish가 무엇을 어떻게 분석하는지', den: 'What Stylish analyzes and how', href: (l) => page(l, '/about') },
    { ko: '패치노트', en: 'Updates', dko: '새로 생기고 바뀐 것', den: "What's new and changed", href: (l) => page(l, '/updates') },
  ] },
];

/** 앱 화면(view) → 큰 주제 */
export function menuGroupOf(view) {
  for (const g of MENU) if (g.items.some((it) => it.view === view)) return g.key;
  if (view === 'group') return 'community';
  return view === 'about' ? 'learn' : 'analyze';
}

const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * 메뉴 HTML. active는 큰 주제 key, langSwitch는 언어 전환 요소(정적 페이지는 링크, 앱은 버튼) HTML.
 * inApp이면 앱 안 화면 항목에 data-view·data-tab을 달아 새로고침 없이 바꾼다.
 */
export function menuHtml({ lang = 'ko', active = '', langSwitch = '', inApp = false }) {
  const en = lang === 'en';
  const groups = MENU.map((g) => {
    const items = g.items.map((it) => {
      const data = inApp && it.view ? ` data-view="${it.view}"${it.tab ? ` data-tab-go="${it.tab}"` : ''}` : '';
      return `<li><a class="mm-item" href="${escAttr(it.href(lang))}"${data}><b>${en ? it.en : it.ko}${it.isNew ? ' <span class="mm-new">NEW</span>' : ''}</b><span>${en ? it.den : it.dko}</span></a></li>`;
    }).join('');
    return `<li class="mm-group${g.key === active ? ' active' : ''}" data-group="${g.key}"><button type="button" class="mm-top" aria-expanded="false" aria-controls="mm-p-${g.key}">${en ? g.en : g.ko}<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="mm-panel" id="mm-p-${g.key}"><ul>${items}</ul></div></li>`;
  }).join('');
  return `<nav class="mm" aria-label="${en ? 'Main menu' : '주 메뉴'}">
<button type="button" class="mm-burger" aria-expanded="false" aria-controls="mm-list" aria-label="${en ? 'Menu' : '메뉴'}"><span></span><span></span><span></span></button>
<ul class="mm-list" id="mm-list">${groups}</ul>
<div class="mm-end">${langSwitch}<a class="mm-cta" href="${escAttr(app(lang, 'tab=user'))}"${inApp ? ' data-view="analyze" data-tab-go="lichessUser"' : ''}>${en ? 'Analyze' : '분석하기'}</a></div>
</nav>`;
}
