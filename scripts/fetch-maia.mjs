// Maia3 모델(fp16 ONNX, 약 45MB)을 받아 20MB 조각으로 나눠 public/maia/에 둔다.
// Cloudflare Pages는 파일 하나당 25MB까지만 받으므로 조각으로 올리고 브라우저에서 다시 합친다.
// 출처: CSSLab/maia-platform-frontend (GPLv3), 아래 커밋에 고정
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const COMMIT = '0013cc8e6ec52c88f5b3d694781d4cc8427cb91a';
const URL_ = `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/${COMMIT}/public/maia3/maia3_simplified.onnx`;
const SHA256 = '405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856';
const PART = 20 * 1024 * 1024;
const OUT = new URL('../public/maia/', import.meta.url);

const res = await fetch(URL_);
if (!res.ok) throw new Error(`다운로드 실패: ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
const hash = createHash('sha256').update(bytes).digest('hex');
if (hash !== SHA256) throw new Error(`해시 불일치: ${hash}`);

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(new URL(f, OUT));
const parts = [];
for (let i = 0, at = 0; at < bytes.length; i++, at += PART) {
  // 이름에 버전을 넣어 모델이 바뀌어도 예전 조각이 HTTP 캐시에서 섞이지 않게 한다
  const name = `maia3-${SHA256.slice(0, 12)}.part${i}.bin`;
  writeFileSync(new URL(name, OUT), bytes.subarray(at, at + PART));
  parts.push(name);
}
// 조각 목록. version은 브라우저 캐시 키로 쓰인다 (모델이 바뀌면 해시가 바뀜)
writeFileSync(new URL('maia3.json', OUT), JSON.stringify({ version: SHA256.slice(0, 12), size: bytes.length, parts }, null, 2) + '\n');
console.log(`maia3: ${bytes.length} bytes → ${parts.length}조각`);
