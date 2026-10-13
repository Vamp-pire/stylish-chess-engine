// 레이팅 척도 맞추기: 유형 보정·Maia3는 Lichess 레이팅 기준이라, Chess.com 레이팅은 Lichess 척도로 바꿔 쓴다.
// 환산표: ChessGoals "Lichess Ratings vs. Chess.com" (2026년 7월 갱신, Chess.com 블리츠 ↔ Lichess 블리츠, N=1,935, RD<150인 활동 계정).
// 출처 표는 Chess.com 블리츠 기준뿐이라 불릿·래피드도 같은 곡선으로 추정한다 (정확도는 블리츠가 가장 높다).
// https://chessgoals.com/rating-comparison/

/** [Chess.com 블리츠, Lichess 블리츠] */
const CHESSCOM_TO_LICHESS: [number, number][] = [
  [500, 1090], [600, 1160], [700, 1225], [800, 1290], [900, 1360], [1000, 1425], [1100, 1490], [1200, 1555],
  [1300, 1620], [1400, 1685], [1500, 1755], [1600, 1820], [1700, 1885], [1800, 1950], [1900, 2015], [2000, 2080],
  [2100, 2145], [2200, 2210], [2300, 2275], [2400, 2340], [2500, 2410], [2600, 2475], [2700, 2540], [2800, 2610],
  [2900, 2675], [3000, 2745],
];

/** Chess.com 레이팅 → Lichess 척도 (표 사이는 직선으로, 바깥은 끝 구간 기울기로) */
export function chesscomToLichess(r: number): number {
  const t = CHESSCOM_TO_LICHESS;
  let i = t.findIndex(([c]) => c >= r);
  if (i <= 0) i = i === 0 ? 1 : t.length - 1;
  const [c0, l0] = t[i - 1], [c1, l1] = t[i];
  return Math.round(l0 + ((r - c0) * (l1 - l0)) / (c1 - c0));
}

/** 기보 헤더로 Chess.com 게임인지 */
export const isChesscom = (h: Record<string, string>) => /chess\.com/i.test(h.Site ?? '') || /chess\.com/i.test(h.Link ?? '');

/** 헤더의 레이팅을 Lichess 척도로 (Chess.com이면 환산, 없거나 이상하면 null) */
export function lichessScale(h: Record<string, string>, v: string | undefined): number | null {
  const r = Number(v);
  if (!(r > 0)) return null;
  return isChesscom(h) ? chesscomToLichess(r) : r;
}
