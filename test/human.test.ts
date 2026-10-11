// Maia3 사람 수 예측: 입력 인코딩(흑 차례 뒤집기 포함)과, 확률 기반 함정수·도박수 판정
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Chess } from 'chess.js';
import { createNodeEngine } from './node-engine';
import { createNodeHuman } from './node-human';
import { analyzeGame, type MoveAnalysis } from '../src/core/analyzer';
import type { HumanModel } from '../src/human/maia3';
import type { RiskKind } from '../src/core/styles';
import type { UciEngine } from '../src/engine/uci';

let engine: UciEngine;
let human: HumanModel;
beforeAll(async () => { [engine, human] = await Promise.all([createNodeEngine(), createNodeHuman()]); });
afterAll(() => engine?.quit());

const fenAfter = (moves: string) => { const c = new Chess(); c.loadPgn(moves); return c.fen(); };

describe('Maia3 예측', () => {
  it('첫 수: 확률 합이 1이고 e4·d4가 상위', async () => {
    const [p] = await human.predict([{ fen: new Chess().fen(), elo: 1500, oppElo: 1500 }]);
    expect(p.length).toBe(20);
    expect(p.reduce((s, m) => s + m.p, 0)).toBeCloseTo(1, 4);
    expect(p.slice(0, 2).map((m) => m.uci).sort()).toEqual(['d2d4', 'e2e4']);
  });

  it('흑 차례도 흑의 수로 돌려준다 (1. e4 뒤에는 e5·c5가 상위)', async () => {
    const [p] = await human.predict([{ fen: fenAfter('1. e4'), elo: 1500, oppElo: 1500 }]);
    expect(p.every((m) => m.uci[1] === '7' || m.uci[1] === '8')).toBe(true);
    expect(p.slice(0, 3).map((m) => m.uci)).toEqual(expect.arrayContaining(['e7e5', 'c7c5']));
  });

  it('공짜 퀸은 잡는다 (흑 차례, 뒤집기 확인)', async () => {
    // 백 퀸이 h5에서 흑 폰 g6에게 그냥 잡히는 국면
    const [p] = await human.predict([{ fen: fenAfter('1. e4 g6 2. Qh5'), elo: 1500, oppElo: 1500 }]);
    expect(p[0].uci).toBe('g6h5');
    expect(p[0].p).toBeGreaterThan(0.8);
  });
});

/** Maia를 켠 상태로 수순을 분석하고 마지막 수의 결과를 돌려준다 */
async function last(moves: string): Promise<MoveAnalysis & { human: string }> {
  const g = await analyzeGame(moves, engine, { depth: 12, human });
  return { ...g.moves[g.moves.length - 1], human: g.human };
}

interface Case { name: string; moves: string; risk: RiskKind | null }
const CASES: Case[] = [
  { name: '레갈의 함정 Nxe5', moves: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5', risk: 'trap' },
  { name: '낚싯대 함정 h5', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Ng4 5. h3 h5', risk: 'trap' },
  { name: '평범한 전개 Nf3', moves: '1. e4 e5 2. Nf3', risk: null },
  { name: '그냥 실수 (퀸을 공짜로 줌)', moves: '1. e4 e5 2. Qh5 Nc6 3. Qxf7+', risk: null },
];

describe('확률 기반 위험 판정 (Maia3, 깊이 12)', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const m = await last(c.moves);
      expect(m.human).toBe('maia3');
      expect(m.humanP).not.toBeNull();
      if (m.risk !== c.risk) console.log('✘', c.name, m.san, m.risk, m.riskWhy, `cpLoss=${m.cpLoss} humanP=${m.humanP}`);
      expect(m.risk).toBe(c.risk);
    });
  }
});
