// 테스트용 Maia3: 브라우저와 같은 모델 조각(public/maia)을 onnxruntime-web(Node 빌드)으로 돌린다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';
import { createMaia3, type HumanModel } from '../src/human/maia3';

/** 조각(public/maia/maia3-*.part*.bin)을 이어 붙인다 */
function loadModel(): Uint8Array {
  const dir = new URL('../public/maia/', import.meta.url);
  const { parts } = JSON.parse(readFileSync(fileURLToPath(new URL('maia3.json', dir)), 'utf8')) as { parts: string[] };
  return new Uint8Array(Buffer.concat(parts.map((p) => readFileSync(fileURLToPath(new URL(p, dir))))));
}

let model: Promise<HumanModel> | null = null;
export function createNodeHuman(): Promise<HumanModel> {
  ort.env.wasm.numThreads = 1;
  model ??= createMaia3(ort, loadModel());
  return model;
}
