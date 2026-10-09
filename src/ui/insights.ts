// 프로필 보조 화면: 시간 사용, 오프닝별 스타일, 스타일 변화 추이
import { mergeProfiles, type PlayerProfile, type TimeProfile, type TimeSlice } from '../core/profile';
import { STYLES, type StyleKey } from '../core/styles';
import { lineChart } from './charts';
import { similarMasters, MIN_MOVES_FOR_MATCH } from '../core/masters';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const fmtSec = (s: number) => {
  if (s < 60) return `${Math.round(s)}초`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return r ? `${m}분 ${r}초` : `${m}분`;
};

/** 시계 표시 (남은 시간) */
export const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const styleNames = (top: StyleKey[], n = 2) => top.slice(0, n).map((k) => STYLES[k].label).join(', ') || '-';

/** 그룹 축 점수 (레이더와 같은 계산): 그룹 안 상위 2개 평균을 강조 */
export const GROUP_AXES: { label: string; keys: StyleKey[]; color: string }[] = [
  { label: '공격', keys: ['aggressive', 'tactical', 'initiative', 'counterattack'], color: '#e5484d' },
  { label: '포지션', keys: ['positional', 'prophylactic', 'restriction', 'active', 'space', 'tension'], color: '#3e63dd' },
  { label: '안전', keys: ['solid', 'defensive', 'simplifying'], color: '#30a46c' },
  { label: '실전', keys: ['complicating', 'quiet', 'waiting', 'practical'], color: '#ab4aba' },
  { label: '엔드게임', keys: ['kingActivity', 'passedPawn'], color: '#5bb98c' },
];
export const groupScore = (avg: Record<StyleKey, number>, keys: StyleKey[]) => {
  const vals = keys.map((k) => avg[k]).sort((x, y) => y - x).slice(0, 2);
  return Math.min(100, (vals.reduce((s, v) => s + v, 0) / vals.length) * 1.6);
};

// ───────────── 시간 사용 ─────────────

export function timeSection(t: TimeProfile | null | undefined): string {
  if (!t || t.moves < 6) return '';
  const cell = (title: string, s: TimeSlice, note: string) => `
    <div class="slice"><b>${title} (${s.count}수)</b>${s.count ? `정확도 ${s.accuracy}%<br><span class="faint">${esc(styleNames(s.top))}</span>` : `<span class="faint">${note}</span>`}</div>`;
  const drop = t.lowTime.count >= 3 && t.normal.count ? Math.round((t.normal.accuracy - t.lowTime.accuracy) * 10) / 10 : null;
  return `<div><div class="section-title">시간 사용</div>
    <p class="muted" style="margin:0 0 8px">수당 평균 ${fmtSec(t.avgSpent)}${drop != null ? ` · 시간에 쫓길 때 정확도 ${drop > 0 ? `${drop}%p 하락` : drop < 0 ? `${-drop}%p 상승` : '변화 없음'}` : ''}</p>
    <div class="slices">${cell('평소', t.normal, '-')}${cell('시간 부족', t.lowTime, '없음')}${cell('오래 생각한 수', t.long, '없음')}</div></div>`;
}

// ───────────── 오프닝별 스타일 ─────────────

export function openingSection(games: { opening: string | null; profile: PlayerProfile }[], max = 6): string {
  const by = new Map<string, PlayerProfile[]>();
  for (const g of games) if (g.opening) by.set(g.opening, [...(by.get(g.opening) ?? []), g.profile]);
  const rows = [...by].map(([name, list]) => ({ name, n: list.length, p: mergeProfiles(list)! }))
    .filter((r) => r.p.counted > 0)
    .sort((a, b) => b.n - a.n || b.p.counted - a.p.counted).slice(0, max);
  if (!rows.length) return '';
  return `<div><div class="section-title">오프닝별 스타일</div>
    <div class="table-scroll"><table class="mini-table">
      <tr><th>오프닝</th><th>판</th><th>정확도</th><th>주 스타일</th></tr>
      ${rows.map((r) => `<tr><td class="opening-cell" title="${esc(r.name)}">${esc(r.name)}</td><td>${r.n}</td><td>${r.p.accuracy}%</td><td>${esc(styleNames(r.p.top))}</td></tr>`).join('')}
    </table></div></div>`;
}

// ───────────── 스타일 변화 추이 ─────────────

/** 날짜순 판들을 월별로(월이 하나뿐이면 5판씩) 묶어 그룹 점수와 정확도 변화를 그린다 */
export function trendSection(games: { date: number | null; profile: PlayerProfile }[]): string {
  const sorted = games.filter((g) => g.date != null).sort((a, b) => a.date! - b.date!);
  if (sorted.length < 4) return '';
  const month = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
  let buckets: { label: string; list: PlayerProfile[] }[] = [];
  for (const g of sorted) {
    const label = month(g.date!);
    const last = buckets.at(-1);
    if (last?.label === label) last.list.push(g.profile); else buckets.push({ label, list: [g.profile] });
  }
  if (buckets.length < 2) {
    const size = Math.max(2, Math.ceil(sorted.length / 6));
    buckets = [];
    for (let i = 0; i < sorted.length; i += size) buckets.push({ label: `${i + 1}~${Math.min(sorted.length, i + size)}판`, list: sorted.slice(i, i + size).map((g) => g.profile) });
  }
  if (buckets.length < 2) return '';
  const merged = buckets.map((b) => mergeProfiles(b.list)!);
  const series = GROUP_AXES.slice(0, 4).map((a) => ({ label: a.label, color: a.color, values: merged.map((p) => Math.round(groupScore(p.avg, a.keys))) }));
  const all: { label: string; color: string; values: number[]; dashed?: boolean }[] = [...series, { label: '정확도', color: 'var(--text-3)', values: merged.map((p) => p.accuracy), dashed: true }];
  return `<div><div class="section-title">스타일 변화 추이</div>
    ${lineChart(buckets.map((b) => b.label), all)}
    <div class="legend">${all.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div></div>`;
}

// ───────────── 닮은 선수 ─────────────

export function mastersSection(p: PlayerProfile): string {
  const list = similarMasters(p);
  if (!list.length) return '';
  const few = p.counted < MIN_MOVES_FOR_MATCH;
  const [top, ...rest] = list;
  return `<div><div class="section-title">닮은 선수</div>
    <div class="master-top">
      <div class="master-score">${top.score}<small>%</small></div>
      <div><b>${esc(top.master.ko)}</b> <span class="faint">${esc(top.master.era)}</span><p>${esc(top.master.desc)}</p></div>
    </div>
    <div class="chips">${rest.map((r) => `<span class="chip" title="${esc(r.master.desc)}">${esc(r.master.ko)} ${r.score}%</span>`).join('')}</div>
    <p class="faint" style="margin:6px 0 0">${few ? `평가한 수가 ${p.counted}개뿐이라 참고용입니다. 여러 판을 분석할수록 정확해집니다. ` : ''}스타일이 평균에서 벗어난 방향을 유명 선수 기보(선수당 약 24판) 분석 결과와 비교했습니다.</p></div>`;
}
