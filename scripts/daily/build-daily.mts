// 오늘의 유형 맞히기 문제 묶음 만들기.
// 보정에 쓴 익명 Lichess 플레이어(CC0) 중 네 축 모두 가운데에서 멀리 떨어진(유형이 뚜렷한) 사람을 골라,
// 축마다 그 글자다운 수 하나씩(모두 4수)을 뽑아 public/daily/bank.json으로 저장한다.
// 사용: npx tsx scripts/daily/build-daily.mts <calibrate 아티팩트의 all.jsonl.gz> <games 아티팩트의 games.jsonl.gz>
import { createReadStream, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { buildProfile } from '../../src/core/profile';
import { chessTypeOf, TYPE_DATA } from '../../src/core/chessType';
import { STYLES, type StyleKey } from '../../src/core/styles';
import type { MoveAnalysis } from '../../src/core/analyzer';

interface Rec { s: Record<StyleKey, number>; r: string | null; hp: number | null; f: boolean; b: boolean; q: string | null; cp: number; wd: number; ph: string }
interface Player { id: string; band: number; cls: string | null; elo: number; moves: Rec[] }

const MIN_STRENGTH = Number(process.env.MIN_STRENGTH ?? 60); // 네 축 모두 이 이상(가운데 50에서 멀리)인 사람만
const MIN_COUNTED = 120;

// 파일이 커서(수백 MB) 한 줄씩 읽는다
async function readGz<T>(f: string): Promise<T[]> {
  const out: T[] = [];
  for await (const l of createInterface({ input: createReadStream(f).pipe(createGunzip()), crlfDelay: Infinity })) if (l.trim()) out.push(JSON.parse(l));
  return out;
}
const players = await readGz<Player>(process.argv[2]);
const games = new Map<string, string[]>((await readGz<{ id: string; games: string[] }>(process.argv[3])).map((o) => [o.id, o.games]));

// 글자다움 점수 (scripts/calib/pick-examples.mts와 같은 기준)
const LETTER_SCORE: Record<string, (r: Rec) => number> = {
  A: (r) => r.s.aggressive + r.s.tactical - r.s.positional - r.s.prophylactic,
  P: (r) => r.s.positional + r.s.prophylactic + r.s.restriction - r.s.aggressive,
  W: (r) => r.s.complicating + (r.r ? 40 : 0) - r.s.solid,
  S: (r) => r.s.solid + r.s.simplifying - r.s.complicating,
  I: (r) => r.s.initiative - r.s.defensive,
  R: (r) => r.s.defensive + r.s.prophylactic + r.s.counterattack - r.s.initiative,
  O: (r) => (r.hp == null ? 0 : (1 - r.hp) * 60),
  E: (r) => (r.hp == null ? 0 : r.hp * 60),
};
const top3 = (r: Rec) => (Object.keys(STYLES) as StyleKey[]).filter((k) => r.s[k] >= 40).sort((a, b) => r.s[b] - r.s[a]).slice(0, 3);

interface Move { rec: Rec; fen: string; san: string; uci: string; color: 'w' | 'b'; ply: number; recapture: boolean }
const puzzles: unknown[] = [];
const diag = { typed: 0, extreme: 0, misaligned: 0 };
let aligned = 0;
for (const p of players) {
  const profile = buildProfile(p.moves.map((r) => ({
    scores: r.s, risk: r.r, riskSucceeded: false, humanP: r.hp, forced: r.f, book: r.b, quality: r.q, cpLoss: r.cp,
    deep: { winDrop: r.wd }, phase: r.ph, situation: 'equal', primary: 'neutral', choiceDelta: null, color: 'w',
  })) as unknown as MoveAnalysis[]);
  profile.rating = p.elo || null;
  profile.timeClass = p.cls;
  const t = chessTypeOf(profile);
  if (!t || profile.counted < MIN_COUNTED) continue;
  diag.typed++;
  if (t.axes.some((a) => a.strength < MIN_STRENGTH)) continue;
  diag.extreme++;

  // 분석 기록을 기보와 맞춘다 (분석된 판의 '내 수'를 순서대로 이어 붙인 것)
  const mine: Move[] = [];
  for (const pgn of games.get(p.id) ?? []) {
    const ch = new Chess();
    try { ch.loadPgn(pgn); } catch { continue; }
    const color = /\[White "Player"\]/.test(pgn) ? 'w' : 'b';
    const hist = ch.history({ verbose: true });
    hist.forEach((m, i) => {
      const recapture = !!m.captured && i > 0 && hist[i - 1].to === m.to;
      if (m.color === color) mine.push({ rec: p.moves[mine.length], fen: m.before, san: m.san, uci: m.from + m.to + (m.promotion ?? ''), color, ply: i, recapture });
    });
  }
  if (mine.length !== p.moves.length) { diag.misaligned++; continue; }
  aligned++;
  // 뻔한 수(강제·이론·되잡기·메이트·같은 레이팅 70% 이상이 두는 수)와 큰 실수는 빼고, 축마다 가장 그 글자다운 수
  const pool = mine.filter((m) => !m.rec.f && !m.rec.b && m.ply >= 10 && !m.recapture && !m.san.endsWith('#') && m.rec.hp != null && m.rec.hp < 0.7 && m.rec.q !== 'blunder');
  const used = new Set<string>();
  const picks = t.axes.map((a) => {
    const best = pool.filter((m) => !used.has(m.fen)).sort((x, y) => LETTER_SCORE[a.letter](y.rec) - LETTER_SCORE[a.letter](x.rec))[0];
    if (best) used.add(best.fen);
    return best;
  });
  if (picks.some((m) => !m)) continue;
  puzzles.push({
    code: t.code, elo: p.elo, cls: p.cls, pcts: t.axes.map((a) => a.pct),
    moves: picks.map((m) => ({
      fen: m!.fen, san: m!.san, uci: m!.uci, color: m!.color, n: Math.floor(m!.ply / 2) + 1,
      styles: top3(m!.rec), humanP: Math.round((m!.rec.hp ?? 0) * 100), risk: m!.rec.r,
    })),
  });
}

// 유형이 고르게 돌아가도록 섞는다: 유형별로 줄을 세워 번갈아 꺼내고, 같은 유형이 이어지지 않게
let seed = 20261017;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const byType = new Map<string, unknown[]>();
for (const z of puzzles as { code: string }[]) { if (!byType.has(z.code)) byType.set(z.code, []); byType.get(z.code)!.push(z); }
for (const list of byType.values()) list.sort(() => rand() - 0.5);
// 유형마다 문제를 전체 기간에 고르게 흩뿌린다 (드문 유형도 앞에만 몰리지 않게): k번째 문제의 자리 = (k + 난수) / 그 유형 문제 수
const order: unknown[] = [...byType.values()].flatMap((list) => list.map((z, k) => ({ z, at: (k + rand()) / list.length })))
  .sort((a, b) => a.at - b.at).map((x) => x.z);
for (let i = 1; i < order.length; i++) {
  if ((order[i] as { code: string }).code === (order[i - 1] as { code: string }).code) {
    const j = order.findIndex((z, k) => k > i && (z as { code: string }).code !== (order[i] as { code: string }).code);
    if (j > 0) [order[i], order[j]] = [order[j], order[i]];
  }
}

console.log(diag);
console.log(`플레이어 ${players.length}명 중 기보 맞춤 ${aligned}명, 문제 ${order.length}개`);
console.log(TYPE_DATA.types.map((t) => `${t.code}:${byTypeCount(t.code)}`).join(' '));
function byTypeCount(c: string) { return (puzzles as { code: string }[]).filter((z) => z.code === c).length; }
// 그날 문제만 받도록 한 문제씩 파일로 (번호 = 시작일부터 지난 날 수 % 문제 수)
rmSync('public/daily', { recursive: true, force: true });
mkdirSync('public/daily/p', { recursive: true });
order.forEach((z, i) => writeFileSync(`public/daily/p/${i}.json`, JSON.stringify(z)));
writeFileSync('public/daily/meta.json', JSON.stringify({ start: '2026-10-16', count: order.length }));
