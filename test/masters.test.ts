// 닮은 선수 찾기: 어떤 선수와 똑같은 성향이면 그 선수가 1위로 나와야 한다 (엔진 없음)
import { describe, it, expect } from 'vitest';
import { MASTERS, similarMasters } from '../src/core/masters';
import type { PlayerProfile } from '../src/core/profile';

const fake = (m: (typeof MASTERS)[number]) => ({
  avg: m.avg, counted: 100,
  risk: { soundSacrifice: { count: Math.round(m.riskRate * 100), success: 0 }, speculative: { count: 0, success: 0 }, trap: { count: 0, success: 0 }, gamble: { count: 0, success: 0 } },
}) as unknown as PlayerProfile;

describe('닮은 선수', () => {
  it('데이터가 있다', () => expect(MASTERS.length).toBeGreaterThanOrEqual(8));
  for (const m of MASTERS)
    it(`${m.ko}와 같은 성향이면 ${m.ko}가 1위`, () => {
      const [top] = similarMasters(fake(m));
      expect(top.master.id).toBe(m.id);
      expect(top.score).toBeGreaterThanOrEqual(95);
    });
});
