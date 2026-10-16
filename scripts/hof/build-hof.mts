// 명예의 전당 데이터 만들기: hall-of-fame 워크플로의 분석 결과(hof-all.jsonl.gz)와 모은 대국(hof-games.jsonl.gz)으로
// 선수마다 종합·시간대별 유형, 같은 레이팅 대비 두드러진 지표, 글자마다 대표 수(실제 대국 링크), 자주 둔 오프닝을 계산해
// src/data/hof.json으로 저장한다. 정적 페이지(scripts/build-pages.mjs)가 이 파일로 /hall-of-fame/ 페이지를 만든다.
// 사용: npx tsx scripts/hof/build-hof.mts <hof-all.jsonl.gz> <hof-games.jsonl.gz> [<추가 분석> <추가 대국> ...]  (판 수를 늘린 묶음을 짝지어 더 넣으면 합친다)
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { buildProfile, mergeProfiles, type PlayerProfile } from '../../src/core/profile';
import { chessTypeOf, peerStats, PEER_METRICS } from '../../src/core/chessType';
import { chesscomToLichess } from '../../src/core/rating';
import type { StyleKey } from '../../src/core/styles';
import type { MoveAnalysis } from '../../src/core/analyzer';

interface Rec {
  s: Record<StyleKey, number>; r: string | null; hp: number | null; f: boolean; b: boolean; q: string | null; cp: number; wd: number; ph: string; gi: number;
  eb?: number; cd?: number | null; si?: string; lt?: boolean | null; os?: { s: Record<StyleKey, number>; rr: number };
}
interface Shard { id: string; cls: string; elo: number; moves: Rec[] }
interface PlayerMeta { id: string; user: string; name: string; ko: string; group: string; title: string; desc: [string, string] }

async function readGz<T>(f: string): Promise<T[]> {
  const out: T[] = [];
  for await (const l of createInterface({ input: createReadStream(f).pipe(createGunzip()), crlfDelay: Infinity })) if (l.trim()) out.push(JSON.parse(l));
  return out;
}
const shards: Shard[] = [];
const gameSets = new Map<string, string[]>();
for (let i = 2; i + 1 < process.argv.length; i += 2) {
  shards.push(...await readGz<Shard>(process.argv[i]));
  for (const o of await readGz<{ id: string; games: string[] }>(process.argv[i + 1])) gameSets.set(o.id, o.games);
}
const meta: PlayerMeta[] = JSON.parse(readFileSync('scripts/hof/players.json', 'utf8'));

const toMove = (r: Rec) => ({
  scores: r.s, risk: r.r, riskSucceeded: false, humanP: r.hp, forced: r.f, book: r.b, quality: r.q, cpLoss: r.cp,
  deep: { winDrop: r.wd, expBefore: r.eb ?? 0.5 }, phase: r.ph, situation: r.si ?? 'equal', primary: 'neutral', choiceDelta: r.cd ?? null,
  color: 'w', lowTime: r.lt ?? null, openingStyle: r.os ? { scores: r.os.s, riskRate: r.os.rr } : undefined,
}) as unknown as MoveAnalysis;

// 글자다움 점수 (scripts/daily/build-daily.mts와 같은 기준)
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
const header = (pgn: string, k: string) => pgn.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? '';
const openingName = (pgn: string) => {
  const url = header(pgn, 'ECOUrl');
  const slug = url.split('/openings/')[1];
  if (!slug) return null;
  // 'Sicilian-Defense-Najdorf-Variation-6.Be3' → 'Sicilian Defense' (큰 갈래만)
  const words = slug.replace(/[-.]\d.*$/, '').split('-');
  const cut = words.findIndex((w, i) => i > 0 && /^(Defense|Defence|Opening|Game|Gambit|Attack|System)$/.test(words[i - 1]));
  return (cut > 0 ? words.slice(0, cut) : words.slice(0, 3)).join(' ');
};

interface Move { rec: Rec; fen: string; san: string; uci: string; color: 'w' | 'b'; ply: number; recapture: boolean; cls: string; link: string; opp: string }
const out: unknown[] = [];
for (const p of meta) {
  const mine = shards.filter((s) => s.id.startsWith(`${p.id}~`));
  if (!mine.length) { console.log(`${p.id}: 결과 없음`); continue; }
  const byCls = new Map<string, { profiles: PlayerProfile[]; games: number; elo: number[] }>();
  const allMoves: Move[] = [];
  const openings = { w: new Map<string, number>(), b: new Map<string, number>() };
  for (const s of mine) {
    const pgns = gameSets.get(s.id) ?? [];
    // 판(gi)마다 나눠서 프로필을 만들고 시간대별로 합친다 (사이트 종합 분석과 같은 방식)
    const games = new Map<number, Rec[]>();
    for (const r of s.moves) { if (!games.has(r.gi)) games.set(r.gi, []); games.get(r.gi)!.push(r); }
    const entry = byCls.get(s.cls) ?? { profiles: [], games: 0, elo: [] };
    for (const [gi, recs] of games) {
      const pgn = pgns[gi];
      if (!pgn) continue;
      const color = /\[White "Player"\]/.test(pgn) ? 'w' : 'b';
      const elo = Number(header(pgn, color === 'w' ? 'WhiteElo' : 'BlackElo'));
      const prof = buildProfile(recs.map(toMove));
      prof.rating = elo ? chesscomToLichess(elo) : null;
      prof.timeClass = s.cls;
      prof.ratingConverted = true;
      entry.profiles.push(prof); entry.games++; if (elo) entry.elo.push(elo);
      const op = openingName(pgn); if (op) openings[color].set(op, (openings[color].get(op) ?? 0) + 1);
      // 대표 수용: 분석 기록과 기보 맞추기
      const ch = new Chess();
      try { ch.loadPgn(pgn); } catch { continue; }
      const hist = ch.history({ verbose: true });
      const own = hist.map((m, i) => ({ m, i })).filter((x) => x.m.color === color);
      if (own.length !== recs.length) continue;
      own.forEach(({ m, i }, k) => allMoves.push({
        rec: recs[k], fen: m.before, san: m.san, uci: m.from + m.to + (m.promotion ?? ''), color, ply: i,
        recapture: !!m.captured && i > 0 && hist[i - 1].to === m.to, cls: s.cls, link: header(pgn, 'Link'),
        opp: header(pgn, color === 'w' ? 'Black' : 'White'),
      }));
    }
    byCls.set(s.cls, entry);
  }
  const typeOf = (prof: PlayerProfile | null) => {
    if (!prof || prof.counted < 20) return null;
    const t = chessTypeOf(prof);
    if (!t) return null;
    const peers = peerStats(prof);
    return { code: t.code, pcts: t.axes.map((a) => a.pct), counted: prof.counted, accuracy: prof.accuracy, rating: prof.rating, peers: peers ? Object.fromEntries(PEER_METRICS.map((k) => [k, peers[k].pct])) : null };
  };
  const classes = ['bullet', 'blitz', 'rapid'].filter((c) => byCls.has(c)).map((c) => {
    const e = byCls.get(c)!;
    const merged = mergeProfiles(e.profiles)!;
    merged.timeClass = c;
    merged.rating = e.elo.length ? chesscomToLichess(Math.round(e.elo.reduce((a, b) => a + b, 0) / e.elo.length)) : null;
    return { cls: c, games: e.games, chesscomElo: e.elo.length ? Math.round(e.elo.reduce((a, b) => a + b, 0) / e.elo.length) : null, type: typeOf(merged) };
  });
  // 대표 유형: 블리츠 기준 (시간대를 섞으면 축 기준이 어긋나고, 레이팅 환산표도 블리츠 기준이라 가장 믿을 만하다).
  // 블리츠가 없으면 판 수가 가장 많은 시간대. 시간대별 유형은 따로 보여 준다
  const mainCls = classes.find((c) => c.cls === 'blitz' && c.type) ?? [...classes].filter((c) => c.type).sort((a, b) => b.games - a.games)[0];
  const main = [mainCls?.cls ?? 'blitz'];
  const overall = mainCls?.type ?? null;
  if (!overall) { console.log(`${p.id}: 유형 없음`); continue; }
  // 글자마다 대표 수: 좋은 수(최선·좋은 수, 손실 30cp 이하) 중 그 글자다움이 가장 높은 것, 뻔한 수 제외
  const pool = allMoves.filter((m) => m.cls === main[0] && !m.rec.f && !m.rec.b && m.ply >= 12 && !m.recapture && !m.san.endsWith('#') && m.rec.hp != null && m.rec.hp < 0.7
    && (m.rec.q === 'best' || m.rec.q === 'good') && m.rec.cp <= 30);
  const used = new Set<string>();
  const signature = [...overall.code].map((letter) => {
    const m = pool.filter((x) => !used.has(x.fen)).sort((a, b) => LETTER_SCORE[letter](b.rec) - LETTER_SCORE[letter](a.rec))[0];
    if (!m) return null;
    used.add(m.fen);
    const top = (Object.keys(m.rec.s) as StyleKey[]).filter((k) => m.rec.s[k] >= 40).sort((a, b) => m.rec.s[b] - m.rec.s[a]).slice(0, 3);
    return { letter, fen: m.fen, san: m.san, uci: m.uci, color: m.color, n: Math.floor(m.ply / 2) + 1, cls: m.cls, link: m.link, opp: m.opp, styles: top, humanP: Math.round((m.rec.hp ?? 0) * 100) };
  });
  const topOpen = (mp: Map<string, number>) => [...mp].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n }));
  out.push({
    ...p, overall, mainClass: main[0], mainGames: mainCls?.games ?? 0, games: classes.reduce((s, c) => s + c.games, 0), classes, signature,
    openings: { w: topOpen(openings.w), b: topOpen(openings.b) },
  });
  console.log(`${p.id}: ${overall.code} (${classes.map((c) => `${c.cls} ${c.games}판 ${c.type?.code ?? '-'}`).join(', ')})`);
}
writeFileSync('src/data/hof.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), players: out }, null, 1) + '\n');
