// 오프닝 국면 키: FEN의 배치·차례·캐슬링만 써서 32비트 FNV-1a 해시 (앙파상·수 번호는 무시).
// 빌드 스크립트(Node)와 브라우저가 같은 함수를 쓰도록 순수 JS로 둔다.
export function positionKey(fen) {
  const [placement, side, castling] = fen.split(' ');
  const s = `${placement} ${side} ${castling}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
