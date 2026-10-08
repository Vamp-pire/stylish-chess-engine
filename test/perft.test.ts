// 수 생성기 정확성 검증: 알려진 국면들의 perft 값과 대조한다.
import { describe, it, expect } from 'vitest';
import { Position } from '../src/search/position';

const CASES: [string, string, number, number][] = [
  ['시작 국면', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  ['국면 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
  ['국면 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
  ['국면 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ['국면 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', 3, 89890],
];

describe('perft', () => {
  for (const [name, fen, depth, nodes] of CASES)
    it(`${name} depth ${depth} = ${nodes}`, () => {
      const p = Position.fromFen(fen);
      expect(p.perft(depth)).toBe(nodes);
      expect(p.toFen()).toBe(fen); // make/unmake 후 원상 복구
    });
});
