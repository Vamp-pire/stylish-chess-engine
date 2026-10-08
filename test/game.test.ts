// 샘플 기보 전체 분석: 파이프라인이 끝까지 돌고 결과가 상식적인지 확인한다.
// GAME=immortal DEPTH=12 또는 PGN_FILE=test/fixtures/x.pgn 처럼 환경변수로 대상과 깊이를 바꿀 수 있다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNodeEngine, loadNodeBook } from './node-engine';
import { analyzeGame } from '../src/core/analyzer';
import { SAMPLES } from '../src/samples';
import { STYLES, RISK_LABEL, QUALITY_LABEL } from '../src/core/styles';

const id = process.env.GAME ?? 'opera';
const depth = Number(process.env.DEPTH ?? 10);

describe(`기보 분석: ${id}`, () => {
  it('끝까지 분석하고 요약을 출력', async () => {
    // PGN_FILE=경로 를 주면 그 파일을, 아니면 예시 기보(GAME)를 분석
    const file = process.env.PGN_FILE;
    const sample = file ? { title: file, pgn: readFileSync(file, 'utf8') } : SAMPLES.find((s) => s.id === id)!;
    const engine = await createNodeEngine();
    const t = Date.now();
    const g = await analyzeGame(sample.pgn, engine, { depth, book: loadNodeBook() });
    const ms = Date.now() - t;
    engine.quit();

    const lines = g.moves.map((m) => {
      const no = `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`.padEnd(14);
      const tops = m.top.slice(0, 3).map((k) => `${STYLES[k].label}${m.scores[k]}`).join(' ');
      const risk = m.risk ? ` [${RISK_LABEL[m.risk]}: ${m.riskWhy}]` : '';
      const q = m.quality ? QUALITY_LABEL[m.quality] : '';
      return `${m.book ? '📖' : '  '}${no}${(m.primary === 'neutral' ? '평범' : STYLES[m.primary].label).padEnd(6)} ${q.padEnd(4)} -${String(m.cpLoss).padStart(4)}${m.forced ? ' (강제)' : ''}${risk}  ${tops}`;
    });
    const prof = (c: 'w' | 'b') => {
      const p = g.profiles[c];
      return `${c === 'w' ? '백' : '흑'}: ${p.archetype.name} | 정확도 ${p.accuracy} ACPL ${p.acpl} | 상위 ${p.top.map((k) => `${STYLES[k].label}${p.avg[k]}`).join(' ')} | 선택 성향 ${p.choiceTop.map((k) => STYLES[k].label).join(',') || '-'}`;
    };
    console.log(`\n${sample.title} — depth ${depth}, ${(ms / 1000).toFixed(1)}초\n` + lines.join('\n') + '\n\n' + prof('w') + '\n' + prof('b'));

    expect(g.moves.length).toBeGreaterThan(20);
  }, 600_000);
});
