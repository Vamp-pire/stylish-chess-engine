// 유명 선수 프로필 만들기 (닮은 선수 찾기용). 평소 테스트에서는 건너뛴다.
// BUILD_MASTERS=1 MASTERS_DIR=pgn폴더 MASTERS_OUT=결과폴더 [PLAYERS=Karpov,Tal] npx vitest run test/masters.build.test.ts
// pgn폴더에는 <성>.pgn 파일을 둔다. 각 선수의 게임 중 날짜순 뒤쪽 70%에서 고르게 GAMES판을 골라 깊이 10으로 분석한다.
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createNodeEngine, loadNodeBook } from './node-engine';
import { analyzeGame } from '../src/core/analyzer';
import { mergeProfiles, type PlayerProfile } from '../src/core/profile';

const enabled = process.env.BUILD_MASTERS === '1';
const dir = process.env.MASTERS_DIR ?? '';
const out = process.env.MASTERS_OUT ?? 'masters-out';
const GAMES = Number(process.env.GAMES ?? 24);
const DEPTH = Number(process.env.DEPTH ?? 10);

const header = (pgn: string, key: string) => pgn.match(new RegExp(`\\[${key} "([^"]*)"\\]`))?.[1] ?? '';

function pickGames(text: string, surname: string) {
  const games = text.replace(/\r/g, '').split(/\n(?=\[Event )/).map((g) => g.trim()).filter(Boolean)
    .filter((g) => !/\[FEN /.test(g) && !/\[Variant /.test(g))
    .map((g) => {
      const side = header(g, 'White').toLowerCase().includes(surname) ? 'w' : header(g, 'Black').toLowerCase().includes(surname) ? 'b' : null;
      const plies = (g.split(/\n\n/).slice(1).join(' ').replace(/\{[^}]*\}/g, '').match(/[a-hKQRBNO][^\s]*/g) ?? []).length;
      return { pgn: g, side, date: header(g, 'Date'), plies };
    })
    .filter((g) => g.side && g.plies >= 40 && g.plies <= 160)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pool = games.slice(Math.floor(games.length * 0.3));
  const step = pool.length / GAMES;
  return Array.from({ length: Math.min(GAMES, pool.length) }, (_, i) => pool[Math.floor(i * step)]);
}

describe.skipIf(!enabled)('유명 선수 프로필 만들기', () => {
  const files = enabled ? readdirSync(dir).filter((f) => f.endsWith('.pgn')) : [];
  const only = process.env.PLAYERS?.split(',').map((s) => s.trim().toLowerCase());
  for (const f of files) {
    const name = f.replace(/\.pgn$/, '');
    if (only && !only.includes(name.toLowerCase())) continue;
    it(name, async () => {
      const engine = await createNodeEngine();
      const book = loadNodeBook();
      const picked = pickGames(readFileSync(join(dir, f), 'utf8'), name.toLowerCase());
      const profiles: PlayerProfile[] = [];
      for (const g of picked) {
        try {
          const a = await analyzeGame(g.pgn, engine, { depth: DEPTH, book });
          profiles.push(a.profiles[g.side as 'w' | 'b']);
        } catch (e) { console.log(name, '분석 실패', String(e).slice(0, 80)); }
      }
      engine.quit();
      const merged = mergeProfiles(profiles)!;
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${name}.json`), JSON.stringify({ name, games: profiles.length, profile: merged }));
      console.log(`${name}: ${profiles.length}판, ${merged.archetype.name}, 정확도 ${merged.accuracy}`);
    }, 3_600_000);
  }
});
