import { describe, it, expect } from 'vitest';
import { createNodeEngine } from './node-engine';

describe('Stockfish WASM (Node)', () => {
  it('시작 국면 MultiPV 3 분석과 메이트 점수', async () => {
    const e = await createNodeEngine();
    const t = Date.now();
    const lines = await e.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 14, multipv: 3 });
    console.log('depth 14 multipv 3:', Date.now() - t, 'ms', lines.map((l) => `${l.uci} ${l.cp}`).join(', '));
    expect(lines).toHaveLength(3);
    expect(lines[0].pv.length).toBeGreaterThan(3);
    // 품질 판정에 쓰는 Stockfish 승/무/패 확률이 실제로 들어오는지
    expect(lines[0].wdl).not.toBeNull();
    expect(lines[0].wdl!.reduce((a, b) => a + b, 0)).toBe(1000);
    const mate = await e.analyse('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { depth: 10, multipv: 1 });
    expect(mate[0].mate).toBe(1);
    expect(mate[0].uci).toBe('a1a8');
    e.quit();
  });
});
