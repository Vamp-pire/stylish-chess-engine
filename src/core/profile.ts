// 플레이어 평가: 강제된 수와 오프닝 이론 수를 뺀 수들로 스타일 성향을 집계한다.
import { tr } from '../i18n';
import type { MoveAnalysis } from './analyzer';
import { STYLE_KEYS, RISK_KINDS, type StyleKey, type RiskKind, type QualityKey } from './styles';

type Phase = MoveAnalysis['phase'];
type Situation = MoveAnalysis['situation'];

export interface SliceProfile { count: number; avg: Record<StyleKey, number>; top: StyleKey[] }

/** accuracy는 승부가 걸린 국면(기대 점수 10~90%)의 수만으로 계산하고, 그 수의 개수가 contested (예전 기록에는 없음) */
export interface TimeSlice extends SliceProfile { accuracy: number; contested?: number }
export interface TimeProfile {
  moves: number;
  /** 수당 평균 소요 시간 (초) */
  avgSpent: number;
  /** 시간에 쫓길 때 (남은 시간 30초 또는 처음의 10% 미만) */
  lowTime: TimeSlice;
  normal: TimeSlice;
  /** 오래 생각한 수 (평균의 2.5배 이상, 20초 이상) */
  long: TimeSlice;
}

export interface PlayerProfile {
  moves: number;
  counted: number;
  avg: Record<StyleKey, number>;
  primaryCounts: Record<StyleKey | 'neutral', number>;
  top: StyleKey[];
  choice: Record<StyleKey, number> | null;
  choiceTop: StyleKey[];
  risk: Record<RiskKind, { count: number; success: number }>;
  quality: Record<QualityKey, number>;
  acpl: number;
  accuracy: number;
  byPhase: Record<Phase, SliceProfile>;
  bySituation: Record<Situation, SliceProfile>;
  archetype: { name: string; desc: string };
  /** 시간 사용 (기보에 시계 기록이 있을 때만) */
  time?: TimeProfile | null;
  /** 기보에 적힌 이 플레이어의 레이팅 (없으면 null). 유형 판정을 같은 레이팅끼리 비교하는 데 쓴다 */
  rating?: number | null;
  /** 이 프로필이 주로 나온 시간대 (bullet·blitz·rapid…). 유형 보정을 시간대별로 고른다 */
  timeClass?: string | null;
  /** 사람 수 예측(Maia3) 기준 독창성: 같은 레이팅 사람들이 잘 안 두는 수를 얼마나 두는가 (예전 저장본·규칙 기반엔 없음) */
  human?: HumanStats | null;
  /** 오프닝: 이론을 따라간 수, 이론 이탈 수 (한 게임 기준) */
  opening: { bookMoves: number; leftBookFirst: boolean | null; deviation: { san: string; moveNumber: number; quality: QualityKey | null } | null };
}

export interface HumanStats {
  /** Maia 확률이 있는 평가 대상 수 */
  n: number;
  /** 같은 레이팅 사람들이 둘 확률이 RARE_P 미만인 수의 비율 */
  rare: number;
  /** 평균 놀라움: −ln(확률)의 평균 */
  surprise: number;
}
/** '드문 수'의 기준 확률 */
export const RARE_P = 0.1;

function humanStats(counted: MoveAnalysis[]): HumanStats | null {
  const ps = counted.map((m) => m.humanP).filter((p): p is number => p != null);
  if (!ps.length) return null;
  return {
    n: ps.length,
    rare: ps.filter((p) => p < RARE_P).length / ps.length,
    surprise: ps.reduce((s, p) => s - Math.log(Math.max(p, 1e-4)), 0) / ps.length,
  };
}

function mergeHuman(list: (HumanStats | null | undefined)[]): HumanStats | null {
  const live = list.filter((h): h is HumanStats => !!h && h.n > 0);
  const n = live.reduce((s, h) => s + h.n, 0);
  if (!n) return null;
  return {
    n,
    rare: live.reduce((s, h) => s + h.rare * h.n, 0) / n,
    surprise: live.reduce((s, h) => s + h.surprise * h.n, 0) / n,
  };
}

/** 가장 많은 수가 나온 시간대 */
export function mainTimeClass(list: { timeClass?: string | null; counted: number }[]): string | null {
  const by = new Map<string, number>();
  for (const p of list) if (p.timeClass) by.set(p.timeClass, (by.get(p.timeClass) ?? 0) + p.counted);
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** 레이팅은 평가 대상 수로 가중 평균 (레이팅이 있는 판만) */
function mergeRating(list: PlayerProfile[]): number | null {
  const live = list.filter((p) => p.rating && p.counted);
  const n = live.reduce((s, p) => s + p.counted, 0);
  return n ? Math.round(live.reduce((s, p) => s + p.rating! * p.counted, 0) / n) : null;
}

const emptyRisk = () => Object.fromEntries(RISK_KINDS.map((k) => [k, { count: 0, success: 0 }])) as PlayerProfile['risk'];
/** 위험 판정 수 전체 개수 */
export const riskTotal = (p: PlayerProfile) => RISK_KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0);

const zero = () => Object.fromEntries(STYLE_KEYS.map((k) => [k, 0])) as Record<StyleKey, number>;

function average(list: MoveAnalysis[]): Record<StyleKey, number> {
  const avg = zero();
  if (!list.length) return avg;
  for (const m of list) for (const k of STYLE_KEYS) avg[k] += m.scores[k];
  for (const k of STYLE_KEYS) avg[k] = Math.round(avg[k] / list.length);
  return avg;
}

const topOf = (rec: Record<StyleKey, number>, n = 3) =>
  [...STYLE_KEYS].sort((a, b) => rec[b] - rec[a]).slice(0, n).filter((k) => rec[k] > 0);

function slice(list: MoveAnalysis[]): SliceProfile {
  const avg = average(list);
  return { count: list.length, avg, top: topOf(avg) };
}

/**
 * 판 정확도 (Lichess 방식): 수 정확도의 '변동성 가중 평균'과 '조화 평균'의 평균.
 * 단순 평균은 쉬운 수가 대부분이라 누구나 90%대가 나와 실력 차이가 안 보였다(보정 플레이어 479명: 800점 91.6%, 2400점 94.7%).
 * 조화 평균은 큰 실수를 무겁게 반영하고, 변동성 가중은 승부가 요동치는 구간의 수를 더 중요하게 본다.
 * ordered가 false면(시간대별처럼 연속이 아닌 묶음) 가중 없이 단순 평균을 쓴다.
 */
export function aggregateAccuracy(list: MoveAnalysis[], ordered = true): number {
  if (!list.length) return 0;
  const acc = list.map(moveAccuracy);
  let weighted: number;
  if (ordered && list.length >= 4) {
    const win = list.map((m) => (m.deep.expBefore ?? 0.5) * 100);
    const size = Math.max(2, Math.min(8, Math.floor(list.length / 10)));
    let sw = 0, sa = 0;
    for (let i = 0; i < list.length; i++) {
      const from = Math.max(0, Math.min(i - size + 1, list.length - size));
      const w = win.slice(from, from + size);
      const mean = w.reduce((x, y) => x + y, 0) / w.length;
      const sd = Math.sqrt(w.reduce((x, y) => x + (y - mean) ** 2, 0) / w.length);
      const weight = Math.max(0.5, Math.min(12, sd));
      sw += weight; sa += acc[i] * weight;
    }
    weighted = sa / sw;
  } else weighted = acc.reduce((x, y) => x + y, 0) / acc.length;
  // 0%인 수 하나가 조화 평균을 0으로 만들지 않도록 아래를 10으로 막는다
  const harmonic = acc.length / acc.reduce((x, y) => x + 1 / Math.max(10, y), 0);
  return Math.round(((weighted + harmonic) / 2) * 10) / 10;
}

/**
 * 수 정확도: Stockfish WDL 기대 점수 하락폭(%p)을 Lichess 정확도 곡선에 넣는다.
 * Stockfish WDL은 Lichess 승률 공식보다 약 2.5배 가파르므로 같은 척도로 맞춰 넣는다.
 */
function moveAccuracy(m: MoveAnalysis) {
  const diff = m.deep.winDrop / 2.5;
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * diff) - 3.1669));
}

/**
 * 스타일별 기준값: 여러 기보(강제된 수 제외)의 평균 점수. 스타일마다 평소 나오는 점수 수준이 달라서
 * 유형을 정할 때는 이 기준보다 얼마나 더 나왔는지(편차)로 비교한다.
 * 현재 값은 고전 기보 4개(오페라·불멸·상록수·카르포프-운치커)에서 강제된 수와 오프닝 이론 수를 뺀 143수로 구했다.
 */
export const BASELINE: Record<StyleKey, number> = {
  aggressive: 23, tactical: 15, initiative: 27, counterattack: 3, positional: 9, prophylactic: 10, restriction: 2,
  active: 25, space: 5, tension: 8, solid: 15, defensive: 20, simplifying: 3, complicating: 20, quiet: 4,
  waiting: 0, practical: 2, kingActivity: 0, passedPawn: 0,
};

const GROUPS: Record<string, StyleKey[]> = {
  attack: ['aggressive', 'tactical', 'initiative', 'counterattack'],
  position: ['positional', 'prophylactic', 'restriction', 'active', 'space', 'tension'],
  safety: ['solid', 'defensive', 'simplifying'],
  practical: ['complicating', 'quiet', 'waiting', 'practical'],
};

function archetype(avg: Record<StyleKey, number>, riskRate: number): PlayerProfile['archetype'] {
  // 기준 대비 편차로, 그룹마다 가장 두드러진 두 스타일의 평균을 본다
  const dev = (k: StyleKey) => avg[k] - BASELINE[k];
  const g = Object.fromEntries(Object.entries(GROUPS).map(([k, ks]) => {
    const top = ks.map(dev).sort((a, b) => b - a).slice(0, 2);
    return [k, (top[0] + top[1]) / 2];
  })) as Record<string, number>;
  const order = Object.entries(g).sort((a, b) => b[1] - a[1]);
  const [first, second] = order;
  const spread = first[1] - order[order.length - 1][1];
  if (spread < 4) return { get name() { return tr('만능형', 'All-rounder'); }, get desc() { return tr('어느 한쪽에 치우치지 않고 국면에 맞춰 스타일을 바꾼다 (칼슨 스타일)', 'Adapts the style to the position without leaning to one side (Carlsen style)'); } };
  switch (first[0]) {
    case 'attack':
      return riskRate >= 0.04 || dev('complicating') >= 5
        ? { get name() { return tr('로맨틱 공격수', 'Romantic attacker'); }, get desc() { return tr('희생과 위험을 감수하며 상대 킹을 몰아친다 (탈 스타일)', 'Hunts the enemy king, accepting sacrifices and risk (Tal style)'); } }
        : { get name() { return tr('역동적 공격형', 'Dynamic attacker'); }, get desc() { return tr('활동성과 주도권으로 정확하게 공격을 밀어붙인다 (카스파로프 스타일)', 'Drives the attack precisely with activity and initiative (Kasparov style)'); } };
    case 'position':
      return dev('prophylactic') + dev('restriction') + dev('tension') >= dev('active') + dev('space')
        ? { get name() { return tr('조이기의 달인', 'Master of restriction'); }, get desc() { return tr('상대의 계획을 미리 막고 숨통을 조인다 (페트로시안 스타일)', 'Stops the opponent\'s plans in advance and squeezes (Petrosian style)'); } }
        : { get name() { return tr('포지셔널 전략가', 'Positional strategist'); }, get desc() { return tr('공간과 기물 활동으로 천천히 우위를 쌓는다', 'Slowly builds an edge with space and piece activity'); } };
    case 'safety': {
      // 안전 계열 안에서 무엇이 두드러졌는지로 나눈다: 견고함 / 실제 수비 / 단순화
      const lead = (['solid', 'defensive', 'simplifying'] as StyleKey[]).sort((a, b) => dev(b) - dev(a))[0];
      if (lead === 'defensive') return { get name() { return tr('철벽 수비형', 'Iron defender'); }, get desc() { return tr('위협을 먼저 없애고 끈질기게 버틴다', 'Removes threats first and holds on stubbornly'); } };
      if (lead === 'simplifying') return { get name() { return tr('안정 추구형', 'Safety seeker'); }, get desc() { return tr('교환과 단순화로 위험 없는 국면을 선호한다', 'Prefers risk-free positions through trades and simplification'); } };
      return second[0] === 'position' || second[0] === 'practical'
        ? { get name() { return tr('견고한 전략가', 'Solid strategist'); }, get desc() { return tr('위험을 만들지 않고 긴장을 유지하며 천천히 우위를 쌓는다 (카르포프 스타일)', 'Avoids risk, keeps the tension and slowly builds an edge (Karpov style)'); } }
        : { get name() { return tr('안정 추구형', 'Safety seeker'); }, get desc() { return tr('위험 요소를 최소화하는 견고한 수를 선호한다', 'Prefers solid moves that minimize risk'); } };
    }
    default:
      return dev('complicating') >= dev('practical')
        ? { get name() { return tr('혼돈의 마술사', 'Chaos magician'); }, get desc() { return tr('국면을 일부러 복잡하게 만들어 상대의 실수를 유도한다', 'Complicates the position on purpose to provoke mistakes'); } }
        : { get name() { return tr('실전형 승부사', 'Practical competitor'); }, get desc() { return tr('최선보다 이기기 쉬운 길을 고른다', 'Chooses the easier path to win over the objectively best one'); } };
  }
}

function timeSlice(list: MoveAnalysis[]): TimeSlice {
  const counted = list.filter((m) => !m.forced);
  const avg = average(counted);
  // 시간에 쫓긴 수는 대부분 이미 승부가 기운 국면(뭘 둬도 기대 점수가 거의 안 변함)이라 그대로 평균하면 정확도가 부풀려진다.
  // 실제 게임 25판 확인: 시간 부족 수의 92%가 기운 국면(평소 59%). 승부가 걸린 국면만 보면 시간 부족 때 정확도가 오히려 낮다
  const live = counted.filter((m) => m.deep.expBefore == null || (m.deep.expBefore >= 0.1 && m.deep.expBefore <= 0.9));
  const accuracy = aggregateAccuracy(live, false);
  return { count: list.length, avg, top: topOf(avg), accuracy, contested: live.length };
}

function buildTime(all: MoveAnalysis[]): TimeProfile | null {
  // 이론 수는 미리 준비한 수라 빠르게 두므로 뺀다
  const timed = all.filter((m) => !m.book && m.spent != null);
  if (!timed.length) return null;
  const avgSpent = Math.round(timed.reduce((s, m) => s + m.spent!, 0) / timed.length * 10) / 10;
  const longCut = Math.max(20, avgSpent * 2.5);
  return {
    moves: timed.length, avgSpent,
    lowTime: timeSlice(timed.filter((m) => m.lowTime)),
    normal: timeSlice(timed.filter((m) => !m.lowTime)),
    long: timeSlice(timed.filter((m) => m.spent! >= longCut)),
  };
}

export function buildProfile(all: MoveAnalysis[]): PlayerProfile {
  // 선택이 아닌 수(강제된 수)와 누구나 두는 오프닝 이론 수는 성향 집계에서 뺀다
  const counted = all.filter((m) => !m.forced && !m.book);
  const avg = average(counted);
  const primaryCounts = Object.fromEntries([...STYLE_KEYS, 'neutral'].map((k) => [k, 0])) as PlayerProfile['primaryCounts'];
  for (const m of counted) primaryCounts[m.primary]++;

  const withChoice = counted.filter((m) => m.choiceDelta);
  let choice: Record<StyleKey, number> | null = null;
  if (withChoice.length) {
    choice = zero();
    for (const m of withChoice) for (const k of STYLE_KEYS) choice[k] += m.choiceDelta![k] ?? 0;
    for (const k of STYLE_KEYS) choice[k] = Math.round(choice[k] / withChoice.length);
  }

  const risk = emptyRisk();
  for (const m of all) if (m.risk) { risk[m.risk].count++; if (m.riskSucceeded) risk[m.risk].success++; }

  const quality: Record<QualityKey, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const m of all) if (m.quality) quality[m.quality]++;

  const acpl = all.length ? Math.round(all.reduce((s, m) => s + Math.min(m.cpLoss, 1000), 0) / all.length) : 0;
  const accuracy = aggregateAccuracy(all);

  const by = <T extends string>(keys: T[], pick: (m: MoveAnalysis) => T) =>
    Object.fromEntries(keys.map((k) => [k, slice(counted.filter((m) => pick(m) === k))])) as Record<T, SliceProfile>;

  const riskRate = counted.length ? RISK_KINDS.reduce((s, k) => s + risk[k].count, 0) / counted.length : 0;

  return {
    moves: all.length, counted: counted.length, avg, primaryCounts, top: topOf(avg, 5),
    choice, choiceTop: choice ? topOf(choice, 3).filter((k) => choice![k] >= 5) : [],
    risk, quality, acpl, accuracy,
    byPhase: by(['opening', 'middlegame', 'endgame'], (m) => m.phase),
    bySituation: by(['ahead', 'equal', 'behind'], (m) => m.situation),
    archetype: archetype(avg, riskRate),
    time: buildTime(all),
    human: humanStats(counted),
    opening: { bookMoves: all.filter((m) => m.book).length, leftBookFirst: null, deviation: null },
  };
}

export function buildProfiles(moves: MoveAnalysis[]) {
  const w = buildProfile(moves.filter((m) => m.color === 'w'));
  const b = buildProfile(moves.filter((m) => m.color === 'b'));
  // 처음으로 이론을 벗어난 수 (이론 수가 하나라도 있었을 때만)
  const dev = moves.some((m) => m.book) ? moves.find((m) => !m.book) : undefined;
  if (dev) {
    const info = { san: dev.san, moveNumber: dev.moveNumber, quality: dev.quality };
    (dev.color === 'w' ? w : b).opening.deviation = info;
    w.opening.leftBookFirst = dev.color === 'w';
    b.opening.leftBookFirst = dev.color === 'b';
  }
  return { w, b };
}

/**
 * 여러 판의 프로필을 하나로 합친다 (저장된 플레이어 성향용).
 * 스타일 평균은 평가 대상 수(counted)로, 정확도·손실은 전체 수로 가중 평균한다.
 */
export function mergeProfiles(list: PlayerProfile[]): PlayerProfile | null {
  if (!list.length) return null;
  const counted = list.reduce((s, p) => s + p.counted, 0);
  const moves = list.reduce((s, p) => s + p.moves, 0);
  const wavg = (pick: (p: PlayerProfile) => Record<StyleKey, number> | null, weight: (p: PlayerProfile) => number) => {
    const out = zero();
    let total = 0;
    for (const p of list) {
      const rec = pick(p), w = weight(p);
      if (!rec || !w) continue;
      total += w;
      for (const k of STYLE_KEYS) out[k] += rec[k] * w;
    }
    if (!total) return null;
    for (const k of STYLE_KEYS) out[k] = Math.round(out[k] / total);
    return out;
  };
  const avg = wavg((p) => p.avg, (p) => p.counted) ?? zero();
  const choice = wavg((p) => p.choice, (p) => p.counted);

  const primaryCounts = Object.fromEntries([...STYLE_KEYS, 'neutral'].map((k) => [k, 0])) as PlayerProfile['primaryCounts'];
  const risk = emptyRisk();
  const quality: Record<QualityKey, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const p of list) {
    for (const k of Object.keys(primaryCounts) as (StyleKey | 'neutral')[]) primaryCounts[k] += p.primaryCounts[k] ?? 0;
    // 예전에 저장된 프로필에는 없는 종류가 있을 수 있다
    for (const k of RISK_KINDS) { risk[k].count += p.risk[k]?.count ?? 0; risk[k].success += p.risk[k]?.success ?? 0; }
    for (const k of Object.keys(quality) as QualityKey[]) quality[k] += p.quality[k];
  }
  const mergeSlices = <T extends string>(keys: T[], pick: (p: PlayerProfile) => Record<T, SliceProfile>) =>
    Object.fromEntries(keys.map((k) => {
      const parts = list.map((p) => pick(p)[k]).filter((s) => s.count);
      const count = parts.reduce((s, x) => s + x.count, 0);
      const a = zero();
      for (const s of parts) for (const sk of STYLE_KEYS) a[sk] += (s.avg[sk] * s.count) / (count || 1);
      for (const sk of STYLE_KEYS) a[sk] = Math.round(a[sk]);
      return [k, { count, avg: a, top: topOf(a) }];
    })) as Record<T, SliceProfile>;

  const riskRate = counted ? RISK_KINDS.reduce((s, k) => s + risk[k].count, 0) / counted : 0;
  return {
    time: mergeTime(list.map((p) => p.time).filter((t): t is TimeProfile => !!t)),
    moves, counted, avg, primaryCounts, top: topOf(avg, 5),
    choice, choiceTop: choice ? topOf(choice, 3).filter((k) => choice[k] >= 5) : [],
    risk, quality,
    acpl: moves ? Math.round(list.reduce((s, p) => s + p.acpl * p.moves, 0) / moves) : 0,
    accuracy: moves ? Math.round((list.reduce((s, p) => s + p.accuracy * p.moves, 0) / moves) * 10) / 10 : 0,
    byPhase: mergeSlices(['opening', 'middlegame', 'endgame'], (p) => p.byPhase),
    bySituation: mergeSlices(['ahead', 'equal', 'behind'], (p) => p.bySituation),
    archetype: archetype(avg, riskRate),
    human: mergeHuman(list.map((p) => p.human)),
    rating: mergeRating(list),
    timeClass: mainTimeClass(list),
    opening: { bookMoves: list.reduce((s, p) => s + p.opening.bookMoves, 0), leftBookFirst: null, deviation: null },
  };
}

function mergeSlice(parts: TimeSlice[]): TimeSlice {
  const live = parts.filter((s) => s.count);
  const count = live.reduce((s, x) => s + x.count, 0);
  const avg = zero();
  for (const s of live) for (const k of STYLE_KEYS) avg[k] += (s.avg[k] * s.count) / count;
  for (const k of STYLE_KEYS) avg[k] = Math.round(avg[k]);
  const w = (x: TimeSlice) => x.contested ?? x.count;
  const wsum = live.reduce((s, x) => s + w(x), 0);
  const accuracy = wsum ? Math.round(live.reduce((s, x) => s + x.accuracy * w(x), 0) / wsum * 10) / 10 : 0;
  const contested = live.every((x) => x.contested != null) ? live.reduce((s, x) => s + x.contested!, 0) : undefined;
  return { count, avg, top: topOf(avg), accuracy, contested };
}

function mergeTime(list: TimeProfile[]): TimeProfile | null {
  const moves = list.reduce((s, t) => s + t.moves, 0);
  if (!moves) return null;
  return {
    moves,
    avgSpent: Math.round(list.reduce((s, t) => s + t.avgSpent * t.moves, 0) / moves * 10) / 10,
    lowTime: mergeSlice(list.map((t) => t.lowTime)),
    normal: mergeSlice(list.map((t) => t.normal)),
    long: mergeSlice(list.map((t) => t.long)),
  };
}
