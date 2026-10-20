import './style.css';
import { tr, getLang, saveLang } from './i18n';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import { SAMPLES } from './samples';
import { AnalysisRun, getEngine } from './ui/runner';
import { enginesInUse } from './engine/browser';
import { readChesscomRef, findChesscomGame, type ChesscomRef } from './online/chesscomGame';
import { humanStatus, onHumanStatus } from './human/browser';
import { typeSection, shareType } from './ui/typeCard';
import { chessTypeOf, peerStats, peerGroupPct, PEER_GROUPS, PEER_METRICS, ratingOf, type PeerMetric } from './core/chessType';
import TYPE_CALIB from './data/type-calib.json';
const CALIB_PLAYERS = TYPE_CALIB.players;
import { addPractice, weeklySet, practiceStats, markPractice, asQuizMove, clearPractice, WEEKLY } from './ui/practice';
import { myGroups, createGroup, getGroup, joinGroup, leaveGroup, playerType, refreshGroupsFor, groupMapHtml, type GroupInfo } from './server/groups';
import { syncState, createSync, connectSync, syncNow, disconnectSync, autoSync } from './server/sync';
import { monthlySection, openRecapImage, recapMonth } from './ui/monthly';
import { recordType, typeDexSection, challengeSection, setChallenge, clearChallenge, saveFriend, friendsSection, weeklySection } from './ui/retention';
import { typeChangeSection, withRating, setRatingOverride, timeClassOf, timeTypeSection } from './ui/typeCard';
import { decodeVs, saveVs, loadVs, clearVs, vsBanner, shareCompare } from './ui/compare';
import { evalGraph, radar } from './ui/charts';
import { renderGuide, HOW } from './ui/guide';
import type { GameAnalysis, MoveAnalysis } from './core/analyzer';
import type { OpeningSideStyle } from './core/openings';
import { buildProfile, mergeProfiles, mainTimeClass, riskTotal, type PlayerProfile } from './core/profile';
import { fetchGames, userResult, SOURCE_LABEL, type OnlineGame, type Source } from './online/sources';
import { cacheKey, getCached, putCached, gameHash } from './ui/cache';
import { exportRecords, importRecords, savePlayerGame, playerKey, listPlayers, getPlayer, deletePlayer, deleteGame, clearPlayers, combinedProfile, gamesOf, isNamed, SOURCE_NAME, type PlayerSource, type SavedPlayer, type SavedGame } from './ui/players';
import { timeSection, openingSection, trendSection, mastersSection, fmtSec, fmtClock, GROUP_AXES, groupScore } from './ui/insights';
import { shareUrl, readSharedGame } from './ui/share';
import { pickHighlights, drawCard, cardBlob } from './ui/highlights';
import { findMissed, openQuiz } from './ui/quiz';
import { openModal } from './ui/modal';
import { menuHtml, menuGroupOf } from './ui/menu.js';
// 처음 화면에 필요 없는 화면은 쓸 때 불러온다 (휴대폰 첫 로딩을 가볍게)
let coachMod: typeof import('./ui/coachView') | null = null;
let dailyMod: typeof import('./ui/daily') | null = null;
const loadCoach = () => import('./ui/coachView').then((m) => (coachMod = m));
const loadDaily = () => import('./ui/daily').then((m) => (dailyMod = m));
const openResultImage = (info: Parameters<typeof import('./ui/resultImage').openResultImage>[0]) => import('./ui/resultImage').then((m) => m.openResultImage(info));
import { track, bucket } from './ui/track';
import { STYLES, STYLE_KEYS, RISK_KINDS, RISK_LABEL, QUALITY_LABEL, type StyleKey, type QualityKey } from './core/styles';

// ───────────── 상태 ─────────────

type View = 'analyze' | 'coach' | 'guide' | 'about' | 'players' | 'group' | 'compare' | 'bookmarklet' | 'practice' | 'recap' | 'sync' | 'groups' | 'daily';
/** 주소(?view=)로 바로 열 수 있는 화면 */
const URL_VIEWS: View[] = ['coach', 'guide', 'about', 'players', 'compare', 'bookmarklet', 'practice', 'recap', 'sync', 'groups', 'daily'];
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
  current: number;          // 분석 중인 게임 중 가장 앞 인덱스 (-1 = 끝)
  progress: [number, number];
  depth: number;
  error: string | null;
  cancelled: boolean;
  run: AnalysisRun | null;
  /** 동시에 분석 중인 판: 인덱스 → [끝낸 수, 전체 수] */
  active: Map<number, [number, number]>;
  runs: Set<AnalysisRun>;
  /** 새로 분석한 판의 걸린 시간(ms) — 남은 시간 계산용 */
  durations: number[];
}

/** 여러 판 분석 깊이: 유형 기준(보정 데이터)과 같은 깊이. 더 깊어도 유형이 정확해지지 않고 수십 배 느려진다 */
const BATCH_DEPTH = 10;
/** 동시에 분석하는 판 수: 한 판의 마무리 단계 동안 엔진이 놀지 않도록 다음 판을 겹쳐 돌린다 */
const BATCH_CONCURRENCY = 2;
/** 새로고침·탭 종료 후 이어서 분석하기 위한 대기열 */
const PENDING_KEY = 'stylish.batch.pending.v1';
const savePendingBatch = (b: BatchState) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify({ source: b.source, user: b.user, games: b.games, at: Date.now() })); } catch { /* 무시 */ } };
const clearPendingBatch = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* 무시 */ } };
function loadPendingBatch(): { source: Source; user: string; games: OnlineGame[]; at: number } | null {
  try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null'); return v && Date.now() - v.at < 3 * 86400000 ? v : null; } catch { return null; }
}

const DEPTHS = [
  { get label() { return tr('빠름', 'Fast'); }, depth: 10, get hint() { return tr('약 30초', '~30 sec'); } },
  { get label() { return tr('보통', 'Normal'); }, depth: 14, get hint() { return tr('약 1~2분', '~1–2 min'); } },
  { get label() { return tr('정밀', 'Deep'); }, depth: 18, get hint() { return tr('약 4분 이상', '4+ min'); } },
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
  groupCode: null as string | null, // 보고 있는 그룹 유형 지도
  pinHint: null as { source: string; user: string } | null, // 아이디 고정 주소로 처음 왔을 때 안내
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
  // 부정확(?!)은 표시하지 않는다: 깊이 10 판정이 정식 Stockfish(깊이 18)와 36%만 일치 (엔진 오차가 이 등급의 폭과 비슷함)
  return '';
};
/** 이론 수 카드: 이 오프닝의 (그 색) 스타일. 이론 수는 대부분 기물 전개라, 다른 오프닝보다 두드러진 점만 보여준다 */
function openingStyleHtml(o: OpeningSideStyle | null) {
  if (!o) return '';
  const chips = [
    ...(o.gambit ? [`<span class="chip" title="${tr('폰 등을 내주고 빠른 전개·공격을 얻는 오프닝', 'An opening that gives material for development or attack')}">🎲 ${tr('갬빗', 'Gambit')}</span>`] : []),
    ...o.distinct.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>${tr(`더 ${STYLES[k].label}`, `More ${STYLES[k].label.toLowerCase()}`)}</span>`),
  ];
  return `<div><div class="section-title">${tr('이 오프닝의 스타일 (이쪽, 다른 오프닝과 비교)', "This opening's style (this side, vs other openings)")}</div><div class="chips">${chips.join('') || `<span class="chip">${tr('무난한 전개 위주', 'Mostly standard development')}</span>`}</div></div>`;
}
/** 정확도 설명: Lichess와 같은 계산식이지만 분석 깊이가 달라 값이 다르다 */
const ACCURACY_NOTE = () => tr('Lichess와 같은 방식으로 계산하지만 분석 깊이가 달라서, 같은 게임 29판(백·흑 58건) 비교에서 Lichess보다 평균 6점쯤 높게 나왔어요. Lichess·Chess.com 정확도와 직접 비교하지는 마세요.', 'Computed like Lichess, but at a different engine depth: on 29 games (58 sides) it came out about 6 points higher than Lichess on average. Don\'t compare it directly with Lichess or Chess.com accuracy.');
/** 부정확 등급 설명: 판정이 흔들리는 등급이라 참고용 */
const INACCURACY_NOTE = () => tr('부정확은 참고용이에요. 분석 깊이가 얕을수록(종합 분석은 깊이 10) 엔진 오차가 이 등급의 폭과 비슷해져서, 실수·블런더보다 판정이 많이 흔들려요.', 'Inaccuracy is for reference only: at shallow depths (combined analysis uses depth 10), engine noise is about as large as this grade, so it is much less certain than mistakes or blunders.');
const styleColor = (k: StyleKey | 'neutral') => (k === 'neutral' ? 'var(--text-3)' : STYLES[k].color);
const styleLabel = (k: StyleKey | 'neutral') => (k === 'neutral' ? tr('평범한 수', 'Ordinary move') : STYLES[k].label);
const playerName = (h: Record<string, string>, c: 'w' | 'b') => h[c === 'w' ? 'White' : 'Black'] && h[c === 'w' ? 'White' : 'Black'] !== '?' ? h[c === 'w' ? 'White' : 'Black'] : c === 'w' ? tr('백', 'White') : tr('흑', 'Black');

// ───────────── 라우팅 ─────────────

/** 메뉴에 지금 위치 표시 (큰 주제 밑줄 + 해당 항목) */
function setMenuActive() {
  const group = menuGroupOf(state.view);
  document.querySelectorAll<HTMLElement>('.mm-group').forEach((el) => el.classList.toggle('active', el.dataset.group === group));
  const idTab = state.tab === 'lichessUser' || state.tab === 'chesscom';
  document.querySelectorAll<HTMLAnchorElement>('.mm-item').forEach((a) => {
    const on = a.dataset.view === state.view && (state.view !== 'analyze' || (a.dataset.tabGo === 'lichessUser') === idTab);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
/** 화면 전환. push면 주소(/app?view=…)도 바꿔서 새로고침·뒤로 가기가 되게 한다 */
function setView(v: View, push = true) {
  state.view = v;
  if (v === 'players') state.playerKey = null;
  setMenuActive();
  if (push) {
    const url = URL_VIEWS.includes(v) ? `/app?view=${v}` : '/app';
    if (location.pathname + location.search !== url) history.pushState(null, '', url + location.hash);
  }
  render();
  window.scrollTo({ top: 0 });
}
// 메뉴·안내 링크(data-view): 새로고침 없이 앱 안에서 화면만 바꾼다 (새 탭으로 열기는 그대로)
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-view]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  const tab = a.dataset.tabGo as InputTab | undefined;
  if (tab) {
    // 분석 메뉴: 보고 있던 한 판 리뷰는 닫고 입력 화면으로 (진행 중인 종합 분석은 그대로)
    state.run?.cancel(); state.game = null;
    state.tab = tab === 'lichessUser' && state.tab === 'chesscom' ? 'chesscom' : tab;
  }
  setView(a.dataset.view as View);
});
window.addEventListener('popstate', () => {
  const q = new URLSearchParams(location.search);
  const g = q.get('g')?.toUpperCase();
  if (g && /^[A-Z2-9]{6}$/.test(g)) { state.view = 'group'; state.groupCode = g; setMenuActive(); render(); return; }
  const v = q.get('view') as View | null;
  setView(v && URL_VIEWS.includes(v) ? v : 'analyze', false);
});

function render() {
  cg?.destroy(); cg = null;
  if (state.view !== 'coach') coachMod?.leaveCoach();
  if (state.view !== 'daily') dailyMod?.leaveDaily();
  if (state.view === 'daily') { loadDaily().then((m) => { if (state.view === 'daily') m.renderDaily(app); }); return; }
  if (state.view === 'coach') { loadCoach().then((m) => { if (state.view === 'coach') m.renderCoach(app, { openReview: openCoachReview }); }); return; }
  if (state.view === 'guide') { app.innerHTML = renderGuide(); return; }
  // 소개는 정적 페이지(/about, /en/about)로
  if (state.view === 'about') { location.href = getLang() === 'en' ? '/en/about' : '/about'; return; }
  if (state.view === 'players') { renderPlayers(); return; }
  if (state.view === 'group' && state.groupCode) { renderGroup(state.groupCode); return; }
  if (state.view === 'groups') { renderGroups(); return; }
  if (state.view === 'sync') { renderSyncView(); return; }
  if (state.view === 'practice') { renderPractice(); return; }
  if (state.view === 'recap') { renderRecap(); return; }
  if (state.view === 'compare') { renderCompare(); return; }
  if (state.view === 'bookmarklet') { renderBookmarklet(); return; }
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
  const tabs: [InputTab, string][] = [['paste', tr('PGN 붙여넣기', 'Paste PGN')], ['samples', tr('예시 기보', 'Examples')], ['file', tr('파일 열기', 'Open file')], ['chesscom', tr('Chess.com 아이디', 'Chess.com user')], ['lichessUser', tr('Lichess 아이디', 'Lichess user')], ['lichess', tr('Lichess 링크', 'Lichess link')]];
  const body = {
    paste: `<textarea class="pgn" id="pgn" placeholder="[White &quot;...&quot;]&#10;[Black &quot;...&quot;]&#10;&#10;1. e4 e5 2. Nf3 Nc6 ...">${esc(state.draft)}</textarea>`,
    samples: `<div class="samples">${SAMPLES.map((s) => `<button class="sample" data-sample="${s.id}"><strong>${esc(s.title)}</strong><span class="faint">${esc(s.pgn.split('\n\n')[1].slice(0, 70))}…</span></button>`).join('')}</div>`,
    file: `<label class="dropzone" id="drop"><input type="file" id="file" accept=".pgn,.txt" hidden />${tr('PGN 파일을 끌어다 놓거나 <u>눌러서 선택</u>하세요.', 'Drop a PGN file here or <u>click to choose</u>.')}<br><span class="faint">${tr('여러 게임이 들어 있으면 첫 게임을 분석합니다.', 'If it contains several games, the first one is analyzed.')}</span></label>`,
    chesscom: renderAccountPanel('chesscom'),
    lichessUser: renderAccountPanel('lichess'),
    lichess: `<input class="text" id="lichess" placeholder="https://lichess.org/abcd1234" value="${esc(state.lichessUrl)}" /><p class="faint">${tr('공개된 Lichess 게임 링크를 넣으면 기보를 불러옵니다.', 'Paste a public Lichess game link to load the game.')}</p>`,
  }[state.tab];

  app.innerHTML = `
      ${loadVs() ? vsBanner(loadVs()!) : ''}
      ${state.pinHint ? `<div class="vs-banner"><b>${tr('이 주소를 즐겨찾기 해 두세요.', 'Bookmark this address.')}</b><span>${tr(`한 번 종합 분석을 하고 나면, 다음부터는 이 주소(${esc(pinUrl(state.pinHint.source, state.pinHint.user))})를 열 때마다 새로 둔 게임만 바로 분석해요.`, `After your first combined analysis, opening this address (${esc(pinUrl(state.pinHint.source, state.pinHint.user))}) analyzes only your new games right away.`)}</span></div>` : ''}
      ${(() => {
        // 다시 온 사람: 가장 최근에 저장한 온라인 아이디로 '새 게임 분석·이번 주 리포트' 안내 (API 요청은 누를 때만)
        const last = listPlayers().filter((pl) => pl.source !== 'pgn').sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (!last || state.batch || loadPendingBatch()) return '';
        const days = Math.floor((Date.now() - last.updatedAt) / 86400000);
        // 월초 1주일: 지난달에 둔 게임이 있으면 결산 안내
        const rm = recapMonth();
        if (rm.last && gamesOf(last).some((g) => { const d = new Date(g.date ?? g.savedAt); return d.getFullYear() === rm.year && d.getMonth() === rm.month; })) {
          return `<div class="vs-banner welcome-banner"><b>${tr(`${esc(last.name)}님, 지난달 체스 결산이 나왔어요!`, `${esc(last.name)}, your chess recap for last month is ready!`)}</b><span>${tr('지난달 유형·정확도 변화·대담한 수를 카드로 받아 보세요.', "See last month's type, accuracy change and bold moves as a card.")}</span><button type="button" class="btn primary" data-open-player="${esc(last.key)}">${tr('결산 보기', 'See recap')}</button></div>`;
        }
        if (days < 1) return '';
        return `<div class="vs-banner welcome-banner"><b>${tr(`${esc(last.name)}님, ${days}일 만이에요!`, `Welcome back, ${esc(last.name)}! It's been ${days} days.`)}</b><span>${tr('그동안 둔 게임을 분석하고 이번 주 리포트와 유형 변화를 확인해 보세요.', 'Analyze the games you played since, then check your weekly report and type change.')}</span><button type="button" class="btn primary" data-open-player="${esc(last.key)}">${tr('내 프로필 보기', 'Open my profile')}</button></div>`;
      })()}
      ${(() => { const pb = loadPendingBatch(); return pb && !state.batch ? `<div class="vs-banner resume-banner"><b>${tr(`${esc(pb.user)}의 ${pb.games.length}판 종합 분석이 끝나지 않았어요.`, `The combined analysis of ${pb.games.length} games for ${esc(pb.user)} didn't finish.`)}</b><span>${tr('이미 끝난 판은 저장돼 있어서 이어서 분석하면 남은 판만 분석해요.', 'Finished games are saved, so resuming only analyzes the rest.')}</span><button type="button" class="btn primary" data-resume-batch>${tr('이어서 분석하기', 'Resume')}</button><button type="button" class="ghost" data-resume-clear>${tr('지우기', 'Dismiss')}</button></div>` : ''; })()}
    <section class="hero">
      <h1>${tr('이 수, 어떤 스타일일까?', 'What style is this move?')}</h1>
      <p>${tr('기보를 넣거나 Chess.com·Lichess 아이디를 입력하면 모든 수를 공격적·도박수·포지셔널·수비적 등 19가지 스타일로 평가하고, 플레이어의 성향을 분석합니다. 계산은 전부 브라우저 안에서 이뤄집니다.', 'Paste a game or enter a Chess.com or Lichess username, and every move is rated on 19 styles such as aggressive, gamble, positional and defensive, along with the player\'s tendencies. Everything is computed in your browser.')}</p>
    </section>
    <div class="card input-card">
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>
      <div class="input-foot">
        <div class="depth"><span class="muted">${tr('분석 깊이', 'Depth')}</span>
          <div class="seg">${DEPTHS.map((d) => `<button data-depth="${d.depth}" class="${state.depth === d.depth ? 'active' : ''}" title="${d.hint}">${d.label}</button>`).join('')}</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          ${state.inputError ? `<span class="error">${esc(state.inputError)}</span>` : ''}
          ${['paste', 'file', 'lichess'].includes(state.tab) ? `<button class="btn primary" id="go">${tr('분석 시작', 'Analyze')}</button>` : ''}
        </div>
      </div>
    </div>
    <div class="features">
      <div class="feature"><h3>${tr('19가지 스타일', '19 styles')}</h3><p>${tr('공격적, 전술적, 예방적, 긴장 유지, 복잡화… 한 수가 여러 스타일을 동시에 가질 수 있습니다.', 'Aggressive, tactical, prophylactic, tension, complicating… one move can have several styles at once.')}</p></div>
      <div class="feature"><h3>${tr('희생 · 함정 · 도박', 'Sacrifices · traps · gambles')}</h3><p>${tr('Stockfish와 자체 탐색으로 위험한 수가 건전한지, 상대의 실수를 노린 수인지 가립니다.', 'Stockfish and our own search decide whether a risky move is sound or hopes for an opponent\'s mistake.')}</p></div>
      <div class="feature"><h3>${tr('내 스타일 찾기', 'Find your style')}</h3><p>${tr('Chess.com·Lichess 아이디로 최근 게임을 불러와 여러 판을 종합한 내 플레이 스타일과 닮은 유명 선수를 봅니다.', 'Load recent games from Chess.com or Lichess and see your combined style and similar famous players.')}</p></div>
      <div class="feature"><h3>${tr('놓친 기회 퀴즈', 'Missed chances quiz')}</h3><p>${tr('내가 크게 손해 본 국면에서 Stockfish 최선 수를 직접 찾아보며 복습합니다.', 'Review positions where you lost a lot by finding Stockfish\'s best move yourself.')}</p></div>
      <div class="feature"><h3>${tr('명수 카드 · 공유', 'Highlight cards · sharing')}</h3><p>${tr('희생·함정 같은 인상적인 수를 이미지 카드로 저장하고, 기보를 링크 하나로 공유합니다.', 'Save striking moves like sacrifices and traps as image cards, and share a game with one link.')}</p></div>
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
    if (!id) { state.inputError = tr('Lichess 게임 링크 형식이 아닙니다 (예: https://lichess.org/abcd1234)', 'That is not a Lichess game link (e.g. https://lichess.org/abcd1234)'); renderInput(); return; }
    try {
      const res = await fetch(`https://lichess.org/game/export/${id}?clocks=true&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(String(res.status));
      startAnalysis(await res.text());
    } catch {
      state.inputError = tr('게임을 불러오지 못했습니다. 공개된 게임인지 확인해 주세요.', 'Could not load the game. Please check that it is public.'); renderInput();
    }
    return;
  }
  startAnalysis(state.draft);
}

// ───────────── 아이디로 불러오기 ─────────────

const TIME_LABEL: Record<string, string> = { get bullet() { return tr('불릿', 'Bullet'); }, get blitz() { return tr('블리츠', 'Blitz'); }, get rapid() { return tr('래피드', 'Rapid'); }, get classical() { return tr('클래식', 'Classical'); }, get daily() { return tr('데일리', 'Daily'); }, get ultraBullet() { return tr('울트라불릿', 'UltraBullet'); } };
const RESULT_LABEL = { get win() { return tr('승', 'W'); }, get loss() { return tr('패', 'L'); }, get draw() { return tr('무', 'D'); } };
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

function renderAccountPanel(source: Source): string {
  const a = state.account?.source === source ? state.account : null;
  const list = a ? a.games.filter((g) => a.timeFilter === 'all' || g.timeClass === a.timeFilter) : [];
  const classes = a ? [...new Set(a.games.map((g) => g.timeClass))] : [];
  const rows = list.map((g) => {
    const opp = g.userColor === 'w' ? g.black : g.white;
    const r = userResult(g);
    return `<tr data-row="${esc(g.id)}" class="${a!.selected.has(g.id) ? 'picked' : ''}">
      <td class="pick-cell"><input type="checkbox" class="pick" data-pick="${esc(g.id)}" ${a!.selected.has(g.id) ? 'checked' : ''} aria-label="${tr('선택', 'Select')}" /></td>
      <td class="faint">${fmtDate(g.date)}</td>
      <td><span class="side-dot ${g.userColor}" title="${g.userColor === 'w' ? tr('백', 'White') : tr('흑', 'Black')}"></span></td>
      <td>${esc(opp.name)}${opp.rating ? ` <span class="faint">(${opp.rating})</span>` : ''}</td>
      <td class="res-${r ?? 'none'}">${r ? RESULT_LABEL[r] : '-'}</td>
      <td class="faint">${esc(TIME_LABEL[g.timeClass] ?? g.timeClass)}</td>
      <td class="opening-cell" title="${esc(g.opening ?? '')}">${esc(g.opening ?? '')}</td>
      <td><button class="btn small" data-open="${esc(g.id)}">${tr('분석', 'Analyze')}</button></td>
    </tr>`;
  }).join('');
  const n = a?.selected.size ?? 0;
  return `
    <div class="account">
      <form class="account-form" id="account-form">
        <input class="text" id="account-user" placeholder="${SOURCE_LABEL[source]}${tr(' 아이디', ' username')}" value="${esc(a?.user ?? '')}" autocomplete="off" />
        <button class="btn primary" type="submit" ${a?.loading ? 'disabled' : ''}>${a?.loading ? tr('불러오는 중…', 'Loading…') : tr('게임 불러오기', 'Load games')}</button>
      </form>
      ${a?.error ? `<p class="error">${esc(a.error)} <button type="button" class="ghost small" data-retry-load>${tr('다시 시도', 'Try again')}</button></p>` : ''}
      ${a && a.games.length ? `
        <div class="account-tools">
          <div class="chips">${['all', ...classes].map((c) => `<button class="chip ${a.timeFilter === c ? 'chip-on' : ''}" data-tf="${c}">${c === 'all' ? tr('전체', 'All') : esc(TIME_LABEL[c] ?? c)}</button>`).join('')}</div>
          <div class="pick-tools">
            <button class="ghost" id="pick-all">${list.length && list.every((g) => a.selected.has(g.id)) ? tr('모두 해제', 'Clear all') : tr(`모두 선택 (${list.length})`, `Select all (${list.length})`)}</button>
            <button class="ghost" id="pick-recent">${tr('최근 10판', 'Latest 10')}</button>
          </div>
        </div>
        <div class="game-table-wrap"><table class="game-table">${rows}</table></div>
        <div class="account-foot">
          ${a.next ? `<button class="btn" id="more" ${a.loading ? 'disabled' : ''}>${tr('더 불러오기', 'Load more')}</button>` : `<span class="faint">${tr('더 이상 게임이 없습니다', 'No more games')}</span>`}
          <button class="btn primary" id="batch" ${n ? '' : 'disabled'}>${tr(`선택한 ${n}판 종합 분석`, `Analyze ${n} selected games`)}</button>
        </div>
        <p class="faint">${tr(`"분석"은 한 판을 위 분석 깊이로 자세히 봅니다. 종합 분석은 고른 판들에서 ${esc(a.user)}의 수만 모아 성향을 냅니다. 유형 기준과 같은 조건으로 분석하고, 이미 분석한 판과 겹치는 국면은 이 브라우저에 저장돼 바로 나옵니다.`, `"Analyze" reviews one game in detail at the depth above. A combined analysis collects only ${esc(a.user)}'s moves from the selected games to find their tendencies, using the same settings as the type calibration. Games and positions you've analyzed before are saved in this browser and load instantly.`)}</p>`
      : a && !a.loading && !a.error ? `<p class="faint">${tr('표준 체스 게임이 없습니다.', 'No standard chess games found.')}</p>` : `<p class="faint">${tr(`${SOURCE_LABEL[source]} 아이디를 넣으면 최근 게임 목록을 불러옵니다. 요청은 이 브라우저에서 ${SOURCE_LABEL[source]}로 바로 갑니다.`, `Enter a ${SOURCE_LABEL[source]} username to load recent games. Requests go straight from your browser to ${SOURCE_LABEL[source]}.`)}</p>`}
    </div>`;
}

function bindAccountPanel() {
  const form = $<HTMLFormElement>('#account-form');
  if (!form) return;
  const source: Source = state.tab === 'chesscom' ? 'chesscom' : 'lichess';
  form.onsubmit = (e) => {
    e.preventDefault();
    const user = $<HTMLInputElement>('#account-user')!.value.trim();
    track('id_submit', { source });
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
    if (batch) { batch.disabled = !n; batch.textContent = tr(`선택한 ${n}판 종합 분석`, `Analyze ${n} selected games`); }
    const all = $('#pick-all');
    if (all) all.textContent = v.length && v.every((g) => a.selected.has(g.id)) ? tr('모두 해제', 'Clear all') : tr(`모두 선택 (${v.length})`, `Select all (${v.length})`);
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
    if (!a.games.length) track(page.games.length ? 'games_loaded' : 'games_empty');
    a.games.push(...page.games); a.next = page.next;
  } catch (err) {
    if (state.account !== a) return;
    track('games_load_failed');
    a.error = err instanceof Error && err.name !== 'TypeError' ? err.message : tr(`${SOURCE_LABEL[a.source]}에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.`, `Could not reach ${SOURCE_LABEL[a.source]}. Please try again shortly.`);
  }
  a.loading = false;
  if (state.view === 'analyze' && !state.game && !state.batch) renderInput();
}

// ───────────── 여러 판 종합 분석 ─────────────

// ───────────── 분석 중 화면 켜 두기 (휴대폰은 화면이 꺼지면 계산이 멈춘다) ─────────────
type WakeLock = { release(): Promise<void> };
let wakeLock: WakeLock | null = null;
async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock && document.visibilityState === 'visible') {
      const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLock> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; /* 지원하지 않거나 거절되면 그냥 진행 */ }
}
// 다른 앱에 다녀오면 화면 켜 두기가 풀리므로 다시 건다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.batch && state.batch.current >= 0) { wakeLock = null; keepAwake(true); }
});
const isPhone = () => matchMedia('(pointer: coarse)').matches;

/** 종합 분석 시작 시각 (걸린 시간 측정용) */
const batchStartedAt = new WeakMap<object, number>();
const batchTook = new WeakMap<object, number>();
function startBatch(games: OnlineGame[], from: { source: Source; user: string } | null = null) {
  const owner = from ?? (state.account ? { source: state.account.source, user: state.account.user } : null);
  if (!games.length || !owner) return;
  state.batch = {
    source: owner.source, user: owner.user, games, results: new Map(),
    current: 0, progress: [0, 1], depth: BATCH_DEPTH, error: null, cancelled: false, run: null,
    active: new Map(), runs: new Set(), durations: [],
  };
  state.game = null;
  savePendingBatch(state.batch);
  batchStartedAt.set(state.batch, Date.now());
  keepAwake(true);
  track('batch_start', { batch_games: bucket(games.length, [5, 10, 20, 50]) });
  render();
  runBatch(state.batch);
}

async function runBatch(b: BatchState) {
  let next = 0;
  const one = async (i: number) => {
    const g = b.games[i];
    b.active.set(i, [0, 1]);
    b.current = Math.min(...b.active.keys());
    updateBatch();
    const key = cacheKey(g.pgn, b.depth);
    let result = await getCached(key);
    if (!result) {
      const t0 = Date.now();
      // 한 판씩 보는 분석(state.run)과 별개로 돈다
      const run = new AnalysisRun({ onProgress: (d, t) => { b.active.set(i, [d, t]); updateBatchProgress(); }, onMove: () => {} });
      b.runs.add(run); b.run = run;
      try { result = await run.start(g.pgn, b.depth); } catch (err) {
        b.runs.delete(run); b.active.delete(i);
        if (b.cancelled) return;
        b.error = tr(`${i + 1}번째 게임 분석 실패: `, `Game ${i + 1} failed: `) + (err instanceof Error ? err.message : String(err));
        track('batch_error');
        return;
      }
      b.runs.delete(run);
      b.durations.push(Date.now() - t0);
      putCached(key, result);
    }
    b.active.delete(i);
    if (b.cancelled || state.batch !== b) return;
    b.results.set(g.id, result);
    // 종합 분석은 그 아이디 쪽 성향만 저장한다
    const pg = prepareGameQuiet(g.pgn);
    if (pg) saveProfiles({ ...pg, source: g.source, url: g.url, date: g.date, save: [g.userColor] }, result);
    updateBatch();
  };
  const lane = async () => {
    while (!b.cancelled && state.batch === b) {
      const i = next++;
      if (i >= b.games.length) return;
      await one(i);
    }
  };
  await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, lane));
  if (b.cancelled || state.batch !== b) return;
  b.current = -1;
  clearPendingBatch();
  const agg = batchProfile(b);
  if (agg.profile && agg.profile.counted >= 20) recordType(playerKey(b.source, b.user), chessTypeOf(withRating(agg.profile, b.user)));
  const took = (Date.now() - (batchStartedAt.get(b) ?? Date.now())) / 60000;
  batchTook.set(b, Date.now() - (batchStartedAt.get(b) ?? Date.now()));
  keepAwake(false);
  track('batch_done', { batch_minutes: bucket(Math.round(took), [1, 3, 5, 10, 20]) });
  track(agg.profile && agg.profile.counted >= 20 ? 'type_shown' : 'type_too_few');
  autoSync();
  refreshGroupsFor(playerKey(b.source, b.user));
  updateBatch();
}

/** 남은 시간 (새로 분석한 판의 평균 시간 기준, 동시 분석 수 반영) */
function batchEta(b: BatchState): number | null {
  if (!b.durations.length) return null;
  const avg = b.durations.reduce((s, x) => s + x, 0) / b.durations.length;
  const activeLeft = [...b.active.values()].reduce((s, [d, t]) => s + (1 - (t ? d / t : 0)), 0);
  const queued = b.games.length - b.results.size - b.active.size;
  return Math.max(0, ((queued + activeLeft) * avg) / BATCH_CONCURRENCY);
}
const fmtEta = (ms: number) => {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? tr(`약 ${sec}초`, `about ${sec}s`) : tr(`약 ${Math.round(sec / 60)}분`, `about ${Math.round(sec / 60)} min`);
};

/** 고른 판들에서 그 아이디의 수만 모아 프로필을 만든다 */
function batchProfile(b: BatchState) {
  const moves: MoveAnalysis[] = [];
  const missed: { move: MoveAnalysis; game: string }[] = [];
  let w = 0, l = 0, d = 0, leftFirst = 0, withBook = 0, ratingSum = 0, ratingN = 0;
  for (const g of b.games) {
    const r = b.results.get(g.id); if (!r) continue;
    moves.push(...r.moves.filter((m) => m.color === g.userColor));
    const rt = r.profiles[g.userColor].rating;
    if (rt) { ratingSum += rt; ratingN++; }
    const opp = g.userColor === 'w' ? g.black : g.white;
    for (const m of findMissed(r.moves, g.userColor)) missed.push({ move: m, game: `vs ${opp.name} · ${fmtDate(g.date)}` });
    const res = userResult(g); if (res === 'win') w++; else if (res === 'loss') l++; else if (res === 'draw') d++;
    const p = r.profiles[g.userColor];
    if (p.opening.leftBookFirst != null) { withBook++; if (p.opening.leftBookFirst) leftFirst++; }
  }
  // 수만 모아 새로 만들면 레이팅이 빠지므로 판별 레이팅 평균을 넣는다
  const profile = moves.length ? buildProfile(moves) : null;
  if (profile) {
    profile.rating = ratingN ? Math.round(ratingSum / ratingN) : null;
    profile.ratingConverted = b.source === 'chesscom';
    profile.timeClass = mainTimeClass(b.games.filter((g) => b.results.has(g.id)).map((g) => b.results.get(g.id)!.profiles[g.userColor]));
  }
  return {
    profile,
    record: { w, l, d }, leftFirst, withBook,
    missed: missed.sort((x, y) => y.move.deep.winDrop - x.move.deep.winDrop),
  };
}

function renderBatch() {
  const b = state.batch!;
  app.innerHTML = `
    <div class="game-head">
      <div class="players">${esc(b.user)} <span class="faint">· ${SOURCE_LABEL[b.source]} · ${tr(`${b.games.length}판 종합`, `${b.games.length} games combined`)}</span></div>
      <div class="progress" id="batch-progress"></div>
      <button class="btn" id="batch-back">${tr('게임 목록', 'Game list')}</button>
    </div>
    <div class="batch">
      <div id="batch-profile"></div>
      <div class="card card-pad">
        <div class="section-title">${tr('분석한 게임', 'Analyzed games')}</div>
        <div class="game-table-wrap"><table class="game-table" id="batch-games"></table></div>
      </div>
    </div>`;
  $('#batch-back')!.onclick = () => {
    b.cancelled = true; b.runs.forEach((r) => r.cancel()); state.batch = null; clearPendingBatch();
    track('batch_cancel');
    keepAwake(false);
    state.tab = b.source === 'chesscom' ? 'chesscom' : 'lichessUser';
    render();
  };
  updateBatch();
}

function updateBatchProgress() {
  const b = state.batch, el = $('#batch-progress'); if (!b || !el) return;
  const done = b.results.size;
  if (b.current < 0) { const ms = batchTook.get(b); const took = ms ? ` · ${tr('걸린 시간', 'took')} ${fmtEta(ms)}` : ''; el.innerHTML = `<span class="faint">${tr(`분석 완료 · ${done}/${b.games.length}판 · 깊이 ${b.depth}`, `Done · ${done}/${b.games.length} games · depth ${b.depth}`)}${took}${enginesInUse ? tr(` · 엔진 ${enginesInUse}개`, ` · ${enginesInUse} engines`) : ''}</span>${b.error ? ` <span class="error">${esc(b.error)}</span>` : ''}`; return; }
  const partial = [...b.active.values()].reduce((s, [d, t]) => s + (t ? d / t : 0), 0);
  const frac = (done + partial) / b.games.length;
  const eta = batchEta(b);
  el.innerHTML = `<span class="faint">${tr(`${done}/${b.games.length}판 완료`, `${done}/${b.games.length} games done`)}${eta != null ? ` · ${tr('남은 시간', 'Time left')} ${fmtEta(eta)}` : ` · ${tr('남은 시간 계산 중…', 'Estimating time…')}`}${esc(humanNote())}${isPhone() ? tr(' · 분석 중엔 이 화면을 켜 두세요', ' · Keep this screen on while analyzing') : ''}</span><div class="bar"><i style="width:${frac * 100}%"></i></div>`;
}

function updateBatch() {
  const b = state.batch; if (!b || state.game) return;
  updateBatchProgress();
  const agg = batchProfile(b);
  const pe = $('#batch-profile');
  if (pe) {
    if (!agg.profile) pe.innerHTML = `<div class="card card-pad muted">${tr('첫 게임을 분석하고 있습니다. 끝난 게임부터 프로필에 반영됩니다…', 'Analyzing the first game. Finished games are added to the profile as they complete…')}</div>`;
    else {
      const extra = `
        <div class="stats">
          <div class="stat"><b>${tr(`${agg.record.w}승 ${agg.record.d}무 ${agg.record.l}패`, `${agg.record.w}W ${agg.record.d}D ${agg.record.l}L`)}</b><span>${tr(`분석한 ${b.results.size}판`, `${b.results.size} games analyzed`)}</span></div>
          <div class="stat"><b>${agg.withBook ? Math.round((agg.leftFirst / agg.withBook) * 100) : 0}%</b><span>${tr('먼저 이론을 벗어난 비율', 'Left theory first')}</span></div>
          <div class="stat"><b>${agg.profile.counted}</b><span>${tr('평가한 수 (이론·강제 제외)', 'Moves rated (no theory or forced)')}</span></div>
        </div>
        ${agg.missed.length ? `<div><button class="btn" id="batch-quiz">🧩 ${tr(`놓친 기회 퀴즈 ${agg.missed.length}문제`, `Missed chances quiz (${agg.missed.length})`)}</button></div>` : ''}
        `;
      const done = b.games.filter((g) => b.results.has(g.id));
      // 시간대별: 판마다 만든 프로필을 합친다
      const byTime = new Map<string, PlayerProfile[]>();
      for (const g of done) { const k = g.timeClass; if (!byTime.has(k)) byTime.set(k, []); byTime.get(k)!.push(b.results.get(g.id)!.profiles[g.userColor]); }
      const tail = timeTypeSection([...byTime].map(([cls, list]) => ({ cls, games: list.length, profile: mergeProfiles(list) })), b.user) +
        openingSection(done.map((g) => { const r = b.results.get(g.id)!; return { opening: r.opening?.name ?? g.opening, profile: r.profiles[g.userColor] }; }));
      pe.innerHTML = profileCard(agg.profile, null, {}, { name: b.user, sub: `${SOURCE_LABEL[b.source]} · ${tr(`${b.results.size}판 종합`, `${b.results.size} games combined`)}`, extra, tail, color: '#b5562d' });
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
      const status = r ? `<span class="faint">${tr('정확도', 'Accuracy')} ${p!.accuracy}%</span>` : b.active.has(i) ? `<span class="faint">${tr('분석 중…', 'Analyzing…')}</span>` : `<span class="faint">${tr('대기', 'Waiting')}</span>`;
      return `<tr>
        <td class="faint">${fmtDate(g.date)}</td>
        <td><span class="side-dot ${g.userColor}"></span></td>
        <td>${esc(opp.name)}</td>
        <td class="res-${res ?? 'none'}">${res ? RESULT_LABEL[res] : '-'}</td>
        <td class="opening-cell">${esc(r?.opening?.name ?? g.opening ?? '')}</td>
        <td>${status}</td>
        <td>${r ? `<button class="btn small" data-review="${esc(g.id)}">${tr('보기', 'View')}</button>` : ''}</td>
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
      opening: result.opening?.name ?? h.Opening ?? null, depth: result.depth, url: g.url, timeClass: timeClassOf(h), profile: result.profiles[c],
    });
    if (!ok) state.storageFull = true;
    // 놓친 기회는 이 플레이어의 연습 과제로 모아 둔다
    addPractice(playerKey(g.source, name), findMissed(result.moves, c), `vs ${opponent}${g.date ?? headerDate(h) ? ` · ${fmtDate((g.date ?? headerDate(h))!)}` : ''}`);
  }
}

/** 기보를 읽어 리뷰 화면 상태를 만든다 */
function prepareGame(pgn: string, opts: StartOptions): GameState | null {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch (e) {
    state.inputError = tr('기보를 읽을 수 없습니다: ', 'Could not read the game: ') + (e instanceof Error ? e.message.split('\n')[0] : String(e)); state.view = 'analyze'; render(); return null;
  }
  const history = chess.history({ verbose: true });
  if (!history.length) { state.inputError = tr('수가 하나도 없는 기보입니다.', 'The game has no moves.'); render(); return null; }
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
  track('game_start');

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
      track('game_done');
      updateProgress(); updateMoveList(); updateGraph(); updateCard(); renderProfiles(); updateOpening();
    })
    .catch((err) => { if (state.game === game) { game.error = String(err.message ?? err); updateProgress(); track('game_error'); } });
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
      <div class="head-actions">
        <span class="head-extras" id="head-extras"></span>
        ${state.batch ? `<button class="btn" id="to-batch">← ${tr('종합 프로필', 'Combined profile')}</button>` : ''}
        <button class="btn" id="share" title="${tr('이 기보를 담은 링크를 복사합니다', 'Copy a link to this game')}">🔗 ${tr('공유', 'Share')}</button>
        <button class="btn" id="new">${tr('새 기보', 'New game')}</button>
      </div>
    </div>
    <div class="review">
      <div class="board-col">
        <div class="board-wrap"><div class="cg" id="board"></div></div>
        <div class="board-controls">
          <button class="btn" data-go="first" aria-label="${tr('처음', 'First')}">⏮</button>
          <button class="btn" data-go="prev" aria-label="${tr('이전', 'Previous')}">◀</button>
          <button class="btn" data-go="next" aria-label="${tr('다음', 'Next')}">▶</button>
          <button class="btn" data-go="last" aria-label="${tr('마지막', 'Last')}">⏭</button>
          <button class="btn" data-go="flip" aria-label="${tr('보드 뒤집기', 'Flip board')}">⇅</button>
        </div>
        <div class="card graph-card"><div class="graph" id="graph"></div><div class="faint">${tr('백 기대 점수(Stockfish 승/무/패 확률) · 보라 점: 희생·함정·도박 · 빨강/주황: 블런더·실수', 'White\'s expected score (Stockfish win/draw/loss) · purple dots: sacrifices, traps, gambles · red/orange: blunders, mistakes')}</div></div>
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
    if (state.batch) { state.batch.cancelled = true; state.batch.runs.forEach((r) => r.cancel()); state.batch = null; clearPendingBatch(); }
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
    btn.textContent = tr('링크 복사됨 ✓', 'Link copied ✓');
    setTimeout(() => { if (btn.isConnected) btn.textContent = `🔗 ${tr('공유', 'Share')}`; }, 2000);
  } catch { prompt(tr('이 링크를 복사하세요', 'Copy this link'), url); }
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
  el.innerHTML = `${hl.length ? `<button class="btn" id="highlights">✨ ${tr('명수 카드', 'Highlights')}</button>` : ''}${missed.length ? `<button class="btn" id="quiz">🧩 ${tr('놓친 기회', 'Missed chances')} ${missed.length}</button>` : ''}`;
  $('#highlights')?.addEventListener('click', () => { openHighlights(g); track('share_highlights'); });
  $('#quiz')?.addEventListener('click', () => openQuiz(missed.map((m) => ({ move: m }))));
}

/** 이 판의 명수를 카드 이미지로 보여주고 저장·공유한다 */
async function openHighlights(g: GameState) {
  const hl = pickHighlights(g.analysis!.moves, g.focus ?? undefined);
  const body = openModal(tr('이 판의 명수', 'Highlights of this game'), `<p class="faint">${g.focus ? tr(`${esc(playerName(g.headers, g.focus))}의 수 중 `, `From ${esc(playerName(g.headers, g.focus))}'s moves: `) : ''}${tr('희생·함정·조용한 결정타 등 인상적인 수를 골랐습니다. 이미지를 저장해 공유해 보세요.', 'Striking moves such as sacrifices, traps and quiet killers. Save the images and share them.')}</p><div class="hl-list">${hl.map((_, i) => `<div class="hl-item" data-hl="${i}"><div class="hl-img faint">${tr('그리는 중…', 'Drawing…')}</div></div>`).join('')}</div>`);
  const info = { white: playerName(g.headers, 'w'), black: playerName(g.headers, 'b'), event: [g.headers.Event, g.headers.Date].filter((x) => x && !x.includes('?')).join(' · '), flip: state.orientation === 'black' };
  for (let i = 0; i < hl.length; i++) {
    const item = body.querySelector<HTMLElement>(`[data-hl="${i}"]`)!;
    try {
      const cv = await drawCard(hl[i], info);
      const blob = await cardBlob(cv);
      const url = URL.createObjectURL(blob);
      const name = `stylish-${hl[i].move.moveNumber}${hl[i].move.color}-${hl[i].move.san.replace(/[^\w]/g, '')}.png`;
      item.innerHTML = `<img class="hl-img" src="${url}" alt="${esc(hl[i].move.san)} ${tr('카드', 'card')}" />
        <div class="hl-actions"><a class="btn small" href="${url}" download="${name}">${tr('이미지 저장', 'Save image')}</a>${navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] }) ? `<button class="btn small" data-share-img>${tr('공유', 'Share')}</button>` : ''}<button class="btn small" data-goto="${hl[i].move.ply}">${tr('보드에서 보기', 'Show on board')}</button></div>`;
      item.querySelector<HTMLButtonElement>('[data-share-img]')?.addEventListener('click', () => navigator.share({ files: [new File([blob], name, { type: 'image/png' })] }).catch(() => {}));
      item.querySelector<HTMLButtonElement>('[data-goto]')!.onclick = () => { (body.closest('.modal-backdrop') as HTMLElement & { close?: () => void })?.close?.(); select(hl[i].move.ply); };
    } catch { item.innerHTML = `<p class="error">${tr('이미지를 만들지 못했습니다.', 'Could not create the image.')}</p>`; }
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
  scrollMoveIntoList(ply);
}

/** 수 목록 안에서만 스크롤한다 (페이지 전체가 튀지 않도록) */
function scrollMoveIntoList(ply: number) {
  const wrap = $('.movelist-wrap'), btn = $(`.mv[data-ply="${ply}"]`);
  if (!wrap || !btn) return;
  const w = wrap.getBoundingClientRect(), b = btn.getBoundingClientRect();
  if (b.top < w.top) wrap.scrollTop -= w.top - b.top + 8;
  else if (b.bottom > w.bottom) wrap.scrollTop += b.bottom - w.bottom + 8;
}

document.addEventListener('keydown', (e) => {
  if (!state.game || state.view !== 'analyze' || (e.target as HTMLElement).matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') { go('prev'); e.preventDefault(); }
  if (e.key === 'ArrowRight') { go('next'); e.preventDefault(); }
  if (e.key === 'Home') go('first');
  if (e.key === 'End') go('last');
  if (e.key === 'Escape' && state.game.variation && !document.querySelector('.modal-backdrop')) stepVariation('exit');
});

/** 사람 수 예측 모델(Maia3) 상태 안내: 처음 한 번 내려받는 동안과 실패했을 때만 보인다 */
function humanNote() {
  const s = humanStatus();
  if (s.state === 'loading') {
    const mb = (n: number) => (n / 1048576).toFixed(0);
    return ` · ${tr('사람 수 예측 모델 받는 중', 'Downloading the human-move model')}${s.total ? ` ${mb(s.loaded)}/${mb(s.total)}MB` : '…'} ${tr('(처음 한 번만)', '(first time only)')}`;
  }
  if (s.state === 'failed') return tr(' · 사람 수 예측 모델을 못 받아 간이 규칙으로 판정합니다', ' · Couldn\'t load the human-move model; using simple rules');
  return '';
}

function updateProgress() {
  const g = state.game, el = $('#progress'); if (!g || !el) return;
  if (g.error) { el.innerHTML = `<span class="error">${tr('분석 오류: ', 'Analysis error: ')}${esc(g.error)}</span>`; return; }
  if (g.analysis) {
    const rules = g.analysis.human === 'rules' ? tr(' · 응수 예측: 간이 규칙', ' · reply prediction: simple rules') : '';
    el.innerHTML = `<span class="faint">${tr('분석 완료 · 깊이', 'Done · depth')} ${g.analysis.depth}${rules}</span>`;
    updateHeadExtras();
    return;
  }
  const [d, t] = g.progress;
  el.innerHTML = `<span class="faint">${d === 0 ? tr('엔진 준비 중…', 'Starting engine…') : tr(`분석 중 ${Math.max(0, d - 1)}/${t - 1}수`, `Analyzing ${Math.max(0, d - 1)}/${t - 1} moves`)}${esc(humanNote())}</span><div class="bar"><i style="width:${(d / t) * 100}%"></i></div>`;
}
onHumanStatus(() => { updateProgress(); updateBatchProgress(); });

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
      const title = m?.book ? tr('오프닝 이론', 'Opening theory') : deviation ? tr('이론 이탈', 'Left theory') : '';
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
    el.innerHTML = `<div><div class="section-title">${tr('시작 국면', 'Starting position')}</div><p class="muted">${tr('수 목록에서 수를 누르거나 ← → 키로 이동하세요. 각 수의 스타일, 판단 근거, Stockfish 최선 수를 보여줍니다.', 'Click a move in the list or use the ← → keys. Each move shows its styles, the reasons, and Stockfish\'s best move.')}</p>
      <p class="faint">${tr('색 점은 그 수의 대표 스타일, 기호는 품질(? 실수, ?? 블런더)과 위험 판정(! 건전한 희생, !? 무리한 희생, ⚂ 도박수, ⚑ 함정수)입니다.', 'The colored dot is the move\'s main style; symbols show quality (? mistake, ?? blunder) and risk (! sound sacrifice, !? speculative sacrifice, ⚂ gamble, ⚑ trap).')}</p></div>`;
    return;
  }
  const p = g.plies[g.ply], m = g.results[g.ply];
  if (!m) { el.innerHTML = `<div class="mc-head"><span class="mc-num">${p.moveNumber}${p.color === 'w' ? '.' : '...'}</span><span class="mc-san">${esc(p.san)}</span></div><p class="muted">${tr('아직 분석 중입니다…', 'Still analyzing…')}</p>`; return; }

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
      <div class="var-head"><strong>${esc(v.title)}</strong><button class="ghost small-x" data-var-exit title="${tr('실제 수순으로 돌아가기 (Esc)', 'Back to the game (Esc)')}">✕</button></div>
      <div class="var-line">${v.sans.map((san, i) => {
        const fen = i ? v.fens[i - 1] : v.startFen;
        const white = fen.split(' ')[1] === 'w';
        const no = Number(fen.split(' ')[5]);
        const label = white ? `${no}. ` : i === 0 ? `${no}... ` : '';
        return `<button class="var-mv ${v.idx === i + 1 ? 'active' : ''}" data-var-idx="${i + 1}">${label}${esc(san)}</button>`;
      }).join('')}</div>
      <div class="var-controls"><button class="btn small" data-var-idx="${v.idx - 1}" ${v.idx ? '' : 'disabled'}>◀</button><button class="btn small" data-var-idx="${v.idx + 1}" ${v.idx < v.sans.length ? '' : 'disabled'}>▶</button><span class="faint">${tr('← → 키로 이동 · Esc로 돌아가기', '← → to move · Esc to go back')}</span></div>
    </div>` : '';
  const varButtons = [
    m.trapLine ? `<button class="btn small" data-var="trap">${m.risk === 'gamble' ? '🎲' : '🪤'} ${tr(`상대가 ${esc(m.trapLine.replySan)}를 뒀다면`, `If the opponent played ${esc(m.trapLine.replySan)}`)} ▶</button>` : '',
    !m.book && !m.deep.isBest && m.bestPvSan.length ? `<button class="btn small" data-var="best">${tr('최선 수순 보기', 'Show best line')} ▶</button>` : '',
    m.playedPvSan.length ? `<button class="btn small" data-var="played">${tr('이후 예상 수순', 'Expected continuation')} ▶</button>` : '',
  ].join('');

  el.innerHTML = `${varPanel}
    <div class="mc-head">
      <span class="mc-num">${m.moveNumber}${m.color === 'w' ? '.' : '...'}</span>
      <span class="mc-san">${esc(m.san)}</span>
      ${m.quality ? `<span class="pill q-${m.quality}"${m.quality === 'inaccuracy' ? ` title="${esc(INACCURACY_NOTE())}"` : ''}>${QUALITY_LABEL[m.quality]}</span>` : ''}
      ${m.forced ? `<span class="chip" title="${tr('선택의 여지가 거의 없던 수라 플레이어 평가에서 제외', 'Hardly any choice, so excluded from player stats')}">${tr('강제된 수', 'Forced')}</span>` : ''}
      ${m.humanP != null ? `<span class="chip" title="${tr('같은 레이팅의 사람이 이 국면에서 이 수를 둘 확률 (Maia3 예측)', 'How likely a human at the same rating is to play this move here (Maia3)')}">${tr('사람 선택률', 'Human pick rate')} ${Math.round(m.humanP * 100)}%</span>` : ''}
    </div>
    ${m.risk ? `<div class="risk ${m.risk}"><strong>${RISK_LABEL[m.risk]}</strong><span>${esc(m.riskWhy)}</span></div>` : ''}
    ${varButtons ? `<div class="var-buttons">${varButtons}</div>` : ''}
    ${m.book ? `<div class="book-banner"><strong>${tr('📖 오프닝 이론', '📖 Opening theory')}${m.opening ? ` · ${esc(m.opening.eco)} ${esc(m.opening.name)}` : ''}</strong><span>${tr('이론 수는 하나하나 평가하지 않고, 이 오프닝의 스타일(미리 분석)로 묶어 플레이어 성향에 조금만 반영해요. 정확도에서는 빼요.', 'Theory moves are not rated one by one: they count toward the player\'s style only lightly, as this opening\'s pre-analyzed style, and are left out of accuracy.')}</span></div>${openingStyleHtml(g.analysis?.openingStyle?.[m.color] ?? null)}` : ''}
    ${!m.book && g.ply > 0 && g.results[g.ply - 1]?.book ? `<div class="book-banner dev"><strong>${tr('↳ 이론 이탈', '↳ Left theory')}</strong><span>${tr('여기서부터 알려진 오프닝 이론을 벗어났습니다.', 'From here on, the game left known opening theory.')}</span></div>` : ''}
    <div${m.book ? ' hidden' : ''}>
    <div>
      <div class="section-title">${tr('대표 스타일', 'Main style')}</div>
      <div class="primary-style"><span class="dot" style="background:${styleColor(m.primary)};width:14px;height:14px"></span><span class="label">${styleLabel(m.primary)}</span></div>
    </div>
    ${bars ? `<div><div class="section-title">${tr('스타일 점수', 'Style scores')}</div><div class="style-bars">${bars}</div></div>` : ''}
    ${choice.length ? `<div><div class="section-title">${tr('비슷한 가치의 대안과 비교하면', 'Compared with alternatives of similar value')}</div><div class="chips">${choice.map((k) => `<span class="chip"><span class="dot" style="background:${STYLES[k].color}"></span>${tr(`더 ${STYLES[k].label}인 선택`, `More ${STYLES[k].label.toLowerCase()}`)}</span>`).join('')}</div></div>` : ''}
    </div>
    <div class="engine-box">
      <div class="kv"><span>${tr('평가 (백 기준)', 'Eval (White)')}</span><b>${evalAfter}</b></div>
      ${m.book ? '' : `<div class="kv"><span>${tr('손실', 'Loss')}</span><span>${m.cpLoss}cp</span></div>`}
      ${m.spent != null ? `<div class="kv"><span>${tr('소요 시간 · 남은 시간', 'Time spent · left')}</span><span>${fmtSec(m.spent)} · ${m.clock != null ? fmtClock(m.clock) : '-'}${m.lowTime ? ` <span class="chip warn-chip">${tr('시간 부족', 'Low time')}</span>` : ''}</span></div>` : ''}
      ${!m.book && !m.deep.isBest && m.bestSan ? `<div class="kv"><span>${tr('Stockfish 최선 수', 'Stockfish best')}</span><b>${esc(m.bestSan)}</b></div><div class="line">${esc(m.bestPvSan.join(' '))}</div>` : ''}
      ${m.playedPvSan.length ? `<div class="faint">${tr('이후 예상 수순', 'Expected continuation')}</div><div class="line">${esc(m.playedPvSan.join(' '))}</div>` : ''}
    </div>
    ${reasons ? `<details class="reasons"><summary>${tr('판단 근거 보기', 'Show reasons')}</summary>${reasons}</details>` : ''}`;
  el.querySelectorAll<HTMLButtonElement>('[data-var]').forEach((b) => b.onclick = () => {
    if (b.dataset.var === 'trap' && m.trapLine) openVariation(tr(`상대가 ${m.trapLine.replySan}(을)를 뒀다면`, `If the opponent played ${m.trapLine.replySan}`), g.ply, m.fenAfter, [m.trapLine.replySan, ...m.trapLine.line]);
    if (b.dataset.var === 'best') openVariation(tr(`최선 수 ${m.bestSan ?? ''} 수순`, `Best line ${m.bestSan ?? ''}`), g.ply, m.fenBefore, m.bestPvSan);
    if (b.dataset.var === 'played') openVariation(tr('이후 예상 수순 (Stockfish)', 'Expected continuation (Stockfish)'), g.ply, m.fenAfter, m.playedPvSan);
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

interface CardOptions { name?: string; sub?: string; extra?: string; tail?: string; color?: string; focus?: boolean }

function profileCard(p: PlayerProfile, c: 'w' | 'b' | null, h: Record<string, string>, o: CardOptions = {}) {
  const color = o.color ?? (c === 'b' ? '#5b6ee1' : '#c9a227');
  const name = o.name ?? (c ? playerName(h, c) : '');
  p = withRating(p, name);
  const sub = o.sub ?? `${c === 'w' ? tr('백', 'White') : tr('흑', 'Black')} · ${tr(`평가 대상 ${p.counted}/${p.moves}수`, `${p.counted}/${p.moves} moves rated`)}`;
  const op = p.opening;
  const openingHtml = c && (op.bookMoves || op.deviation)
    ? `<div><div class="section-title">${tr('오프닝', 'Opening')}</div><p class="muted" style="margin:0">${tr(`이론 ${op.bookMoves}수`, `${op.bookMoves} theory moves`)}${op.leftBookFirst === true && op.deviation ? ` · ${tr('먼저 이론을 벗어남', 'Left theory first')}: ${op.deviation.moveNumber}${c === 'w' ? '.' : '...'} ${esc(op.deviation.san)}${op.deviation.quality ? ` (${QUALITY_LABEL[op.deviation.quality]})` : ''}` : op.leftBookFirst === false ? tr(' · 상대가 먼저 이론을 벗어남', ' · Opponent left theory first') : ''}</p></div>`
    : '';
  // 수치는 같은 레이팅 플레이어 대비 백분위로 (50 = 같은 레이팅 평균). 보정 데이터가 없으면 예전 원점수
  const peer = p.counted >= 20 ? peerStats(p) : null; // 수가 적으면 백분위가 극단으로 튀므로 원점수로
  const metricLabel = (k: PeerMetric) => (k === 'risk' ? tr('위험한 수', 'Risky moves') : STYLES[k].label);
  const metricColor = (k: PeerMetric) => (k === 'risk' ? '#ab4aba' : STYLES[k].color);
  const axes = peer
    ? PEER_GROUPS.map((g) => ({ label: tr(g.ko, g.en), value: peerGroupPct(peer, g.keys) }))
    : GROUP_AXES.map((a) => ({ label: a.label, value: groupScore(p.avg, a.keys) }));
  const top = peer
    ? PEER_METRICS.map((k) => ({ k, ...peer[k] })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5).map((x) => {
      const more = x.pct >= 50;
      const rank = more ? tr(`상위 ${Math.max(1, 100 - x.pct)}%`, `top ${Math.max(1, 100 - x.pct)}%`) : tr(`하위 ${Math.max(1, x.pct)}%`, `bottom ${Math.max(1, x.pct)}%`);
      const tip = x.k === 'risk' ? tr('희생·함정·도박 판정을 받은 수의 비율', 'Share of moves judged as sacrifices, traps or gambles') : HOW[x.k];
      return `<div class="pbar" title="${esc(tip)}"><span>${metricLabel(x.k)}</span>
        <div class="ptrack"><b></b><i style="left:${x.pct}%;background:${metricColor(x.k)}"></i></div>
        <span class="val">${more ? tr('많음', 'more') : tr('적음', 'less')} · ${rank}</span></div>`;
    }).join('')
    : p.top.map((k) => `<div class="sbar" title="${esc(HOW[k])}"><span>${STYLES[k].label}</span><div class="track"><i style="width:${p.avg[k]}%;background:${STYLES[k].color}"></i></div><span class="val">${p.avg[k]}</span></div>`).join('');
  const qOrder: QualityKey[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const qColors: Record<QualityKey, string> = { best: 'var(--good)', good: '#8fd1ae', inaccuracy: 'color-mix(in srgb, var(--warn) 40%, var(--border))', mistake: '#e07a2e', blunder: 'var(--bad)' };
  const qTotal = qOrder.reduce((s, k) => s + p.quality[k], 0) || 1;
  const risks = RISK_KINDS.filter((k) => p.risk[k]?.count)
    .map((k) => `<span class="chip" title="${esc(RISK_HELP[k]?.() ?? '')}">${RISK_LABEL[k]} ${tr(`${p.risk[k].count}회`, `×${p.risk[k].count}`)}${k !== 'soundSacrifice' ? ` · ${tr('적중', 'worked')} ${p.risk[k].success}` : ''}</span>`).join('');
  const sliceHtml = (title: string, s: { count: number; top: StyleKey[] }) =>
    `<div class="slice"><b>${title} (${tr(`${s.count}수`, `${s.count} moves`)})</b>${s.count ? s.top.slice(0, 2).map((k) => STYLES[k].label).join(', ') || '-' : '-'}</div>`;

  return `
    <div class="card profile ${o.focus ? 'focus' : ''}">
      <div class="profile-head">${c ? `<span class="side-dot ${c}"></span>` : ''}<span class="name">${esc(name)}</span><span class="faint">${esc(sub)}</span></div>
      ${typeSection(p, name)}
      ${o.extra ?? ''}
      <div class="stats">
        <div class="stat" title="${esc(ACCURACY_NOTE())}"><b>${p.accuracy}%</b><span>${tr('정확도 (Stylish 기준)', 'Accuracy (Stylish)')}</span></div>
        <div class="stat"><b>${p.acpl}</b><span>${tr('평균 손실(cp)', 'Avg loss (cp)')}</span></div>
        <div class="stat"><b>${riskTotal(p)}</b><span>${tr('희생·함정·도박', 'Sacrifices · traps · gambles')}</span></div>
      </div>
      <div class="profile-grid">
        <div class="radar">${radar(axes, color, 200, peer ? 50 : null)}</div>
        <div><div class="section-title">${peer ? tr('같은 레이팅과 비교해 두드러진 점', 'What stands out vs. players at your rating') : tr('자주 보인 스타일', 'Most frequent styles')}</div><div class="style-bars">${top}</div></div>
      </div>
      ${peer ? `<p class="faint chart-note">${tr(`레이팅 ${ratingOf(p)} 전후 플레이어 ${CALIB_PLAYERS}명과 비교했어요. 그래프의 점선과 막대 가운데가 같은 레이팅 평균이에요. 마우스를 올리면 각 항목 설명이 나와요.`, `Compared with ${CALIB_PLAYERS} players around ${ratingOf(p)}. The dashed line and the middle of each bar are the average at that rating. Hover for what each item means.`)}</p>` : ''}
      ${mastersSection(p)}
      <details class="more-details"${detailsOpen() ? ' open' : ''}><summary>${tr('자세히 보기 — 위험한 수·오프닝·단계별·형세별·시간·수의 품질', 'More — risky moves, opening, phases, situations, time, move quality')}</summary>
      ${p.choiceTop.length ? `<div><div class="section-title">${tr('비슷하게 좋은 수가 여럿일 때 더 자주 고른 쪽', 'When several moves were about equally good, you leaned toward')}</div><div class="chips">${p.choiceTop.map((k) => `<span class="chip" title="${esc(tr(`다른 후보 수보다 '${STYLES[k].label}' 점수가 평균 ${p.choice![k]}점 높은 수를 골랐어요`, `Your picks scored ${p.choice![k]} points higher on '${STYLES[k].label}' than the alternatives on average`))}"><span class="dot" style="background:${STYLES[k].color}"></span>${STYLES[k].label}</span>`).join('')}</div></div>` : ''}
      ${risks ? `<div><div class="section-title">${tr('위험한 수', 'Risky moves')}</div><div class="chips">${risks}</div></div>` : ''}
      ${openingHtml}
      <div><div class="section-title">${tr('게임 단계별', 'By game phase')}</div><div class="slices">${sliceHtml(tr('오프닝', 'Opening'), p.byPhase.opening)}${sliceHtml(tr('미들게임', 'Middlegame'), p.byPhase.middlegame)}${sliceHtml(tr('엔드게임', 'Endgame'), p.byPhase.endgame)}</div></div>
      <div><div class="section-title">${tr('형세별', 'By situation')}</div><div class="slices">${sliceHtml(tr('앞설 때', 'When ahead'), p.bySituation.ahead)}${sliceHtml(tr('비슷할 때', 'When equal'), p.bySituation.equal)}${sliceHtml(tr('뒤질 때', 'When behind'), p.bySituation.behind)}</div></div>
      ${timeSection(p.time)}
      <div><div class="section-title">${tr('수의 품질', 'Move quality')}</div>
        <div class="qbar">${qOrder.map((k) => `<i style="width:${(p.quality[k] / qTotal) * 100}%;background:${qColors[k]}"></i>`).join('')}</div>
        <div class="qlegend">${qOrder.map((k) => `<span${k === 'inaccuracy' ? ` class="faint" title="${esc(INACCURACY_NOTE())}"` : ''}><span class="dot" style="background:${qColors[k]}"></span> ${QUALITY_LABEL[k]} ${p.quality[k]}</span>`).join('')}</div>
      </div>
      ${o.tail ?? ''}
      </details>
    </div>`;
}

/** '자세히 보기'를 열어 둔 사람은 다음에도 열린 채로 */
const DETAILS_KEY = 'stylish.details.open';
const detailsOpen = () => { try { return localStorage.getItem(DETAILS_KEY) === '1'; } catch { return false; } };
document.addEventListener('toggle', (e) => {
  const d = e.target as HTMLElement;
  if (d instanceof HTMLDetailsElement && d.classList.contains('more-details')) { try { localStorage.setItem(DETAILS_KEY, d.open ? '1' : '0'); } catch { /* 무시 */ } }
}, true);

/** 위험한 수 종류 설명 (칩에 마우스를 올리면) */
const RISK_HELP: Record<string, () => string> = {
  soundSacrifice: () => tr('물질을 내주지만 엔진 평가는 유지되는 희생', 'Gives up material, but the engine evaluation holds'),
  speculative: () => tr('엔진상 손해지만 실전에서 통할 수 있는 희생', 'Loses against perfect defense but can work in practice'),
  trap: () => tr('손해 없는 수인데, 같은 레이팅 상대가 실제로 잘 걸려드는 응수가 있는 수', 'A no-loss move with a reply that opponents at this rating often fall for'),
  gamble: () => tr('객관적으로는 손해지만, 상대의 실제 응수 확률로 보면 이득인 수', 'Objectively worse, but profitable given how often opponents actually go wrong'),
};

// ───────────── 프로필 메뉴 (저장된 플레이어 성향) ─────────────

const RES_SHORT = { get win() { return tr('승', 'W'); }, get loss() { return tr('패', 'L'); }, get draw() { return tr('무', 'D'); } };

/** 기록 내보내기·가져오기 버튼 (가져오기만: 기록이 없을 때) */
function backupButtons(importOnly = false) {
  return `${importOnly ? '' : `<button class="ghost" id="export-records">${tr('기록 내보내기', 'Export records')}</button>`}
    <label class="btn ghost">${tr('기록 가져오기', 'Import records')}<input type="file" accept="application/json,.json" id="import-records" hidden /></label>`;
}
// ───────────── 그룹 유형 지도 ─────────────

/** 프로필 목록 아래: 내 그룹 + 그룹 만들기·열기 */
function groupsCard() {
  const mine = myGroups();
  return `<div class="card card-pad sync-card"><div class="section-title">${tr('내 그룹', 'My groups')}</div>
    <p class="faint">${tr('친구·디스코드 방·커뮤니티끼리 그룹을 만들어 서로의 유형을 16칸 지도로 봐요. 내 유형은 종합 분석할 때마다 자동으로 갱신돼요.', "Make a group with friends or your community and see everyone's type on a 16-cell map. Your type updates automatically after each combined analysis.")}</p>
    ${mine.length ? `<div class="chips">${mine.map((g) => `<button class="chip" data-open-group="${esc(g.code)}">${esc(g.name)} <span class="faint">${esc(g.code)}</span></button>`).join('')}</div>` : ''}
    <div class="row-gap"><input id="group-name" maxlength="30" placeholder="${tr('새 그룹 이름 (예: 체갤 친구들)', 'New group name')}" aria-label="${tr('새 그룹 이름', 'New group name')}" /><button class="btn" id="group-create">${tr('그룹 만들기', 'Create group')}</button>
    <input id="group-code" maxlength="6" placeholder="${tr('그룹 코드', 'Group code')}" aria-label="${tr('그룹 코드', 'Group code')}" /><button class="btn" id="group-open">${tr('코드로 열기', 'Open by code')}</button></div>
    <p class="faint" id="group-msg" aria-live="polite"></p></div>`;
}
function openGroup(code: string) {
  state.view = 'group'; state.groupCode = code.toUpperCase();
  history.replaceState(null, '', `/app?g=${state.groupCode}${getLang() === 'en' ? '&lang=en' : ''}`);
  render(); window.scrollTo({ top: 0 });
}
function wireGroups() {
  const msg = (t: string) => { const el = $('#group-msg'); if (el) el.textContent = t; };
  $('#group-create')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
    try { const code = await createGroup($<HTMLInputElement>('#group-name')?.value ?? ''); track('group_create'); openGroup(code); }
    catch (err) { msg(err instanceof Error ? err.message : String(err)); btn.disabled = false; }
  });
  $('#group-open')?.addEventListener('click', () => {
    const c = ($<HTMLInputElement>('#group-code')?.value ?? '').trim().toUpperCase();
    if (/^[A-Z2-9]{6}$/.test(c)) openGroup(c); else msg(tr('그룹 코드는 6자예요.', 'Group codes are 6 characters.'));
  });
  app.querySelectorAll<HTMLButtonElement>('[data-open-group]').forEach((b) => b.onclick = () => openGroup(b.dataset.openGroup!));
}

async function renderGroup(code: string) {
  app.innerHTML = `<div class="hero"><h1>${tr('그룹 유형 지도', 'Group type map')}</h1><p class="faint">${tr('불러오는 중…', 'Loading…')}</p></div>`;
  let info: GroupInfo | null = null;
  try { info = await getGroup(code); } catch (e) {
    app.innerHTML = `<div class="hero"><h1>${tr('그룹 유형 지도', 'Group type map')}</h1><p class="error">${esc(e instanceof Error ? e.message : String(e))}</p></div>`;
    return;
  }
  if (state.view !== 'group' || state.groupCode !== code) return;
  if (!info) {
    app.innerHTML = `<div class="hero"><h1>${tr('그룹을 찾을 수 없어요', 'Group not found')}</h1><p>${tr('코드를 확인해 주세요. 만든 지 7일이 지났는데 아무도 없는 그룹은 지워져요.', 'Check the code. Groups with no members after 7 days are deleted.')}</p></div>`;
    return;
  }
  const g = info;
  const mine = myGroups().find((x) => x.code === code);
  const me = g.members.find((m) => m.me);
  const players = listPlayers().filter((p) => p.source !== 'pgn' || isNamed(p.name));
  const link = `${location.origin}/g/${code}`;
  const options = players.map((p) => {
    const t = playerType(p);
    return `<option value="${esc(p.key)}"${mine?.playerKey === p.key ? ' selected' : ''}>${esc(p.name)} (${SOURCE_NAME[p.source]})${t ? ` · ${t.code}` : tr(' · 유형 없음', ' · no type yet')}</option>`;
  }).join('');
  const joinForm = players.length
    ? `<div class="row-gap"><select id="g-player" aria-label="${tr('어떤 아이디로', 'Which account')}">${options}</select>
       <input id="g-nick" maxlength="16" value="${esc(mine?.nickname ?? '')}" placeholder="${tr('닉네임 (비우면 체스 아이디)', 'Nickname (blank = chess ID)')}" aria-label="${tr('닉네임', 'Nickname')}" />
       <button class="btn primary" id="g-join">${me ? tr('내 항목 저장', 'Save my entry') : tr('이 그룹에 들어가기', 'Join this group')}</button>
       ${me ? `<button class="ghost danger" id="g-leave">${tr('나가기', 'Leave')}</button>` : ''}</div>`
    : `<p>${tr('먼저 내 아이디로 종합 분석을 해 주세요. 분석한 아이디로 그룹에 들어갈 수 있어요.', 'First run a combined analysis with your account; then you can join with it.')}</p><button class="btn primary" id="g-analyze">${tr('분석하러 가기', 'Go analyze')}</button>`;
  app.innerHTML = `
    <div class="hero"><h1>${esc(g.name)}</h1><p>${tr(`체스 유형 지도 · ${g.members.length}명 · 코드 ${code}`, `Chess type map · ${g.members.length} members · code ${code}`)}</p>
      <div class="row-gap"><button class="btn" id="g-share">${tr('그룹 링크 공유', 'Share group link')}</button><span class="faint">${esc(link)}</span></div></div>
    <div class="card card-pad">${groupMapHtml(g)}</div>
    <div class="card card-pad sync-card"><div class="section-title">${me ? tr('내 항목', 'My entry') : tr('나도 들어가기', 'Join')}</div>
      <p class="faint">${tr('이름은 기본으로 체스 아이디가 보이고, 원하면 닉네임으로 바꿀 수 있어요. 내 유형은 이 브라우저에서 종합 분석이 끝날 때마다 자동으로 갱신되고, 내 항목은 이 브라우저에서만 고칠 수 있어요.', 'Your chess ID is shown by default, or set a nickname. Your type updates automatically after each combined analysis in this browser, and only this browser can edit your entry.')}</p>
      ${joinForm}<p class="faint" id="g-msg" aria-live="polite"></p></div>`;
  const msg = (t: string) => { const el = $('#g-msg'); if (el) el.textContent = t; };
  $('#g-share')?.addEventListener('click', async (e) => {
    const text = tr(`${g.name} 체스 유형 지도에 들어와서 내 유형도 넣어 봐!`, `Join the ${g.name} chess type map and add your type!`);
    try {
      if (navigator.share) await navigator.share({ title: 'Stylish', text, url: link });
      else { await navigator.clipboard.writeText(`${text}\n${link}`); (e.currentTarget as HTMLElement).textContent = tr('복사했어요', 'Copied'); }
    } catch { /* 공유 창을 닫음 */ }
  });
  $('#g-analyze')?.addEventListener('click', () => setView('analyze'));
  $('#g-join')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
    try {
      await joinGroup(code, g.name, $<HTMLSelectElement>('#g-player')!.value, $<HTMLInputElement>('#g-nick')?.value.trim() || null);
      track('group_join');
      renderGroup(code);
    } catch (err) { msg(err instanceof Error ? err.message : String(err)); btn.disabled = false; }
  });
  $('#g-leave')?.addEventListener('click', async () => {
    if (!confirm(tr('이 그룹에서 나갈까요?', 'Leave this group?'))) return;
    try { await leaveGroup(code); renderGroup(code); } catch (err) { msg(err instanceof Error ? err.message : String(err)); }
  });
}

/** 기기 동기화: 코드 하나로 여러 기기에서 같은 기록 */
function syncCard() {
  const st = syncState();
  const body = st
    ? `<p>${tr('이 기기는 동기화 코드로 연결돼 있어요. 종합 분석이 끝날 때마다 자동으로 올라가요.', 'This device is linked with a sync code. Records upload automatically after each combined analysis.')}</p>
       <div class="sync-code"><code>${esc(st.code)}</code><button class="ghost small" id="sync-copy">${tr('복사', 'Copy')}</button></div>
       <p class="faint">${st.lastSync ? tr(`마지막 동기화: ${new Date(st.lastSync).toLocaleString()}`, `Last synced: ${new Date(st.lastSync).toLocaleString()}`) : ''}</p>
       <div class="row-gap"><button class="btn" id="sync-now">${tr('지금 동기화', 'Sync now')}</button><button class="ghost" id="sync-off">${tr('이 기기 연결 끊기', 'Unlink this device')}</button></div>`
    : `<p>${tr('동기화 코드를 만들면 휴대폰과 PC 등 여러 기기에서 같은 기록을 볼 수 있어요. 가입은 필요 없어요.', 'Create a sync code to see the same records on your phone, PC and other devices. No sign-up needed.')}</p>
       <div class="row-gap"><button class="btn primary" id="sync-create">${tr('동기화 코드 만들기', 'Create a sync code')}</button>
       <input id="sync-input" maxlength="19" placeholder="${tr('받은 코드 입력', 'Enter a code')}" aria-label="${tr('받은 동기화 코드', 'Sync code')}" /><button class="btn" id="sync-connect">${tr('코드로 연결', 'Link with code')}</button></div>`;
  return `<div class="card card-pad sync-card"><div class="section-title">${tr('기기 동기화', 'Sync across devices')}</div>${body}
    <p class="faint">${tr('코드를 아는 사람은 누구나 이 기록을 볼 수 있으니 남에게 알려 주지 마세요. 마지막으로 쓴 지 30일이 지나면 서버에서 자동으로 지워져요. 코드를 잃어버리면 되찾을 수 없어요.', 'Anyone with the code can see these records, so keep it private. It is deleted from the server 30 days after last use and cannot be recovered if lost.')}</p>
    <p class="faint" id="sync-msg" aria-live="polite"></p></div>`;
}
function wireSync() {
  const msg = (t: string) => { const el = $('#sync-msg'); if (el) el.textContent = t; };
  const busy = async (btn: HTMLButtonElement | null, fn: () => Promise<void>) => {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { msg(e instanceof Error ? (e.message === 'bad code' ? tr('코드를 다시 확인해 주세요 (16자).', 'Please check the code (16 characters).') : e.message) : String(e)); }
    finally { if (btn) btn.disabled = false; }
  };
  $('#sync-create')?.addEventListener('click', (e) => busy(e.currentTarget as HTMLButtonElement, async () => { await createSync(); track('sync_create'); render(); }));
  $('#sync-connect')?.addEventListener('click', (e) => busy(e.currentTarget as HTMLButtonElement, async () => {
    const n = await connectSync($<HTMLInputElement>('#sync-input')?.value ?? '');
    track('sync_connect');
    render(); msg(tr(`연결했어요. 플레이어 ${n}명의 기록을 합쳤어요.`, `Linked. Merged records for ${n} players.`));
  }));
  $('#sync-now')?.addEventListener('click', (e) => busy(e.currentTarget as HTMLButtonElement, async () => { const n = await syncNow(); render(); msg(tr(`동기화했어요 (플레이어 ${n}명).`, `Synced (${n} players).`)); }));
  $('#sync-off')?.addEventListener('click', () => { if (confirm(tr('이 기기의 연결을 끊을까요? 이 기기의 기록은 그대로 남아요.', 'Unlink this device? Records on this device stay.'))) { disconnectSync(); render(); } });
  $('#sync-copy')?.addEventListener('click', async (e) => { const st = syncState(); if (st) { await navigator.clipboard.writeText(st.code).catch(() => {}); (e.currentTarget as HTMLElement).textContent = tr('복사했어요', 'Copied'); } });
}

function wireBackup() {
  wireSync();
  $('#export-records')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([exportRecords()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `stylish-records-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $<HTMLInputElement>('#import-records')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { const n = importRecords(await f.text()); alert(tr(`플레이어 ${n}명의 기록을 가져왔어요.`, `Imported records for ${n} players.`)); render(); }
    catch (err) { alert(tr('기록 파일을 읽지 못했어요: ', 'Could not read the record file: ') + (err instanceof Error ? err.message : String(err))); }
  });
}

/** 기록이 없을 때 공통 안내 */
const emptyRecords = (msg: string) => `<p class="muted">${msg}</p><a class="btn primary" href="/app?tab=user" data-view="analyze" data-tab-go="lichessUser">${tr('내 게임 분석하기', 'Analyze my games')}</a>`;
const viewHero = (title: string, lead: string) => `<div class="hero"><h1>${title}</h1><p>${lead}</p></div>`;

function renderGroups() {
  app.innerHTML = `${viewHero(tr('그룹 유형 지도', 'Group type maps'), tr('그룹을 만들어 코드나 링크를 공유하면, 들어온 사람들의 유형이 16칸 지도와 축별 인원으로 모여요.', 'Create a group and share its code or link: everyone who joins appears on a 16-cell type map with counts per axis.'))}
    ${groupsCard()}`;
  wireGroups();
}

function renderSyncView() {
  app.innerHTML = `${viewHero(tr('기기 동기화·백업', 'Sync & backup'), tr('기록은 이 브라우저에만 저장돼요. 다른 기기에서도 보려면 동기화 코드를 쓰거나 기록 파일로 옮기세요.', 'Records are stored only in this browser. To see them elsewhere, use a sync code or move a record file.'))}
    ${syncCard()}
    <div class="card card-pad sync-card"><div class="section-title">${tr('기록 파일로 백업', 'Back up to a file')}</div>
      <p class="faint">${tr('이 브라우저의 기록을 파일로 내보내거나, 내보낸 파일을 가져와 지금 기록과 합칠 수 있어요. 서버를 거치지 않아요.', 'Export the records in this browser to a file, or import one to merge with your current records. Nothing goes through a server.')}</p>
      <div class="row-gap">${backupButtons()}</div></div>`;
  wireBackup();
}

function renderPractice() {
  const rows = listPlayers().map((pl) => ({ pl, st: practiceStats(pl.key), set: weeklySet(pl.key) })).filter((x) => x.st.total);
  app.innerHTML = `${viewHero(tr('연습 과제', 'Practice'), tr(`분석한 내 게임에서 놓친 기회가 문제로 쌓여요. 매주 새 문제 ${WEEKLY}개가 나와요.`, `Chances you missed in your analyzed games become problems. ${WEEKLY} new ones every week.`))}
    <div class="card card-pad return-card">${rows.length ? rows.map(({ pl, st, set }) => `<div class="return-row">
      <div><b>${esc(pl.name)} <span class="faint">${SOURCE_NAME[pl.source]}</span></b>
        <span class="faint">${tr(`이번 주 ${Math.min(st.solvedThisWeek, WEEKLY)}/${WEEKLY} 완료 · 남은 문제 ${st.unsolved}개`, `${Math.min(st.solvedThisWeek, WEEKLY)}/${WEEKLY} done this week · ${st.unsolved} unsolved`)}</span></div>
      ${set.length ? `<button class="btn primary" data-practice="${esc(pl.key)}">🧩 ${tr(`연습하기 (${set.length}문제)`, `Practice (${set.length})`)}</button>` : `<span class="faint">${tr('이번 주 과제를 다 풀었어요!', "You're done for this week!")}</span>`}
    </div>`).join('') : emptyRecords(tr('아직 연습 문제가 없어요. 내 게임을 분석하면 놓친 기회가 문제로 쌓여요.', 'No problems yet. Analyze your games and missed chances become problems.'))}</div>`;
  app.querySelectorAll<HTMLButtonElement>('[data-practice]').forEach((b) => b.onclick = () => {
    const key = b.dataset.practice!, set = weeklySet(key);
    openQuiz(set.map((x) => ({ move: asQuizMove(x), game: x.game })), tr('이번 주 연습 과제', "This week's practice"), (i, ok) => { markPractice(key, set[i].id, ok); });
  });
}

function renderRecap() {
  const list = listPlayers().map((pl) => ({ pl, html: monthlySection(gamesOf(pl), pl.name) })).filter((x) => x.html);
  app.innerHTML = `${viewHero(tr('월간 결산', 'Monthly recap'), tr('한 달 동안의 유형·정확도 변화·대담한 수·많이 둔 오프닝을 카드 한 장으로 받아 공유하세요. 월초 1주일 동안은 지난달 결산을 보여 줘요.', "Your month's type, accuracy change, bold moves and favorite opening on one shareable card. During the first week of a month it shows last month."))}
    ${list.length ? list.map(({ pl, html }) => `<div class="card card-pad return-card" data-recap-for="${esc(pl.key)}"><div class="section-title">${esc(pl.name)} <span class="faint">${SOURCE_NAME[pl.source]}</span></div>${html}</div>`).join('')
      : `<div class="card card-pad">${emptyRecords(tr('이번 달(월초에는 지난달)에 둔 게임을 분석하면 결산이 생겨요.', 'Analyze games from this month (or last month, early on) to get a recap.'))}</div>`}`;
  app.querySelectorAll<HTMLElement>('[data-recap-for]').forEach((c) => c.querySelector('[data-recap-image]')?.addEventListener('click', () => {
    const p = getPlayer(c.dataset.recapFor!); if (p) openRecapImage(gamesOf(p), p.name);
  }));
}

function renderCompare() {
  const mine = listPlayers().flatMap((pl) => {
    const prof = combinedProfile(pl);
    const t = prof && prof.counted >= 20 ? chessTypeOf(withRating(prof, pl.name)) : null;
    return t ? [{ pl, t }] : [];
  });
  const friends = friendsSection(mine[0]?.t ?? null);
  app.innerHTML = `${viewHero(tr('유형 비교', 'Compare types'), tr('내 유형을 확인한 뒤 친구에게 비교 링크를 보내세요. 친구가 링크를 열고 자기 게임을 분석하면 두 사람의 유형이 나란히 나와요.', 'Get your type, then send a friend a compare link. When they open it and analyze their games, your types appear side by side.'))}
    <div class="card card-pad return-card">
      <div class="section-title">${tr('비교 링크 보내기', 'Send a compare link')}</div>
      ${mine.length ? mine.map(({ pl, t }) => `<div class="return-row">
        <div><b>${esc(pl.name)} <span class="type-code small">${t.code}</span></b><span class="faint">${esc(t.info.name)} · ${SOURCE_NAME[pl.source]}</span></div>
        <button type="button" class="btn primary" data-compare-type="${esc(JSON.stringify({ code: t.code, name: pl.name, pcts: t.axes.map((a) => a.pct) }))}">${tr('비교 링크 만들기', 'Make a compare link')}</button>
      </div>`).join('') : emptyRecords(tr('아직 유형이 나온 플레이어가 없어요. 아이디로 최근 게임을 종합 분석하면 유형이 나와요.', 'No player has a type yet. Run a combined analysis of recent games by username to get one.'))}
    </div>
    ${friends ? `<div class="card card-pad return-card">${friends}</div>` : ''}`;
}

function renderBookmarklet() {
  app.innerHTML = `${viewHero(tr('브라우저 버튼', 'Browser button'), tr('Chess.com·Lichess에서 게임이 끝난 뒤 버튼 하나만 누르면, 그 판이 바로 Stylish로 와서 분석돼요. PC 브라우저용이에요.', 'After a game on Chess.com or Lichess, one click opens it in Stylish for analysis. For desktop browsers.'))}
    <div class="card card-pad bookmarklet-card">
      <p class="fairplay"><b>${tr('끝난 게임만 분석해요.', 'Finished games only.')}</b> ${tr('대국 중에 외부 분석을 보는 건 Chess.com·Lichess 공정 플레이 규칙 위반이라, 진행 중인 대국에서는 버튼이 나오지 않아요.', "Looking at outside analysis during a game breaks Chess.com and Lichess fair-play rules, so the button never appears in a game that is still going.")}</p>
      <h2>${tr('1. 확장 프로그램 (크롬·엣지)', '1. Browser extension (Chrome, Edge)')}</h2>
      <p class="faint">${tr('끝난 게임 화면 오른쪽 아래에 "Stylish로 분석" 버튼이 저절로 떠요. 가장 편해요.', 'An "Analyze in Stylish" button appears at the bottom right of finished games. The easiest option.')}</p>
      <ol class="steps">
        <li>${tr('아래 파일을 받아 압축을 풀어요.', 'Download the file below and unzip it.')} <a class="btn" href="/downloads/stylish-extension.zip" data-track="ext_download">${tr('확장 프로그램 받기 (zip)', 'Download extension (zip)')}</a></li>
        <li>${tr('주소창에 <code>chrome://extensions</code> (엣지는 <code>edge://extensions</code>)를 열고 <b>개발자 모드</b>를 켜요.', 'Open <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) and turn on <b>Developer mode</b>.')}</li>
        <li>${tr('<b>압축해제된 확장 프로그램 로드</b>를 눌러 압축을 푼 <code>stylish-extension</code> 폴더를 골라요.', 'Click <b>Load unpacked</b> and pick the unzipped <code>stylish-extension</code> folder.')}</li>
      </ol>
      <p class="faint">${tr('스토어를 거치지 않는 베타라 자동 업데이트가 안 돼요. 새 버전이 나오면 패치노트에서 알려 드려요. 권한은 Chess.com·Lichess 페이지에서만 동작하는 것 하나이고, 아무 정보도 모으지 않아요.', 'This is a beta outside the store, so it does not auto-update; new versions are announced in the updates page. It only runs on Chess.com and Lichess pages and collects nothing.')}</p>
      <h2>${tr('2. Tampermonkey', '2. Tampermonkey')}</h2>
      <p class="faint">${tr('Tampermonkey(또는 Violentmonkey)를 쓰고 있다면 아래를 누르면 설치 화면이 떠요. 확장 프로그램과 같은 버튼이에요.', 'If you use Tampermonkey (or Violentmonkey), click below to install. Same button as the extension.')}</p>
      <p><a class="btn" href="/stylish.user.js" data-track="userscript_install">${tr('Tampermonkey 스크립트 설치', 'Install the Tampermonkey script')}</a></p>
      <h2>${tr('3. 북마클릿 (설치 없이)', '3. Bookmarklet (no install)')}</h2>
      <ol class="steps">
        <li>${tr('즐겨찾기 줄을 켜세요 (Chrome·Edge: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>, Mac은 <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>).', 'Show your bookmarks bar (Chrome/Edge: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>, Mac: <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>).')}</li>
        <li>${tr('아래 버튼을 마우스로 끌어다 즐겨찾기 줄에 놓으세요.', 'Drag the button below onto the bookmarks bar.')}</li>
        <li>${tr('Chess.com이나 Lichess의 끝난 게임 화면에서 즐겨찾기 줄의 버튼을 눌러요.', 'Click the bookmark on a finished Chess.com or Lichess game.')}</li>
      </ol>
      <p><a class="btn primary bookmarklet" href="${esc(BOOKMARKLET)}" onclick="return false" draggable="true">♞ ${tr('Stylish로 보기', 'Open in Stylish')}</a></p>
      <p class="faint">${tr('여기서 누르면 아무 일도 일어나지 않아요. 즐겨찾기 줄에 놓은 뒤 게임 화면에서 눌러 주세요. 예전에 받은 Lichess 북마클릿은 이걸로 바꾸면 Chess.com도 돼요.', 'Clicking it here does nothing; drop it on the bookmarks bar and use it on a game page. Replace an older Lichess-only bookmarklet with this one to add Chess.com.')}</p>
      <p class="faint">${tr('휴대폰은 아직 지원하지 않아요. 휴대폰에서는 게임 링크를 복사해 분석 화면에 붙여 넣는 방법을 준비 중이에요.', 'Phones are not supported yet; pasting a game link into the analysis page is coming.')}</p>
    </div>`;
}

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
        <td>${tr(`${games.length}판`, `${games.length} games`)}</td>
        <td>${prof && prof.counted >= 20 ? chessTypeOf(prof)?.code ?? '-' : '-'}</td>
        <td class="faint">${prof ? `${tr('정확도', 'Accuracy')} ${prof.accuracy}%` : ''}</td>
        <td class="faint">${fmtDate(pl.updatedAt)}</td>
      </tr>`;
    }).join('');
    app.innerHTML = `
      <div class="hero"><h1>${tr('프로필', 'Profile')}</h1><p>${tr('분석한 게임마다 플레이어의 성향이 이 브라우저에 저장되고, 판이 쌓일수록 합쳐서 보여줍니다.', 'Each analyzed game saves the players\' tendencies in this browser and combines them as games add up.')}</p></div>
      <div class="card card-pad players-card">
        ${state.storageFull ? `<p class="error">${tr('브라우저 저장 공간이 가득 차서 일부 기록을 저장하지 못했습니다. 안 쓰는 플레이어를 지워 주세요.', 'Browser storage is full, so some records were not saved. Please delete players you no longer need.')}</p>` : ''}
        ${players.length ? `
          <div class="game-table-wrap"><table class="game-table players-table">${rows}</table></div>
          <div class="account-foot"><span class="faint">${tr('기록은 이 브라우저에만 저장돼요. 다른 기기에서도 보려면 ', 'Records are stored only in this browser. To see them on another device, use ')}<a href="/app?view=sync" data-view="sync">${tr('기기 동기화·백업', 'Sync & backup')}</a>${tr('을 쓰세요.', '.')}</span><span class="row-gap"><button class="ghost danger" id="clear-players">${tr('전체 삭제', 'Delete all')}</button></span></div>`
        : `<p class="muted">${tr('아직 저장된 플레이어가 없습니다. 기보를 분석하거나 Chess.com·Lichess 아이디로 게임을 분석하면 여기에 쌓입니다.', 'No saved players yet. Analyze a game or load games by Chess.com or Lichess username and they will appear here.')}</p><button class="btn primary" id="go-analyze">${tr('분석하러 가기', 'Go analyze')}</button>
          <p class="faint" style="margin-top:12px">${tr('다른 기기에서 분석한 기록이 있다면 ', 'Analyzed on another device? Bring your records over with ')}<a href="/app?view=sync" data-view="sync">${tr('기기 동기화·백업', 'Sync & backup')}</a>${tr('으로 가져오세요.', '.')}</p>`}
      </div>
      <div class="menu-hints">
        <a class="card" href="/app?view=practice" data-view="practice"><b>🧩 ${tr('연습 과제', 'Practice')}</b><span>${tr('놓친 기회로 만든 이번 주 문제', "This week's problems")}</span></a>
        <a class="card" href="/app?view=recap" data-view="recap"><b>📅 ${tr('월간 결산', 'Monthly recap')}</b><span>${tr('한 달을 카드 한 장으로', 'Your month on one card')}</span></a>
        <a class="card" href="/app?view=groups" data-view="groups"><b>🗺️ ${tr('그룹 유형 지도', 'Group type maps')}</b><span>${tr('친구들과 유형 모아 보기', 'Types of your friends together')}</span></a>
        <a class="card" href="/app?view=sync" data-view="sync"><b>🔄 ${tr('기기 동기화·백업', 'Sync & backup')}</b><span>${tr('휴대폰·PC에서 같은 기록', 'Same records on every device')}</span></a>
      </div>`;
    app.querySelectorAll<HTMLTableRowElement>('tr[data-player]').forEach((tr) => tr.onclick = () => { state.playerKey = tr.dataset.player!; renderPlayers(); window.scrollTo({ top: 0 }); });
    $('#clear-players')?.addEventListener('click', () => { if (confirm(tr('저장된 모든 플레이어 기록을 지울까요?', 'Delete all saved player records?'))) { clearPlayers(); clearPractice(); state.storageFull = false; renderPlayers(); } });
    $('#go-analyze')?.addEventListener('click', () => setView('analyze'));
    return;
  }

  const prof = combinedProfile(p)!;
  const games = gamesOf(p);
  const rec = { win: 0, loss: 0, draw: 0 };
  for (const g of games) if (g.result) rec[g.result]++;
  const extra = `
    <div class="stats">
      <div class="stat"><b>${tr(`${rec.win}승 ${rec.draw}무 ${rec.loss}패`, `${rec.win}W ${rec.draw}D ${rec.loss}L`)}</b><span>${tr(`저장된 ${games.length}판`, `${games.length} saved games`)}</span></div>
      <div class="stat"><b>${prof.counted}</b><span>${tr('평가한 수 (이론·강제 제외)', 'Moves rated (no theory or forced)')}</span></div>
      <div class="stat"><b>${tr('백', 'White')} ${games.filter((g) => g.color === 'w').length} · ${tr('흑', 'Black')} ${games.filter((g) => g.color === 'b').length}</b><span>${tr('둔 색', 'Colors played')}</span></div>
    </div>
    `;
  const byTime = new Map<string, PlayerProfile[]>();
  for (const g of games) if (g.timeClass) { if (!byTime.has(g.timeClass)) byTime.set(g.timeClass, []); byTime.get(g.timeClass)!.push(g.profile); }
  const tail = `${timeTypeSection([...byTime].map(([cls, list]) => ({ cls, games: list.length, profile: mergeProfiles(list) })), p.name)}
    ${trendSection(games.map((g) => ({ date: g.date ?? g.savedAt, profile: g.profile })))}
    ${openingSection(games.map((g) => ({ opening: g.opening, profile: g.profile })))}`;
  const rows = games.map((g) => `<tr>
    <td class="faint">${g.date ? fmtDate(g.date) : '-'}</td>
    <td><span class="side-dot ${g.color}"></span></td>
    <td>${esc(g.opponent)}</td>
    <td class="res-${g.result ?? 'none'}">${g.result ? RES_SHORT[g.result] : '-'}</td>
    <td class="opening-cell">${esc(g.opening ?? '')}</td>
    <td class="faint">${tr('정확도', 'Accuracy')} ${g.profile.accuracy}%</td>
    <td>${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener" class="faint">${tr('원본', 'Source')}</a>` : ''}</td>
    <td><button class="ghost small-x" data-del-game="${esc(g.gameId)}" title="${tr('이 판 기록 삭제', 'Delete this game')}">✕</button></td>
  </tr>`).join('');
  app.innerHTML = `
    <div class="game-head">
      <button class="btn" id="players-back">${tr('← 프로필 목록', '← All profiles')}</button>
      <div class="spacer"></div>
      <button class="ghost danger" id="del-player">${tr('이 플레이어 삭제', 'Delete this player')}</button>
    </div>
    ${returnCard(p, games)}
    <div class="batch">
      <div>${profileCard(prof, null, {}, { name: p.name, sub: `${SOURCE_NAME[p.source]} · ${tr(`저장된 ${games.length}판 전체 기준`, `based on all ${games.length} saved games`)}`, extra: `<p class="faint chart-note">${tr('이 화면은 지금까지 저장된 모든 판을 합친 결과라, 방금 분석한 몇 판만의 결과와 다를 수 있어요.', 'This combines every saved game, so it can differ from the result of the few games you just analyzed.')}</p>${extra}`, tail, color: '#b5562d' })}</div>
      <div class="card card-pad">
        <div class="section-title">${tr('저장된 게임', 'Saved games')}</div>
        <div class="game-table-wrap"><table class="game-table">${rows}</table></div>
        <p class="faint">${tr('각 판의 성향은 분석할 때의 깊이 기준입니다. 같은 게임을 다시 분석하면 덮어씁니다.', 'Each game reflects the depth it was analyzed at. Analyzing the same game again overwrites it.')}</p>
      </div>
    </div>`;
  $('#players-back')!.onclick = () => { state.playerKey = null; renderPlayers(); };
  $('#del-player')!.onclick = () => { if (confirm(tr(`${p.name}의 기록을 모두 지울까요?`, `Delete all records for ${p.name}?`))) { deletePlayer(p.key); clearPractice(p.key); state.playerKey = null; renderPlayers(); } };
  app.querySelectorAll<HTMLButtonElement>('[data-del-game]').forEach((b) => b.onclick = () => { deleteGame(p.key, b.dataset.delGame!); renderPlayers(); });
  $('#practice-start')?.addEventListener('click', () => {
    const set = weeklySet(p.key);
    openQuiz(set.map((x) => ({ move: asQuizMove(x), game: x.game })), tr('이번 주 연습 과제', "This week's practice"), (i, ok) => { markPractice(p.key, set[i].id, ok); });
  });
  $('#update-games')?.addEventListener('click', () => updateGames(p));
  $('[data-recap-image]')?.addEventListener('click', () => openRecapImage(gamesOf(p), p.name));
}

/** 아이디 고정 주소 (/u/사이트/아이디) */
const pinUrl = (source: string, user: string) => `${location.origin}/u/${source === 'chesscom' ? 'chesscom' : 'lichess'}/${encodeURIComponent(user)}`;
/** 북마클릿: Lichess 게임 화면의 주소를 Stylish 분석으로 넘긴다 (다른 사이트에서는 안내만) */
// String.raw: 정규식의 백슬래시(\/ \d)가 템플릿 문자열에서 사라지지 않게
const BOOKMARKLET = String.raw`javascript:(async()=>{const S='${location.origin}',L=location,w=open('about:blank');const go=(u)=>{w?w.location.href=u:L.assign(u)},no=(m)=>{w&&w.close();alert(m)};try{if(/(^|\.)chess\.com$/.test(L.hostname)){const m=L.pathname.match(/\/game\/(live|daily)\/(\d+)/);if(m){const g=(await(await fetch('/callback/'+m[1]+'/game/'+m[2])).json()).game;if(!g.isFinished)return no('끝난 게임에서 눌러 주세요 / Finished games only');const h=g.pgnHeaders||{};return go(S+'/app?'+new URLSearchParams({cc:m[2],ccw:h.White||'',ccb:h.Black||'',cct:g.endTime||'',ref:'bm'}))}}if(L.hostname==='lichess.org'){const m=L.pathname.match(/^\/([a-zA-Z0-9]{8})(\/|$)/);if(m){const g=await(await fetch('/game/export/'+m[1]+'?moves=false',{headers:{Accept:'application/json'}})).json();if(g.status==='started'||g.status==='created')return no('끝난 게임에서 눌러 주세요 / Finished games only');return go(S+'/app?link='+encodeURIComponent('https://lichess.org/'+m[1])+'&ref=bm')}}}catch(e){}no('Chess.com·Lichess의 끝난 게임 화면에서 눌러 주세요 / Use this on a finished Chess.com or Lichess game')})()`;

/** 프로필 상세 위: 다시 와서 할 일 (유형 변화, 이번 주 연습, 새 게임 분석) */
function returnCard(p: SavedPlayer, games: SavedGame[]) {
  const st = practiceStats(p.key);
  const set = weeklySet(p.key);
  const change = typeChangeSection(games.map((g) => ({ date: g.date ?? g.savedAt, profile: g.profile })));
  const online = p.source === 'lichess' || p.source === 'chesscom';
  // 유형 도감·챌린지용: 전체 판 유형, 최근 10판 유형
  const all = combinedProfile(p);
  const allType = all && all.counted >= 20 ? chessTypeOf(withRating(all, p.name)) : null;
  recordType(p.key, allType);
  const recentGames = [...games].sort((a, b) => (b.date ?? b.savedAt) - (a.date ?? a.savedAt)).slice(0, 10);
  const recentP = mergeProfiles(recentGames.map((g) => g.profile));
  const recentType = recentP && recentP.counted >= 20 ? chessTypeOf(withRating(recentP, p.name)) : null;
  return `<div class="card card-pad return-card">
    ${weeklySection(games)}
    ${monthlySection(games, p.name)}
    ${change}
    ${challengeSection(p.key, recentType)}
    ${typeDexSection(p.key)}
    ${friendsSection(allType)}
    <div class="return-row">
      <div><b>${tr('이번 주 연습 과제', "This week's practice")}</b>
        <span class="faint">${st.total ? tr(`내 게임에서 놓친 기회로 만든 문제 · 이번 주 ${Math.min(st.solvedThisWeek, WEEKLY)}/${WEEKLY} 완료 · 남은 문제 ${st.unsolved}개`, `Problems from chances you missed · ${Math.min(st.solvedThisWeek, WEEKLY)}/${WEEKLY} done this week · ${st.unsolved} unsolved`) : tr('게임을 분석하면 놓친 기회가 연습 문제로 쌓여요.', 'Analyze games and your missed chances become practice problems.')}</span></div>
      ${set.length ? `<button class="btn primary" id="practice-start">🧩 ${tr(`연습하기 (${set.length}문제)`, `Practice (${set.length})`)}</button>` : ''}
    </div>
    ${online ? `<div class="return-row">
      <div><b>${tr('새 게임 분석하기', 'Analyze new games')}</b><span class="faint">${tr(`${SOURCE_NAME[p.source]}에서 아직 분석하지 않은 최근 게임만 불러와 이어서 분석해요.`, `Loads only recent ${SOURCE_NAME[p.source]} games you haven't analyzed yet.`)}</span></div>
      <button class="btn" id="update-games">${tr('새 게임 불러오기', 'Load new games')}</button>
    </div>` : ''}
    <p class="faint" id="update-msg"></p>
    ${online ? `<div class="return-row"><div><b>${tr('내 고정 주소', 'My permanent link')}</b>
        <span class="faint">${tr('즐겨찾기 해 두면 열 때마다 새로 둔 게임만 바로 분석해요.', 'Bookmark it: every time you open it, only your new games are analyzed.')}</span></div>
        <div class="row-gap"><code class="pin-url">${esc(pinUrl(p.source, p.name))}</code><button class="ghost small" data-copy="${esc(pinUrl(p.source, p.name))}">${tr('복사', 'Copy')}</button></div></div>
      <div class="return-row bookmarklet-row"><div><b>${tr('브라우저 버튼 (PC)', 'Browser button (PC)')}</b>
        <span class="faint">${tr('아래 버튼을 브라우저 즐겨찾기 줄로 끌어다 놓으세요. Lichess에서 게임을 보다가 누르면 그 판이 바로 Stylish로 와서 분석돼요.', 'Drag the button to your bookmarks bar. Click it while viewing a Lichess game to analyze that game in Stylish.')}</span></div>
        <a class="btn bookmarklet" href="${esc(BOOKMARKLET)}" onclick="return false" draggable="true">♞ ${tr('Stylish로 보기', 'Open in Stylish')}</a></div>` : ''}
  </div>`;
}

/** 저장된 아이디의 최근 게임 중 아직 분석하지 않은 것만 종합 분석 */
async function updateGames(p: SavedPlayer) {
  const btn = $<HTMLButtonElement>('#update-games'), msgEl = $('#update-msg');
  if (btn) { btn.disabled = true; btn.textContent = tr('불러오는 중…', 'Loading…'); }
  try {
    const source = p.source as Source;
    const page = await fetchGames(source, p.name, null);
    const seen = new Set(Object.keys(p.games));
    const fresh = page.games.filter((g) => !seen.has(gameHash(g.pgn))).slice(0, 10);
    if (!fresh.length) {
      if (msgEl) msgEl.textContent = tr('새로 분석할 게임이 없어요. 게임을 더 두고 다시 와 주세요!', 'No new games to analyze. Play some more and come back!');
      if (btn) { btn.disabled = false; btn.textContent = tr('새 게임 불러오기', 'Load new games'); }
      return;
    }
    state.account = { source, user: p.name, games: page.games, next: page.next, loading: false, error: null, selected: new Set(fresh.map((g) => g.id)), timeFilter: 'all' };
    state.tab = source === 'chesscom' ? 'chesscom' : 'lichessUser';
    setView('analyze');
    startBatch(fresh);
  } catch (err) {
    if (msgEl) msgEl.textContent = err instanceof Error ? err.message : String(err);
    if (btn) { btn.disabled = false; btn.textContent = tr('새 게임 불러오기', 'Load new games'); }
  }
}

// ───────────── 소개 ─────────────


/** 코치 대국이 끝나면 이미 계산한 수별 평가로 바로 리뷰 화면을 연다 (내 성향은 '나'로 저장) */
function openCoachReview(pgn: string, result: GameAnalysis, color: 'w' | 'b') {
  state.view = 'analyze';
  setMenuActive();
  showAnalyzed(pgn, result, { focus: color, save: [color] });
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
// 체스 유형 공유 버튼 (카드는 innerHTML로 그려지므로 위임으로 처리)
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-share-type]');
  if (b) { shareType(b.dataset.shareType!, b); track('share_type_link'); }
  const cmp = (e.target as HTMLElement).closest<HTMLElement>('[data-compare-type]');
  if (cmp) { shareCompare(JSON.parse(cmp.dataset.compareType!), cmp); track('share_compare'); }
  if ((e.target as HTMLElement).closest('[data-vs-clear]')) { clearVs(); (e.target as HTMLElement).closest('.vs-banner')?.remove(); }
  if ((e.target as HTMLElement).closest('[data-retry-load]')) (document.querySelector('.account-form button[type=submit], form button[type=submit]') as HTMLButtonElement | null)?.click();
  const chal = (e.target as HTMLElement).closest<HTMLElement>('[data-challenge]');
  if (chal && state.playerKey) { const [axis, toward, pct] = chal.dataset.challenge!.split(':').map(Number); setChallenge(state.playerKey, axis, toward as 0 | 1, pct); renderPlayers(); }
  if ((e.target as HTMLElement).closest('[data-challenge-clear]') && state.playerKey) { clearChallenge(state.playerKey); renderPlayers(); }
  const cp = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
  if (cp) navigator.clipboard.writeText(cp.dataset.copy!).then(() => { cp.textContent = tr('복사했어요', 'Copied'); }).catch(() => {});
  const op = (e.target as HTMLElement).closest<HTMLElement>('[data-open-player]');
  if (op) { setView('players'); state.playerKey = op.dataset.openPlayer!; renderPlayers(); }
  if ((e.target as HTMLElement).closest('[data-resume-batch]')) { const pb = loadPendingBatch(); if (pb) startBatch(pb.games, { source: pb.source, user: pb.user }); }
  if ((e.target as HTMLElement).closest('[data-resume-clear]')) { clearPendingBatch(); (e.target as HTMLElement).closest('.resume-banner')?.remove(); }
  const img = (e.target as HTMLElement).closest<HTMLElement>('[data-type-image]');
  if (img) { openResultImage(JSON.parse(img.dataset.typeImage!)); track('share_image'); }
  // 레이팅 직접 입력
  const rs = (e.target as HTMLElement).closest<HTMLElement>('[data-rating-save]');
  if (rs) {
    const input = rs.parentElement?.querySelector<HTMLInputElement>('[data-rating-input]');
    const v = Number(input?.value);
    if (v >= 400 && v <= 3000) { setRatingOverride(rs.dataset.ratingSave!, v); rerenderProfiles(); }
    else input?.focus();
  }
  const rc = (e.target as HTMLElement).closest<HTMLElement>('[data-rating-clear]');
  if (rc) { setRatingOverride(rc.dataset.ratingClear!, null); rerenderProfiles(); }
});
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === 'Enter' && t.matches('[data-rating-input]')) t.parentElement?.querySelector<HTMLButtonElement>('[data-rating-save]')?.click();
});
/** 프로필 카드만 다시 그린다 (분석 중인 화면은 건드리지 않음) */
function rerenderProfiles() {
  if (state.view === 'players') renderPlayers();
  else if (state.game) renderProfiles();
  else if (state.batch) updateBatch();
}

/** 첫 화면(유형 소개)에서 넘어온 요청: /app?source=lichess&user=… 이면 바로 게임 목록, ?view=coach 등은 그 메뉴로 */
/** 확장 프로그램 등에서 넘겨받은 Chess.com 게임 (readEntryQuery → openChesscomGame) */
let pendingChesscom: ChesscomRef | null = null;

/** Chess.com 게임 번호로 판을 찾아 분석. 아직 공개 기록에 없으면 안내 */
async function openChesscomGame(ref: ChesscomRef) {
  app.insertAdjacentHTML('afterbegin', `<div class="vs-banner" id="cc-loading"><b>${tr('Chess.com에서 게임을 불러오는 중…', 'Loading the game from Chess.com…')}</b></div>`);
  const pgn = await findChesscomGame(ref).catch(() => null);
  $('#cc-loading')?.remove();
  if (pgn) { startAnalysis(pgn); return; }
  track('chesscom_game_missing');
  state.inputError = tr('Chess.com 공개 기록에서 이 게임을 아직 찾지 못했어요. 방금 끝난 게임이면 1~2분 뒤 다시 눌러 주세요.', "This game isn't in Chess.com's public records yet. If it just ended, try again in a minute or two.");
  renderInput();
}

function readEntryQuery() {
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
  if (view && URL_VIEWS.includes(view as View)) state.view = view as View;
  // 메뉴의 분석 항목: ?tab=user(아이디) · ?tab=pgn(기보)
  const tabQ = q.get('tab');
  if (tabQ === 'user') state.tab = 'lichessUser';
  else if (tabQ === 'pgn') state.tab = 'paste';
  // 유입 경로 꼬리표(?ref=): 이 방문(세션)에 붙여 둔다 (예: 스트리머 메일 링크)
  const ref = q.get('ref');
  if (ref && /^[\w-]{1,40}$/.test(ref)) track('ref_landing', { ref });
  if (q.get('vs')) track('compare_landing');
  // 그룹 유형 지도 (/g/코드 → /app?g=코드)
  const g = q.get('g')?.trim().toUpperCase();
  if (g && /^[A-Z2-9]{6}$/.test(g)) { state.view = 'group'; state.groupCode = g; }
  // 친구가 보낸 비교 신청: 이 탭에서 기억해 두고, 내 결과가 나오면 나란히 보여준다
  const vs = q.get('vs') ? decodeVs(q.get('vs')!) : null;
  if (vs) { saveVs(vs); saveFriend(vs); if (!q.get('source')) state.tab = 'lichessUser'; }
  const source = q.get('source'), user = q.get('user')?.trim();
  let entry: 'list' | 'pinned' | 'link' | 'chesscom' | null = null;
  if ((source === 'lichess' || source === 'chesscom') && user) {
    // 아이디 고정 주소(/u/…): 이미 분석한 아이디면 프로필로 가서 새 게임만 바로 분석
    const saved = q.get('pin') === '1' ? getPlayer(playerKey(source, user)) : null;
    if (saved) { state.view = 'players'; state.playerKey = saved.key; entry = 'pinned'; track('pin_open'); }
    else {
      state.tab = source === 'chesscom' ? 'chesscom' : 'lichessUser';
      state.account = { source, user, games: [], next: null, loading: true, error: null, selected: new Set(), timeFilter: 'all' };
      state.pinHint = q.get('pin') === '1' ? { source, user } : null;
      entry = 'list';
      track('id_from_link', { source });
    }
  }
  // 북마클릿: Lichess 게임 화면에서 누르면 그 판을 바로 분석
  const link = q.get('link');
  if (!entry && link && /^https:\/\/lichess\.org\/[a-zA-Z0-9]{8}/.test(link)) { state.tab = 'lichess'; state.lichessUrl = link; entry = 'link'; track('bookmarklet_open'); }
  // 확장 프로그램·Tampermonkey·북마클릿: Chess.com 게임 화면에서 누르면 그 판을 찾아 바로 분석
  const cc = !entry ? readChesscomRef(q) : null;
  if (cc) { pendingChesscom = cc; state.tab = 'paste'; entry = 'chesscom'; track('chesscom_game_open'); }
  // 주소는 정리하되, 새로고침해도 같은 화면이 나오도록 화면(view)·그룹 코드는 남긴다
  if (q.size) history.replaceState(null, '', location.pathname + (state.view === 'group' ? `?g=${state.groupCode}` : URL_VIEWS.includes(state.view) ? `?view=${state.view}` : '') + location.hash);
  return entry;
}

/** 앱 머리글·바닥글(app.html)을 현재 언어로, 언어 전환 버튼 */
function applyChromeLang() {
  const en = getLang() === 'en';
  document.documentElement.lang = en ? 'en' : 'ko';
  if (en) document.title = 'Analyze — Stylish chess style analysis';
  const menu = $('#site-menu');
  if (menu) menu.outerHTML = menuHtml({ lang: getLang(), inApp: true, langSwitch: `<button type="button" id="lang-toggle" class="mm-lang">English</button>` });
  const brand = document.querySelector<HTMLAnchorElement>('.topbar .brand');
  if (brand) { brand.href = en ? '/en/' : '/'; brand.title = tr('체스 유형 소개로', 'To the chess types home'); }
  const toggle = $<HTMLButtonElement>('#lang-toggle');
  if (toggle) {
    toggle.textContent = en ? '한국어' : 'English';
    toggle.lang = en ? 'ko' : 'en';
    toggle.onclick = () => { saveLang(en ? 'ko' : 'en'); location.replace(location.pathname + location.search + location.hash); };
  }
  const footer = $('#app-footer');
  if (footer && en) footer.innerHTML = `Stylish is <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GPLv3</a> open source.
      Engine: <a href="https://stockfishchess.org" target="_blank" rel="noopener">Stockfish 19</a>
      (<a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">stockfish.js</a>, GPLv3) ·
      Board: <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noopener">chessground</a> (GPLv3).
      Everything is computed in your browser.
      <nav class="footer-links"><a href="/en/types/">16 chess types</a> · <a href="/en/about">About</a> · <a href="/en/privacy">Privacy</a> · <a href="/en/contact">Contact</a></nav>`;
}
applyChromeLang();

// 엔진은 첫 화면에서 미리 띄워 둔다 (WASM 다운로드·초기화 시간 단축)
getEngine().catch(() => {});
const entry = readEntryQuery();
setMenuActive();
render();
if (entry === 'pinned') { const p = state.playerKey ? getPlayer(state.playerKey) : null; if (p) updateGames(p); }
if (entry === 'link') onGo();
if (entry === 'chesscom' && pendingChesscom) openChesscomGame(pendingChesscom);
// 첫 화면·아이디 주소에서 왔으면 최근 10판을 미리 골라 둔다 (버튼 한 번이면 종합 분석 → 체스 유형)
if (entry === 'list') loadMore().then(() => {
  const a = state.account;
  if (a && !a.selected.size && a.games.length) { a.selected = new Set(a.games.slice(0, 10).map((g) => g.id)); renderInput(); }
});
openShared();
