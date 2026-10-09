// 분석 파이프라인: Stockfish 패스 → 수별 특징(정적 + PV 앞보기 + 소형 탐색) → 재확인 → 채점.
import { Chess, type Move } from 'chess.js';
import type { Engine, EngineLine } from '../engine/uci';
import { MATE_CP, expectedScore } from '../engine/uci';
import { extractFeatures, type MoveLike, type StaticFeatures } from './features';
import { scoreMove, STYLE_KEYS, type DeepFeatures, type StyleKey, type StyleResult, type RiskKind } from './styles';
import { rankNaturalMoves } from './natural';
import { gridFromFen, material, opp, kingZone, attackMap, type Color } from './grid';
import { Position } from '../search/position';
import { Searcher, threatOf, replyOutcomes, quickValue } from '../search/search';
import { buildProfiles, type PlayerProfile } from './profile';
import type { OpeningBook, OpeningInfo } from './openings';

// 손실 계산용 상한: 이 이상은 사실상 결판난 국면
const CAP = 1000;
const cap = (x: number) => Math.max(-CAP, Math.min(CAP, x));

export interface AnalyzeOptions {
  depth?: number;
  onProgress?: (done: number, total: number) => void;
  onMove?: (m: MoveAnalysis) => void;
  signal?: { aborted: boolean };
  /** 오프닝 이론 판별용 (없으면 이론 판별을 하지 않는다) */
  book?: OpeningBook | null;
}

export interface MoveAnalysis extends StyleResult {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evalWhiteAfter: number;     // 백 관점 cp (메이트는 ±CAP)
  expWhiteAfter: number;      // 그래프용: Stockfish WDL 기준 백 기대 점수 0~1
  mateAfter: number | null;   // 백 관점 메이트 수 (있으면)
  cpLoss: number;
  bestSan: string | null;
  bestPvSan: string[];
  playedPvSan: string[];
  phase: 'opening' | 'middlegame' | 'endgame';
  situation: 'ahead' | 'equal' | 'behind';
  choiceDelta: Partial<Record<StyleKey, number>> | null;
  /** 오프닝 이론 수 (스타일은 계산하되 흐리게 보여주고 플레이어 평가에서 제외) */
  book: boolean;
  /** 이 수까지 도달한 오프닝 이름 (이론 안에 있을 때) */
  opening: OpeningInfo | null;
  /** 상대가 실제로 틀렸는지 (위험 판정 수의 성공 여부) */
  riskSucceeded: boolean | null;
  features: StaticFeatures;
  deep: DeepFeatures;
}

export interface GameAnalysis {
  headers: Record<string, string>;
  startFen: string;
  moves: MoveAnalysis[];
  profiles: { w: PlayerProfile; b: PlayerProfile };
  depth: number;
  /** 이론을 따라간 마지막 국면의 오프닝 이름 */
  opening: OpeningInfo | null;
  /** 이론 수 개수 (처음부터 이어진 구간) */
  bookPlies: number;
}

function terminalLines(fen: string): EngineLine[] | null {
  const ch = new Chess(fen);
  if (ch.isCheckmate()) return [{ uci: '', cp: -MATE_CP, mate: 0, pv: [], depth: 0, wdl: [0, 0, 1000] }];
  if (ch.isDraw() || ch.isStalemate()) return [{ uci: '', cp: 0, mate: null, pv: [], depth: 0, wdl: [0, 1000, 0] }];
  return null;
}

/** 판정 중에 생기는 추가 분석은 엔진 풀에서 먼저 처리한다 (앞 수부터 결과가 나오도록) */
const URGENT = 10;

async function evalLines(engine: Engine, fen: string, depth: number, multipv = 3, priority = 0): Promise<EngineLine[]> {
  return terminalLines(fen) ?? engine.analyse(fen, { depth, multipv, priority });
}

/** 둘 수 있는 수가 1개뿐이거나, 체크를 피하는 수가 2개 이하인 국면: 선택의 여지가 없어 얕게 분석한다 */
function isForcedPosition(fen: string) {
  const ch = new Chess(fen);
  const n = ch.moves().length;
  return n === 1 || (ch.inCheck() && n <= 2);
}

function toMoveLike(m: Move): MoveLike {
  return { from: m.from, to: m.to, color: m.color, piece: m.piece, captured: m.captured, promotion: m.promotion, san: m.san, flags: m.flags };
}

function uciToSanLine(fen: string, ucis: string[], max = 8): string[] {
  const ch = new Chess(fen);
  const out: string[] = [];
  for (const u of ucis.slice(0, max)) {
    try {
      const m = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch { break; }
  }
  return out;
}

/** PV를 따라가며 물질·강제수·킹 압박 변화를 본다. pv는 상대 수부터 시작 */
function walkPv(fenAfter: string, pv: string[], mover: Color, baseline: number, maxPlies = 6) {
  const pos = Position.fromFen(fenAfter);
  let forcing = 0, checks = 0, kingPressureMax = 0;
  const balances: number[] = [];
  const balance = () => {
    const g = gridFromFen(pos.toFen());
    return material(g, mover) - material(g, opp(mover)) - baseline;
  };
  balances.push(balance());
  pv.slice(0, maxPlies).forEach((uci, i) => {
    const m = pos.fromUci(uci);
    if (m == null) return;
    const moverMove = i % 2 === 1; // pv[0]은 상대 수
    const isCapture = pos.board[(Number(uci[3]) - 1) * 16 + (uci.charCodeAt(2) - 97)] !== 0;
    pos.make(m);
    if (moverMove) {
      const check = pos.inCheck();
      if (check) checks++;
      if (check || isCapture) forcing++;
      const g = gridFromFen(pos.toFen());
      const map = attackMap(g, mover);
      const zone = kingZone(g, opp(mover));
      const set = new Set<string>();
      for (const [r, f] of zone) for (const a of map[r][f]) if (a.type !== 'k') set.add(`${a.r},${a.f}`);
      kingPressureMax = Math.max(kingPressureMax, set.size);
    }
    balances.push(balance());
  });
  // 수순이 교환 도중에 끝날 수 있으므로 마지막 두 시점으로 보수적으로 판단한다
  const tail = balances.slice(-2);
  return { gainEnd: Math.min(...tail), lossEnd: Math.max(...tail), forcing, checks, kingPressureMax };
}

function flipSide(fen: string): string {
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  return p.join(' ');
}

/** 기보 하나를 분석한다. engine은 브라우저 Worker든 Node 프로세스든 상관없다 */
export async function analyzeGame(pgn: string, engine: Engine, opts: AnalyzeOptions = {}): Promise<GameAnalysis> {
  const depth = opts.depth ?? 14;
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const headers = chess.getHeaders() as Record<string, string>;
  const startFen = history[0]?.before ?? chess.fen();
  const fens = [startFen, ...history.map((m) => m.after)];
  const searcher = new Searcher(40000);

  const lines: EngineLine[][] = [];
  const results: MoveAnalysis[] = [];
  const total = fens.length;

  // 모든 국면 분석을 한꺼번에 요청한다. 엔진 풀이면 여러 엔진이 나눠서 동시에 처리하고,
  // 단일 엔진이면 차례대로 처리된다. 강제된 국면은 얕게.
  const pending = fens.map((fen) => evalLines(engine, fen, isForcedPosition(fen) ? Math.max(8, depth - 4) : depth));
  pending.forEach((p) => p.catch(() => {})); // 중단 시 처리되지 않은 거부 방지
  lines[0] = await pending[0];
  opts.onProgress?.(1, total);

  for (let i = 0; i < history.length; i++) {
    if (opts.signal?.aborted) break;
    lines[i + 1] = await pending[i + 1];
    const m = history[i];
    const res = await analyzeMove({
      move: m, prev: i > 0 ? history[i - 1] : null, ply: i,
      before: lines[i], after: lines[i + 1], engine, depth, searcher,
    });
    // 오프닝 이론: 처음부터 끊기지 않고 이어진 구간만 (한 번 벗어나면 다시 들어와도 이론으로 보지 않는다)
    const info = opts.book?.lookup(m.after) ?? null;
    const stillBook = !!info && (i === 0 || !!results[i - 1]?.book);
    res.book = stillBook;
    res.opening = stillBook ? info : null;
    results.push(res);
    opts.onMove?.(res);
    opts.onProgress?.(i + 2, total);
  }

  // 위험 판정 수의 성공 여부: 상대가 다음 수에서 크게 틀렸는가
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.risk) continue;
    const next = results[i + 1];
    r.riskSucceeded = next ? next.cpLoss >= 100 : null;
  }

  const bookPlies = results.filter((r) => r.book).length;
  const lastBook = bookPlies ? results[bookPlies - 1].opening : null;
  // 이름은 정확히 일치한 가장 깊은 국면 우선
  const named = [...results.slice(0, bookPlies)].reverse().find((r) => r.opening?.exact)?.opening ?? lastBook;
  return { headers, startFen, moves: results, profiles: buildProfiles(results), depth, opening: named, bookPlies };
}

interface MoveInput {
  move: Move; prev: Move | null; ply: number;
  before: EngineLine[]; after: EngineLine[];
  engine: Engine; depth: number; searcher: Searcher;
}

async function analyzeMove(x: MoveInput): Promise<MoveAnalysis> {
  const { move, prev, ply, before, after, engine, depth, searcher } = x;
  const B = move.before, A = move.after;
  const chB = new Chess(B);
  const legal = chB.moves().length;
  const inCheckBefore = chB.inCheck();
  const uci = move.from + move.to + (move.promotion ?? '');
  const mover = move.color;

  const f = extractFeatures(B, A, toMoveLike(move), {
    inCheckBefore, ply, prevMove: prev ? toMoveLike(prev) : null, legalMoveCount: legal,
  });

  // ── 엔진 지표 (둔 쪽 관점) ──
  const best = cap(before[0].cp);
  const second = before[1] ? cap(before[1].cp) : legal > 1 ? best - 300 : best - 1000;
  const inList = before.find((l) => l.uci === uci);
  // 후보에 없으면 같은 국면·같은 깊이에서 그 수만 분석해 비교한다 (서로 다른 수평선 비교 방지)
  const playedLine = inList ?? (await engine.analyse(B, { depth, multipv: 1, searchmoves: [uci], priority: URGENT }))[0];
  const played = playedLine ? cap(playedLine.cp) : cap(-after[0].cp);
  const cpLoss = before[0].uci === uci ? 0 : Math.max(0, Math.round(best - played));
  const bestGap = Math.max(0, Math.round(best - second));
  const evalBefore = before[0].cp;
  const evalAfter = -after[0].cp;
  const isBest = before[0].uci === uci;
  // 품질은 전적으로 Stockfish 출력으로: 최선 수와 둔 수의 기대 점수(WDL) 차이
  const expBefore = expectedScore(before[0]);
  const expPlayed = playedLine ? expectedScore(playedLine) : 1 - expectedScore(after[0]);
  const winDrop = isBest ? 0 : Math.max(0, (expBefore - expPlayed) * 100);

  // ── PV 앞보기 ──
  const pv = walkPv(A, after[0].pv, mover, f.materialBalance);
  const realSacrifice = !f.isMate && pv.lossEnd <= -0.9 && (f.sacrifice >= 1.5 || f.hangOwnAfter >= 1.5);

  // ── 위협 (소형 탐색) ──
  const posB = Position.fromFen(B), posA = Position.fromFen(A);
  const threatBefore = threatOf(B, searcher).gain;
  const ourThreatBefore = Math.max(0, quickValue(B, 2, searcher) - Searcher.staticEval(posB));
  const threatAfterOpp = after[0].pv.length ? Math.max(0, quickValue(A, 2, searcher) - Searcher.staticEval(posA)) : 0;
  const ourThreatAfter = threatOf(A, searcher).gain;

  // 강제된 수: 선택의 여지가 없거나, 유일한 최선 수가 누구나 먼저 떠올릴 뻔한 수(되잡기·체크 피하기 등)인 경우.
  // 찾기 어려운 유일한 수(희생 등)는 플레이어의 선택으로 보고 평가에 넣는다.
  const myNatural = rankNaturalMoves(B, prev?.to ?? null);
  // 자연스러움 점수가 실제로 있는(잡기·체크·피하기 등) 수일 때만 "뻔한 수"로 본다
  const playedIsMostNatural = myNatural[0]?.uci === uci && myNatural[0].score > 0;
  const obvious = isBest && bestGap >= 200 && playedIsMostNatural;
  const forced = legal === 1 || (inCheckBefore && legal <= 2) || (f.isRecapture && cpLoss <= 30) || obvious;

  // ── 상대 응수: 자연스러운 수 vs 정답 ──
  // 함정수·도박수는 '의도한 선택'일 때만: 강제된 수, 체크 대응, 누구나 먼저 떠올릴 수는 제외
  const deliberate = !forced && !inCheckBefore && !playedIsMostNatural;
  const oppSharpness = after[1] ? Math.max(0, Math.min(500, cap(after[0].cp) - cap(after[1].cp))) : after[0].pv.length ? 500 : 0;
  let replySpread = 0;
  let risk: RiskKind | null = null, riskWhy: string | null = null;

  if (after[0].pv.length) {
    const ranked = rankNaturalMoves(A, move.to);
    const refutation = after[0].uci;
    const refRank = ranked.findIndex((r) => r.uci === refutation);
    const naturals = ranked.slice(0, 3).map((r) => r.uci);
    const outcomes = replyOutcomes(A, [...new Set([...naturals, refutation])], 2, searcher);
    const val = (u: string) => outcomes.find((o) => o.uci === u)?.value;
    const natVals = naturals.map(val).filter((v): v is number => v != null);
    if (natVals.length > 1) replySpread = Math.max(...natVals) - Math.min(...natVals);

    // 자연스러운 응수 중 상대에게 손해인 것을 찾고, Stockfish로 재확인
    const refVal = val(refutation) ?? 0;
    const bait = new Set([move.to, ...f.riskSquares]);
    // 미끼: 방금 움직인 기물이나 잡힐 위험에 놓인(놓아둔) 기물을 무는 솔깃한 응수.
    // 소형 탐색은 몇 수 뒤의 메이트나 장기 공격을 못 보므로, 후보가 있으면 Stockfish로 직접 확인한다.
    const cands = ranked.slice(0, 3)
      .filter((r) => r.uci !== refutation && r.tempting && bait.has(r.uci.slice(2, 4)))
      .map((r) => ({ r, gain: (val(r.uci) ?? 0) - refVal }))
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 2);

    if (cands.length && deliberate && (cpLoss <= 40 || (cpLoss >= 80 && winDrop >= 5))) {
      // 후보마다 Stockfish로 확인해서 상대에게 가장 치명적인 응수를 고른다
      let worst: { san: string; reason: string; value: number } | null = null;
      for (const c of cands) {
        const chA = new Chess(A);
        const nm = chA.move({ from: c.r.uci.slice(0, 2), to: c.r.uci.slice(2, 4), promotion: c.r.uci[4] });
        const verify = await evalLines(engine, chA.fen(), Math.max(8, depth - 2), 1, URGENT);
        const value = cap(verify[0].cp); // 둔 쪽이 다시 둘 차례 → 둔 쪽 관점
        if (!worst || value > worst.value) worst = { san: nm.san, reason: c.r.reason, value };
      }
      const w = worst!;
      const trapGain = w.value - cap(evalAfter);
      const refSan = uciToSanLine(A, [refutation], 1)[0] ?? refutation;
      if (cpLoss <= 40 && trapGain >= 150 && !realSacrifice && evalAfter < 600) {
        risk = 'trap';
        riskWhy = `상대가 자연스럽게 ${w.san}(${w.reason})를 두면 ${Math.round(trapGain)}cp 이득. 정답은 ${refSan}`;
      } else if (cpLoss >= 80 && winDrop >= 5 && w.value >= best + 30 && f.capturedValue < 3) {
        // (큰 기물을 잡는 수는 위험을 감수한 수가 아니라 욕심이므로 도박수에서 뺀다)
        risk = 'gamble';
        const hard = refRank >= 1 ? '찾기 어려운' : '비교적 자연스러운';
        riskWhy = `객관적으로 ${cpLoss}cp 손해지만, 상대가 솔깃한 ${w.san}(${w.reason})를 두면 최선 수보다 ${Math.round(w.value - best)}cp 더 좋아짐. 정답은 ${hard} ${refSan}`;
      }
    }
  }
  if (realSacrifice && cpLoss <= 40 && !forced && !inCheckBefore) {
    risk = 'soundSacrifice';
    riskWhy = `물질 ${Math.round(-pv.lossEnd * 10) / 10}점을 내주지만 엔진 평가는 유지됨`;
  }

  // ── 대기수: 상대가 '쉬고 싶은' 국면인가 (Stockfish, 후보일 때만) ──
  let zugzwang = 0;
  if (f.quietShuffle && cpLoss <= 20 && (f.isEndgame || legal <= 12) && after[0].pv.length) {
    const flipped = await evalLines(engine, flipSide(A), Math.max(8, depth - 2), 1, URGENT);
    zugzwang = Math.max(0, cap(-flipped[0].cp) - cap(after[0].cp));
  }


  const deep: DeepFeatures = {
    cpLoss, winDrop, expBefore, expPlayed, bestGap, evalBefore, evalAfter, isBest, bestMove: before[0].uci || null, forced,
    pvMaterialEnd: pv.gainEnd, pvForcingByMover: pv.forcing, pvChecksByMover: pv.checks,
    pvKingPressureMax: pv.kingPressureMax, realSacrifice,
    threatBefore, threatAfterOpp, ourThreatBefore, ourThreatAfter,
    oppSharpness, ownSharpnessBefore: Math.min(500, bestGap), replySpread, zugzwang,
    risk, riskWhy,
  };
  const style = scoreMove(f, deep);

  // ── 대안 비교 (선택 성향): 비슷한 가치의 다른 후보와 정적 스타일 비교 ──
  let choiceDelta: MoveAnalysis['choiceDelta'] = null;
  const alts = before.filter((l) => l.uci && l.uci !== uci && cap(l.cp) >= best - 30);
  if (alts.length && !forced) {
    const playedStatic = scoreMove(f, null).scores;
    const altScores = alts.map((l) => {
      const ch = new Chess(B);
      const am = ch.move({ from: l.uci.slice(0, 2), to: l.uci.slice(2, 4), promotion: l.uci[4] });
      const af = extractFeatures(B, am.after, toMoveLike(am), { inCheckBefore, ply, prevMove: prev ? toMoveLike(prev) : null, legalMoveCount: legal });
      return scoreMove(af, null).scores;
    });
    choiceDelta = {};
    for (const k of STYLE_KEYS) {
      const avg = altScores.reduce((s, x) => s + x[k], 0) / altScores.length;
      choiceDelta[k] = Math.round(playedStatic[k] - avg);
    }
  }

  // 그래프용 백 관점 평가
  const afterWhite = mover === 'w' ? evalAfter : -evalAfter;
  const mateLine = after[0].mate;
  // after[0].mate는 수 둔 후 둘 차례(상대) 관점. 0이면 상대가 체크메이트당함
  const mateAfter = mateLine == null ? null : mover === 'w' ? -mateLine : mateLine;

  return {
    ...style,
    ply, moveNumber: Math.floor(ply / 2) + 1, color: mover, san: move.san, uci,
    from: move.from, to: move.to, fenBefore: B, fenAfter: A,
    evalWhiteAfter: cap(afterWhite), mateAfter,
    expWhiteAfter: mover === 'w' ? 1 - expectedScore(after[0]) : expectedScore(after[0]),
    cpLoss,
    bestSan: before[0].uci ? uciToSanLine(B, [before[0].uci], 1)[0] ?? null : null,
    bestPvSan: uciToSanLine(B, before[0].pv, 8),
    playedPvSan: uciToSanLine(A, after[0].pv, 7),
    phase: ply < 20 && f.phase > 0.75 ? 'opening' : f.isEndgame ? 'endgame' : 'middlegame',
    situation: evalBefore >= 150 ? 'ahead' : evalBefore <= -150 ? 'behind' : 'equal',
    choiceDelta, riskSucceeded: null, book: false, opening: null, features: f, deep,
  };
}
