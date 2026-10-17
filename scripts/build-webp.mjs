// 유형 그림 WebP 만들기: 페이지에 보여 줄 때는 가벼운 WebP를 화면 크기에 맞춰 쓴다 (PNG는 공유 미리보기·결과 이미지용으로 그대로 둔다).
// 정사각형(600×600) → -300.webp, -600.webp / 공유용 가로(1200×630) → -800.webp, -1200.webp
// 사용: node scripts/build-webp.mjs  (유형 그림을 다시 만들었을 때만 다시 돌리고 결과를 커밋한다)
import { readdirSync } from 'node:fs';
import sharp from 'sharp';

const DIRS = ['public/img/types', 'public/img/types/en'];
const SIZES = { square: [300, 600], wide: [800, 1200] };
let made = 0;
for (const dir of DIRS) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
    const base = f.replace(/\.png$/, '');
    const widths = base.endsWith('-square') ? SIZES.square : SIZES.wide;
    for (const w of widths) {
      await sharp(`${dir}/${f}`).resize({ width: w }).webp({ quality: 82, effort: 5 }).toFile(`${dir}/${base}-${w}.webp`);
      made++;
    }
  }
}
console.log(`WebP ${made}개`);
