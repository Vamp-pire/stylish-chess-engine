// '자연스러운 수' 순위: 사람이 먼저 떠올릴 법한 수일수록 점수가 높다.
// 나중에 Maia 같은 사람 수 예측 모델로 바꿀 수 있도록 이 파일 하나로 분리해 둔다.
import { Position, P, K, mFrom, mTo, mPromo } from '../search/position';

const VAL = [0, 1, 3, 3.2, 5, 9, 0];

export interface NaturalMove { uci: string; score: number; reason: string; tempting: boolean }

/**
 * @param fen     둘 차례인 쪽 기준 국면
 * @param lastTo  방금 상대가 움직인 칸 (미끼로 던져진 기물이 있을 수 있는 칸)
 */
export function rankNaturalMoves(fen: string, lastTo: string | null): NaturalMove[] {
  const pos = Position.fromFen(fen);
  const b = pos.board;
  const them = pos.side ^ 1;
  const lastSq = lastTo ? (Number(lastTo[1]) - 1) * 16 + (lastTo.charCodeAt(0) - 97) : -1;
  const out: NaturalMove[] = [];
  for (const m of pos.legalMoves()) {
    const from = mFrom(m), to = mTo(m);
    const mover = b[from] & 7, victim = b[to] & 7;
    const defended = pos.attacked(to, them); // 잡은 뒤 되잡힐 수 있는가
    let score = 0, reason = '기타', tempting = false;
    const goodCapture = victim && (!defended || VAL[victim] >= VAL[mover] - 0.5);
    if (victim && to === lastSq && goodCapture) {
      score = 900 + VAL[victim] * 10 - VAL[mover]; reason = '방금 온 기물 잡기'; tempting = true;
    } else if (mPromo(m)) {
      score = 850; reason = '승격'; tempting = true;
    } else if (goodCapture) {
      score = 600 + VAL[victim] * 10 - VAL[mover]; reason = '이득 보는 잡기'; tempting = true;
    } else if (victim) {
      score = 100; reason = '손해 보는 잡기';
    } else if (mover !== P && mover !== K && pos.attacked(from, them)) {
      // 공격받는 기물 피하기: 수비가 없거나 폰에게 공격받을 때
      const ownDefended = pos.attacked(from, pos.side);
      if (!ownDefended || attackedByPawn(pos, from, them)) { score = 400 + VAL[mover] * 5; reason = '공격받는 기물 피하기'; }
    }
    pos.make(m);
    // 체크는 체크한 기물이 안전할 때만 솔깃한 수다 (그냥 잃는 체크는 사람도 잘 안 둔다)
    if (pos.inCheck() && (!pos.attacked(to, pos.side) || VAL[victim] >= VAL[mover])) {
      score = Math.max(score, 500) + 50;
      if (reason === '기타') reason = '체크';
      tempting = true;
    }
    pos.unmake();
    out.push({ uci: pos.toUci(m), score, reason, tempting });
  }
  return out.sort((a, c) => c.score - a.score);
}

function attackedByPawn(pos: Position, s: number, bySide: number) {
  const pd = bySide ? 16 : -16;
  const pawn = P | (bySide ? 8 : 0);
  return [pd - 1, pd + 1].some((d) => { const t = s + d; return !(t & 0x88) && pos.board[t] === pawn; });
}
