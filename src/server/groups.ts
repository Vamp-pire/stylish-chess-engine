// 그룹 유형 지도: 코드로 공유하는 그룹에 내 유형을 올리고, 16칸 지도와 인원 분포로 본다.
// 내 유형은 그룹에 들어간 이 브라우저에서 종합 분석이 끝날 때마다 자동으로 갱신된다.
import { tr } from '../i18n';
import { TYPE_DATA, chessTypeOf, MIN_COUNTED, type ChessType } from '../core/chessType';
import { combinedProfile, getPlayer, type SavedPlayer } from '../ui/players';
import { withRating } from '../ui/typeCard';
import { rpc } from './supa';

const KEY = 'stylish.groups.v1';
/** 내가 들어간 그룹: 어떤 저장된 플레이어(아이디)로 들어갔는지, 닉네임 */
export interface MyGroup { code: string; name: string; playerKey: string; nickname: string | null }
export interface GroupMember { name: string; source: string; type: string | null; pcts: number[] | null; counted: number; updated_at: string; me: boolean }
export interface GroupInfo { code: string; name: string; created_at: string; members: GroupMember[] }

export function myGroups(): MyGroup[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
function saveMine(list: MyGroup[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 무시 */ } }

/** 저장된 플레이어의 지금 유형 (평가한 수가 적으면 null) */
export function playerType(p: SavedPlayer): ChessType | null {
  const prof = combinedProfile(p);
  return prof && prof.counted >= 20 ? chessTypeOf(withRating(prof, p.name)) : null;
}

export const getGroup = (code: string) => rpc<GroupInfo | null>('get_group', { p_code: code }, false);

export async function createGroup(name: string): Promise<string> {
  return rpc<string>('create_group', { p_name: name });
}

async function upsert(code: string, p: SavedPlayer, nickname: string | null) {
  const t = playerType(p);
  await rpc('upsert_group_member', {
    p_code: code, p_source: p.source, p_chess_id: p.name, p_nickname: nickname,
    p_type: t?.code ?? null, p_pcts: t ? t.axes.map((a) => a.pct) : null, p_counted: t?.counted ?? 0,
  });
}

export async function joinGroup(code: string, groupName: string, playerKey: string, nickname: string | null) {
  const p = getPlayer(playerKey);
  if (!p) throw new Error(tr('플레이어 기록을 찾을 수 없어요.', 'Player record not found.'));
  await upsert(code, p, nickname);
  saveMine([...myGroups().filter((g) => g.code !== code), { code, name: groupName, playerKey, nickname }]);
}

export async function leaveGroup(code: string) {
  await rpc('leave_group', { p_code: code });
  saveMine(myGroups().filter((g) => g.code !== code));
}

/** 종합 분석이 끝난 아이디가 들어가 있는 그룹마다 새 유형으로 갱신 (조용히) */
export function refreshGroupsFor(playerKey: string) {
  const p = getPlayer(playerKey);
  if (!p) return;
  for (const g of myGroups().filter((x) => x.playerKey === playerKey)) upsert(g.code, p, g.nickname).catch(() => { /* 다음에 */ });
}

// ───────────── 화면 ─────────────
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 16칸 지도 + 축별 인원 분포 */
export function groupMapHtml(info: GroupInfo): string {
  const by: Record<string, GroupMember[]> = {};
  for (const m of info.members) if (m.type) (by[m.type] ??= []).push(m);
  const cells = TYPE_DATA.types.map((t) => {
    const ms = by[t.code] ?? [];
    const names = ms.slice(0, 6).map((m) => `<span class="${m.me ? 'me' : ''}${m.counted < MIN_COUNTED ? ' unsure' : ''}" title="${m.counted < MIN_COUNTED ? esc(tr('평가한 수가 적어 바뀔 수 있어요', 'Few moves rated; may change')) : ''}">${esc(m.name)}</span>`).join('');
    return `<div class="gm-cell g-${t.code.slice(0, 2)}${ms.length ? ' on' : ''}">
      <div class="gm-head"><b>${t.code}</b><span>${esc(t.name)}</span><em>${ms.length || ''}</em></div>
      <div class="gm-names">${names}${ms.length > 6 ? `<span class="faint">+${ms.length - 6}</span>` : ''}</div></div>`;
  }).join('');
  const typed = info.members.filter((m) => m.type);
  const axes = TYPE_DATA.axes.map((ax, i) => {
    const first = typed.filter((m) => m.type![i] === ax.letters[0]).length;
    const pct = typed.length ? Math.round((first / typed.length) * 100) : 50;
    return `<div class="gm-axis"><span>${ax.letters[0]} ${esc(ax.names[0])} <b>${first}</b></span><div class="gm-bar"><i style="width:${pct}%"></i></div><span><b>${typed.length - first}</b> ${esc(ax.names[1])} ${ax.letters[1]}</span></div>`;
  }).join('');
  const noType = info.members.length - typed.length;
  return `<div class="gm-grid">${cells}</div>
    <div class="section-title">${tr('축별 인원', 'Members by axis')}</div><div class="gm-axes">${axes}</div>
    ${noType ? `<p class="faint">${tr(`아직 유형이 없는 멤버 ${noType}명 (게임을 더 분석하면 자동으로 들어가요)`, `${noType} members without a type yet (added automatically after more games)`)}</p>` : ''}`;
}
