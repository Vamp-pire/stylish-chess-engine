// 4글자 체스 유형: 큰 스타일 8개 + Maia 독창성으로 축 4개를 만들고, 실제 플레이어 분포(보정 데이터)에서의 위치로 글자를 정한다.
// 축 값 = (+쪽 지표의 표준점수 평균) − (−쪽 지표의 표준점수 평균). 보정 데이터: src/data/type-calib.json (scripts/build-type-calib.mjs)
// 지표 대부분이 레이팅과 상관이 커서(예: 낮을수록 전술적·드문 수가 많음), 표준점수는 '같은 레이팅의 기대값' 대비로 잰다.
// 즉 유형은 같은 레이팅 플레이어들 사이에서의 성향이다.
import type { PlayerProfile } from './profile';
import { RISK_KINDS } from './styles';
import TYPES from '../data/chess-types.json';
import TYPES_EN from '../data/chess-types.en.json';
import { getLang } from '../i18n';
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
  /** 시간대별 보정 (불릿·블리츠·래피드). 없는 시간대는 전체 보정을 쓴다 */
  byClass?: Record<string, Omit<Calibration, 'byClass'>>;
  /** 지표별 레이팅 회귀(기대값 = a + b × 레이팅)와 잔차 표준편차 */
  metrics: Record<Metric, { a: number; b: number; std: number }>;
  /** 축별 분포: 0~100 백분위에 해당하는 축 값 101개 */
  quantiles: Record<AxisKey, number[]>;
}

export interface TypeInfo {
  code: string; name: string; en: string; tagline: string; summary: string;
  traits: string[]; strengths: string[]; weaknesses: string[]; tips: string[];
}
export interface AxisInfo { key: AxisKey; letters: [string, string]; names: [string, string]; en: [string, string]; question: string; desc: [string, string] }
export interface GroupInfo { name: string; en: string; desc: string }

type TypeData = { axes: AxisInfo[]; groups: Record<string, GroupInfo>; types: TypeInfo[] };
/** 화면 언어의 유형 글 (앱은 언어를 바꾸면 새로 불러오므로 한 번만 만든다). 영어에서는 name이 영어 이름 */
function localize(): TypeData {
  const raw = TYPES as unknown as TypeData;
  if (getLang() !== 'en') return raw;
  const en = TYPES_EN as unknown as { axes: Partial<AxisInfo>[]; groups: Record<string, { name: string; desc: string }>; types: Record<string, Partial<TypeInfo>> };
  return {
    axes: raw.axes.map((a, i) => ({ ...a, ...en.axes[i], letters: a.letters, key: a.key }) as AxisInfo),
    groups: Object.fromEntries(Object.entries(raw.groups).map(([g, v]) => [g, { ...v, name: en.groups[g].name, desc: en.groups[g].desc }])),
    types: raw.types.map((t) => ({ ...t, ...en.types[t.code], name: t.en })),
  };
}
export const TYPE_DATA = localize();
export const typeInfo = (code: string) => TYPE_DATA.types.find((t) => t.code === code) ?? null;
export const groupOf = (code: string) => TYPE_DATA.groups[code.slice(0, 2)];
/** 모든 글자를 뒤집은 정반대 유형 */
export const oppositeOf = (code: string) =>
  [...code].map((c, i) => { const l = TYPE_DATA.axes[i].letters; return c === l[0] ? l[1] : l[0]; }).join('');

/** 유형 판정에 필요한 최소 평가 대상 수 (대략 5판) */
export const MIN_COUNTED = 80;

/** 레이팅 범위 (Maia3와 같음). 기보에 없으면 기본값 */
export const RATING_MIN = 600, RATING_MAX = 2600, RATING_DEFAULT = 1500;
export const ratingOf = (p: PlayerProfile) => Math.max(RATING_MIN, Math.min(RATING_MAX, p.rating || RATING_DEFAULT));

/** PGN TimeControl 헤더(예: 180+2) → 시간대. Lichess 기준(예상 시간 = 기본 + 40 × 추가) */
export function timeClassOf(h: Record<string, string>): string | null {
  const tc = h.TimeControl ?? '';
  if (/^\d+\/\d+$/.test(tc)) return 'daily';
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const est = Number(m[1]) + 40 * Number(m[2] ?? 0);
  return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
}

/** 이 프로필의 시간대에 맞는 보정 (없으면 전체) */
export function calibFor(p: PlayerProfile, base: Calibration = CALIB as Calibration): Calibration {
  const c = p.timeClass ? base.byClass?.[p.timeClass] : undefined;
  return c ? { ...c } : base;
}

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

export function axisValue(m: Record<Metric, number>, rating: number, axis: AxisKey, cal: Calibration = CALIB as Calibration) {
  const z = (k: Metric) => { const c = cal.metrics[k]; return (m[k] - (c.a + c.b * rating)) / (c.std || 1); };
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
export function chessTypeOf(p: PlayerProfile, cal: Calibration = calibFor(p)): ChessType | null {
  const m = metricsOf(p);
  if (!m) return null;
  const axes = AXIS_KEYS.map((key, i): AxisResult => {
    const pct = percentile(axisValue(m, ratingOf(p), key, cal), cal.quantiles[key]);
    const first = pct >= 0.5;
    return { key, letter: TYPE_DATA.axes[i].letters[first ? 0 : 1], strength: Math.round((first ? pct : 1 - pct) * 100), pct: Math.round(pct * 100) };
  });
  const code = axes.map((a) => a.letter).join('');
  return { code, info: typeInfo(code)!, axes, counted: p.counted, reliable: p.counted >= MIN_COUNTED };
}

// ───────────── 같은 레이팅과 비교 (프로필 화면의 수치) ─────────────

/** 표준정규 누적분포 (z → 0~1) */
function normCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export type PeerMetric = Exclude<Metric, 'rare'>;
export const PEER_METRICS: PeerMetric[] = ['aggressive', 'tactical', 'initiative', 'positional', 'prophylactic', 'solid', 'defensive', 'simplifying', 'complicating', 'risk'];

/**
 * 같은 레이팅 플레이어(보정 데이터) 대비 지표별 위치: z점수와 백분위(0~100, 50 = 같은 레이팅 평균).
 * 원점수(0~100)는 보통 20 안팎이라 '낮아 보이고' 기준도 안 보여서, 화면에는 이 값을 쓴다.
 */
export function peerStats(p: PlayerProfile, cal: Calibration = calibFor(p)): Record<PeerMetric, { z: number; pct: number }> | null {
  if (!cal.players || !p.counted) return null;
  const risks = RISK_KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0);
  const rating = ratingOf(p);
  return Object.fromEntries(PEER_METRICS.map((k) => {
    const v = k === 'risk' ? (risks / p.counted) * 100 : p.avg[k];
    const c = cal.metrics[k];
    const z = (v - (c.a + c.b * rating)) / (c.std || 1);
    return [k, { z, pct: Math.round(normCdf(z) * 100) }];
  })) as Record<PeerMetric, { z: number; pct: number }>;
}

/** 레이더용 묶음: 묶음 안 지표 z의 평균 → 백분위 */
export const PEER_GROUPS: { key: string; ko: string; en: string; keys: PeerMetric[] }[] = [
  { key: 'attack', ko: '공격', en: 'Attack', keys: ['aggressive', 'tactical', 'initiative'] },
  { key: 'position', ko: '포지션', en: 'Position', keys: ['positional', 'prophylactic'] },
  { key: 'safety', ko: '안전', en: 'Safety', keys: ['solid', 'defensive', 'simplifying'] },
  { key: 'chaos', ko: '난전', en: 'Chaos', keys: ['complicating', 'risk'] },
];
export function peerGroupPct(s: Record<PeerMetric, { z: number }>, keys: PeerMetric[]) {
  return Math.round(normCdf(keys.reduce((a, k) => a + s[k].z, 0) / keys.length) * 100);
}
