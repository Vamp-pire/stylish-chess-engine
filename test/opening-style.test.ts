// 오프닝 이론 구간: 이론 수는 하나하나 판정하지 않고(품질·위험 없음, 정확도 제외),
// 그 판 오프닝의 미리 분석한 스타일을 색마다 OPENING_WEIGHT수만큼만 성향에 반영한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNodeEngine } from './node-engine';
import { analyzeGame } from '../src/core/analyzer';
import { OpeningBook, type OpeningStylesData } from '../src/core/openings';
import { OPENING_WEIGHT, riskPerMove } from '../src/core/profile';
import { STYLE_KEYS, RISK_KINDS } from '../src/core/styles';
import { SAMPLES } from '../src/samples';

describe('오프닝 이론 구간', () => {
  it('이론 수는 판정 없이, 오프닝 스타일만 조금 반영', async () => {
    const data = JSON.parse(readFileSync('public/openings.json', 'utf8'));
    // 모든 오프닝이 '백: 공격적 90, 세 수 중 도박 하나' 라고 가정한 데이터
    const aggressive = STYLE_KEYS.map((k) => (k === 'aggressive' ? 90 : 0));
    const styles: OpeningStylesData = {
      keys: [...STYLE_KEYS], risks: [...RISK_KINDS],
      styles: Object.fromEntries(data.names.map((n: [string, string]) => [n.join('\t'), [[3, aggressive, [0, 0, 0, 1]], null]])),
    };
    const engine = await createNodeEngine();
    const g = await analyzeGame(SAMPLES.find((s) => s.id === 'opera')!.pgn, engine, { depth: 8, book: new OpeningBook(data, styles) });
    engine.quit();

    const book = g.moves.filter((m) => m.book);
    expect(book.length).toBeGreaterThan(0);
    for (const m of book) { expect(m.quality).toBeNull(); expect(m.risk).toBeNull(); }
    // 백의 마지막 이론 수에만 오프닝 스타일, 흑은 데이터가 없으니 없음
    expect(book.filter((m) => m.openingStyle).map((m) => m.color)).toEqual(['w']);
    const w = g.profiles.w, b = g.profiles.b;
    expect(w.openingWeight).toBe(OPENING_WEIGHT);
    expect(w.openingRisk).toBeCloseTo(OPENING_WEIGHT / 3);
    expect(b.openingWeight).toBe(0);
    expect(riskPerMove(w)).toBeGreaterThan(0);
    // 정확도·품질 개수는 이론 밖 수만
    const rated = g.moves.filter((m) => m.color === 'w' && !m.book);
    expect(Object.values(w.quality).reduce((s, x) => s + x, 0)).toBe(rated.filter((m) => m.quality).length);
    expect(g.openingStyle?.w?.scores.aggressive).toBe(90);
  });
});
