// 월간 결산: 이번 달(월초 1주일은 지난달) 둔 게임의 성적·유형·정확도 변화·대담한 수를 한 장의 카드로.
// 결과 이미지처럼 저장·복사·공유할 수 있다. 저장된 기록(이 브라우저)만 쓴다.
import { tr, getLang } from '../i18n';
import { mergeProfiles, type PlayerProfile } from '../core/profile';
import { chessTypeOf } from '../core/chessType';
import { openModal } from './modal';
import type { SavedGame } from './players';
import { withRating } from './typeCard';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const RISKS = ['soundSacrifice', 'speculative', 'trap', 'gamble'] as const;

export interface MonthStats {
  year: number; month: number; // month: 0~11
  games: number; win: number; draw: number; loss: number;
  profile: PlayerProfile; code: string | null; typeName: string | null;
  accuracy: number; prevAccuracy: number | null;
  risky: number; topOpening: string | null;
}

const when = (g: SavedGame) => g.date ?? g.savedAt;

/** 월초 1주일은 지난달 결산, 그 밖에는 이번 달 */
export function recapMonth(now = new Date()): { year: number; month: number; last: boolean } {
  if (now.getDate() <= 7) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth(), last: true };
  }
  return { year: now.getFullYear(), month: now.getMonth(), last: false };
}

export function monthStats(games: SavedGame[], year: number, month: number, name: string): MonthStats | null {
  const inMonth = (g: SavedGame, y: number, m: number) => { const d = new Date(when(g)); return d.getFullYear() === y && d.getMonth() === m; };
  const list = games.filter((g) => inMonth(g, year, month));
  if (!list.length) return null;
  const prevD = new Date(year, month - 1, 1);
  const prev = games.filter((g) => inMonth(g, prevD.getFullYear(), prevD.getMonth()));
  const profile = mergeProfiles(list.map((g) => g.profile))!;
  const prevProfile = prev.length ? mergeProfiles(prev.map((g) => g.profile)) : null;
  const t = profile.counted >= 20 ? chessTypeOf(withRating(profile, name)) : null;
  const openings = new Map<string, number>();
  for (const g of list) if (g.opening) openings.set(g.opening, (openings.get(g.opening) ?? 0) + 1);
  return {
    year, month, games: list.length,
    win: list.filter((g) => g.result === 'win').length, draw: list.filter((g) => g.result === 'draw').length, loss: list.filter((g) => g.result === 'loss').length,
    profile, code: t?.code ?? null, typeName: t ? t.info.name : null,
    accuracy: profile.accuracy, prevAccuracy: prevProfile ? prevProfile.accuracy : null,
    risky: RISKS.reduce((s, k) => s + (profile.risk[k]?.count ?? 0), 0),
    topOpening: [...openings].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

const monthLabel = (s: MonthStats) => getLang() === 'en'
  ? new Date(s.year, s.month, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
  : `${s.year}년 ${s.month + 1}월`;

/** 프로필 화면의 결산 줄 */
export function monthlySection(games: SavedGame[], name: string): string {
  const m = recapMonth();
  const s = monthStats(games, m.year, m.month, name);
  if (!s) return '';
  const diff = s.prevAccuracy != null ? Math.round((s.accuracy - s.prevAccuracy) * 10) / 10 : null;
  return `<div class="return-row weekly"><div><b>${m.last ? tr(`지난달 결산 · ${monthLabel(s)}`, `Last month · ${monthLabel(s)}`) : tr(`이번 달 결산 · ${monthLabel(s)}`, `This month · ${monthLabel(s)}`)}</b>
      <span class="faint">${tr(`${s.games}판 · ${s.win}승 ${s.draw}무 ${s.loss}패`, `${s.games} games · ${s.win}W ${s.draw}D ${s.loss}L`)}${s.topOpening ? ` · ${tr('가장 많이 둔 오프닝', 'Most played')}: ${esc(s.topOpening)}` : ''}</span></div>
    <div class="weekly-stats">
      <span><b>${s.code ?? '—'}</b>${s.typeName ? esc(s.typeName) : tr('판이 더 필요해요', 'Needs more games')}</span>
      <span><b>${s.accuracy}%</b>${tr('정확도', 'Accuracy')}${diff != null ? ` <em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}</em>` : ''}</span>
      <span><b>${s.risky}</b>${tr('희생·함정·도박', 'Sacrifices · traps · gambles')}</span>
    </div>
    <button class="btn" data-recap-image>${tr('결산 카드 만들기', 'Make recap card')}</button></div>`;
}

const GROUP_COLOR: Record<string, [string, string]> = { AW: ['#5c1712', '#c2382d'], AS: ['#5a3008', '#c47a14'], PW: ['#241850', '#6a52cf'], PS: ['#0d3a2a', '#26875d'] };
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function drawRecap(canvas: HTMLCanvasElement, s: MonthStats, name: string) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const [dark, mid] = GROUP_COLOR[s.code?.slice(0, 2) ?? 'PS'];
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, dark); bg.addColorStop(1, mid);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 40px ${FONT}`; ctx.fillText('Stylish.', 80, 120);
  ctx.font = `700 44px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(tr(`${name}의 ${monthLabel(s)} 체스 결산`, `${name}'s ${monthLabel(s)} chess recap`), 80, 220);
  ctx.fillStyle = '#fff'; ctx.font = `800 170px ${FONT}`; ctx.fillText(s.code ?? '—', 80, 410);
  ctx.font = `800 64px ${FONT}`; ctx.fillText(s.typeName ?? tr('판이 더 필요해요', 'Needs more games'), 80, 500);
  const diff = s.prevAccuracy != null ? Math.round((s.accuracy - s.prevAccuracy) * 10) / 10 : null;
  const rows: [string, string][] = [
    [tr('게임', 'Games'), tr(`${s.games}판 · ${s.win}승 ${s.draw}무 ${s.loss}패`, `${s.games} · ${s.win}W ${s.draw}D ${s.loss}L`)],
    [tr('정확도', 'Accuracy'), `${s.accuracy}%${diff != null ? ` (${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)})` : ''}`],
    [tr('희생·함정·도박', 'Sacrifices · traps · gambles'), String(s.risky)],
    [tr('많이 둔 오프닝', 'Most played opening'), s.topOpening ?? '—'],
  ];
  let y = 620;
  for (const [k, v] of rows) {
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(80, y - 58, W - 160, 84, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 34px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(k, 110, y);
    ctx.fillStyle = '#fff'; ctx.font = `800 36px ${FONT}`; ctx.textAlign = 'right';
    let val = v; while (val.length > 4 && ctx.measureText(val).width > 560) val = val.slice(0, -2) + '…';
    ctx.fillText(val, W - 110, y); ctx.textAlign = 'left';
    y += 104;
  }
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`${tr('나의 체스 유형은?', "What's your chess type?")} stylish-chess-engine.pages.dev`, 80, H - 50);
}

export async function openRecapImage(games: SavedGame[], name: string) {
  const m = recapMonth();
  const s = monthStats(games, m.year, m.month, name);
  if (!s) return;
  await Promise.all(['800', '700', '500'].map((w) => document.fonts.load(`${w} 40px ${FONT}`, '가A').catch(() => null)));
  const body = openModal(tr('월간 결산 카드', 'Monthly recap card'), `<div class="ri"><div class="ri-preview"><canvas class="ri-canvas"></canvas></div>
    <div class="ri-side"><div class="ri-actions"><button type="button" class="ri-primary" data-rc-copy>${tr('이미지 복사', 'Copy image')}</button><button type="button" data-rc-save>${tr('저장', 'Save')}</button></div><p class="ri-msg faint" aria-live="polite"></p></div></div>`);
  const canvas = body.querySelector<HTMLCanvasElement>('canvas')!;
  drawRecap(canvas, s, name);
  const msg = body.querySelector<HTMLElement>('.ri-msg')!;
  const blob = () => new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/png'));
  body.querySelector<HTMLButtonElement>('[data-rc-copy]')!.onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]); msg.textContent = tr('복사했어요!', 'Copied!'); }
    catch { msg.textContent = tr('이 브라우저에서는 복사가 안 돼요. 저장을 눌러 주세요.', "This browser can't copy images. Please use Save."); }
  };
  body.querySelector<HTMLButtonElement>('[data-rc-save]')!.onclick = async () => {
    const url = URL.createObjectURL(await blob());
    const a = document.createElement('a'); a.href = url; a.download = `stylish-recap-${s.year}-${s.month + 1}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
