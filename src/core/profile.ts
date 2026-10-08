// 플레이어 평가: 강제된 수를 뺀 수들로 스타일 성향을 집계한다.
import type { MoveAnalysis } from './analyzer';
import { STYLE_KEYS, type StyleKey, type RiskKind, type QualityKey } from './styles';

type Phase = MoveAnalysis['phase'];
type Situation = MoveAnalysis['situation'];

export interface SliceProfile { count: number; avg: Record<StyleKey, number>; top: StyleKey[] }

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
}

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
 * 현재 값은 고전 기보 4개(오페라·불멸·상록수·카르포프-운치커, 195수)로 구했다.
 */
export const BASELINE: Record<StyleKey, number> = {
  aggressive: 18, tactical: 13, initiative: 18, counterattack: 1, positional: 8, prophylactic: 11, restriction: 2,
  active: 29, space: 10, tension: 8, solid: 18, defensive: 19, simplifying: 2, complicating: 18, quiet: 4,
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
  if (spread < 4) return { name: '만능형', desc: '어느 한쪽에 치우치지 않고 국면에 맞춰 스타일을 바꾼다 (칼슨 스타일)' };
  switch (first[0]) {
    case 'attack':
      return riskRate >= 0.04 || dev('complicating') >= 5
        ? { name: '로맨틱 공격수', desc: '희생과 위험을 감수하며 상대 킹을 몰아친다 (탈 스타일)' }
        : { name: '역동적 공격형', desc: '활동성과 주도권으로 정확하게 공격을 밀어붙인다 (카스파로프 스타일)' };
    case 'position':
      return dev('prophylactic') + dev('restriction') + dev('tension') >= dev('active') + dev('space')
        ? { name: '조이기의 달인', desc: '상대의 계획을 미리 막고 숨통을 조인다 (페트로시안 스타일)' }
        : { name: '포지셔널 전략가', desc: '공간과 기물 활동으로 천천히 우위를 쌓는다' };
    case 'safety': {
      // 안전 계열 안에서 무엇이 두드러졌는지로 나눈다: 견고함 / 실제 수비 / 단순화
      const lead = (['solid', 'defensive', 'simplifying'] as StyleKey[]).sort((a, b) => dev(b) - dev(a))[0];
      if (lead === 'defensive') return { name: '철벽 수비형', desc: '위협을 먼저 없애고 끈질기게 버틴다' };
      if (lead === 'simplifying') return { name: '안정 추구형', desc: '교환과 단순화로 위험 없는 국면을 선호한다' };
      return second[0] === 'position' || second[0] === 'practical'
        ? { name: '견고한 전략가', desc: '위험을 만들지 않고 긴장을 유지하며 천천히 우위를 쌓는다 (카르포프 스타일)' }
        : { name: '안정 추구형', desc: '위험 요소를 최소화하는 견고한 수를 선호한다' };
    }
    default:
      return dev('complicating') >= dev('practical')
        ? { name: '혼돈의 마술사', desc: '국면을 일부러 복잡하게 만들어 상대의 실수를 유도한다' }
        : { name: '실전형 승부사', desc: '최선보다 이기기 쉬운 길을 고른다' };
  }
}

export function buildProfile(all: MoveAnalysis[]): PlayerProfile {
  const counted = all.filter((m) => !m.forced);
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

  const risk = { soundSacrifice: { count: 0, success: 0 }, trap: { count: 0, success: 0 }, gamble: { count: 0, success: 0 } };
  for (const m of all) if (m.risk) { risk[m.risk].count++; if (m.riskSucceeded) risk[m.risk].success++; }

  const quality: Record<QualityKey, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const m of all) if (m.quality) quality[m.quality]++;

  const acpl = all.length ? Math.round(all.reduce((s, m) => s + Math.min(m.cpLoss, 1000), 0) / all.length) : 0;
  const accuracy = all.length ? Math.round(all.reduce((s, m) => s + moveAccuracy(m), 0) / all.length * 10) / 10 : 0;

  const by = <T extends string>(keys: T[], pick: (m: MoveAnalysis) => T) =>
    Object.fromEntries(keys.map((k) => [k, slice(counted.filter((m) => pick(m) === k))])) as Record<T, SliceProfile>;

  const riskRate = counted.length ? (risk.gamble.count + risk.soundSacrifice.count + risk.trap.count) / counted.length : 0;

  return {
    moves: all.length, counted: counted.length, avg, primaryCounts, top: topOf(avg, 5),
    choice, choiceTop: choice ? topOf(choice, 3).filter((k) => choice![k] >= 5) : [],
    risk, quality, acpl, accuracy,
    byPhase: by(['opening', 'middlegame', 'endgame'], (m) => m.phase),
    bySituation: by(['ahead', 'equal', 'behind'], (m) => m.situation),
    archetype: archetype(avg, riskRate),
  };
}

export function buildProfiles(moves: MoveAnalysis[]) {
  return { w: buildProfile(moves.filter((m) => m.color === 'w')), b: buildProfile(moves.filter((m) => m.color === 'b')) };
}
