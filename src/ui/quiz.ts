// 놓친 기회 퀴즈: 실제 대국에서 큰 손해를 본 국면에서 Stockfish 최선 수를 직접 찾아본다.
import { tr } from '../i18n';
import { Chess, SQUARES, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { MoveAnalysis } from '../core/analyzer';
import { openModal } from './modal';
import { choosePromotion, isPromotion } from './promotion';

export interface QuizItem { move: MoveAnalysis; game?: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * 문제로 낼 국면: 이론·강제 수가 아니고, 실제 수가 기대 점수 20%p 이상을 잃었으며,
 * 이미 진 국면이 아니고, 최선 수가 다른 후보보다 확실히 좋은(찾을 가치가 있는) 경우.
 */
export function findMissed(moves: MoveAnalysis[], color?: 'w' | 'b'): MoveAnalysis[] {
  // 도박수·무리한 희생은 일부러 위험을 감수한 선택이라 '놓친 기회'로 보지 않는다
  return moves.filter((m) => !m.book && !m.forced && !m.risk && (!color || m.color === color) &&
    m.deep.winDrop >= 20 && m.deep.expBefore >= 0.2 && m.deep.bestMove && m.deep.bestGap >= 50)
    .sort((a, b) => b.deep.winDrop - a.deep.winDrop);
}

function hintOf(m: MoveAnalysis) {
  const san = m.bestSan ?? '';
  if (san.includes('#')) return tr('메이트가 있습니다', 'There is a mate');
  if (san.includes('+')) return tr('체크로 시작합니다', 'It starts with a check');
  if (san.includes('x')) return tr('잡는 수로 시작합니다', 'It starts with a capture');
  return tr('조용한 수입니다 (체크도 잡기도 아님)', 'It is a quiet move (no check, no capture)');
}

function dests(fen: string) {
  const ch = new Chess(fen);
  const map = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const ms = ch.moves({ square: s as Square, verbose: true });
    if (ms.length) map.set(s as Key, ms.map((m) => m.to as Key));
  }
  return map;
}

/** onResult: 문제마다 처음 결과(정답 보기 없이 맞혔는지)를 알려준다 (연습 과제 기록용) */
export function openQuiz(items: QuizItem[], title = tr('놓친 기회 퀴즈', 'Missed chances quiz'), onResult?: (i: number, solved: boolean) => void) {
  if (!items.length) return;
  let i = 0, solved = 0, tried = new Set<number>();
  const reported = new Set<number>(), revealed = new Set<number>();
  const report = (k: number, ok: boolean) => { if (!reported.has(k)) { reported.add(k); onResult?.(k, ok); } };
  let cg: CgApi | null = null;
  const body = openModal(title, `
    <div class="quiz">
      <div class="quiz-board"><div class="cg" id="quiz-board"></div></div>
      <div class="quiz-side">
        <div class="quiz-count faint"></div>
        <div class="quiz-q"></div>
        <div class="quiz-msg"></div>
        <div class="quiz-actions">
          <button class="btn" data-q="hint">${tr('힌트', 'Hint')}</button>
          <button class="btn" data-q="answer">${tr('정답 보기', 'Show answer')}</button>
          <button class="btn primary" data-q="next">${tr('다음 문제', 'Next')}</button>
        </div>
      </div>
    </div>`, () => cg?.destroy());

  const $ = (s: string) => body.querySelector<HTMLElement>(s)!;
  const msg = (html: string, cls = '') => { const el = $('.quiz-msg'); el.className = `quiz-msg ${cls}`; el.innerHTML = html; };

  function show() {
    const { move: m, game } = items[i];
    const turn = m.color === 'w' ? 'white' : 'black';
    $('.quiz-count').textContent = `${i + 1} / ${items.length} · ${tr('맞힌 문제', 'Solved')} ${solved}`;
    $('.quiz-q').innerHTML = `${game ? `<div class="faint">${esc(game)}</div>` : ''}<b>${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${tr(`${turn === 'white' ? '백' : '흑'} 차례`, `${turn === 'white' ? 'White' : 'Black'} to move`)}</b><p>${tr(`실제 대국에서는 <b>${esc(m.san)}</b>를 둬서 기대 점수 ${Math.round(m.deep.winDrop)}%p를 잃었습니다. 더 좋은 수를 찾아보세요.`, `In the game, <b>${esc(m.san)}</b> was played and lost ${Math.round(m.deep.winDrop)} pp of expected score. Find a better move.`)}</p>`;
    msg('');
    const opts = {
      fen: m.fenBefore, orientation: turn as 'white' | 'black', turnColor: turn as 'white' | 'black', lastMove: undefined,
      coordinates: true, check: new Chess(m.fenBefore).inCheck(),
      movable: { free: false, color: turn as 'white' | 'black', dests: dests(m.fenBefore), showDests: true, events: { after: onMove } },
      drawable: { enabled: false, visible: true, autoShapes: [] },
      animation: { enabled: true, duration: 160 },
    };
    if (cg) cg.set(opts); else cg = Chessground($('#quiz-board'), opts);
  }

  async function onMove(orig: Key, dest: Key) {
    const at = i;
    const m = items[i].move;
    const ch = new Chess(m.fenBefore);
    const piece = ch.get(orig as Square);
    let promo: string | undefined;
    if (isPromotion(piece?.type, dest)) {
      const choice = await choosePromotion($('#quiz-board'), dest, piece!.color === 'w' ? 'white' : 'black', cg!.state.orientation);
      if (at !== i) return;
      if (!choice) { cg!.set({ fen: m.fenBefore, movable: { color: m.color === 'w' ? 'white' : 'black', dests: dests(m.fenBefore) } }); return; }
      promo = choice;
    }
    const uci = orig + dest + (promo ?? '');
    const best = m.deep.bestMove!;
    const played = ch.move({ from: orig, to: dest, promotion: promo });
    if (uci === best) {
      if (!tried.has(i)) solved++;
      tried.add(i);
      report(i, !revealed.has(i));
      cg!.set({ fen: ch.fen(), movable: { color: undefined, dests: new Map() } });
      $('.quiz-count').textContent = `${i + 1} / ${items.length} · ${tr('맞힌 문제', 'Solved')} ${solved}`;
      msg(tr(`<b>정답!</b> Stockfish 수순: ${esc(m.bestPvSan.join(' '))}`, `<b>Correct!</b> Stockfish line: ${esc(m.bestPvSan.join(' '))}`), 'ok');
    } else {
      tried.add(i);
      const same = uci.slice(0, 4) === m.uci.slice(0, 4);
      msg(same ? tr(`<b>${esc(played.san)}</b>는 실제 대국에서 둔 수입니다. 다른 수를 찾아보세요.`, `<b>${esc(played.san)}</b> is the move played in the game. Try another.`) : tr(`<b>${esc(played.san)}</b>는 Stockfish 최선 수가 아닙니다. 다시 해 보세요.`, `<b>${esc(played.san)}</b> is not Stockfish's best move. Try again.`), 'no');
      setTimeout(() => { if (cg) cg.set({ fen: m.fenBefore, lastMove: undefined, turnColor: m.color === 'w' ? 'white' : 'black', movable: { color: m.color === 'w' ? 'white' : 'black', dests: dests(m.fenBefore) } }); }, 700);
    }
  }

  body.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.onclick = () => {
    const m = items[i].move;
    if (b.dataset.q === 'hint') msg(tr(`힌트: ${hintOf(m)}. 움직일 기물은 ${m.deep.bestMove!.slice(0, 2)} 칸에 있습니다.`, `Hint: ${hintOf(m)}. The piece to move is on ${m.deep.bestMove!.slice(0, 2)}.`));
    if (b.dataset.q === 'answer') {
      tried.add(i);
      revealed.add(i);
      report(i, false);
      const best = m.deep.bestMove!;
      cg!.set({ drawable: { autoShapes: [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'green' }] } });
      msg(tr(`정답은 <b>${esc(m.bestSan)}</b> · 수순: ${esc(m.bestPvSan.join(' '))}`, `The answer is <b>${esc(m.bestSan)}</b> · line: ${esc(m.bestPvSan.join(' '))}`));
    }
    if (b.dataset.q === 'next') { i = (i + 1) % items.length; show(); }
  });
  show();
}
