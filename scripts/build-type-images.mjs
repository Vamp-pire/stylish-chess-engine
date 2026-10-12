// 체스 유형 이미지 만들기: 유형마다 공유 미리보기(1200×630)와 정사각형(600×600) PNG.
// SVG로 그린 뒤 resvg로 PNG 변환. 글꼴 Pretendard(OFL), 기물은 chessground의 cburnett 세트(GPLv2+).
// 사용: node scripts/build-type-images.mjs  → public/img/types/*.png (커밋해서 쓴다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/img/types/', ROOT);
const FONT_DIR = new URL('node_modules/.cache/pretendard/', ROOT);
mkdirSync(OUT, { recursive: true });
mkdirSync(FONT_DIR, { recursive: true });

// ── 글꼴 (처음 한 번 내려받기) ──
const WEIGHTS = ['Medium', 'Bold', 'ExtraBold'];
const fontFiles = [];
for (const w of WEIGHTS) {
  const file = new URL(`Pretendard-${w}.otf`, FONT_DIR);
  if (!existsSync(file)) {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-${w}.otf`);
    if (!res.ok) throw new Error(`글꼴을 받지 못했습니다: ${w}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  fontFiles.push(fileURLToPath(file));
}

// ── 기물 SVG (cburnett, chessground CSS에 base64로 들어 있음) ──
const css = readFileSync(new URL('node_modules/chessground/assets/chessground.cburnett.css', ROOT), 'utf8');
const piece = (name) => {
  const m = css.match(new RegExp(`piece\\.${name}\\.white\\s*\\{[^}]*base64,([A-Za-z0-9+/=]+)`));
  if (!m) throw new Error(`기물 없음: ${name}`);
  return Buffer.from(m[1], 'base64').toString('utf8').replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '');
};
/** <svg>를 원하는 위치·크기로 다시 감싼다 */
const placed = (svg, x, y, size, opacity = 1) =>
  svg.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 45 45" opacity="${opacity}">`);

const data = JSON.parse(readFileSync(new URL('src/data/chess-types.json', ROOT), 'utf8'));
const GROUP_COLOR = {
  AW: ['#5c1712', '#c2382d', '#ff8a7a'],
  AS: ['#5a3008', '#c47a14', '#ffcf7a'],
  PW: ['#241850', '#6a52cf', '#b7a8ff'],
  PS: ['#0d3a2a', '#26875d', '#8fe3bd'],
};
/** 유형별 상징 기물 */
const PIECE = {
  AWIO: 'knight', AWIE: 'queen', AWRO: 'bishop', AWRE: 'rook',
  ASIO: 'bishop', ASIE: 'queen', ASRO: 'knight', ASRE: 'rook',
  PWIO: 'pawn', PWIE: 'rook', PWRO: 'knight', PWRE: 'king',
  PSIO: 'pawn', PSIE: 'rook', PSRO: 'bishop', PSRE: 'king',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** 글자 수 기준 줄바꿈 (한글 전각 1, 영문·공백 0.55) */
function wrap(text, maxUnits) {
  const lines = [];
  let line = '', units = 0;
  for (const word of text.split(' ')) {
    const w = [...word].reduce((s, c) => s + (/[ -~]/.test(c) ? 0.55 : 1), 0);
    if (line && units + w + 0.3 > maxUnits) { lines.push(line); line = word; units = w; }
    else { line = line ? `${line} ${word}` : word; units += (line === word ? 0 : 0.3) + w; }
  }
  if (line) lines.push(line);
  return lines;
}

/** 체스판 무늬: 기물 뒤에 반투명 칸 */
function board(x0, y0, cell, n, color) {
  let s = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if ((r + c) % 2) continue;
    s += `<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${cell}" height="${cell}" rx="${cell * 0.12}" fill="${color}"/>`;
  }
  return s;
}

function cardSvg(t, w, h) {
  const g = t.code.slice(0, 2);
  const [dark, mid, light] = GROUP_COLOR[g];
  const group = data.groups[g];
  const wide = w > h;
  const pad = wide ? 72 : 48;
  const pieceSize = wide ? 400 : 250;
  const px = wide ? w - pieceSize - 40 : w - pieceSize - 4;
  const py = wide ? (h - pieceSize) / 2 + 10 : 26;
  const cell = wide ? 86 : 58;
  const bx = wide ? w - cell * 6 + 20 : w - cell * 5 + 30;
  const by = wide ? 10 : -20;
  const codeSize = wide ? 150 : 104;
  const tagLines = wrap(t.tagline, wide ? 17 : 15);
  const codeY = wide ? 280 : 360;
  const nameY = codeY + (wide ? 82 : 64);
  const tagY = nameY + (wide ? 66 : 52);
  const tagSize = wide ? 34 : 27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${wide ? 0.78 : 0.75}" cy="${wide ? 0.5 : 0.28}" r="${wide ? 0.45 : 0.55}">
      <stop offset="0" stop-color="${light}" stop-opacity="0.45"/><stop offset="1" stop-color="${light}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <g opacity="0.10">${board(bx, by, cell, 8, '#ffffff')}</g>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${placed(piece(PIECE[t.code]), px, py, pieceSize, 0.97)}
  <g font-family="Pretendard" fill="#ffffff">
    <g transform="translate(${pad}, ${wide ? 78 : 64})">
      ${placed(piece('knight'), 0, -30, wide ? 40 : 34)}
      <text x="${wide ? 50 : 42}" y="0" font-size="${wide ? 30 : 26}" font-weight="800">Stylish<tspan fill="${light}">.</tspan></text>
    </g>
    <g transform="translate(${pad}, ${wide ? 138 : 120})">
      <rect x="0" y="-30" rx="20" width="${wide ? 250 : 220}" height="42" fill="#ffffff" fill-opacity="0.16"/>
      <text x="18" y="-1" font-size="${wide ? 22 : 20}" font-weight="700">${esc(group.name)} · ${esc(group.en)}</text>
    </g>
    <text x="${pad - 4}" y="${codeY}" font-size="${codeSize}" font-weight="800" letter-spacing="6">${t.code}</text>
    <text x="${pad}" y="${nameY}" font-size="${wide ? 64 : 50}" font-weight="800">${esc(t.name)}<tspan dx="16" font-size="${wide ? 30 : 24}" font-weight="500" fill-opacity="0.75">${esc(t.en)}</tspan></text>
    ${tagLines.map((l, i) => `<text x="${pad}" y="${tagY + i * tagSize * 1.35}" font-size="${tagSize}" font-weight="500" fill-opacity="0.9">${esc(l)}</text>`).join('')}
    ${wide ? `<text x="${pad}" y="${h - 48}" font-size="22" font-weight="500" fill-opacity="0.7">나는 어떤 체스 플레이어일까? · 체스 유형 16가지</text>` : ''}
  </g>
</svg>`;
}

/** 첫 화면 공유 미리보기: 16유형 코드 격자 */
function landingSvg(w, h) {
  const tiles = data.types.map((t, i) => {
    const g = t.code.slice(0, 2), [, mid] = GROUP_COLOR[g];
    const c = i % 4, r = Math.floor(i / 4);
    const x = 640 + c * 128, y = 70 + r * 128;
    return `<rect x="${x}" y="${y}" width="116" height="116" rx="18" fill="${mid}"/>
      ${placed(piece(PIECE[t.code]), x + 30, y + 10, 56, 0.95)}
      <text x="${x + 58}" y="${y + 98}" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">${t.code}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#f6f5f2"/>
  <g font-family="Pretendard" fill="#1d1c1a">
    ${placed(piece('knight'), 72, 92, 52)}
    <text x="134" y="132" font-size="40" font-weight="800">Stylish<tspan fill="#b5562d">.</tspan></text>
    <text x="72" y="268" font-size="64" font-weight="800">나는 어떤</text>
    <text x="72" y="350" font-size="64" font-weight="800">체스 플레이어일까?</text>
    <text x="72" y="430" font-size="28" font-weight="500" fill="#5f5b53">내 게임으로 알아보는 체스 유형 16가지</text>
    <text x="72" y="474" font-size="24" font-weight="500" fill="#8f8a80">Stockfish + Maia3 · 무료 · 설치 없음</text>
  </g>
  <g font-family="Pretendard">${tiles}</g>
</svg>`;
}

const render = (svg, file) => {
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' } }).render().asPng();
  writeFileSync(new URL(file, OUT), png);
  return png.length;
};

let total = 0;
for (const t of data.types) {
  total += render(cardSvg(t, 1200, 630), `${t.code}.png`);
  total += render(cardSvg(t, 600, 600), `${t.code}-square.png`);
}
total += render(landingSvg(1200, 630), 'landing.png');
console.log(`유형 이미지 ${data.types.length * 2 + 1}장, ${(total / 1048576).toFixed(1)}MB`);
