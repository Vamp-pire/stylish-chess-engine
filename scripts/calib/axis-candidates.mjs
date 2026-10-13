// 축 후보 비교: 축 = (앞 글자 쪽 지표들의 표준점수 평균) − (뒤 글자 쪽 평균). 지금 정의와 후보 정의의 반분 신뢰도를 비교한다.
// 표준점수는 시간대별 레이팅 회귀 잔차를 그 표준편차로 나눈 값. 사용: node scripts/calib/axis-candidates.mjs <분석 결과 jsonl...>
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// 지표 이름: 'avg:<스타일>' (평균 점수), 'ch:<스타일>' (비슷한 대안 대비 선택 성향), 'risk', 'rare'
const CANDIDATES = {
  '현재 AP': { plus: ['avg:aggressive', 'avg:tactical'], minus: ['avg:positional', 'avg:prophylactic'] },
  '후보 AP': { plus: ['avg:aggressive', 'avg:tactical', 'ch:aggressive', 'ch:tactical'], minus: ['avg:space', 'ch:space', 'avg:tension', 'ch:tension'] },
  '현재 WS': { plus: ['avg:complicating', 'risk'], minus: ['avg:solid', 'avg:simplifying'] },
  '후보 WS': { plus: ['avg:complicating', 'ch:complicating'], minus: ['avg:solid', 'ch:solid', 'avg:simplifying', 'ch:simplifying'] },
  '현재 IR': { plus: ['avg:initiative'], minus: ['avg:defensive'] },
  '후보 IR': { plus: ['avg:initiative', 'ch:initiative', 'avg:active', 'ch:active'], minus: ['avg:defensive', 'ch:defensive'] },
  '현재 OE': { plus: ['rare'], minus: [] },
  '후보 OE': { plus: ['rare', 'maiaLow'], minus: [] },
};
const NEED = [...new Set(Object.values(CANDIDATES).flatMap((d) => [...d.plus, ...d.minus]))];

function raw(moves) {
  const c = moves.filter((m) => !m.f && !m.b);
  if (c.length < 10) return null;
  const cd = c.filter((m) => m.cd);
  const hp = c.filter((m) => m.hp != null);
  const v = {};
  for (const k of NEED) {
    const [kind, s] = k.split(':');
    if (kind === 'avg') v[k] = c.reduce((t, m) => t + (m.s?.[s] ?? 0), 0) / c.length;
    else if (kind === 'ch') v[k] = cd.length ? cd.reduce((t, m) => t + (m.cd[s] ?? 0), 0) / cd.length : 0;
    else if (k === 'risk') v[k] = moves.filter((m) => m.r).length / c.length;
    else if (k === 'rare') v[k] = hp.length ? hp.filter((m) => m.hp < 0.1).length / hp.length : 0;
    else if (k === 'maiaLow') v[k] = hp.length ? -hp.reduce((t, m) => t + m.hp, 0) / hp.length : 0; // Maia 확률 평균이 낮을수록 독창
  }
  return v;
}

const rows = [];
for (const f of process.argv.slice(2)) for await (const line of createInterface({ input: createReadStream(f), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const p = JSON.parse(line);
  if (p.moves?.[0]?.gi == null) continue;
  const half = (lo, hi) => raw(p.moves.filter((m) => m.gi >= lo && m.gi < hi));
  const h = { a: half(0, 5), b: half(5, 10), all: half(0, 10) };
  // 판 수별 재현율용: 앞 k판 vs 뒤 k판
  const k = {}; for (let n = 1; n <= 5; n++) k[n] = { a: half(0, n), b: half(5, 5 + n) };
  if (h.a && h.b && h.all) rows.push({ cls: p.cls, elo: p.elo || 1500, h, k });
}

/** 시간대별 레이팅 회귀 (전체 10판 값으로 기대값·표준편차를 정한다) */
const fits = {};
for (const cls of new Set(rows.map((r) => r.cls))) {
  const rs = rows.filter((r) => r.cls === cls);
  fits[cls] = {};
  for (const key of NEED) {
    const xs = rs.map((r) => r.elo), ys = rs.map((r) => r.h.all[key]);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
    const res = ys.map((y, i) => y - (my + b * (xs[i] - mx)));
    const sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length) || 1;
    fits[cls][key] = { mx, my, b, sd };
  }
}
const z = (r, v, key) => { const f = fits[r.cls][key]; return (v[key] - (f.my + f.b * (r.elo - f.mx))) / f.sd; };
const axis = (r, v, d) => {
  const m = (ks) => (ks.length ? ks.reduce((s, k) => s + z(r, v, k), 0) / ks.length : 0);
  return m(d.plus) - m(d.minus);
};
const corr = (x, y) => {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let s = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return s / Math.sqrt(sx * sy);
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const sb = (r, k) => (k * r) / (1 + (k - 1) * r);
const agreeOf = (r) => 0.5 + Math.asin(r) / Math.PI;

console.log(`플레이어 ${rows.length}명`);
for (const [name, d] of Object.entries(CANDIDATES)) {
  const a = rows.map((r) => axis(r, r.h.a, d)), b = rows.map((r) => axis(r, r.h.b, d));
  const r5 = corr(a, b);
  // 실제 재현율: 앞 5판 / 뒤 5판 글자가 같은 비율 (중앙값 기준)
  const ma = median(a), mb = median(b);
  const same = rows.filter((_, i) => (a[i] >= ma) === (b[i] >= mb)).length / rows.length;
  console.log(`${name.padEnd(6)} 5판 신뢰도 ${r5.toFixed(2)} (실제 같은 글자 ${Math.round(same * 100)}%) → 추정 10판 ${sb(r5, 2).toFixed(2)}/${Math.round(agreeOf(sb(r5, 2)) * 100)}% · 20판 ${sb(r5, 4).toFixed(2)}/${Math.round(agreeOf(sb(r5, 4)) * 100)}% · 40판 ${sb(r5, 8).toFixed(2)}/${Math.round(agreeOf(sb(r5, 8)) * 100)}%`);
}
