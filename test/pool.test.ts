// 엔진 풀: 동시 처리, 우선순위, 취소
import { describe, it, expect } from 'vitest';
import { EnginePool } from '../src/engine/pool';
import type { Engine, EngineLine } from '../src/engine/uci';

function fakeEngine(log: string[], ms = 20): Engine {
  return {
    analyse: (fen) => new Promise<EngineLine[]>((resolve) => {
      log.push(fen);
      setTimeout(() => resolve([{ uci: 'e2e4', cp: 0, mate: null, pv: [], depth: 1, wdl: null }]), ms);
    }),
    quit() {},
  };
}

describe('엔진 풀', () => {
  it('엔진 수만큼 동시에 처리한다', async () => {
    const log: string[] = [];
    const pool = new EnginePool([fakeEngine(log), fakeEngine(log), fakeEngine(log), fakeEngine(log)]);
    const t = Date.now();
    await Promise.all(Array.from({ length: 8 }, (_, i) => pool.analyse(`p${i}`)));
    // 8개 × 20ms를 4개가 나누면 약 40ms (순차면 160ms)
    expect(Date.now() - t).toBeLessThan(120);
    expect(log).toHaveLength(8);
  });

  it('우선순위가 높은 요청을 먼저 처리한다', async () => {
    const log: string[] = [];
    const pool = new EnginePool([fakeEngine(log)]);
    const jobs = [pool.analyse('a'), pool.analyse('b'), pool.analyse('c'), pool.analyse('urgent', { priority: 10 })];
    await Promise.all(jobs);
    // a는 이미 시작됐고, 그다음은 urgent가 b·c보다 먼저
    expect(log).toEqual(['a', 'urgent', 'b', 'c']);
  });

  it('취소한 분석의 대기 요청은 버린다', async () => {
    const log: string[] = [];
    const pool = new EnginePool([fakeEngine(log)]);
    const old = [pool.analyse('old1', {}, 1), pool.analyse('old2', {}, 1), pool.analyse('old3', {}, 1)];
    old.forEach((p) => p.catch(() => {}));
    pool.cancel(1);
    await pool.analyse('new', {}, 2);
    expect(log).toEqual(['old1', 'new']);
    await expect(old[2]).rejects.toThrow();
  });
});
