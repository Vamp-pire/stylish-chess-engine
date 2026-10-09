import './style.css';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import { SAMPLES } from './samples';
import { AnalysisRun, getEngine } from './ui/runner';
import { evalGraph, radar } from './ui/charts';
import { renderGuide, HOW } from './ui/guide';
import type { GameAnalysis, MoveAnalysis } from './core/analyzer';
import { buildProfile, riskTotal, type PlayerProfile } from './core/profile';
import { fetchGames, userResult, SOURCE_LABEL, type OnlineGame, type Source } from './online/sources';
import { cacheKey, getCached, putCached, gameHash } from './ui/cache';
import { savePlayerGame, listPlayers, getPlayer, deletePlayer, deleteGame, clearPlayers, combinedProfile, gamesOf, isNamed, SOURCE_NAME, type PlayerSource } from './ui/players';
import { timeSection, openingSection, trendSection, fmtSec, fmtClock, GROUP_AXES, groupScore } from './ui/insights';
import { shareUrl, readSharedGame } from './ui/share';
import { pickHighlights, drawCard, cardBlob } from './ui/highlights';
import { findMissed, openQuiz } from './ui/quiz';
import { openModal } from './ui/modal';
import { STYLES, STYLE_KEYS, RISK_KINDS, RISK_LABEL, QUALITY_LABEL, type StyleKey, type QualityKey } from './core/styles';

// ───────────── 상태 ─────────────

type View = 'analyze' | 'guide' | 'about' | 'players';
type InputTab = 'paste' | 'samples' | 'file' | 'lichess' | 'chesscom' | 'lichessUser';

interface PlyInfo { san: string; color: 'w' | 'b'; from: string; to: string; fenAfter: string; moveNumber: number }

interface GameState {
  pgn: string;
  headers: Record<string, string>;
  startFen: string;
  plies: PlyInfo[];
  results: MoveAnalysis[];
  analysis: GameAnalysis | null;
  progress: [number, number];
  ply: number; // -1 = 시작 국면
  error: string | null;
  /** 아이디로 불러온 게임이면 그 사람 색 (프로필을 먼저 보여준다) */
  focus: 'w' | 'b' | null;
  fromCache: boolean;
  source: PlayerSource;
  url: string | null;
  date: number | null;
  /** 분석이 끝나면 성향을 저장할 쪽 */
  save: ('w' | 'b')[];
  /** 보드에서 보고 있는 변화 수순 (미끼를 물었다면 / 최선 수순) */
  variation: Variation | null;
}

interface Variation { title: string; ply: number; startFen: string; sans: string[]; fens: string[]; moves: [string, string][]; idx: number }

/** 아이디로 불러온 게임 목록 */
interface AccountState {
  source: Source;
  user: string;
  games: OnlineGame[];
  next: unknown | null;
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  timeFilter: string;
}

/** 여러 판 종합 분석 */
interface BatchState {
  source: Source;
  user: string;
  games: OnlineGame[];
  results: Map<string, GameAnalysis>;
  current: number;          // 분석 중인 게임 인덱스 (-1 = 끝)
  progress: [number, number];
  depth: number;
  error: string | null;
  cancelled: boolean;
  run: AnalysisRun | null;
}

const DEPTHS = [
  { label: '빠름', depth: 10, hint: '약 30초' },
  { label: '보통', depth: 14, hint: '약 1~2분' },
  { label: '정밀', depth: 18, hint: '약 4분 이상' },
];

const state = {
  view: 'analyze' as View,
  tab: 'paste' as InputTab,
  draft: '',
  lichessUrl: '',
  depth: 18, // 기본은 정밀
  inputError: null as string | null,
  game: null as GameState | null,
  run: null as AnalysisRun | null,
  orientation: 'white' as 'white' | 'black',
  account: null as AccountState | null,
  /** 프로필 메뉴에서 보고 있는 플레이어 */
  playerKey: null as string | null,
  storageFull: false,
  batch: null as BatchState | null,
  batchDepth: 10, // 여러 판 분석은 기본 빠름 (한 판 30초 안팎)
};

const app = document.getElementById('app')!;
let cg: CgApi | null = null;

// ───────────── 유틸 ─────────────

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const fmtEval = (cp: number, mate: number | null) => {
  if (mate != null) return mate === 0 ? '#' : `#${mate > 0 ? '' : '-'}${Math.abs(mate)}`;
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
};
const glyph = (m: MoveAnalysis) => {
  if (m.risk === 'soundSacrifice') return '<span class="glyph g-risk">!</span>';
  if (m.risk === 'speculative') return '<span class="glyph g-risk">!?</span>';
  if (m.risk === 'gamble') return '<span class="glyph g-risk">⚂</span>';
  if (m.risk === 'trap') return '<span class="glyph g-risk">⚑</span>';
  if (m.quality === 'blunder') return '<span class="glyph g-blunder">??</span>';
  if (m.quality === 'mistake') return '<span class="glyph g-mistake">?</span>';
  if (m.quality === 'inaccuracy') return '<span class="glyph g-inaccuracy">?!</span>';
  return '';
};
const styleColor = (k: StyleKey | 'neutral') => (k === 'neutral' ? 'var(--text-3)' : STYLES[k].color);
const styleLabel = (k: StyleKey | 'neutral') => (k === 'neutral' ? '평범한 수' : STYLES[k].label);
const playerName = (h: Record<string, string>, c: 'w' | 'b') => h[c === 'w' ? 'White' : 'Black'] && h[c === 'w' ? 'White' : 'Black'] !== '?' ? h[c === 'w' ? 'White' : 'Black'] : c === 'w' ? '백' : '흑';

// ───────────── 라우팅 ─────────────

function setView(v: View) {
  state.view = v;
  if (v === 'players') state.playerKey = null;
  document.querySelectorAll<HTMLButtonElement>('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === v));
  render();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) =>
  el.addEventListener('click', (e) => { e.preventDefault(); setView(el.dataset.nav as View); }));

function render() {
  cg?.destroy(); cg = null;
  if (state.view === 'guide') { app.innerHTML = renderGuide(); return; }
  if (state.view === 'about') { app.innerHTML = renderAbout(); return; }
  if (state.view === 'players') { renderPlayers(); return; }
  if (state.game) renderReview(); else if (state.batch) renderBatch(); else renderInput();
}

// ───────────── 입력 화면 ─────────────

function renderInput() {
  const keepY = window.scrollY;
  const keepList = $('.game-table-wrap')?.scrollTop ?? 0;
  renderInputInner();
  window.scrollTo({ top: keepY });
  const list = $('.game-table-wrap'); if (list) list.scrollTop = keepList;
}

function renderInputInner() {
  const tabs: [InputTab, string][] = [['paste', 'PGN 붙여넣기'], ['samples', '예시 기보'], ['file', '파일 열기'], ['chesscom', 'Chess.com 아이디'], ['lichessUser', 'Lichess 아이디'], ['lichess', 'Lichess 링크']];
  const body = {
    paste: `<textarea class="pgn" id="pgn" placeholder="[White &quot;...&quot;]&#10;[Black &quot;...&quot;]&#10;&#10;1. e4 e5 2. Nf3 Nc6 ...">${esc(state.draft)}</textarea>`,
    samples: `<div class="samples">${SAMPLES.map((s) => `<button class="sample" data-sample="${s.id}"><strong>${esc(s.title)}</strong><span class="faint">${esc(s.pgn.split('\n\n')[1].slice(0, 70))}…</span></button>`).join('')}</div>`,
    file: `<label class="dropzone" id="drop"><input type="file" id="file" accept=".pgn,.txt" hidden />PGN 파일을 끌어다 놓거나 <u>눌러서 선택</u>하세요.<br><span class="faint">여러 게임이 들어 있으면 첫 게임을 분석합니다.</span></label>`,
    chesscom: renderAccountPanel('chesscom'),
    lichessUser: renderAccountPanel('lichess'),
    lichess: `<input class="text" id="lichess" placeholder="https://lichess.org/abcd1234" value="${esc(state.lichessUrl)}" /><p class="faint">공개된 Lichess 게임 링크를 넣으면 기보를 불러옵니다.</p>`,
  }[state.tab];

  app.innerHTML = `
    <section class="hero">
      <h1>이 수, 어떤 스타일일까?</h1>
      <p>기보를 넣거나 Chess.com·Lichess 아이디를 입력하면 모든 수를 공격적·도박수·포지셔널·수비적 등 19가지 스타일로 평가하고, 플레이어의 성향을 분석합니다. 계산은 전부 브라우저 안에서 이뤄집니다.</p>
    </section>
    <div class="card input-card">
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>
      <div class="input-foot">
        <div class="depth"><span class="muted">분석 깊이</span>
          <div class="seg">${DEPTHS.map((d) => `<button data-depth="${d.depth}" class="${state.depth === d.depth ? 'active' : ''}" title="${d.hint}">${d.label}</button>`).join('')}</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          ${state.inputError ? `<span class="error">${esc(state.inputError)}</span>` : ''}
          ${['paste', 'file', 'lichess'].includes(state.tab) ? `<button class="btn primary" id="go">분석 시작</button>` : ''}
        </div>
      </div>
    </div>
    <div class="features">
      <div class="feature"><h3>19가지 스타일</h3><p>공격적, 전술적, 예방적, 긴장 유지, 복잡화… 한 수가 여러 스타일을 동시에 가질 수 있습니다.</p></div>
      <div class="feature"><h3>희생 · 함정 · 도박</h3><p>Stockfish와 자체 탐색으로 위험한 수가 건전한지, 상대의 실수를 노린 수인지 가립니다.</p></div>
      <div class="feature"><h3>내 스타일 찾기</h3><p>Chess.com·Lichess 아이디로 최근 게임을 불러와 여러 판을 종합한 내 플레이 스타일을 봅니다.</p></div>
    </div>`;

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => { saveDraft(); state.tab = b.dataset.tab as InputTab; state.inputError = null; renderInput(); });
  app.querySelectorAll<HTMLButtonElement>('[data-depth]').forEach((b) => b.onclick = () => { saveDraft(); state.depth = Number(b.dataset.depth); renderInput(); });
  app.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) => b.onclick = () => startAnalysis(SAMPLES.find((s) => s.id === b.dataset.sample)!.pgn));
  $('#go')?.addEventListener('click', onGo);
  bindAccountPanel();
  const file = $<HTMLInputElement>('#file'), drop = $('#drop');
  if (file && drop) {
    const read = async (f: File) => { state.draft = await f.text(); startAnalysis(firstGame(state.draft)); };
    file.onchange = () => file.files?.[0] && read(file.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files[0]; if (f) read(f); };
  }
}

function saveDraft() {
  const ta = $<HTMLTextAreaElement>('#pgn'); if (ta) state.draft = ta.value;
  const li = $<HTMLInputElement>('#lichess'); if (li) state.lichessUrl = li.value;
}

/** 여러 게임이 든 PGN에서 첫 게임만 */
function firstGame(text: string) {
  const parts = text.trim().split(/\n\s*\n(?=\[Event )/);
  return parts[0];
}

async function onGo() {
  saveDraft();
  if (state.tab === 'lichess') {
    const id = state.lichessUrl.match(/lichess\.org\/([a-zA-Z0-9]{8})/)?.[1];
    if (!id) { state.inputError = 'Lichess 게임 링크 형식이 아닙니다 (예: https://lichess.org/abcd1234)'; renderInput(); return; }
    try {
      const res = await fetch(`https://lichess.org/game/export/${id}?clocks=true&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(String(res.status));
      startAnalysis(await res.text());
    } catch {
      state.inputError = '게임을 불러오지 못했습니다. 공개된 게임인지 확인해 주세요.'; renderInput();
    }
    return;
  }
  startAnalysis(state.draft);
}

// ───────────── 아이디로 불러오기 ─────────────

const TIME_LABEL: Record<string, string> = { bullet: '불릿', blitz: '블리츠', rapid: '래피드', classical: '클래식', daily: '데일리', ultraBullet: '울트라불릿' };
const RESULT_LABEL = { win: '승', loss: '패', draw: '무' } as const;
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

function renderAccountPanel(source: Source): string {
  const a = state.account?.source === source ? state.account : null;
  const list = a ? a.games.filter((g) => a.timeFilter === 'all' || g.timeClass === a.timeFilter) : [];
  const classes = a ? [...new Set(a.games.map((g) => g.timeClass))] : [];
  const rows = list.map((g) => {
    const opp = g.userColor === 'w' ? g.black : g.white;
    const r = userResult(g);
    return `<tr data-row="${esc(g.id)}" class="${a!.selected.has(g.id) ? 'picked' : ''}">
      <td class="pick-cell"><input type="checkbox" class="pick" data-pick="${esc(g.id)}" ${a!.selected.has(g.id) ? 'checked' : ''} aria-label="선택" /></td>
      <td class="faint">${fmtDate(g.date)}</td>
      <td><span class="side-dot ${g.userColor}" title="${g.userColor === 'w' ? '백' : '흑'}"></span></td>
      <td>${esc(opp.name)}${opp.rating ? ` <span class="faint">(${opp.rating})</span>` : ''}</td>
      <td class="res-${r ?? 'none'}">${r ? RESULT_LABEL[r] : '-'}</td>
      <td class="faint">${esc(TIME_LABEL[g.timeClass] ?? g.timeClass)}</td>
      <td class="opening-cell" title="${esc(g.opening ?? '')}">${esc(g.opening ?? '')}</td>
      <td><button class="btn small" data-open="${esc(g.id)}">분석</button></td>
    </tr>`;
  }).join('');
  const n = a?.selected.size ?? 0;
  return `
    <div class="account">
      <form class="account-form" id="account-form">
        <input class="text" id="account-user" placeholder="${SOURCE_LABEL[source]} 아이디" value="${esc(a?.user ?? '')}" autocomplete="off" />
        <button class="btn primary" type="submit" ${a?.loading ? 'disabled' : ''}>${a?.loading ? '불러오는 중…' : '게임 불러오기'}</button>
      </form>
      ${a?.error ? `<p class="error">${esc(a.error)}</p>` : ''}
      ${a && a.games.length ? `
        <div class="account-tools">
          <div class="chips">${['all', ...classes].map((c) => `<button class="chip ${a.timeFilter === c ? 'chip-on' : ''}" data-tf="${c}">${c === 'all' ? '전체' : esc(TIME_LABEL[c] ?? c)}</button>`).join('')}</div>
          <div class="pick-tools">
            <button class="ghost" id="pick-all">${list.length && list.every((g) => a.selected.has(g.id)) ? '모두 해제' : `모두 선택 (${list.length})`}</button>
            <button class="ghost" id="pick-recent">최근 10판</button>
          </div>
        </div>
        <div class="game-table-wrap"><table class="game-table">${rows}</table></div>
        <div class="account-foot">
          ${a.next ? `<button class="btn" id="more" ${a.loading ? 'disabled' : ''}>더 불러오기</button>` : '<span class="faint">더 이상 게임이 없습니다</span>'}
          <div class="depth"><span class="muted">종합 분석 깊이</span>
            <div class="seg">${DEPTHS.map((d) => `<button data-bdepth="${d.depth}" class="${state.batchDepth === d.depth ? 'active' : ''}">${d.label}</button>`).join('')}</div>
          </div>
          <button class="btn primary" id="batch" ${n ? '' : 'disabled'}>선택한 ${n}판 종합 분석</button>
        </div>
        <p class="faint">"분석"은 한 판을 위 분석 깊이로 자세히 봅니다. 종합 분석은 고른 판들에서 ${esc(a.user)}의 수만 모아 성향을 냅니다. 이미 분석한 판은 이 브라우저에 저장돼 바로 나옵니다.</p>`
      : a && !a.loading && !a.error ? '<p class="faint">표준 체스 게임이 없습니다.</p>' : `<p class="faint">${SOURCE_LABEL[source]} 아이디를 넣으면 최근 게임 목록을 불러옵니다. 요청은 이 브라우저에서 ${SOURCE_LABEL[source]}로 바로 갑니다.</p>`}
    </div>`;
}

function bindAccountPanel() {
  const form = $<HTMLFormElement>('#account-form');
  if (!form) return;
  const source: Source = state.tab === 'chesscom' ? 'chesscom' : 'lichess';
  form.onsubmit = (e) => {
    e.preventDefault();
    const user = $<HTMLInputElement>('#account-user')!.value.trim();
    state.account = { source, user, games: [], next: null, loading: true, error: null, selected: new Set(), timeFilter: 'all' };
    renderInput();
    loadMore();
  };
  const a = state.account;
  if (!a || a.source !== source) return;
  $('#more')?.addEventListener('click', loadMore);
  app.querySelectorAll<HTMLButtonElement>('[data-tf]').forEach((b) => b.onclick = () => { a.timeFilter = b.dataset.tf!; renderInput(); });
  const visible = () => a.games.filter((g) => a.timeFilter === 'all' || g.timeClass === a.timeFilter);
  /** 선택이 바뀌면 체크 상태·버튼 글자만 바꾼다 (전체를 다시 그리지 않아 스크롤이 유지됨) */
  const syncSelection = () => {
    app.querySelectorAll<HTMLInputElement>('[data-pick]').forEach((c) => {
      const on = a.selected.has(c.dataset.pick!);
      c.checked = on;
      c.closest('tr')?.classList.toggle('picked', on);
    });
    const n = a.selected.size, v = visible();
    const batch = $<HTMLButtonElement>('#batch');
    if (batch) { batch.disabled = !n; batch.textContent = `선택한 ${n}판 종합 분석`; }
    const all = $('#pick-all');
    if (all) all.textContent = v.length && v.every((g) => a.selected.has(g.id)) ? '모두 해제' : `모두 선택 (${v.length})`;
  };
  const toggle = (id: string, on: boolean) => { if (on) a.selected.add(id); else a.selected.delete(id); syncSelection(); };
  app.querySelectorAll<HTMLInputElement>('[data-pick]').forEach((c) => c.onchange = () => toggle(c.dataset.pick!, c.checked));
  // 행의 빈 곳을 눌러도 선택 (버튼·체크박스 자체는 제외)
  app.querySelectorAll<HTMLTableRowElement>('tr[data-row]').forEach((tr) => tr.onclick = (e) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    toggle(tr.dataset.row!, !a.selected.has(tr.dataset.row!));
  });
  $('#pick-all')?.addEventListener('click', () => {
    const v = visible();
    const allOn = v.length > 0 && v.every((g) => a.selected.has(g.id));
    for (const g of v) if (allOn) a.selected.delete(g.id); else a.selected.add(g.id);
    syncSelection();
  });
  $('#pick-recent')?.addEventListener('click', () => {
    a.selected = new Set(visible().slice(0, 10).map((g) => g.id));
    syncSelection();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-bdepth]').forEach((b) => b.onclick = () => { state.batchDepth = Number(b.dataset.bdepth); renderInput(); });
  app.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => b.onclick = () => {
    const g = a.games.find((x) => x.id === b.dataset.open)!;
    startAnalysis(g.pgn, { focus: g.userColor, source: g.source, url: g.url, date: g.date });
  });
  $('#batch')?.addEventListener('click', () => startBatch(a.games.filter((g) => a.selected.has(g.id))));
}

async function loadMore() {
  const a = state.account; if (!a) return;
  a.loading = true; a.error = null; renderInput();
  try {
    const page = await fetchGames(a.source, a.user, a.games.length ? a.next : null);
    if (state.account !== a) return;
    a.games.push(...page.games); a.next = page.next;
  } catch (err) {
    if (state.account !== a) return;
    a.error = err instanceof Error && err.name !== 'TypeError' ? err.message : `${SOURCE_LABEL[a.source]}에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.`;
  }
  a.loading = false;
  if (state.view === 'analyze' && !state.game && !state.batch) renderInput();
}

// ───────────── 여러 판 종합 분석 ─────────────

function startBatch(games: OnlineGame[]) {
  if (!games.length || !state.account) return;
  state.batch = {
    source: state.account.source, user: state.account.user, games, results: new Map(),
    current: 0, progress: [0, 1], depth: state.batchDepth, error: null, cancelled: false, run: null,
  };
  state.game = null;
  render();
  runBatch(state.batch);
}

async function runBatch(b: BatchState) {
  for (let i = 0; i < b.games.length; i++) {
    if (b.cancelled || state.batch !== b) return;
    b.current = i; b.progress = [0, 1];
    updateBatch();
    const g = b.games[i];
    const key = cacheKey(g.pgn, b.depth);
    let result = await getCached(key);
    if (!result) {
      // 한 판씩 보는 분석(state.run)과 별개로 돈다
      const run = new AnalysisRun({ onProgress: (d, t) => { b.progress = [d, t]; updateBatchProgress(); }, onMove: () => {} });
      b.run = run;
      try { result = await run.start(g.pgn, b.depth); } catch (err) {
        if (b.cancelled) return;
        b.error = `${i + 1}번째 게임 분석 실패: ${err instanceof Error ? err.message : err}`;
        continue;
      }
      putCached(key, result);
    }
    if (b.cancelled || state.batch !== b) return;
    b.results.set(g.id, result);
    // 종합 분석은 그 아이디 쪽 성향만 저장한다
    const pg = prepareGameQuiet(g.pgn);
    if (pg) saveProfiles({ ...pg, source: g.source, url: g.url, date: g.date, save: [g.userColor] }, result);
    updateBatch();
  }
  b.current = -1;
  updateBatch();
}

/** 고른 판들에서 그 아이디의 수만 모아 프로필을 만든다 */
function batchProfile(b: BatchState) {
  const moves: MoveAnalysis[] = [];
  const missed: { move: MoveAnalysis; game: string }[] = [];
  let w = 0, l = 0, d = 0, leftFirst = 0, withBook = 0;
  for (const g of b.games) {
    const r = b.results.get(g.id); if (!r) continue;
    moves.push(...r.moves.filter((m) => m.color === g.userColor));
    const opp = g.userColor === 'w' ? g.black : g.white;
    for (const m of findMissed(r.moves, g.userColor)) missed.push({ move: m, game: `vs ${opp.name} · ${fmtDate(g.date)}` });
    const res = userResult(g); if (res === 'win') w++; else if (res === 'loss') l++; else if (res === 'draw') d++;
    const p = r.profiles[g.userColor];
    if (p.opening.leftBookFirst != null) { withBook++; if (p.opening.leftBookFirst) leftFirst++; }
  }
  return {
    profile: moves.length ? buildProfile(moves) : null,
    record: { w, l, d }, leftFirst, withBook,
    missed: missed.sort((x, y) => y.move.deep.winDrop - x.move.deep.winDrop),
  };
}

function renderBatch() {
  const b = state.batch!;
  app.innerHTML = `
    <div class="game-head">
      <div class="players">${esc(b.user)} <span class="faint">· ${SOURCE_LABEL[b.source]} · ${b.games.length}판 종합</span></div>
      <div class="progress" id="batch-progress"></div>
      <button class="btn" id="batch-back">게임 목록</button>
    </div>
    <div class="batch">
      <div id="batch-profile"></div>
      <div class="card card-pad">
        <div class="section-title">분석한 게임</div>
        <div class="game-table-wrap"><table class="game-table" id="batch-games"></table></div>
      </div>
    </div>`;
  $('#batch-back')!.onclick = () => {
    b.cancelled = true; b.run?.cancel(); state.batch = null;
    state.tab = b.source === 'chesscom' ? 'chesscom' : 'lichessUser';
    render();
  };
  updateBatch();
}

function updateBatchProgress() {
  const b = state.batch, el = $('#batch-progress'); if (!b || !el) return;
  const done = b.results.size;
  if (b.current < 0) { el.innerHTML = `<span class="faint">분석 완료 · ${done}/${b.games.length}판 · 깊이 ${b.depth}</span>${b.error ? ` <span class="error">${esc(b.error)}</span>` : ''}`; return; }
  const [d, t] = b.progress;
  const frac = (done + (t ? d / t : 0)) / b.games.length;
  el.innerHTML = `<span class="faint">${b.current + 1}/${b.games.length}판 분석 중</span><div class="bar"><i style="width:${frac * 100}%"></i></div>`;
}

function updateBatch() {
  const b = state.batch; if (!b || state.game) return;
  updateBatchProgress();
  const agg = batchProfile(b);
  const pe = $('#batch-profile');
  if (pe) {
    if (!agg.profile) pe.innerHTML = '<div class="card card-pad muted">첫 게임을 분석하고 있습니다. 끝난 게임부터 프로필에 반영됩니다…</div>';
    else {
      const extra = `
        <div class="stats">
          <div class="stat"><b>${agg.record.w}승 ${agg.record.d}무 ${agg.record.l}패</b><span>분석한 ${b.results.size}판</span></div>
          <div class="stat"><b>${agg.withBook ? Math.round((agg.leftFirst / agg.withBook) * 100) : 0}%</b><span>먼저 이론을 벗어난 비율</span></div>
          <div class="stat"><b>${agg.profile.counted}</b><span>평가한 수 (이론·강제 제외)</span></div>
        </div>
        ${agg.missed.length ? `<div><button class="btn" id="batch-quiz">🧩 놓친 기회 퀴즈 ${agg.missed.length}문제</button></div>` : ''}
        ${openingSection(b.games.filter((g) => b.results.has(g.id)).map((g) => { const r = b.results.get(g.id)!; return { opening: r.opening?.name ?? g.opening, profile: r.profiles[g.userColor] }; }))}`;
      pe.innerHTML = profileCard(agg.profile, null, {}, { name: b.user, sub: `${SOURCE_LABEL[b.source]} · ${b.results.size}판 종합`, extra, color: '#b5562d' });
      $('#batch-quiz')?.addEventListener('click', () => openQuiz(agg.missed.slice(0, 30)));
    }
  }
  const ge = $('#batch-games');
  if (ge) {
    ge.innerHTML = b.games.map((g, i) => {
      const r = b.results.get(g.id);
      const opp = g.userColor === 'w' ? g.black : g.white;
      const res = userResult(g);
      const p = r?.profiles[g.userColor];
      const status = r ? `<span class="faint">${esc(p!.archetype.name)} · 정확도 ${p!.accuracy}%</span>` : i === b.current ? '<span class="faint">분석 중…</span>' : '<span class="faint">대기</span>';
      return `<tr>
        <td class="faint">${fmtDate(g.date)}</td>
        <td><span class="side-dot ${g.userColor}"></span></td>
        <td>${esc(opp.name)}</td>
        <td class="res-${res ?? 'none'}">${res ? RESULT_LABEL[res] : '-'}</td>
        <td class="opening-cell">${esc(r?.opening?.name ?? g.opening ?? '')}</td>
        <td>${status}</td>
        <td>${r ? `<button class="btn small" data-review="${esc(g.id)}">보기</button>` : ''}</td>
      </tr>`;
    }).join('');
    ge.querySelectorAll<HTMLButtonElement>('[data-review]').forEach((btn) => btn.onclick = () => {
      const g = b.games.find((x) => x.id === btn.dataset.review)!;
      // 종합 분석 중에 이미 저장했으므로 다시 저장하지 않는다
      showAnalyzed(g.pgn, b.results.get(g.id)!, { focus: g.userColor, source: g.source, url: g.url, date: g.date, save: [] });
    });
  }
}

// ───────────── 분석 실행 ─────────────

interface StartOptions {
  focus?: 'w' | 'b';
  source?: PlayerSource;
  url?: string | null;
  date?: number | null;
  save?: ('w' | 'b')[];
}

/** PGN 헤더 날짜(2026.10.07) → ms */
function headerDate(h: Record<string, string>): number | null {
  const m = (h.UTCDate ?? h.Date ?? '').match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 분석이 끝난 게임의 플레이어 성향을 프로필 메뉴에 저장 */
function saveProfiles(g: GameState, result: GameAnalysis) {
  const h = g.headers;
  const res = h.Result ?? '*';
  for (const c of g.save) {
    const name = h[c === 'w' ? 'White' : 'Black'];
    if (!isNamed(name)) continue;
    const opponent = h[c === 'w' ? 'Black' : 'White'] ?? '?';
    const outcome = res === '1/2-1/2' ? 'draw' : res === '1-0' ? (c === 'w' ? 'win' : 'loss') : res === '0-1' ? (c === 'b' ? 'win' : 'loss') : null;
    const ok = savePlayerGame(g.source, name, {
      gameId: gameHash(g.pgn), date: g.date ?? headerDate(h), savedAt: Date.now(), color: c, opponent, result: outcome,
      opening: result.opening?.name ?? h.Opening ?? null, depth: result.depth, url: g.url, profile: result.profiles[c],
    });
    if (!ok) state.storageFull = true;
  }
}

/** 기보를 읽어 리뷰 화면 상태를 만든다 */
function prepareGame(pgn: string, opts: StartOptions): GameState | null {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch (e) {
    state.inputError = `기보를 읽을 수 없습니다: ${e instanceof Error ? e.message.split('\n')[0] : e}`; state.view = 'analyze'; render(); return null;
  }
  const history = chess.history({ verbose: true });
  if (!history.length) { state.inputError = '수가 하나도 없는 기보입니다.'; render(); return null; }
  state.inputError = null;
  state.orientation = opts.focus === 'b' ? 'black' : 'white';
  state.view = 'analyze';
  return {
    pgn, headers: chess.getHeaders() as Record<string, string>, startFen: history[0].before,
    plies: history.map((m, i) => ({ san: m.san, color: m.color, from: m.from, to: m.to, fenAfter: m.after, moveNumber: Math.floor(i / 2) + 1 })),
    results: [], analysis: null, progress: [0, history.length + 1], ply: -1, error: null,
    focus: opts.focus ?? null, fromCache: false,
    source: opts.source ?? 'pgn', url: opts.url ?? null, date: opts.date ?? null, save: opts.save ?? ['w', 'b'], variation: null,
  };
}

/** 화면을 바꾸지 않고 헤더만 읽는다 (저장용) */
function prepareGameQuiet(pgn: string): GameState | null {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return null; }
  return {
    pgn, headers: chess.getHeaders() as Record<string, string>, startFen: '', plies: [], results: [], analysis: null,
    progress: [1, 1], ply: -1, error: null, focus: null, fromCache: true, source: 'pgn', url: null, date: null, save: [], variation: null,
  };
}

/** 이미 분석된 결과를 바로 보여준다 */
function showAnalyzed(pgn: string, result: GameAnalysis, opts: StartOptions = {}) {
  const g = prepareGame(pgn, opts); if (!g) return;
  state.run?.cancel();
  g.analysis = result; g.results = result.moves; g.progress = [1, 1]; g.fromCache = true; g.ply = 0;
  saveProfiles(g, result);
  state.game = g;
  render();
  window.scrollTo({ top: 0 });
}

async function startAnalysis(pgn: string, opts: StartOptions = {}) {
  const prepared = prepareGame(pgn, opts); if (!prepared) return;
  state.run?.cancel();
  // 같은 기보·같은 깊이로 분석한 적이 있으면 저장된 결과를 바로 보여준다
  const key = cacheKey(pgn, state.depth);
  const cached = await getCached(key);
  if (cached) { showAnalyzed(pgn, cached, opts); return; }

  state.game = prepared;
  render();
  window.scrollTo({ top: 0 });

  const game = prepared;
  const run = new AnalysisRun({
    onProgress: (done, total) => { if (state.game !== game) return; game.progress = [done, total]; updateProgress(); },
    onMove: (m) => {
      if (state.game !== game) return;
      game.results[m.ply] = m;
      updateMoveList(); updateGraph(); updateOpening();
      if (game.ply === m.ply || (game.ply === -1 && m.ply === 0)) { if (game.ply === -1) game.ply = 0; updatePosition(); }
    },
  });
  state.run = run;
  run.start(pgn, state.depth)
    .then((result) => {
      putCached(key, result);
      saveProfiles(game, result);
      if (state.game !== game) return;
      game.analysis = result; game.results = result.moves; game.progress = [1, 1];
      updateProgress(); updateMoveList(); updateGraph(); updateCard(); renderProfiles(); updateOpening();
    })
    .catch((err) => { if (state.game === game) { game.error = String(err.message ?? err); updateProgress(); } });
}

// ───────────── 리뷰 화면 ─────────────

function renderReview() {
  const g = state.game!;
  const h = g.headers;
  app.innerHTML = `
    <div class="game-head">
      <div class="players">
        <span class="side-dot w"></span>${esc(playerName(h, 'w'))}
        <span class="faint">vs</span>
        <span class="side-dot b"></span>${esc(playerName(h, 'b'))}
        ${h.Result && h.Result !== '*' ? `<span class="chip">${esc(h.Result)}</span>` : ''}
      </div>
      <span class="chip opening-chip" id="opening-chip" hidden></span>
      <span class="faint">${esc([h.Event, h.Date].filter((x) => x && !x.includes('?')).join(' · '))}</span>
      <div class="progress" id="progress"></div>
      <span class="head-extras" id="head-extras"></span>
      ${state.batch ? '<button class="btn" id="to-batch">← 종합 프로필</button>' : ''}
      <button class="btn" id="share" title="이 기보를 담은 링크를 복사합니다">공유 링크</button>
      <button class="btn" id="new">새 기보</button>
    </div>
    <div class="review">
      <div class="board-col">
        <div class="board-wrap"><div class="cg" id="board"></div></div>
        <div class="board-controls">
          <button class="btn" data-go="first" aria-label="처음">⏮</button>
          <button class="btn" data-go="prev" aria-label="이전">◀</button>
          <button class="btn" data-go="next" aria-label="다음">▶</button>
          <button class="btn" data-go="last" aria-label="마지막">⏭</button>
          <button class="btn" data-go="flip" aria-label="보드 뒤집기">⇅</button>
        </div>
        <div class="card graph-card"><div class="graph" id="graph"></div><div class="faint">백 기대 점수(Stockfish 승/무/패 확률) · 보라 점: 희생·함정·도박 · 빨강/주황: 블런더·실수</div></div>
      </div>
      <div class="card move-card" id="card"></div>
      <div class="card movelist-wrap"><table class="movelist" id="moves"></table></div>
    </div>
    <div class="profiles" id="profiles"></div>`;

  cg = Chessground($('#board')!, {
    fen: g.startFen, viewOnly: true, coordinates: true, orientation: state.orientation,
    animation: { enabled: true, duration: 180 },
    drawable: { enabled: false, visible: true },
  });
  $('#new')!.onclick = () => {
    state.run?.cancel(); state.game = null;
    if (state.batch) { state.batch.cancelled = true; state.batch.run?.cancel(); state.batch = null; }
    render();
  };
  $('#to-batch')?.addEventListener('click', () => { state.run?.cancel(); state.game = null; render(); });
  $('#share')!.onclick = () => shareGame(g);
  app.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go!));
  $('#graph')!.onclick = (e) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * g.plies.length) - 1;
    select(Math.max(-1, Math.min(g.plies.length - 1, i)));
  };
  updateProgress(); updateMoveList(); updateGraph(); updatePosition(); updateOpening();
  if (g.analysis) renderProfiles();
}

/** 기보를 담은 링크를 공유(모바일)하거나 복사한다 */
async function shareGame(g: GameState) {
  const btn = $<HTMLButtonElement>('#share'); if (!btn) return;
  const url = await shareUrl(g.pgn, g.analysis?.depth ?? state.depth);
  const title = `${playerName(g.headers, 'w')} vs ${playerName(g.headers, 'b')} — Stylish`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, url }); return; } catch { /* 취소하면 복사로 */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = '링크 복사됨 ✓';
    setTimeout(() => { if (btn.isConnected) btn.textContent = '공유 링크'; }, 2000);
  } catch { prompt('이 링크를 복사하세요', url); }
}

/** 헤더의 오프닝 이름 (분석 중에는 지금까지 도달한 이론 국면 기준) */
function updateOpening() {
  const g = state.game, el = $('#opening-chip'); if (!g || !el) return;
  let o = g.analysis?.opening ?? null;
  if (!o) for (const r of g.results) { if (!r || !r.book) break; if (r.opening) o = r.opening; }
  el.hidden = !o;
  if (o) el.textContent = `📖 ${o.eco} ${o.name}`;
}

/** 분석이 끝나면 머리줄에 명수 카드·퀴즈 버튼 */
function updateHeadExtras() {
  const g = state.game, el = $('#head-extras'); if (!g?.analysis || !el) return;
  const side = g.focus ?? undefined;
  const missed = findMissed(g.analysis.moves, side);
  const hl = pickHighlights(g.analysis.moves, side);
  el.innerHTML = `${hl.length ? '<button class="btn" id="highlights">✨ 명수 카드</button>' : ''}${missed.length ? `<button class="btn" id="quiz">🧩 놓친 기회 ${missed.length}</button>` : ''}`;
  $('#highlights')?.addEventListener('click', () => openHighlights(g));
  $('#quiz')?.addEventListener('click', () => openQuiz(missed.map((m) => ({ move: m }))));
}

/** 이 판의 명수를 카드 이미지로 보여주고 저장·공유한다 */
async function openHighlights(g: GameState) {
  const hl = pickHighlights(g.analysis!.moves, g.focus ?? undefined);
  const body = openModal('이 판의 명수', `<p class="faint">${g.focus ? `${esc(playerName(g.headers, g.focus))}의 수 중 ` : ''}희생·함정·조용한 결정타 등 인상적인 수를 골랐습니다. 이미지를 저장해 공유해 보세요.</p><div class="hl-list">${hl.map((_, i) => `<div class="hl-item" data-hl="${i}"><div class="hl-img faint">그리는 중…</div></div>`).join('')}</div>`);
  const info = { white: playerName(g.headers, 'w'), black: playerName(g.headers, 'b'), event: [g.headers.Event, g.headers.Date].filter((x) => x && !x.includes('?')).join(' · '), flip: state.orientation === 'black' };
  for (let i = 0; i < hl.length; i++) {
    const item = body.querySelector<HTMLElement>(`[data-hl="${i}"]`)!;
    try {
      const cv = await drawCard(hl[i], info);
      const blob = await cardBlob(cv);
      const url = URL.createObjectURL(blob);
      const name = `stylish-${hl[i].move.moveNumber}${hl[i].move.color}-${hl[i].move.san.replace(/[^\w]/g, '')}.png`;
      item.innerHTML = `<img class="hl-img" src="${url}" alt="${esc(hl[i].move.san)} 카드" />
        <div class="hl-actions"><a class="btn small" href="${url}" download="${name}">이미지 저장</a>${navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] }) ? '<button class="btn small" data-share-img>공유</button>' : ''}<button class="btn small" data-goto="${hl[i].move.ply}">보드에서 보기</button></div>`;
      item.querySelector<HTMLButtonElement>('[data-share-img]')?.addEventListener('click', () => navigator.share({ files: [new File([blob], name, { type: 'image/png' })] }).catch(() => {}));
      item.querySelector<HTMLButtonElement>('[data-goto]')!.onclick = () => { (body.closest('.modal-backdrop') as HTMLElement & { close?: () => void })?.close?.(); select(hl[i].move.ply); };
    } catch { item.innerHTML = '<p class="error">이미지를 만들지 못했습니다.</p>'; }
  }
}

/** 변화 수순 보기: start 국면에서 sans를 차례로 둔다 */
function openVariation(title: string, ply: number, startFen: string, sans: string[]) {
  const g = state.game; if (!g) return;
  const ch = new Chess(startFen);
  const fens: string[] = [], moves: [string, string][] = [], ok: string[] = [];
  for (const san of sans) {
    try { const mv = ch.move(san); fens.push(ch.fen()); moves.push([mv.from, mv.to]); ok.push(mv.san); } catch { break; }
  }
  if (!ok.length) return;
  g.variation = { title, ply, startFen, sans: ok, fens, moves, idx: 1 };
  updatePosition();
}

function stepVariation(to: number | 'exit') {
  const g = state.game; if (!g?.variation) return;
  if (to === 'exit') { g.variation = null; updatePosition(); return; }
  g.variation.idx = Math.max(0, Math.min(g.variation.sans.length, to));
  updatePosition();
}

function go(where: string) {
  const g = state.game; if (!g) return;
  if (g.variation && where !== 'flip') {
    const v = g.variation;
    if (where === 'prev') return stepVariation(v.idx - 1);
    if (where === 'next') return stepVariation(v.idx + 1);
    g.variation = null;
  }
  if (where === 'flip') { state.orientation = state.orientation === 'white' ? 'black' : 'white'; cg?.set({ orientation: state.orientation }); return; }
  const n = g.plies.length;
  select(where === 'first' ? -1 : where === 'last' ? n - 1 : where === 'prev' ? Math.max(-1, g.ply - 1) : Math.min(n - 1, g.ply + 1));
}

function select(ply: number) {
  if (!state.game) return;
  state.game.ply = ply;
  state.game.variation = null;
  updatePosition();
  $(`.mv[data-ply="${ply}"]`)?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (e) => {
  if (!state.game || state.view !== 'analyze' || (e.target as HTMLElement).matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') { go('prev'); e.preventDefault(); }
  if (e.key === 'ArrowRight') { go('next'); e.preventDefault(); }
  if (e.key === 'Home') go('first');
  if (e.key === 'End') go('last');
  if (e.key === 'Escape' && state.game.variation && !document.querySelector('.modal-backdrop')) stepVariation('exit');
});

function updateProgress() {
  const g = state.game, el = $('#progress'); if (!g || !el) return;
  if (g.error) { el.innerHTML = `<span class="error">분석 오류: ${esc(g.error)}</span>`; return; }
  if (g.analysis) { el.innerHTML = `<span class="faint">분석 완료 · 깊이 ${g.analysis.depth}</span>`; updateHeadExtras(); return; }
  const [d, t] = g.progress;
  el.innerHTML = `<span class="faint">${d === 0 ? '엔진 준비 중…' : `분석 중 ${Math.max(0, d - 1)}/${t - 1}수`}</span><div class="bar"><i style="width:${(d / t) * 100}%"></i></div>`;
}

function updatePosition() {
  const g = state.game; if (!g || !cg) return;
  const v = g.variation;
  if (v) {
    const fen = v.idx ? v.fens[v.idx - 1] : v.startFen;
    const last = v.idx ? v.moves[v.idx - 1] : null;
    cg.set({
      fen, lastMove: last ? [last[0] as Key, last[1] as Key] : undefined,
      turnColor: fen.split(' ')[1] === 'w' ? 'white' : 'black', check: new Chess(fen).inCheck(), drawable: { autoShapes: [] },
    });
    updateCard();
    return;
  }
  const p = g.ply >= 0 ? g.plies[g.ply] : null;
  const m = g.ply >= 0 ? g.results[g.ply] : undefined;
  const shapes: { orig: Key; dest?: Key; brush: string }[] = [];
  if (m && m.deep.bestMove && !m.deep.isBest) shapes.push({ orig: m.deep.bestMove.slice(0, 2) as Key, dest: m.deep.bestMove.slice(2, 4) as Key, brush: 'paleGreen' });
  if (m?.trapLine) shapes.push({ orig: m.trapLine.replyUci.slice(0, 2) as Key, dest: m.trapLine.replyUci.slice(2, 4) as Key, brush: 'red' });
  cg.set({
    fen: p ? p.fenAfter : g.startFen,
    lastMove: p ? [p.from as Key, p.to as Key] : undefined,
    turnColor: p ? (p.color === 'w' ? 'black' : 'white') : 'white',
    check: p ? /[+#]/.test(p.san) : false,
    drawable: { autoShapes: shapes },
  });
  document.querySelectorAll('.mv.active').forEach((el) => el.classList.remove('active'));
  $(`.mv[data-ply="${g.ply}"]`)?.classList.add('active');
  updateCard(); updateGraph();
}

function updateMoveList() {
  const g = state.game, el = $('#moves'); if (!g || !el) return;
  const rows: string[] = [];
  for (let i = 0; i < g.plies.length; i += 2) {
    const cell = (j: number) => {
      const p = g.plies[j]; if (!p) return '<td></td>';
      const m = g.results[j];
      const dot = m ? `<span class="dot" style="background:${styleColor(m.primary)}" title="${esc(styleLabel(m.primary))}"></span>` : '';
      const deviation = m && !m.book && j > 0 && g.results[j - 1]?.book;
      const cls = [m ? '' : 'pending', m?.book ? 'book' : '', g.ply === j ? 'active' : ''].join(' ');
      const title = m?.book ? '오프닝 이론' : deviation ? '이론 이탈' : '';
      return `<td><button class="mv ${cls}" data-ply="${j}" title="${title}">${dot}${esc(p.san)}${m ? glyph(m) : ''}${deviation ? '<span class="glyph g-dev">↳</span>' : ''}</button></td>`;
    };
    rows.push(`<tr><td class="no">${g.plies[i].moveNumber}.</td>${cell(i)}${cell(i + 1)}</tr>`);
  }
  el.innerHTML = rows.join('');
  el.querySelectorAll<HTMLButtonElement>('.mv').forEach((b) => b.onclick = () => select(Number(b.dataset.ply)));
}

function updateGraph() {
  const g = state.game, el = $('#graph'); if (!g || !el) return;
  const done: MoveAnalysis[] = [];
  for (const r of g.results) { if (!r) break; done.push(r); }
  el.innerHTML = evalGraph(done, g.plies.length, g.ply);
}

function updateCard() {
  const g = state.game, el = $('#card'); if (!g || !el) return;
  if (g.ply < 0) {
    el.innerHTML = `<div><div class="section-title">시작 국면</div><p class="muted">수 목록에서 수를 누르거나 ← → 키로 이동하세요. 각 수의 스타일, 판단 근거, Stockfish 최선 수를 보여줍니다.</p>
      <p class="faint">색 점은 그 수의 대표 스타일, 기호는 품질(?! 부정확, ? 실수, ?? 블런더)과 위험 판정(! 건전한 희생, !? 무리한 희생, ⚂ 도박수, ⚑ 함정수)입니다.</p></div>`;
    return;
  }
  const p = g.plies[g.ply], m = g.results[g.ply];
  if (!m) { el.innerHTML = `<div class="mc-head"><span class="mc-num">${p.moveNumber}${p.color === 'w' ? '.' : '...'}</span><span class="mc-san">${esc(p.san)}</span></div><p class="muted">아직 분석 중입니다…</p>`; return; }

  const ranked = [...STYLE_KEYS].sort((a, b) => m.scores[b] - m.scores[a]).filter((k) => m.scores[k] > 0).slice(0, 6);
  const bars = ranked.map((k) => `
    <div class="sbar" title="${esc(HOW[k])}"><span>${STYLES[k].label}</span><div class="track"><i style="width:${m.scores[k]}%;background:${STYLES[k].color}"></i></div><span class="val">${m.scores[k]}</span></div>`).join('');
  const reasons = STYLE_KEYS.filter((k) => m.reasons[k].length).sort((a, b) => m.scores[b] - m.scores[a]).map((k) => `
    <div class="reason-group"><h4 style="color:${STYLES[k].color}">${STYLES[k].label} ${m.scores[k]}</h4>
      <ul>${m.reasons[k].map((r) => `<li class="${r.w < 0 ? 'neg' : ''}">${esc(r.why)} <span class="faint">(${r.w > 0 ? '+' : ''}${r.w})</span></li>`).join('')}</ul></div>`).join('');
  const choice = m.choiceDelta
    ? STYLE_KEYS.filter((k) => (m.choiceDelta![k] ?? 0) >= 15).sort((a, b) => m.choiceDelta![b]! - m.choiceDelta![a]!).slice(0, 3)
    : [];
  const evalAfter = fmtEval(m.evalWhiteAfter, m.mateAfter);
  const v = g.variation;
  const varPanel = v ? `
    <div class="variation">
      <div class="var-head"><strong>${esc(v.title)}</strong><button class="ghost small-x" data-var-exit title="실제 수순으로 돌아가기 (Esc)">✕</button></div>
      <div class="var-line">${v.sans.map((san, i) => {
        const fen = i ? v.fens[i - 1] : v.startFen;
        const white = fen.split(' ')[1] === 'w';
        const no = Number(fen.split(' ')[5]);
        const label = white ? `${no}. ` : i === 0 ? `${no}... ` : '';
        return `<button class="var-mv ${v.idx === i + 1 ? 'active' : ''}" data-var-idx="${i + 1}">${label}${esc(san)}</button>`;
      }).join('')}</div>
      <div class="var-controls"><button class="btn small" data-var-idx="${v.idx - 1}" ${v.idx ? '' : 'disabled'}>◀</button><button class="btn small" data-var-idx="${v.idx + 1}" ${v.idx < v.sans.length ? '' : 'disabled'}>▶</button><span class="faint">← → 키로 이동 · Esc로 돌아가기</span></div>
    </div>` : '';
  const varButtons = [
    m.trapLine ? `<button class="btn small" data-var="trap">${m.risk === 'gamble' ? '🎲' : '🪤'} 상대가 ${esc(m.trapLine.replySan)}를 뒀다면 ▶</button>` : '',
    !m.deep.isBest && m.bestPvSan.length ? `<button class="btn small" data-var="best">최선 수순 보기 ▶</button>` : '',
    m.playedPvSan.length ? `<button class="btn small" data-var="played">이후 예상 수순 ▶</button>` : '',
  ].join('');

  el.innerHTML = `${varPanel}
    <div class="mc-head">
      <span class="mc-num">${m.moveNumber}${m.color === 'w' ? '.' : '...'}</span>
      <span class="mc-san">${esc(m.san)}</span>
      ${m.quality ? `<span class="pill q-${m.quality}">${QUALITY_LABEL[m.quality]}</span>` : ''}
      ${m.forced ? '<span class="chip" title="선택의 여지가 거의 없던 수라 플레이어 평가에서 제외">강제된 수</span>' : ''}
    </div>
    ${m.risk ? `<div class="risk ${m.risk}"><strong>${RISK_LABEL[m.risk]}</strong><span>${esc(m.riskWhy)}</span></div>` : ''}
    ${varButtons ? `<div class="var-buttons">${varButtons}</div>` : ''}
    ${m.book ? `<div class="book-banner"><strong>📖 오프닝 이론${m.opening ? ` · ${esc(m.opening.eco)} ${esc(m.opening.name)}` : ''}</strong><span>누구나 두는 이론 수라 스타일은 참고용으로 흐리게 보여주고, 플레이어 평가에서는 뺍니다.</span></div>` : ''}
    ${!m.book && g.ply > 0 && g.results[g.ply - 1]?.book ? `<div class="book-banner dev"><strong>↳ 이론 이탈</strong><span>여기서부터 알려진 오프닝 이론을 벗어났습니다.</span></div>` : ''}
    <div class="${m.book ? 'dim' : ''}">
    <div>
      <div class="section-title">대표 스타일</div>
      <div class="primary-style"><span class="dot" style="background:${styleColor(m.primary)};width:14px;height:14px"></span><span class="label">${styleLabel(m.primary)}</span></div>
    </div>
    ${bars ? `<div><div class="section-title">스타일 점수</div><div class="style-bars">${bars}</div></div>` : ''}
    ${choice.length ? `<div><div class="section-title">비슷한 가치의 대안과 비교하면</div><div class="chips">${choice.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>더 ${STYLES[k].label}인 선택</span>`).join('')}</div></div>` : ''}
    </div>
    <div class="engine-box">
      <div class="kv"><span>평가 (백 기준)</span><b>${evalAfter}</b></div>
      <div class="kv"><span>손실</span><span>${m.cpLoss}cp</span></div>
      ${m.spent != null ? `<div class="kv"><span>소요 시간 · 남은 시간</span><span>${fmtSec(m.spent)} · ${m.clock != null ? fmtClock(m.clock) : '-'}${m.lowTime ? ' <span class="chip warn-chip">시간 부족</span>' : ''}</span></div>` : ''}
      ${!m.deep.isBest && m.bestSan ? `<div class="kv"><span>Stockfish 최선 수</span><b>${esc(m.bestSan)}</b></div><div class="line">${esc(m.bestPvSan.join(' '))}</div>` : ''}
      ${m.playedPvSan.length ? `<div class="faint">이후 예상 수순</div><div class="line">${esc(m.playedPvSan.join(' '))}</div>` : ''}
    </div>
    ${reasons ? `<details class="reasons"><summary>판단 근거 보기</summary>${reasons}</details>` : ''}`;
  el.querySelectorAll<HTMLButtonElement>('[data-var]').forEach((b) => b.onclick = () => {
    if (b.dataset.var === 'trap' && m.trapLine) openVariation(`상대가 ${m.trapLine.replySan}(을)를 뒀다면`, g.ply, m.fenAfter, [m.trapLine.replySan, ...m.trapLine.line]);
    if (b.dataset.var === 'best') openVariation(`최선 수 ${m.bestSan ?? ''} 수순`, g.ply, m.fenBefore, m.bestPvSan);
    if (b.dataset.var === 'played') openVariation('이후 예상 수순 (Stockfish)', g.ply, m.fenAfter, m.playedPvSan);
  });
  el.querySelectorAll<HTMLButtonElement>('[data-var-idx]').forEach((b) => b.onclick = () => stepVariation(Number(b.dataset.varIdx)));
  el.querySelector<HTMLButtonElement>('[data-var-exit]')?.addEventListener('click', () => stepVariation('exit'));
}

// ───────────── 플레이어 프로필 ─────────────


function renderProfiles() {
  const g = state.game, el = $('#profiles'); if (!g?.analysis || !el) return;
  const order: ('w' | 'b')[] = g.focus === 'b' ? ['b', 'w'] : ['w', 'b'];
  el.innerHTML = order.map((c) => profileCard(g.analysis!.profiles[c], c, g.headers, { focus: g.focus === c })).join('');
}

interface CardOptions { name?: string; sub?: string; extra?: string; color?: string; focus?: boolean }

function profileCard(p: PlayerProfile, c: 'w' | 'b' | null, h: Record<string, string>, o: CardOptions = {}) {
  const color = o.color ?? (c === 'b' ? '#5b6ee1' : '#c9a227');
  const name = o.name ?? (c ? playerName(h, c) : '');
  const sub = o.sub ?? `${c === 'w' ? '백' : '흑'} · 평가 대상 ${p.counted}/${p.moves}수`;
  const op = p.opening;
  const openingHtml = c && (op.bookMoves || op.deviation)
    ? `<div><div class="section-title">오프닝</div><p class="muted" style="margin:0">이론 ${op.bookMoves}수${op.leftBookFirst === true && op.deviation ? ` · 먼저 이론을 벗어남: ${op.deviation.moveNumber}${c === 'w' ? '.' : '...'} ${esc(op.deviation.san)}${op.deviation.quality ? ` (${QUALITY_LABEL[op.deviation.quality]})` : ''}` : op.leftBookFirst === false ? ' · 상대가 먼저 이론을 벗어남' : ''}</p></div>`
    : '';
  // 그룹 점수는 그룹 안 상위 2개 평균을 0~100으로 강조
  const axes = GROUP_AXES.map((a) => ({ label: a.label, value: groupScore(p.avg, a.keys) }));
  const top = p.top.map((k) => `<div class="sbar" title="${esc(HOW[k])}"><span>${STYLES[k].label}</span><div class="track"><i style="width:${p.avg[k]}%;background:${STYLES[k].color}"></i></div><span class="val">${p.avg[k]}</span></div>`).join('');
  const qOrder: QualityKey[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const qColors: Record<QualityKey, string> = { best: 'var(--good)', good: '#8fd1ae', inaccuracy: 'var(--warn)', mistake: '#e07a2e', blunder: 'var(--bad)' };
  const qTotal = qOrder.reduce((s, k) => s + p.quality[k], 0) || 1;
  const risks = RISK_KINDS.filter((k) => p.risk[k]?.count)
    .map((k) => `<span class="chip">${RISK_LABEL[k]} ${p.risk[k].count}회${k !== 'soundSacrifice' ? ` · 적중 ${p.risk[k].success}` : ''}</span>`).join('');
  const sliceHtml = (title: string, s: { count: number; top: StyleKey[] }) =>
    `<div class="slice"><b>${title} (${s.count}수)</b>${s.count ? s.top.slice(0, 2).map((k) => STYLES[k].label).join(', ') || '-' : '-'}</div>`;

  return `
    <div class="card profile ${o.focus ? 'focus' : ''}">
      <div class="profile-head">${c ? `<span class="side-dot ${c}"></span>` : ''}<span class="name">${esc(name)}</span><span class="faint">${esc(sub)}</span></div>
      <div class="archetype"><strong>${esc(p.archetype.name)}</strong><span>${esc(p.archetype.desc)}</span></div>
      ${o.extra ?? ''}
      <div class="stats">
        <div class="stat"><b>${p.accuracy}%</b><span>정확도</span></div>
        <div class="stat"><b>${p.acpl}</b><span>평균 손실(cp)</span></div>
        <div class="stat"><b>${riskTotal(p)}</b><span>희생·함정·도박</span></div>
      </div>
      <div class="profile-grid">
        <div class="radar">${radar(axes, color)}</div>
        <div><div class="section-title">자주 보인 스타일</div><div class="style-bars">${top}</div></div>
      </div>
      ${p.choiceTop.length ? `<div><div class="section-title">선택 성향 — 비슷한 대안이 있을 때 고른 쪽</div><div class="chips">${p.choiceTop.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>${STYLES[k].label} +${p.choice![k]}</span>`).join('')}</div></div>` : ''}
      ${risks ? `<div><div class="section-title">위험한 수</div><div class="chips">${risks}</div></div>` : ''}
      ${openingHtml}
      <div><div class="section-title">게임 단계별</div><div class="slices">${sliceHtml('오프닝', p.byPhase.opening)}${sliceHtml('미들게임', p.byPhase.middlegame)}${sliceHtml('엔드게임', p.byPhase.endgame)}</div></div>
      <div><div class="section-title">형세별</div><div class="slices">${sliceHtml('앞설 때', p.bySituation.ahead)}${sliceHtml('비슷할 때', p.bySituation.equal)}${sliceHtml('뒤질 때', p.bySituation.behind)}</div></div>
      ${timeSection(p.time)}
      <div><div class="section-title">수의 품질</div>
        <div class="qbar">${qOrder.map((k) => `<i style="width:${(p.quality[k] / qTotal) * 100}%;background:${qColors[k]}"></i>`).join('')}</div>
        <div class="qlegend">${qOrder.map((k) => `<span><span class="dot" style="background:${qColors[k]}"></span> ${QUALITY_LABEL[k]} ${p.quality[k]}</span>`).join('')}</div>
      </div>
    </div>`;
}

// ───────────── 프로필 메뉴 (저장된 플레이어 성향) ─────────────

const RES_SHORT = { win: '승', loss: '패', draw: '무' } as const;

function renderPlayers() {
  const p = state.playerKey ? getPlayer(state.playerKey) : null;
  if (!p) {
    state.playerKey = null;
    const players = listPlayers();
    const rows = players.map((pl) => {
      const games = gamesOf(pl);
      const prof = combinedProfile(pl);
      return `<tr data-player="${esc(pl.key)}">
        <td><b>${esc(pl.name)}</b> <span class="faint">${SOURCE_NAME[pl.source]}</span></td>
        <td>${games.length}판</td>
        <td>${prof ? esc(prof.archetype.name) : '-'}</td>
        <td class="faint">${prof ? `정확도 ${prof.accuracy}%` : ''}</td>
        <td class="faint">${fmtDate(pl.updatedAt)}</td>
      </tr>`;
    }).join('');
    app.innerHTML = `
      <div class="hero"><h1>프로필</h1><p>분석한 게임마다 플레이어의 성향이 이 브라우저에 저장되고, 판이 쌓일수록 합쳐서 보여줍니다.</p></div>
      <div class="card card-pad players-card">
        ${state.storageFull ? '<p class="error">브라우저 저장 공간이 가득 차서 일부 기록을 저장하지 못했습니다. 안 쓰는 플레이어를 지워 주세요.</p>' : ''}
        ${players.length ? `
          <div class="game-table-wrap"><table class="game-table players-table">${rows}</table></div>
          <div class="account-foot"><span class="faint">기록은 이 브라우저(localStorage)에만 저장되며 다른 기기와 공유되지 않습니다.</span><button class="ghost danger" id="clear-players">전체 삭제</button></div>`
        : '<p class="muted">아직 저장된 플레이어가 없습니다. 기보를 분석하거나 Chess.com·Lichess 아이디로 게임을 분석하면 여기에 쌓입니다.</p><button class="btn primary" id="go-analyze">분석하러 가기</button>'}
      </div>`;
    app.querySelectorAll<HTMLTableRowElement>('tr[data-player]').forEach((tr) => tr.onclick = () => { state.playerKey = tr.dataset.player!; renderPlayers(); window.scrollTo({ top: 0 }); });
    $('#clear-players')?.addEventListener('click', () => { if (confirm('저장된 모든 플레이어 기록을 지울까요?')) { clearPlayers(); state.storageFull = false; renderPlayers(); } });
    $('#go-analyze')?.addEventListener('click', () => setView('analyze'));
    return;
  }

  const prof = combinedProfile(p)!;
  const games = gamesOf(p);
  const rec = { win: 0, loss: 0, draw: 0 };
  for (const g of games) if (g.result) rec[g.result]++;
  const extra = `
    <div class="stats">
      <div class="stat"><b>${rec.win}승 ${rec.draw}무 ${rec.loss}패</b><span>저장된 ${games.length}판</span></div>
      <div class="stat"><b>${prof.counted}</b><span>평가한 수 (이론·강제 제외)</span></div>
      <div class="stat"><b>백 ${games.filter((g) => g.color === 'w').length} · 흑 ${games.filter((g) => g.color === 'b').length}</b><span>둔 색</span></div>
    </div>
    ${trendSection(games.map((g) => ({ date: g.date ?? g.savedAt, profile: g.profile })))}
    ${openingSection(games.map((g) => ({ opening: g.opening, profile: g.profile })))}`;
  const rows = games.map((g) => `<tr>
    <td class="faint">${g.date ? fmtDate(g.date) : '-'}</td>
    <td><span class="side-dot ${g.color}"></span></td>
    <td>${esc(g.opponent)}</td>
    <td class="res-${g.result ?? 'none'}">${g.result ? RES_SHORT[g.result] : '-'}</td>
    <td class="opening-cell">${esc(g.opening ?? '')}</td>
    <td class="faint">${esc(g.profile.archetype.name)} · ${g.profile.accuracy}%</td>
    <td>${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener" class="faint">원본</a>` : ''}</td>
    <td><button class="ghost small-x" data-del-game="${esc(g.gameId)}" title="이 판 기록 삭제">✕</button></td>
  </tr>`).join('');
  app.innerHTML = `
    <div class="game-head">
      <button class="btn" id="players-back">← 프로필 목록</button>
      <div class="spacer"></div>
      <button class="ghost danger" id="del-player">이 플레이어 삭제</button>
    </div>
    <div class="batch">
      <div>${profileCard(prof, null, {}, { name: p.name, sub: `${SOURCE_NAME[p.source]} · 저장된 ${games.length}판 종합`, extra, color: '#b5562d' })}</div>
      <div class="card card-pad">
        <div class="section-title">저장된 게임</div>
        <div class="game-table-wrap"><table class="game-table">${rows}</table></div>
        <p class="faint">각 판의 성향은 분석할 때의 깊이 기준입니다. 같은 게임을 다시 분석하면 덮어씁니다.</p>
      </div>
    </div>`;
  $('#players-back')!.onclick = () => { state.playerKey = null; renderPlayers(); };
  $('#del-player')!.onclick = () => { if (confirm(`${p.name}의 기록을 모두 지울까요?`)) { deletePlayer(p.key); state.playerKey = null; renderPlayers(); } };
  app.querySelectorAll<HTMLButtonElement>('[data-del-game]').forEach((b) => b.onclick = () => { deleteGame(p.key, b.dataset.delGame!); renderPlayers(); });
}

// ───────────── 소개 ─────────────

function renderAbout() {
  return `
    <div class="about">
      <div class="hero"><h1>소개</h1><p>Stylish(스타일리쉬)는 체스 수의 "좋고 나쁨"이 아니라 "어떤 성격의 수인가"를 평가합니다.</p></div>
      <div class="card card-pad">
        <h2>어떻게 분석하나요?</h2>
        <ol>
          <li><b>Stockfish 19</b>(브라우저용 WASM)가 모든 국면을 한 번씩 분석해 평가값, 최선 수, 후보 수, 주요 변화를 구합니다.</li>
          <li>수를 두기 전과 후의 국면에서 <b>특징</b>(킹 압박, 희생량, 핀·포크, 공간, 긴장, 폰 구조 등)을 뽑습니다.</li>
          <li>Stockfish의 주요 변화를 2~3수 따라가며 희생이 보상되는지, 공격이 이어지는지 봅니다.</li>
          <li>자체 소형 탐색으로 "상대가 지금 노리는 것"(위협)과 "상대가 자연스럽게 응수하면 어떻게 되나"를 확인하고, 판정을 좌우하는 경우 Stockfish로 다시 확인합니다.</li>
          <li>각 스타일은 근거 목록의 가중합으로 0~100점이 매겨지며, 판단 근거를 그대로 보여줍니다.</li>
          <li>오프닝 이론 수(Lichess 공개 오프닝 목록)와 강제된 수는 플레이어 평가에서 뺍니다. 수의 품질은 전적으로 Stockfish의 승/무/패 확률로 판정합니다.</li>
        </ol>
      </div>
      <div class="card card-pad">
        <h2>한계</h2>
        <ul>
          <li>"사람이 둘 법한 수"는 규칙으로 근사하므로 함정수·도박수 판정은 완벽하지 않습니다.</li>
          <li>브라우저용 경량 엔진과 제한된 깊이를 쓰므로, 아주 깊은 수순이 필요한 수는 평가가 달라질 수 있습니다.</li>
          <li>스타일 가중치는 대표 국면과 고전 기보로 맞췄으며 계속 다듬고 있습니다.</li>
        </ul>
      </div>
      <div class="card card-pad">
        <h2>개인정보</h2>
        <p>기보와 분석 결과는 서버로 전송되지 않고 이 브라우저 안에서만 처리됩니다. Chess.com·Lichess 아이디나 링크를 쓰면 이 브라우저가 해당 사이트에서 공개된 기보를 직접 받아옵니다. 분석 결과는 다시 볼 때 바로 보여주려고 이 브라우저(IndexedDB)에만 저장되고, 플레이어별 성향 요약은 프로필 메뉴용으로 이 브라우저(localStorage)에만 저장됩니다. 프로필 메뉴에서 언제든 지울 수 있습니다.</p>
      </div>
    </div>`;
}

/** 공유 링크(#g=...)로 들어오면 그 기보를 바로 분석한다 */
async function openShared() {
  const shared = await readSharedGame();
  if (!shared) return false;
  if (shared.depth && DEPTHS.some((d) => d.depth === shared.depth)) state.depth = shared.depth;
  history.replaceState(null, '', location.pathname + location.search);
  setView('analyze');
  startAnalysis(shared.pgn);
  return true;
}
window.addEventListener('hashchange', () => { openShared(); });

// 엔진은 첫 화면에서 미리 띄워 둔다 (WASM 다운로드·초기화 시간 단축)
getEngine().catch(() => {});
render();
openShared();
