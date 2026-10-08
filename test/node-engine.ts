// 테스트용: 브라우저와 같은 Stockfish 19 lite WASM을 Node 프로세스로 띄운다.
// STOCKFISH_PATH 환경변수가 있으면 그 네이티브 실행 파일을 쓴다 (정확도 비교용).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { UciEngine } from '../src/engine/uci';
import { OpeningBook } from '../src/core/openings';

/** 테스트용 오프닝 이론 데이터 */
export const loadNodeBook = () => new OpeningBook(JSON.parse(readFileSync('public/openings.json', 'utf8')));

export async function createNodeEngine(): Promise<UciEngine> {
  const native = process.env.STOCKFISH_PATH;
  const wasmJs = fileURLToPath(new URL('../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url));
  const proc = native ? spawn(native, []) : spawn(process.execPath, [wasmJs]);
  const rl = createInterface({ input: proc.stdout! });
  const engine = new UciEngine(
    { send: (l) => proc.stdin!.write(l + '\n'), onLine: (cb) => rl.on('line', (l) => cb(l.trim())) },
    () => proc.kill(),
  );
  await engine.init({ Hash: 32 });
  return engine;
}
