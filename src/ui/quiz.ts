// 놓친 기회 퀴즈: 실제 대국에서 큰 손해를 본 국면에서 Stockfish 최선 수를 직접 찾아본다.
import { Chess, SQUARES, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api as CgApi } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { MoveAnalysis } from '../core/analyzer';
import { openModal } from './modal';

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
  if (san.includes('#')) return '메이트가 있습니다';
  if (san.includes('+')) return '체크로 시작합니다';
  if (san.includes('x')) return '잡는 수로 시작합니다';
  return '조용한 수입니다 (체크도 잡기도 아님)';
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

export function openQuiz(items: QuizItem[], title = '놓친 기회 퀴즈') {
  if (!items.length) return;
  let i = 0, solved = 0, tried = new Set<number>();
  let cg: CgApi | null = null;
  const body = openModal(title, `
    <div class="quiz">
      <div class="quiz-board"><div class="cg" id="quiz-board"></div></div>
      <div class="quiz-side">
        <div class="quiz-count faint"></div>
        <div class="quiz-q"></div>
        <div class="quiz-msg"></div>
        <div class="quiz-actions">
          <button class="btn" data-q="hint">힌트</button>
          <button class="btn" data-q="answer">정답 보기</button>
          <button class="btn primary" data-q="next">다음 문제</button>
        </div>
      </div>
    </div>`, () => cg?.destroy());

  const $ = (s: string) => body.querySelector<HTMLElement>(s)!;
  const msg = (html: string, cls = '') => { const el = $('.quiz-msg'); el.className = `quiz-msg ${cls}`; el.innerHTML = html; };

  function show() {
    const { move: m, game } = items[i];
    const turn = m.color === 'w' ? 'white' : 'black';
    $('.quiz-count').textContent = `${i + 1} / ${items.length} · 맞힌 문제 ${solved}`;
    $('.quiz-q').innerHTML = `${game ? `<div class="faint">${esc(game)}</div>` : ''}<b>${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${turn === 'white' ? '백' : '흑'} 차례</b><p>실제 대국에서는 <b>${esc(m.san)}</b>를 둬서 기대 점수 ${Math.round(m.deep.winDrop)}%p를 잃었습니다. 더 좋은 수를 찾아보세요.</p>`;
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

  function onMove(orig: Key, dest: Key) {
    const m = items[i].move;
    const ch = new Chess(m.fenBefore);
    const piece = ch.get(orig as Square);
    const promo = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : undefined;
    const uci = orig + dest + (promo ?? '');
    const best = m.deep.bestMove!;
    const played = ch.move({ from: orig, to: dest, promotion: promo });
    // 승격은 퀸으로 자동 처리하므로 최선 수가 다른 기물 승격이면 칸만 비교한다
    if (uci === best || (best.length === 5 && uci.slice(0, 4) === best.slice(0, 4))) {
      if (!tried.has(i)) solved++;
      tried.add(i);
      cg!.set({ fen: ch.fen(), movable: { color: undefined, dests: new Map() } });
      $('.quiz-count').textContent = `${i + 1} / ${items.length} · 맞힌 문제 ${solved}`;
      msg(`<b>정답!</b> Stockfish 수순: ${esc(m.bestPvSan.join(' '))}`, 'ok');
    } else {
      tried.add(i);
      const same = uci.slice(0, 4) === m.uci.slice(0, 4);
      msg(same ? `<b>${esc(played.san)}</b>는 실제 대국에서 둔 수입니다. 다른 수를 찾아보세요.` : `<b>${esc(played.san)}</b>는 Stockfish 최선 수가 아닙니다. 다시 해 보세요.`, 'no');
      setTimeout(() => { if (cg) cg.set({ fen: m.fenBefore, lastMove: undefined, turnColor: m.color === 'w' ? 'white' : 'black', movable: { color: m.color === 'w' ? 'white' : 'black', dests: dests(m.fenBefore) } }); }, 700);
    }
  }

  body.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.onclick = () => {
    const m = items[i].move;
    if (b.dataset.q === 'hint') msg(`힌트: ${hintOf(m)}. 움직일 기물은 ${m.deep.bestMove!.slice(0, 2)} 칸에 있습니다.`);
    if (b.dataset.q === 'answer') {
      tried.add(i);
      const best = m.deep.bestMove!;
      cg!.set({ drawable: { autoShapes: [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'green' }] } });
      msg(`정답은 <b>${esc(m.bestSan)}</b> · 수순: ${esc(m.bestPvSan.join(' '))}`);
    }
    if (b.dataset.q === 'next') { i = (i + 1) % items.length; show(); }
  });
  show();
}
