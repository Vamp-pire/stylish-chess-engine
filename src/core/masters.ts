// 닮은 선수 찾기: 스타일 평균의 '기준값 대비 편차' 방향이 얼마나 비슷한지(코사인 유사도)로 비교한다.
// 기준값(BASELINE)에서 벗어난 방향이 곧 그 사람의 개성이므로, 점수 수준이 아니라 방향을 본다.
import masters from '../data/masters.json';
import { STYLE_KEYS, type StyleKey } from './styles';
import { BASELINE, type PlayerProfile } from './profile';
import { RISK_KINDS } from './styles';

export interface Master {
  id: string; name: string; ko: string; era: string; desc: string;
  games: number; counted: number; accuracy: number; archetype: string;
  avg: Record<StyleKey, number>; riskRate: number;
}

export const MASTERS = masters as Master[];

/** 스타일마다 선수들 사이 편차의 표준편차로 나눠, 원래 흔들림이 큰 스타일이 비교를 독차지하지 않게 한다 */
const SCALE: Record<StyleKey, number> = Object.fromEntries(STYLE_KEYS.map((k) => {
  const vals = MASTERS.map((m) => m.avg[k]);
  const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length || 1));
  return [k, Math.max(2, sd)];
})) as Record<StyleKey, number>;
const RISK_SCALE = 0.02;
const meanRisk = MASTERS.reduce((s, m) => s + m.riskRate, 0) / (MASTERS.length || 1);

function vector(avg: Record<StyleKey, number>, riskRate: number) {
  return [...STYLE_KEYS.map((k) => ((avg[k] ?? 0) - BASELINE[k]) / SCALE[k]), (riskRate - meanRisk) / RISK_SCALE];
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 이 이상 평가한 수가 있어야 비교가 의미 있다 */
export const MIN_MOVES_FOR_MATCH = 15;

export function similarMasters(p: PlayerProfile, n = 3): { master: Master; score: number }[] {
  if (!MASTERS.length) return [];
  const risk = p.counted ? RISK_KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0) / p.counted : 0;
  const v = vector(p.avg, risk);
  return MASTERS.map((m) => ({ master: m, score: Math.round(((cosine(v, vector(m.avg, m.riskRate)) + 1) / 2) * 100) }))
    .sort((a, b) => b.score - a.score).slice(0, n);
}
