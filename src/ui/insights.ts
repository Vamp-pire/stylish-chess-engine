// 프로필 보조 화면: 시간 사용, 오프닝별 스타일, 스타일 변화 추이
import { tr } from '../i18n';
import { mergeProfiles, type PlayerProfile, type TimeProfile, type TimeSlice } from '../core/profile';
import { STYLES, type StyleKey } from '../core/styles';
import { lineChart } from './charts';
import { similarMasters, MIN_MOVES_FOR_MATCH, masterName, masterEra, masterDesc } from '../core/masters';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const fmtSec = (s: number) => {
  if (s < 60) return tr(`${Math.round(s)}초`, `${Math.round(s)}s`);
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return r ? tr(`${m}분 ${r}초`, `${m}m ${r}s`) : tr(`${m}분`, `${m}m`);
};

/** 시계 표시 (남은 시간) */
export const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const styleNames = (top: StyleKey[], n = 2) => top.slice(0, n).map((k) => STYLES[k].label).join(', ') || '-';

/** 그룹 축 점수 (레이더와 같은 계산): 그룹 안 상위 2개 평균을 강조 */
export const GROUP_AXES: { label: string; keys: StyleKey[]; color: string }[] = [
  { get label() { return tr('공격', 'Attack'); }, keys: ['aggressive', 'tactical', 'initiative', 'counterattack'], color: '#e5484d' },
  { get label() { return tr('포지션', 'Position'); }, keys: ['positional', 'prophylactic', 'restriction', 'active', 'space', 'tension'], color: '#3e63dd' },
  { get label() { return tr('안전', 'Safety'); }, keys: ['solid', 'defensive', 'simplifying'], color: '#30a46c' },
  { get label() { return tr('실전', 'Practical'); }, keys: ['complicating', 'quiet', 'waiting', 'practical'], color: '#ab4aba' },
  { get label() { return tr('엔드게임', 'Endgame'); }, keys: ['kingActivity', 'passedPawn'], color: '#5bb98c' },
];
export const groupScore = (avg: Record<StyleKey, number>, keys: StyleKey[]) => {
  const vals = keys.map((k) => avg[k]).sort((x, y) => y - x).slice(0, 2);
  return Math.min(100, (vals.reduce((s, v) => s + v, 0) / vals.length) * 1.6);
};

// ───────────── 시간 사용 ─────────────

export function timeSection(t: TimeProfile | null | undefined): string {
  if (!t || t.moves < 6) return '';
  const cell = (title: string, s: TimeSlice, note: string) => `
    <div class="slice"><b>${title} (${tr(`${s.count}수`, `${s.count} moves`)})</b>${s.count ? `${tr('정확도', 'Accuracy')} ${s.accuracy}%<br><span class="faint">${esc(styleNames(s.top))}</span>` : `<span class="faint">${note}</span>`}</div>`;
  const drop = t.lowTime.count >= 3 && t.normal.count ? Math.round((t.normal.accuracy - t.lowTime.accuracy) * 10) / 10 : null;
  return `<div><div class="section-title">${tr('시간 사용', 'Time use')}</div>
    <p class="muted" style="margin:0 0 8px">${tr('수당 평균', 'Average per move')} ${fmtSec(t.avgSpent)}${drop != null ? ` · ${tr('시간에 쫓길 때 정확도', 'Accuracy under time pressure')} ${drop > 0 ? tr(`${drop}%p 하락`, `−${drop} pp`) : drop < 0 ? tr(`${-drop}%p 상승`, `+${-drop} pp`) : tr('변화 없음', 'no change')}` : ''}</p>
    <div class="slices">${cell(tr('평소', 'Normal'), t.normal, '-')}${cell(tr('시간 부족', 'Low time'), t.lowTime, tr('없음', 'none'))}${cell(tr('오래 생각한 수', 'Long thinks'), t.long, tr('없음', 'none'))}</div></div>`;
}

// ───────────── 오프닝별 스타일 ─────────────

export function openingSection(games: { opening: string | null; profile: PlayerProfile }[], max = 6): string {
  const by = new Map<string, PlayerProfile[]>();
  for (const g of games) if (g.opening) by.set(g.opening, [...(by.get(g.opening) ?? []), g.profile]);
  const rows = [...by].map(([name, list]) => ({ name, n: list.length, p: mergeProfiles(list)! }))
    .filter((r) => r.p.counted > 0)
    .sort((a, b) => b.n - a.n || b.p.counted - a.p.counted).slice(0, max);
  if (!rows.length) return '';
  return `<div><div class="section-title">${tr('오프닝별 스타일', 'Style by opening')}</div>
    <div class="table-scroll"><table class="mini-table">
      <tr><th>${tr('오프닝', 'Opening')}</th><th>${tr('판', 'Games')}</th><th>${tr('정확도', 'Accuracy')}</th><th>${tr('주 스타일', 'Main style')}</th></tr>
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
    for (let i = 0; i < sorted.length; i += size) buckets.push({ label: tr(`${i + 1}~${Math.min(sorted.length, i + size)}판`, `Games ${i + 1}–${Math.min(sorted.length, i + size)}`), list: sorted.slice(i, i + size).map((g) => g.profile) });
  }
  if (buckets.length < 2) return '';
  const merged = buckets.map((b) => mergeProfiles(b.list)!);
  const series = GROUP_AXES.slice(0, 4).map((a) => ({ label: a.label, color: a.color, values: merged.map((p) => Math.round(groupScore(p.avg, a.keys))) }));
  const all: { label: string; color: string; values: number[]; dashed?: boolean }[] = [...series, { label: tr('정확도', 'Accuracy'), color: 'var(--text-3)', values: merged.map((p) => p.accuracy), dashed: true }];
  return `<div><div class="section-title">${tr('스타일 변화 추이', 'Style trend')}</div>
    ${lineChart(buckets.map((b) => b.label), all)}
    <div class="legend">${all.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div></div>`;
}

// ───────────── 닮은 선수 ─────────────

export function mastersSection(p: PlayerProfile): string {
  const list = similarMasters(p);
  if (!list.length) return '';
  const few = p.counted < MIN_MOVES_FOR_MATCH;
  const [top, ...rest] = list;
  return `<div><div class="section-title">${tr('닮은 선수', 'Similar players')}</div>
    <div class="master-top">
      <div class="master-score">${top.score}<small>%</small></div>
      <div><b>${esc(masterName(top.master))}</b> <span class="faint">${esc(masterEra(top.master))}</span><p>${esc(masterDesc(top.master))}</p></div>
    </div>
    <div class="chips">${rest.map((r) => `<span class="chip" title="${esc(masterDesc(r.master))}">${esc(masterName(r.master))} ${r.score}%</span>`).join('')}</div>
    <p class="faint" style="margin:6px 0 0">${few ? tr(`평가한 수가 ${p.counted}개뿐이라 참고용입니다. 여러 판을 분석할수록 정확해집니다. `, `Only ${p.counted} moves rated, so take this as a reference. More games make it more accurate. `) : ''}${tr('스타일이 평균에서 벗어난 방향을 유명 선수 기보(선수당 약 24판) 분석 결과와 비교했습니다.', 'Compares the direction your style departs from the average with analyses of famous players\' games (about 24 each).')}</p></div>`;
}
