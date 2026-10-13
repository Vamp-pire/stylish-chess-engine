// 4글자 유형 보정용 분석: 익명화한 Lichess 플레이어 게임(calib/games.jsonl.gz)을 브라우저와 같은 조건
// (Stockfish 19 lite, 깊이 10 = 여러 판 종합 분석 기본값, Maia3, 오프닝 이론)으로 분석해 수마다 핵심 수치만 JSONL로 저장한다.
// 사용: npx tsx scripts/calib/analyze.mts <shard> <shards> <out.jsonl>   (플레이어 번호 % shards === shard 만 처리)
// GitHub Actions(.github/workflows/calibrate.yml)에서 여러 개를 동시에 돌린 뒤 scripts/build-type-calib.mjs로 합친다.
import { appendFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNodeEngine, loadNodeBook } from '../../test/node-engine';
import { createNodeHuman } from '../../test/node-human';
import { analyzeGame } from '../../src/core/analyzer';

const [shard, shards] = [Number(process.argv[2]), Number(process.argv[3])];
const outFile = process.argv[4];
const DEPTH = 10;

interface Player { id: string; band: number; cls?: string; games: string[] }
const players: Player[] = gunzipSync(readFileSync(process.env.CALIB_GAMES ?? 'calib/games.jsonl.gz')).toString('utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((_: Player, i: number) => i % shards === shard);

const engine = await createNodeEngine();
const human = await createNodeHuman();
const book = loadNodeBook();

for (const p of players) {
  const t0 = Date.now();
  const moves: unknown[] = [];
  const elos: number[] = [];
  for (const [gi, pgn] of p.games.entries()) {
    const color = /\[White "Player"\]/.test(pgn) ? 'w' : 'b';
    const elo = Number(pgn.match(color === 'w' ? /\[WhiteElo "(\d+)"\]/ : /\[BlackElo "(\d+)"\]/)?.[1]);
    if (elo) elos.push(elo);
    const g = await analyzeGame(pgn, engine, { depth: DEPTH, human, book }).catch(() => null);
    if (!g) continue;
    for (const m of g.moves) {
      if (m.color !== color) continue;
      moves.push({
        s: m.scores, r: m.risk, hp: m.humanP, f: m.forced, b: m.book, q: m.quality,
        cp: m.cpLoss, wd: Math.round(m.deep.winDrop * 10) / 10, ph: m.phase, gi, // gi: 몇 번째 판 (필요한 판 수 측정용)
        // 더 안정적인 지표를 찾기 위한 추가 값: 수 두기 전 기대 점수, 선택 성향(대안 대비), 잡기·체크, 상황, 남은 시간 부족
        eb: Math.round((m.deep.expBefore ?? 0.5) * 1000) / 1000, cd: m.choiceDelta ?? null,
        x: m.san.includes('x') ? 1 : 0, ck: m.san.includes('+') ? 1 : 0, si: m.situation, lt: m.lowTime ?? null,
      });
    }
  }
  const elo = elos.length ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : 0;
  appendFileSync(outFile, JSON.stringify({ id: p.id, band: p.band, cls: p.cls ?? null, elo, games: p.games.length, moves }) + '\n');
  console.log(`${p.id} (${p.band}) ${p.games.length}판 ${moves.length}수 ${Math.round((Date.now() - t0) / 1000)}s`);
}
engine.quit();
