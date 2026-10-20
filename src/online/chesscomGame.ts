// Chess.com 게임 하나 찾기: 게임 번호만으로는 기보를 주는 공식 API가 없어서,
// 두 사람 아이디와 게임이 끝난 시각으로 공개 API의 월별 게임 목록을 받아 같은 번호의 판을 찾는다 (시간 기록이 든 기보).
// 확장 프로그램·Tampermonkey·북마클릿이 Chess.com 게임 화면에서 번호·아이디·끝난 시각을 넘겨 준다.

export interface ChesscomRef { id: string; users: string[]; end: number /* 초, 0이면 모름 */ }

const validUser = (u: string | null): u is string => !!u && /^[\w-]{2,40}$/.test(u);

/** 주소의 ?cc=번호&ccw=백&ccb=흑&cct=끝난시각 읽기 */
export function readChesscomRef(q: URLSearchParams): ChesscomRef | null {
  const id = q.get('cc');
  if (!id || !/^\d{5,15}$/.test(id)) return null;
  const users = [q.get('ccw'), q.get('ccb')].filter(validUser);
  if (!users.length) return null;
  return { id, users, end: Number(q.get('cct')) || 0 };
}

/** 찾은 판의 PGN. 아직 공개 API에 반영되지 않았으면 null */
export async function findChesscomGame(ref: ChesscomRef): Promise<string | null> {
  const base = ref.end ? new Date(ref.end * 1000) : new Date();
  // 끝난 달(UTC)부터, 경계에 걸린 경우를 위해 앞뒤 달도 본다
  const months = [0, -1, 1].map((d) => {
    const t = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + d, 1));
    return `${t.getUTCFullYear()}/${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  for (const user of ref.users) {
    for (const ym of months) {
      const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/${ym}`).catch(() => null);
      if (!res || !res.ok) continue;
      const data = await res.json().catch(() => null) as { games?: { url?: string; pgn?: string }[] } | null;
      const game = data?.games?.find((g) => g.url?.endsWith(`/${ref.id}`));
      if (game?.pgn) return game.pgn;
    }
  }
  return null;
}
