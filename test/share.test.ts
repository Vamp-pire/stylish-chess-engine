// 공유 링크: 기보를 압축해 주소에 담고 되돌릴 수 있는지 (Node에도 CompressionStream이 있다)
import { describe, it, expect } from 'vitest';
import { encodeGame, decodeGame, slimPgn } from '../src/ui/share';
import { SAMPLES } from '../src/samples';

describe('공유 링크', () => {
  it('필요한 헤더와 시계 주석만 남긴다', () => {
    const s = slimPgn('[Event "x"]\n[ECOUrl "y"]\n[White "A"]\n\n1. e4 {[%clk 0:03:00] 좋은 수} e5 {메모} $1 2. Nf3 *');
    expect(s).toBe('[Event "x"]\n[White "A"]\n\n1. e4 {[%clk 0:03:00]} e5 2. Nf3 *');
  });
  it('압축 후 되돌리기', async () => {
    const pgn = SAMPLES[0].pgn;
    const code = await encodeGame(pgn);
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeGame(code)).toBe(slimPgn(pgn));
    expect(code.length).toBeLessThan(slimPgn(pgn).length);
  });
});
