// 유형이 몇 판이면 안정되는가: 보정 플레이어의 게임을 둘로 나눠(앞 판들 / 뒤 판들), 각각 k판씩만 써서 낸 유형 글자가
// 서로 얼마나 일치하는지 본다. 같은 사람의 두 묶음이 같은 글자를 내는 비율 = 그 판 수에서의 '재현율'.
// 사용: node scripts/calib/stability.mjs <type-calib.json> <분석 결과 jsonl...>
// 축 정의·지표 계산은 scripts/build-type-calib.mjs와 같다.
import { readFileSync } from 'node:fs';

const AXIS_DEF = {
  AP: { plus: ['aggressive', 'tactical'], minus: ['positional', 'prophylactic'] },
  WS: { plus: ['complicating', 'risk'], minus: ['solid', 'simplifying'] },
  IR: { plus: ['initiative'], minus: ['defensive'] },
  OE: { plus: ['rare'], minus: [] },
};
const STYLES = ['aggressive', 'tactical', 'positional', 'prophylactic', 'complicating', 'solid', 'simplifying', 'initiative', 'defensive'];
const [calibFile, ...files] = process.argv.slice(2);
const CAL = JSON.parse(readFileSync(calibFile, 'utf8'));
const calOf = (cls) => CAL.byClass?.[cls] ?? CAL;
const clamp = (r) => Math.max(600, Math.min(2600, r || 1500));

function metricsOf(moves) {
  const counted = moves.filter((m) => !m.f && !m.b);
  const hps = counted.map((m) => m.hp).filter((x) => x != null);
  if (!counted.length) return null;
  const m = {};
  for (const k of STYLES) m[k] = Math.round(counted.reduce((s, x) => s + x.s[k], 0) / counted.length);
  m.risk = (moves.filter((x) => x.r).length / counted.length) * 100;
  m.rare = hps.length ? (hps.filter((x) => x < 0.1).length / hps.length) * 100 : 0;
  return { m, counted: counted.length };
}
function letters(m, elo, cal) {
  return Object.keys(AXIS_DEF).map((axis) => {
    const z = (k) => (m[k] - (cal.metrics[k].a + cal.metrics[k].b * elo)) / (cal.metrics[k].std || 1);
    const mean = (ks) => (ks.length ? ks.reduce((s, k) => s + z(k), 0) / ks.length : 0);
    const v = mean(AXIS_DEF[axis].plus) - mean(AXIS_DEF[axis].minus);
    return v >= cal.quantiles[axis][50];
  });
}

const players = [];
for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const p = JSON.parse(line);
  if (!p.moves?.length || p.moves[0].gi == null) continue;
  players.push(p);
}
console.log(`플레이어 ${players.length}명 (판 번호가 기록된 결과만)`);

const axes = Object.keys(AXIS_DEF);
const rows = [];
for (let k = 1; k <= 5; k++) {
  const same = [0, 0, 0, 0], all4 = { n: 0, ok: 0 };
  let n = 0, movesSum = 0;
  for (const p of players) {
    const cal = calOf(p.cls), elo = clamp(p.elo);
    const a = metricsOf(p.moves.filter((m) => m.gi < k));
    const b = metricsOf(p.moves.filter((m) => m.gi >= 5 && m.gi < 5 + k));
    if (!a || !b) continue;
    const la = letters(a.m, elo, cal), lb = letters(b.m, elo, cal);
    la.forEach((x, i) => { if (x === lb[i]) same[i]++; });
    all4.n++; if (la.every((x, i) => x === lb[i])) all4.ok++;
    n++; movesSum += a.counted;
  }
  rows.push(`${k}판 (평가 수 약 ${Math.round(movesSum / n)}수): ${axes.map((ax, i) => `${ax} ${Math.round((same[i] / n) * 100)}%`).join(' · ')} · 네 글자 모두 ${Math.round((all4.ok / all4.n) * 100)}%`);
}
console.log('같은 사람의 두 묶음이 같은 글자를 내는 비율 (우연이면 축마다 50%, 네 글자 모두 6%)');
console.log(rows.join('\n'));
