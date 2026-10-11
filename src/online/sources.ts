// 아이디로 최근 게임 불러오기: Chess.com 공개 API, Lichess API (둘 다 브라우저에서 바로 호출 가능)

export type Source = 'chesscom' | 'lichess';

export interface OnlineGame {
  source: Source;
  id: string;
  url: string;
  date: number;               // ms
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null };
  result: string;             // '1-0' | '0-1' | '1/2-1/2' | '*'
  timeClass: string;          // bullet | blitz | rapid | classical | daily
  opening: string | null;
  pgn: string;
  userColor: 'w' | 'b';
}

export interface GamePage { games: OnlineGame[]; next: unknown | null }

export class SourceError extends Error {}

export const SOURCE_LABEL: Record<Source, string> = { chesscom: 'Chess.com', lichess: 'Lichess' };

const header = (pgn: string, key: string) => pgn.match(new RegExp(`\\[${key} "([^"]*)"\\]`))?.[1] ?? null;

// ───────────── Chess.com ─────────────
// 월별 아카이브를 최근부터 거꾸로 읽는다. next = 다음에 읽을 아카이브 인덱스와 목록

interface ChesscomCursor { archives: string[]; index: number }

async function chesscomJson(url: string) {
  const res = await fetch(url);
  if (res.status === 404) throw new SourceError('Chess.com에서 이 아이디를 찾을 수 없습니다.');
  if (res.status === 429) throw new SourceError('Chess.com 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  if (!res.ok) throw new SourceError(`Chess.com 응답 오류 (${res.status})`);
  return res.json();
}

async function chesscomPage(user: string, cursor: ChesscomCursor | null, want = 20): Promise<GamePage> {
  const u = user.trim().toLowerCase();
  const c = cursor ?? { archives: (await chesscomJson(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`)).archives as string[], index: -1 };
  if (c.index === -1) c.index = c.archives.length - 1;
  const games: OnlineGame[] = [];
  // Chess.com 권고에 따라 요청은 한 번에 하나씩
  while (games.length < want && c.index >= 0) {
    const month = await chesscomJson(c.archives[c.index--]);
    const list = (month.games as any[]).filter((g) => g.rules === 'chess' && g.pgn).reverse();
    for (const g of list) {
      const white = g.white.username as string, black = g.black.username as string;
      const ecoUrl = header(g.pgn, 'ECOUrl');
      games.push({
        source: 'chesscom', id: g.uuid ?? g.url, url: g.url, date: (g.end_time ?? 0) * 1000,
        white: { name: white, rating: g.white.rating ?? null }, black: { name: black, rating: g.black.rating ?? null },
        result: header(g.pgn, 'Result') ?? '*', timeClass: g.time_class ?? '',
        opening: ecoUrl ? decodeURIComponent(ecoUrl.split('/').pop()!).replace(/-/g, ' ') : null,
        pgn: g.pgn, userColor: white.toLowerCase() === u ? 'w' : 'b',
      });
    }
  }
  return { games, next: c.index >= 0 ? c : null };
}

// ───────────── Lichess ─────────────
// next = 이 시각 이전 게임 (until)

async function lichessPage(user: string, until: number | null, want = 20): Promise<GamePage> {
  const u = user.trim();
  const params = new URLSearchParams({
    max: String(want), pgnInJson: 'true', opening: 'true', clocks: 'true', evals: 'false',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence', // 변형 체스 제외
  });
  if (until) params.set('until', String(until));
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?${params}`, { headers: { Accept: 'application/x-ndjson' } });
  if (res.status === 404) throw new SourceError('Lichess에서 이 아이디를 찾을 수 없습니다.');
  if (res.status === 429) throw new SourceError('Lichess 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  if (!res.ok) throw new SourceError(`Lichess 응답 오류 (${res.status})`);
  const rows = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const games: OnlineGame[] = rows.filter((g) => g.variant === 'standard' && g.pgn).map((g) => {
    const wn = g.players.white.user?.name ?? 'Anonymous', bn = g.players.black.user?.name ?? 'Anonymous';
    return {
      source: 'lichess' as const, id: g.id, url: `https://lichess.org/${g.id}`, date: g.createdAt,
      white: { name: wn, rating: g.players.white.rating ?? null }, black: { name: bn, rating: g.players.black.rating ?? null },
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '1/2-1/2',
      timeClass: g.speed === 'correspondence' ? 'daily' : g.speed, opening: g.opening?.name ?? null,
      pgn: g.pgn, userColor: wn.toLowerCase() === u.toLowerCase() ? 'w' : 'b',
    };
  });
  const last = rows.at(-1);
  return { games, next: rows.length >= want && last ? last.createdAt - 1 : null };
}

export function fetchGames(source: Source, user: string, next: unknown | null): Promise<GamePage> {
  if (!user.trim()) return Promise.reject(new SourceError('아이디를 입력해 주세요.'));
  return source === 'chesscom' ? chesscomPage(user, next as ChesscomCursor | null) : lichessPage(user, next as number | null);
}

/** 사용자 관점 결과 */
export function userResult(g: OnlineGame): 'win' | 'loss' | 'draw' | null {
  if (g.result === '1/2-1/2') return 'draw';
  if (g.result === '1-0') return g.userColor === 'w' ? 'win' : 'loss';
  if (g.result === '0-1') return g.userColor === 'b' ? 'win' : 'loss';
  return null;
}
