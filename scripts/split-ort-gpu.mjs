// onnxruntime-web의 WebGPU용 wasm(약 27MB)을 20MB 조각으로 나눠 public/ort-gpu/에 둔다.
// Cloudflare Pages는 파일 하나당 25MB까지만 받으므로 조각으로 올리고 Maia Worker에서 다시 합친다 (빌드 때마다 생성, 저장소에는 안 넣음)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const SRC = new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url);
const OUT = new URL('../public/ort-gpu/', import.meta.url);
const PART = 20 * 1024 * 1024;

const bytes = readFileSync(SRC);
const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(new URL(f, OUT));
const parts = [];
for (let i = 0, at = 0; at < bytes.length; i++, at += PART) {
  const name = `ort-gpu-${version}.part${i}.bin`;
  writeFileSync(new URL(name, OUT), bytes.subarray(at, at + PART));
  parts.push(name);
}
writeFileSync(new URL('ort-gpu.json', OUT), JSON.stringify({ version, size: bytes.length, parts }, null, 2) + '\n');
console.log(`ort-gpu: ${bytes.length} bytes → ${parts.length}조각`);
