// 친구와 유형 비교: 내 유형을 링크(/app?vs=…)에 담아 보내고, 받은 사람이 분석하면 두 결과를 나란히 보여준다.
// 링크에는 유형 코드·축 백분위·이름만 들어간다 (기보나 아이디는 넣지 않음).
import { tr, getLang } from '../i18n';
import { TYPE_DATA, type ChessType } from '../core/chessType';

export interface VsInfo { code: string; pcts: number[]; name: string }
const KEY = 'stylish-vs';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function encodeVs(v: VsInfo) { return b64url(JSON.stringify([v.code, v.pcts, v.name.slice(0, 30)])); }
export function decodeVs(s: string): VsInfo | null {
  try {
    const [code, pcts, name] = JSON.parse(fromB64url(s));
    if (!TYPE_DATA.types.some((t) => t.code === code) || !Array.isArray(pcts) || pcts.length !== 4) return null;
    return { code, pcts: pcts.map((x: number) => Math.max(0, Math.min(100, Number(x) || 0))), name: String(name ?? '').slice(0, 30) };
  } catch { return null; }
}

/** 받은 비교 신청 (이 탭에서만 기억) */
export function saveVs(v: VsInfo) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 무시 */ } }
export function loadVs(): VsInfo | null { try { const s = sessionStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearVs() { try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ } }

/** 같은 글자 수 → 관계 이름 */
function relation(same: number) {
  return [
    [tr('정반대 라이벌', 'Opposite rivals'), tr('모든 글자가 반대예요. 서로의 방식이 가장 안 통하거나 가장 잘 통하는 사이.', 'Every letter is reversed. Your styles either clash the most or click the best.')],
    [tr('다른 길', 'Different paths'), tr('한 가지만 같아요. 같은 판을 보고도 전혀 다른 수를 떠올릴 거예요.', 'Only one letter in common. You would see very different moves in the same position.')],
    [tr('반반', 'Half and half'), tr('두 글자가 같아요. 비슷하면서도 결정적인 순간엔 다르게 둬요.', 'Two letters match. Similar in many ways, but different when it counts.')],
    [tr('닮은꼴', 'Kindred spirits'), tr('세 글자가 같아요. 서로의 수가 꽤 익숙하게 느껴질 거예요.', 'Three letters match. Each other\'s moves will feel familiar.')],
    [tr('쌍둥이', 'Twins'), tr('네 글자가 모두 같아요! 같은 판에서 같은 수를 둘 확률이 높아요.', 'All four letters match! You would often play the same move.')],
  ][same];
}

export const vsBanner = (v: VsInfo) => {
  const t = TYPE_DATA.types.find((x) => x.code === v.code)!;
  const who = v.name || tr('친구', 'A friend');
  return `<div class="vs-banner"><b>${esc(tr(`${who}님(${v.code} ${t.name})이 체스 유형 비교를 신청했어요.`, `${who} (${v.code}, the ${t.name}) wants to compare chess types with you.`))}</b>
    <span>${tr('아래에서 내 아이디로 최근 게임을 분석하면 두 사람의 결과를 나란히 보여드려요.', 'Analyze your recent games below and we will show both results side by side.')}</span>
    <button type="button" class="ghost" data-vs-clear>${tr('닫기', 'Dismiss')}</button></div>`;
};

/** 결과 카드 아래 비교 블록 */
export function compareBlock(me: ChessType, myName: string, v: VsInfo): string {
  const other = TYPE_DATA.types.find((x) => x.code === v.code)!;
  const same = [...me.code].filter((c, i) => c === v.code[i]).length;
  const [rel, relDesc] = relation(same);
  const rows = me.axes.map((a, i) => {
    const ax = TYPE_DATA.axes[i];
    return `<div class="type-axis vs-axis">
      <span>${ax.letters[0]} ${esc(ax.names[0])}</span>
      <div class="type-track"><b style="left:50%"></b><i class="vs-me" style="left:${100 - a.pct}%"></i><i class="vs-them" style="left:${100 - v.pcts[i]}%"></i></div>
      <span>${esc(ax.names[1])} ${ax.letters[1]}</span>
    </div>`;
  }).join('');
  const myLabel = myName || tr('나', 'Me'), theirLabel = v.name || tr('친구', 'Friend');
  return `<div class="vs-card">
    <div class="vs-head">
      <div><span class="vs-dot me"></span>${esc(myLabel)} <b>${me.code}</b> ${esc(me.info.name)}</div>
      <div><span class="vs-dot them"></span>${esc(theirLabel)} <b>${v.code}</b> ${esc(other.name)}</div>
    </div>
    <div class="vs-rel"><strong>${esc(rel)}</strong> <span class="faint">${tr(`같은 글자 ${same}개`, `${same} of 4 letters match`)}</span><p>${esc(relDesc)}</p></div>
    <div class="type-axes">${rows}</div>
  </div>`;
}

/** 내 유형으로 비교 링크 만들기 → 공유 창 또는 복사 */
export async function shareCompare(v: VsInfo, button?: HTMLElement) {
  const t = TYPE_DATA.types.find((x) => x.code === v.code)!;
  const url = new URL(`/app?vs=${encodeVs(v)}${getLang() === 'en' ? '&lang=en' : ''}`, location.href).href;
  const text = tr(`내 체스 유형은 ${v.code} ${t.name}! 너는 어떤 유형인지 비교해 보자`, `My chess type is ${v.code}, the ${t.name}! Compare yours with mine`);
  try {
    if (navigator.share) { await navigator.share({ title: 'Stylish', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    if (button) { const old = button.textContent; button.textContent = tr('링크를 복사했어요!', 'Link copied!'); setTimeout(() => { button.textContent = old; }, 1500); }
  } catch { /* 공유 창을 닫은 경우 */ }
}
