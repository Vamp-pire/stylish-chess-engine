// 유형 장면이 체스적으로 말이 되는지 검사한다 (Stockfish + chess.js).
// 장면은 판 일부만 그린 그림이라 전체 평가값(물질 차이)은 보지 않고, 그림이 말하는 '국지적 주장'만 확인한다.
// 5×5 장면을 실제 판(a1~e5)에 올리고, 없는 킹은 장면 밖 안전한 칸에 둔다.
//  - 초록 화살표(내 행동): 둘 수 있는 수이거나(빈칸·상대 기물), 상대 킹을 실제로 공격하는 선이어야 한다.
//    수라면 그 뒤 상대 최선 수순(4수)에서 내가 물질을 잃지 않아야 한다.
//  - 빨강 ✕(막힌 위협): 상대가 그 수를 둘 수 없거나, 두면 상대가 물질을 잃어야 한다.
//  - 빨강(위협): 상대가 실제로 그 칸을 노리고 있어야 한다.
//  - ✕가 있는 '막는 장면'은 상대 차례에 상대가 물질을 따내거나 메이트하는 수가 없어야 한다.
// 사용: npx tsx scripts/check-scenes.mts [유형코드...]   (문제가 있으면 종료 코드 1)
import { Chess, type Square } from 'chess.js';
import { SCENES } from './type-scenes.mjs';
import { createNodeEngine } from '../test/node-engine';

type Arrow = { from: string; to: string; c: 'g' | 'r'; cut?: boolean; guard?: boolean; played?: boolean };
type Scene = { pieces: [string, string][]; ghost?: [string, string][]; arrows?: Arrow[] };

const DEPTH = 14, PLIES = 6;
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const only = process.argv.slice(2);
const engine = await createNodeEngine();

function material(ch: Chess, color: 'w' | 'b') {
  let s = 0;
  for (const row of ch.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
/** fen에서 엔진 최선 수순을 PLIES수 따라가며 잡은 기물 값으로 color의 물질 변화를 센다 (장면은 판 일부라 승진은 무시) */
async function lineResult(fen: string, color: 'w' | 'b') {
  const ch = new Chess(fen);
  if (ch.isCheckmate()) return { delta: 0, san: [] as string[], mateFor: ch.turn() === 'w' ? 'b' : 'w' };
  const [l] = await engine.analyse(fen, { depth: DEPTH, multipv: 1 });
  const san: string[] = [];
  let delta = 0;
  for (const u of (l?.pv ?? []).slice(0, PLIES)) {
    let m;
    try { m = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] ?? 'q' }); } catch { break; }
    san.push(m.san);
    if (m.captured) delta += (m.color === color ? 1 : -1) * VAL[m.captured];
  }
  const tomove = fen.split(' ')[1];
  const mateFor = l?.mate != null ? ((l.mate > 0) ? tomove : (tomove === 'w' ? 'b' : 'w')) : null;
  return { delta, san, mateFor };
}

function fenOf(scene: Scene, turn: 'w' | 'b'): string | null {
  const board: Record<string, string> = {};
  for (const [code, sq] of scene.pieces) board[sq] = code[0] === 'w' ? code[1] : code[1].toLowerCase();
  const toFen = (t: 'w' | 'b') => {
    let s = '';
    for (let r = 8; r >= 1; r--) {
      let e = 0;
      for (const f of 'abcdefgh') { const p = board[`${f}${r}`]; if (p) { if (e) s += e; e = 0; s += p; } else e++; }
      if (e) s += e;
      if (r > 1) s += '/';
    }
    return `${s} ${t} - - 0 1`;
  };
  const legal = (t: 'w' | 'b') => { try { new Chess(toFen(t)); return true; } catch { return false; } };
  const spots = ['h1', 'h8', 'g1', 'g8', 'h3', 'h6', 'g3', 'g6', 'f8', 'f1'];
  const needW = !Object.values(board).includes('K'), needB = !Object.values(board).includes('k');
  for (const ws of needW ? spots : [null]) for (const bs of needB ? spots : [null]) {
    if (ws && bs && ws === bs) continue;
    if ((ws && board[ws]) || (bs && board[bs])) continue;
    if (ws) board[ws] = 'K';
    if (bs) board[bs] = 'k';
    // 장면 밖에 놓은 킹은 어느 쪽 차례든 공격받지 않아야 한다
    const calm = (sq: string | null, by: 'w' | 'b') => { if (!sq) return true; try { return !new Chess(toFen(turn)).isAttacked(sq as Square, by); } catch { return false; } };
    if (legal(turn) && calm(ws, 'b') && calm(bs, 'w')) return toFen(turn);
    if (ws) delete board[ws];
    if (bs) delete board[bs];
  }
  return null;
}

/** from의 기물이 to 칸을 공격(또는 이동 가능)하는가: 차례를 그 기물 색으로 둔 국면에서 */
function attacks(fen: string, from: string, to: string) {
  const ch = new Chess(fen);
  const p = ch.get(from as Square);
  if (!p) return false;
  return ch.attackers(to as Square, p.color).includes(from as Square);
}

let problems = 0;
const say = (code: string, msg: string, bad = false) => { if (bad) problems++; console.log(`${bad ? '✗' : '·'} ${code}: ${msg}`); };

for (const [code, scene] of Object.entries(SCENES as Record<string, Scene>)) {
  if (only.length && !only.includes(code)) continue;
  const arrows = scene.arrows ?? [];
  const wFen = fenOf(scene, 'w'), bFen = fenOf(scene, 'b');
  if (!wFen && !bFen) { say(code, '실제 판으로 만들 수 없음 (킹 배치·체크 상태)', true); continue; }

  // 초록: 앞 화살표의 도착 칸(유령)에서 출발하는 화살표는 그 수를 둔 뒤 국면으로 본다
  let chainFen: string | null = null, moved: string | null = null;
  for (const a of arrows.filter((x) => x.c === 'g')) {
    // 이미 둔 수: 그림이 그 수를 둔 뒤 국면이므로, 도착 칸에 내 기물이 있는지만 본다
    if (a.played) { const ok = scene.pieces.some(([c, sq]) => c[0] === 'w' && sq === a.to); say(code, `${a.from}→${a.to} 이미 둔 수: ${ok ? '도착 칸에 기물 있음' : '도착 칸이 비어 있음'}`, !ok); continue; }
    const chained = moved && a.from === moved && chainFen;
    // 이어지는 수: 상대가 한 수 쉰 것으로 치고(차례만 넘김) 확인
    let fen = chained ? chainFen!.replace(/ b /, ' w ') : wFen;
    // 흰 차례가 불가능하면(이미 상대 킹을 공격 중인 장면) 흑 차례 국면으로 공격만 확인한다
    const base = fen ?? bFen;
    if (!base) { say(code, '국면을 만들 수 없음', true); break; }
    const ch = new Chess(base);
    const target = ch.get(a.to as Square);
    // 지키는 선(guard, 또는 내 기물로 향하는 화살표): 실제로 그 칸을 지키는가
    if (a.guard || target?.color === 'w') {
      const ok = attacks(base, a.from, a.to);
      say(code, `${a.from}→${a.to} 지킴: ${ok ? '실제로 지킴' : '지키지 못함'}`, !ok);
      continue;
    }
    if (target?.type === 'k' && target.color === 'b') {
      // 킹을 향한 선 = 공격(체크)
      const ok = attacks(base, a.from, a.to);
      say(code, `${a.from}→${a.to} 킹 공격: ${ok ? '실제로 공격함' : '공격하지 못함'}`, !ok);
      continue;
    }
    if (!fen) { say(code, `내 수 ${a.from}-${a.to}: 흰 차례 국면이 불가능 (흑 킹이 이미 체크)`, true); continue; }
    let mv;
    try { mv = new Chess(fen).move({ from: a.from, to: a.to, promotion: 'q' }); } catch { mv = null; }
    if (!mv) { say(code, `내 수 ${a.from}-${a.to}: 둘 수 없음`, true); continue; }
    ch.move({ from: a.from, to: a.to, promotion: 'q' });
    const r = await lineResult(ch.fen(), 'w');
    const bad = r.delta < -1 || r.mateFor === 'b';
    say(code, `내 수 ${mv.san}: 이후 ${r.san.join(' ')} → 내 물질 ${r.delta >= 0 ? '+' : ''}${r.delta}${r.mateFor ? ` (메이트: ${r.mateFor === 'w' ? '내가' : '상대가'})` : ''}`, bad);
    chainFen = ch.fen(); moved = a.to;
  }

  // 빨강
  const cuts = arrows.filter((x) => x.c === 'r' && x.cut);
  for (const a of arrows.filter((x) => x.c === 'r')) {
    if (!bFen) {
      const ok = !!wFen && attacks(wFen, a.from, a.to);
      say(code, `상대 위협 ${a.from}→${a.to} (내 킹이 이미 공격받는 장면): ${ok ? '실제 위협' : '위협 아님'}`, !ok || !!a.cut);
      continue;
    }
    const ch = new Chess(bFen);
    let mv;
    try { mv = ch.move({ from: a.from, to: a.to, promotion: 'q' }); } catch { mv = null; }
    if (!a.cut) {
      const ok = !!mv || attacks(bFen, a.from, a.to);
      say(code, `상대 위협 ${a.from}→${a.to}: ${ok ? '실제 위협' : '둘 수도 공격할 수도 없음'}`, !ok);
      continue;
    }
    if (!mv) { say(code, `막힌 위협 ${a.from}→${a.to}: 둘 수 없음 (막힘)`); continue; }
    const r = await lineResult(ch.fen(), 'b');
    const bad = r.delta > 0 || r.mateFor === 'b';
    say(code, `막힌 위협 ${mv.san}: 이후 ${r.san.join(' ')} → 상대 물질 ${r.delta >= 0 ? '+' : ''}${r.delta}${r.mateFor ? ` (메이트: ${r.mateFor === 'b' ? '상대가' : '내가'})` : ''}`, bad);
  }
  if (cuts.length && bFen) {
    const r = await lineResult(bFen, 'b');
    const bad = r.delta >= 2 || r.mateFor === 'b';
    say(code, `상대 차례 최선 수순 ${r.san.join(' ')} → 상대 물질 ${r.delta >= 0 ? '+' : ''}${r.delta}${r.mateFor ? ` (메이트: ${r.mateFor === 'b' ? '상대가' : '내가'})` : ''}`, bad);
  }
}
engine.quit();
console.log(problems ? `\n문제 ${problems}개` : '\n문제 없음');
process.exit(problems ? 1 : 0);
