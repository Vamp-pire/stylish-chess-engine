// SVG 차트: 평가 그래프, 레이더 차트
import type { MoveAnalysis } from '../core/analyzer';

const W = 600, H = 110;

/** 백 기대 점수 그래프 (Stockfish WDL). plies = 전체 수 개수 (분석 중이면 아직 없는 수는 비워 둔다) */
export function evalGraph(moves: MoveAnalysis[], total: number, current: number): string {
  if (!total) return '';
  const x = (i: number) => (total <= 1 ? 0 : (i / total) * W);
  // 세로축: Stockfish WDL 기준 백 기대 점수
  const y = (exp: number) => H - exp * H;
  const pts = [[0, y(0.5)], ...moves.map((m, i) => [x(i + 1), y(m.expWhiteAfter)])];
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${H}L0,${H}Z`;
  const marks = moves.map((m, i) => {
    if (m.risk) return `<circle cx="${x(i + 1)}" cy="${y(m.expWhiteAfter)}" r="4" fill="#a855f7" />`;
    if (m.quality === 'blunder' || m.quality === 'mistake')
      return `<circle cx="${x(i + 1)}" cy="${y(m.expWhiteAfter)}" r="3.5" fill="${m.quality === 'blunder' ? 'var(--bad)' : '#e07a2e'}" />`;
    return '';
  }).join('');
  const cx = x(current + 1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="평가 그래프">
    <rect width="${W}" height="${H}" fill="var(--black-side)" opacity=".9" />
    <path d="${area}" fill="var(--white-side)" />
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--text-3)" stroke-dasharray="3 4" stroke-width="1" opacity=".6" />
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    ${current >= 0 ? `<line x1="${cx}" x2="${cx}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />` : ''}
    ${marks}
  </svg>`;
}

/** 레이더 차트 (값 0~100) */
export function radar(axes: { label: string; value: number }[], color: string, size = 200): string {
  const c = size / 2, r = size / 2 - 34, n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((s) =>
    `<polygon points="${axes.map((_, i) => pt(i, s).join(',')).join(' ')}" fill="none" stroke="var(--border)" />`).join('');
  const spokes = axes.map((_, i) => { const [px, py] = pt(i, 1); return `<line x1="${c}" y1="${c}" x2="${px}" y2="${py}" stroke="var(--border)" />`; }).join('');
  const shape = axes.map((a, i) => pt(i, Math.max(0.04, a.value / 100)).join(',')).join(' ');
  const labels = axes.map((a, i) => {
    const [px, py] = pt(i, 1.24);
    return `<text x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="var(--text-2)">${a.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="스타일 레이더">
    ${rings}${spokes}
    <polygon points="${shape}" fill="${color}" fill-opacity=".25" stroke="${color}" stroke-width="2" />
    ${labels}
  </svg>`;
}

/** 꺾은선 차트 (값 0~100). 점이 적을 때 쓰는 단순한 추이 그래프 */
export function lineChart(labels: string[], series: { label: string; color: string; values: number[]; dashed?: boolean }[], w = 520, h = 170): string {
  const padL = 28, padR = 10, padT = 10, padB = 24;
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * (h - padT - padB);
  const grid = [0, 50, 100].map((v) => `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" /><text x="${padL - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--text-3)">${v}</text>`).join('');
  // 라벨이 많으면 몇 개만
  const every = Math.ceil(n / 6);
  const xl = labels.map((l, i) => (i % every === 0 || i === n - 1) ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="var(--text-3)">${l}</text>` : '').join('');
  const lines = series.map((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"><title>${s.label} ${labels[i]}: ${v}</title></circle>`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="4 4"' : ''} />${dots}`;
  }).join('');
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="추이 그래프">${grid}${xl}${lines}</svg>`;
}
