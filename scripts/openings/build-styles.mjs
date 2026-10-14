// analyze-styles.mts 결과(JSONL)를 합쳐 public/opening-styles.json을 만든다. 키는 "ECO\t이름"(public/openings.json의 names와 같음).
// 이론 수의 수별 스타일은 대부분 '활동적'(기물 전개)이라 오프닝끼리 잘 안 갈린다 → 색별 전체 평균(mean)을 같이 저장해 화면은 '다른 오프닝보다' 두드러진 점을 보여준다.
// 깊이 10은 폰 갬빗을 보상이 있어 희생으로 잘 안 잡으므로(이름에 Gambit인 1,182개 중 186개), 이름에 Gambit이 있고 수순 끝에 기물 점수가 모자란 쪽을 갬빗 쪽(g)으로 표시한다.
// 사용: node scripts/openings/build-styles.mjs <opening-lines.json> <jsonl 파일들...>
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const KEYS = ['aggressive', 'tactical', 'initiative', 'counterattack', 'positional', 'prophylactic', 'restriction', 'active', 'space', 'tension',
  'solid', 'defensive', 'simplifying', 'complicating', 'quiet', 'waiting', 'practical', 'kingActivity', 'passedPawn'];
const RISKS = ['soundSacrifice', 'speculative', 'trap', 'gamble'];
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const { names } = JSON.parse(readFileSync('public/openings.json', 'utf8'));
const lines = new Map(JSON.parse(readFileSync(process.argv[2], 'utf8')).map((x) => [x.i, x.pgn]));

/**
 * 갬빗 쪽: 수순 중 한쪽이 기물 점수가 모자란 상태로 2수(반수) 이상 이어지면(곧바로 되찾지 않음) 그쪽.
 * 그런 구간이 없고 이름에 Gambit이 있으면(Declined 제외) 마지막 수를 둔 쪽 = 폰을 막 내놓은 쪽 (예: 에반스 4.b4, 벤코 3...b5)
 */
function gambitSide(pgn, name) {
  if (!/gambit/i.test(name)) return null;
  const ch = new Chess();
  ch.loadPgn(pgn);
  const moves = ch.history();
  const replay = new Chess();
  const bal = [];
  for (const san of moves) {
    replay.move(san);
    let d = 0;
    for (const row of replay.board()) for (const sq of row) if (sq) d += (sq.color === 'w' ? 1 : -1) * VAL[sq.type];
    bal.push(d);
  }
  for (let k = 1; k < bal.length; k++) {
    if (bal[k] < 0 && bal[k - 1] < 0) return 'w';
    if (bal[k] > 0 && bal[k - 1] > 0) return 'b';
  }
  if (bal.at(-1) < 0) return 'w';
  if (bal.at(-1) > 0) return 'b';
  if (/declined/i.test(name) && !/countergambit/i.test(name)) return null; // 거절한 쪽의 역갬빗(알빈 등)은 갬빗
  return moves.length % 2 === 1 ? 'w' : 'b';
}

const styles = {};
const sum = { w: KEYS.map(() => 0), b: KEYS.map(() => 0) }, cnt = { w: 0, b: 0 };
let n = 0, gambits = 0;
for (const f of process.argv.slice(3)) {
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const { i, w, b } = JSON.parse(line);
    const name = names[i][1];
    const g = lines.get(i) ? gambitSide(lines.get(i), name) : null;
    const side = (x, c, g) => {
      if (!x) return null;
      x.s.forEach((v, k) => { sum[c][k] += v; });
      cnt[c]++;
      if (g) gambits++;
      return [x.n, x.s, x.r, g ? 1 : 0];
    };
    styles[names[i].join('\t')] = [side(w, 'w', g === 'w'), side(b, 'b', g === 'b')];
    n++;
  }
}
const mean = { w: sum.w.map((v) => Math.round(v / (cnt.w || 1))), b: sum.b.map((v) => Math.round(v / (cnt.b || 1))) };
writeFileSync('public/opening-styles.json', JSON.stringify({ source: 'lichess-org/chess-openings (CC0), depth 10 + Maia3 1500', keys: KEYS, risks: RISKS, mean, styles }));
console.log(`오프닝 ${names.length}개 중 ${n}개, 갬빗 쪽 ${gambits}개`);
