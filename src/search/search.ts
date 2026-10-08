// 직접 만든 소형 탐색: 알파-베타 + 정지 탐색. 스타일 판정용 질의를 제공한다.
// 점수는 모두 센티폰, '둘 차례' 관점.
import { Position, P, N, B, R, Q, K, BLACK, mFrom, mTo, mPromo } from './position';

export const MATE = 30000;
const VAL = [0, 100, 320, 330, 500, 900, 0];

// 간단한 위치 보너스 (백 기준, a1=0 … h8=63 인덱스)
const CENTER = (s: number) => {
  const f = s & 7, r = s >> 4;
  return 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
};

function evaluate(pos: Position): number {
  const b = pos.board;
  let score = 0, npm = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const pc = b[s];
    if (!pc) continue;
    const t = pc & 7;
    if (t !== P && t !== K) npm += VAL[t];
  }
  const endgame = npm <= 2600;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const pc = b[s];
    if (!pc) continue;
    const t = pc & 7, black = (pc & BLACK) !== 0;
    const rel = black ? 7 - (s >> 4) : s >> 4;
    let v = VAL[t];
    if (t === N || t === B) v += CENTER(s) * 6;
    else if (t === P) v += rel * (endgame ? 12 : 4) + ((s & 7) >= 2 && (s & 7) <= 5 ? 4 : 0);
    else if (t === K) v += endgame ? CENTER(s) * 10 : rel === 0 ? 10 : -rel * 12;
    else if (t === Q) v += CENTER(s) * 2;
    score += black ? -v : v;
  }
  return pos.side ? -score : score;
}

export interface SearchResult { score: number; best: string | null; nodes: number; aborted: boolean }

export class Searcher {
  nodes = 0;
  budget = 40000;
  aborted = false;
  private bestRoot = 0;

  constructor(budget = 40000) { this.budget = budget; }

  private order(pos: Position, moves: number[]): number[] {
    const b = pos.board;
    const key = (m: number) => {
      const victim = b[mTo(m)] & 7, attacker = b[mFrom(m)] & 7;
      return (victim ? 10 * VAL[victim] - VAL[attacker] + 10000 : 0) + (mPromo(m) ? 9000 : 0);
    };
    return moves.map((m) => [key(m), m]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  }

  private qsearch(pos: Position, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    const inCheck = pos.inCheck();
    if (!inCheck) {
      const stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 24) return stand;
    }
    let legal = 0;
    for (const m of this.order(pos, pos.generate(!inCheck))) {
      if (!pos.make(m)) continue;
      legal++;
      const v = -this.qsearch(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    if (inCheck && !legal) return -MATE + ply;
    return alpha;
  }

  private negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) return this.qsearch(pos, alpha, beta, ply);
    this.nodes++;
    if (this.nodes > this.budget) { this.aborted = true; return evaluate(pos); }
    let best = -MATE * 2, legal = 0;
    for (const m of this.order(pos, pos.generate())) {
      if (!pos.make(m)) continue;
      legal++;
      const v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      pos.unmake();
      if (v > best) { best = v; if (ply === 0) this.bestRoot = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (!legal) return pos.inCheck() ? -MATE + ply : 0;
    return best;
  }

  /** 반복 심화로 깊이 depth까지 (예산 안에서) 탐색 */
  search(pos: Position, depth: number): SearchResult {
    this.nodes = 0; this.aborted = false; this.bestRoot = 0;
    let score = 0, best = 0;
    for (let d = 1; d <= depth; d++) {
      const s = this.negamax(pos, d, -MATE * 2, MATE * 2, 0);
      if (this.aborted && d > 1) break;
      score = s; best = this.bestRoot;
    }
    return { score, best: best ? pos.toUci(best) : null, nodes: this.nodes, aborted: this.aborted };
  }

  static staticEval(pos: Position) { return evaluate(pos); }
}

// ───────────── 스타일 판정용 질의 ─────────────

export interface ThreatInfo { gain: number; move: string | null }

/**
 * 위협: '둘 차례가 아닌 쪽'이 한 수 더 둘 수 있다면 얼마나 이득을 보나 (null move).
 * 예: 내가 수를 두기 전 국면에서 이걸 계산하면 "상대가 지금 노리는 것"이 된다.
 */
export function threatOf(fen: string, s = new Searcher()): ThreatInfo {
  const pos = Position.fromFen(fen);
  if (pos.inCheck()) return { gain: 0, move: null }; // 체크 중에는 쉴 수 없다
  pos.makeNull();
  if (pos.inCheck(pos.side ^ 1)) { pos.unmakeNull(); return { gain: 0, move: null }; }
  const base = Searcher.staticEval(pos);
  const r = s.search(pos, 2);
  pos.unmakeNull();
  return { gain: Math.max(0, r.score - base), move: r.best };
}

export interface ReplyOutcome { uci: string; value: number }

/** 상대 응수들 각각에 대해, 그 뒤 '나'(응수 받는 쪽) 관점의 탐색 점수 */
export function replyOutcomes(fen: string, replies: string[], depth = 2, s = new Searcher()): ReplyOutcome[] {
  const pos = Position.fromFen(fen);
  const out: ReplyOutcome[] = [];
  for (const uci of replies) {
    const m = pos.fromUci(uci);
    if (m == null) continue;
    pos.make(m);
    const r = s.search(pos, depth);
    pos.unmake();
    out.push({ uci, value: r.score });
  }
  return out;
}

/**
 * 주그츠방: 둘 차례인 쪽이 '차라리 쉬고 싶은' 정도 (센티폰).
 * 양수가 크면 수를 둬야 하는 것 자체가 손해인 상태.
 */
export function zugzwangOf(fen: string, depth = 3, s = new Searcher(60000)): number {
  const pos = Position.fromFen(fen);
  if (pos.inCheck()) return 0;
  const move = s.search(pos, depth).score;
  pos.makeNull();
  const pass = -s.search(pos, depth).score;
  pos.unmakeNull();
  return Math.max(0, pass - move);
}

/** 정지 탐색까지 포함한 국면 점수 (둘 차례 관점) */
export function quickValue(fen: string, depth = 2, s = new Searcher()): number {
  return s.search(Position.fromFen(fen), depth).score;
}

export { K, Q, R, B, N, P };
