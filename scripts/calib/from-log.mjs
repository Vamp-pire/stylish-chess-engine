// Actions 작업 로그에 '@@파일이름 <base64>' 줄로 남긴 결과(gzip)를 파일로 되살린다.
// 사용: node scripts/calib/from-log.mjs <로그 파일> <출력 폴더>
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const parts = new Map();
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const m = line.match(/@@(\S+) ([A-Za-z0-9+/=]+)\s*$/);
  if (m) parts.set(m[1], (parts.get(m[1]) ?? '') + m[2]);
}
for (const [name, b64] of parts) {
  writeFileSync(join(process.argv[3], name), gunzipSync(Buffer.from(b64, 'base64')));
  console.log(`${name} 복원`);
}
