// 유형 보정용 게임 모으기: Lichess 공개 데이터베이스(CC0, database.lichess.org) 월별 PGN의 앞부분(.pgn.zst)에서
// 시간대(불릿·블리츠·래피드) × 레이팅 구간(200점)마다 플레이어를 골라, 플레이어당 그 시간대 게임 GAMES판을 익명화해 모은다.
// 사용: node scripts/calib/collect.mjs <part.pgn.zst> <out.jsonl.gz> [구간당 인원=110] [판수=10]
// 두 번 읽는다: 1) 헤더만 세서 조건에 맞는 플레이어 고르기  2) 고른 플레이어의 게임만 꺼내기 (메모리를 아끼려고)
// 익명화: 고른 플레이어는 "Player", 상대는 "Opponent"로 바꾸고 날짜·사이트·이벤트 등 헤더는 버린다.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';

const [src, out] = process.argv.slice(2);
const PER_BAND = Number(process.argv[4] ?? 110);
const GAMES = Number(process.argv[5] ?? 10);
const BANDS = Array.from({ length: 11 }, (_, i) => 600 + i * 200); // 600~2600
const CLASSES = ['bullet', 'blitz', 'rapid'];

function timeClass(tc) {
  const m = tc?.match(/^(\d+)\+(\d+)$/);
  if (!m) return null;
  const est = Number(m[1]) + 40 * Number(m[2]);
  return est < 30 ? null : est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : null; // 울트라불릿·클래식 제외
}
const band = (elo) => BANDS.find((b) => elo >= b - 100 && elo < b + 100) ?? null;

/** PGN을 게임 단위로 읽는다: (headers, text) */
async function eachGame(onGame) {
  const z = spawn('zstd', ['-dc', src], { stdio: ['ignore', 'pipe', 'ignore'] });
  const rl = createInterface({ input: z.stdout, crlfDelay: Infinity });
  let headers = {}, lines = [], inMoves = false;
  const flush = () => { if (lines.length) onGame(headers, lines); headers = {}; lines = []; inMoves = false; };
  for await (const line of rl) {
    if (line.startsWith('[')) {
      if (inMoves) flush();
      const m = line.match(/^\[(\w+) "(.*)"\]$/);
      if (m) headers[m[1]] = m[2];
      lines.push(line);
    } else if (line.trim()) { inMoves = true; lines.push(line); }
  }
  flush();
}

const usable = (h) => h.Event?.startsWith('Rated') && h.Variant === undefined && !h.FEN && h.Termination !== 'Abandoned' &&
  /^\d+$/.test(h.WhiteElo ?? '') && /^\d+$/.test(h.BlackElo ?? '') && timeClass(h.TimeControl);

// 1) 플레이어·시간대별 게임 수와 평균 레이팅
const stats = new Map(); // `${name}|${cls}` → { n, sum }
let total = 0;
await eachGame((h) => {
  total++;
  if (!usable(h)) return;
  const cls = timeClass(h.TimeControl);
  for (const [name, elo] of [[h.White, +h.WhiteElo], [h.Black, +h.BlackElo]]) {
    const k = `${name}|${cls}`;
    const s = stats.get(k) ?? { n: 0, sum: 0 };
    s.n++; s.sum += elo;
    stats.set(k, s);
  }
});
console.error(`1차: 게임 ${total}개, 플레이어·시간대 ${stats.size}개`);

// 구간마다 조건(GAMES판 이상)을 만족하는 사람 중 무작위로 PER_BAND명 (시드 고정)
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const picked = new Map(); // key → { id, cls, band, games: [] }
const report = [];
for (const cls of CLASSES) for (const b of BANDS) {
  const cands = [...stats].filter(([k, s]) => k.endsWith(`|${cls}`) && s.n >= GAMES && band(Math.round(s.sum / s.n)) === b).map(([k]) => k);
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const take = cands.slice(0, PER_BAND);
  report.push(`${cls} ${b}: 후보 ${cands.length}, 선택 ${take.length}`);
  for (const k of take) picked.set(k, { id: `${cls[0]}${String(picked.size).padStart(5, '0')}`, cls, band: b, games: [] });
}
console.error(report.join('\n'));
stats.clear();

// 2) 고른 플레이어의 게임을 익명화해서 꺼낸다 (시계 기록이 있는 판만)
await eachGame((h, lines) => {
  if (!usable(h)) return;
  const cls = timeClass(h.TimeControl);
  const text = lines.filter((l) => !l.startsWith('[')).join(' ');
  if (!text.includes('%clk')) return;
  for (const color of ['White', 'Black']) {
    const p = picked.get(`${h[color]}|${cls}`);
    if (!p || p.games.length >= GAMES) continue;
    const moves = text.replace(/\{ \[%eval[^}]*\}/g, '').replace(/\[%eval [^\]]*\]/g, '');
    p.games.push([
      `[White "${color === 'White' ? 'Player' : 'Opponent'}"]`, `[Black "${color === 'Black' ? 'Player' : 'Opponent'}"]`,
      `[Result "${h.Result}"]`, `[WhiteElo "${h.WhiteElo}"]`, `[BlackElo "${h.BlackElo}"]`, `[TimeControl "${h.TimeControl}"]`,
      '', moves,
    ].join('\n'));
  }
});

const gz = createGzip();
gz.pipe(createWriteStream(out));
let n = 0;
for (const p of picked.values()) {
  if (p.games.length < GAMES) continue;
  gz.write(JSON.stringify({ id: p.id, cls: p.cls, band: p.band, games: p.games }) + '\n');
  n++;
}
gz.end();
console.error(`저장: 플레이어 ${n}명 → ${out}`);
