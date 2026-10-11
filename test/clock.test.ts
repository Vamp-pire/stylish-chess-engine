// 기보 주석의 [%clk]로 소요 시간·시간 부족을 구하는지 확인 (엔진 없음)
import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { plyClocks, parseTimeControl } from '../src/core/clock';

const PGN = `[TimeControl "180+2"]

1. e4 {[%clk 0:03:01]} e5 {[%clk 0:02:55]} 2. Nf3 {[%clk 0:02:50]} Nc6 {[%clk 0:00:20]} 3. Bb5 {[%clk 0:02:40.5]} a6 {[%clk 0:00:15]} *`;

describe('시계', () => {
  it('TimeControl 해석', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 });
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 });
    expect(parseTimeControl('1/86400')).toBeNull();
  });
  it('수별 소요 시간과 시간 부족', () => {
    const ch = new Chess(); ch.loadPgn(PGN);
    const h = ch.history({ verbose: true });
    const c = plyClocks(ch, h, ch.getHeaders() as Record<string, string>);
    expect(c.map((x) => x.clock)).toEqual([181, 175, 170, 20, 160.5, 15]);
    expect(c.map((x) => x.spent)).toEqual([1, 7, 13, 157, 11.5, 7]);
    // 흑 3...a6은 수를 두기 전 20초만 남아 시간 부족
    expect(c.map((x) => x.lowTime)).toEqual([false, false, false, false, false, true]);
  });
  it('시계 기록이 없으면 null', () => {
    const ch = new Chess(); ch.loadPgn('1. e4 e5 *');
    expect(plyClocks(ch, ch.history({ verbose: true }), {})[0]).toEqual({ clock: null, spent: null, lowTime: null });
  });
});
