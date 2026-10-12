// 프로필 카드 맨 위의 4글자 체스 유형 + 축별 막대 + 공유 버튼
import { tr, getLang } from '../i18n';
import { chessTypeOf, groupOf, ratingOf, TYPE_DATA, MIN_COUNTED, type ChessType } from '../core/chessType';
import type { PlayerProfile } from '../core/profile';
import CALIB from '../data/type-calib.json';
import { loadVs, compareBlock } from './compare';

/** 이보다 적으면 유형을 보여주지 않는다 (한 판의 일부만으로는 의미가 없음) */
const MIN_SHOW = 20;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
    : `<p class="faint type-note">${tr(`평가 대상 수가 ${t.counted}수로 아직 적어요. ${Math.ceil((MIN_COUNTED - t.counted) / 25)}판 정도 더 분석하면 결과가 정확해집니다.`, `Only ${t.counted} moves rated so far. About ${Math.ceil((MIN_COUNTED - t.counted) / 25)} more games will make it accurate.`)}</p>`;
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
    <p class="faint type-note">${p.rating ? tr(`레이팅 ${ratingOf(p)} 전후 플레이어들과 비교한 결과예요.`, `Compared with players rated around ${ratingOf(p)}.`) : tr('레이팅 정보가 없어 1500 전후 플레이어들과 비교한 결과예요.', 'No rating found, so compared with players around 1500.')}</p>
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

export type { ChessType };
