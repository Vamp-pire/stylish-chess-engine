// 정적 페이지 공용: 스타일 이름(한·영), 미니 보드(SVG)

export const STYLE_LABEL = {
  aggressive: ['공격적', 'Aggressive'], tactical: ['전술적', 'Tactical'], initiative: ['주도권', 'Initiative'], counterattack: ['반격', 'Counterattack'],
  positional: ['포지셔널', 'Positional'], prophylactic: ['예방적', 'Prophylactic'], restriction: ['제한', 'Restriction'], active: ['활동적', 'Active'],
  space: ['공간 확보', 'Space'], tension: ['긴장 유지', 'Tension'], solid: ['안정적', 'Solid'], defensive: ['수비적', 'Defensive'],
  simplifying: ['단순화', 'Simplifying'], complicating: ['복잡화', 'Complicating'], quiet: ['조용한 수', 'Quiet'], waiting: ['대기수', 'Waiting'],
  practical: ['실용적', 'Practical'], kingActivity: ['킹 활성화', 'King activity'], passedPawn: ['패스폰 추진', 'Passed pawn'], risk: ['위험수(희생·함정·도박)', 'Risky moves (sacrifices, traps, gambles)'],
};

/** 정적 미니 보드 (SVG): 수를 둔 쪽이 아래, 둔 수는 화살표 */
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export function boardSvg(fen, uci, color) {
  const rows = fen.split(' ')[0].split('/');
  const flip = color === 'b';
  const sq = 40;
  let cells = '', pieces = '';
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const x = (flip ? 7 - f : f) * sq, y = (flip ? 7 - r : r) * sq;
      const white = ch === ch.toUpperCase();
      pieces += `<text x="${x + sq / 2}" y="${y + sq * 0.8}" class="${white ? 'pw' : 'pb'}">${GLYPH[ch.toLowerCase()]}</text>`;
      f++;
    }
  });
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) cells += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" class="${(r + f) % 2 ? 'sd' : 'sl'}"/>`;
  const at = (s) => { const f = s.charCodeAt(0) - 97, r = 8 - Number(s[1]); return [((flip ? 7 - f : f) + 0.5) * sq, ((flip ? 7 - r : r) + 0.5) * sq]; };
  const [x1, y1] = at(uci.slice(0, 2)), [x2, y2] = at(uci.slice(2, 4));
  return `<svg class="mini-board" viewBox="0 0 320 320" role="img" aria-label="board">${cells}${pieces}
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mv"/><circle cx="${x2}" cy="${y2}" r="7" class="mvh"/></svg>`;
}
