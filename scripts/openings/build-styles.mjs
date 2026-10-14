// analyze-styles.mts 결과(JSONL)를 합쳐 public/opening-styles.json을 만든다. 키는 "ECO\t이름"(public/openings.json의 names와 같음).
// 사용: node scripts/openings/build-styles.mjs <jsonl 파일들...>
import { readFileSync, writeFileSync } from 'node:fs';

const KEYS = ['aggressive', 'tactical', 'initiative', 'counterattack', 'positional', 'prophylactic', 'restriction', 'active', 'space', 'tension',
  'solid', 'defensive', 'simplifying', 'complicating', 'quiet', 'waiting', 'practical', 'kingActivity', 'passedPawn'];
const RISKS = ['soundSacrifice', 'speculative', 'trap', 'gamble'];
const { names } = JSON.parse(readFileSync('public/openings.json', 'utf8'));
const styles = {};
let n = 0;
for (const f of process.argv.slice(2)) {
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const { i, w, b } = JSON.parse(line);
    const side = (x) => (x ? [x.n, x.s, x.r] : null);
    styles[names[i].join('\t')] = [side(w), side(b)];
    n++;
  }
}
writeFileSync('public/opening-styles.json', JSON.stringify({ source: 'lichess-org/chess-openings (CC0), depth 10 + Maia3 1500', keys: KEYS, risks: RISKS, styles }));
console.log(`오프닝 ${names.length}개 중 ${n}개`);
