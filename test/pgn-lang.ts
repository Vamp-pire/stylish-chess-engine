// 스페인어식 기물 표기(R=킹, D=퀸, T=룩, A·F=비숍, C=나이트)를 영어로 바꾼다 (Topalov.pgn처럼 스페인어로 된 기보용)
const MAP: Record<string, string> = { R: 'K', D: 'Q', T: 'R', A: 'B', F: 'B', C: 'N' };

export function spanishToEnglish(pgn: string) {
  const i = pgn.indexOf('\n\n');
  const head = i >= 0 ? pgn.slice(0, i) : '';
  const body = i >= 0 ? pgn.slice(i) : pgn;
  const moves = body
    // 수 앞의 기물 글자만 바꾼다 (헤더·주석은 건드리지 않음): 공백·마침표 뒤에 오고 뒤에 칸 이름이 이어지는 글자
    .replace(/(^|[\s.])([RDTAFC])(?=[a-h1-8x]*[a-h][1-8])/g, (_m, pre: string, p: string) => pre + MAP[p])
    .replace(/=([DTAFC])/g, (_m, p: string) => '=' + MAP[p]);
  return head + moves;
}
