// 4글자 유형 보정 데이터 만들기: 실제 플레이어들의 분석 결과(JSONL)에서 지표 평균·표준편차와 축별 분포를 구한다.
// 입력 한 줄 = 플레이어 한 명 { name, elo, moves: [{ s: 스타일 점수, r: 위험 판정, hp: Maia 확률, f: 강제, b: 이론 }] }
// 사용: node scripts/build-type-calib.mjs <jsonl 파일들...>  → src/data/type-calib.json
// 축 정의는 src/core/chessType.ts의 AXIS_DEF와 같아야 한다.
import { readFileSync, writeFileSync } from 'node:fs';

const AXIS_DEF = {
  AP: { plus: ['aggressive', 'tactical'], minus: ['positional', 'prophylactic'] },
  WS: { plus: ['complicating', 'risk'], minus: ['solid', 'simplifying'] },
  IR: { plus: ['initiative'], minus: ['defensive'] },
  OE: { plus: ['rare'], minus: [] },
};
const METRICS = [...new Set(Object.values(AXIS_DEF).flatMap((d) => [...d.plus, ...d.minus]))];
const STYLES = METRICS.filter((m) => m !== 'risk' && m !== 'rare');
const MIN_COUNTED = 80, RARE_P = 0.1;

const players = [];
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    const counted = p.moves.filter((m) => !m.f && !m.b);
    const hps = counted.map((m) => m.hp).filter((x) => x != null);
    if (counted.length < MIN_COUNTED || hps.length < counted.length * 0.9) continue;
    // 프로필과 같은 방식: 평가 대상 수의 스타일 평균(정수), 위험 판정 수 / 평가 대상 수
    const m = {};
    for (const k of STYLES) m[k] = Math.round(counted.reduce((s, x) => s + x.s[k], 0) / counted.length);
    m.risk = (p.moves.filter((x) => x.r).length / counted.length) * 100;
    m.rare = (hps.filter((x) => x < RARE_P).length / hps.length) * 100;
    players.push({ name: p.name, elo: p.elo, band: p.band, m });
  }
}
if (players.length < 50) throw new Error(`플레이어가 너무 적습니다: ${players.length}`);

const stat = (xs) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, std: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) };
};
const metrics = Object.fromEntries(METRICS.map((k) => [k, stat(players.map((p) => p.m[k]))]));
const axisValue = (m, axis) => {
  const z = (k) => (m[k] - metrics[k].mean) / (metrics[k].std || 1);
  const mean = (ks) => (ks.length ? ks.reduce((s, k) => s + z(k), 0) / ks.length : 0);
  return mean(AXIS_DEF[axis].plus) - mean(AXIS_DEF[axis].minus);
};
const quantile = (sorted, q) => {
  const i = q * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const quantiles = {};
for (const axis of Object.keys(AXIS_DEF)) {
  const vals = players.map((p) => axisValue(p.m, axis)).sort((a, b) => a - b);
  quantiles[axis] = Array.from({ length: 101 }, (_, i) => Math.round(quantile(vals, i / 100) * 10000) / 10000);
}
const round = (x) => Math.round(x * 1000) / 1000;
const out = {
  players: players.length,
  metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { mean: round(v.mean), std: round(v.std) }])),
  quantiles,
};
writeFileSync(new URL('../src/data/type-calib.json', import.meta.url), JSON.stringify(out) + '\n');

// ── 보고: 유형 분포, 축끼리 상관, 레이팅과의 상관 ──
const letters = { AP: ['A', 'P'], WS: ['W', 'S'], IR: ['I', 'R'], OE: ['O', 'E'] };
const codeOf = (m) => Object.keys(AXIS_DEF).map((a) => (axisValue(m, a) >= quantiles[a][50] ? letters[a][0] : letters[a][1])).join('');
const dist = {};
for (const p of players) dist[codeOf(p.m)] = (dist[codeOf(p.m)] ?? 0) + 1;
console.log(`플레이어 ${players.length}명`);
console.log('유형 분포:', Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', '));
const corr = (xs, ys) => {
  const a = stat(xs), b = stat(ys);
  return xs.reduce((s, x, i) => s + (x - a.mean) * (ys[i] - b.mean), 0) / xs.length / (a.std * b.std || 1);
};
const axes = Object.keys(AXIS_DEF);
const vals = Object.fromEntries(axes.map((a) => [a, players.map((p) => axisValue(p.m, a))]));
console.log('축 상관:', axes.flatMap((a, i) => axes.slice(i + 1).map((b) => `${a}-${b} ${corr(vals[a], vals[b]).toFixed(2)}`)).join(', '));
console.log('레이팅 상관:', axes.map((a) => `${a} ${corr(vals[a], players.map((p) => p.elo)).toFixed(2)}`).join(', '));
