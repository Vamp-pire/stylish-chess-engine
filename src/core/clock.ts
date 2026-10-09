// 수별 시간 정보: Chess.com·Lichess 기보 주석의 [%clk h:mm:ss]와 TimeControl 헤더로 남은 시간·소요 시간을 구한다.
import type { Chess, Move } from 'chess.js';

export interface PlyClock {
  /** 수를 둔 뒤 남은 시간 (초) */
  clock: number | null;
  /** 이 수에 쓴 시간 (초, 증초 반영) */
  spent: number | null;
  /** 시간에 쫓기던 수: 수를 두기 전 남은 시간이 30초 미만이거나 처음 시간의 10% 미만 */
  lowTime: boolean | null;
}

const CLK = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/;

/** "180+2" → { base: 180, inc: 2 }. 데일리("1/86400")나 없음은 null */
export function parseTimeControl(tc: string | undefined): { base: number; inc: number } | null {
  const m = tc?.match(/^(\d+)(?:\+(\d+))?$/);
  return m ? { base: Number(m[1]), inc: Number(m[2] ?? 0) } : null;
}

export function plyClocks(chess: Chess, history: Move[], headers: Record<string, string>): PlyClock[] {
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const tc = parseTimeControl(headers.TimeControl);
  const clocks = history.map((m) => {
    const c = comments.get(m.after)?.match(CLK);
    return c ? Number(c[1]) * 3600 + Number(c[2]) * 60 + Number(c[3]) : null;
  });
  if (!tc || clocks.every((c) => c == null)) return history.map(() => ({ clock: null, spent: null, lowTime: null }));
  return history.map((_, i) => {
    const clock = clocks[i];
    const before = i >= 2 ? clocks[i - 2] : tc.base; // 같은 색의 직전 수 뒤 남은 시간
    const spent = clock != null && before != null ? Math.max(0, Math.round((before - clock + tc.inc) * 10) / 10) : null;
    const lowTime = before != null ? before < Math.max(30, tc.base * 0.1) : null;
    return { clock, spent, lowTime };
  });
}
