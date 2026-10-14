// speedab.mts 결과(JSONL)를 합쳐 기본 대비 옵션별 차이를 보고한다.
// 사용: node scripts/calib/speedab-report.mjs all.jsonl
import { readFileSync } from 'node:fs';

const CALIB = JSON.parse(readFileSync(new URL('../../src/data/type-calib.json', import.meta.url), 'utf8'));
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const names = Object.keys(rows[0]).filter((k) => k !== 'id' && k !== 'band');
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
console.log(`플레이어 ${rows.length}명 (각 약 10판), 깊이 10. base2 = 같은 설정을 한 번 더 (원래 흔들림)`);
const baseMs = rows.reduce((s, r) => s + r.base.ms, 0);
for (const n of names) {
  let ms = 0, moves = 0, qSame = 0, rBase = 0, rThis = 0, rSame = 0, codeSame = 0, letterSame = 0, coded = 0;
  const md = {}, acc = [];
  for (const r of rows) {
    const b = r.base, x = r[n];
    ms += x.ms;
    x.q.forEach((q, i) => { moves++; if (q === b.q[i]) qSame++; if (b.r[i]) rBase++; if (x.r[i]) rThis++; if (x.r[i] && x.r[i] === b.r[i]) rSame++; });
    if (b.code && x.code) { coded++; if (b.code === x.code) codeSame++; for (let i = 0; i < 4; i++) if (b.code[i] === x.code[i]) letterSame++; }
    if (b.acc != null && x.acc != null) acc.push(Math.abs(x.acc - b.acc));
    if (b.metrics && x.metrics) for (const k of Object.keys(b.metrics)) (md[k] ??= []).push(Math.abs(x.metrics[k] - b.metrics[k]) / (CALIB.metrics[k]?.std || 1));
  }
  const worst = Object.entries(md).map(([k, v]) => [k, mean(v)]).sort((a, b) => b[1] - a[1]);
  console.log(`\n${n}: 시간 ${Math.round((ms / baseMs) * 100)}% · 수 품질 같음 ${((qSame / moves) * 100).toFixed(1)}% · 위험수 기본 ${rBase} / 이것 ${rThis} / 같음 ${rSame}`);
  console.log(`  유형 네 글자 같음 ${((codeSame / coded) * 100).toFixed(1)}% · 글자별 같음 ${((letterSame / coded / 4) * 100).toFixed(1)}% · 정확도 차이 평균 ${mean(acc).toFixed(2)}점`);
  console.log(`  지표 차이(보정 표준편차 단위, 큰 순): ${worst.map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')}`);
  if (n !== 'base') console.log(`  판정 기준(지표 최대 < 0.1, 품질 같음 ≥ 95%, base2와 비교해 볼 것): ${worst[0][1] < 0.1 && qSame / moves >= 0.95 ? '통과' : '미달'}`);
}
