// 정적 페이지 만들기 (vite build 뒤에 실행): 체스 유형 소개 16개 + 유형 목록, 개인정보처리방침, 문의, 사이트맵.
// 검색엔진과 광고 심사가 읽을 수 있도록 자바스크립트 없이 보이는 HTML로 만든다. 내용은 src/data/chess-types.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL ?? 'https://stylish-chess-engine.pages.dev').replace(/\/$/, '');
const ADSENSE = 'ca-pub-8762647584529985';
const CONTACT_FORM = 'https://forms.gle/d9PbZSYZKkzpykgq8';
const REPO = 'https://github.com/Vamp-pire/stylish-chess-engine';
const UPDATED = '2026-10-11';

const DIST = new URL('../dist/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('../src/data/chess-types.json', import.meta.url), 'utf8'));
const calib = JSON.parse(readFileSync(new URL('../src/data/type-calib.json', import.meta.url), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const list = (xs) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const opposite = (code) => [...code].map((c, i) => { const l = data.axes[i].letters; return c === l[0] ? l[1] : l[0]; }).join('');
const byCode = Object.fromEntries(data.types.map((t) => [t.code, t]));

function page({ path, title, description, body, active = '' }) {
  const url = `${SITE}${path}`;
  const nav = [['/', '분석하기', 'cta'], ['/types/', '체스 유형', 'types'], ['/about', '소개', 'about'], ['/contact', '문의', 'contact']]
    .map(([href, label, key]) => `<a href="${href}" class="${key === 'cta' ? 'cta' : ''}${key === active ? ' active' : ''}">${label}</a>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Stylish" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>♞</text></svg>" />
<link rel="stylesheet" href="/pages.css" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
</head>
<body>
<header class="topbar"><a class="brand" href="/">♞ Stylish<em>.</em></a><nav>${nav}</nav></header>
<main>
${body}
</main>
<footer>
<a href="/types/">체스 유형</a><a href="/about">소개</a><a href="/privacy">개인정보처리방침</a><a href="/contact">문의</a>
<p>Stylish는 <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GPLv3</a> 오픈소스입니다. 분석 엔진 Stockfish 19, 사람 수 예측 Maia3(CSSLab), 보드 chessground. 모든 분석은 방문자의 브라우저 안에서 이뤄집니다.</p>
</footer>
</body>
</html>
`;
}

function write(path, html) {
  const file = new URL(path.replace(/^\//, '') + (path.endsWith('/') ? 'index.html' : '.html'), DIST);
  mkdirSync(new URL('./', file), { recursive: true });
  writeFileSync(file, html);
}

const howMeasured = `
<p>Stylish는 Chess.com·Lichess 아이디로 불러온 게임이나 붙여넣은 기보를 브라우저 안에서 분석합니다. 체스 엔진 <b>Stockfish 19</b>가 수마다 19가지 스타일 점수를 매기고,
사람의 실제 수를 학습한 신경망 <b>Maia3</b>가 "같은 레이팅의 사람이 이 수를 둘 확률"을 계산합니다. 4글자 유형은 그중 큰 스타일 8개와 Maia3 독창성으로 만든 네 개의 축으로 정해집니다.</p>
<p>각 축의 기준선은 감으로 정하지 않았습니다. 초보부터 고수까지 레이팅 구간별로 고른 Lichess 플레이어${calib.players ? ` ${calib.players}명` : ''}의 실제 게임을 같은 방식으로 분석해,
그 분포의 가운데를 기준으로 삼았습니다. 그래서 각 글자는 "실제 플레이어들 사이에서 어느 쪽에 가까운가"를 뜻합니다. 정확한 판정을 위해 5판 이상, 가능하면 10판 이상을 분석하는 것을 권장합니다.</p>`;

const axesTable = `<table><thead><tr><th>축</th><th>글자</th><th>뜻</th></tr></thead><tbody>${data.axes.map((a) =>
  `<tr><td>${esc(a.question)}</td><td class="code">${a.letters[0]} / ${a.letters[1]}</td><td><b>${a.letters[0]} ${esc(a.names[0])}</b>: ${esc(a.desc[0])}<br><b>${a.letters[1]} ${esc(a.names[1])}</b>: ${esc(a.desc[1])}</td></tr>`).join('')}</tbody></table>`;

// ── 유형 목록 ──
const groupSection = (g) => {
  const info = data.groups[g];
  const tiles = data.types.filter((t) => t.code.startsWith(g)).map((t) =>
    `<a class="type-tile g-${g}" href="/types/${t.code}"><span class="code">${t.code}</span><span class="nm">${esc(t.name)}</span><p>${esc(t.tagline)}</p></a>`).join('');
  return `<h2 class="g-${g}" style="color:var(--group)">${esc(info.name)} <span class="muted">${esc(info.en)} · ${g[0]}${g[1]}</span></h2><p>${esc(info.desc)}</p><div class="grid">${tiles}</div>`;
};
write('/types/', page({
  path: '/types/', active: 'types',
  title: '체스 유형 16가지 — 나는 어떤 체스 플레이어일까? | Stylish',
  description: '실제 게임 분석으로 알아보는 4글자 체스 유형 16가지. 공격/포지션, 난전/안전, 선공/대응, 독창/정석 네 가지 축으로 나의 체스 스타일을 알아보세요.',
  body: `<h1>체스 유형 16가지</h1>
<p class="lead">당신의 게임에는 습관이 남아 있습니다. 무엇을 노리고, 위험을 어떻게 대하고, 누가 판을 끌고 가고, 얼마나 남다른 수를 두는지. 그 네 가지를 4글자로 요약한 것이 체스 유형입니다.</p>
<div class="card cta-box"><p>내 최근 게임으로 바로 알아보기</p><a class="btn" href="/">내 체스 유형 분석하기</a></div>
<h2>네 가지 축</h2>${axesTable}
<h2>어떻게 측정하나요</h2>${howMeasured}
${['AW', 'AS', 'PW', 'PS'].map(groupSection).join('\n')}
<h2>유형은 실력이 아닙니다</h2>
<p>어느 유형이 더 강하거나 약한 것은 아닙니다. 세계 챔피언들도 서로 전혀 다른 유형이었습니다. 유형은 "어떻게 이기고, 어떻게 지는가"의 경향이고, 내 유형을 알면 강점은 살리고 약점은 의식적으로 보완할 수 있습니다.
같은 사람도 시간 제한이나 상대에 따라 다른 유형이 나올 수 있으니, 여러 판을 모아 분석할수록 결과가 정확해집니다.</p>`,
}));

// ── 유형별 페이지 ──
for (const t of data.types) {
  const g = t.code.slice(0, 2);
  const group = data.groups[g];
  const opp = byCode[opposite(t.code)];
  const siblings = data.types.filter((x) => x.code.startsWith(g) && x.code !== t.code);
  const letters = data.axes.map((a, i) => {
    const which = t.code[i] === a.letters[0] ? 0 : 1;
    return `<div class="letter"><b>${t.code[i]}</b><strong>${esc(a.names[which])}</strong><br><span>${esc(a.desc[which])}</span></div>`;
  }).join('');
  write(`/types/${t.code}`, page({
    path: `/types/${t.code}`, active: 'types',
    title: `${t.code} ${t.name}(${t.en}) — ${t.tagline} | 체스 유형 | Stylish`,
    description: `${t.code} ${t.name}: ${t.tagline}. ${t.summary.slice(0, 90)}…`,
    body: `<div class="hero g-${g}">
<span class="chip">${esc(group.name)} · ${esc(group.en)}</span>
<div class="code">${t.code}</div>
<div class="name">${esc(t.name)}<span class="en">${esc(t.en)}</span></div>
<p class="tagline">${esc(t.tagline)}</p>
</div>
<div class="g-${g}"><div class="letters">${letters}</div></div>
<h2>${esc(t.name)}는 이런 플레이어입니다</h2>
<p class="lead">${esc(t.summary)}</p>
<h3>게임에서 보이는 특징</h3>${list(t.traits)}
<div class="cols">
<div class="card"><h3>강점</h3>${list(t.strengths)}</div>
<div class="card"><h3>약점</h3>${list(t.weaknesses)}</div>
</div>
<h2>실력을 올리는 방법</h2>${list(t.tips)}
<h2>정반대 유형</h2>
<p><a href="/types/${opp.code}"><b>${opp.code} ${esc(opp.name)}</b></a>: ${esc(opp.tagline)}. 모든 글자가 반대인 유형이라, 이 유형을 상대할 때는 내 방식이 가장 잘 통하거나 가장 안 통할 수 있습니다.</p>
<h2>같은 ${esc(group.name)} 유형</h2>
<p>${esc(group.desc)}</p>
<div class="grid">${siblings.map((x) => `<a class="type-tile g-${g}" href="/types/${x.code}"><span class="code">${x.code}</span><span class="nm">${esc(x.name)}</span><p>${esc(x.tagline)}</p></a>`).join('')}</div>
<div class="card cta-box"><p>나는 정말 ${esc(t.name)}일까요? 최근 게임으로 확인해 보세요.</p><a class="btn" href="/">내 체스 유형 분석하기</a></div>
<p class="muted">유형은 실력의 높낮이가 아니라 경향입니다. <a href="/types/">16가지 유형 전체 보기</a></p>`,
  }));
}

// ── 소개 ──
write('/about', page({
  path: '/about', active: 'about',
  title: 'Stylish 소개 — 체스 수의 스타일을 분석하는 무료 도구',
  description: 'Stylish는 체스 기보의 각 수가 공격적인지, 포지셔널인지, 함정수인지 분석하고 플레이어의 체스 유형을 알려주는 무료 오픈소스 웹사이트입니다.',
  body: `<h1>Stylish 소개</h1>
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
<p>버그 제보, 제안, 그 밖의 문의는 <a href="/contact">문의 페이지</a>를 이용해 주세요.</p>`,
}));

// ── 문의 ──
write('/contact', page({
  path: '/contact', active: 'contact',
  title: '문의 | Stylish',
  description: 'Stylish 체스 스타일 분석 사이트에 대한 버그 제보, 제안, 개인정보, 광고 관련 문의 방법.',
  body: `<h1>문의</h1>
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
<p class="muted">개인정보 관련 요청은 문의 양식에서 '개인정보' 유형을 골라 주세요.</p>`,
}));

// ── 개인정보처리방침 ──
write('/privacy', page({
  path: '/privacy',
  title: '개인정보처리방침 | Stylish',
  description: 'Stylish 체스 스타일 분석 사이트의 개인정보처리방침. 수집하는 정보, 쿠키와 광고, 브라우저 저장소, 문의 방법.',
  body: `<h1>개인정보처리방침</h1>
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
<p>개인정보와 관련한 문의나 요청은 <a href="/contact">문의 페이지</a>의 문의 양식에서 '개인정보' 유형을 골라 보내 주세요.</p>`,
}));

// ── 사이트맵·robots ──
const paths = ['/', '/types/', ...data.types.map((t) => `/types/${t.code}`), '/about', '/contact', '/privacy'];
writeFileSync(new URL('sitemap.xml', DIST), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`정적 페이지 ${paths.length - 1}개, sitemap.xml, robots.txt`);
