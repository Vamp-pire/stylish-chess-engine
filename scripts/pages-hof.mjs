// 명예의 전당 정적 페이지: src/data/hof.json(scripts/hof/build-hof.mts)으로 목록과 선수별 페이지(한·영)를 만든다.
import { STYLE_LABEL, boardSvg, typeImg } from './pages-shared.mjs';


const CLS = { bullet: ['불릿', 'Bullet'], blitz: ['블리츠', 'Blitz'], rapid: ['래피드', 'Rapid'] };
const GROUPS = [['gm', '최상위 선수', 'Elite grandmasters'], ['streamer', '해외 스트리머·유튜버', 'Streamers and YouTubers'], ['korea', '한국 체스 크리에이터', 'Korean chess creators']];
const L = (pair, en) => pair[en ? 1 : 0];
/** 받침이 있으면 '이에요', 없으면 '예요' */
const ieyo = (w) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이에요' : '예요'; };
const pctText = (n, en) => (n < 1 ? (en ? 'Fewer than 1%' : '1%도 안 되는 사람만') : en ? `About ${n}%` : `약 ${n}%`);

export const hofPath = (p) => `/hall-of-fame/${p.id}`;
const displayName = (p, en) => (en ? p.name : p.ko);
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** 친구 비교 링크와 같은 형식(/app?vs=)으로 '이 선수와 내 유형 비교하기' */
const compareUrl = (p, en) => `/app?vs=${b64url(JSON.stringify([p.overall.code, p.overall.pcts, (en ? p.name : p.ko).slice(0, 30)]))}&ref=hof-${p.id}${en ? '&lang=en' : ''}`;

export function hofIndexBody({ hof, data, lang, esc, P, IMG, typeIn }) {
  const en = lang === 'en';
  const card = (p) => {
    const t = typeIn(data.types.find((x) => x.code === p.overall.code), lang);
    return `<a class="hof-card" href="${P(lang, hofPath(p))}">${typeImg(IMG(lang, `${t.code}-square.png`), { w: 600, h: 600, sizes: '96px' })}
<span><b>${esc(displayName(p, en))}</b><em>${t.code} ${esc(t.name)}</em><small>${esc(p.desc[en ? 1 : 0])}</small></span></a>`;
  };
  return `<article class="type-page">
<p class="crumbs"><a href="${P(lang, '/types/')}">${en ? 'Chess types' : '체스 유형'}</a> › ${en ? 'Hall of fame' : '명예의 전당'}</p>
<h1>${en ? 'Hall of fame: what type are famous players?' : '명예의 전당: 유명 플레이어는 어떤 유형일까?'}</h1>
<p class="lead">${en ? 'We analyzed hundreds of public Chess.com games from each player with the same method used for your games, and compared them with players of the same rating.' : '선수마다 Chess.com에 공개된 대국 수백 판을 내 게임과 똑같은 방식으로 분석하고, 같은 레이팅 플레이어들과 비교했어요.'}</p>
${GROUPS.map(([g, ko, enName]) => { const list = hof.players.filter((p) => p.group === g); return list.length ? `<h2>${en ? enName : ko}</h2><div class="hof-grid">${list.map(card).join('')}</div>` : ''; }).join('\n')}
<p class="muted">${en ? 'Types describe tendencies, not strength. Ratings above our calibration range (Lichess 2600) are compared with the top band.' : '유형은 실력이 아니라 경향이에요. 보정 범위(Lichess 2600)보다 레이팅이 높은 선수는 가장 높은 구간과 비교했어요.'} ${en ? `Data: ${hof.updated}.` : `데이터 기준일: ${hof.updated}.`}</p>
</article>`;
}

export function hofPlayerBody({ p, hof, data, axes, lang, esc, P, IMG, typeIn, contact }) {
  const en = lang === 'en';
  const t = typeIn(data.types.find((x) => x.code === p.overall.code), lang);
  const name = displayName(p, en);
  const bars = axes.map((a, i) => {
    const pct = p.overall.pcts[i];
    const first = pct >= 50;
    return `<div class="hof-axis"><span class="${first ? 'on' : ''}">${a.letters[0]} ${esc(a.names[0])}</span><div class="bar"><i style="left:${Math.min(97, Math.max(3, 100 - pct))}%"></i></div><span class="${first ? '' : 'on'}">${a.letters[1]} ${esc(a.names[1])}</span><b>${first ? pct : 100 - pct}%</b></div>`;
  }).join('');
  const peers = p.overall.peers ? Object.entries(p.overall.peers).map(([k, v]) => ({ k, v, d: Math.abs(v - 50) })).sort((a, b) => b.d - a.d).slice(0, 4) : [];
  const standout = peers.map(({ k, v }) => `<li><b>${esc(L(STYLE_LABEL[k] ?? [k, k], en))}</b> — ${en ? `${v >= 50 ? 'higher' : 'lower'} than ${v >= 50 ? v : 100 - v}% of same-rated players` : `같은 레이팅 플레이어 ${v >= 50 ? v : 100 - v}%보다 ${v >= 50 ? '높아요' : '낮아요'}`}</li>`).join('');
  const clsRows = p.classes.map((c) => `<tr><td>${L(CLS[c.cls], en)}</td><td>${en ? `${c.games} games` : `${c.games}판`}</td><td>${c.chesscomElo ?? '-'}</td><td>${c.type ? `<a href="${P(lang, `/types/${c.type.code}`)}">${c.type.code}</a>` : '-'}</td><td>${c.type ? `${c.type.accuracy}%` : '-'}</td></tr>`).join('');
  const sig = p.signature.filter(Boolean).map((m, i) => {
    const ax = axes[i];
    return `<figure class="hof-move">${boardSvg(m.fen, m.uci, m.color)}
<figcaption><b>${m.n}${m.color === 'w' ? '.' : '...'} ${esc(m.san)}</b> <span class="type-letter">${m.letter}</span>
<span class="muted">${en ? `${L(CLS[m.cls], true)} vs ${esc(m.opp)} · clue for ${ax.letters.join('/')}` : `${L(CLS[m.cls], false)} · 상대 ${esc(m.opp)} · ${ax.letters.join('/')} 축의 대표 수`}</span>
<span class="chips">${m.styles.map((k) => `<span class="chip">${esc(L(STYLE_LABEL[k] ?? [k, k], en))}</span>`).join('')}</span>
<span class="muted">${en ? `${pctText(m.humanP, true)} of same-rated players would play this.` : `같은 레이팅 사람 중 ${pctText(m.humanP, false)}${m.humanP < 1 ? '이' : '가'} 두는 수예요.`}${m.link ? ` <a href="${esc(m.link)}" rel="nofollow noopener" target="_blank">${en ? 'Full game' : '대국 전체 보기'}</a>` : ''}</span></figcaption></figure>`;
  }).join('');
  const op = (list) => (list.length ? `<ul>${list.map((o) => `<li>${esc(o.name)} <span class="muted">${en ? `${o.n} games` : `${o.n}판`}</span></li>`).join('')}</ul>` : `<p class="muted">-</p>`);
  const others = hof.players.filter((x) => x.id !== p.id).map((x) => `<a class="chip" href="${P(lang, hofPath(x))}">${esc(displayName(x, en))} · ${x.overall.code}</a>`).join('');
  return `<article class="type-page">
<p class="crumbs"><a href="${P(lang, '/hall-of-fame/')}">${en ? 'Hall of fame' : '명예의 전당'}</a> › ${esc(name)}</p>
<h1>${en ? `${esc(name)}'s chess type: ${t.code} ${esc(t.name)}` : `${esc(name)}의 체스 유형: ${t.code} ${esc(t.name)}`}</h1>
<p class="tagline">${esc(p.desc[en ? 1 : 0])}</p>
<p class="lead">${en ? `From ${p.games} recent public Chess.com games, ${esc(name)}'s type in <b>${L(CLS[p.mainClass], true).toLowerCase()}</b> (${p.mainGames} games), the most representative online time control, is <b>${t.code} ${esc(t.name)}</b>: ${esc(t.tagline)} Other time controls are in the table below.` : `Chess.com에 공개된 최근 대국 ${p.games}판 중, 온라인 체스의 대표 시간대인 <b>${L(CLS[p.mainClass], false)}</b> ${p.mainGames}판 기준으로 ${esc(name)}의 유형은 <b>${t.code} ${esc(t.name)}</b>${ieyo(t.name)}. ${esc(t.tagline)} 다른 시간대의 유형은 아래 표에 있어요.`}</p>
<div class="cols"><a class="opp-card g-${t.code.slice(0, 2)}" href="${P(lang, `/types/${t.code}`)}">${typeImg(IMG(lang, `${t.code}-square.png`), { w: 600, h: 600, sizes: '96px' })}<span><b>${t.code} ${esc(t.name)}</b>${esc(t.tagline)}</span></a>
<div class="card"><h3>${en ? 'Four axes' : '네 축'}</h3>${bars}<p class="muted">${en ? 'Percent = how far toward that side compared with same-rated players.' : '%는 같은 레이팅 플레이어들 사이에서 그쪽으로 얼마나 치우쳤는지예요.'}</p></div></div>
<p class="cta-row"><a class="btn-cta" href="${compareUrl(p, en)}" data-track="hof_compare">${en ? `Compare my type with ${esc(name)}` : `내 유형과 ${esc(name)} 비교하기`}</a></p>
<h2>${en ? 'What stands out' : '두드러진 특징'}</h2>
<ul>${standout}</ul>
<h2>${en ? 'Signature moves' : '대표 수'}</h2>
<p>${en ? 'For each letter, the move from these games that shows it most clearly.' : '글자마다 그 성향이 가장 잘 드러난 실제 대국의 수예요.'}</p>
<div class="hof-moves">${sig}</div>
<h2>${en ? 'By time control' : '시간대별 유형'}</h2>
<p class="muted">${en ? 'Styles shift with the clock, and letters whose axis sits near 50% can flip between time controls.' : '스타일은 시간에 따라 달라져요. 축이 50% 근처인 글자는 시간대마다 바뀌기도 해요.'}</p>
<div class="table-wrap"><table><thead><tr><th>${en ? 'Time control' : '시간대'}</th><th>${en ? 'Games' : '판 수'}</th><th>${en ? 'Chess.com rating' : 'Chess.com 레이팅'}</th><th>${en ? 'Type' : '유형'}</th><th>${en ? 'Accuracy' : '정확도'}</th></tr></thead><tbody>${clsRows}</tbody></table></div>
<h2>${en ? 'Favorite openings' : '자주 둔 오프닝'}</h2>
<div class="cols"><div class="card"><h3>${en ? 'As White' : '백으로'}</h3>${op(p.openings.w)}</div><div class="card"><h3>${en ? 'As Black' : '흑으로'}</h3>${op(p.openings.b)}</div></div>
<h2>${en ? 'Other players' : '다른 선수'}</h2>
<div class="chips">${others}</div>
<p class="muted">${en ? `Types describe tendencies, not strength. Headline type uses the blitz games. Analysis of public Chess.com games (${hof.updated}) at the same settings as the site (depth 10, Maia3). Ratings above our calibration range (Lichess 2600) are compared with the top band. To request a correction or removal, use our <a href="${contact}" rel="noopener">contact form</a>.`
    : `유형은 실력이 아니라 경향이에요. 대표 유형은 블리츠 기준이에요. Chess.com 공개 대국을 사이트와 같은 조건(깊이 10, Maia3)으로 분석했어요(${hof.updated} 기준). 보정 범위(Lichess 2600)보다 레이팅이 높으면 가장 높은 구간과 비교했어요. 수정·삭제 요청은 <a href="${contact}" rel="noopener">문의 양식</a>으로 보내 주세요.`}</p>
</article>`;
}
