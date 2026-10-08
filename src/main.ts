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
import type { PlayerProfile } from './core/profile';
import { STYLES, STYLE_KEYS, RISK_LABEL, QUALITY_LABEL, type StyleKey, type QualityKey } from './core/styles';

// ───────────── 상태 ─────────────

type View = 'analyze' | 'guide' | 'about';
type InputTab = 'paste' | 'samples' | 'file' | 'lichess';

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
}

const DEPTHS = [
  { label: '빠름', depth: 10, hint: '약 30초' },
  { label: '보통', depth: 14, hint: '약 1~2분' },
  { label: '정밀', depth: 18, hint: '약 4분 이상' },
];
const isMobile = matchMedia('(max-width: 760px)').matches;

const state = {
  view: 'analyze' as View,
  tab: 'paste' as InputTab,
  draft: '',
  lichessUrl: '',
  depth: isMobile ? 10 : 14,
  inputError: null as string | null,
  game: null as GameState | null,
  run: null as AnalysisRun | null,
  orientation: 'white' as 'white' | 'black',
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
  if (m.risk === 'gamble') return '<span class="glyph g-risk">!?</span>';
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
  if (state.game) renderReview(); else renderInput();
}

// ───────────── 입력 화면 ─────────────

function renderInput() {
  const tabs: [InputTab, string][] = [['paste', 'PGN 붙여넣기'], ['samples', '예시 기보'], ['file', '파일 열기'], ['lichess', 'Lichess 링크']];
  const body = {
    paste: `<textarea class="pgn" id="pgn" placeholder="[White &quot;...&quot;]&#10;[Black &quot;...&quot;]&#10;&#10;1. e4 e5 2. Nf3 Nc6 ...">${esc(state.draft)}</textarea>`,
    samples: `<div class="samples">${SAMPLES.map((s) => `<button class="sample" data-sample="${s.id}"><strong>${esc(s.title)}</strong><span class="faint">${esc(s.pgn.split('\n\n')[1].slice(0, 70))}…</span></button>`).join('')}</div>`,
    file: `<label class="dropzone" id="drop"><input type="file" id="file" accept=".pgn,.txt" hidden />PGN 파일을 끌어다 놓거나 <u>눌러서 선택</u>하세요.<br><span class="faint">여러 게임이 들어 있으면 첫 게임을 분석합니다.</span></label>`,
    lichess: `<input class="text" id="lichess" placeholder="https://lichess.org/abcd1234" value="${esc(state.lichessUrl)}" /><p class="faint">공개된 Lichess 게임 링크를 넣으면 기보를 불러옵니다.</p>`,
  }[state.tab];

  app.innerHTML = `
    <section class="hero">
      <h1>이 수, 어떤 스타일일까?</h1>
      <p>기보를 넣으면 모든 수를 공격적·도박수·포지셔널·수비적 등 19가지 스타일로 평가하고, 두 플레이어의 성향을 분석합니다. 계산은 전부 브라우저 안에서 이뤄집니다.</p>
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
          ${state.tab !== 'samples' ? `<button class="btn primary" id="go">분석 시작</button>` : ''}
        </div>
      </div>
    </div>
    <div class="features">
      <div class="feature"><h3>19가지 스타일</h3><p>공격적, 전술적, 예방적, 긴장 유지, 복잡화… 한 수가 여러 스타일을 동시에 가질 수 있습니다.</p></div>
      <div class="feature"><h3>희생 · 함정 · 도박</h3><p>Stockfish와 자체 탐색으로 위험한 수가 건전한지, 상대의 실수를 노린 수인지 가립니다.</p></div>
      <div class="feature"><h3>플레이어 성향</h3><p>강제된 수를 뺀 선택만으로 두 사람의 스타일과 유형을 평가합니다.</p></div>
    </div>`;

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => { saveDraft(); state.tab = b.dataset.tab as InputTab; state.inputError = null; renderInput(); });
  app.querySelectorAll<HTMLButtonElement>('[data-depth]').forEach((b) => b.onclick = () => { saveDraft(); state.depth = Number(b.dataset.depth); renderInput(); });
  app.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) => b.onclick = () => startAnalysis(SAMPLES.find((s) => s.id === b.dataset.sample)!.pgn));
  $('#go')?.addEventListener('click', onGo);
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
      const res = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(String(res.status));
      startAnalysis(await res.text());
    } catch {
      state.inputError = '게임을 불러오지 못했습니다. 공개된 게임인지 확인해 주세요.'; renderInput();
    }
    return;
  }
  startAnalysis(state.draft);
}

// ───────────── 분석 실행 ─────────────

function startAnalysis(pgn: string) {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch (e) {
    state.inputError = `기보를 읽을 수 없습니다: ${e instanceof Error ? e.message.split('\n')[0] : e}`; state.view = 'analyze'; render(); return;
  }
  const history = chess.history({ verbose: true });
  if (!history.length) { state.inputError = '수가 하나도 없는 기보입니다.'; render(); return; }
  state.inputError = null;
  state.run?.cancel();
  state.game = {
    pgn, headers: chess.getHeaders() as Record<string, string>, startFen: history[0].before,
    plies: history.map((m, i) => ({ san: m.san, color: m.color, from: m.from, to: m.to, fenAfter: m.after, moveNumber: Math.floor(i / 2) + 1 })),
    results: [], analysis: null, progress: [0, history.length + 1], ply: -1, error: null,
  };
  state.orientation = 'white';
  state.view = 'analyze';
  render();

  const game = state.game;
  const run = new AnalysisRun({
    onProgress: (done, total) => { if (state.game !== game) return; game.progress = [done, total]; updateProgress(); },
    onMove: (m) => {
      if (state.game !== game) return;
      game.results[m.ply] = m;
      updateMoveList(); updateGraph();
      if (game.ply === m.ply || (game.ply === -1 && m.ply === 0)) { if (game.ply === -1) game.ply = 0; updatePosition(); }
    },
  });
  state.run = run;
  run.start(pgn, state.depth)
    .then((result) => {
      if (state.game !== game) return;
      game.analysis = result; game.results = result.moves; game.progress = [1, 1];
      updateProgress(); updateMoveList(); updateGraph(); updateCard(); renderProfiles();
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
      <span class="faint">${esc([h.Event, h.Date].filter((x) => x && !x.includes('?')).join(' · '))}</span>
      <div class="progress" id="progress"></div>
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
  $('#new')!.onclick = () => { state.run?.cancel(); state.game = null; render(); };
  app.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go!));
  $('#graph')!.onclick = (e) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * g.plies.length) - 1;
    select(Math.max(-1, Math.min(g.plies.length - 1, i)));
  };
  updateProgress(); updateMoveList(); updateGraph(); updatePosition();
  if (g.analysis) renderProfiles();
}

function go(where: string) {
  const g = state.game; if (!g) return;
  if (where === 'flip') { state.orientation = state.orientation === 'white' ? 'black' : 'white'; cg?.set({ orientation: state.orientation }); return; }
  const n = g.plies.length;
  select(where === 'first' ? -1 : where === 'last' ? n - 1 : where === 'prev' ? Math.max(-1, g.ply - 1) : Math.min(n - 1, g.ply + 1));
}

function select(ply: number) {
  if (!state.game) return;
  state.game.ply = ply;
  updatePosition();
  $(`.mv[data-ply="${ply}"]`)?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (e) => {
  if (!state.game || state.view !== 'analyze' || (e.target as HTMLElement).matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') { go('prev'); e.preventDefault(); }
  if (e.key === 'ArrowRight') { go('next'); e.preventDefault(); }
  if (e.key === 'Home') go('first');
  if (e.key === 'End') go('last');
});

function updateProgress() {
  const g = state.game, el = $('#progress'); if (!g || !el) return;
  if (g.error) { el.innerHTML = `<span class="error">분석 오류: ${esc(g.error)}</span>`; return; }
  if (g.analysis) { el.innerHTML = `<span class="faint">분석 완료 · 깊이 ${g.analysis.depth}</span>`; return; }
  const [d, t] = g.progress;
  el.innerHTML = `<span class="faint">${d === 0 ? '엔진 준비 중…' : `분석 중 ${Math.max(0, d - 1)}/${t - 1}수`}</span><div class="bar"><i style="width:${(d / t) * 100}%"></i></div>`;
}

function updatePosition() {
  const g = state.game; if (!g || !cg) return;
  const p = g.ply >= 0 ? g.plies[g.ply] : null;
  const m = g.ply >= 0 ? g.results[g.ply] : undefined;
  const shapes: { orig: Key; dest?: Key; brush: string }[] = [];
  if (m && m.deep.bestMove && !m.deep.isBest) shapes.push({ orig: m.deep.bestMove.slice(0, 2) as Key, dest: m.deep.bestMove.slice(2, 4) as Key, brush: 'paleGreen' });
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
      return `<td><button class="mv ${m ? '' : 'pending'} ${g.ply === j ? 'active' : ''}" data-ply="${j}">${dot}${esc(p.san)}${m ? glyph(m) : ''}</button></td>`;
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
      <p class="faint">색 점은 그 수의 대표 스타일, 기호는 품질(?! 부정확, ? 실수, ?? 블런더)과 위험 판정(! 건전한 희생, !? 도박수, ⚑ 함정수)입니다.</p></div>`;
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

  el.innerHTML = `
    <div class="mc-head">
      <span class="mc-num">${m.moveNumber}${m.color === 'w' ? '.' : '...'}</span>
      <span class="mc-san">${esc(m.san)}</span>
      ${m.quality ? `<span class="pill q-${m.quality}">${QUALITY_LABEL[m.quality]}</span>` : ''}
      ${m.forced ? '<span class="chip" title="선택의 여지가 거의 없던 수라 플레이어 평가에서 제외">강제된 수</span>' : ''}
    </div>
    ${m.risk ? `<div class="risk ${m.risk}"><strong>${RISK_LABEL[m.risk]}</strong><span>${esc(m.riskWhy)}</span></div>` : ''}
    <div>
      <div class="section-title">대표 스타일</div>
      <div class="primary-style"><span class="dot" style="background:${styleColor(m.primary)};width:14px;height:14px"></span><span class="label">${styleLabel(m.primary)}</span></div>
    </div>
    ${bars ? `<div><div class="section-title">스타일 점수</div><div class="style-bars">${bars}</div></div>` : ''}
    ${choice.length ? `<div><div class="section-title">비슷한 가치의 대안과 비교하면</div><div class="chips">${choice.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>더 ${STYLES[k].label}인 선택</span>`).join('')}</div></div>` : ''}
    <div class="engine-box">
      <div class="kv"><span>평가 (백 기준)</span><b>${evalAfter}</b></div>
      <div class="kv"><span>손실</span><span>${m.cpLoss}cp</span></div>
      ${!m.deep.isBest && m.bestSan ? `<div class="kv"><span>Stockfish 최선 수</span><b>${esc(m.bestSan)}</b></div><div class="line">${esc(m.bestPvSan.join(' '))}</div>` : ''}
      ${m.playedPvSan.length ? `<div class="faint">이후 예상 수순</div><div class="line">${esc(m.playedPvSan.join(' '))}</div>` : ''}
    </div>
    ${reasons ? `<details class="reasons"><summary>판단 근거 보기</summary>${reasons}</details>` : ''}`;
}

// ───────────── 플레이어 프로필 ─────────────

const GROUP_AXES: { label: string; keys: StyleKey[] }[] = [
  { label: '공격', keys: ['aggressive', 'tactical', 'initiative', 'counterattack'] },
  { label: '포지션', keys: ['positional', 'prophylactic', 'restriction', 'active', 'space', 'tension'] },
  { label: '안전', keys: ['solid', 'defensive', 'simplifying'] },
  { label: '실전', keys: ['complicating', 'quiet', 'waiting', 'practical'] },
  { label: '엔드게임', keys: ['kingActivity', 'passedPawn'] },
];

function renderProfiles() {
  const g = state.game, el = $('#profiles'); if (!g?.analysis || !el) return;
  el.innerHTML = (['w', 'b'] as const).map((c) => profileCard(g.analysis!.profiles[c], c, g.headers)).join('');
}

function profileCard(p: PlayerProfile, c: 'w' | 'b', h: Record<string, string>) {
  const color = c === 'w' ? '#c9a227' : '#5b6ee1';
  // 그룹 점수는 그룹 안 상위 2개 평균을 0~100으로 강조
  const axes = GROUP_AXES.map((a) => {
    const vals = a.keys.map((k) => p.avg[k]).sort((x, y) => y - x).slice(0, 2);
    return { label: a.label, value: Math.min(100, (vals.reduce((s, v) => s + v, 0) / vals.length) * 1.6) };
  });
  const top = p.top.map((k) => `<div class="sbar" title="${esc(HOW[k])}"><span>${STYLES[k].label}</span><div class="track"><i style="width:${p.avg[k]}%;background:${STYLES[k].color}"></i></div><span class="val">${p.avg[k]}</span></div>`).join('');
  const qOrder: QualityKey[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const qColors: Record<QualityKey, string> = { best: 'var(--good)', good: '#8fd1ae', inaccuracy: 'var(--warn)', mistake: '#e07a2e', blunder: 'var(--bad)' };
  const qTotal = qOrder.reduce((s, k) => s + p.quality[k], 0) || 1;
  const risks = (['soundSacrifice', 'trap', 'gamble'] as const).filter((k) => p.risk[k].count)
    .map((k) => `<span class="chip">${RISK_LABEL[k]} ${p.risk[k].count}회${k !== 'soundSacrifice' ? ` · 적중 ${p.risk[k].success}` : ''}</span>`).join('');
  const sliceHtml = (title: string, s: { count: number; top: StyleKey[] }) =>
    `<div class="slice"><b>${title} (${s.count}수)</b>${s.count ? s.top.slice(0, 2).map((k) => STYLES[k].label).join(', ') || '-' : '-'}</div>`;

  return `
    <div class="card profile">
      <div class="profile-head"><span class="side-dot ${c}"></span><span class="name">${esc(playerName(h, c))}</span><span class="faint">${c === 'w' ? '백' : '흑'} · 평가 대상 ${p.counted}/${p.moves}수</span></div>
      <div class="archetype"><strong>${esc(p.archetype.name)}</strong><span>${esc(p.archetype.desc)}</span></div>
      <div class="stats">
        <div class="stat"><b>${p.accuracy}%</b><span>정확도</span></div>
        <div class="stat"><b>${p.acpl}</b><span>평균 손실(cp)</span></div>
        <div class="stat"><b>${p.risk.soundSacrifice.count + p.risk.trap.count + p.risk.gamble.count}</b><span>희생·함정·도박</span></div>
      </div>
      <div class="profile-grid">
        <div class="radar">${radar(axes, color)}</div>
        <div><div class="section-title">자주 보인 스타일</div><div class="style-bars">${top}</div></div>
      </div>
      ${p.choiceTop.length ? `<div><div class="section-title">선택 성향 — 비슷한 대안이 있을 때 고른 쪽</div><div class="chips">${p.choiceTop.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>${STYLES[k].label} +${p.choice![k]}</span>`).join('')}</div></div>` : ''}
      ${risks ? `<div><div class="section-title">위험한 수</div><div class="chips">${risks}</div></div>` : ''}
      <div><div class="section-title">게임 단계별</div><div class="slices">${sliceHtml('오프닝', p.byPhase.opening)}${sliceHtml('미들게임', p.byPhase.middlegame)}${sliceHtml('엔드게임', p.byPhase.endgame)}</div></div>
      <div><div class="section-title">형세별</div><div class="slices">${sliceHtml('앞설 때', p.bySituation.ahead)}${sliceHtml('비슷할 때', p.bySituation.equal)}${sliceHtml('뒤질 때', p.bySituation.behind)}</div></div>
      <div><div class="section-title">수의 품질</div>
        <div class="qbar">${qOrder.map((k) => `<i style="width:${(p.quality[k] / qTotal) * 100}%;background:${qColors[k]}"></i>`).join('')}</div>
        <div class="qlegend">${qOrder.map((k) => `<span><span class="dot" style="background:${qColors[k]}"></span> ${QUALITY_LABEL[k]} ${p.quality[k]}</span>`).join('')}</div>
      </div>
    </div>`;
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
        <p>기보와 분석 결과는 서버로 전송되지 않고 이 브라우저 안에서만 처리됩니다. Lichess 링크를 쓰면 해당 게임의 기보만 Lichess에서 받아옵니다.</p>
      </div>
    </div>`;
}

// 엔진은 첫 화면에서 미리 띄워 둔다 (WASM 다운로드·초기화 시간 단축)
getEngine().catch(() => {});
render();
