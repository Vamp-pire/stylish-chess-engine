// 브라우저 버튼 묶기: extension/의 확장 프로그램을 zip으로, 같은 코드를 Tampermonkey 스크립트(.user.js)로 만든다.
// 결과: dist/downloads/stylish-extension.zip, dist/stylish.user.js (npm run build 마지막 단계)
// zip은 Node만으로 만든다 (빌드 서버에 zip 명령이 없을 수 있어서): 각 파일을 deflate로 압축하고 중앙 디렉터리를 붙인다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import sharp from 'sharp';

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const content = readFileSync('extension/content.js');

// ── 아이콘 (사이트 로고에서) ──
const icons = {};
for (const size of [16, 32, 48, 128]) icons[`icons/${size}.png`] = await sharp('public/logo.png').resize(size, size).png().toBuffer();

// ── zip ──
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name), comp = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

mkdirSync('dist/downloads', { recursive: true });
// 압축을 풀면 폴더 하나가 나오도록 stylish-extension/ 아래에 넣는다 (크롬 '압축해제된 확장 프로그램 로드'에서 그 폴더를 고른다)
const files = { 'stylish-extension/manifest.json': Buffer.from(JSON.stringify(manifest, null, 2)), 'stylish-extension/content.js': content };
for (const [k, v] of Object.entries(icons)) files[`stylish-extension/${k}`] = v;
writeFileSync('dist/downloads/stylish-extension.zip', zip(files));

// ── Tampermonkey 스크립트 ──
const header = `// ==UserScript==
// @name         Stylish — chess style analysis button
// @namespace    https://stylish-chess-engine.pages.dev/
// @version      ${manifest.version}
// @description  Adds an "Analyze in Stylish" button to finished games on Chess.com and Lichess. Finished games only; collects no data.
// @match        https://www.chess.com/*
// @match        https://chess.com/*
// @match        https://lichess.org/*
// @icon         https://stylish-chess-engine.pages.dev/logo.png
// @homepageURL  https://stylish-chess-engine.pages.dev/
// @downloadURL  https://stylish-chess-engine.pages.dev/stylish.user.js
// @updateURL    https://stylish-chess-engine.pages.dev/stylish.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
`;
writeFileSync('dist/stylish.user.js', header + content.toString('utf8'));
console.log(`확장 zip ${Object.keys(files).length}개 파일, Tampermonkey 스크립트 v${manifest.version}`);
