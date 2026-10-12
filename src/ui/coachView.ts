// 코치와 두기 화면: 봇과 두거나 혼자 두면서 매 수마다 바로 평가·코멘트를 받는다.
import { tr } from '../i18n';
import { Chess, SQUARES, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import type { GameAnalysis, MoveAnalysis } from '../core/analyzer';
import { BOT_LEVELS, BOT_STYLES } from '../core/coach';
import { commentMine, commentOpponent, type CoachLine } from '../core/coachText';
import { STYLES, QUALITY_LABEL, RISK_LABEL } from '../core/styles';
import { CoachClient } from './coachClient';
import { choosePromotion, isPromotion } from './promotion';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const COACH_DEPTH = 12;
const PIECE_KO: Record<string, string> = { get p() { return tr('폰', 'pawn'); }, get n() { return tr('나이트', 'knight'); }, get b() { return tr('비숍', 'bishop'); }, get r() { return tr('룩', 'rook'); }, get q() { return tr('퀸', 'queen'); }, get k() { return tr('킹', 'king'); } };

interface Settings { mode: 'bot' | 'solo'; color: 'w' | 'b' | 'random'; level: number; style: string; showEval: boolean }
interface Ply { san: string; uci: string; color: 'w' | 'b'; fenBefore: string; fenAfter: string; from: string; to: string }

interface CoachGame {
  client: CoachClient;
  settings: Settings;
  user: 'w' | 'b';
  startFen: string;
  plies: Ply[];
  results: (MoveAnalysis | undefined)[];
  evals: Promise<MoveAnalysis | null>[];
  /** 무르기·새 게임마다 올려서, 그 전에 시작된 비동기 결과를 버린다 */
  gen: number;
  mine: (CoachLine & { ply: number }) | null;
  opp: (CoachLine & { ply: number }) | null;
  hint: { step: number; uci: string; san: string } | null;
  threat: { uci: string; san: string; gainCp: number } | null | 'none';
  over: { result: string; text: string } | null;
  thinking: boolean;
}

export interface CoachHooks { openReview(pgn: string, result: GameAnalysis, color: 'w' | 'b'): void }

const SETTINGS_KEY = 'stylish.coach.settings';
function loadSettings(): Settings {
  const def: Settings = { mode: 'bot', color: 'w', level: 2, style: 'balanced', showEval: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return def; }
}
function saveSettings(s: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 무시 */ } }

let game: CoachGame | null = null;
let cg: CgApi | null = null;
let root: HTMLElement | null = null;
let hooks: CoachHooks | null = null;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root?.querySelector<T>(sel) ?? null;

/** 화면을 떠날 때: 보드만 정리하고 대국은 유지한다 (다시 오면 이어서) */
export function leaveCoach() { cg?.destroy(); cg = null; root = null; }

export function renderCoach(app: HTMLElement, h: CoachHooks) {
  root = app; hooks = h;
  cg?.destroy(); cg = null;
  if (!game) renderSetup(); else renderPlay();
}

// ───────────── 시작 설정 ─────────────

function renderSetup() {
  const s = loadSettings();
  const styleOpts = (group: 'preset' | 'master') => BOT_STYLES.filter((x) => (x.id.startsWith('master:') ? 'master' : 'preset') === group)
    .map((x) => `<option value="${esc(x.id)}" ${s.style === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
  root!.innerHTML = `
    <section class="hero"><h1>${tr('코치와 두기', 'Play the coach')}</h1><p>${tr('봇과 두거나 혼자 두면서, 매 수마다 품질·스타일·위험 판정과 코치의 한마디를 바로 받아 보세요. 끝나면 전체 리뷰로 이어집니다.', 'Play a bot or both sides yourself and get quality, style, risk labels and a coach comment on every move. A full review follows at the end.')}</p></section>
    <div class="card card-pad coach-setup">
      <div class="setup-row"><span class="muted">${tr('상대', 'Opponent')}</span>
        <div class="seg">${[['bot', tr('봇과 대국', 'Play a bot')], ['solo', tr('혼자 두기 (양쪽)', 'Solo (both sides)')]].map(([v, l]) => `<button data-mode="${v}" class="${s.mode === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="setup-bot" ${s.mode === 'solo' ? 'hidden' : ''}>
        <div class="setup-row"><span class="muted">${tr('내 색', 'My color')}</span>
          <div class="seg">${[['w', tr('백', 'White')], ['b', tr('흑', 'Black')], ['random', tr('무작위', 'Random')]].map(([v, l]) => `<button data-color="${v}" class="${s.color === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
        <div class="setup-row"><span class="muted">${tr('봇 강도', 'Bot level')}</span>
          <div class="seg">${BOT_LEVELS.map((l, i) => `<button data-level="${i}" class="${s.level === i ? 'active' : ''}">${l.name}</button>`).join('')}</div></div>
        <div class="setup-row"><span class="muted">${tr('봇 스타일', 'Bot style')}</span>
          <select id="bot-style" class="text select"><optgroup label="${tr('성향', 'Tendencies')}">${styleOpts('preset')}</optgroup><optgroup label="${tr('유명 선수 스타일 (성향만 흉내)', 'Famous player styles (tendencies only)')}">${styleOpts('master')}</optgroup></select></div>
        <p class="faint" id="style-desc">${esc(BOT_STYLES.find((x) => x.id === s.style)?.desc ?? '')}</p>
      </div>
      <label class="setup-row check"><input type="checkbox" id="show-eval" ${s.showEval ? 'checked' : ''} /> ${tr('평가 막대 보이기', 'Show eval bar')} <span class="faint">${tr('(끄면 형세를 스스로 판단하며 둘 수 있어요)', '(turn it off to judge the position yourself)')}</span></label>
      <div class="setup-foot"><button class="btn primary" id="coach-start">${tr('대국 시작', 'Start game')}</button></div>
      <p class="faint">${tr('강도 이름은 상대적인 단계이며 실제 레이팅과 맞춘 값이 아닙니다. 계산은 모두 이 브라우저 안에서 이뤄집니다.', 'Level names are relative steps, not matched to real ratings. Everything runs in your browser.')}</p>
    </div>`;
  const set = (patch: Partial<Settings>) => { Object.assign(s, patch); saveSettings(s); renderSetup(); };
  root!.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.onclick = () => set({ mode: b.dataset.mode as Settings['mode'] }));
  root!.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.onclick = () => set({ color: b.dataset.color as Settings['color'] }));
  root!.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => b.onclick = () => set({ level: Number(b.dataset.level) }));
  $<HTMLSelectElement>('#bot-style')!.onchange = (e) => set({ style: (e.target as HTMLSelectElement).value });
  $<HTMLInputElement>('#show-eval')!.onchange = (e) => { s.showEval = (e.target as HTMLInputElement).checked; saveSettings(s); };
  $('#coach-start')!.onclick = () => startGame(s);
}

function startGame(s: Settings) {
  game?.client.close();
  const user = s.mode === 'solo' ? 'w' : s.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : s.color;
  const startFen = new Chess().fen();
  game = {
    client: new CoachClient(COACH_DEPTH), settings: { ...s }, user, startFen, plies: [], results: [], evals: [], gen: 0,
    mine: null, opp: null, hint: null, threat: null, over: null, thinking: false,
  };
  renderPlay();
  afterPly();
}

// ───────────── 대국 화면 ─────────────

const current = (g: CoachGame) => (g.plies.length ? g.plies[g.plies.length - 1].fenAfter : g.startFen);
const turnOf = (fen: string) => fen.split(' ')[1] as 'w' | 'b';
const userToMove = (g: CoachGame) => !g.over && !g.thinking && (g.settings.mode === 'solo' || turnOf(current(g)) === g.user);

function legalDests(fen: string) {
  const ch = new Chess(fen);
  const map = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const ms = ch.moves({ square: s as Square, verbose: true });
    if (ms.length) map.set(s as Key, ms.map((m) => m.to as Key));
  }
  return map;
}

function renderPlay() {
  const g = game!;
  const lv = BOT_LEVELS[g.settings.level], st = BOT_STYLES.find((x) => x.id === g.settings.style) ?? BOT_STYLES[0];
  const opponent = g.settings.mode === 'solo' ? tr('혼자 두기', 'Solo') : `${tr('봇', 'Bot')} · ${lv.name} · ${st.label}`;
  root!.innerHTML = `
    <div class="game-head">
      <div class="players"><span class="side-dot ${g.user}"></span>${tr('나', 'Me')} <span class="faint">vs</span> ${esc(opponent)}</div>
      <div class="head-actions">
        <button class="btn" id="c-resign">${tr('기권', 'Resign')}</button>
        <button class="btn" id="c-new">${tr('새 대국', 'New game')}</button>
      </div>
    </div>
    <div class="coach">
      <div class="coach-board-col">
        <div class="coach-board-row">
          <div class="eval-bar ${g.settings.showEval ? '' : 'off'}" id="eval-bar" title="${tr('평가 막대 (백 기대 점수)', 'Eval bar (White\'s expected score)')}"><i></i><span></span></div>
          <div class="board-wrap"><div class="cg" id="c-board"></div></div>
        </div>
        <div class="board-controls">
          <button class="btn" id="c-hint" title="${tr('단계별 힌트', 'Step-by-step hint')}">💡 ${tr('힌트', 'Hint')}</button>
          <button class="btn" id="c-threat" title="${tr('상대가 노리는 수', 'The opponent\'s threat')}">⚠ ${tr('위협', 'Threat')}</button>
          <button class="btn" id="c-undo" title="${tr('무르기', 'Undo')}">↶ ${tr('무르기', 'Undo')}</button>
          <button class="btn" id="c-flip" aria-label="${tr('보드 뒤집기', 'Flip board')}">⇅</button>
          <button class="btn" id="c-eval" title="${tr('평가 막대 켜기/끄기', 'Toggle eval bar')}">${g.settings.showEval ? tr('막대 끄기', 'Hide bar') : tr('막대 켜기', 'Show bar')}</button>
        </div>
      </div>
      <div class="coach-side">
        <div class="card coach-panel" id="c-panel"></div>
        <div class="card coach-moves" id="c-moves"></div>
      </div>
    </div>`;
  cg = Chessground($('#c-board')!, {
    orientation: g.user === 'b' ? 'black' : 'white', coordinates: true,
    movable: { free: false, showDests: true, events: { after: onUserMove } },
    premovable: { enabled: false },
    drawable: { enabled: false, visible: true },
    animation: { enabled: true, duration: 180 },
  });
  $('#c-new')!.onclick = () => { game?.client.close(); game = null; cg?.destroy(); cg = null; renderSetup(); };
  $('#c-resign')!.onclick = () => { if (game && !game.over && game.plies.length && confirm(tr('기권할까요?', 'Resign?'))) resignCoach(); };
  $('#c-hint')!.onclick = onHint;
  $('#c-threat')!.onclick = onThreat;
  $('#c-undo')!.onclick = onUndo;
  $('#c-flip')!.onclick = () => cg?.toggleOrientation();
  $('#c-eval')!.onclick = () => {
    g.settings.showEval = !g.settings.showEval; saveSettings({ ...loadSettings(), showEval: g.settings.showEval });
    $('#c-eval')!.textContent = g.settings.showEval ? tr('막대 끄기', 'Hide bar') : tr('막대 켜기', 'Show bar');
    $('#eval-bar')!.classList.toggle('off', !g.settings.showEval);
  };
  syncBoard(); updatePanel(); updateMoves(); updateEvalBar();
}

function syncBoard() {
  const g = game; if (!g || !cg) return;
  const fen = current(g);
  const last = g.plies.at(-1);
  const turn = turnOf(fen) === 'w' ? 'white' : 'black';
  const shapes: DrawShape[] = [];
  if (g.hint && g.hint.step >= 2) shapes.push({ orig: g.hint.uci.slice(0, 2) as Key, brush: 'green' });
  if (g.hint && g.hint.step >= 3) shapes.push({ orig: g.hint.uci.slice(0, 2) as Key, dest: g.hint.uci.slice(2, 4) as Key, brush: 'green' });
  if (g.threat && g.threat !== 'none') shapes.push({ orig: g.threat.uci.slice(0, 2) as Key, dest: g.threat.uci.slice(2, 4) as Key, brush: 'red' });
  const can = userToMove(g);
  cg.set({
    fen, turnColor: turn, lastMove: last ? [last.from as Key, last.to as Key] : undefined, check: new Chess(fen).inCheck(),
    movable: { color: can ? turn : undefined, dests: can ? legalDests(fen) : new Map() },
    drawable: { autoShapes: shapes },
  });
}

// ───────────── 수 진행 ─────────────

function applyMove(g: CoachGame, uci: string): Ply | null {
  const fenBefore = current(g);
  const ch = new Chess(fenBefore);
  let mv;
  try { mv = ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
  const ply: Ply = { san: mv.san, uci: mv.lan, color: mv.color, fenBefore, fenAfter: mv.after, from: mv.from, to: mv.to };
  g.plies.push(ply);
  g.hint = null; g.threat = null;
  evaluatePly(g, g.plies.length - 1);
  return ply;
}

/** 수 평가를 요청하고, 오면 코치 말풍선을 갱신한다 */
function evaluatePly(g: CoachGame, i: number) {
  const ply = g.plies[i], prev = g.plies[i - 1];
  const gen = g.gen;
  const p = g.client.evaluate({
    fenBefore: ply.fenBefore, uci: ply.uci, ply: i,
    prev: prev ? { fenBefore: prev.fenBefore, uci: prev.uci, book: !!g.results[i - 1]?.book } : null,
  }).then((m) => {
    if (game !== g || g.gen !== gen) return null;
    // 이론 판정은 앞 수 결과에 달려 있어, 앞 수가 늦게 오면 여기서 다시 맞춘다
    if (i > 0 && !g.results[i - 1]?.book) { m.book = false; m.opening = null; }
    g.results[i] = m;
    const mineMove = g.settings.mode === 'solo' || ply.color === g.user;
    if (mineMove) g.mine = { ...commentMine(m), ply: i };
    else { const c = commentOpponent(m); g.opp = c ? { ...c, ply: i } : null; }
    updatePanel(); updateMoves(); updateEvalBar();
    return m;
  }).catch((err) => { console.error('코치 평가 실패', i, err); return null; });
  g.evals[i] = p;
}

function checkOver(g: CoachGame) {
  const ch = new Chess(current(g));
  if (!ch.isGameOver()) return;
  const loser = turnOf(current(g));
  if (ch.isCheckmate()) g.over = { result: loser === 'w' ? '0-1' : '1-0', text: tr(`체크메이트 — ${loser === 'w' ? '흑' : '백'} 승`, `Checkmate — ${loser === 'w' ? 'Black' : 'White'} wins`) };
  else g.over = { result: '1/2-1/2', text: ch.isStalemate() ? tr('스테일메이트 — 무승부', 'Stalemate — draw') : ch.isThreefoldRepetition() ? tr('3회 반복 — 무승부', 'Threefold repetition — draw') : ch.isInsufficientMaterial() ? tr('기물 부족 — 무승부', 'Insufficient material — draw') : tr('50수 규칙 — 무승부', '50-move rule — draw') };
}

/** 수를 둔 뒤 공통 처리: 끝났는지 보고, 봇 차례면 봇이 두고, 내 차례면 다음 국면을 미리 분석한다 */
function afterPly() {
  const g = game; if (!g) return;
  checkOver(g);
  syncBoard(); updatePanel(); updateMoves();
  if (g.over) return;
  const fen = current(g);
  if (g.settings.mode === 'bot' && turnOf(fen) !== g.user) botTurn(g);
  else g.client.prepare(fen).catch(() => {});
}

async function botTurn(g: CoachGame) {
  const gen = g.gen;
  g.thinking = true; updatePanel(); syncBoard();
  const started = Date.now();
  const uci = await g.client.bot(current(g), g.settings.level, g.settings.style).catch(() => null);
  // 너무 빨리 두면 수를 놓치기 쉬워 조금 기다린다
  const wait = 450 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (game !== g || g.gen !== gen) return;
  g.thinking = false;
  if (uci) applyMove(g, uci);
  afterPly();
}

async function onUserMove(orig: Key, dest: Key) {
  const g = game; if (!g) return;
  const fen = current(g);
  const piece = new Chess(fen).get(orig as Square);
  let promo = '';
  if (isPromotion(piece?.type, dest)) {
    const board = $('#c-board');
    const choice = board ? await choosePromotion(board, dest, piece!.color === 'w' ? 'white' : 'black', cg?.state.orientation ?? 'white') : 'q';
    // 고르는 사이에 무르기·새 대국이 일어났으면 무시
    if (game !== g || current(g) !== fen) return;
    if (!choice) { syncBoard(); return; }
    promo = choice;
  }
  if (!applyMove(g, orig + dest + promo)) { syncBoard(); return; }
  afterPly();
}

// ───────────── 힌트·위협·무르기 ─────────────

async function onHint() {
  const g = game; if (!g || !userToMove(g)) return;
  const fen = current(g);
  if (!g.hint) {
    const gen = g.gen, plies = g.plies.length;
    $('#c-hint')!.textContent = `💡 ${tr('생각 중…', 'Thinking…')}`;
    const best = await g.client.best(fen).catch(() => null);
    if (game !== g || g.gen !== gen || g.plies.length !== plies || !best) { if ($('#c-hint')) $('#c-hint')!.textContent = `💡 ${tr('힌트', 'Hint')}`; return; }
    const ch = new Chess(fen);
    const mv = ch.move({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), promotion: best.uci[4] });
    g.hint = { step: 1, uci: best.uci, san: mv.san };
  } else g.hint.step = Math.min(3, g.hint.step + 1);
  $('#c-hint')!.textContent = g.hint.step < 3 ? `💡 ${tr('더 보기', 'More')}` : `💡 ${tr('힌트', 'Hint')}`;
  syncBoard(); updatePanel();
}

async function onThreat() {
  const g = game; if (!g || g.over) return;
  const gen = g.gen, plies = g.plies.length;
  $('#c-threat')!.textContent = `⚠ ${tr('확인 중…', 'Checking…')}`;
  const t = await g.client.threat(current(g)).catch(() => null);
  if ($('#c-threat')) $('#c-threat')!.textContent = `⚠ ${tr('위협', 'Threat')}`;
  if (game !== g || g.gen !== gen || g.plies.length !== plies) return;
  g.threat = t && t.gainCp >= 60 ? t : 'none';
  syncBoard(); updatePanel();
}

function onUndo() {
  const g = game; if (!g || !g.plies.length) return;
  g.gen++;
  g.thinking = false;
  g.over = null;
  g.plies.pop();
  // 봇 대국이면 내 차례가 될 때까지 (봇 수까지) 되돌린다
  if (g.settings.mode === 'bot') while (g.plies.length && turnOf(current(g)) !== g.user) g.plies.pop();
  g.results.length = g.plies.length; g.evals.length = g.plies.length;
  g.hint = null; g.threat = null;
  g.mine = null; g.opp = null;
  // 되돌린 뒤에도 이미 평가된 수는 다시 쓰고, 평가가 끝나지 않은 수는 다시 요청한다
  for (let i = 0; i < g.plies.length; i++) if (!g.results[i]) evaluatePly(g, i);
  updateEvalBar();
  afterPly();
}

// ───────────── 패널 ─────────────

function bubble(c: CoachLine, who: string) {
  return `<div class="bubble tone-${c.tone}"><div class="bubble-who">${who}</div>${c.title ? `<strong>${esc(c.title)}</strong>` : ''}<p>${esc(c.text)}</p></div>`;
}

function updatePanel() {
  const g = game, el = $('#c-panel'); if (!g || !el) return;
  const last = g.plies.at(-1);
  const lastRes = last ? g.results[g.plies.length - 1] : undefined;
  const parts: string[] = [];
  if (g.over) parts.push(`<div class="over-banner"><strong>${esc(g.over.text)}</strong><button class="btn primary" id="c-review">${tr('전체 리뷰 보기', 'Full review')}</button></div>`);
  else if (g.thinking) parts.push(`<div class="status faint"><span class="spinner"></span> ${tr('봇이 생각 중…', 'The bot is thinking…')}</div>`);
  else if (userToMove(g)) parts.push(`<div class="status">${g.settings.mode === 'solo' ? tr(`${turnOf(current(g)) === 'w' ? '백' : '흑'} 차례`, `${turnOf(current(g)) === 'w' ? 'White' : 'Black'} to move`) : tr('내 차례', 'Your move')}${last && !lastRes ? ` <span class="faint">· ${tr('직전 수 평가 중…', 'rating the last move…')}</span>` : ''}</div>`);

  const mineFresh = g.mine && g.mine.ply >= g.plies.length - 2;
  const oppFresh = g.opp && g.opp.ply === g.plies.length - 1;
  if (mineFresh) {
    const m = g.results[g.mine!.ply]!;
    const p = g.plies[g.mine!.ply];
    const tags = [m.quality ? `<span class="pill q-${m.quality}">${QUALITY_LABEL[m.quality]}</span>` : '', m.risk ? `<span class="pill risk-pill">${RISK_LABEL[m.risk]}</span>` : '',
      ...m.top.slice(0, 3).map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>${STYLES[k].label}</span>`)].join('');
    parts.push(`<div class="mine-move"><span class="mc-san">${p.color === 'w' ? `${Math.floor(g.mine!.ply / 2) + 1}.` : `${Math.floor(g.mine!.ply / 2) + 1}...`} ${esc(p.san)}</span><div class="chips">${tags}</div></div>`);
    parts.push(bubble(g.mine!, `🎓 ${tr('코치', 'Coach')}`));
    if (!m.deep.isBest && m.bestSan && !m.book && (m.quality === 'inaccuracy' || m.quality === 'mistake' || m.quality === 'blunder'))
      parts.push(`<div class="coach-actions"><button class="btn small" id="c-retry">↶ ${tr('다시 두기', 'Try again')}</button></div>`);
  }
  if (oppFresh) parts.push(bubble(g.opp!, `🎓 ${tr('코치 (상대 수)', 'Coach (opponent move)')}`));
  if (g.hint) {
    const piece = new Chess(current(g)).get(g.hint.uci.slice(0, 2) as Square);
    const pn = piece ? PIECE_KO[piece.type] : tr('기물', 'piece');
    const text = g.hint.step === 1 ? tr(`${pn}을(를) 움직여 보세요.`, `Move your ${pn}.`) : g.hint.step === 2 ? tr(`${g.hint.uci.slice(0, 2)} 칸의 ${pn}이에요.`, `It's the ${pn} on ${g.hint.uci.slice(0, 2)}.`) : tr(`정답은 ${g.hint.san}예요.`, `The answer is ${g.hint.san}.`);
    parts.push(`<div class="bubble tone-info"><div class="bubble-who">💡 ${tr('힌트', 'Hint')} ${g.hint.step}/3</div><p>${esc(text)}</p></div>`);
  }
  if (g.threat) parts.push(`<div class="bubble tone-warn"><div class="bubble-who">⚠ ${tr('위협', 'Threat')}</div><p>${g.threat === 'none' ? tr('지금 상대가 노리는 특별한 수는 없어요.', 'The opponent has no special threat right now.') : tr(`상대는 ${esc(g.threat.san)}를 노리고 있어요 (약 ${Math.round(g.threat.gainCp / 100 * 10) / 10}폰 이득).`, `The opponent is threatening ${esc(g.threat.san)} (about ${Math.round(g.threat.gainCp / 100 * 10) / 10} pawns).`)}</p></div>`);
  if (!g.plies.length && !g.thinking) parts.push(`<p class="muted">${g.settings.mode === 'solo' ? tr('양쪽 수를 직접 두세요. 둘 때마다 코치가 평가합니다.', 'Play both sides. The coach rates every move.') : tr('첫 수를 두세요. 둘 때마다 코치가 평가합니다.', 'Make your first move. The coach rates every move.')}</p>`);
  el.innerHTML = parts.join('');
  $('#c-review')?.addEventListener('click', openReview);
  $('#c-retry')?.addEventListener('click', onUndo);
}

function updateMoves() {
  const g = game, el = $('#c-moves'); if (!g || !el) return;
  if (!g.plies.length) { el.innerHTML = `<span class="faint">${tr('수 기록', 'Moves')}</span>`; return; }
  const cells = g.plies.map((p, i) => {
    const m = g.results[i];
    const q = m?.quality && !m.book ? ` q-dot-${m.quality}` : '';
    return `${p.color === 'w' ? `<span class="no">${i / 2 + 1}.</span>` : ''}<span class="cm${q}" title="${m?.quality ? QUALITY_LABEL[m.quality] : tr('평가 중', 'Rating…')}">${esc(p.san)}</span>`;
  });
  el.innerHTML = `<div class="coach-move-flow">${cells.join(' ')}</div>`;
  el.scrollTop = el.scrollHeight;
}

function updateEvalBar() {
  const g = game, el = $('#eval-bar'); if (!g || !el) return;
  let exp = 0.5, label = '0.0';
  for (let i = g.plies.length - 1; i >= 0; i--) {
    const m = g.results[i];
    if (!m) continue;
    exp = m.expWhiteAfter;
    const v = m.evalWhiteAfter / 100;
    // 막대가 좁아 10 이상은 소수점 없이
    label = m.mateAfter != null ? `#${Math.abs(m.mateAfter)}` : (v >= 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
    break;
  }
  const flipped = cg?.state.orientation === 'black';
  el.classList.toggle('flipped', flipped);
  el.querySelector('i')!.setAttribute('style', `height:${(exp * 100).toFixed(1)}%`);
  el.querySelector('span')!.textContent = label;
}

// ───────────── 리뷰로 ─────────────

async function openReview() {
  const g = game; if (!g) return;
  const btn = $<HTMLButtonElement>('#c-review');
  if (btn) { btn.disabled = true; btn.textContent = tr('평가 마무리 중…', 'Finishing…'); }
  const results = await Promise.all(g.plies.map((_, i) => g.results[i] ? Promise.resolve(g.results[i]!) : g.evals[i] ?? Promise.resolve(null)));
  if (results.some((r) => !r)) { if (btn) { btn.disabled = false; btn.textContent = tr('전체 리뷰 보기', 'Full review'); } return; }
  const lv = BOT_LEVELS[g.settings.level], st = BOT_STYLES.find((x) => x.id === g.settings.style) ?? BOT_STYLES[0];
  const bot = g.settings.mode === 'solo' ? tr('나', 'Me') : tr(`Stylish 봇 (${lv.name}·${st.label})`, `Stylish bot (${lv.name}, ${st.label})`);
  const d = new Date();
  const headers: Record<string, string> = {
    Event: tr('Stylish 코치 대국', 'Stylish coach game'), Date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`,
    White: g.user === 'w' || g.settings.mode === 'solo' ? tr('나', 'Me') : bot, Black: g.user === 'b' || g.settings.mode === 'solo' ? tr('나', 'Me') : bot,
    Result: g.over?.result ?? '*',
  };
  const ch = new Chess();
  for (const [k, v] of Object.entries(headers)) ch.setHeader(k, v);
  for (const p of g.plies) ch.move(p.san);
  const analysis = await g.client.finalize(results as MoveAnalysis[], headers, g.startFen);
  hooks?.openReview(ch.pgn(), analysis, g.user);
}

/** 기권 (헤더 버튼에서 부른다) */
export function resignCoach() {
  const g = game; if (!g || g.over || !g.plies.length) return;
  g.over = { result: g.user === 'w' ? '0-1' : '1-0', text: tr('기권', 'Resigned') };
  updatePanel(); syncBoard();
}
