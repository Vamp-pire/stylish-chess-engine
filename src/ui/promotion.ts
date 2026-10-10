// 폰 승격 기물 고르기: 승격 칸 위에 퀸·나이트·룩·비숍을 세로로 띄운다 (Lichess 방식).
// 바깥을 누르거나 Esc를 누르면 취소(null).

export type PromoPiece = 'q' | 'n' | 'r' | 'b';
const ORDER: [PromoPiece, string][] = [['q', 'queen'], ['n', 'knight'], ['r', 'rook'], ['b', 'bishop']];

/** 승격 수인지: 폰이 마지막 줄로 가는 수 */
export const isPromotion = (pieceType: string | undefined, dest: string) => pieceType === 'p' && (dest[1] === '8' || dest[1] === '1');

/**
 * @param board  chessground를 붙인 요소 (.cg-wrap)
 * @param dest   승격 칸 (예: 'e8')
 * @param color  승격하는 쪽
 * @param orientation 보드 방향
 */
export function choosePromotion(board: HTMLElement, dest: string, color: 'white' | 'black', orientation: 'white' | 'black'): Promise<PromoPiece | null> {
  return new Promise((resolve) => {
    const file = dest.charCodeAt(0) - 97;
    const col = orientation === 'white' ? file : 7 - file;
    // 승격 칸이 화면 위쪽이면 위에서 아래로, 아래쪽이면 아래에서 위로 쌓는다
    const atTop = (dest[1] === '8') === (orientation === 'white');
    const overlay = document.createElement('div');
    overlay.className = 'promo-overlay';
    overlay.innerHTML = ORDER.map(([k, name], i) => {
      const row = atTop ? i : 7 - i;
      return `<button class="promo-choice" data-p="${k}" style="left:${col * 12.5}%;top:${row * 12.5}%" aria-label="${name}"><piece class="${name} ${color}"></piece></button>`;
    }).join('');
    const done = (p: PromoPiece | null) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(p);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    overlay.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.promo-choice');
      done(btn ? (btn.dataset.p as PromoPiece) : null);
    });
    document.addEventListener('keydown', onKey, true);
    board.appendChild(overlay);
  });
}
