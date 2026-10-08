import { describe, it, expect } from 'vitest';
import { Position } from '../src/search/position';
import { Searcher, threatOf, zugzwangOf, replyOutcomes } from '../src/search/search';

describe('탐색', () => {
  it('공짜 퀸을 잡는다', () => {
    const r = new Searcher().search(Position.fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'), 2);
    expect(r.best).toBe('d1d5');
  });

  it('2수 메이트를 찾는다 (백 Qh7#)', () => {
    // 백 퀸 g6 + 비숍 → Qh7#
    const r = new Searcher(200000).search(Position.fromFen('6k1/5pp1/6Q1/8/8/1B6/8/6K1 w - - 0 1'), 3);
    expect(r.score).toBeGreaterThan(20000);
  });

  it('위협 감지: 흑이 쉬면 백이 나이트로 퀸·룩 포크', () => {
    // 흑 차례. 백 Nc7+ 포크 위협이 있는 국면
    const t = threatOf('r3k3/8/8/1N6/8/8/8/4K3 b - - 0 1');
    expect(t.move).toBe('b5c7');
    expect(t.gain).toBeGreaterThan(300);
  });

  it('위협 없음', () => {
    const t = threatOf('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(t.gain).toBeLessThan(50);
  });

  it('주그츠방 값: 평범한 국면에서는 0에 가깝다', () => {
    expect(zugzwangOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBeLessThan(60);
  });

  it('응수별 결과', () => {
    // 백 Bxh7+ 직후, 흑 응수 Kxh7 / Kh8
    const out = replyOutcomes('r1bq1rk1/pp1nbppB/2n1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQK2R b KQ - 0 8', ['g8h7', 'g8h8']);
    expect(out).toHaveLength(2);
  });
});
