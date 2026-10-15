// 유형 궁합 페이지(16유형 쌍 136개)와 유형별 어울리는 오프닝. scripts/build-pages.mjs가 불러 쓴다.
// 오프닝은 미리 분석한 public/opening-styles.json(lichess-org/chess-openings, CC0)의 스타일로 유형 축과 맞춘다.
import { readFileSync } from 'node:fs';

const OS = JSON.parse(readFileSync(new URL('../public/opening-styles.json', import.meta.url), 'utf8'));

const STYLE_LABEL = {
  aggressive: ['공격적', 'aggressive'], tactical: ['전술적', 'tactical'], initiative: ['주도권', 'initiative'], counterattack: ['반격', 'counterattack'],
  positional: ['포지셔널', 'positional'], prophylactic: ['예방', 'prophylactic'], restriction: ['조이기', 'restriction'], active: ['활동적', 'active'],
  space: ['공간', 'space'], tension: ['긴장 유지', 'tension'], solid: ['안정적', 'solid'], defensive: ['수비적', 'defensive'],
  simplifying: ['단순화', 'simplifying'], complicating: ['복잡화', 'complicating'], quiet: ['조용한 수', 'quiet'], waiting: ['대기', 'waiting'],
  practical: ['실전적', 'practical'], kingActivity: ['킹 활용', 'king activity'], passedPawn: ['통과폰', 'passed pawn'],
};

// ───────────── 유형별 어울리는 오프닝 ─────────────
const K = OS.keys;
const idx = (k) => K.indexOf(k);
/** 색별로 키마다 (점수 − 평균)의 표준편차 → 표준점수 */
function prep(color) {
  const ci = color === 'w' ? 0 : 1;
  const rows = [];
  for (const [key, sides] of Object.entries(OS.styles)) {
    const x = sides[ci];
    if (!x || x[0] < 4) continue; // 수순이 너무 짧으면 성향이 안 드러난다
    const [eco, name] = key.split('\t');
    const gap = K.map((k, i) => (x[1][i] ?? 0) - (OS.mean?.[color]?.[i] ?? 0));
    rows.push({ eco, name, gap, gambit: !!x[3], moves: x[0] });
  }
  const sd = K.map((_, i) => Math.sqrt(rows.reduce((s, r) => s + r.gap[i] ** 2, 0) / (rows.length || 1)) || 1);
  for (const r of rows) r.z = r.gap.map((g, i) => g / sd[i]);
  return rows;
}
const ROWS = { w: prep('w'), b: prep('b') };
const zz = (r, k) => (idx(k) >= 0 ? r.z[idx(k)] : 0);
const axisScores = (r) => ({
  A: zz(r, 'aggressive') + zz(r, 'tactical') - zz(r, 'positional') - zz(r, 'space'),
  W: zz(r, 'complicating') + zz(r, 'tension') + (r.gambit ? 1.5 : 0) - zz(r, 'solid') - zz(r, 'simplifying'),
  I: zz(r, 'initiative') + zz(r, 'active') - zz(r, 'defensive') - zz(r, 'counterattack'),
});

/** 잘 알려진 오프닝 계열만 추천한다 (이름 앞부분으로 찾음). w = 백이 고르는 오프닝, b = 흑이 고르는 방어 */
const FAMILIES = {
  w: [
    ['Italian Game', 'Italian Game: Giuoco'], ['Evans Gambit', 'Italian Game: Evans Gambit'], ['Ruy Lopez', 'Ruy Lopez'], ['Scotch Game', 'Scotch Game'],
    ["King's Gambit", "King's Gambit"], ['Vienna Game', 'Vienna Game'], ['Danish Gambit', 'Danish Gambit'], ['Four Knights Game', 'Four Knights Game'],
    ["Bishop's Opening", "Bishop's Opening"], ['Ponziani Opening', 'Ponziani Opening'], ['Smith-Morra Gambit', 'Sicilian Defense: Smith-Morra Gambit'],
    ["Queen's Gambit", "Queen's Gambit"], ['London System', "Queen's Pawn Game: London System"], ['Catalan Opening', 'Catalan Opening'],
    ['English Opening', 'English Opening'], ['Réti Opening', 'Zukertort Opening'], ["King's Indian Attack", "King's Indian Attack"],
    ['Bird Opening', 'Bird Opening'], ['Trompowsky Attack', 'Trompowsky Attack'], ['Colle System', "Queen's Pawn Game: Colle System"],
    ['Blackmar-Diemer Gambit', 'Blackmar-Diemer Gambit'],
  ],
  b: [
    ['Sicilian Defense', 'Sicilian Defense'], ['French Defense', 'French Defense'], ['Caro-Kann Defense', 'Caro-Kann Defense'],
    ['Scandinavian Defense', 'Scandinavian Defense'], ['Pirc Defense', 'Pirc Defense'], ['Modern Defense', 'Modern Defense'], ['Alekhine Defense', 'Alekhine Defense'],
    ["Petrov's Defense", 'Russian Game'], ['Philidor Defense', 'Philidor Defense'], ['Two Knights Defense', 'Italian Game: Two Knights Defense'],
    ["King's Indian Defense", "King's Indian Defense"], ['Nimzo-Indian Defense', 'Nimzo-Indian Defense'], ["Queen's Indian Defense", "Queen's Indian Defense"],
    ['Grünfeld Defense', 'Grünfeld Defense'], ['Dutch Defense', 'Dutch Defense'], ['Slav Defense', 'Slav Defense'], ['Semi-Slav Defense', 'Semi-Slav Defense'],
    ["Queen's Gambit Declined", "Queen's Gambit Declined"], ["Queen's Gambit Accepted", "Queen's Gambit Accepted"], ['Benoni Defense', 'Benoni Defense'],
    ['Benko Gambit', 'Benko Gambit'], ['Budapest Gambit', 'Indian Defense: Budapest Defense'], ['Albin Countergambit', "Queen's Gambit Declined: Albin Countergambit"],
    ['Latvian Gambit', 'Latvian Gambit'], ['Bogo-Indian Defense', 'Bogo-Indian Defense'],
  ],
};

/** 계열별 평균 표준점수 (그 계열에 속한 수순들의 평균) */
function familyRows(c) {
  return FAMILIES[c].map(([label, prefix]) => {
    const rs = ROWS[c].filter((r) => r.name === prefix || r.name.startsWith(prefix + ':') || r.name.startsWith(prefix + ',') || r.name.startsWith(prefix + ' '));
    if (!rs.length) return null;
    const mean = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    const z = K.map((_, i) => mean((r) => r.z[i]));
    const gap = K.map((_, i) => mean((r) => r.gap[i]));
    return { label, eco: rs[0].eco, z, gap, gambit: rs.filter((r) => r.gambit).length > rs.length / 2, n: rs.length };
  }).filter(Boolean);
}
const FAM = { w: familyRows('w'), b: familyRows('b') };

/** 유형 코드 → 색별 어울리는 오프닝 계열 3개 */
export function openingPicks(code, lang = 'ko') {
  const sign = { A: code[0] === 'A' ? 1 : -1, W: code[1] === 'W' ? 1 : -1, I: code[2] === 'I' ? 1 : -1 };
  const out = {};
  for (const c of ['w', 'b']) {
    out[c] = FAM[c]
      .map((f) => { const a = axisScores(f); return { f, s: sign.A * a.A + sign.W * a.W + sign.I * a.I }; })
      .sort((x, y) => y.s - x.s).slice(0, 3)
      .map(({ f }) => {
        const tags = K.map((k, i) => [k, f.gap[i]]).filter(([k, g]) => g >= 4 && STYLE_LABEL[k]).sort((a, b) => b[1] - a[1]).slice(0, 2)
          .map(([k]) => STYLE_LABEL[k][lang === 'en' ? 1 : 0]);
        if (f.gambit) tags.unshift(lang === 'en' ? 'gambit' : '갬빗');
        return { eco: f.eco, name: f.label, tags };
      });
  }
  return out;
}

// ───────────── 유형 궁합 ─────────────
const REL = [
  ['정반대 라이벌', 'Opposite rivals', '모든 글자가 반대예요. 서로의 방식이 가장 안 통하거나 가장 잘 통하는 사이예요.', 'Every letter is reversed. Your styles either clash the most or click the best.'],
  ['다른 길', 'Different paths', '한 글자만 같아요. 같은 판을 보고도 전혀 다른 수를 떠올려요.', 'Only one letter in common. You see very different moves in the same position.'],
  ['반반', 'Half and half', '두 글자가 같아요. 비슷하면서도 결정적인 순간엔 다르게 둬요.', 'Two letters match. Similar in many ways, but different when it counts.'],
  ['닮은꼴', 'Kindred spirits', '세 글자가 같아요. 서로의 수가 꽤 익숙하게 느껴져요.', "Three letters match. Each other's moves feel familiar."],
  ['쌍둥이', 'Twins', '네 글자가 모두 같아요. 같은 판에서 같은 수를 둘 때가 많아요.', 'All four letters match. You often play the same move.'],
];
const AXIS_CLASH = [
  ['공격 쪽은 상대 킹과 기물을 바로 노리고, 포지션 쪽은 약점과 좋은 칸을 차곡차곡 쌓아요. 공격이 먼저 터지느냐, 포지션 우위가 먼저 쌓이느냐가 승부처예요.',
    'The attacker goes straight for the king and pieces; the positional player builds weaknesses and good squares. It comes down to whether the attack lands before the positional edge piles up.'],
  ['난전 쪽은 판을 복잡하게 만들고, 안전 쪽은 교환과 단순화로 위험을 줄여요. 국면이 얼마나 어지러워지느냐가 관건이에요.',
    'The wild player complicates; the safe player trades and simplifies. How messy the position gets decides a lot.'],
  ['선공 쪽이 먼저 판을 끌고 가고, 대응 쪽은 받아낸 뒤 반격을 노려요. 주도권을 누가 쥐느냐의 싸움이에요.',
    'The initiative player drives the game; the reactive player absorbs and counterattacks. It is a fight over who holds the initiative.'],
  ['독창 쪽은 같은 레이팅에서 잘 안 나오는 수로 판을 흔들고, 정석 쪽은 검증된 수로 맞서요. 서로 준비한 길을 벗어나는 순간이 승부처예요.',
    'The original player shakes things up with rare moves; the expected player answers with proven ones. The moment either leaves familiar ground is key.'],
];

/** 136쌍: 유형 목록 순서대로 a ≤ b */
export function compatPairs(types) {
  const out = [];
  types.forEach((a, i) => types.slice(i).forEach((b) => out.push([a, b])));
  return out;
}
export const compatPath = (a, b) => `/types/match/${a.code}-${b.code}`;

/** 궁합 페이지 본문. A·B는 언어에 맞춘 유형 데이터, axes는 언어에 맞춘 축 정보 */
export function compatBody({ A, B, axes, lang, esc, P, IMG, idForm }) {
  const en = lang === 'en';
  const same = [...A.code].filter((c, i) => c === B.code[i]).length;
  const rel = REL[same];
  const axisRows = axes.map((ax, i) => {
    const a = A.code[i] === ax.letters[0] ? 0 : 1, b = B.code[i] === ax.letters[0] ? 0 : 1;
    if (a === b) return `<li><b>${ax.letters[a]} ${esc(ax.names[a])}</b> — ${en ? 'both' : '둘 다'}. ${esc(ax.desc[a])}</li>`;
    return `<li><b>${A.code[i]} ${esc(ax.names[a])} vs ${B.code[i]} ${esc(ax.names[b])}</b> — ${esc(AXIS_CLASH[i][en ? 1 : 0])}</li>`;
  }).join('');
  const side = (me, them) => `<div class="card"><h3>${en ? `Playing ${me.code} vs ${them.code}` : `${me.code} ${esc(me.name)}가 ${them.code}를 상대할 때`}</h3>
    <p><b>${en ? 'What they do well' : '상대가 잘하는 것'}</b></p><ul>${them.strengths.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <p><b>${en ? 'Where to press (their watch-outs)' : '노려 볼 곳 (상대의 \'이럴 때 조심\')'}</b></p><ul>${them.weaknesses.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <p><b>${en ? 'What to lean on' : '내가 살릴 것'}</b></p><ul>${me.strengths.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const card = (t) => `<a class="opp-card g-${t.code.slice(0, 2)}" href="${P(lang, `/types/${t.code}`)}"><img src="${IMG(lang, `${t.code}-square.png`)}" alt="" width="600" height="600" loading="lazy" /><span><b>${t.code} ${esc(t.name)}</b>${esc(t.tagline)}</span></a>`;
  return `<article class="type-page">
<p class="crumbs"><a href="${P(lang, '/types/')}">${en ? 'Chess types' : '체스 유형'}</a> › ${en ? 'Matchups' : '궁합'}</p>
<h1>${A.code} ${esc(A.name)} × ${B.code} ${esc(B.name)}</h1>
<p class="tagline">${esc(rel[en ? 1 : 0])} · ${en ? `${same} of 4 letters match` : `같은 글자 ${same}개`}</p>
<p class="lead">${esc(rel[en ? 3 : 2])}</p>
<div class="cols">${card(A)}${A.code !== B.code ? card(B) : ''}</div>
<h2>${en ? 'Axis by axis' : '축별로 보면'}</h2><ul>${axisRows}</ul>
${A.code !== B.code ? `<h2>${en ? 'How to play each other' : '서로를 상대하는 법'}</h2><div class="cols">${side(A, B)}${side(B, A)}</div>`
    : `<h2>${en ? 'Playing your own type' : '같은 유형끼리'}</h2><p>${en ? 'Mirror matches are decided by who handles the shared watch-outs better.' : '거울 대결은 둘 다 가진 \'이럴 때 조심\'을 누가 더 잘 피하느냐로 갈려요.'}</p><ul>${A.weaknesses.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`}
<div class="cta-band small"><h2>${en ? 'Which type are you?' : '나는 어떤 유형일까요?'}</h2><p>${en ? 'Find out from your recent games.' : '최근 게임으로 확인해 보세요.'}</p>${idForm(lang)}</div>
<p class="muted">${en ? 'Types describe tendencies, not strength.' : '유형은 실력의 높낮이가 아니라 경향이에요.'} <a href="${P(lang, '/types/')}">${en ? 'All 16 types' : '16가지 유형 전체 보기'}</a></p>
</article>`;
}

/** 유형 페이지에 넣는 '다른 유형과의 궁합' 링크 줄 */
export function compatLinks({ t, types, lang, esc, P }) {
  const codes = types.map((x) => x.code);
  const order = (a, b) => (codes.indexOf(a.code) <= codes.indexOf(b.code) ? [a, b] : [b, a]);
  return `<div class="chips">${types.map((o) => { const [a, b] = order(t, o); return `<a class="chip" href="${P(lang, compatPath(a, b))}">${o.code} ${esc(o.name)}</a>`; }).join('')}</div>`;
}

/** 유형 페이지에 넣는 '어울리는 오프닝' 블록 */
export function openingBlock({ code, lang, esc }) {
  const en = lang === 'en';
  const p = openingPicks(code, lang);
  const col = (title, xs) => `<div class="card"><h3>${title}</h3><ul>${xs.map((o) => `<li><b>${esc(o.name)}</b> <span class="muted">${esc(o.eco)}${o.tags.length ? ` · ${esc(o.tags.join(' · '))}` : ''}</span></li>`).join('')}</ul></div>`;
  return `<p>${en ? 'Openings whose style (pre-analyzed from the opening database) matches this type\'s letters. Try them, or compare with what you already play.' : '오프닝 데이터베이스를 미리 분석한 스타일이 이 유형의 글자와 잘 맞는 오프닝이에요. 새로 시도해 보거나 지금 두는 오프닝과 비교해 보세요.'}</p>
<div class="cols">${col(en ? 'As White' : '백으로', p.w)}${col(en ? 'As Black' : '흑으로', p.b)}</div>`;
}
