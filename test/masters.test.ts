// 닮은 선수 찾기 (엔진 없음)
// 사용자는 같은 레이팅 아마추어 대비 개성, 선수는 10명 평균 대비 개성으로 비교한다.
import { describe, it, expect } from 'vitest';
import { MASTERS, similarMasters } from '../src/core/masters';
import type { PlayerProfile } from '../src/core/profile';
import CALIB from '../src/data/type-calib.json';

const KEYS = ['aggressive', 'tactical', 'positional', 'prophylactic', 'complicating', 'risk', 'solid', 'simplifying', 'initiative', 'defensive'] as const;
type K = (typeof KEYS)[number];
const cal = CALIB.metrics as Record<K, { a: number; b: number; std: number }>;
const RATING = 1500;
const mv = (m: (typeof MASTERS)[number], k: K) => (k === 'risk' ? m.riskRate * 100 : m.avg[k]);
const stats = Object.fromEntries(KEYS.map((k) => {
  const v = MASTERS.map((m) => mv(m, k));
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return [k, { mean, sd: Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length) || 1 }];
})) as Record<K, { mean: number; sd: number }>;

/** z점수(같은 레이팅 대비)를 프로필로 */
function fake(z: Record<K, number>, counted = 1000): PlayerProfile {
  const val = (k: K) => cal[k].a + cal[k].b * RATING + z[k] * cal[k].std;
  const avg = Object.fromEntries(KEYS.filter((k) => k !== 'risk').map((k) => [k, val(k)]));
  return {
    avg, counted, rating: RATING,
    risk: { soundSacrifice: { count: Math.round((val('risk') / 100) * counted), success: 0 }, speculative: { count: 0, success: 0 }, trap: { count: 0, success: 0 }, gamble: { count: 0, success: 0 } },
  } as unknown as PlayerProfile;
}

describe('닮은 선수', () => {
  it('데이터가 있다', () => expect(MASTERS.length).toBeGreaterThanOrEqual(8));

  for (const m of MASTERS)
    it(`${m.ko}와 같은 개성이면 ${m.ko}가 1위`, () => {
      const z = Object.fromEntries(KEYS.map((k) => [k, (mv(m, k) - stats[k].mean) / stats[k].sd])) as Record<K, number>;
      const [top] = similarMasters(fake(z));
      expect(top.master.id).toBe(m.id);
      expect(top.score).toBeGreaterThanOrEqual(90);
    });

  it('여러 아마추어에게 한 선수만 몰려 나오지 않는다 (예전엔 카르포프가 대부분)', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const count: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const z = Object.fromEntries(KEYS.map((k) => [k, gauss()])) as Record<K, number>;
      const id = similarMasters(fake(z))[0].master.id;
      count[id] = (count[id] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(count))).toBeLessThan(500 * 0.3);
    expect(Object.keys(count).length).toBe(MASTERS.length);
  });
});
