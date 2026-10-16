// 명예의 전당: scripts/hof/players.json의 선수들이 Chess.com에 공개한 최근 대국을 모은다 (Chess.com 공개 API).
// 시간대(불릿·블리츠·래피드)마다 최근 GAMES판까지, 레이팅 게임·표준 체스·40~160수짜리만.
// 보정 분석기(scripts/calib/analyze.mts)가 그대로 읽도록, 선수 쪽 이름을 "Player"로 바꾸고 CHUNK판씩 나눠 저장한다
// (분석을 여러 러너에 고르게 나누려고). 사이트 헤더(Chess.com)는 남겨 레이팅 환산·Maia가 Chess.com으로 알아보게 한다.
// 사용: node scripts/hof/collect.mjs <out.jsonl.gz> [시간대당 판수=150] [묶음 크기=15]
import { readFileSync, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';

const out = process.argv[2];
const GAMES = Number(process.argv[3] ?? 150);
const CHUNK = Number(process.argv[4] ?? 15);
const MIN_GAMES = 30; // 이보다 적은 시간대는 뺀다
const CLASSES = ['bullet', 'blitz', 'rapid'];
const UA = 'Stylish chess style analysis (https://stylish-chess-engine.pages.dev; hall of fame research)';
const players = JSON.parse(readFileSync(new URL('./players.json', import.meta.url), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status === 429) { await sleep(5000 * (t + 1)); continue; }
    throw new Error(`${r.status} ${url}`);
  }
  throw new Error(`429 ${url}`);
}
/** 보정 데이터와 같은 기준으로 시간대 구분 (기본 시간 + 40 × 증가 시간) */
function timeClass(tc) {
  const m = String(tc ?? '').match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const est = Number(m[1]) + 40 * Number(m[2] ?? 0);
  return est < 30 ? null : est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : null;
}
const plies = (pgn) => (pgn.split(/\n\n/).slice(1).join(' ').replace(/\{[^}]*\}/g, '').replace(/\d+\.(\.\.)?/g, '').match(/[a-hKQRBNO][^\s]*/g) ?? []).length;

const gz = createGzip();
gz.pipe(createWriteStream(out));
const summary = [];
for (const p of players) {
  const { archives } = await get(`https://api.chess.com/pub/player/${p.user}/games/archives`);
  const got = { bullet: [], blitz: [], rapid: [] };
  for (const url of [...archives].reverse()) {
    if (CLASSES.every((c) => got[c].length >= GAMES)) break;
    const { games } = await get(url);
    for (const g of [...games].reverse()) {
      if (g.rules !== 'chess' || !g.rated || !g.pgn || /\[FEN /.test(g.pgn)) continue;
      const cls = timeClass(g.time_control);
      if (!cls || got[cls].length >= GAMES) continue;
      const side = g.white?.username?.toLowerCase() === p.user.toLowerCase() ? 'White' : g.black?.username?.toLowerCase() === p.user.toLowerCase() ? 'Black' : null;
      if (!side) continue;
      const n = plies(g.pgn);
      if (n < 40 || n > 160) continue;
      // 선수 쪽 이름만 "Player"로 (분석기가 이 이름으로 색을 찾는다)
      const pgn = g.pgn.replace(new RegExp(`\\[${side} "[^"]*"\\]`), `[${side} "Player"]`);
      got[cls].push(pgn);
    }
    await sleep(300);
  }
  for (const cls of CLASSES) {
    const list = got[cls];
    if (list.length < MIN_GAMES) continue;
    for (let i = 0; i < list.length; i += CHUNK) {
      gz.write(JSON.stringify({ id: `${p.id}~${cls}~${i / CHUNK}`, band: 0, cls, games: list.slice(i, i + CHUNK) }) + '\n');
    }
  }
  summary.push(`${p.id}: ${CLASSES.map((c) => `${c} ${got[c].length}`).join(', ')}`);
  console.log(summary.at(-1));
}
gz.end();
