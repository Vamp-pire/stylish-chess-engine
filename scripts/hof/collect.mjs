// 명예의 전당: scripts/hof/players.json의 선수들이 Chess.com에 공개한 최근 대국을 모은다 (Chess.com 공개 API).
// 시간대(불릿·블리츠·래피드)마다 최근 GAMES판까지, 레이팅 게임·표준 체스·40~160수짜리만.
// 보정 분석기(scripts/calib/analyze.mts)가 그대로 읽도록, 선수 쪽 이름을 "Player"로 바꾸고 CHUNK판씩 나눠 저장한다
// (분석을 여러 러너에 고르게 나누려고). 사이트 헤더(Chess.com)는 남겨 레이팅 환산·Maia가 Chess.com으로 알아보게 한다.
// 사용: node scripts/hof/collect.mjs <out.jsonl.gz> [시간대당 판수=150] [묶음 크기=15] [이미 모은 대국 파일...]
// 판 수를 늘릴 때는 이미 모은 대국 파일(이전 hof-games.jsonl.gz)을 넘기면 그 판들(대국 주소 기준)은 빼고 새 판만 모은다.
// 새 묶음은 build-hof에서 이전 결과와 합친다.
import { readFileSync, createWriteStream } from 'node:fs';
import { createGzip, gunzipSync } from 'node:zlib';

const out = process.argv[2];
const GAMES = Number(process.argv[3] ?? 150);
const CHUNK = Number(process.argv[4] ?? 15);
// 이미 모은 대국(주소)은 뺀다
const done = new Set();
for (const f of process.argv.slice(5)) {
  for (const l of gunzipSync(readFileSync(f)).toString('utf8').split('\n')) {
    if (!l.trim()) continue;
    for (const pgn of JSON.parse(l).games) { const link = pgn.match(/\[Link "([^"]*)"\]/)?.[1]; if (link) done.add(link); }
  }
}
const TAG = done.size ? `x${Date.now().toString(36)}` : 'a'; // 묶음 구분 (합칠 때 id가 겹치지 않게)
if (done.size) console.log(`이미 모은 대국 ${done.size}판은 뺀다`);
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
    if (r.status === 404) return null; // 그달 대국 목록이 없거나 일시적으로 안 열림 → 건너뛴다
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
    const month = await get(url);
    if (!month) continue;
    const { games } = month;
    for (const g of [...games].reverse()) {
      if (g.rules !== 'chess' || !g.rated || !g.pgn || /\[FEN /.test(g.pgn)) continue;
      const cls = timeClass(g.time_control);
      if (!cls || got[cls].length >= GAMES) continue;
      const side = g.white?.username?.toLowerCase() === p.user.toLowerCase() ? 'White' : g.black?.username?.toLowerCase() === p.user.toLowerCase() ? 'Black' : null;
      if (!side) continue;
      const n = plies(g.pgn);
      if (n < 40 || n > 160) continue;
      if (done.has(g.url) || done.has(g.pgn.match(/\[Link "([^"]*)"\]/)?.[1])) continue; // 이미 분석한 판
      // 선수 쪽 이름만 "Player"로 (분석기가 이 이름으로 색을 찾는다)
      const pgn = g.pgn.replace(new RegExp(`\\[${side} "[^"]*"\\]`), `[${side} "Player"]`);
      got[cls].push(pgn);
    }
    await sleep(300);
  }
  for (const cls of CLASSES) {
    const list = got[cls];
    if (list.length < (done.size ? 1 : MIN_GAMES)) continue;
    for (let i = 0; i < list.length; i += CHUNK) {
      gz.write(JSON.stringify({ id: `${p.id}~${cls}~${TAG}-${i / CHUNK}`, band: 0, cls, games: list.slice(i, i + CHUNK) }) + '\n');
    }
  }
  summary.push(`${p.id}: ${CLASSES.map((c) => `${c} ${got[c].length}`).join(', ')}`);
  console.log(summary.at(-1));
}
gz.end();
