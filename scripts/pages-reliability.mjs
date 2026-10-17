// '얼마나 믿을 만한가' 페이지 (/reliability): 측정 방법, 보정 데이터 규모, 수 판정 정확도, 유형이 바뀔 수 있는 경우, 한계.
// 숫자는 저장소의 측정 결과에서 온다: 보정(src/data/type-calib.json·type-stats.json), 판정 정확도(docs/HANDOFF-2026-10-14.md, 6판 392수).

/** 수 판정 정확도: 사이트 엔진(브라우저용 Stockfish 19 lite) vs 정식 Stockfish 깊이 18, 6판 392수 */
const JUDGE = { moves: 392, games: 6, exact: 73, withinOne: 98, errPrecision: 85, errRecall: 88 };

export function reliabilityBody({ lang, stats, calib, P, esc }) {
  const en = lang === 'en';
  const n = (calib?.players ?? stats.players).toLocaleString(en ? 'en' : 'ko'); // 기준선(보정)에 쓴 인원
  const byClass = calib?.byClass ? Object.entries(calib.byClass).map(([c, v]) => [c, v.players]) : [];
  const clsName = { bullet: ['불릿', 'bullet'], blitz: ['블리츠', 'blitz'], rapid: ['래피드', 'rapid'] };
  const shares = Object.entries(stats.types).filter(([, v]) => v).map(([c, v]) => [c, v.share]).sort((a, b) => b[1] - a[1]);
  const top = shares.slice(0, 3), bottom = shares.slice(-3);
  const T = (ko, enText) => (en ? enText : ko);
  return `<div class="prose"><h1>${T('Stylish는 얼마나 믿을 만한가요?', 'How reliable is Stylish?')}</h1>
<p class="lead">${T('Stylish의 판정이 어디서 나오는지, 무엇으로 확인했는지, 어떤 경우에 조심해서 봐야 하는지를 숫자와 함께 정리했어요.', 'Where Stylish\'s judgments come from, how we checked them, and when to read them with care.')}</p>

<h2>${T('1. 수 하나를 어떻게 판정하나요', '1. How a single move is judged')}</h2>
<ul>
<li>${T('<b>Stockfish 19</b>가 그 국면의 후보 수들을 평가하고, 둔 수가 최선 수와 얼마나 차이 나는지(기대 점수 손실)로 최선·좋은 수·부정확·실수·블런더를 나눠요.', '<b>Stockfish 19</b> evaluates the candidate moves, and the loss in expected score against the best move decides best, good, inaccuracy, mistake or blunder.')}</li>
<li>${T('같은 엔진 정보(수 전후 평가, 위협, 기물 교환, 킹 안전, 폰 구조 등)로 <b>19가지 스타일 점수</b>를 매겨요. 한 수가 여러 스타일을 동시에 가질 수 있어요.', 'The same engine information (evaluations before and after, threats, trades, king safety, pawn structure) gives <b>19 style scores</b>. A move can carry several styles at once.')}</li>
<li>${T('<b>Maia3</b>(사람의 실제 수를 학습한 신경망)가 "같은 레이팅의 사람이 이 수를 둘 확률"을 계산해요. 함정수·도박수와 독창성(O/E 축)은 이 사람 기준 확률로 판단해요.', '<b>Maia3</b>, a neural network trained on real human moves, estimates how likely a same-rated player is to play the move. Traps, gambles and originality (the O/E axis) are judged by this human-based probability.')}</li>
</ul>

<h2>${T('2. 수 판정은 얼마나 정확한가요', '2. How accurate are move judgments?')}</h2>
<p>${T(`사이트는 브라우저에서 돌아가는 가벼운 엔진을 써요. 그래서 데스크톱용 정식 Stockfish를 더 깊게(깊이 18) 돌린 결과와 비교했어요 (${JUDGE.games}판, ${JUDGE.moves}수).`, `The site runs a lightweight engine in your browser, so we compared it with full desktop Stockfish at depth 18 (${JUDGE.games} games, ${JUDGE.moves} moves).`)}</p>
<div class="table-wrap"><table><tbody>
<tr><td>${T('품질 등급이 정확히 같음', 'Same quality grade')}</td><td class="num"><b>${JUDGE.exact}%</b></td></tr>
<tr><td>${T('한 단계 안쪽 (예: 좋은 수 ↔ 최선)', 'Within one grade (e.g. good vs best)')}</td><td class="num"><b>${JUDGE.withinOne}%</b></td></tr>
<tr><td>${T('실수·블런더라고 한 수 중 실제로 실수·블런더 (정밀도)', 'Moves flagged as mistake/blunder that really were (precision)')}</td><td class="num"><b>${JUDGE.errPrecision}%</b></td></tr>
<tr><td>${T('실제 실수·블런더 중 찾아낸 비율 (재현율)', 'Real mistakes/blunders that were caught (recall)')}</td><td class="num"><b>${JUDGE.errRecall}%</b></td></tr>
</tbody></table></div>
<p class="muted">${T('"부정확" 등급은 엔진 깊이에 따라 흔들림이 커서 참고용으로만 보세요. 사이트 화면에도 같은 안내가 있어요.', 'The "inaccuracy" grade swings with engine depth, so treat it as a hint. The site says so on screen too.')}</p>

<h2>${T('3. 유형의 기준선은 어디서 왔나요', '3. Where the type baselines come from')}</h2>
<ul>
<li>${T(`Lichess 공개 데이터베이스(CC0)에서 <b>${n}명</b>의 실제 게임을 골라, 사이트와 똑같은 조건(엔진 깊이 10, Maia3, 오프닝 이론)으로 분석했어요.`, `We took real games from <b>${n} players</b> in the open Lichess database (CC0) and analyzed them under exactly the site's conditions (engine depth 10, Maia3, opening theory).`)}</li>
<li>${T('레이팅 600부터 2600까지 200점 구간마다 고르게 뽑았고, 시간대별로 따로 기준선을 만들었어요', 'Players were sampled evenly in 200-point bands from 600 to 2600, with separate baselines per time control')}${byClass.length ? ` (${byClass.map(([c, k]) => `${clsName[c]?.[en ? 1 : 0] ?? c} ${k.toLocaleString(en ? 'en' : 'ko')}${T('명', '')}`).join(', ')})` : ''}.</li>
<li>${T('스타일은 실력에 따라 달라져요(레이팅이 낮을수록 체크·잡기 같은 전술적인 수가 많아요). 그래서 <b>같은 레이팅 플레이어와 비교</b>해요. 실제로 네 축 모두 레이팅과의 상관이 0이고, 모든 레이팅 구간에서 16가지 유형이 다 나와요.', 'Style changes with strength (lower ratings play more checks and captures), so every letter is decided <b>against players of the same rating</b>. All four axes have zero correlation with rating, and every rating band produces all 16 types.')}</li>
<li>${T(`유형 분포: 가장 흔한 유형은 ${top.map(([c, s]) => `<a href="${P(lang, `/types/${c}`)}">${c}</a> ${s}%`).join(', ')}, 가장 드문 유형은 ${bottom.map(([c, s]) => `<a href="${P(lang, `/types/${c}`)}">${c}</a> ${s}%`).join(', ')}예요.`, `Type shares: the most common are ${top.map(([c, s]) => `<a href="${P(lang, `/types/${c}`)}">${c}</a> ${s}%`).join(', ')}; the rarest are ${bottom.map(([c, s]) => `<a href="${P(lang, `/types/${c}`)}">${c}</a> ${s}%`).join(', ')}.`)}</li>
</ul>

<h2>${T('4. 유형이 바뀔 수 있는 경우', '4. When your type can change')}</h2>
<p>${T('유형은 고정된 성격이 아니라 "분석한 판들에서 보인 경향"이에요. 아래 경우에는 판을 더 분석하면 글자가 바뀔 수 있어요.', 'A type is not a fixed personality; it is the tendency seen in the games analyzed. In these cases, more games can change a letter.')}</p>
<ul>
<li>${T('<b>분석한 판이 적을 때</b>: 판이 적으면 우연히 나온 몇 수의 영향이 커요. 최소 5판, 가능하면 10판 이상, 더 확실하게는 20판 이상을 권해요. 판이 적을수록 사이트가 축 값을 가운데 쪽으로 당겨 지나친 판정을 막아요.', '<b>Few games</b>: a handful of moves can sway the result. Analyze at least 5 games, ideally 10, and 20+ for a firm read. With few games the site pulls axis values toward the middle to avoid overconfident calls.')}</li>
<li>${T('<b>축이 50% 근처일 때</b>: 두 성향이 비슷하게 섞여 있다는 뜻이에요. 사이트는 40~60%인 축의 글자를 흐리게 표시하고 "애매"라고 알려 줘요.', '<b>An axis near 50%</b>: you mix both sides. The site fades letters whose axis is between 40% and 60% and marks them as unclear.')}</li>
<li>${T('<b>시간대가 다를 때</b>: 불릿과 래피드에서 스타일이 다른 사람이 많아요. 프로필 화면의 "시간대별 유형"에서 따로 볼 수 있어요.', '<b>Different time controls</b>: many players play bullet and rapid differently. See "type by time control" on your profile.')}</li>
<li>${T('<b>레이팅이 아주 높을 때</b>: 기준선은 Lichess 2600까지라 그보다 높으면 가장 높은 구간과 비교해요. <a href="'+P(lang, '/hall-of-fame/')+'">명예의 전당</a>의 최상위 선수들이 여기에 해당해요.', '<b>Very high ratings</b>: baselines stop at Lichess 2600, so stronger players are compared with the top band. The elite players in the <a href="'+P(lang, '/hall-of-fame/')+'">hall of fame</a> fall here.')}</li>
</ul>

<h2>${T('5. 알려진 한계', '5. Known limits')}</h2>
<ul>
<li>${T('여러 판을 한꺼번에 분석할 때는 속도를 위해 엔진 깊이 10을 써요. 한 판을 정밀 분석(깊이 18)하면 일부 판정이 달라질 수 있어요.', 'Combined analysis of many games uses engine depth 10 for speed. Deep single-game analysis (depth 18) can change some judgments.')}</li>
<li>${T('Chess.com 레이팅은 공개된 환산표(ChessGoals)로 Lichess 척도로 바꿔 비교해요. 블리츠 기준 표라 불릿·래피드는 근사값이에요.', 'Chess.com ratings are converted to the Lichess scale with a public table (ChessGoals). The table is blitz-based, so bullet and rapid are approximations.')}</li>
<li>${T('Maia3는 Lichess 게임으로 학습했어요. 아주 낮거나 높은 레이팅에서는 사람 기준 확률이 덜 정확할 수 있어요.', 'Maia3 was trained on Lichess games; its human probabilities are less certain at very low or very high ratings.')}</li>
<li>${T('스타일 점수의 가중치는 대표 국면과 고전 기보로 맞췄고 계속 다듬고 있어요. 판정이 이상해 보이면 <a href="'+P(lang, '/contact')+'">알려 주세요</a>.', 'Style weights were tuned on representative positions and classic games and are still being refined. If a judgment looks wrong, <a href="'+P(lang, '/contact')+'">let us know</a>.')}</li>
</ul>
<p class="muted">${T('측정 방법과 코드는 모두 공개돼 있어요.', 'All measurement methods and code are public.')} <a href="https://github.com/Vamp-pire/stylish-chess-engine" rel="noopener">GitHub</a></p>
</div>`;
}
