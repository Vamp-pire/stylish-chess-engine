// 프로필 카드 맨 위의 4글자 체스 유형 + 축별 막대 + 공유 버튼
import { tr, getLang } from '../i18n';
import { chessTypeOf, groupOf, ratingOf, TYPE_DATA, MIN_COUNTED, type ChessType } from '../core/chessType';
import { mergeProfiles, type PlayerProfile } from '../core/profile';
import CALIB from '../data/type-calib.json';
import { loadVs, compareBlock } from './compare';

/** 이보다 적으면 유형을 보여주지 않는다 (한 판의 일부만으로는 의미가 없음) */
const MIN_SHOW = 20;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// 레이팅 직접 입력: 기보에 레이팅이 없거나 다른 시간대 레이팅으로 비교하고 싶을 때 (이 브라우저에만 저장)
const RATING_KEY = 'stylish.rating.v1';
function ratingMap(): Record<string, number> { try { return JSON.parse(localStorage.getItem(RATING_KEY) ?? '{}'); } catch { return {}; } }
export function ratingOverride(name: string): number | null { return name ? ratingMap()[name.toLowerCase()] ?? null : null; }
export function setRatingOverride(name: string, rating: number | null) {
  const m = ratingMap();
  if (rating) m[name.toLowerCase()] = Math.round(rating); else delete m[name.toLowerCase()];
  try { localStorage.setItem(RATING_KEY, JSON.stringify(m)); } catch { /* 저장 못 하면 이번만 */ }
}
/** 직접 입력한 레이팅이 있으면 그걸로 바꾼 프로필 */
export function withRating(p: PlayerProfile, name: string): PlayerProfile {
  const r = ratingOverride(name);
  return r ? { ...p, rating: r } : p;
}

export function typeSection(p: PlayerProfile, name = ''): string {
  // 보정 데이터가 아직 없으면(임시 값) 보여주지 않는다
  if (!CALIB.players || p.counted < MIN_SHOW) return '';
  const t = chessTypeOf(p);
  if (!t) return '';
  const g = t.code.slice(0, 2);
  const group = groupOf(t.code);
  const bars = t.axes.map((a, i) => {
    const ax = TYPE_DATA.axes[i];
    return `<div class="type-axis">
      <span class="${a.letter === ax.letters[0] ? 'on' : ''}">${ax.letters[0]} ${esc(ax.names[0])}</span>
      <div class="type-track"><i style="left:${100 - a.pct}%"></i><b style="left:50%"></b></div>
      <span class="${a.letter === ax.letters[1] ? 'on' : ''}">${esc(ax.names[1])} ${ax.letters[1]}</span>
    </div>`;
  }).join('');
  const note = t.reliable
    ? ''
    : `<p class="type-note type-unsure">⚠ ${tr(`아직 바뀔 수 있어요. 평가한 수가 ${t.counted}수뿐이라, ${Math.ceil((MIN_COUNTED - t.counted) / 25)}판 정도 더 분석하면 결과가 안정돼요.`, `This may still change. Only ${t.counted} moves rated so far; about ${Math.ceil((MIN_COUNTED - t.counted) / 25)} more games will settle it.`)}</p>`;
  return `<div class="type-card g-${g}">
    <div class="type-top">
      <a href="/types/${t.code}" target="_blank" rel="noopener"><img class="type-thumb" src="/img/types/${t.code}-square.png" alt="${t.code} ${esc(t.info.name)}" width="600" height="600" /></a>
      <div>
        <div class="type-head">
          <span class="type-code">${t.code}</span>
          <span class="type-name">${esc(t.info.name)}<small>${getLang() === 'en' ? esc(group.name) : `${esc(t.info.en)} · ${esc(group.name)}`}</small></span>
        </div>
        <p class="type-tagline">${esc(t.info.tagline)}</p>
      </div>
    </div>
    <div class="type-axes">${bars}</div>
    <p class="faint type-note">${p.rating ? tr(`레이팅 ${ratingOf(p)} 전후 플레이어들과 비교한 결과예요${ratingOverride(name) ? ' (직접 입력)' : p.ratingConverted ? ' (Chess.com 레이팅을 Lichess 기준으로 환산)' : ''}.`, `Compared with players rated around ${ratingOf(p)}${ratingOverride(name) ? ' (entered by you)' : p.ratingConverted ? ' (Chess.com rating converted to the Lichess scale)' : ''}.`) : tr('레이팅 정보가 없어 1500 전후 플레이어들과 비교한 결과예요.', 'No rating found, so compared with players around 1500.')}
      ${name ? `<span class="rating-edit"><input type="number" min="400" max="3000" step="10" inputmode="numeric" data-rating-input="${esc(name)}" value="${ratingOverride(name) ?? ''}" placeholder="${tr('레이팅 직접 입력', 'Enter rating')}" aria-label="${tr('레이팅 직접 입력', 'Enter rating')}" /><button type="button" class="secondary small" data-rating-save="${esc(name)}">${tr('적용', 'Apply')}</button>${ratingOverride(name) ? `<button type="button" class="ghost small" data-rating-clear="${esc(name)}">${tr('기보 레이팅으로', 'Use game rating')}</button>` : ''}</span>` : ''}</p>
    ${note}
    ${(() => { const v = loadVs(); return v && !(v.name && v.name === name && v.code === t.code) ? compareBlock(t, name, v) : ''; })()}
    <div class="type-actions">
      <a href="${getLang() === 'en' ? '/en' : ''}/types/${t.code}" target="_blank" rel="noopener">${tr(`${esc(t.info.name)} 유형 자세히 보기`, `More about the ${esc(t.info.name)}`)}</a>
      <button type="button" data-type-image="${esc(JSON.stringify({ code: t.code, name, pcts: t.axes.map((a) => a.pct) }))}">${tr('내 결과 이미지 만들기', 'Make my result image')}</button>
      <button type="button" class="secondary" data-compare-type="${esc(JSON.stringify({ code: t.code, name, pcts: t.axes.map((a) => a.pct) }))}">${tr('친구와 비교하기', 'Compare with a friend')}</button>
      <button type="button" class="secondary" data-share-type="${t.code}">${tr('링크 공유', 'Share link')}</button>
    </div>
  </div>`;
}

/** 공유: 가능하면 기기 공유 창, 아니면 링크 복사 */
export async function shareType(code: string, button?: HTMLElement) {
  const info = TYPE_DATA.types.find((x) => x.code === code);
  if (!info) return;
  const url = new URL(`${getLang() === 'en' ? '/en' : ''}/types/${code}`, location.href).href;
  const text = tr(`나의 체스 유형은 ${code} ${info.name} — ${info.tagline}`, `My chess type is ${code}, the ${info.name}: ${info.tagline}`);
  try {
    if (navigator.share) { await navigator.share({ title: tr('Stylish 체스 유형', 'Stylish chess type'), text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    if (button) { const old = button.textContent; button.textContent = tr('복사했어요!', 'Copied!'); setTimeout(() => { button.textContent = old; }, 1500); }
  } catch { /* 사용자가 공유 창을 닫은 경우 등 */ }
}

/** 예전 게임 절반 vs 최근 절반의 유형 비교 (둘 다 충분할 때만) */
export function typeChangeSection(games: { date: number | null; profile: PlayerProfile }[]): string {
  if (!CALIB.players || games.length < 4) return '';
  const sorted = [...games].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const half = Math.floor(sorted.length / 2);
  const oldP = mergeProfiles(sorted.slice(0, half).map((g) => g.profile));
  const newP = mergeProfiles(sorted.slice(half).map((g) => g.profile));
  if (!oldP || !newP || oldP.counted < 40 || newP.counted < 40) return '';
  const a = chessTypeOf(oldP), b = chessTypeOf(newP);
  if (!a || !b) return '';
  const shifts = b.axes.map((x, i) => {
    const d = x.pct - a.axes[i].pct;
    if (Math.abs(d) < 8) return '';
    const ax = TYPE_DATA.axes[i];
    return `<span class="chip">${esc(d > 0 ? ax.names[0] : ax.names[1])} +${Math.abs(d)}</span>`;
  }).filter(Boolean).join('');
  const same = a.code === b.code;
  return `<div class="return-row">
    <div><b>${tr('유형 변화', 'Type change')}</b>
      <span class="faint">${tr(`예전 ${half}판 → 최근 ${sorted.length - half}판`, `Older ${half} games → recent ${sorted.length - half}`)}</span></div>
    <div class="type-change"><span class="type-code small">${a.code}</span> → <span class="type-code small">${b.code}</span>
      <span class="faint">${same ? tr('유형은 그대로예요', 'Same type') : esc(tr(`${b.info.name}(으)로 바뀌었어요`, `Now the ${b.info.name}`))}</span></div>
    ${shifts ? `<div class="chips">${shifts}</div>` : ''}
  </div>`;
}

export { timeClassOf } from '../core/chessType';

const TIME_ORDER = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
const timeName = (c: string) => ({ bullet: tr('불릿', 'Bullet'), blitz: tr('블리츠', 'Blitz'), rapid: tr('래피드', 'Rapid'), classical: tr('클래식', 'Classical'), daily: tr('데일리', 'Daily') } as Record<string, string>)[c] ?? c;

/** 시간대별 유형: 시간대가 둘 이상일 때만. 판이 적은 시간대는 '판이 더 필요해요' */
export function timeTypeSection(groups: { cls: string; games: number; profile: PlayerProfile | null }[], name = ''): string {
  const live = groups.filter((g) => g.profile).sort((a, b) => TIME_ORDER.indexOf(a.cls) - TIME_ORDER.indexOf(b.cls));
  if (!CALIB.players || live.length < 2) return '';
  const rows = live.map((g) => {
    const p = withRating(g.profile!, name);
    const t = p.counted >= MIN_SHOW ? chessTypeOf(p) : null;
    return `<div class="tt-row"><span class="tt-cls">${timeName(g.cls)} <span class="faint">${tr(`${g.games}판`, `${g.games} games`)}</span></span>
      ${t ? `<span><b class="type-code small">${t.code}</b> ${esc(t.info.name)}${t.reliable ? '' : ` <span class="faint">${tr('(판이 적어 바뀔 수 있음)', '(few games, may change)')}</span>`}</span>` : `<span class="faint">${tr('판이 더 필요해요', 'Needs more games')}</span>`}</div>`;
  }).join('');
  const bullet = live.some((g) => g.cls === 'bullet');
  return `<div><div class="section-title">${tr('시간대별 유형', 'Type by time control')}</div>
    <div class="tt-list">${rows}</div>
    ${bullet ? `<p class="faint chart-note">${tr('불릿은 시간에 쫓겨 둔 수가 많아 유형이 크게 흔들릴 수 있어요. 래피드·블리츠 결과를 더 믿을 만해요.', 'Bullet has many rushed moves, so its type can swing a lot. Rapid and blitz results are more reliable.')}</p>` : ''}</div>`;
}

export type { ChessType };
