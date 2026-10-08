// Lichess chess-openings (CC0) → public/openings.json
// 국면(배치·차례·캐슬링) 해시 → 오프닝 이름 인덱스. 수순이 바뀌어 같은 국면에 와도 인식된다.
// 사용법: node scripts/build-openings.mjs
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { positionKey } from '../src/core/openingKey.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const names = []; // [eco, name]
const nameIndex = new Map();
const byPos = new Map(); // key → { idx, depth }

for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(BASE + f + '.tsv');
  if (!res.ok) throw new Error(`${f}.tsv: HTTP ${res.status}`);
  const rows = (await res.text()).trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    if (!/^[A-E]\d\d$/.test(eco) || !name || !pgn) continue;
    const ch = new Chess();
    try { ch.loadPgn(pgn); } catch { console.warn('skip', eco, name); continue; }
    const id = `${eco}\t${name}`;
    if (!nameIndex.has(id)) { nameIndex.set(id, names.length); names.push([eco, name]); }
    const idx = nameIndex.get(id);
    // 이 변화의 모든 중간 국면을 이론으로 등록한다. 이름은 그 국면에서 끝나는 변화가 우선
    const replay = new Chess();
    const moves = ch.history();
    moves.forEach((san, i) => {
      replay.move(san);
      const key = positionKey(replay.fen());
      const isEnd = i === moves.length - 1;
      const prev = byPos.get(key);
      if (isEnd) {
        if (!prev || !prev.exact) byPos.set(key, { idx, exact: true });
      } else if (!prev) {
        byPos.set(key, { idx, exact: false });
      }
    });
  }
}

const positions = {};
for (const [k, v] of byPos) positions[k] = v.exact ? v.idx : -1 - v.idx; // 음수 = 정확한 이름이 아닌 상위 변화 이름
writeFileSync('public/openings.json', JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', names, positions }));
console.log(`names ${names.length}, positions ${byPos.size}`);
