// 오프닝 스타일 미리 분석: Lichess chess-openings(CC0)의 이름 있는 오프닝마다 이론 수순을 사이트와 같은 조건
// (깊이 10, Maia3 레이팅 1500)으로 분석해 백·흑별 스타일 평균과 위험 판정 수를 JSONL로 저장한다.
// 사용: npx tsx scripts/openings/analyze-styles.mts <shard> <shards> <out.jsonl>  → scripts/openings/build-styles.mjs로 합친다
import { appendFileSync, readFileSync } from 'node:fs';
import { createNodeEngine } from '../../test/node-engine';
import { createNodeHuman } from '../../test/node-human';
import { analyzeGame } from '../../src/core/analyzer';
import { STYLE_KEYS, RISK_KINDS } from '../../src/core/styles';

const [shard, shards] = [Number(process.argv[2]), Number(process.argv[3])];
const outFile = process.argv[4];
const lines: { i: number; pgn: string }[] = JSON.parse(readFileSync(process.env.OPENING_LINES ?? 'opening-lines.json', 'utf8'))
  .filter((_: unknown, k: number) => k % shards === shard);

const engine = await createNodeEngine();
const human = await createNodeHuman();
const HEAD = '[White "?"]\n[Black "?"]\n[WhiteElo "1500"]\n[BlackElo "1500"]\n\n';

for (const { i, pgn } of lines) {
  // 오프닝 이론 판별(book)은 넘기지 않는다: 이론 수 자체의 스타일을 보려는 것
  const g = await analyzeGame(HEAD + pgn, engine, { depth: 10, human, noRefine: true }).catch(() => null);
  if (!g) continue;
  const side = (c: 'w' | 'b') => {
    const ms = g.moves.filter((m) => m.color === c);
    if (!ms.length) return null;
    return {
      n: ms.length,
      s: STYLE_KEYS.map((k) => Math.round(ms.reduce((t, m) => t + (m.scores[k] ?? 0), 0) / ms.length)),
      r: RISK_KINDS.map((k) => ms.filter((m) => m.risk === k).length),
    };
  };
  appendFileSync(outFile, JSON.stringify({ i, w: side('w'), b: side('b') }) + '\n');
}
engine.quit();
process.exit(0);
