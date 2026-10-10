// 코치와 두기: 수 하나 평가, 위협, 봇 수 선택 (Stockfish 19 lite WASM)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Chess } from 'chess.js';
import { createNodeEngine, loadNodeBook } from './node-engine';
import { CoachSession, chooseBotMove, BOT_STYLES, BOT_LEVELS } from '../src/core/coach';
import { commentMine, commentOpponent } from '../src/core/coachText';
import type { UciEngine } from '../src/engine/uci';

let engine: UciEngine;
beforeAll(async () => { engine = await createNodeEngine(); });
afterAll(() => engine?.quit());

const fenAfter = (moves: string) => { const c = new Chess(); for (const m of moves.split(' ')) c.move(m); return c.fen(); };

describe('코치', () => {
  it('이론 수는 오프닝 이론으로 평가', async () => {
    const s = new CoachSession(engine, 10, loadNodeBook());
    const m = await s.evaluate({ fenBefore: new Chess().fen(), uci: 'e2e4', ply: 0, prev: null });
    expect(m.book).toBe(true);
    expect(commentMine(m).title).toBe('오프닝 이론');
  });

  it('퀸을 공짜로 내주는 수는 블런더', async () => {
    const s = new CoachSession(engine, 10, null);
    // 1.e4 e5 2.Nf3 Qg5?? — 나이트가 퀸을 잡는다
    const m = await s.evaluate({ fenBefore: fenAfter('e4 e5 Nf3'), uci: 'd8g5', ply: 3, prev: null });
    expect(m.quality).toBe('blunder');
    const c = commentMine(m);
    expect(c.tone).toBe('bad');
    expect(c.text).toContain('Nxg5');
  }, 120_000);

  it('상대 수 코멘트: 블런더면 기회를 알린다', () => {
    expect(commentOpponent({ book: false, quality: 'blunder', risk: null } as never)?.title).toBe('기회예요!');
  });

  it('위협: 백 퀸이 f7을 노리는 국면', async () => {
    const s = new CoachSession(engine, 10, null);
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 — 흑 차례, 백은 Qxf7#을 노린다
    const t = await s.threat(fenAfter('e4 e5 Bc4 Nc6 Qh5'));
    expect(t?.uci).toBe('h5f7');
    expect(t!.gainCp).toBeGreaterThan(500);
  });

  it('봇: 최강은 메이트 1수를 놓치지 않는다', async () => {
    const fen = fenAfter('e4 e5 Bc4 Nc6 Qh5 Nf6');
    const mv = await chooseBotMove(engine, fen, BOT_LEVELS.length - 1, BOT_STYLES[0]);
    expect(mv).toBe('h5f7');
  });

  it('봇: 모든 레벨·스타일이 합법수를 둔다', async () => {
    const fen = fenAfter('d4 d5 c4 e6 Nc3 Nf6');
    for (let lv = 0; lv < BOT_LEVELS.length; lv += 2)
      for (const st of [BOT_STYLES[1], BOT_STYLES.at(-1)!]) {
        const mv = await chooseBotMove(engine, fen, lv, st, () => 0.5);
        expect(new Chess(fen).moves({ verbose: true }).map((m) => m.lan)).toContain(mv);
      }
  }, 120_000);
});
