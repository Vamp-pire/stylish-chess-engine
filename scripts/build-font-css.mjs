// Pretendard 글꼴 CSS를 우리 사이트용으로 바꿔 저장한다: font-display를 swap → optional로.
// swap은 글꼴이 늦게 오면 글자 모양이 바뀌며 화면이 밀리고(CLS) 다시 그리느라 휴대폰이 느려진다.
// optional은 처음 잠깐 안에 오지 않으면 이번 화면은 시스템 글꼴로 두고, 받은 글꼴은 캐시해 다음 화면부터 쓴다.
// 글꼴 파일(woff2)은 그대로 jsDelivr에서 받는다 (상대 주소를 절대 주소로 바꿈).
// 사용: node scripts/build-font-css.mjs → public/fonts/pretendard-optional.css (커밋해서 쓴다)
import { mkdirSync, writeFileSync } from 'node:fs';

const VERSION = 'v1.3.9';
const CSS = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/dist/web/variable/pretendardvariable-dynamic-subset.min.css`;
const FONT_BASE = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/packages/`;

const res = await fetch(CSS);
if (!res.ok) throw new Error(`글꼴 CSS를 받지 못했습니다: ${res.status}`);
let css = await res.text();
const faces = (css.match(/@font-face/g) ?? []).length;
css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/font-display:\s*swap/g, 'font-display:optional')
  .replace(/url\((?:\.\.\/)+packages\//g, `url(${FONT_BASE}`);
if (!css.includes(FONT_BASE) || /url\(\.\./.test(css)) throw new Error('글꼴 주소를 바꾸지 못했습니다');
mkdirSync('public/fonts', { recursive: true });
writeFileSync('public/fonts/pretendard-optional.css', `/* Pretendard ${VERSION} (OFL-1.1), font-display: optional로 바꾼 사본. scripts/build-font-css.mjs로 만든다 */\n${css}`);
console.log(`@font-face ${faces}개 → public/fonts/pretendard-optional.css`);
