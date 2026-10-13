// 지표 신뢰도: 같은 사람의 앞 5판 / 뒤 5판에서 각각 지표를 계산해 상관(반분 신뢰도)을 본다.
// 레이팅 영향을 빼려고 시간대별로 레이팅 회귀 잔차끼리 비교한다. 신뢰도가 높을수록 '판 수가 적어도 그 사람다운' 지표.
// 사용: node scripts/calib/reliability.mjs <분석 결과 jsonl...>
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const STYLES = ['aggressive', 'tactical', 'initiative', 'counterattack', 'positional', 'prophylactic', 'restriction', 'active', 'space', 'tension',
  'solid', 'defensive', 'simplifying', 'complicating', 'quiet', 'waiting', 'practical', 'kingActivity', 'passedPawn'];

/** 수 목록 → 후보 지표들 */
function metrics(moves) {
  const c = moves.filter((m) => !m.f && !m.b);
  if (c.length < 10) return null;
  const mean = (f) => c.reduce((s, m) => s + f(m), 0) / c.length;
  const out = {};
  for (const k of STYLES) {
    out[`평균:${k}`] = mean((m) => m.s?.[k] ?? 0);
    out[`비율≥50:${k}`] = mean((m) => ((m.s?.[k] ?? 0) >= 50 ? 1 : 0));
    const cd = c.filter((m) => m.cd);
    if (cd.length >= 5) out[`선택:${k}`] = cd.reduce((s, m) => s + (m.cd[k] ?? 0), 0) / cd.length;
  }
  const hp = c.filter((m) => m.hp != null);
  if (hp.length) {
    out['드문 수(Maia<10%)'] = hp.filter((m) => m.hp < 0.1).length / hp.length;
    out['Maia 확률 평균'] = hp.reduce((s, m) => s + m.hp, 0) / hp.length;
    out['뻔한 수(Maia≥50%)'] = hp.filter((m) => m.hp >= 0.5).length / hp.length;
  }
  out['위험 판정 비율'] = moves.filter((m) => m.r).length / c.length;
  out['잡기 비율'] = mean((m) => m.x ?? 0);
  out['체크 비율'] = mean((m) => m.ck ?? 0);
  out['최선 수 비율'] = mean((m) => (m.q === 'best' ? 1 : 0));
  out['실수+블런더 비율'] = mean((m) => (m.q === 'mistake' || m.q === 'blunder' ? 1 : 0));
  out['평균 기대점수 손실'] = mean((m) => Math.min(50, m.wd ?? 0));
  const eq = c.filter((m) => m.eb != null && m.eb >= 0.3 && m.eb <= 0.7);
  if (eq.length >= 5) out['비슷한 형세에서 잡기'] = eq.reduce((s, m) => s + (m.x ?? 0), 0) / eq.length;
  return out;
}

const pairs = new Map(); // 지표 → [{cls, elo, a, b}]
let n = 0;
for (const f of process.argv.slice(2)) for await (const line of createInterface({ input: createReadStream(f), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const p = JSON.parse(line);
  if (p.moves?.[0]?.gi == null) continue;
  const a = metrics(p.moves.filter((m) => m.gi < 5)), b = metrics(p.moves.filter((m) => m.gi >= 5));
  if (!a || !b) continue;
  n++;
  for (const k of Object.keys(a)) if (k in b && Number.isFinite(a[k]) && Number.isFinite(b[k])) {
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push({ cls: p.cls, elo: p.elo || 1500, a: a[k], b: b[k] });
  }
}

const corr = (x, y) => {
  const m = x.length, mx = x.reduce((s, v) => s + v, 0) / m, my = y.reduce((s, v) => s + v, 0) / m;
  let s = 0, sx = 0, sy = 0;
  for (let i = 0; i < m; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return sx && sy ? s / Math.sqrt(sx * sy) : 0;
};
/** 시간대별로 레이팅 회귀 잔차 */
function residual(rows, pick) {
  const out = new Array(rows.length);
  for (const cls of new Set(rows.map((r) => r.cls))) {
    const idx = rows.map((r, i) => (r.cls === cls ? i : -1)).filter((i) => i >= 0);
    const xs = idx.map((i) => rows[i].elo), ys = idx.map((i) => pick(rows[i]));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const b = xs.reduce((s, x, j) => s + (x - mx) * (ys[j] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
    idx.forEach((i, j) => { out[i] = ys[j] - (my + b * (xs[j] - mx)); });
  }
  return out;
}
const sb = (r, k) => (k * r) / (1 + (k - 1) * r); // 스피어만-브라운: 판 수를 k배로 늘렸을 때
const rows = [...pairs].filter(([, v]) => v.length >= n * 0.8).map(([k, v]) => {
  const r = corr(residual(v, (x) => x.a), residual(v, (x) => x.b));
  return { k, r, r10: sb(r, 2), n: v.length };
}).sort((a, b) => b.r - a.r);
console.log(`플레이어 ${n}명. 반분 신뢰도(5판 vs 5판, 레이팅 영향 제거) → 10판 기준 추정`);
for (const x of rows) console.log(`${x.k.padEnd(26)} 5판 ${x.r.toFixed(2)}  10판 ${x.r10.toFixed(2)}  (n=${x.n})`);
