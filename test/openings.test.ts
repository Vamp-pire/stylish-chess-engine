// 오프닝 이론(북) 판별: 알려진 수순, 이탈 지점, 수순 전환
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { OpeningBook } from '../src/core/openings';
import { analyzeGame } from '../src/core/analyzer';
import { createNodeEngine } from './node-engine';

const book = new OpeningBook(JSON.parse(readFileSync('public/openings.json', 'utf8')));

function fenAfter(moves: string) {
  const c = new Chess();
  for (const m of moves.split(' ')) c.move(m);
  return c.fen();
}

describe('오프닝 이론 판별', () => {
  it('이탈리안 게임', () => {
    const o = book.lookup(fenAfter('e4 e5 Nf3 Nc6 Bc4'));
    expect(o?.eco).toBe('C50');
    expect(o?.name).toMatch(/Italian/);
  });
  it('루이 로페즈', () => {
    expect(book.lookup(fenAfter('e4 e5 Nf3 Nc6 Bb5'))?.name).toMatch(/Ruy Lopez/);
  });
  it('시칠리안 나이도르프', () => {
    expect(book.lookup(fenAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'))?.name).toMatch(/Najdorf/);
  });
  it('수순이 바뀌어도 같은 국면이면 인식 (1.Nf3 d5 2.d4 = 1.d4 d5 2.Nf3)', () => {
    const a = book.lookup(fenAfter('Nf3 d5 d4'));
    const b = book.lookup(fenAfter('d4 d5 Nf3'));
    expect(a).not.toBeNull();
    expect(a?.name).toBe(b?.name);
  });
  it('이론에 없는 국면', () => {
    expect(book.lookup(fenAfter('e4 e5 Ke2 Ke7 Ke3 Ke6'))).toBeNull();
  });
});

describe('기보 분석의 이론 구간', () => {
  it('이론 수 표시, 이탈 지점, 프로필 집계 제외', async () => {
    const engine = await createNodeEngine();
    const g = await analyzeGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Kf1 Nf6 5. Ke1', engine, { depth: 8, book });
    engine.quit();
    expect(g.moves.slice(0, 6).every((m) => m.book)).toBe(true);
    expect(g.moves[6].book).toBe(false); // 4. Kf1 이탈
    expect(g.bookPlies).toBe(6);
    expect(g.opening?.name).toMatch(/Italian|Giuoco/);
    expect(g.profiles.w.opening.leftBookFirst).toBe(true);
    expect(g.profiles.w.opening.deviation?.san).toBe('Kf1');
    // 이론 수 3개(e4, Nf3, Bc4)는 집계에서 빠진다
    expect(g.profiles.w.counted).toBeLessThanOrEqual(g.profiles.w.moves - 3);
  });
});
