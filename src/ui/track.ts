// 이용 흐름 측정: Microsoft Clarity 사용자 지정 이벤트·태그 (이미 모든 페이지에 설치됨, 서버 없음).
// 이벤트 이름과 숫자만 보낸다. 아이디·기보·유형 결과 같은 내용은 보내지 않는다.
// Clarity 대시보드의 '퍼널'에서 단계별 이탈을 본다 (예: id_submit → batch_start → batch_done → share_*).
type Clarity = (...args: unknown[]) => void;
const clarity = (): Clarity | null => {
  try { return (window as unknown as { clarity?: Clarity }).clarity ?? null; } catch { return null; }
};

/** 이벤트 하나 (선택적으로 세션 태그도 함께) */
export function track(event: string, tags?: Record<string, string | number | boolean>) {
  const c = clarity();
  if (!c) return;
  try {
    if (tags) for (const [k, v] of Object.entries(tags)) c('set', k, String(v));
    c('event', event);
  } catch { /* 측정 실패는 무시 */ }
}

/** 숫자를 대략적인 구간으로 (태그 값 종류가 너무 많아지지 않게) */
export function bucket(n: number, edges: number[]): string {
  for (const e of edges) if (n <= e) return `≤${e}`;
  return `>${edges[edges.length - 1]}`;
}
