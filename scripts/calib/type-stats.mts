// 유형별 통계: 보정 플레이어(calibrate 아티팩트의 all.jsonl.gz)를 유형으로 나눠
// 유형마다 비율(몇 %), 같은 레이팅 대비 지표 백분위의 평균, 정확도 평균을 src/data/type-stats.json으로 저장한다.
// 궁합·유형 페이지에서 "숫자로 보면" 비교에 쓴다.
// 사용: npx tsx scripts/calib/type-stats.mts <all.jsonl.gz>
import { createReadStream, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { buildProfile } from '../../src/core/profile';
import { chessTypeOf, peerStats, PEER_METRICS, TYPE_DATA } from '../../src/core/chessType';
import type { MoveAnalysis } from '../../src/core/analyzer';

const RARE_P = 0.1; // 같은 레이팅 10% 미만이 두는 수 = 드문 수
const sums = new Map<string, { n: number; acc: number; rare: number; m: Record<string, number> }>();
let total = 0;
for await (const line of createInterface({ input: createReadStream(process.argv[2]).pipe(createGunzip()), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const p = JSON.parse(line);
  const prof = buildProfile(p.moves.map((r: any) => ({
    scores: r.s, risk: r.r, riskSucceeded: false, humanP: r.hp, forced: r.f, book: r.b, quality: r.q, cpLoss: r.cp,
    deep: { winDrop: r.wd, expBefore: r.eb ?? 0.5 }, phase: r.ph, situation: r.si ?? 'equal', primary: 'neutral', choiceDelta: r.cd ?? null,
    color: 'w', lowTime: r.lt ?? null, openingStyle: r.os ? { scores: r.os.s, riskRate: r.os.rr } : undefined,
  })) as unknown as MoveAnalysis[]);
  prof.rating = p.elo || null;
  prof.timeClass = p.cls;
  if (prof.counted < 20) continue;
  const t = chessTypeOf(prof), ps = peerStats(prof);
  if (!t || !ps) continue;
  const hps = p.moves.filter((r: any) => !r.f && !r.b && r.hp != null).map((r: any) => r.hp);
  const s = sums.get(t.code) ?? { n: 0, acc: 0, rare: 0, m: Object.fromEntries(PEER_METRICS.map((k) => [k, 0])) };
  s.n++; s.acc += prof.accuracy; s.rare += hps.length ? hps.filter((x: number) => x < RARE_P).length / hps.length : 0;
  for (const k of PEER_METRICS) s.m[k] += ps[k].pct;
  sums.set(t.code, s);
  total++;
}
const out = {
  players: total,
  types: Object.fromEntries(TYPE_DATA.types.map((t) => {
    const s = sums.get(t.code);
    if (!s) return [t.code, null];
    return [t.code, {
      share: Math.round((s.n / total) * 1000) / 10, n: s.n, accuracy: Math.round((s.acc / s.n) * 10) / 10, rare: Math.round((s.rare / s.n) * 1000) / 10,
      peers: Object.fromEntries(PEER_METRICS.map((k) => [k, Math.round(s.m[k] / s.n)])),
    }];
  })),
};
writeFileSync('src/data/type-stats.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${total}명`, TYPE_DATA.types.map((t) => `${t.code} ${out.types[t.code]?.share ?? 0}%`).join(' '));
