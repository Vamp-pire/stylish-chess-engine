// 스타일별 대표 국면: 교과서적인 수가 기대한 스타일/위험 판정을 받는지 확인한다.
// (Stockfish 19 lite WASM, 깊이 12)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNodeEngine } from './node-engine';
import { analyzeGame, type MoveAnalysis } from '../src/core/analyzer';
import { STYLES, type StyleKey, type RiskKind } from '../src/core/styles';
import type { UciEngine } from '../src/engine/uci';

let engine: UciEngine;
beforeAll(async () => { engine = await createNodeEngine(); });
afterAll(() => engine?.quit());

/** 수순(또는 FEN + 한 수)을 분석하고 마지막 수의 결과를 돌려준다 */
async function last(moves: string, fen?: string): Promise<MoveAnalysis> {
  const pgn = fen ? `[SetUp "1"]\n[FEN "${fen}"]\n\n${moves}` : moves;
  const g = await analyzeGame(pgn, engine, { depth: 12 });
  return g.moves[g.moves.length - 1];
}

const describeMove = (m: MoveAnalysis) =>
  `${m.san}: 대표=${m.primary === 'neutral' ? '평범' : STYLES[m.primary].label}, 상위=${m.top.map((k) => `${STYLES[k].label}${m.scores[k]}`).join(' ')}, 위험=${m.risk ?? '-'} ${m.riskWhy ?? ''}`;

/** expected 중 하나라도 대표 스타일이거나 50점 이상이면 통과 */
function expectStyle(m: MoveAnalysis, expected: StyleKey[]) {
  const ok = expected.some((k) => m.primary === k || m.scores[k] >= 50);
  if (!ok) console.log('✘', describeMove(m));
  expect(ok, describeMove(m)).toBe(true);
}

/** risk: 기대 위험 판정 (배열이면 그중 하나, null이면 위험 판정이 없어야 함) */
interface Case { name: string; moves: string; fen?: string; styles?: StyleKey[]; risk?: RiskKind | RiskKind[] | null; whyIncludes?: string }

const CASES: Case[] = [
  // 공격
  { name: '그리스 선물 Bxh7+', fen: 'r1bq1rk1/pp1nbppp/2n1p3/2ppP3/3P4/2PB1N2/PP3PPP/RNBQ1RK1 w - - 0 9', moves: 'Bxh7+', styles: ['aggressive'] },
  { name: '나이트 포크 Nc7+', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', moves: 'Nc7+', styles: ['tactical'] },
  { name: '퀸을 노리는 핀 Bg5', moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5', styles: ['tactical', 'active'] },
  { name: '템포를 얻는 전개 Nc3', moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3', styles: ['initiative', 'active'] },
  { name: '스큐어 Rd1+', fen: '3q4/8/8/3k4/8/8/8/R3K3 w - - 0 1', moves: 'Rd1+', styles: ['tactical'] },
  { name: '디스커버드 어택 Nf6+', fen: '4q1k1/8/8/8/4N3/8/8/4R1K1 w - - 0 1', moves: 'Nf6+', styles: ['tactical'] },
  { name: '드래곤 유고슬라브 공격 h4', fen: 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 10', moves: 'h4', styles: ['aggressive'] },
  { name: '스콜라 메이트 노림수 Qh5', moves: '1. e4 e5 2. Qh5', styles: ['initiative', 'aggressive'] },
  { name: '트랙슬러 반격 Bc5', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Bc5', styles: ['counterattack', 'aggressive', 'initiative'] },
  { name: '시칠리안 d5 아웃포스트 Nd5', moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6 10. Nd5', styles: ['positional', 'active'] },
  { name: '오페라 게임 조용한 수 Rd1', moves: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1', styles: ['quiet', 'aggressive', 'tactical'] },
  // 위험 판정
  { name: '레갈의 함정 Nxe5', moves: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5', risk: 'trap' },
  // 낚싯대 함정: Stockfish 기준 손해가 없으므로 (도박수가 아니라) 함정수
  { name: '낚싯대 함정 h5', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Ng4 5. h3 h5', risk: 'trap' },
  // 불멸의 게임 18.Bd6: 엔진상 크게 손해지만 솔깃한 Bxg1/Bxd6을 두면 백이 이김 → 도박수
  // (블랙번 실링 갬빗 3...Nd4는 2단계 함정이라 Stockfish 기준 4.Nxe5가 정답 → 도박수로 보지 않음)
  { name: '불멸의 게임 Bd6', moves: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6', risk: 'gamble' },
  // 희생: 엔진 수순의 물질 변화로 판정 (정적 계산이 놓치는 '그냥 두는' 희생 포함)
  { name: '오페라 게임 Nxb5 (건전한 희생)', moves: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5', risk: 'soundSacrifice' },
  { name: '오페라 게임 Qb8+ (퀸 희생)', moves: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+', risk: 'soundSacrifice' },
  // 불멸의 게임 11.Rg1: 공격받던 비숍을 그냥 둔 미끼 희생. 받으면(cxb5) 손해라 함정수로 판정하고 희생임을 함께 적는다
  { name: '불멸의 게임 Rg1 (미끼 희생)', moves: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1', risk: 'trap', whyIncludes: '희생' },
  { name: '불멸의 게임 Nd5 (희생)', moves: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5', risk: ['soundSacrifice', 'speculative'] },
  // 이미 진 쪽이 어차피 잃을 물질을 잃는 수는 희생이 아니다
  { name: '오페라 게임 Qe6 (진 국면의 수비, 희생 아님)', moves: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6', risk: null },
  // 포지션
  { name: '어드밴스 프렌치 e5 (공간)', moves: '1. e4 e6 2. d4 d5 3. e5', styles: ['space'] },
  { name: '퀸스 갬빗 c4 (긴장 생성)', moves: '1. d4 d5 2. c4', styles: ['tension'] },
  { name: '긴장 유지 e6', moves: '1. d4 d5 2. c4 e6', styles: ['tension', 'solid'] },
  { name: '기물 전개 Nf3', moves: '1. e4 e5 2. Nf3', styles: ['active'] },
  { name: '열린 파일로 룩 Re1', fen: 'r2q1rk1/ppp1bppp/2n1bn2/3p4/3P4/2NBBN2/PPP2PPP/R2Q1RK1 w - - 0 9', moves: 'Re1', styles: ['positional', 'active'] },
  { name: '뒷줄 메이트 대비 h3', fen: '4r1k1/R4ppp/8/8/8/8/5PPP/6K1 w - - 0 1', moves: 'h3', styles: ['prophylactic', 'defensive'] },
  // 안전
  { name: '캐슬링 O-O', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O', styles: ['solid'] },
  { name: '공격받은 비숍 후퇴 Ba4', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4', styles: ['defensive'] },
  { name: '체크 막기 c6', fen: 'rnbqkbnr/ppp2ppp/8/1B1pp3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 3', moves: 'c6', styles: ['defensive'] },
  { name: '앞선 상황의 퀸 교환 Qxd8+', fen: '3qk3/8/8/8/8/8/8/R2QK3 w - - 0 1', moves: 'Qxd8+', styles: ['simplifying'] },
  // 엔드게임
  { name: '패스폰 전진 d5', fen: '8/8/1k6/8/3P4/8/5K2/8 w - - 0 1', moves: 'd5', styles: ['passedPawn'] },
  { name: '엔드게임 킹 전진 Ke2', fen: '8/5k2/8/3p4/3P4/8/8/4K3 w - - 0 1', moves: 'Ke2', styles: ['kingActivity'] },
];

describe('스타일별 대표 국면', () => {
  for (const c of CASES)
    it(c.name, async () => {
      const m = await last(c.moves, c.fen);
      if (c.styles) expectStyle(m, c.styles);
      if (c.risk !== undefined) {
        const ok = Array.isArray(c.risk) ? c.risk.includes(m.risk!) : m.risk === c.risk;
        if (!ok) console.log('✘', describeMove(m), `cpLoss=${m.cpLoss}`);
        expect(ok, describeMove(m)).toBe(true);
      }
      if (c.whyIncludes) expect(m.riskWhy ?? '', describeMove(m)).toContain(c.whyIncludes);
    });
});
