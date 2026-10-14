// public/openings.json의 이름 순서대로 각 오프닝의 대표 수순(그 이름이 처음 나온 행)을 opening-lines.json으로 저장한다.
// 사용: node scripts/openings/lines.mjs [out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const { names } = JSON.parse(readFileSync('public/openings.json', 'utf8'));
const first = new Map();
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(BASE + f + '.tsv');
  if (!res.ok) throw new Error(`${f}.tsv: HTTP ${res.status}`);
  for (const row of (await res.text()).trim().split('\n').slice(1)) {
    const [eco, name, pgn] = row.split('\t');
    const id = `${eco}\t${name}`;
    if (!first.has(id)) first.set(id, pgn);
  }
}
const out = names.map(([eco, name], i) => ({ i, pgn: first.get(`${eco}\t${name}`) })).filter((x) => x.pgn);
writeFileSync(process.argv[2] ?? 'opening-lines.json', JSON.stringify(out));
console.log(`오프닝 ${names.length}개 중 수순 ${out.length}개`);
