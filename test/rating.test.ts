import { describe, it, expect } from 'vitest';
import { chesscomToLichess, lichessScale } from '../src/core/rating';

describe('레이팅 환산', () => {
  it('표에 있는 값은 그대로', () => {
    expect(chesscomToLichess(1200)).toBe(1555);
    expect(chesscomToLichess(2200)).toBe(2210);
  });
  it('사이 값은 직선 보간, 바깥은 끝 구간 기울기', () => {
    expect(chesscomToLichess(1250)).toBe(1588);
    expect(chesscomToLichess(400)).toBe(1020);
    expect(chesscomToLichess(3100)).toBe(2815);
  });
  it('Chess.com 기보만 환산한다', () => {
    expect(lichessScale({ Site: 'Chess.com' }, '1000')).toBe(1425);
    expect(lichessScale({ Site: 'https://lichess.org/abc' }, '1000')).toBe(1000);
    expect(lichessScale({ Site: 'Chess.com' }, '?')).toBeNull();
  });
});
