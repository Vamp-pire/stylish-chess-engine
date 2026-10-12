// 체스 유형 이미지 만들기: 유형마다 공유 미리보기(1200×630)와 정사각형(600×600) PNG.
// SVG로 그린 뒤 resvg로 PNG 변환. 글꼴 Pretendard(OFL), 기물은 chessground의 cburnett 세트(GPLv2+).
// 사용: node scripts/build-type-images.mjs  → public/img/types/*.png, public/img/pieces/*.svg (커밋해서 쓴다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = new URL('../', import.meta.url);
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const OUT = argv.includes('--out') ? new URL(`file:///${argv[argv.indexOf('--out') + 1].replace(/\\/g, '/').replace(/\/?$/, '/')}`) : new URL('public/img/types/', ROOT);
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
const piece = (name, color = 'white') => {
  const m = css.match(new RegExp(`piece\\.${name}\\.${color}\\s*\\{[^}]*base64,([A-Za-z0-9+/=]+)`));
  if (!m) throw new Error(`기물 없음: ${name}`);
  return Buffer.from(m[1], 'base64').toString('utf8').replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '');
};
/** <svg>를 원하는 위치·크기로 다시 감싼다 */
const placed = (svg, x, y, size, opacity = 1) =>
  svg.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 45 45" opacity="${opacity}">`);

const data = JSON.parse(readFileSync(new URL('src/data/chess-types.json', ROOT), 'utf8'));
const EN = JSON.parse(readFileSync(new URL('src/data/chess-types.en.json', ROOT), 'utf8'));
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
/**
 * 유형별 장면: 5×5 작은 판 위에서 그 유형이 하는 행동. 흰 기물 = 나, 검은 기물 = 상대.
 * pieces: '흰/검 + 기물 글자' (wN, bK …)와 칸(a1~e5). ghost: 반투명 기물(도착할 자리)
 * arrows: g = 내 수(초록), r = 상대 위협(빨강). curve: 휘는 정도(칸 단위, 부호로 방향), dash: 점선, cut: 화살촉 대신 끊김(막힘)
 * marks: star = 좋은 자리, shade = 장악한 칸
 */
const SCENES = {
  // 공세형
  AWIO: { pieces: [['wN', 'b2'], ['bP', 'b3'], ['bP', 'c3'], ['bP', 'd3'], ['bK', 'e5']], ghost: [['wN', 'c4']],
    arrows: [{ from: 'b2', to: 'c4', c: 'g', curve: -0.9 }, { from: 'c4', to: 'e5', c: 'g' }] },
  AWIE: { pieces: [['wR', 'e1'], ['wQ', 'e2'], ['bP', 'd5'], ['bK', 'e5'], ['bP', 'c4']],
    arrows: [{ from: 'e2', to: 'e5', c: 'g' }] },
  AWRO: { pieces: [['bQ', 'd5'], ['wN', 'b3'], ['wR', 'a4'], ['bK', 'e4']],
    arrows: [{ from: 'd5', to: 'b3', c: 'r' }, { from: 'a4', to: 'e4', c: 'g' }] },
  AWRE: { pieces: [['wR', 'c1'], ['bR', 'c5'], ['wK', 'e1'], ['bK', 'a5']],
    arrows: [{ from: 'c1', to: 'c3', c: 'g', end: 0.05 }, { from: 'c5', to: 'c3', c: 'r', end: 0.05 }] },
  // 정밀형
  ASIO: { pieces: [['wB', 'a1'], ['bQ', 'e5'], ['bP', 'b4'], ['bP', 'd2'], ['wP', 'a3']],
    arrows: [{ from: 'a1', to: 'e5', c: 'g' }] },
  ASIE: { pieces: [['bK', 'c5'], ['wQ', 'a3'], ['wN', 'd3'], ['wB', 'e3']],
    arrows: [{ from: 'a3', to: 'c5', c: 'g' }, { from: 'd3', to: 'c5', c: 'g', curve: 0.6 }, { from: 'e3', to: 'c5', c: 'g' }] },
  ASRO: { pieces: [['wP', 'b3'], ['bQ', 'b5'], ['wN', 'd2'], ['bK', 'e4']],
    arrows: [{ from: 'b5', to: 'b3', c: 'r' }, { from: 'd2', to: 'b3', c: 'g', curve: 0.5 }, { from: 'd2', to: 'e4', c: 'g', curve: -0.5 }] },
  ASRE: { pieces: [['bN', 'e5'], ['wR', 'd1'], ['wK', 'b1']], ghost: [['bN', 'd3']],
    arrows: [{ from: 'e5', to: 'd3', c: 'r', curve: 0.5 }, { from: 'd1', to: 'd3', c: 'g' }] },
  // 전략형
  PWIO: { pieces: [['wP', 'a3'], ['wP', 'b4'], ['wP', 'c2'], ['bP', 'd5'], ['bP', 'e4'], ['bP', 'c5']],
    arrows: [{ from: 'b4', to: 'b5', c: 'g' }, { from: 'c2', to: 'c4', c: 'g' }] },
  PWIE: { pieces: [['wP', 'a3'], ['wP', 'b3'], ['wP', 'c3'], ['bP', 'a5'], ['bP', 'b5'], ['bK', 'd5']],
    arrows: [{ from: 'a3', to: 'a4', c: 'g' }, { from: 'b3', to: 'b4', c: 'g' }, { from: 'c3', to: 'c4', c: 'g' }] },
  PWRO: { pieces: [['wK', 'c2'], ['bQ', 'e2'], ['bR', 'a1']],
    arrows: [{ from: 'e2', to: 'c2', c: 'r' }, { from: 'a1', to: 'd1', c: 'r' }, { from: 'c2', to: 'b3', c: 'g' }] },
  PWRE: { pieces: [['wK', 'b1'], ['wP', 'a2'], ['wP', 'b2'], ['wB', 'c2'], ['wR', 'd2'], ['bQ', 'e4'], ['bR', 'd5'], ['bN', 'a4']],
    arrows: [{ from: 'e4', to: 'c2', c: 'r', cut: true }, { from: 'd5', to: 'd2', c: 'r', cut: true }, { from: 'a4', to: 'b2', c: 'r', cut: true, curve: 0.4 }] },
  // 안정형
  PSIO: { pieces: [['wN', 'e1'], ['wP', 'c3'], ['wP', 'e3'], ['bP', 'd5']], ghost: [['wN', 'c2']], marks: { star: ['d4'] },
    arrows: [{ from: 'e1', to: 'c2', c: 'g', curve: 0.5 }, { from: 'c2', to: 'd4', c: 'g', curve: -0.5 }] },
  PSIE: { pieces: [['wR', 'a4'], ['wR', 'e3'], ['bK', 'c5'], ['bN', 'e5']], marks: { shade: ['a4', 'b4', 'c4', 'd4', 'e4'] },
    arrows: [{ from: 'a4', to: 'e4', c: 'g' }] },
  PSRO: { pieces: [['bN', 'c5'], ['wB', 'e2'], ['wK', 'b2'], ['wR', 'e1']],
    arrows: [{ from: 'c5', to: 'd3', c: 'r', cut: true, curve: 0.5 }, { from: 'e2', to: 'd3', c: 'g' }] },
  PSRE: { pieces: [['wK', 'c1'], ['wP', 'b2'], ['wP', 'c2'], ['wP', 'd2'], ['bQ', 'c5'], ['bB', 'e4']],
    arrows: [{ from: 'c5', to: 'c2', c: 'r', cut: true }, { from: 'e4', to: 'c2', c: 'r', cut: true }] },
};

const PIECE_NAME = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const ARROW = { g: '#18a046', r: '#d42f2f' };
/** 배경 위 장면용: 내 수는 흰색, 상대 위협은 짙은색(흰 테두리) */
const FLOAT_ARROW = { g: '#ffffff', r: '#1c1916' };

/** 떠 있는 장면: 별도 판 없이 카드 배경의 체스 무늬 칸 위에 기물·화살표를 놓는다 */
function floatSceneSvg(scene, x0, y0, size) {
  const n = 5, cell = size / n;
  const at = (sq) => {
    const c = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    return [x0 + c * cell + cell / 2, y0 + (n - 1 - r) * cell + cell / 2];
  };
  let out = `<defs><filter id="halo" x="-15%" y="-15%" width="130%" height="130%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="${cell * 0.035}" result="d"/>
    <feFlood flood-color="#ffffff" flood-opacity="0.95"/><feComposite in2="d" operator="in" result="o"/>
    <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  for (const sq of scene.marks?.shade ?? []) {
    const [cx, cy] = at(sq);
    out += `<rect x="${cx - cell / 2 + 4}" y="${cy - cell / 2 + 4}" width="${cell - 8}" height="${cell - 8}" rx="${cell * 0.14}" fill="#ffffff" fill-opacity="0.3"/>`;
  }
  for (const sq of scene.marks?.star ?? []) {
    const [cx, cy] = at(sq);
    out += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.36}" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-width="${cell * 0.06}"/>`;
  }
  const drawPiece = ([code, sq], opacity = 1) => {
    const [cx, cy] = at(sq);
    const white = code[0] === 'w';
    // 상대(검은) 기물은 얇은 흰 테두리로 어두운 배경에서도 보이게
    const svg = placed(piece(PIECE_NAME[code[1]], white ? 'white' : 'black'), cx - cell * 0.44, cy - cell * 0.44, cell * 0.88, opacity);
    return white ? svg : `<g filter="url(#halo)">${svg}</g>`;
  };
  const arrows = (scene.arrows ?? []).map((a) => {
    const [x1, y1] = at(a.from), [x2, y2] = at(a.to);
    const color = FLOAT_ARROW[a.c], w = cell * 0.15;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    const k = (a.curve ?? 0) * cell;
    const qx = (x1 + x2) / 2 - (dy / len) * k, qy = (y1 + y2) / 2 + (dx / len) * k;
    const ex = x2 - qx, ey = y2 - qy, el = Math.hypot(ex, ey);
    const ux = ex / el, uy = ey / el;
    const head = cell * 0.34, back = a.cut ? cell * 0.62 : (a.end ?? 0.3) * cell;
    const tipX = x2 - ux * back, tipY = y2 - uy * back;
    const baseX = tipX - ux * head, baseY = tipY - uy * head;
    const sx = x1 + (dx / len) * cell * 0.3, sy = y1 + (dy / len) * cell * 0.3;
    const endX = a.cut ? tipX : baseX, endY = a.cut ? tipY : baseY;
    const path = k ? `M${sx} ${sy} Q${qx} ${qy} ${endX} ${endY}` : `M${sx} ${sy} L${endX} ${endY}`;
    const outline = a.c === 'r' ? `<path d="${path}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${w + 6}" stroke-linecap="round"/>` : '';
    const shadow = `<path d="${path}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="${w + 4}" stroke-linecap="round" transform="translate(2 4)"/>`;
    let body = `${shadow}${outline}<path d="${path}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    if (a.cut) {
      // 막힘: 공격이 멈춘 자리에 ✕ 배지
      const r = cell * 0.24, d = r * 0.45;
      body += `<circle cx="${tipX}" cy="${tipY}" r="${r}" fill="#ffffff"/><path d="M${tipX - d} ${tipY - d} L${tipX + d} ${tipY + d} M${tipX + d} ${tipY - d} L${tipX - d} ${tipY + d}" stroke="#d42f2f" stroke-width="${r * 0.32}" stroke-linecap="round"/>`;
    } else {
      const px = -uy * head * 0.62, py = ux * head * 0.62;
      body += `<path d="M${tipX} ${tipY} L${baseX + px} ${baseY + py} L${baseX - px} ${baseY - py} Z" fill="${color}"${a.c === 'r' ? ' stroke="#fff" stroke-width="4"' : ''}/>`;
    }
    return body;
  }).join('');
  for (const g of scene.ghost ?? []) out += drawPiece(g, 0.45);
  // 화살표는 기물 아래·위 모두 보이도록: 먼저 기물, 그다음 화살표
  for (const pc of scene.pieces) out += drawPiece(pc);
  return out + arrows;
}

/** 장면 그리기: 판(밝은/어두운 칸) + 표시 + 기물 + 화살표 */
function sceneSvg(scene, x0, y0, size) {
  const n = 5, cell = size / n;
  const at = (sq) => {
    const c = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    return [x0 + c * cell + cell / 2, y0 + (n - 1 - r) * cell + cell / 2];
  };
  let out = `<rect x="${x0 - 14}" y="${y0 - 14}" width="${size + 28}" height="${size + 28}" rx="${cell * 0.32}" fill="#000" fill-opacity="0.18" transform="translate(6 10)"/>`;
  out += `<rect x="${x0 - 14}" y="${y0 - 14}" width="${size + 28}" height="${size + 28}" rx="${cell * 0.32}" fill="#fbf7f0"/>`;
  out += `<clipPath id="bd"><rect x="${x0}" y="${y0}" width="${size}" height="${size}" rx="${cell * 0.18}"/></clipPath><g clip-path="url(#bd)">`;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const dark = (r + c) % 2 === 1;
    out += `<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${cell}" height="${cell}" fill="${dark ? '#b58863' : '#f0d9b5'}"/>`;
  }
  for (const sq of scene.marks?.shade ?? []) {
    const [cx, cy] = at(sq);
    out += `<rect x="${cx - cell / 2}" y="${cy - cell / 2}" width="${cell}" height="${cell}" fill="#18a046" fill-opacity="0.32"/>`;
  }
  out += '</g>';
  for (const sq of scene.marks?.star ?? []) {
    const [cx, cy] = at(sq);
    out += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.4}" fill="none" stroke="#18a046" stroke-width="${cell * 0.07}"/>`;
  }
  const drawPiece = ([code, sq], opacity = 1) => {
    const [cx, cy] = at(sq);
    return placed(piece(PIECE_NAME[code[1]], code[0] === 'w' ? 'white' : 'black'), cx - cell * 0.46, cy - cell * 0.46, cell * 0.92, opacity);
  };
  for (const g of scene.ghost ?? []) out += drawPiece(g, 0.4);
  for (const pc of scene.pieces) out += drawPiece(pc);
  for (const a of scene.arrows ?? []) {
    const [x1, y1] = at(a.from), [x2, y2] = at(a.to);
    const color = ARROW[a.c], w = cell * 0.17;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    // 휘는 화살표: 중간 조절점을 선에 수직으로 밀어낸다
    const k = (a.curve ?? 0) * cell;
    const qx = (x1 + x2) / 2 - (dy / len) * k, qy = (y1 + y2) / 2 + (dx / len) * k;
    // 끝 방향(조절점 → 끝)으로 화살촉
    const ex = x2 - qx, ey = y2 - qy, el = Math.hypot(ex, ey);
    const ux = ex / el, uy = ey / el;
    const head = cell * 0.36, back = cell * 0.3;
    const tipX = x2 - ux * back, tipY = y2 - uy * back;
    const baseX = tipX - ux * head, baseY = tipY - uy * head;
    const sx = x1 + (dx / len) * cell * 0.25, sy = y1 + (dy / len) * cell * 0.25;
    const path = k ? `M${sx} ${sy} Q${qx} ${qy} ${baseX} ${baseY}` : `M${sx} ${sy} L${baseX} ${baseY}`;
    out += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-opacity="0.92"/>`;
    if (a.cut) {
      out += `<path d="M${baseX - uy * head * 0.7} ${baseY + ux * head * 0.7} L${baseX + uy * head * 0.7} ${baseY - ux * head * 0.7}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    } else {
      const px = -uy * head * 0.62, py = ux * head * 0.62;
      out += `<path d="M${tipX} ${tipY} L${baseX + px} ${baseY + py} L${baseX - px} ${baseY - py} Z" fill="${color}" fill-opacity="0.95"/>`;
    }
  }
  return out;
}

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

function cardSvg(t, w, h, lang = 'ko') {
  const en = lang === 'en';
  const g = t.code.slice(0, 2);
  const [dark, mid, light] = GROUP_COLOR[g];
  const group = data.groups[g];
  const wide = w > h;
  const pad = wide ? 72 : 48;
  const pieceSize = wide ? 400 : 250;
  const px = wide ? w - pieceSize - 40 : w - pieceSize - 4;
  const py = wide ? (h - pieceSize) / 2 + 10 : 26;
  const cell = wide ? 86 : 48;
  const bx = wide ? w - cell * 6 + 20 : w - cell * 5 - 26;
  const by = wide ? 10 : -26;
  const codeSize = wide ? 150 : 104;
  const tagline = en ? EN.types[t.code].tagline : t.tagline;
  const tagLines = wrap(tagline, wide ? 17 : 15);
  const codeY = wide ? 280 : 360;
  const nameY = codeY + (wide ? 82 : 64);
  const tagY = nameY + (wide ? 66 : 52);
  const tagSize = wide ? 34 : 27;
  const scene = SCENES[t.code];
  // 장면 격자 = 배경 체스 무늬 격자 (칸 크기를 같게 하고 원점을 맞춘다)
  const ss = cell * 5;
  const sx = wide ? bx + cell * 0 : bx + cell * 0, sy = wide ? by + cell : by + cell;
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
  ${scene ? floatSceneSvg(scene, sx, sy, ss) : placed(piece(PIECE[t.code]), px, py, pieceSize, 0.97)}
  <g font-family="Pretendard" fill="#ffffff">
    <g transform="translate(${pad}, ${wide ? 78 : 64})">
      ${placed(piece('knight'), 0, -30, wide ? 40 : 34)}
      <text x="${wide ? 50 : 42}" y="0" font-size="${wide ? 30 : 26}" font-weight="800">Stylish<tspan fill="${light}">.</tspan></text>
    </g>
    <g transform="translate(${pad}, ${wide ? 138 : 120})">
      <rect x="0" y="-30" rx="20" width="${wide ? 250 : 220}" height="42" fill="#ffffff" fill-opacity="0.16"/>
      <text x="18" y="-1" font-size="${wide ? 22 : 20}" font-weight="700">${en ? esc(EN.groups[g].name) : `${esc(group.name)} · ${esc(group.en)}`}</text>
    </g>
    <text x="${pad - 4}" y="${codeY}" font-size="${codeSize}" font-weight="800" letter-spacing="6">${t.code}</text>
    <text x="${pad}" y="${nameY}" font-size="${wide ? 64 : 50}" font-weight="800">${en ? `The ${esc(t.en)}` : `${esc(t.name)}<tspan dx="16" font-size="${wide ? 30 : 24}" font-weight="500" fill-opacity="0.75">${esc(t.en)}</tspan>`}</text>
    ${tagLines.map((l, i) => `<text x="${pad}" y="${tagY + i * tagSize * 1.35}" font-size="${tagSize}" font-weight="500" fill-opacity="0.9">${esc(l)}</text>`).join('')}
    ${wide ? `<text x="${pad}" y="${h - 48}" font-size="22" font-weight="500" fill-opacity="0.7">${en ? 'What kind of chess player are you? · 16 chess types' : '나는 어떤 체스 플레이어일까? · 체스 유형 16가지'}</text>` : ''}
  </g>
</svg>`;
}

/** 첫 화면 공유 미리보기: 16유형 코드 격자 */
function landingSvg(w, h, lang = 'ko') {
  const en = lang === 'en';
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
    <text x="72" y="268" font-size="${en ? 56 : 64}" font-weight="800">${en ? 'What kind of' : '나는 어떤'}</text>
    <text x="72" y="350" font-size="${en ? 56 : 64}" font-weight="800">${en ? 'chess player are you?' : '체스 플레이어일까?'}</text>
    <text x="72" y="430" font-size="28" font-weight="500" fill="#5f5b53">${en ? '16 chess types from your own games' : '내 게임으로 알아보는 체스 유형 16가지'}</text>
    <text x="72" y="474" font-size="24" font-weight="500" fill="#8f8a80">${en ? 'Stockfish + Maia3 · Free · No install' : 'Stockfish + Maia3 · 무료 · 설치 없음'}</text>
  </g>
  <g font-family="Pretendard">${tiles}</g>
</svg>`;
}

const render = (svg, file) => {
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' } }).render().asPng();
  const target = new URL(file, OUT);
  mkdirSync(new URL('./', target), { recursive: true });
  writeFileSync(target, png);
  return png.length;
};

// 브라우저에서 결과 이미지를 그릴 때 쓰는 장면(투명 배경)
const SCENE_DIR = new URL('public/img/scenes/', ROOT);
mkdirSync(SCENE_DIR, { recursive: true });
for (const t of data.types.filter((x) => !ONLY || ONLY.includes(x.code))) {
  const size = 600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${floatSceneSvg(SCENES[t.code], 0, 0, size)}</svg>`;
  writeFileSync(new URL(`${t.code}.png`, SCENE_DIR), new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).render().asPng());
}

// 브라우저에서 결과 이미지(프로필 사진 카드)를 그릴 때 쓰는 기물 SVG
const PIECE_DIR = new URL('public/img/pieces/', ROOT);
mkdirSync(PIECE_DIR, { recursive: true });
for (const name of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
  writeFileSync(new URL(`${name}.svg`, PIECE_DIR), piece(name).replace(/<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="450" viewBox="0 0 45 45">'));
}

let total = 0;
for (const t of data.types.filter((x) => !ONLY || ONLY.includes(x.code))) {
  total += render(cardSvg(t, 1200, 630), `${t.code}.png`);
  total += render(cardSvg(t, 600, 600), `${t.code}-square.png`);
  total += render(cardSvg(t, 1200, 630, 'en'), `en/${t.code}.png`);
  total += render(cardSvg(t, 600, 600, 'en'), `en/${t.code}-square.png`);
}
if (!ONLY) { total += render(landingSvg(1200, 630), 'landing.png'); total += render(landingSvg(1200, 630, 'en'), 'en/landing.png'); }
console.log(`유형 이미지 한·영 ${(data.types.length * 2 + 1) * 2}장, ${(total / 1048576).toFixed(1)}MB`);
