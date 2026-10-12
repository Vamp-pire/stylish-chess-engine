// 유형 페이지용 실제 예시 고르기: 보정에 쓴 플레이어(익명) 중 그 유형으로 판정된 사람의 게임에서
// ① 그 유형다운 대표 수(좋은 수) ② 그 유형이 빠지기 쉬운 실수를 골라 src/data/type-examples.json으로 저장한다.
// 사용: npx tsx scripts/calib/pick-examples.mts <calibrate 아티팩트의 all.jsonl>
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { buildProfile } from '../../src/core/profile';
import { chessTypeOf, TYPE_DATA } from '../../src/core/chessType';
import { STYLES, type StyleKey } from '../../src/core/styles';
import type { MoveAnalysis } from '../../src/core/analyzer';
import { createNodeEngine } from '../../test/node-engine';

interface Rec { s: Record<StyleKey, number>; r: string | null; hp: number | null; f: boolean; b: boolean; q: string | null; cp: number; wd: number; ph: string }
interface Player { id: string; band: number; elo: number; moves: Rec[] }

const players: Player[] = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const games = new Map<string, string[]>(gunzipSync(readFileSync('calib/games.jsonl.gz')).toString('utf8')
  .split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return [o.id, o.games]; }));

// ── 플레이어별 수 기록을 기보와 맞춘다 (분석된 판의 '내 수'를 순서대로 이어 붙인 것) ──
interface Move { rec: Rec; fen: string; san: string; uci: string; color: 'w' | 'b'; ply: number; elo: number; player: string; code: string; recapture: boolean }
const all: Move[] = [];
let aligned = 0, skipped = 0;
for (const p of players) {
  const pgns = games.get(p.id) ?? [];
  const mine: Omit<Move, 'rec' | 'code'>[] = [];
  for (const pgn of pgns) {
    const ch = new Chess();
    try { ch.loadPgn(pgn); } catch { continue; }
    const color = /\[White "Player"\]/.test(pgn) ? 'w' : 'b';
    const elo = Number(pgn.match(color === 'w' ? /\[WhiteElo "(\d+)"\]/ : /\[BlackElo "(\d+)"\]/)?.[1] ?? 0);
    const hist = ch.history({ verbose: true });
    hist.forEach((m, i) => {
      // 되잡기(방금 상대가 움직인 칸에서 잡기)는 누구나 두는 수라 예시에서 뺀다
      const recapture = !!m.captured && i > 0 && hist[i - 1].to === m.to;
      if (m.color === color) mine.push({ fen: m.before, san: m.san, uci: m.from + m.to + (m.promotion ?? ''), color, ply: i, elo, player: p.id, recapture });
    });
  }
  // 분석에 실패한 판이 있으면 순서가 어긋나므로 그 플레이어는 뺀다
  if (mine.length !== p.moves.length) { skipped++; continue; }
  aligned++;
  const profile = buildProfile(p.moves.map((r) => ({
    scores: r.s, risk: r.r, riskSucceeded: false, humanP: r.hp, forced: r.f, book: r.b, quality: r.q, cpLoss: r.cp,
    deep: { winDrop: r.wd }, phase: r.ph, situation: 'equal', primary: 'neutral', choiceDelta: null, color: 'w',
  })) as unknown as MoveAnalysis[]);
  profile.rating = p.elo || null;
  const t = chessTypeOf(profile);
  if (!t) continue;
  mine.forEach((m, i) => all.push({ ...m, rec: p.moves[i], code: t.code }));
}
console.log(`맞춘 플레이어 ${aligned}, 제외 ${skipped}, 수 ${all.length}`);

// ── 유형다움 점수: 글자마다 그 방향 지표의 합 ──
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
const typeScore = (code: string, r: Rec) => [...code].reduce((s, l) => s + LETTER_SCORE[l](r), 0);

const engine = await createNodeEngine();
const top3 = (r: Rec) => (Object.keys(STYLES) as StyleKey[]).filter((k) => r.s[k] >= 40).sort((a, b) => r.s[b] - r.s[a]).slice(0, 3);
const out: Record<string, unknown[]> = {};

for (const t of TYPE_DATA.types) {
  // 강제·이론·되잡기·뻔한 수(같은 레이팅 사람의 70% 이상이 두는 수)는 빼고, 메이트로 끝나는 수도 뺀다 (너무 뻔함)
  const pool = all.filter((m) => m.code === t.code && !m.rec.f && !m.rec.b && m.ply >= 12 && m.rec.hp != null
    && !m.recapture && m.rec.hp < 0.7 && !m.san.endsWith('#'));
  // ① 대표 수: 좋은 수(최선·좋은 수) 중 유형다움이 높은 것, 플레이어가 겹치지 않게 2개
  const good = pool.filter((m) => (m.rec.q === 'best' || m.rec.q === 'good') && m.rec.cp <= 30).sort((a, b) => typeScore(t.code, b.rec) - typeScore(t.code, a.rec));
  // ② 실수: 실수·블런더 중 유형다움이 높은 것 (그 유형의 습관이 실수로 이어진 경우)
  const bad = pool.filter((m) => m.rec.q === 'mistake' || m.rec.q === 'blunder').sort((a, b) => typeScore(t.code, b.rec) - typeScore(t.code, a.rec));
  const pick = (list: Move[], n: number) => {
    // 같은 플레이어·같은 수(기보 표기)는 한 번만
    const used = new Set<string>(), res: Move[] = [];
    for (const m of list) {
      if (used.has(m.player) || used.has(m.san)) continue;
      used.add(m.player); used.add(m.san); res.push(m);
      if (res.length === n) break;
    }
    return res;
  };
  const ex: unknown[] = [];
  for (const [kind, m] of [...pick(good, 2).map((m) => ['signature', m] as const), ...pick(bad, 1).map((m) => ['pitfall', m] as const)]) {
    const lines = await engine.analyse(m.fen, { depth: 16, multipv: 1 });
    const bestUci = lines[0]?.uci ?? null;
    const ch = new Chess(m.fen);
    const best = bestUci ? ch.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] })?.san : null;
    ex.push({
      kind, fen: m.fen, san: m.san, uci: m.uci, color: m.color, moveNumber: Math.floor(m.ply / 2) + 1, elo: m.elo,
      styles: top3(m.rec).map((k) => ({ key: k, label: STYLES[k].label, score: m.rec.s[k] })),
      humanP: Math.round((m.rec.hp ?? 0) * 100), risk: m.rec.r, quality: m.rec.q, lossPp: Math.round(m.rec.wd),
      best: kind === 'pitfall' && best !== m.san ? best : null, bestUci: kind === 'pitfall' && best !== m.san ? bestUci : null,
    });
  }
  out[t.code] = ex;
  console.log(t.code, pool.length, (ex as { san: string; kind: string }[]).map((e) => `${e.kind}:${e.san}`).join(' '));
}
engine.quit();
writeFileSync('src/data/type-examples.json', JSON.stringify(out, null, 1) + '\n');
