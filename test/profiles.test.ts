// 고전 기보 플레이어 유형이 일반적인 평가와 맞는지 확인 (M5 상식 검사)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNodeEngine, loadNodeBook } from './node-engine';
import { analyzeGame } from '../src/core/analyzer';
import { SAMPLES } from '../src/samples';
import type { UciEngine } from '../src/engine/uci';

let engine: UciEngine;
beforeAll(async () => { engine = await createNodeEngine(); });
afterAll(() => engine?.quit());

const pgnOf = (id: string) => SAMPLES.find((s) => s.id === id)!.pgn;
const CASES: { name: string; pgn: () => string; side: 'w' | 'b'; expect: string[] }[] = [
  { name: '모피 (오페라 게임)', pgn: () => pgnOf('opera'), side: 'w', expect: ['로맨틱 공격수', '역동적 공격형'] },
  { name: '안데르센 (불멸의 게임)', pgn: () => pgnOf('immortal'), side: 'w', expect: ['로맨틱 공격수', '역동적 공격형'] },
  { name: '안데르센 (상록수 게임)', pgn: () => pgnOf('evergreen'), side: 'w', expect: ['로맨틱 공격수', '역동적 공격형'] },
  { name: '카르포프 (vs 운치커)', pgn: () => readFileSync('test/fixtures/karpov-unzicker.pgn', 'utf8'), side: 'w', expect: ['견고한 전략가', '조이기의 달인', '포지셔널 전략가'] },
];

describe('플레이어 유형', () => {
  for (const c of CASES)
    it(c.name, async () => {
      const g = await analyzeGame(c.pgn(), engine, { depth: 10, book: loadNodeBook() });
      const p = g.profiles[c.side];
      console.log(`${c.name}: ${p.archetype.name} (정확도 ${p.accuracy}) · ${g.opening?.eco} ${g.opening?.name} · 이론 ${g.bookPlies}수`);
      expect(c.expect).toContain(p.archetype.name);
    }, 300_000);
});
