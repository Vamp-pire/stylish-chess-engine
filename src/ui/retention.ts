// 다시 올 이유: 유형 도감, 스타일 챌린지, 체스 친구, 이번 주 리포트. 모두 이 브라우저(localStorage)에만 저장한다.
import { tr } from '../i18n';
import { TYPE_DATA, chessTypeOf, type ChessType } from '../core/chessType';
import { mergeProfiles, type PlayerProfile } from '../core/profile';
import type { VsInfo } from './compare';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } }
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 가득 차면 이번만 */ } }
const fmtDay = (ms: number) => { const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()}`; };

// ───────────── 유형 도감: 지금까지 나온 내 유형 ─────────────
const DEX_KEY = 'stylish.typedex.v1';
type Dex = Record<string, Record<string, number>>; // 플레이어 → 유형 코드 → 처음 나온 때

/** 믿을 만한(평가 수가 충분한) 유형이 나오면 도감에 넣는다. 새로 넣었으면 true */
export function recordType(player: string, t: ChessType | null): boolean {
  if (!t || !t.reliable) return false;
  const dex = read<Dex>(DEX_KEY, {});
  const mine = (dex[player] ??= {});
  if (mine[t.code]) return false;
  mine[t.code] = Date.now();
  write(DEX_KEY, dex);
  return true;
}

export function typeDexSection(player: string): string {
  const mine = read<Dex>(DEX_KEY, {})[player] ?? {};
  const got = Object.keys(mine).length;
  if (!got) return '';
  const cells = TYPE_DATA.types.map((t) => mine[t.code]
    ? `<a class="dex-cell on g-${t.code.slice(0, 2)}" href="/types/${t.code}" target="_blank" rel="noopener" title="${esc(t.name)} · ${fmtDay(mine[t.code])}"><b>${t.code}</b><span>${esc(t.name)}</span></a>`
    : `<span class="dex-cell" title="${tr('아직 안 나온 유형', 'Not seen yet')}"><b>????</b></span>`).join('');
  return `<div class="return-row dex"><div><b>${tr(`유형 도감 ${got}/16`, `Type collection ${got}/16`)}</b>
    <span class="faint">${tr('분석할 때마다 나온 유형이 모여요. 시간대·시기마다 다른 내가 나와요.', 'Every type you get is collected here. Different time controls and periods bring out different sides of you.')}</span></div>
    <div class="dex-grid">${cells}</div></div>`;
}

// ───────────── 스타일 챌린지: 한 축을 반대쪽으로 옮겨 보기 ─────────────
const CH_KEY = 'stylish.challenge.v1';
interface Challenge { axis: number; toward: 0 | 1; start: number; at: number }

export function setChallenge(player: string, axis: number, toward: 0 | 1, startPct: number) {
  const all = read<Record<string, Challenge>>(CH_KEY, {});
  all[player] = { axis, toward, start: startPct, at: Date.now() };
  write(CH_KEY, all);
}
export function clearChallenge(player: string) {
  const all = read<Record<string, Challenge>>(CH_KEY, {});
  delete all[player];
  write(CH_KEY, all);
}

/** 최근 판들의 유형으로 진행 상황을 보여준다. 도전이 없으면 고를 수 있게 */
export function challengeSection(player: string, recent: ChessType | null): string {
  if (!recent) return '';
  const ch = read<Record<string, Challenge>>(CH_KEY, {})[player];
  if (!ch) {
    // 가장 한쪽으로 치우친 축을 반대로 옮겨 보는 도전을 추천
    const opts = recent.axes.map((a, i) => ({ i, a, ax: TYPE_DATA.axes[i] }));
    const buttons = opts.map(({ i, a, ax }) => {
      const toward: 0 | 1 = a.letter === ax.letters[0] ? 1 : 0;
      return `<button type="button" class="chip" data-challenge="${i}:${toward}:${a.pct}">${ax.letters[toward]} ${esc(ax.names[toward])}${tr('쪽으로', '')}</button>`;
    }).join('');
    return `<div class="return-row"><div><b>${tr('스타일 챌린지', 'Style challenge')}</b>
      <span class="faint">${tr('평소와 반대 스타일로 둬 보세요. 다음에 새 게임을 분석하면 얼마나 옮겨 갔는지 보여줘요.', 'Try playing against your usual style. Next time you analyze new games, we show how far you moved.')}</span></div>
      <div class="chips">${buttons}</div></div>`;
  }
  const ax = TYPE_DATA.axes[ch.axis];
  const now = recent.axes[ch.axis].pct;
  // 백분위는 앞 글자 쪽이 클수록 높다. 목표가 뒤 글자면 낮아질수록 성공
  const moved = ch.toward === 0 ? now - ch.start : ch.start - now;
  const done = ch.toward === 0 ? now >= 50 : now < 50;
  return `<div class="return-row"><div><b>${tr('스타일 챌린지', 'Style challenge')}: ${ax.letters[ch.toward]} ${esc(ax.names[ch.toward])}${tr('쪽으로', '')}</b>
    <span class="faint">${tr(`${fmtDay(ch.at)} 시작 · ${ch.start}% → 최근 ${now}%`, `Started ${fmtDay(ch.at)} · ${ch.start}% → now ${now}%`)} · ${done ? tr('🎉 성공! 글자가 바뀌었어요', '🎉 Done! The letter flipped') : moved > 0 ? tr(`${moved}%p 옮겨 갔어요`, `moved ${moved} pp`) : tr('아직 그대로예요', 'no change yet')}</span></div>
    <button type="button" class="ghost small" data-challenge-clear>${tr('그만두기', 'Stop')}</button></div>`;
}

// ───────────── 체스 친구: 비교 링크로 받은 친구들 ─────────────
const FR_KEY = 'stylish.friends.v1';
export function saveFriend(v: VsInfo) {
  if (!v.name) return;
  const all = read<Record<string, VsInfo & { at: number }>>(FR_KEY, {});
  all[v.name.toLowerCase()] = { ...v, at: Date.now() };
  write(FR_KEY, all);
}
export function friendsSection(me: ChessType | null): string {
  const list = Object.values(read<Record<string, VsInfo & { at: number }>>(FR_KEY, {})).sort((a, b) => b.at - a.at);
  if (!list.length) return '';
  const rows = list.slice(0, 8).map((f) => {
    const t = TYPE_DATA.types.find((x) => x.code === f.code);
    const same = me ? [...me.code].filter((c, i) => c === f.code[i]).length : null;
    return `<div class="friend"><b>${esc(f.name)}</b> <span class="type-code small">${f.code}</span> <span class="faint">${t ? esc(t.name) : ''}${same != null ? tr(` · 나와 같은 글자 ${same}개`, ` · ${same} letters in common`) : ''}</span></div>`;
  }).join('');
  return `<div class="return-row"><div><b>${tr('체스 친구', 'Chess friends')}</b><span class="faint">${tr('비교 링크를 보내 준 친구들이에요. 링크를 다시 받으면 새 유형으로 바뀌어요.', 'Friends who sent you a compare link. A new link updates their type.')}</span></div>
    <div class="friends">${rows}</div></div>`;
}

// ───────────── 이번 주 리포트 ─────────────
interface GameLike { date: number | null; savedAt: number; profile: PlayerProfile }
export function weeklySection(games: GameLike[]): string {
  const WEEK = 7 * 86400000, now = Date.now();
  const when = (g: GameLike) => g.date ?? g.savedAt;
  const thisWeek = games.filter((g) => now - when(g) < WEEK);
  if (!thisWeek.length) return '';
  const before = games.filter((g) => now - when(g) >= WEEK);
  const pw = mergeProfiles(thisWeek.map((g) => g.profile))!, pb = before.length ? mergeProfiles(before.map((g) => g.profile)) : null;
  const tw = pw.counted >= 20 ? chessTypeOf(pw) : null, tb = pb && pb.counted >= 20 ? chessTypeOf(pb) : null;
  const accDiff = pb ? Math.round((pw.accuracy - pb.accuracy) * 10) / 10 : null;
  const risky = ['soundSacrifice', 'speculative', 'trap', 'gamble'].reduce((s, k) => s + (pw.risk[k as keyof typeof pw.risk]?.count ?? 0), 0);
  return `<div class="return-row weekly"><div><b>${tr('이번 주 리포트', 'This week')}</b>
    <span class="faint">${tr(`최근 7일 ${thisWeek.length}판`, `${thisWeek.length} games in the last 7 days`)}</span></div>
    <div class="weekly-stats">
      <span><b>${pw.accuracy}%</b>${tr('정확도', 'Accuracy')}${accDiff != null ? ` <em class="${accDiff >= 0 ? 'up' : 'down'}">${accDiff >= 0 ? '▲' : '▼'} ${Math.abs(accDiff)}</em>` : ''}</span>
      <span><b>${tw ? tw.code : '—'}</b>${tr('이번 주 유형', 'Type this week')}${tb && tw && tb.code !== tw.code ? ` <em>${tr(`평소 ${tb.code}`, `usually ${tb.code}`)}</em>` : ''}</span>
      <span><b>${risky}</b>${tr('희생·함정·도박', 'Sacrifices · traps · gambles')}</span>
    </div></div>`;
}
