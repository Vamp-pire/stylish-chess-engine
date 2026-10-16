// 오늘의 유형 맞히기 (3단계): 익명 Lichess 플레이어가 둔 수 4개를 보고 그 사람의 4글자 유형을 맞힌다.
// 문제는 public/daily/p/{번호}.json (scripts/daily/build-daily.mts로 만든 묶음), 한국 시간 자정마다 바뀐다.
// 수 하나가 글자 하나의 단서(1번 수 → 첫째 글자 …). 기회 4번, 틀릴 때마다 수의 스타일 힌트가 하나씩 열린다.
// 결과는 '몇 글자 맞았는지'만 알려 준다 (어느 글자인지 알려 주면 두 번째에 반드시 맞혀서 너무 쉽다).
// 기록(연속 기록·분포)은 이 브라우저에, 전체 통계는 Supabase(익명 ID당 하루 한 번)에 남는다.
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import { tr, getLang } from '../i18n';
import { TYPE_DATA } from '../core/chessType';
import { STYLES, type StyleKey } from '../core/styles';
import { rpc } from '../server/supa';

export const DAILY_KEY = 'stylish.daily.v1';
const TRIES = 4;
const DAY_MS = 86400000;

interface DailyMove { fen: string; san: string; uci: string; color: 'w' | 'b'; n: number; styles: StyleKey[]; humanP: number; risk: string | null }
interface Puzzle { code: string; elo: number; cls: string | null; pcts: number[]; moves: DailyMove[] }
interface DayRec { g: string[]; done: boolean; ok: boolean; sent?: boolean }
interface Store { streak: number; best: number; lastWin: number | null; played: number; wins: number; dist: number[]; days: Record<string, DayRec> }
interface Stats { day: number; players: number; solved: number; dist: number[] }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const load = (): Store => {
  try { const v = JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null'); if (v && v.days) return v; } catch { /* 새로 */ }
  return { streak: 0, best: 0, lastWin: null, played: 0, wins: 0, dist: [0, 0, 0, 0], days: {} };
};
const save = (s: Store) => { try { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); } catch { /* 저장 못 해도 진행 */ } };

/** 오늘 문제 번호: 시작일(한국 시간)부터 지난 날 수 */
export function dailyDay(start: string): number {
  const kst = Math.floor((Date.now() + 9 * 3600000) / DAY_MS);
  return Math.max(0, kst - Math.floor(Date.parse(`${start}T00:00:00Z`) / DAY_MS));
}
/** 다음 문제까지 남은 시간 (한국 시간 자정) */
function untilNext(): string {
  const ms = DAY_MS - ((Date.now() + 9 * 3600000) % DAY_MS);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return tr(`${h}시간 ${m}분`, `${h}h ${m}m`);
}

let cg: CgApi | null = null;
let root: HTMLElement | null = null;
let shown = 0; // 지금 보드에 보이는 수
let pick: string[] = []; // 고르는 중인 글자
let puzzle: Puzzle | null = null, day = 0;
let stats: Stats | null = null;
let timer = 0;

export function leaveDaily() { cg?.destroy(); cg = null; root = null; clearInterval(timer); }

export async function renderDaily(app: HTMLElement) {
  leaveDaily();
  root = app;
  app.innerHTML = `<div class="hero"><h1>${tr('오늘의 유형 맞히기', 'Daily type guess')}</h1><p class="faint">${tr('불러오는 중…', 'Loading…')}</p></div>`;
  try {
    const meta = await fetch('/daily/meta.json').then((r) => r.json()) as { start: string; count: number };
    day = dailyDay(meta.start);
    puzzle = await fetch(`/daily/p/${day % meta.count}.json`).then((r) => r.json()) as Puzzle;
  } catch {
    if (root === app) app.innerHTML = `<div class="hero"><h1>${tr('오늘의 유형 맞히기', 'Daily type guess')}</h1><p class="error">${tr('문제를 불러오지 못했어요. 잠시 후 다시 열어 주세요.', 'Could not load the puzzle. Please try again shortly.')}</p></div>`;
    return;
  }
  if (root !== app) return;
  const rec = load().days[day];
  pick = rec && !rec.done ? [...(rec.g.at(-1) ?? '')] : ['', '', '', ''];
  if (pick.length !== 4) pick = ['', '', '', ''];
  shown = 0;
  stats = null;
  draw();
  if (rec?.done) loadStats(rec);
}

/** 맞은 글자 수 (어느 자리인지는 알려 주지 않는다) */
const hits = (guess: string, code: string) => [...guess].filter((c, i) => c === code[i]).length;
/** 결과 이모지: 맞은 개수만큼 🟩를 앞에 (자리와 무관) */
const marks = (guess: string, code: string) => '🟩'.repeat(hits(guess, code)) + '⬜'.repeat(4 - hits(guess, code));

function draw() {
  if (!root || !puzzle) return;
  const p = puzzle;
  const st = load(), rec: DayRec = st.days[day] ?? { g: [], done: false, ok: false };
  const wrong = rec.g.length - (rec.ok ? 1 : 0); // 틀린 횟수만큼 힌트를 연다
  const axes = TYPE_DATA.axes;
  const cls = p.cls === 'bullet' ? tr('불릿', 'bullet') : p.cls === 'blitz' ? tr('블리츠', 'blitz') : p.cls === 'rapid' ? tr('래피드', 'rapid') : '';
  const m = p.moves[shown];
  const revealed = rec.done || shown < wrong;
  const hint = revealed
    ? `<div class="dg-hint"><b>${tr('힌트', 'Hint')}</b> ${m.styles.length ? m.styles.map((k) => `<span class="chip">${esc(STYLES[k].label)}</span>`).join(' ') : tr('두드러진 스타일 없음', 'No standout style')}
        <span class="faint">${tr(`같은 레이팅 사람 중 약 ${m.humanP}%가 두는 수`, `About ${m.humanP}% of same-rated players would play this`)}</span></div>`
    : `<div class="dg-hint faint">${tr(`틀리면 이 수의 스타일 힌트가 열려요 (${shown + 1}번째 힌트)`, `A wrong guess unlocks this move's style hint (hint ${shown + 1})`)}</div>`;
  const ax = axes[shown];
  root.innerHTML = `
    <div class="hero dg-hero"><h1>${tr(`오늘의 유형 맞히기 #${day + 1}`, `Daily type guess #${day + 1}`)}</h1>
      <p>${tr(`Lichess 레이팅 ${p.elo}${cls ? ` · ${cls}` : ''} 플레이어가 실제로 둔 수 4개예요. 수 하나가 글자 하나의 단서예요. 이 사람의 4글자 유형은?`, `Four moves a ${p.elo}-rated Lichess ${cls} player actually played. Each move is a clue to one letter. What is their four-letter type?`)}</p></div>
    <div class="dg">
      <div class="card card-pad dg-board-card">
        <div class="dg-tabs" role="tablist">${p.moves.map((_, i) => `<button role="tab" aria-selected="${i === shown}" class="${i === shown ? 'active' : ''}" data-dg-move="${i}">${tr(`${i + 1}번 수`, `Move ${i + 1}`)}<small>${axes[i].letters.join('/')}</small></button>`).join('')}</div>
        <div class="dg-board"><div class="cg" id="dg-board"></div></div>
        <p class="dg-move"><b>${m.n}${m.color === 'w' ? '.' : '...'} ${esc(m.san)}</b> <span class="faint">${tr(`${m.color === 'w' ? '백' : '흑'}이 둔 수 · ${ax.letters[0]} ${esc(ax.names[0])} 또는 ${ax.letters[1]} ${esc(ax.names[1])}의 단서`, `played by ${m.color === 'w' ? 'White' : 'Black'} · clue for ${ax.letters[0]} ${esc(ax.names[0])} or ${ax.letters[1]} ${esc(ax.names[1])}`)}</span></p>
        ${hint}
      </div>
      <div class="card card-pad dg-side">
        ${rec.g.length ? `<div class="dg-rows">${rec.g.map((g) => `<div class="dg-row"><code>${g}</code><span title="${tr('맞은 글자 수 (자리는 비밀)', 'Letters right (positions hidden)')}">${marks(g, p.code)} <b>${tr(`${hits(g, p.code)}개 맞음`, `${hits(g, p.code)}/4`)}</b></span></div>`).join('')}</div>` : ''}
        ${rec.done ? doneHtml(p, rec, st) : guessHtml(rec)}
      </div>
    </div>`;
  const turn = m.color === 'w' ? 'white' : 'black';
  const shapes = [{ orig: m.uci.slice(0, 2) as Key, dest: m.uci.slice(2, 4) as Key, brush: 'green' }];
  const opts = { fen: m.fen, orientation: turn as 'white' | 'black', viewOnly: true, coordinates: true, lastMove: undefined, drawable: { enabled: false, visible: true, autoShapes: shapes } };
  cg?.destroy();
  cg = Chessground(root.querySelector<HTMLElement>('#dg-board')!, opts);
  wire();
}

function guessHtml(rec: DayRec) {
  const axes = TYPE_DATA.axes;
  const left = TRIES - rec.g.length;
  const guess = pick.join('');
  const dup = pick.every(Boolean) && rec.g.includes(guess);
  return `<div class="dg-guess">
    <p class="faint">${tr('제출하면 4글자 중 <b>몇 개가 맞았는지</b>만 알려 줘요. 어느 글자인지는 수를 보고 추리하세요.', 'After each guess you only learn <b>how many</b> letters are right, not which. Work out the rest from the moves.')}</p>
    ${axes.map((a, i) => `<div class="dg-axis"><span class="faint">${esc(a.question ?? '')}</span><div class="seg">${a.letters.map((l, k) => `<button type="button" class="${pick[i] === l ? 'active' : ''}" data-dg-letter="${i}:${l}" aria-pressed="${pick[i] === l}">${l} <small>${esc(a.names[k])}</small></button>`).join('')}</div></div>`).join('')}
    ${dup ? `<p class="faint">${tr('이미 낸 답이에요. 글자를 바꿔 보세요.', 'You already tried that. Change a letter.')}</p>` : ''}
    <button class="btn primary" id="dg-submit" ${pick.every(Boolean) && !dup ? '' : 'disabled'}>${tr(`${pick.every(Boolean) ? pick.join('') : '____'} 제출 (남은 기회 ${left})`, `Submit ${pick.every(Boolean) ? pick.join('') : '____'} (${left} left)`)}</button>
  </div>`;
}

function doneHtml(p: Puzzle, rec: DayRec, st: Store) {
  const t = TYPE_DATA.types.find((x) => x.code === p.code);
  const en = getLang() === 'en';
  return `<div class="dg-done">
    <p class="dg-result">${rec.ok ? tr(`🎉 ${rec.g.length}번 만에 맞혔어요!`, `🎉 Solved in ${rec.g.length}!`) : tr('아쉬워요! 정답은', 'So close! The answer was')}</p>
    <a class="dg-answer" href="${en ? '/en' : ''}/types/${p.code}" target="_blank" rel="noopener"><span class="type-code">${p.code}</span> ${esc(t?.name ?? '')}</a>
    <p class="faint">${tr(`축 백분위 ${p.pcts.join(' · ')} (같은 레이팅 대비)`, `Axis percentiles ${p.pcts.join(' · ')} (vs same rating)`)}</p>
    <button class="btn primary" id="dg-share">${tr('결과 복사해서 공유', 'Copy result to share')}</button>
    <div class="stats dg-stats">
      <div class="stat"><b>${st.streak}</b><span>${tr('연속 정답', 'Streak')}</span></div>
      <div class="stat"><b>${st.best}</b><span>${tr('최고 연속', 'Best')}</span></div>
      <div class="stat"><b>${st.played ? Math.round((st.wins / st.played) * 100) : 0}%</b><span>${tr(`정답률 (${st.played}회)`, `Win rate (${st.played})`)}</span></div>
    </div>
    <div id="dg-global" class="dg-global faint">${tr('전체 통계를 불러오는 중…', 'Loading global stats…')}</div>
    <p class="faint">${tr(`다음 문제까지 <b id="dg-next">${untilNext()}</b>`, `Next puzzle in <b id="dg-next">${untilNext()}</b>`)}</p>
  </div>`;
}

function wire() {
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>('[data-dg-move]').forEach((b) => b.onclick = () => { shown = Number(b.dataset.dgMove); draw(); if (stats) showStats(); });
  root.querySelectorAll<HTMLButtonElement>('[data-dg-letter]').forEach((b) => b.onclick = () => {
    const [i, l] = b.dataset.dgLetter!.split(':');
    pick[Number(i)] = l;
    // 다음으로 고를 축의 수를 보드에 띄운다
    const next = pick.findIndex((x) => !x);
    if (next >= 0) shown = next;
    else shown = Number(i);
    draw();
  });
  root.querySelector<HTMLButtonElement>('#dg-submit')?.addEventListener('click', submit);
  root.querySelector<HTMLButtonElement>('#dg-share')?.addEventListener('click', share);
  const next = root.querySelector('#dg-next');
  if (next) { clearInterval(timer); timer = window.setInterval(() => { next.textContent = untilNext(); }, 30000); }
}

function submit() {
  if (!puzzle || !pick.every(Boolean)) return;
  if (load().days[day]?.g.includes(pick.join(''))) return;
  const st = load();
  const rec: DayRec = st.days[day] ?? { g: [], done: false, ok: false };
  if (rec.done) return;
  const guess = pick.join('');
  rec.g.push(guess);
  rec.ok = guess === puzzle.code;
  rec.done = rec.ok || rec.g.length >= TRIES;
  if (rec.done) {
    st.played++;
    if (rec.ok) {
      st.wins++; st.dist[rec.g.length - 1]++;
      st.streak = st.lastWin === day - 1 ? st.streak + 1 : 1;
      st.lastWin = day;
      st.best = Math.max(st.best, st.streak);
    } else st.streak = 0;
  }
  st.days[day] = rec;
  // 오래된 날짜 기록은 60일만 남긴다
  for (const k of Object.keys(st.days)) if (Number(k) < day - 60) delete st.days[k];
  save(st);
  // 방금 낸 답을 그대로 두고 고치게 한다. 틀렸으면 방금 열린 힌트의 수를 보여 준다
  if (!rec.done) shown = Math.min(rec.g.length - 1, 3);
  draw();
  if (rec.done) loadStats(rec);
}

async function loadStats(rec: DayRec) {
  try {
    if (!rec.sent) {
      stats = await rpc<Stats>('submit_daily', { p_day: day, p_tries: rec.g.length, p_solved: rec.ok });
      const st = load(); if (st.days[day]) { st.days[day].sent = true; save(st); }
    } else stats = await rpc<Stats>('get_daily_stats', { p_day: day }, false);
  } catch {
    // 사람 확인·광고 차단 등으로 올리지 못하면 보기만
    try { stats = await rpc<Stats>('get_daily_stats', { p_day: day }, false); } catch { stats = null; }
  }
  showStats();
}

function showStats() {
  const el = root?.querySelector('#dg-global');
  if (!el) return;
  if (!stats || !stats.players) { el.textContent = stats ? tr('오늘 첫 참여자예요!', "You're the first player today!") : tr('전체 통계를 불러오지 못했어요.', 'Could not load global stats.'); return; }
  const rec = load().days[day];
  const max = Math.max(1, ...stats.dist);
  // 상위 N%: 나보다 잘한(더 적은 횟수로 맞힌) 사람 비율
  let better = 0;
  if (rec?.ok) for (let i = 0; i < rec.g.length - 1; i++) better += stats.dist[i];
  else better = stats.solved;
  const top = Math.max(1, Math.round(((better + 1) / stats.players) * 100));
  el.innerHTML = `<b>${tr(`오늘 ${stats.players}명 참여 · 정답률 ${Math.round((stats.solved / stats.players) * 100)}%`, `${stats.players} played today · ${Math.round((stats.solved / stats.players) * 100)}% solved`)}</b>
    ${rec?.ok ? `<span>${tr(`나는 상위 ${top}%`, `You're in the top ${top}%`)}</span>` : ''}
    <div class="dg-dist">${stats.dist.map((n, i) => `<div><span>${i + 1}</span><i style="width:${Math.max(4, (n / max) * 100)}%" class="${rec?.ok && rec.g.length === i + 1 ? 'me' : ''}"></i><em>${n}</em></div>`).join('')}</div>`;
}

async function share(e: Event) {
  const st = load(), rec = st.days[day];
  if (!rec || !puzzle) return;
  const text = `${tr('Stylish 오늘의 유형', 'Stylish daily type')} #${day + 1} ${rec.ok ? rec.g.length : 'X'}/${TRIES}\n${rec.g.map((g) => marks(g, puzzle!.code)).join('\n')}\n${location.origin}/app?view=daily`;
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); btn.textContent = tr('복사했어요!', 'Copied!'); }
  } catch { /* 취소 */ }
}
