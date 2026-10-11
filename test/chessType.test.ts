// 4글자 체스 유형: 백분위, 정반대 유형, 축 계산과 글자 결정
import { describe, it, expect } from 'vitest';
import { percentile, oppositeOf, chessTypeOf, TYPE_DATA, type Calibration, type Metric } from '../src/core/chessType';
import type { PlayerProfile } from '../src/core/profile';

const METRICS: Metric[] = ['aggressive', 'tactical', 'positional', 'prophylactic', 'complicating', 'risk', 'solid', 'simplifying', 'initiative', 'defensive', 'rare'];
const linear = Array.from({ length: 101 }, (_, i) => -2 + (4 * i) / 100);
/** 모든 지표 기대값 10(레이팅 무관)·표준편차 5, 축 분포는 −2~2 균등 */
const CAL: Calibration = {
  players: 100,
  metrics: Object.fromEntries(METRICS.map((k) => [k, { a: 10, b: 0, std: 5 }])) as Calibration['metrics'],
  quantiles: { AP: linear, WS: linear, IR: linear, OE: linear },
};

function profile(over: Partial<Record<string, number>>, rare: number, risks = 0): PlayerProfile {
  const avg = Object.fromEntries(['aggressive', 'tactical', 'initiative', 'counterattack', 'positional', 'prophylactic', 'restriction', 'active', 'space', 'tension', 'solid', 'defensive', 'simplifying', 'complicating', 'quiet', 'waiting', 'practical', 'kingActivity', 'passedPawn']
    .map((k) => [k, over[k] ?? 10]));
  return {
    counted: 100, avg, human: { n: 100, rare, surprise: 1 },
    risk: { soundSacrifice: { count: risks, success: 0 }, speculative: { count: 0, success: 0 }, trap: { count: 0, success: 0 }, gamble: { count: 0, success: 0 } },
  } as unknown as PlayerProfile;
}

describe('체스 유형', () => {
  it('16개 유형 데이터가 모두 있다', () => {
    expect(TYPE_DATA.types).toHaveLength(16);
    expect(new Set(TYPE_DATA.types.map((t) => t.code)).size).toBe(16);
  });

  it('백분위: 분포 안에서 선형 보간', () => {
    expect(percentile(0, linear)).toBeCloseTo(0.5, 5);
    expect(percentile(1, linear)).toBeCloseTo(0.75, 5);
    expect(percentile(-9, linear)).toBe(0);
    expect(percentile(9, linear)).toBe(1);
  });

  it('정반대 유형은 모든 글자를 뒤집는다', () => {
    expect(oppositeOf('AWIO')).toBe('PSRE');
    expect(oppositeOf('PSIE')).toBe('AWRO');
  });

  it('공격·난전·선공·독창 지표가 높으면 AWIO, 반대면 PSRE', () => {
    const wild = chessTypeOf(profile({ aggressive: 20, tactical: 20, positional: 5, prophylactic: 5, complicating: 20, solid: 5, simplifying: 5, initiative: 20, defensive: 5 }, 0.3, 30), CAL)!;
    expect(wild.code).toBe('AWIO');
    expect(wild.info.name).toBe('개척자');
    expect(wild.axes.every((a) => a.strength > 50)).toBe(true);
    const calm = chessTypeOf(profile({ aggressive: 5, tactical: 5, positional: 20, prophylactic: 20, complicating: 5, solid: 20, simplifying: 20, initiative: 5, defensive: 20 }, 0.02, 0), CAL)!;
    expect(calm.code).toBe('PSRE');
  });

  it('같은 지표라도 레이팅 기대값이 다르면 글자가 바뀐다 (같은 레이팅끼리 비교)', () => {
    // 레이팅이 높을수록 공격 지표 기대값이 낮아지는 보정: 1000점에선 평범, 2000점에선 공격적
    const cal: Calibration = { ...CAL, metrics: { ...CAL.metrics, aggressive: { a: 20, b: -0.005, std: 5 }, tactical: { a: 20, b: -0.005, std: 5 } } };
    const p = profile({ aggressive: 14, tactical: 14 }, 0.1);
    const at = (rating: number) => chessTypeOf({ ...p, rating } as PlayerProfile, cal)!.code[0];
    expect(at(800)).toBe('P');
    expect(at(2000)).toBe('A');
  });

  it('Maia 기록이 없는 프로필은 유형을 정하지 않는다', () => {
    const p = profile({}, 0.1);
    delete (p as { human?: unknown }).human;
    expect(chessTypeOf(p, CAL)).toBeNull();
  });
});
