// 임시: 속도 옵션 A/B. 같은 게임을 기본 / scout / reusePlayed / 둘 다 로 분석해 시간과 결과 차이를 본다 (깊이 10, Maia3)
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNodeEngine, loadNodeBook } from '../test/node-engine';
import { createNodeHuman } from '../test/node-human';
import { analyzeGame, type AnalyzeOptions } from '../src/core/analyzer';
import { metricsOf } from '../src/core/chessType';
import CALIB from '../src/data/type-calib.json';

const players = gunzipSync(readFileSync('calib/games.jsonl.gz')).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const engine = await createNodeEngine();
const human = await createNodeHuman();
const book = loadNodeBook();
const CONFIGS: Record<string, AnalyzeOptions> = { 기본: {}, scout: { scout: true }, reuse: { reusePlayed: true }, 둘다: { scout: true, reusePlayed: true } };
const games: string[] = [];
for (let i = 0; i < players.length && games.length < Number(process.argv[3] ?? 14); i += 31) games.push(players[i].games[2]);

const stat: Record<string, { ms: number; qSame: number; rSame: number; rBase: number; rThis: number; moves: number; metricDiff: Record<string, number[]> }> = {};
for (const name of Object.keys(CONFIGS)) stat[name] = { ms: 0, qSame: 0, rSame: 0, rBase: 0, rThis: 0, moves: 0, metricDiff: {} };
for (const pgn of games) {
  const res: Record<string, Awaited<ReturnType<typeof analyzeGame>>> = {};
  for (const [name, o] of Object.entries(CONFIGS)) {
    const t = Date.now();
    res[name] = await analyzeGame(pgn, engine, { depth: 10, human, book, ...o });
    stat[name].ms += Date.now() - t;
  }
  const base = res['기본'];
  for (const name of Object.keys(CONFIGS)) {
    const r = res[name], s = stat[name];
    r.moves.forEach((m, k) => {
      const b = base.moves[k];
      if (m.book) return;
      s.moves++;
      if (m.quality === b.quality) s.qSame++;
      if (b.risk) s.rBase++;
      if (m.risk) s.rThis++;
      if (m.risk && m.risk === b.risk) s.rSame++;
    });
    for (const c of ['w', 'b'] as const) {
      const mb = metricsOf(base.profiles[c]), mt = metricsOf(r.profiles[c]);
      if (!mb || !mt) continue;
      for (const k of Object.keys(mb) as (keyof typeof mb)[]) {
        const sd = (CALIB.metrics as Record<string, { std: number }>)[k]?.std ?? 1;
        (s.metricDiff[k] ??= []).push(Math.abs(mt[k] - mb[k]) / sd);
      }
    }
  }
  console.log(`게임 ${Object.values(stat)[0].moves}수까지`);
}
const out: string[] = [`게임 ${games.length}판, 깊이 10, 엔진 1개`];
const baseMs = stat['기본'].ms;
for (const [name, s] of Object.entries(stat)) {
  const md = Object.entries(s.metricDiff).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`).join(', ');
  out.push(`${name}: 시간 ${(s.ms / 1000).toFixed(0)}초 (기본 대비 ${Math.round((s.ms / baseMs) * 100)}%) · 품질 같음 ${((s.qSame / s.moves) * 100).toFixed(1)}% · 위험수 기본 ${s.rBase} / 이것 ${s.rThis} / 같음 ${s.rSame}\n   유형 지표 차이(보정 표준편차 단위, 판별 평균): ${md}`);
}
console.log(out.join('\n'));
writeFileSync(process.argv[2], out.join('\n'));
engine.quit(); process.exit(0);
