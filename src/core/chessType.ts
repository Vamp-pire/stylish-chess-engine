// 4글자 체스 유형: 큰 스타일 8개 + Maia 독창성으로 축 4개를 만들고, 실제 플레이어 분포(보정 데이터)에서의 위치로 글자를 정한다.
// 축 값 = (+쪽 지표의 표준점수 평균) − (−쪽 지표의 표준점수 평균). 보정 데이터: src/data/type-calib.json (scripts/build-type-calib.mjs)
import type { PlayerProfile } from './profile';
import { RISK_KINDS } from './styles';
import TYPES from '../data/chess-types.json';
import CALIB from '../data/type-calib.json';

export type AxisKey = 'AP' | 'WS' | 'IR' | 'OE';
export const AXIS_KEYS: AxisKey[] = ['AP', 'WS', 'IR', 'OE'];

/** 축을 이루는 지표: 프로필에서 바로 읽을 수 있는 값 */
export type Metric =
  | 'aggressive' | 'tactical' | 'positional' | 'prophylactic'
  | 'complicating' | 'risk' | 'solid' | 'simplifying'
  | 'initiative' | 'defensive'
  | 'rare';

export const AXIS_DEF: Record<AxisKey, { plus: Metric[]; minus: Metric[] }> = {
  AP: { plus: ['aggressive', 'tactical'], minus: ['positional', 'prophylactic'] },
  WS: { plus: ['complicating', 'risk'], minus: ['solid', 'simplifying'] },
  IR: { plus: ['initiative'], minus: ['defensive'] },
  OE: { plus: ['rare'], minus: [] },
};

export interface Calibration {
  /** 보정에 쓴 플레이어 수 */
  players: number;
  /** 지표별 평균·표준편차 (표준점수용) */
  metrics: Record<Metric, { mean: number; std: number }>;
  /** 축별 분포: 0~100 백분위에 해당하는 축 값 101개 */
  quantiles: Record<AxisKey, number[]>;
}

export interface TypeInfo {
  code: string; name: string; en: string; tagline: string; summary: string;
  traits: string[]; strengths: string[]; weaknesses: string[]; tips: string[];
}
export interface AxisInfo { key: AxisKey; letters: [string, string]; names: [string, string]; en: [string, string]; question: string; desc: [string, string] }
export interface GroupInfo { name: string; en: string; desc: string }

export const TYPE_DATA = TYPES as unknown as { axes: AxisInfo[]; groups: Record<string, GroupInfo>; types: TypeInfo[] };
export const typeInfo = (code: string) => TYPE_DATA.types.find((t) => t.code === code) ?? null;
export const groupOf = (code: string) => TYPE_DATA.groups[code.slice(0, 2)];
/** 모든 글자를 뒤집은 정반대 유형 */
export const oppositeOf = (code: string) =>
  [...code].map((c, i) => { const l = TYPE_DATA.axes[i].letters; return c === l[0] ? l[1] : l[0]; }).join('');

/** 유형 판정에 필요한 최소 평가 대상 수 (대략 5판) */
export const MIN_COUNTED = 80;

/** 프로필 → 지표 값. 독창성(Maia)이 없으면 null */
export function metricsOf(p: PlayerProfile): Record<Metric, number> | null {
  if (!p.human || !p.counted) return null;
  const risks = RISK_KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0);
  const a = p.avg;
  return {
    aggressive: a.aggressive, tactical: a.tactical, positional: a.positional, prophylactic: a.prophylactic,
    complicating: a.complicating, risk: (risks / p.counted) * 100, solid: a.solid, simplifying: a.simplifying,
    initiative: a.initiative, defensive: a.defensive,
    rare: p.human.rare * 100,
  };
}

export function axisValue(m: Record<Metric, number>, axis: AxisKey, cal: Calibration = CALIB as Calibration) {
  const z = (k: Metric) => (m[k] - cal.metrics[k].mean) / (cal.metrics[k].std || 1);
  const mean = (ks: Metric[]) => (ks.length ? ks.reduce((s, k) => s + z(k), 0) / ks.length : 0);
  const d = AXIS_DEF[axis];
  return mean(d.plus) - mean(d.minus);
}

/** 축 값의 백분위 (0~1): 보정 분포에서 몇 %의 플레이어보다 앞 글자 쪽인가 */
export function percentile(v: number, q: number[]) {
  if (v <= q[0]) return 0;
  if (v >= q[q.length - 1]) return 1;
  let i = 0;
  while (q[i + 1] < v) i++;
  const t = (v - q[i]) / (q[i + 1] - q[i] || 1);
  return (i + t) / (q.length - 1);
}

export interface AxisResult {
  key: AxisKey;
  letter: string;
  /** 고른 글자 쪽으로 얼마나 기울었는가 (50~100%) */
  strength: number;
  /** 앞 글자 쪽 백분위 (0~100): 막대 표시용 */
  pct: number;
}
export interface ChessType { code: string; info: TypeInfo; axes: AxisResult[]; counted: number; reliable: boolean }

/** 프로필 → 4글자 유형. Maia 기록이 없는 프로필이면 null */
export function chessTypeOf(p: PlayerProfile, cal: Calibration = CALIB as Calibration): ChessType | null {
  const m = metricsOf(p);
  if (!m) return null;
  const axes = AXIS_KEYS.map((key, i): AxisResult => {
    const pct = percentile(axisValue(m, key, cal), cal.quantiles[key]);
    const first = pct >= 0.5;
    return { key, letter: TYPE_DATA.axes[i].letters[first ? 0 : 1], strength: Math.round((first ? pct : 1 - pct) * 100), pct: Math.round(pct * 100) };
  });
  const code = axes.map((a) => a.letter).join('');
  return { code, info: typeInfo(code)!, axes, counted: p.counted, reliable: p.counted >= MIN_COUNTED };
}
