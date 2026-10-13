// 닮은 선수 찾기: 스타일 평균의 '기준값 대비 편차' 방향이 얼마나 비슷한지(코사인 유사도)로 비교한다.
// 기준값(BASELINE)에서 벗어난 방향이 곧 그 사람의 개성이므로, 점수 수준이 아니라 방향을 본다.
import { tr } from '../i18n';
import masters from '../data/masters.json';
import type { StyleKey } from './styles';
import type { PlayerProfile } from './profile';
import { ratingOf, calibFor, type Metric } from './chessType';
import { RISK_KINDS } from './styles';

export interface Master {
  id: string; name: string; ko: string; era: string; desc: string;
  games: number; counted: number; accuracy: number; archetype: string;
  avg: Record<StyleKey, number>; riskRate: number;
}

export const MASTERS = masters as Master[];

// 비교는 '개성' 끼리만 한다.
// - 선수: 10명 평균에서 얼마나 벗어났는지 (선수들 사이 표준편차 단위). 모든 선수에게 공통인 '고수다운 점'은 빠진다.
// - 사용자: 같은 레이팅 아마추어 기대값에서 얼마나 벗어났는지 (유형 보정 데이터의 z점수).
// 예전에는 고정 기준값과의 차이로 비교해서, 아마추어와 고수의 공통 차이가 방향을 독차지해 한 선수(카르포프)만 자주 나왔다.
const KEYS: Metric[] = ['aggressive', 'tactical', 'positional', 'prophylactic', 'complicating', 'risk', 'solid', 'simplifying', 'initiative', 'defensive'];
const masterMetric = (m: Master, k: Metric) => (k === 'risk' ? m.riskRate * 100 : m.avg[k as StyleKey] ?? 0);
const STATS = Object.fromEntries(KEYS.map((k) => {
  const vals = MASTERS.map((m) => masterMetric(m, k));
  const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length || 1));
  return [k, { mean, sd: Math.max(k === 'risk' ? 0.3 : 0.6, sd) }];
})) as Record<Metric, { mean: number; sd: number }>;

const masterVector = (m: Master) => KEYS.map((k) => (masterMetric(m, k) - STATS[k].mean) / STATS[k].sd);

function userVector(p: PlayerProfile) {
  const cal = calibFor(p);
  const risks = RISK_KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0);
  const rating = ratingOf(p);
  return KEYS.map((k) => {
    const v = k === 'risk' ? (p.counted ? (risks / p.counted) * 100 : 0) : p.avg[k as StyleKey] ?? 0;
    const c = cal.metrics[k];
    return (v - (c.a + c.b * rating)) / (c.std || 1);
  });
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
  const v = userVector(p);
  return MASTERS.map((m) => ({ master: m, score: Math.round(((cosine(v, masterVector(m)) + 1) / 2) * 100) }))
    .sort((a, b) => b.score - a.score).slice(0, n);
}

/** 화면 언어에 맞춘 선수 이름·시대·설명 */
const MASTER_EN: Record<string, [string, string, string]> = {
  Kasparov: ['Garry Kasparov', '1980s–2000s', '13th World Champion. Famous for dynamic initiative and sharp attacking preparation.'],
  Adams: ['Michael Adams', '1990s–2010s', 'England\'s strongest player. Clean, solid play without frills.'],
  Carlsen: ['Magnus Carlsen', '2000s–2020s', '16th World Champion. An all-rounder who squeezes small edges all the way into the endgame.'],
  Ivanchuk: ['Vassily Ivanchuk', '1990s–2010s', 'A creative player who plays almost every opening. Sharp calculation and surprising moves.'],
  Topalov: ['Veselin Topalov', '1990s–2010s', 'FIDE World Champion (2005). An aggressive style that loves exchange sacrifices.'],
  Anand: ['Viswanathan Anand', '1990s–2010s', '15th World Champion. An all-rounder who adapts to any position with fast, precise calculation.'],
  Karpov: ['Anatoly Karpov', '1970s–90s', '12th World Champion. Master of positional play who prevents counterplay and slowly squeezes.'],
  Morozevich: ['Alexander Morozevich', '1990s–2010s', 'Makes positions unpredictable with original, non-standard moves.'],
  Alekhine: ['Alexander Alekhine', '1920s–40s', '4th World Champion. Drove attacks with deep combinations in complicated positions.'],
  Shirov: ['Alexei Shirov', '1990s–2010s', 'An attacker famous for spectacular sacrifices and tactics. His book is titled "Fire on Board".'],
};
export const masterName = (m: Master) => tr(m.ko, MASTER_EN[m.id]?.[0] ?? m.name);
export const masterEra = (m: Master) => tr(m.era, MASTER_EN[m.id]?.[1] ?? m.era);
export const masterDesc = (m: Master) => tr(m.desc, MASTER_EN[m.id]?.[2] ?? m.desc);
