// 정적 페이지 만들기 (vite build 뒤에 실행): 첫 화면(유형 소개 + 아이디 입력), 체스 유형 16개 + 목록, 소개·문의·개인정보처리방침, 사이트맵.
// 한국어(/)와 영어(/en/)를 같은 틀로 만든다. 영어 글은 src/data/chess-types.en.json
// 분석 앱은 /app (app.html). 유형 이미지는 scripts/build-type-images.mjs로 만들어 public/img/types/에 커밋해 둔다.
// 검색엔진과 광고 심사가 읽을 수 있도록 자바스크립트 없이 보이는 HTML로 만든다. 내용은 src/data/chess-types.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL ?? 'https://stylish-chess-engine.pages.dev').replace(/\/$/, '');
const ADSENSE = 'ca-pub-8762647584529985';
const CONTACT_FORM = 'https://forms.gle/d9PbZSYZKkzpykgq8';
const REPO = 'https://github.com/Vamp-pire/stylish-chess-engine';
const UPDATED = '2026-10-12';
const SEARCH_CONSOLE = 'T4-fwXM8oe_n6an574Sidq3X6cvTdKS9b5MsTB0bvgw';
const PRETENDARD = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
const GROUP_ORDER = ['AW', 'AS', 'PW', 'PS'];

const DIST = new URL('../dist/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('../src/data/chess-types.json', import.meta.url), 'utf8'));
const calib = JSON.parse(readFileSync(new URL('../src/data/type-calib.json', import.meta.url), 'utf8'));
/** 유형별 실제 예시 수 (scripts/calib/pick-examples.mts) */
const examples = JSON.parse(readFileSync(new URL('../src/data/type-examples.json', import.meta.url), 'utf8'));
const EN = JSON.parse(readFileSync(new URL('../src/data/chess-types.en.json', import.meta.url), 'utf8'));
/** 언어별 유형 정보 (영어는 이름을 영어 이름으로) */
const typeIn = (t, lang) => (lang === 'en' ? { ...t, ...EN.types[t.code], name: t.en } : t);
const groupIn = (g, lang) => (lang === 'en' ? { ...data.groups[g], ...EN.groups[g] } : data.groups[g]);
const axesIn = (lang) => (lang === 'en' ? data.axes.map((a, i) => ({ ...a, ...EN.axes[i] })) : data.axes);
/** 영어 페이지 주소: /types/AWIO → /en/types/AWIO */
const P = (lang, path) => (lang === 'en' ? `/en${path === '/' ? '/' : path}` : path);
const APP = (lang, q = '') => `/app${lang === 'en' ? `?lang=en${q ? `&${q}` : ''}` : q ? `?${q}` : ''}`;
const IMG = (lang, file) => (lang === 'en' ? `/img/types/en/${file}` : `/img/types/${file}`);
const STYLE_EN = {
  aggressive: 'Aggressive', tactical: 'Tactical', initiative: 'Initiative', counterattack: 'Counterattack', positional: 'Positional',
  prophylactic: 'Prophylactic', restriction: 'Restriction', active: 'Active', space: 'Space', tension: 'Tension', solid: 'Solid',
  defensive: 'Defensive', simplifying: 'Simplifying', complicating: 'Complicating', quiet: 'Quiet', waiting: 'Waiting',
  practical: 'Practical', kingActivity: 'King activity', passedPawn: 'Passed pawn',
};
const RISK_EN = { soundSacrifice: 'Sound sacrifice', speculative: 'Speculative sacrifice', trap: 'Trap', gamble: 'Gamble' };

// ── 체스판 그림 (정적 SVG). 기물은 chessground의 cburnett 세트 ──
const pieceCss = readFileSync(new URL('../node_modules/chessground/assets/chessground.cburnett.css', import.meta.url), 'utf8');
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function pieceSymbol(code) {
  const color = code === code.toUpperCase() ? 'white' : 'black';
  const m = pieceCss.match(new RegExp(`piece\\.${PIECE_NAMES[code.toLowerCase()]}\\.${color}\\s*\\{[^}]*base64,([A-Za-z0-9+/=]+)`));
  const svg = Buffer.from(m[1], 'base64').toString('utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<symbol id="pc-${color[0]}${code.toLowerCase()}" viewBox="0 0 45 45">${inner}</symbol>`;
}
const RISK_NAME = { soundSacrifice: '건전한 희생', speculative: '무리한 희생', trap: '함정수', gamble: '도박수' };
const ARROW_COLOR = { good: '#15803d', bad: '#c2410c', best: '#15803d' };

/** FEN → 8×8 판 SVG (둔 쪽이 아래로), 화살표 [from, to, 종류] */
function boardSvg(fen, flip, arrows) {
  const S = 40, rows = fen.split(' ')[0].split('/');
  const used = new Set();
  let squares = '', pieces = '';
  const xy = (file, rank) => {
    const c = flip ? 7 - file : file, r = flip ? rank : 7 - rank;
    return [c * S, r * S];
  };
  for (let rank = 7; rank >= 0; rank--) {
    let file = 0;
    for (const ch of rows[7 - rank]) {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      const [x, y] = xy(file, rank);
      const id = `pc-${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toLowerCase()}`;
      used.add(ch === ch.toUpperCase() ? ch : ch);
      pieces += `<use href="#${id}" x="${x}" y="${y}" width="${S}" height="${S}"/>`;
      file++;
    }
  }
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const [x, y] = xy(f, r);
    squares += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${(f + r) % 2 ? '#f0d9b5' : '#b58863'}"/>`;
  }
  // 좌표
  let coords = '';
  for (let i = 0; i < 8; i++) {
    const file = flip ? 7 - i : i, rank = flip ? i : 7 - i;
    coords += `<text x="${i * S + S - 3}" y="${8 * S - 3}" text-anchor="end" font-size="8" fill="${(i + 0) % 2 ? '#b58863' : '#f0d9b5'}" font-weight="700">${'abcdefgh'[file]}</text>`;
    coords += `<text x="2" y="${i * S + 9}" font-size="8" fill="${i % 2 ? '#f0d9b5' : '#b58863'}" font-weight="700">${rank + 1}</text>`;
  }
  const center = (sq) => { const [x, y] = xy(sq.charCodeAt(0) - 97, Number(sq[1]) - 1); return [x + S / 2, y + S / 2]; };
  let arr = '';
  for (const [from, to, kind] of arrows) {
    const [x1, y1] = center(from), [x2, y2] = center(to);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const head = 13, ex = x2 - ux * 8, ey = y2 - uy * 8, bx = ex - ux * head, by = ey - uy * head;
    const c = ARROW_COLOR[kind];
    arr += `<path d="M${x1 + ux * 10} ${y1 + uy * 10} L${bx} ${by}" stroke="${c}" stroke-width="7" stroke-linecap="round" opacity="0.85"/>`;
    arr += `<path d="M${ex} ${ey} L${bx - uy * 9} ${by + ux * 9} L${bx + uy * 9} ${by - ux * 9} Z" fill="${c}" opacity="0.9"/>`;
  }
  const symbols = [...new Set(fen.split(' ')[0].replace(/[\d/]/g, ''))].map(pieceSymbol).join('');
  return `<svg class="board" viewBox="0 0 ${8 * S} ${8 * S}" role="img"><defs>${symbols}</defs>${squares}${coords}${pieces}${arr}</svg>`;
}

/** 실제 예시 카드 (영어) */
function exampleCardEn(e, t) {
  const flip = e.color === 'b';
  const moveNo = `${e.moveNumber}${e.color === 'w' ? '.' : '...'}`;
  const label = (x) => STYLE_EN[x.key] ?? x.label;
  const chips = e.styles.map((x) => `<span class="chip">${esc(label(x))} ${x.score}</span>`).join('') + (e.risk ? `<span class="chip risk">${RISK_EN[e.risk]}</span>` : '');
  const signature = e.kind === 'signature';
  const arrows = [[e.uci.slice(0, 2), e.uci.slice(2, 4), signature ? 'good' : 'bad']];
  if (!signature && e.bestUci) arrows.push([e.bestUci.slice(0, 2), e.bestUci.slice(2, 4), 'best']);
  const styleText = e.styles.slice(0, 2).map(label).join(' and ').toLowerCase();
  const rare = e.humanP <= 20;
  const body = signature
    ? `<p>${styleText ? `A move with high <b>${esc(styleText)}</b> scores. ` : ''}A human at the same rating would play it here <b>${e.humanP}%</b> of the time, ${rare ? 'so it is an unusual choice that is hard to find' : 'a natural choice that still shows the style clearly'}.${e.risk ? ` The engine labeled it a <b>${RISK_EN[e.risk].toLowerCase()}</b>.` : ''}</p>`
    : `<p>This move dropped the expected score by <b>${e.lossPp} percentage points</b>.${e.best ? ` The better move was <b>${esc(e.best)}</b> (green arrow).` : ''} ${styleText ? `It leans strongly ${esc(styleText)}, the kind of mistake a ${esc(t.name)} makes when the habit goes too far.` : ''}</p>`;
  return `<figure class="example ${signature ? 'ok' : 'ng'}">
${boardSvg(e.fen, flip, arrows)}
<figcaption>
<span class="ex-kind">${signature ? 'Signature move' : 'Typical mistake'}</span>
<h3>${moveNo} ${esc(e.san)}</h3>
<p class="ex-meta">Rated ${e.elo} · ${e.color === 'w' ? 'White' : 'Black'}${signature ? '' : ` · ${e.quality === 'blunder' ? 'Blunder' : 'Mistake'}`}</p>
<div class="chips">${chips}</div>
${body}
</figcaption>
</figure>`;
}

/** 실제 예시 카드 */
function exampleCard(e, t, lang = 'ko') {
  if (lang === 'en') return exampleCardEn(e, t);
  const flip = e.color === 'b';
  const moveNo = `${e.moveNumber}${e.color === 'w' ? '.' : '...'}`;
  const chips = e.styles.map((x) => `<span class="chip">${esc(x.label)} ${x.score}</span>`).join('') + (e.risk ? `<span class="chip risk">${RISK_NAME[e.risk]}</span>` : '');
  const signature = e.kind === 'signature';
  const arrows = [[e.uci.slice(0, 2), e.uci.slice(2, 4), signature ? 'good' : 'bad']];
  if (!signature && e.bestUci) arrows.push([e.bestUci.slice(0, 2), e.bestUci.slice(2, 4), 'best']);
  const styleText = e.styles.slice(0, 2).map((x) => x.label).join('·');
  const rare = e.humanP <= 20;
  const body = signature
    ? `<p>${styleText ? `<b>${esc(styleText)}</b> 점수가 높은 수예요. ` : ''}같은 레이팅의 사람이 이 자리에서 이 수를 둘 확률은 <b>${e.humanP}%</b>로, ${rare ? '쉽게 떠올리기 어려운 남다른 선택' : '자연스럽지만 성향이 잘 드러나는 선택'}이에요.${e.risk ? ` 엔진은 이 수를 <b>${RISK_NAME[e.risk]}</b>로 판정했어요.` : ''}</p>`
    : `<p>이 수로 기대 점수가 <b>${e.lossPp}%p</b> 떨어졌어요.${e.best ? ` 더 나은 수는 <b>${esc(e.best)}</b>(초록 화살표)였어요.` : ''} ${styleText ? `<b>${esc(styleText)}</b> 성향이 강한 수라, ${esc(t.name)} 유형의 습관이 지나치면 이런 실수로 이어지기 쉬워요.` : ''}</p>`;
  return `<figure class="example ${signature ? 'ok' : 'ng'}">
${boardSvg(e.fen, flip, arrows)}
<figcaption>
<span class="ex-kind">${signature ? '대표 수' : '빠지기 쉬운 실수'}</span>
<h3>${moveNo} ${esc(e.san)}</h3>
<p class="ex-meta">레이팅 ${e.elo} 플레이어 · ${e.color === 'w' ? '백' : '흑'}${signature ? '' : ` · ${e.quality === 'blunder' ? '블런더' : '실수'}`}</p>
<div class="chips">${chips}</div>
${body}
</figcaption>
</figure>`;
}


const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const list = (xs) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const opposite = (code) => [...code].map((c, i) => { const l = data.axes[i].letters; return c === l[0] ? l[1] : l[0]; }).join('');
const byCode = Object.fromEntries(data.types.map((t) => [t.code, t]));

function page({ path, title, description, body, active = '', image = null, wide = false, lang = 'ko' }) {
  const en = lang === 'en';
  const url = `${SITE}${P(lang, path)}`;
  const img = image ?? IMG(lang, 'landing.png');
  const nav = [['/types/', en ? 'Chess types' : '체스 유형', 'types'], ['__coach', en ? 'Play the coach' : '코치와 두기', 'coach'], ['/about', en ? 'About' : '소개', 'about']]
    .map(([href, label, key]) => `<a href="${href === '__coach' ? APP(lang, 'view=coach') : P(lang, href)}"${key === active ? ' class="active"' : ''}>${label}</a>`).join('');
  const other = en ? path : P('en', path);
  return `<!doctype html>
<html lang="${en ? 'en' : 'ko'}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="google-site-verification" content="${SEARCH_CONSOLE}" />
<link rel="canonical" href="${url}" />
<link rel="alternate" hreflang="ko" href="${SITE}${path}" />
<link rel="alternate" hreflang="en" href="${SITE}${P('en', path)}" />
<link rel="alternate" hreflang="x-default" href="${SITE}${path}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Stylish" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}${img}" />
<meta property="og:locale" content="${en ? 'en_US' : 'ko_KR'}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="/logo.png" />
<link rel="stylesheet" href="${PRETENDARD}" />
<link rel="stylesheet" href="/pages.css" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
</head>
<body>
<header class="topbar"><div class="topbar-in">
<a class="brand" href="${P(lang, '/')}"><img src="/logo.png" alt="" width="28" height="28" /><span>Stylish<em>.</em></span></a>
<nav>${nav}<a class="lang" href="${other}" hreflang="${en ? 'ko' : 'en'}" lang="${en ? 'ko' : 'en'}">${en ? '한국어' : 'English'}</a><a class="cta" href="${APP(lang)}">${en ? 'Analyze' : '분석하기'}</a></nav>
</div></header>
${en ? '' : `<script>
// 브라우저 언어가 한국어가 아니면 영어판 안내 (자동 이동은 하지 않는다)
try { if (!/^ko/i.test(navigator.language || '')) document.write('<div class="lang-banner">This page is in Korean. <a href="${P('en', path)}">View in English →</a></div>'); } catch (e) {}
</script>`}
<main class="${wide ? 'wide' : ''}">
${body}
</main>
<footer><div class="footer-in">
<div class="footer-brand"><a class="brand" href="${P(lang, '/')}"><img src="/logo.png" alt="" width="22" height="22" /><span>Stylish<em>.</em></span></a>
<p>${en ? 'Your chess style and 4-letter chess type, from your own games.' : '내 게임으로 알아보는 체스 스타일과 4글자 체스 유형.'}</p></div>
<div class="footer-links">${en
  ? `<a href="/en/types/">Chess types</a><a href="${APP(lang)}">Analyze</a><a href="/en/about">About</a><a href="/en/privacy">Privacy</a><a href="/en/contact">Contact</a><a href="${path}" lang="ko">한국어</a>`
  : `<a href="/types/">체스 유형</a><a href="/app">분석하기</a><a href="/about">소개</a><a href="/privacy">개인정보처리방침</a><a href="/contact">문의</a><a href="${P('en', path)}" lang="en">English</a>`}</div>
<p class="footer-note">${en
  ? 'Stylish is <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GPLv3</a> open source. Engine: Stockfish 19. Human-move model: Maia3 (CSSLab). Board and pieces: chessground (cburnett). All analysis runs inside your browser.'
  : 'Stylish는 <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GPLv3</a> 오픈소스입니다. 분석 엔진 Stockfish 19, 사람 수 예측 Maia3(CSSLab), 보드·기물 chessground(cburnett). 모든 분석은 방문자의 브라우저 안에서 이뤄집니다.'}</p>
</div></footer>
</body>
</html>
`;
}

/** 유형 타일 (정사각형 이미지 + 이름) */
const tile = (t, lang = 'ko') => `<a class="type-tile g-${t.code.slice(0, 2)}" href="${P(lang, `/types/${t.code}`)}">
<img src="${IMG(lang, `${t.code}-square.png`)}" alt="${t.code} ${esc(t.name)}" width="600" height="600" loading="lazy" />
<span class="tile-text"><span class="code">${t.code}</span><span class="nm">${esc(t.name)}</span><span class="tg">${esc(t.tagline)}</span></span></a>`;

/** 유형 그리드 (그룹별 줄) */
const typeGrid = (lang = 'ko') => GROUP_ORDER.map((g) => {
  const info = groupIn(g, lang);
  return `<section class="group g-${g}"><div class="group-head"><h3>${esc(info.name)} <span>${lang === 'en' ? g : `${esc(info.en)} · ${g}`}</span></h3><p>${esc(info.desc)}</p></div>
<div class="tiles">${data.types.filter((t) => t.code.startsWith(g)).map((t) => tile(typeIn(t, lang), lang)).join('')}</div></section>`;
}).join('\n');

/** 아이디로 바로 분석 (첫 화면·유형 목록) */
const idForm = (label = '내 유형 알아보기', lang = 'ko') => `<form class="id-form" action="/app" method="get">${lang === 'en' ? '<input type="hidden" name="lang" value="en" />' : ''}
<div class="seg" role="radiogroup" aria-label="${lang === 'en' ? 'Site' : '사이트'}">
<label><input type="radio" name="source" value="lichess" checked /><span>Lichess</span></label>
<label><input type="radio" name="source" value="chesscom" /><span>Chess.com</span></label>
</div>
<input name="user" required minlength="2" maxlength="40" placeholder="${lang === 'en' ? 'Your username' : '아이디 입력'}" autocomplete="username" aria-label="${lang === 'en' ? 'Username' : '아이디'}" />
<button type="submit">${label}</button>
</form>`;

function write(path, html) {
  const file = new URL(path.replace(/^\//, '') + (path.endsWith('/') ? 'index.html' : '.html'), DIST);
  mkdirSync(new URL('./', file), { recursive: true });
  writeFileSync(file, html);
}

const howMeasured = `
<p>Stylish는 Chess.com·Lichess 아이디로 불러온 게임이나 붙여넣은 기보를 브라우저 안에서 분석합니다. 체스 엔진 <b>Stockfish 19</b>가 수마다 19가지 스타일 점수를 매기고,
사람의 실제 수를 학습한 신경망 <b>Maia3</b>가 "같은 레이팅의 사람이 이 수를 둘 확률"을 계산합니다. 4글자 유형은 그중 큰 스타일 8개와 Maia3 독창성으로 만든 네 개의 축으로 정해집니다.</p>
<p>각 축의 기준선은 감으로 정하지 않았습니다. 초보부터 고수까지 레이팅 구간별로 고른 Lichess 플레이어${calib.players ? ` ${calib.players}명` : ''}의 실제 게임을 같은 방식으로 분석해,
그 분포의 가운데를 기준으로 삼았습니다. 또 스타일은 실력에 따라 달라지기 때문에(예: 레이팅이 낮을수록 체크·잡기 같은 전술적인 수가 많음) <b>같은 레이팅의 플레이어들과 비교</b>합니다.
그래서 각 글자는 "비슷한 실력의 플레이어들 사이에서 어느 쪽에 가까운가"를 뜻하고, 초보든 고수든 16가지 유형이 모두 나옵니다. 정확한 판정을 위해 5판 이상, 가능하면 10판 이상을 분석하는 것을 권장합니다.</p>`;

const axesCardsIn = (lang) => `<div class="axes">${axesIn(lang).map((a) => `<div class="axis">
<div class="axis-q">${esc(a.question)}</div>
<div class="axis-pair"><span><b>${a.letters[0]}</b>${esc(a.names[0])}</span><i>vs</i><span><b>${a.letters[1]}</b>${esc(a.names[1])}</span></div>
<p><b>${a.letters[0]}</b> ${esc(a.desc[0])}</p><p><b>${a.letters[1]}</b> ${esc(a.desc[1])}</p></div>`).join('')}</div>`;
const axesCards = axesCardsIn('ko');

// ── 첫 화면 ──
write('/', page({
  path: '/', wide: true,
  title: '나는 어떤 체스 플레이어일까? — 체스 유형 16가지 | Stylish',
  description: 'Chess.com·Lichess 아이디만 넣으면 최근 게임을 분석해 4글자 체스 유형을 알려줍니다. Stockfish와 사람 수 예측 AI Maia3로 수마다 스타일과 함정수·도박수까지. 무료, 설치 없음.',
  body: `<section class="landing-hero">
<div class="hero-copy">
<p class="eyebrow">체스 유형 16가지</p>
<h1>나는 어떤<br />체스 플레이어일까?</h1>
<p class="lead">아이디만 넣으면 최근 게임을 분석해서 당신의 4글자 체스 유형을 알려드려요. 공격형인지, 수비형인지, 남들과 얼마나 다른 수를 두는지까지.</p>
${idForm()}
<p class="hero-sub">기보로 분석하거나 예시를 보고 싶다면 <a href="/app">분석 도구 열기</a></p>
</div>
<div class="hero-art" aria-hidden="true">
${['AWIO', 'ASIE', 'PWRO', 'PSRE'].map((c, i) => `<img class="art-${i}" src="/img/types/${c}-square.png" alt="" width="600" height="600" />`).join('')}
</div>
</section>
<section class="facts">
<div><b>${calib.players || 479}명</b><span>실제 Lichess 플레이어로 기준 보정</span></div>
<div><b>같은 레이팅끼리</b><span>초보든 고수든 16유형이 모두 나와요</span></div>
<div><b>Stockfish + Maia3</b><span>엔진 정확도에 사람 기준 판단까지</span></div>
<div><b>무료 · 설치 없음</b><span>분석은 내 브라우저 안에서만</span></div>
</section>
<section class="block">
<h2>16가지 체스 유형</h2>
<p class="section-lead">네 글자는 각각 무엇을 노리는지, 위험을 어떻게 대하는지, 누가 판을 끌고 가는지, 얼마나 남다른 수를 두는지를 뜻해요. 유형을 눌러 자세히 보세요.</p>
${typeGrid()}
</section>
<section class="block">
<h2>네 가지 축</h2>
${axesCards}
</section>
<section class="block">
<h2>이렇게 분석해요</h2>
<ol class="steps">
<li><b>아이디 입력</b><span>Chess.com이나 Lichess 아이디로 최근 게임을 불러와요. 기보를 붙여넣어도 돼요.</span></li>
<li><b>수마다 분석</b><span>Stockfish가 19가지 스타일 점수를 매기고, Maia3가 같은 레이팅의 사람이 그 수를 둘 확률을 계산해요.</span></li>
<li><b>유형과 해설</b><span>여러 판을 모아 4글자 유형, 닮은 유명 선수, 함정수·도박수, 놓친 기회를 보여줘요.</span></li>
</ol>
</section>
<section class="block">
<h2>자주 묻는 질문</h2>
<div class="faq">
<details><summary>몇 판을 분석해야 정확한가요?</summary><p>한 판만으로도 결과가 나오지만, 5판 이상부터 안정되고 10판이면 충분히 믿을 만해요. 화면에 확신도가 함께 표시돼요.</p></details>
<details><summary>초보도 할 수 있나요?</summary><p>네. 같은 레이팅의 플레이어들과 비교하기 때문에 실력과 상관없이 16가지 유형이 모두 나와요. 유형은 실력이 아니라 경향이에요.</p></details>
<details><summary>내 게임 기록이 서버로 가나요?</summary><p>아니요. 분석은 모두 방문자의 브라우저 안에서 이뤄져요. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 보세요.</p></details>
<details><summary>얼마나 걸리나요?</summary><p>한 판에 30초에서 몇 분, 여러 판 종합 분석은 판 수에 따라 몇 분 정도 걸려요. 처음 한 번은 사람 수 예측 모델(약 45MB)을 내려받아요.</p></details>
</div>
</section>
<section class="cta-band">
<h2>내 유형을 알아볼 시간이에요</h2>
${idForm('분석 시작')}
</section>
<script>
// 예전 공유 링크(/#g=…)는 분석 앱으로 넘긴다
if (location.hash.length > 1) location.replace('/app' + location.hash);
</script>`,
}));

// ── 유형 목록 ──
write('/types/', page({
  path: '/types/', active: 'types',
  title: '체스 유형 16가지 — 나는 어떤 체스 플레이어일까? | Stylish',
  description: '실제 게임 분석으로 알아보는 4글자 체스 유형 16가지. 공격/포지션, 난전/안전, 선공/대응, 독창/정석 네 가지 축으로 나의 체스 스타일을 알아보세요.',
  wide: true,
  body: `<section class="page-head">
<p class="eyebrow">체스 유형</p>
<h1>체스 유형 16가지</h1>
<p class="lead">당신의 게임에는 습관이 남아 있습니다. 무엇을 노리고, 위험을 어떻게 대하고, 누가 판을 끌고 가고, 얼마나 남다른 수를 두는지. 그 네 가지를 4글자로 요약한 것이 체스 유형입니다.</p>
${idForm()}
</section>
<section class="block">${typeGrid()}</section>
<section class="block"><h2>네 가지 축</h2>${axesCards}</section>
<section class="block prose"><h2>어떻게 측정하나요</h2>${howMeasured}
<h2>유형은 실력이 아닙니다</h2>
<p>어느 유형이 더 강하거나 약한 것은 아닙니다. 세계 챔피언들도 서로 전혀 다른 유형이었습니다. 유형은 "어떻게 이기고, 어떻게 지는가"의 경향이고, 내 유형을 알면 강점은 살리고 약점은 의식적으로 보완할 수 있습니다.
같은 사람도 시간 제한이나 상대에 따라 다른 유형이 나올 수 있으니, 여러 판을 모아 분석할수록 결과가 정확해집니다.</p></section>`,
}));

// ── 유형별 페이지 ──
for (const t of data.types) {
  const g = t.code.slice(0, 2);
  const group = data.groups[g];
  const opp = byCode[opposite(t.code)];
  const siblings = data.types.filter((x) => x.code.startsWith(g) && x.code !== t.code);
  const letters = data.axes.map((a, i) => {
    const which = t.code[i] === a.letters[0] ? 0 : 1;
    return `<div class="letter"><b>${t.code[i]}</b><strong>${esc(a.names[which])}</strong><span>${esc(a.desc[which])}</span></div>`;
  }).join('');
  write(`/types/${t.code}`, page({
    path: `/types/${t.code}`, active: 'types', image: `/img/types/${t.code}.png`,
    title: `${t.code} ${t.name}(${t.en}) — ${t.tagline} | 체스 유형 | Stylish`,
    description: `${t.code} ${t.name}: ${t.tagline}. ${t.summary.slice(0, 90)}…`,
    body: `<article class="type-page g-${g}">
<p class="crumbs"><a href="/types/">체스 유형</a> › ${esc(group.name)}</p>
<figure class="type-figure"><img class="type-hero" src="/img/types/${t.code}.png" alt="${t.code} ${esc(t.name)}: ${esc(t.tagline)}. 그림: ${esc(t.scene)}" width="1200" height="630" />
<figcaption><b>그림 설명</b> ${esc(t.scene)} <span>(흰 기물이 나, 검은 기물이 상대)</span></figcaption></figure>
<h1><span class="code">${t.code}</span> ${esc(t.name)} <small>${esc(t.en)}</small></h1>
<p class="tagline">${esc(t.tagline)}</p>
<div class="letters">${letters}</div>
<h2>${esc(t.name)}는 이런 플레이어입니다</h2>
<p class="lead">${esc(t.summary)}</p>
<h3>게임에서 보이는 특징</h3>${list(t.traits)}
<div class="cols">
<div class="card"><h3>강점</h3>${list(t.strengths)}</div>
<div class="card"><h3>약점</h3>${list(t.weaknesses)}</div>
</div>
${(examples[t.code] ?? []).length ? `<h2>실제 ${esc(t.name)} 플레이어의 수</h2>
<p>Stylish 기준을 만들 때 분석한 Lichess 플레이어(이름은 지움) 중 <b>${t.code}</b>로 판정된 사람들의 실제 게임에서 골랐어요. 흔한 되잡기나 누구나 두는 수는 빼고, 이 유형의 성향이 가장 잘 드러나는 수를 골랐어요.</p>
<div class="examples">${examples[t.code].map((e) => exampleCard(e, t)).join('')}</div>` : ''}
<h2>실력을 올리는 방법</h2>${list(t.tips)}
<h2>정반대 유형</h2>
<a class="opp-card g-${opp.code.slice(0, 2)}" href="/types/${opp.code}"><img src="/img/types/${opp.code}-square.png" alt="" width="600" height="600" loading="lazy" /><span><b>${opp.code} ${esc(opp.name)}</b>${esc(opp.tagline)}. 모든 글자가 반대인 유형이라, 이 유형을 상대할 때는 내 방식이 가장 잘 통하거나 가장 안 통할 수 있습니다.</span></a>
<h2>같은 ${esc(group.name)} 유형</h2>
<p>${esc(group.desc)}</p>
<div class="tiles">${siblings.map(tile).join('')}</div>
<div class="cta-band small"><h2>나는 정말 ${esc(t.name)}일까요?</h2><p>최근 게임으로 확인해 보세요.</p>${idForm()}</div>
<p class="muted">유형은 실력의 높낮이가 아니라 경향입니다. <a href="/types/">16가지 유형 전체 보기</a></p>
</article>`,
  }));
}

// ── 소개 ──
write('/about', page({
  path: '/about', active: 'about',
  title: 'Stylish 소개 — 체스 수의 스타일을 분석하는 무료 도구',
  description: 'Stylish는 체스 기보의 각 수가 공격적인지, 포지셔널인지, 함정수인지 분석하고 플레이어의 체스 유형을 알려주는 무료 오픈소스 웹사이트입니다.',
  body: `<div class="prose"><h1>Stylish 소개</h1>
<p class="lead">Stylish는 "이 수가 좋은 수인가"를 넘어 "이 수는 어떤 수인가"를 알려주는 체스 분석 도구입니다.</p>
<h2>무엇을 하나요</h2>
<ul>
<li><b>수마다 스타일 분석</b>: 공격적, 전술적, 포지셔널, 예방적, 수비적 등 19가지 스타일 점수</li>
<li><b>위험한 선택 판정</b>: 함정수, 도박수, 건전한 희생, 무리한 희생</li>
<li><b>사람 기준 판정</b>: 사람 수 예측 모델 Maia3로 "같은 레이팅의 사람이 이 수를 둘 확률"을 계산해, 함정과 도박을 실제 사람 기준으로 판단합니다</li>
<li><b>플레이어 성향</b>: 여러 판을 모아 4글자 <a href="/types/">체스 유형</a>, 닮은 유명 선수, 오프닝별 스타일을 보여줍니다</li>
<li><b>코치와 두기</b>: 봇과 두면서 매 수 평가와 조언을 받습니다</li>
</ul>
<h2>어떻게 동작하나요</h2>
${howMeasured}
<p>모든 계산은 방문자의 브라우저 안에서 이뤄집니다. 게임 기록이 Stylish 서버로 전송되지 않습니다. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 참고하세요.</p>
<h2>오픈소스</h2>
<p>Stylish는 GPLv3 오픈소스입니다. 소스 코드는 <a href="${REPO}" rel="noopener">GitHub</a>에서 볼 수 있습니다.
사용한 오픈소스: Stockfish 19(GPLv3), stockfish.js(GPLv3), Maia3(CSSLab, GPLv3), chessground(GPLv3), chess.js(BSD), onnxruntime-web(MIT), Lichess 오프닝 목록(CC0).</p>
<h2>문의</h2>
<p>버그 제보, 제안, 그 밖의 문의는 <a href="/contact">문의 페이지</a>를 이용해 주세요.</p></div>`,
}));

// ── 문의 ──
write('/contact', page({
  path: '/contact', active: 'contact',
  title: '문의 | Stylish',
  description: 'Stylish 체스 스타일 분석 사이트에 대한 버그 제보, 제안, 개인정보, 광고 관련 문의 방법.',
  body: `<div class="prose"><h1>문의</h1>
<p class="lead">버그, 제안, 개인정보, 광고 등 어떤 내용이든 편하게 남겨 주세요.</p>
<div class="card">
<h3>문의 양식</h3>
<p>로그인 없이 보낼 수 있습니다. 답장이 필요하면 양식에 연락처를 남겨 주세요.</p>
<p><a class="btn" href="${CONTACT_FORM}" rel="noopener">문의 양식 열기</a></p>
</div>
<div class="card">
<h3>버그 제보와 기능 제안 (GitHub)</h3>
<p>GitHub 계정이 있다면 <a href="${REPO}/issues" rel="noopener">GitHub Issues</a>에 남겨 주셔도 됩니다. 어떤 기보에서 문제가 생겼는지 함께 적어 주시면 빠르게 확인할 수 있습니다.</p>
</div>
<p class="muted">개인정보 관련 요청은 문의 양식에서 '개인정보' 유형을 골라 주세요.</p></div>`,
}));

// ── 개인정보처리방침 ──
write('/privacy', page({
  path: '/privacy',
  title: '개인정보처리방침 | Stylish',
  description: 'Stylish 체스 스타일 분석 사이트의 개인정보처리방침. 수집하는 정보, 쿠키와 광고, 브라우저 저장소, 문의 방법.',
  body: `<div class="prose"><h1>개인정보처리방침</h1>
<p class="muted">시행일: ${UPDATED}</p>
<p>Stylish(이하 "사이트")는 방문자의 개인정보를 소중히 다루며, 필요한 최소한의 정보만 처리합니다. 사이트는 회원가입이 없고, 게임 분석은 방문자의 브라우저 안에서 이뤄집니다.</p>
<h2>1. 사이트가 직접 수집하는 정보</h2>
<p>사이트는 이름, 이메일, 전화번호 같은 개인정보를 직접 수집하거나 서버에 저장하지 않습니다. 붙여넣은 기보와 분석 결과는 사이트 서버로 전송되지 않습니다.</p>
<h2>2. 브라우저에 저장되는 정보</h2>
<p>다시 방문했을 때 빠르게 보여주기 위해 다음 정보를 <b>방문자의 브라우저 안에만</b> 저장합니다. 사이트 운영자는 이 정보에 접근할 수 없으며, 브라우저 설정에서 사이트 데이터를 지우면 함께 삭제됩니다.</p>
<ul>
<li>분석 결과 캐시 (IndexedDB)</li>
<li>프로필 메뉴의 플레이어 성향 요약, 입력 중이던 기보 (localStorage)</li>
<li>사람 수 예측 모델 파일 (Cache Storage, 약 45MB)</li>
</ul>
<h2>3. 외부 서비스로 전송되는 정보</h2>
<ul>
<li><b>Chess.com·Lichess</b>: 아이디로 게임을 불러올 때, 방문자의 브라우저가 입력한 아이디로 해당 사이트의 공개 API에 직접 요청합니다. 각 사이트의 개인정보처리방침이 적용됩니다.</li>
<li><b>Cloudflare</b>: 사이트 호스팅 업체로, 서비스 제공과 보안을 위해 접속 기록(IP 주소, 브라우저 정보 등)을 처리할 수 있습니다.</li>
<li><b>Cloudflare Web Analytics</b>: 방문자 수와 많이 본 페이지 같은 통계를 보기 위해 사용합니다. 쿠키를 쓰지 않으며 개인을 식별할 수 있는 정보를 모으지 않습니다.</li>
<li><b>Google Forms</b>: 문의 양식을 이용하면 입력한 내용이 Google Forms에 저장됩니다. 연락처는 선택 항목입니다.</li>
</ul>
<h2>4. 광고와 쿠키 (Google AdSense)</h2>
<p>사이트는 운영비 마련을 위해 Google AdSense 광고를 게재합니다.</p>
<ul>
<li>Google을 포함한 제3자 광고 업체는 쿠키를 사용해 방문자가 이 사이트나 다른 웹사이트를 이전에 방문한 기록을 바탕으로 광고를 게재합니다.</li>
<li>Google은 광고 쿠키를 사용해 방문자의 이 사이트 및 다른 사이트 방문 기록을 바탕으로 광고를 게재할 수 있습니다.</li>
<li>방문자는 <a href="https://www.google.com/settings/ads" rel="noopener">Google 광고 설정</a>에서 맞춤 광고를 해제할 수 있으며, <a href="https://www.aboutads.info/choices/" rel="noopener">aboutads.info</a>에서 다른 제3자 업체의 맞춤 광고 쿠키도 해제할 수 있습니다.</li>
<li>Google의 데이터 사용 방식은 <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">Google 파트너 사이트 정책</a>에서 확인할 수 있습니다.</li>
<li>유럽 경제 지역, 영국, 스위스 방문자에게는 Google의 동의 관리 도구를 통해 동의 여부를 묻습니다.</li>
</ul>
<h2>5. 아동의 개인정보</h2>
<p>사이트는 아동을 대상으로 개인정보를 수집하지 않습니다.</p>
<h2>6. 방침의 변경</h2>
<p>이 방침이 바뀌면 이 페이지에 변경 내용과 시행일을 게시합니다.</p>
<h2>7. 문의</h2>
<p>개인정보와 관련한 문의나 요청은 <a href="/contact">문의 페이지</a>의 문의 양식에서 '개인정보' 유형을 골라 보내 주세요.</p></div>`,
}));

// ═══════════════ 영어 페이지 (/en/) ═══════════════
const howMeasuredEn = `
<p>Stylish analyzes games you load from Chess.com or Lichess (or paste as PGN) right inside your browser. The chess engine <b>Stockfish 19</b> scores every move on 19 styles,
and <b>Maia3</b>, a neural network trained on real human moves, estimates how likely a human at the same rating is to play each move. Your 4-letter type comes from four axes built from the 8 main styles plus Maia3 originality.</p>
<p>The cutoffs weren't guessed. We analyzed real games from ${calib.players || 479} Lichess players chosen across rating bands, from beginners to masters, the same way, and used the middle of that distribution.
Because style changes with strength (lower-rated players play more checks and captures, for example), <b>you are compared with players at your own rating</b>.
So each letter means "which side you lean toward among players of similar strength", and beginners and masters alike get all 16 types. For an accurate result we recommend 5 or more games, ideally 10.</p>`;

write('/en/', page({
  path: '/', wide: true, lang: 'en',
  title: 'What kind of chess player are you? 16 chess personality types | Stylish',
  description: 'Enter your Chess.com or Lichess username and get your 4-letter chess type from your recent games. Stockfish plus the human-move AI Maia3 label every move\'s style, traps and gambles. Free, no sign-up.',
  body: `<section class="landing-hero">
<div class="hero-copy">
<p class="eyebrow">16 chess types</p>
<h1>What kind of<br />chess player are you?</h1>
<p class="lead">Enter your username and we'll analyze your recent games and tell you your 4-letter chess type. Attacker or defender, and how different your moves are from everyone else's.</p>
${idForm('Find my type', 'en')}
<p class="hero-sub">Want to analyze a PGN or try an example? <a href="${APP('en')}">Open the analysis tool</a></p>
</div>
<div class="hero-art" aria-hidden="true">
${['AWIO', 'ASIE', 'PWRO', 'PSRE'].map((c, i) => `<img class="art-${i}" src="${IMG('en', `${c}-square.png`)}" alt="" width="600" height="600" />`).join('')}
</div>
</section>
<section class="facts">
<div><b>${calib.players || 479} players</b><span>Cutoffs calibrated on real Lichess players</span></div>
<div><b>Same-rating comparison</b><span>All 16 types at every level</span></div>
<div><b>Stockfish + Maia3</b><span>Engine accuracy plus human judgment</span></div>
<div><b>Free, no install</b><span>Runs only in your browser</span></div>
</section>
<section class="block">
<h2>The 16 chess types</h2>
<p class="section-lead">The four letters describe what you aim for, how you treat risk, who drives the game, and how unusual your moves are. Tap a type to learn more.</p>
${typeGrid('en')}
</section>
<section class="block">
<h2>The four axes</h2>
${axesCardsIn('en')}
</section>
<section class="block">
<h2>How it works</h2>
<ol class="steps">
<li><b>Enter your username</b><span>Load your recent games from Chess.com or Lichess. You can also paste a PGN.</span></li>
<li><b>Every move is analyzed</b><span>Stockfish scores 19 styles, and Maia3 estimates how likely a human at your rating is to play each move.</span></li>
<li><b>Your type and insights</b><span>Across several games you get your 4-letter type, similar famous players, traps and gambles, and missed chances.</span></li>
</ol>
</section>
<section class="block">
<h2>FAQ</h2>
<div class="faq">
<details><summary>How many games do I need?</summary><p>One game gives a result, but it becomes stable from about 5 games, and 10 games is reliable. Each axis shows a confidence bar.</p></details>
<details><summary>Does it work for beginners?</summary><p>Yes. You're compared with players at your own rating, so all 16 types appear at every level. A type describes tendencies, not strength.</p></details>
<details><summary>Are my games uploaded anywhere?</summary><p>No. All analysis happens inside your browser. See the <a href="/en/privacy">privacy policy</a> for details.</p></details>
<details><summary>How long does it take?</summary><p>From 30 seconds to a few minutes per game; a multi-game analysis takes a few minutes. The first time, the human-move model (about 45 MB) is downloaded once.</p></details>
</div>
</section>
<section class="cta-band">
<h2>Time to find your type</h2>
${idForm('Start', 'en')}
</section>`,
}));

write('/en/types/', page({
  path: '/types/', active: 'types', wide: true, lang: 'en',
  title: 'The 16 chess personality types | Stylish',
  description: 'Sixteen 4-letter chess types based on real game analysis. Attack/Position, Wild/Safe, Initiative/Reactive, Original/Expected: find out your chess style.',
  body: `<section class="page-head">
<p class="eyebrow">Chess types</p>
<h1>The 16 chess types</h1>
<p class="lead">Your games carry your habits: what you aim for, how you treat risk, who drives the game, how unusual your moves are. A chess type sums up those four things in four letters.</p>
${idForm('Find my type', 'en')}
</section>
<section class="block">${typeGrid('en')}</section>
<section class="block"><h2>The four axes</h2>${axesCardsIn('en')}</section>
<section class="block prose"><h2>How is it measured?</h2>${howMeasuredEn}
<h2>A type is not a skill level</h2>
<p>No type is stronger or weaker than another. World champions have had completely different types. A type describes how you tend to win and lose; knowing it lets you lean on your strengths and work on your weak spots deliberately.
The same person can come out differently depending on time control or opponent, so the more games you analyze, the more accurate the result.</p></section>`,
}));

for (const base of data.types) {
  const t = typeIn(base, 'en');
  const g = t.code.slice(0, 2);
  const group = groupIn(g, 'en');
  const opp = typeIn(byCode[opposite(t.code)], 'en');
  const siblings = data.types.filter((x) => x.code.startsWith(g) && x.code !== t.code).map((x) => typeIn(x, 'en'));
  const letters = axesIn('en').map((a, i) => {
    const which = t.code[i] === a.letters[0] ? 0 : 1;
    return `<div class="letter"><b>${t.code[i]}</b><strong>${esc(a.names[which])}</strong><span>${esc(a.desc[which])}</span></div>`;
  }).join('');
  write(`/en/types/${t.code}`, page({
    path: `/types/${t.code}`, active: 'types', image: IMG('en', `${t.code}.png`), lang: 'en',
    title: `${t.code} The ${t.name}: ${t.tagline} | Chess types | Stylish`,
    description: `${t.code} The ${t.name}: ${t.tagline}. ${t.summary.slice(0, 110)}…`,
    body: `<article class="type-page g-${g}">
<p class="crumbs"><a href="/en/types/">Chess types</a> › ${esc(group.name)}</p>
<figure class="type-figure"><img class="type-hero" src="${IMG('en', `${t.code}.png`)}" alt="${t.code} The ${esc(t.name)}: ${esc(t.tagline)}. Picture: ${esc(t.scene)}" width="1200" height="630" />
<figcaption><b>The picture</b> ${esc(t.scene)} <span>(white pieces are you, black pieces are the opponent)</span></figcaption></figure>
<h1><span class="code">${t.code}</span> The ${esc(t.name)}</h1>
<p class="tagline">${esc(t.tagline)}</p>
<div class="letters">${letters}</div>
<h2>What a ${esc(t.name)} is like</h2>
<p class="lead">${esc(t.summary)}</p>
<h3>What shows up in their games</h3>${list(t.traits)}
<div class="cols">
<div class="card"><h3>Strengths</h3>${list(t.strengths)}</div>
<div class="card"><h3>Weaknesses</h3>${list(t.weaknesses)}</div>
</div>
${(examples[t.code] ?? []).length ? `<h2>Real moves by ${esc(t.name)} players</h2>
<p>Picked from real games of Lichess players (names removed) that Stylish classified as <b>${t.code}</b> when building its cutoffs. Routine recaptures and moves everyone plays were skipped in favor of moves that show the style most clearly.</p>
<div class="examples">${examples[t.code].map((e) => exampleCard(e, t, 'en')).join('')}</div>` : ''}
<h2>How to improve</h2>${list(t.tips)}
<h2>The opposite type</h2>
<a class="opp-card g-${opp.code.slice(0, 2)}" href="/en/types/${opp.code}"><img src="${IMG('en', `${opp.code}-square.png`)}" alt="" width="600" height="600" loading="lazy" /><span><b>${opp.code} The ${esc(opp.name)}</b>${esc(opp.tagline)}. Every letter is reversed, so against this type your style either works best or not at all.</span></a>
<h2>Other ${esc(group.name)}</h2>
<p>${esc(group.desc)}</p>
<div class="tiles">${siblings.map((x) => tile(x, 'en')).join('')}</div>
<div class="cta-band small"><h2>Are you really a ${esc(t.name)}?</h2><p>Check with your recent games.</p>${idForm('Find my type', 'en')}</div>
<p class="muted">A type describes tendencies, not skill level. <a href="/en/types/">See all 16 types</a></p>
</article>`,
  }));
}

write('/en/about', page({
  path: '/about', active: 'about', lang: 'en',
  title: 'About Stylish: a free tool that analyzes the style of chess moves',
  description: 'Stylish analyzes whether each chess move is aggressive, positional, a trap or a gamble, and tells you your chess personality type. Free and open source.',
  body: `<div class="prose"><h1>About Stylish</h1>
<p class="lead">Stylish goes beyond "is this a good move?" and tells you "what kind of move is this?"</p>
<h2>What it does</h2>
<ul>
<li><b>Style of every move</b>: 19 style scores such as aggressive, tactical, positional, prophylactic and defensive</li>
<li><b>Risky choices</b>: traps, gambles, sound sacrifices and speculative sacrifices</li>
<li><b>Human-based judgment</b>: the human-move model Maia3 estimates how likely a human at your rating is to play a move, so traps and gambles are judged by real human standards</li>
<li><b>Player profile</b>: across several games you get your 4-letter <a href="/en/types/">chess type</a>, similar famous players and style by opening</li>
<li><b>Play the coach</b>: play a bot and get feedback on every move</li>
</ul>
<h2>How it works</h2>
${howMeasuredEn}
<p>Everything runs inside your browser. Your games are never sent to a Stylish server. See the <a href="/en/privacy">privacy policy</a> for details.</p>
<h2>Open source</h2>
<p>Stylish is GPLv3 open source. The source code is on <a href="${REPO}" rel="noopener">GitHub</a>.
Open source used: Stockfish 19 (GPLv3), stockfish.js (GPLv3), Maia3 (CSSLab, GPLv3), chessground (GPLv3), chess.js (BSD), onnxruntime-web (MIT), Lichess chess-openings (CC0).</p>
<h2>Contact</h2>
<p>For bug reports, suggestions or anything else, use the <a href="/en/contact">contact page</a>.</p></div>`,
}));

write('/en/contact', page({
  path: '/contact', active: 'contact', lang: 'en',
  title: 'Contact | Stylish',
  description: 'How to report bugs, make suggestions, or ask about privacy or advertising on Stylish, the chess style analysis site.',
  body: `<div class="prose"><h1>Contact</h1>
<p class="lead">Bugs, suggestions, privacy, advertising: feel free to reach out about anything.</p>
<div class="card">
<h3>Contact form</h3>
<p>No sign-in needed. If you'd like a reply, leave a way to reach you in the form.</p>
<p><a class="btn" href="${CONTACT_FORM}" rel="noopener">Open the contact form</a></p>
</div>
<div class="card">
<h3>Bug reports and feature requests (GitHub)</h3>
<p>If you have a GitHub account, you can also open an issue on <a href="${REPO}/issues" rel="noopener">GitHub Issues</a>. Including the game where the problem happened helps a lot.</p>
</div>
<p class="muted">For privacy requests, choose "Privacy" as the type in the form.</p></div>`,
}));

write('/en/privacy', page({
  path: '/privacy', lang: 'en',
  title: 'Privacy policy | Stylish',
  description: 'Privacy policy of Stylish, the chess style analysis site: what is collected, cookies and ads, browser storage, and how to contact us.',
  body: `<div class="prose"><h1>Privacy policy</h1>
<p class="muted">Effective: ${UPDATED}</p>
<p>Stylish (the "site") takes your privacy seriously and processes only the minimum necessary. There are no accounts, and game analysis happens inside your browser.</p>
<h2>1. Information the site collects directly</h2>
<p>The site does not collect or store personal information such as names, email addresses or phone numbers. Pasted games and analysis results are not sent to a site server.</p>
<h2>2. Information stored in your browser</h2>
<p>To show results faster on your next visit, the following is stored <b>only in your browser</b>. The operator cannot access it, and it is deleted when you clear site data in your browser settings.</p>
<ul>
<li>Cached analysis results (IndexedDB)</li>
<li>Player style summaries in the profile menu and the game you were typing (localStorage)</li>
<li>The human-move model file (Cache Storage, about 45 MB)</li>
</ul>
<h2>3. Information sent to other services</h2>
<ul>
<li><b>Chess.com and Lichess</b>: when you load games by username, your browser sends that username directly to the site's public API. Their privacy policies apply.</li>
<li><b>Cloudflare</b>: our hosting provider may process access logs (IP address, browser information, etc.) to provide the service and for security.</li>
<li><b>Cloudflare Web Analytics</b>: used to see statistics such as visitor counts and popular pages. It does not use cookies and does not collect personally identifiable information.</li>
<li><b>Google Forms</b>: if you use the contact form, what you enter is stored in Google Forms. Contact details are optional.</li>
</ul>
<h2>4. Ads and cookies (Google AdSense)</h2>
<p>The site shows Google AdSense ads to cover running costs.</p>
<ul>
<li>Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites.</li>
<li>Google's use of advertising cookies enables it and its partners to serve ads based on your visits to this site and/or other sites on the Internet.</li>
<li>You can opt out of personalized advertising in <a href="https://www.google.com/settings/ads" rel="noopener">Google Ads Settings</a>, and opt out of other third-party vendors' cookies at <a href="https://www.aboutads.info/choices/" rel="noopener">aboutads.info</a>.</li>
<li>See <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">how Google uses data from partner sites</a>.</li>
<li>Visitors from the European Economic Area, the UK and Switzerland are asked for consent through Google's consent management tool.</li>
</ul>
<h2>5. Children's privacy</h2>
<p>The site does not knowingly collect personal information from children.</p>
<h2>6. Changes to this policy</h2>
<p>If this policy changes, the changes and the new effective date will be posted on this page.</p>
<h2>7. Contact</h2>
<p>For privacy questions or requests, use the form on the <a href="/en/contact">contact page</a> and choose "Privacy" as the type.</p></div>`,
}));

// ── 사이트맵·robots ──
const koPaths = ['/', '/types/', ...data.types.map((t) => `/types/${t.code}`), '/app', '/about', '/contact', '/privacy'];
const paths = [...koPaths, ...koPaths.filter((p) => p !== '/app').map((p) => P('en', p))];
writeFileSync(new URL('sitemap.xml', DIST), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`정적 페이지 ${paths.length - 1}개, sitemap.xml(앱 포함 ${paths.length}개 주소), robots.txt`);
