// 이 판의 명수: 희생·함정·조용한 수 등 인상적인 수를 골라 보드 그림 카드(PNG)로 만든다.
import pieceCss from 'chessground/assets/chessground.cburnett.css?raw';
import type { MoveAnalysis } from '../core/analyzer';
import { STYLES, RISK_LABEL, QUALITY_LABEL, type RiskKind } from '../core/styles';

const RISK_RANK: Record<RiskKind, number> = { soundSacrifice: 100, trap: 85, speculative: 75, gamble: 65 };

export interface Highlight { move: MoveAnalysis; title: string; why: string }

/** 인상적인 수 최대 n개 (이론·강제된 수와 실수는 뺀다). color를 주면 그쪽 수만 */
export function pickHighlights(moves: MoveAnalysis[], color?: 'w' | 'b', n = 3): Highlight[] {
  const scored = moves.filter((m) => !m.book && !m.forced && (!color || m.color === color) && m.quality !== 'blunder' && m.quality !== 'mistake')
    .map((m) => {
      const styleMax = Math.max(...Object.values(m.scores));
      let rank = 0, title = '', why = '';
      if (m.risk) { rank = RISK_RANK[m.risk]; title = RISK_LABEL[m.risk]; why = m.riskWhy ?? ''; }
      else if (m.scores.quiet >= 60) { rank = 55; title = '조용한 결정타'; why = m.reasons.quiet[0]?.why ?? ''; }
      else if (m.deep.isBest && m.deep.bestGap >= 150) { rank = 50; title = '유일한 수'; why = `다른 후보보다 ${Math.round(m.deep.bestGap)}cp 좋은 수를 찾음`; }
      else if (m.features.isMate) { rank = 45; title = '체크메이트'; why = ''; }
      return { m, rank: rank + styleMax / 100, title, why };
    })
    .filter((x) => x.title)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .sort((a, b) => a.m.ply - b.m.ply);
  return scored.map((x) => ({ move: x.m, title: x.title, why: x.why }));
}

// ───────────── 카드 그리기 ─────────────

const PIECE_NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
let pieceImages: Promise<Record<string, HTMLImageElement>> | null = null;

/** chessground 기물 CSS에 들어 있는 SVG를 그대로 쓴다 */
function loadPieces() {
  pieceImages ??= Promise.all(Object.entries(PIECE_NAMES).flatMap(([t, name]) => (['white', 'black'] as const).map((c) => {
    const url = pieceCss.match(new RegExp(`piece\\.${name}\\.${c}\\s*\\{\\s*background-image:\\s*url\\('([^']+)'\\)`))?.[1];
    return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([`${c[0]}${t}`, img]);
      img.onerror = reject;
      img.src = url ?? '';
    });
  }))).then((list) => Object.fromEntries(list));
  return pieceImages;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  return lines;
}

export interface CardInfo { white: string; black: string; event?: string; flip?: boolean }

/** 1080×1350 세로 카드 */
export async function drawCard(h: Highlight, info: CardInfo): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350, PAD = 60, BOARD = 840, SQ = BOARD / 8, TOP = 190, BX = (W - BOARD) / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';
  const m = h.move;
  const accent = m.risk ? '#a855f7' : STYLES[m.primary === 'neutral' ? 'quiet' : m.primary].color;

  // 배경
  ctx.fillStyle = '#1f1e1b'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 10);

  // 머리말
  ctx.fillStyle = '#e0855a'; ctx.font = `700 34px ${font}`; ctx.textBaseline = 'top';
  ctx.fillText('Stylish ♞', PAD, 48);
  ctx.fillStyle = '#b9b3a8'; ctx.font = `500 30px ${font}`;
  const players = `${info.white} vs ${info.black}`;
  ctx.fillText(wrapText(ctx, players, W - PAD * 2, 1)[0], PAD, 100);
  if (info.event) { ctx.fillStyle = '#8a847a'; ctx.font = `400 24px ${font}`; ctx.fillText(wrapText(ctx, info.event, W - PAD * 2, 1)[0], PAD, 142); }

  // 보드 (둔 수 강조)
  const pieces = await loadPieces();
  const flip = !!info.flip;
  const sqXY = (sq: string) => {
    const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    return flip ? [BX + (7 - f) * SQ, TOP + r * SQ] : [BX + f * SQ, TOP + (7 - r) * SQ];
  };
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    ctx.fillStyle = (r + f) % 2 ? '#b58863' : '#f0d9b5';
    ctx.fillRect(BX + f * SQ, TOP + r * SQ, SQ, SQ);
  }
  for (const sq of [m.from, m.to]) { const [x, y] = sqXY(sq); ctx.fillStyle = 'rgba(155, 199, 0, 0.45)'; ctx.fillRect(x, y, SQ, SQ); }
  const rows = m.fenAfter.split(' ')[0].split('/');
  rows.forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { fi += Number(ch); continue; }
      const sq = String.fromCharCode(97 + fi) + (8 - ri);
      const [x, y] = sqXY(sq);
      const key = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
      ctx.drawImage(pieces[key], x, y, SQ, SQ);
      fi++;
    }
  });

  // 수와 판정
  let y = TOP + BOARD + 36;
  ctx.fillStyle = '#f1eee8'; ctx.font = `800 64px ${font}`;
  const san = `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`;
  ctx.fillText(san, PAD, y);
  const sanW = ctx.measureText(san).width;
  ctx.font = `700 34px ${font}`;
  const tag = h.title + (m.quality ? ` · ${QUALITY_LABEL[m.quality]}` : '');
  const tagW = ctx.measureText(tag).width + 36;
  ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(PAD + sanW + 28, y + 8, tagW, 54, 27); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(tag, PAD + sanW + 46, y + 16);
  y += 96;
  if (h.why) {
    ctx.fillStyle = '#b9b3a8'; ctx.font = `400 28px ${font}`;
    for (const line of wrapText(ctx, h.why, W - PAD * 2, 2)) { ctx.fillText(line, PAD, y); y += 40; }
  }
  const tops = m.top.slice(0, 3).map((k) => `${STYLES[k].label} ${m.scores[k]}`).join('   ');
  if (tops) { ctx.fillStyle = '#8a847a'; ctx.font = `600 26px ${font}`; ctx.fillText(tops, PAD, H - 70); }
  return cv;
}

export const cardBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다'))), 'image/png'));
