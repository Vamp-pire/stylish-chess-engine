// 유형별 장면 데이터 (scripts/build-type-images.mjs가 그리고, scripts/check-scenes.mts가 체스적으로 말이 되는지 검사한다)
/**
 * 유형별 장면: 5×5 작은 판 위에서 그 유형이 하는 행동. 흰 기물 = 나, 검은 기물 = 상대.
 * pieces: '흰/검 + 기물 글자' (wN, bK …)와 칸(a1~e5). ghost: 반투명 기물(도착할 자리)
 * arrows: g = 내 수(초록), r = 상대 위협(빨강). curve: 휘는 정도(칸 단위, 부호로 방향), dash: 점선, cut: 화살촉 대신 끊김(막힘),
 *   guard: 움직이는 수가 아니라 그 칸을 지킨다는 뜻 (검사에서 실제로 지키는지 확인)
 *   played: 이미 둔 수 (유령 칸 → 지금 칸). 그림은 수를 둔 뒤의 국면이다
 * 바꾼 뒤에는 npx tsx scripts/check-scenes.mts 로 체스적으로 말이 되는지 확인한다
 * marks: star = 좋은 자리, shade = 장악한 칸
 */
export const SCENES = {
  // 공세형
  AWIO: { pieces: [['wN', 'b2'], ['bP', 'b3'], ['bP', 'c3'], ['bP', 'd3'], ['bK', 'e5']], ghost: [['wN', 'c4']],
    arrows: [{ from: 'b2', to: 'c4', c: 'g', curve: -0.9 }, { from: 'c4', to: 'e5', c: 'g' }] },
  AWIE: { pieces: [['wR', 'e1'], ['wQ', 'e2'], ['bP', 'd5'], ['bK', 'e5'], ['bP', 'c4']],
    arrows: [{ from: 'e2', to: 'e5', c: 'g' }] },
  AWRO: { pieces: [['bQ', 'd5'], ['wN', 'b3'], ['wR', 'a4'], ['bK', 'e4']],
    arrows: [{ from: 'd5', to: 'b3', c: 'r' }, { from: 'a4', to: 'e4', c: 'g' }] },
  AWRE: { pieces: [['wR', 'c1'], ['bR', 'c5'], ['wK', 'e1'], ['bK', 'a5'], ['bP', 'b5']],
    arrows: [{ from: 'c1', to: 'c5', c: 'g' }, { from: 'c5', to: 'c1', c: 'r' }] },
  // 정밀형
  ASIO: { pieces: [['wB', 'a1'], ['bQ', 'e5'], ['bP', 'b4'], ['bP', 'd2'], ['wP', 'a3']],
    arrows: [{ from: 'a1', to: 'e5', c: 'g' }] },
  ASIE: { pieces: [['bK', 'c5'], ['wQ', 'a3'], ['wN', 'd3'], ['wB', 'e3']],
    arrows: [{ from: 'a3', to: 'c5', c: 'g' }, { from: 'd3', to: 'c5', c: 'g', curve: 0.6 }, { from: 'e3', to: 'c5', c: 'g' }] },
  ASRO: { pieces: [['wP', 'b3'], ['bQ', 'b5'], ['wN', 'd2'], ['bK', 'e4']],
    arrows: [{ from: 'b5', to: 'b3', c: 'r' }, { from: 'd2', to: 'b3', c: 'g', curve: 0.5 }, { from: 'd2', to: 'e4', c: 'g', curve: -0.5 }] },
  ASRE: { pieces: [['bN', 'e5'], ['wR', 'd1'], ['wK', 'b1']], ghost: [['bN', 'd3']],
    arrows: [{ from: 'e5', to: 'd3', c: 'r', curve: 0.5, cut: true }, { from: 'd1', to: 'd3', c: 'g', guard: true }] },
  // 전략형
  PWIO: { pieces: [['wP', 'a3'], ['wP', 'b4'], ['wP', 'c2'], ['bP', 'd5'], ['bP', 'e4'], ['bP', 'c5']],
    arrows: [{ from: 'b4', to: 'b5', c: 'g' }, { from: 'c2', to: 'c4', c: 'g' }] },
  PWIE: { pieces: [['wP', 'a3'], ['wP', 'b3'], ['wP', 'c3'], ['bP', 'a5'], ['bP', 'b5'], ['bK', 'd5']],
    arrows: [{ from: 'a3', to: 'a4', c: 'g' }, { from: 'b3', to: 'b4', c: 'g' }, { from: 'c3', to: 'c4', c: 'g' }] },
  // 체크를 받자 나이트로 길을 막는다 (d2는 킹이 지켜 퀸이 잡으면 손해)
  PWRO: { pieces: [['wK', 'c1'], ['wN', 'd2'], ['wP', 'a2'], ['wP', 'b2'], ['bQ', 'e3']], ghost: [['wN', 'b1']],
    arrows: [{ from: 'e3', to: 'd2', c: 'r', cut: true }, { from: 'b1', to: 'd2', c: 'g', curve: -0.5, played: true }] },
  PWRE: { pieces: [['wK', 'c1'], ['wP', 'a2'], ['wP', 'b2'], ['wB', 'c2'], ['wR', 'd2'], ['bQ', 'e4'], ['bR', 'd5'], ['bN', 'a4']],
    arrows: [{ from: 'e4', to: 'c2', c: 'r', cut: true }, { from: 'd5', to: 'd2', c: 'r', cut: true }, { from: 'a4', to: 'b2', c: 'r', cut: true, curve: 0.4 }] },
  // 안정형
  PSIO: { pieces: [['wN', 'e1'], ['wP', 'c3'], ['wP', 'e3'], ['bP', 'd5']], ghost: [['wN', 'c2']], marks: { star: ['d4'] },
    arrows: [{ from: 'e1', to: 'c2', c: 'g', curve: 0.5 }, { from: 'c2', to: 'd4', c: 'g', curve: -0.5 }] },
  PSIE: { pieces: [['wR', 'a4'], ['wR', 'e3'], ['bK', 'c5'], ['bN', 'e5']], marks: { shade: ['a4', 'b4', 'c4', 'd4', 'e4'] },
    arrows: [{ from: 'a4', to: 'e4', c: 'g' }] },
  PSRO: { pieces: [['bN', 'c5'], ['wB', 'e2'], ['wK', 'b2'], ['wR', 'e1']],
    arrows: [{ from: 'c5', to: 'd3', c: 'r', cut: true, curve: 0.5 }, { from: 'e2', to: 'd3', c: 'g', guard: true }] },
  PSRE: { pieces: [['wK', 'b1'], ['wP', 'a3'], ['wP', 'b2'], ['wP', 'c2'], ['wP', 'd3'], ['bQ', 'c5'], ['bB', 'e4']],
    arrows: [{ from: 'c5', to: 'c2', c: 'r', cut: true }, { from: 'e4', to: 'd3', c: 'r', cut: true }] },
};
