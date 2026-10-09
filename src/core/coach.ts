// 코치와 두기: 수 하나씩 바로 평가하고, 봇이 레벨·스타일에 맞춰 수를 고른다.
// 엔진 종류(브라우저 풀 / Node 프로세스)와 무관하게 동작한다.
import { Chess, type Move } from 'chess.js';
import type { Engine, EngineLine } from '../engine/uci';
import { analyzeMove, evalLines, isForcedPosition, markBook, flipSide, uciToSanLine, URGENT, type MoveAnalysis } from './analyzer';
import { extractFeatures } from './features';
import { scoreMove, STYLE_KEYS, type StyleKey } from './styles';
import { Searcher } from '../search/search';
import { MASTERS } from './masters';
import type { OpeningBook } from './openings';

// ───────────── 봇 ─────────────

export interface BotLevel {
  name: string;
  depth: number;
  multipv: number;
  /** 후보 선택의 무작위성 (cp). 0이면 항상 가장 좋은 수 */
  temperature: number;
  /** 스타일 봇이 스타일을 위해 감수하는 손해 한도 (cp) */
  styleTolerance: number;
}

// 강도 이름은 상대적인 단계일 뿐, 레이팅과 맞춘 값이 아니다
export const BOT_LEVELS: BotLevel[] = [
  { name: '입문', depth: 2, multipv: 5, temperature: 220, styleTolerance: 120 },
  { name: '초급', depth: 4, multipv: 5, temperature: 110, styleTolerance: 90 },
  { name: '중급', depth: 7, multipv: 4, temperature: 50, styleTolerance: 60 },
  { name: '고급', depth: 11, multipv: 4, temperature: 18, styleTolerance: 40 },
  { name: '최강', depth: 16, multipv: 3, temperature: 0, styleTolerance: 15 },
];

export interface BotStyle { id: string; label: string; desc: string; weights: Partial<Record<StyleKey, number>> }

const PRESETS: BotStyle[] = [
  { id: 'balanced', label: '균형형', desc: '스타일 없이 엔진이 좋다고 보는 수를 둡니다.', weights: {} },
  { id: 'attack', label: '공격형', desc: '킹 공격·전술·주도권을 노리는 수를 좋아합니다.', weights: { aggressive: 0.4, tactical: 0.3, initiative: 0.3 } },
  { id: 'squeeze', label: '조이기형', desc: '상대 계획을 막고 숨통을 조이는 수를 좋아합니다.', weights: { prophylactic: 0.35, restriction: 0.35, positional: 0.3 } },
  { id: 'solid', label: '안정형', desc: '교환과 안전한 수로 위험을 줄입니다.', weights: { solid: 0.4, simplifying: 0.35, defensive: 0.25 } },
  { id: 'chaos', label: '혼돈형', desc: '국면을 날카롭게 만들어 실수를 유도합니다.', weights: { complicating: 0.5, counterattack: 0.25, tension: 0.25 } },
];

/**
 * 유명 선수 봇: 그 선수가 다른 유명 선수들 평균보다 두드러지는 스타일을 가중치로 쓴다 (실력이 아니라 성향만 흉내).
 * (BASELINE은 고전 공격 기보 기준이라, 그 대비 편차로 잡으면 현대 선수가 모두 포지셔널 쪽으로 쏠린다)
 */
const MASTER_MEAN = Object.fromEntries(STYLE_KEYS.map((k) => [k, MASTERS.reduce((s, m) => s + m.avg[k], 0) / (MASTERS.length || 1)])) as Record<StyleKey, number>;
const MASTER_STYLES: BotStyle[] = MASTERS.map((m) => {
  const dev = STYLE_KEYS.map((k) => [k, Math.max(0, m.avg[k] - MASTER_MEAN[k])] as const).filter(([, v]) => v > 0);
  const sum = dev.reduce((s, [, v]) => s + v, 0) || 1;
  return { id: `master:${m.id}`, label: `${m.ko} 스타일`, desc: m.desc, weights: Object.fromEntries(dev.map(([k, v]) => [k, v / sum])) };
});

export const BOT_STYLES: BotStyle[] = [...PRESETS, ...MASTER_STYLES];

const cap = (x: number) => Math.max(-1000, Math.min(1000, x));

/** 후보 수가 스타일에 얼마나 맞는지 0~1 (정적 특징만으로 채점) */
function styleFit(fen: string, uci: string, weights: Partial<Record<StyleKey, number>>): number {
  const keys = Object.keys(weights) as StyleKey[];
  if (!keys.length) return 0;
  const ch = new Chess(fen);
  const inCheckBefore = ch.inCheck();
  const legal = ch.moves().length;
  const m = ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const f = extractFeatures(fen, m.after, { from: m.from, to: m.to, color: m.color, piece: m.piece, captured: m.captured, promotion: m.promotion, san: m.san, flags: m.flags },
    { inCheckBefore, ply: 0, prevMove: null, legalMoveCount: legal });
  const scores = scoreMove(f, null).scores;
  return keys.reduce((s, k) => s + (weights[k] ?? 0) * scores[k] / 100, 0);
}

/** 레벨·스타일에 맞춰 봇의 수를 고른다. rand는 테스트에서 고정할 수 있게 받는다 */
export async function chooseBotMove(engine: Engine, fen: string, level: number, style: BotStyle, rand = Math.random): Promise<string | null> {
  const lv = BOT_LEVELS[Math.max(0, Math.min(BOT_LEVELS.length - 1, level))];
  const lines = (await engine.analyse(fen, { depth: lv.depth, multipv: lv.multipv, priority: 5 })).filter((l) => l?.uci);
  if (!lines.length) return null;
  const best = cap(lines[0].cp);
  const scored = lines.map((l) => {
    const loss = best - cap(l.cp);
    const fit = styleFit(fen, l.uci, style.weights);
    return { uci: l.uci, utility: -loss + lv.styleTolerance * fit, loss };
  });
  // 메이트를 놓치지 않는다 (최강·고급은 엔진 최선이 메이트면 그대로)
  if (lines[0].mate != null && lines[0].mate > 0 && level >= 3) return lines[0].uci;
  if (lv.temperature <= 0) return scored.sort((a, b) => b.utility - a.utility)[0].uci;
  const top = Math.max(...scored.map((s) => s.utility));
  const weights = scored.map((s) => Math.exp((s.utility - top) / lv.temperature));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) { r -= weights[i]; if (r <= 0) return scored[i].uci; }
  return scored[0].uci;
}

// ───────────── 수 평가 ─────────────

export interface EvalRequest {
  fenBefore: string;
  uci: string;
  ply: number;
  /** 직전 수 (되잡기·자연스러운 응수 판정용) */
  prev: { fenBefore: string; uci: string; book: boolean } | null;
}

function moveFrom(fen: string, uci: string): Move {
  return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

export class CoachSession {
  private cache = new Map<string, Promise<EngineLine[]>>();
  private searcher = new Searcher(40000);

  constructor(private engine: Engine, readonly depth = 12, private book: OpeningBook | null = null) {}

  /** 국면 분석 (같은 국면은 한 번만). 내 차례가 되면 미리 불러 두면 수를 둔 뒤 평가가 빠르다 */
  lines(fen: string, priority = 0): Promise<EngineLine[]> {
    const key = fen.split(' ').slice(0, 4).join(' ');
    let p = this.cache.get(key);
    if (!p) {
      p = evalLines(this.engine, fen, isForcedPosition(fen) ? Math.max(8, this.depth - 4) : this.depth, 3, priority);
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  async evaluate(req: EvalRequest, priority = URGENT): Promise<MoveAnalysis> {
    const move = moveFrom(req.fenBefore, req.uci);
    const prev = req.prev ? moveFrom(req.prev.fenBefore, req.prev.uci) : null;
    const [before, after] = await Promise.all([this.lines(req.fenBefore, priority), this.lines(move.after, priority)]);
    const res = await analyzeMove({ move, prev, ply: req.ply, before, after, engine: this.engine, depth: this.depth, searcher: this.searcher });
    Object.assign(res, { clock: null, spent: null, lowTime: null });
    markBook(res, req.prev ? ({ book: req.prev.book } as MoveAnalysis) : null, this.book);
    return res;
  }

  /** 지금 둘 차례가 아닌 쪽이 노리는 것: 차례만 넘겨 상대가 한 수 더 둔다면 무엇을 얼마나 얻는가 */
  async threat(fen: string): Promise<{ uci: string; san: string; gainCp: number } | null> {
    if (new Chess(fen).inCheck()) return null;
    let flipped: string;
    try { flipped = flipSide(fen); new Chess(flipped); } catch { return null; }
    const [cur, opp] = await Promise.all([this.lines(fen, URGENT), evalLines(this.engine, flipped, Math.max(8, this.depth - 2), 1, URGENT)]);
    if (!opp[0]?.uci) return null;
    const gainCp = Math.round(cap(opp[0].cp) - cap(-cur[0].cp));
    return { uci: opp[0].uci, san: uciToSanLine(flipped, [opp[0].uci], 1)[0] ?? opp[0].uci, gainCp };
  }
}
