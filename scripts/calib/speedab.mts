// 속도 옵션 A/B: 같은 플레이어의 게임을 기본 / scout / reusePlayed / 둘 다 로 분석해 시간과 결과 차이를 잰다 (깊이 10, Maia3, 오프닝 이론).
// 결정 기준은 플레이어 단위(판들을 합친 프로필): 유형 지표 차이(보정 표준편차 단위)와 유형 글자 일치, 그리고 수별 품질 일치.
// 사용: npx tsx scripts/calib/speedab.mts <shard> <shards> <players> <out.jsonl>  → scripts/calib/speedab-report.mjs로 합친다
// GitHub Actions(.github/workflows/speedab.yml)에서 여러 개를 동시에 돌린다.
import { appendFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNodeEngine, loadNodeBook } from '../../test/node-engine';
import { createNodeHuman } from '../../test/node-human';
import { analyzeGame, type AnalyzeOptions, type MoveAnalysis } from '../../src/core/analyzer';
import { buildProfile } from '../../src/core/profile';
import { chessTypeOf, metricsOf } from '../../src/core/chessType';

const [shard, shards, perShard] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4])];
const outFile = process.argv[5];
const DEPTH = 10;
export const CONFIGS: Record<string, AnalyzeOptions> = {
  // base2: 같은 설정 재분석 = 엔진 상태(해시)에 따른 원래 흔들림. 옵션 차이는 이것과 비교해서 본다
  base: {}, base2: {}, scout: { scout: true }, reuse: { reusePlayed: true }, both: { scout: true, reusePlayed: true },
};

interface Player { id: string; band: number; cls?: string; games: string[] }
const players: Player[] = gunzipSync(readFileSync(process.env.CALIB_GAMES ?? 'calib/games.jsonl.gz')).toString('utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((_: Player, i: number) => i % shards === shard).slice(0, perShard);

const engine = await createNodeEngine();
const human = await createNodeHuman();
const book = loadNodeBook();

for (const p of players) {
  const out: Record<string, unknown> = { id: p.id, band: p.band };
  for (const [name, o] of Object.entries(CONFIGS)) {
    const t0 = Date.now();
    const mine: MoveAnalysis[] = [];
    for (const pgn of p.games) {
      const color = /\[White "Player"\]/.test(pgn) ? 'w' : 'b';
      const g = await analyzeGame(pgn, engine, { depth: DEPTH, human, book, ...o }).catch(() => null);
      if (g) mine.push(...g.moves.filter((m) => m.color === color));
    }
    const prof = buildProfile(mine);
    const elo = Number(p.games[0].match(/\[(?:White|Black)Elo "(\d+)"\]/)?.[1]) || null;
    prof.rating = elo;
    out[name] = {
      ms: Date.now() - t0, q: mine.map((m) => m.quality ?? ''), r: mine.map((m) => m.risk ?? ''),
      acc: prof.accuracy, metrics: metricsOf(prof), code: chessTypeOf(prof)?.code ?? null,
    };
  }
  appendFileSync(outFile, JSON.stringify(out) + '\n');
  console.log(`${p.id} 완료`);
}
engine.quit();
process.exit(0);
