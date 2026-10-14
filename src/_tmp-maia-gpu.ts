// 임시 테스트: Maia3를 WebGPU로 돌리면 얼마나 빠른가
import * as ortGpu from 'onnxruntime-web/webgpu';
import * as ortWasm from 'onnxruntime-web/wasm';
import { createMaia3 } from './human/maia3';

export async function run() {
  const man = await (await fetch('/maia/maia3.json')).json() as { parts: string[] };
  const parts = await Promise.all(man.parts.map(async (p) => new Uint8Array(await (await fetch('/maia/' + p)).arrayBuffer())));
  const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
  const fens = ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8'];
  const qs = Array.from({ length: 80 }, (_, i) => ({ fen: fens[i % 2], elo: 1500, oppElo: 1500 }));
  const res: Record<string, unknown> = {};
  ortWasm.env.wasm.numThreads = 1;
  const cpu = await createMaia3(ortWasm as never, bytes);
  await cpu.predict(qs.slice(0, 4));
  let t = performance.now(); const a = await cpu.predict(qs); res.wasm80ms = Math.round(performance.now() - t);
  try {
    const gpu = await createMaia3(ortGpu as never, bytes, { executionProviders: ['webgpu'] });
    await gpu.predict(qs.slice(0, 4));
    t = performance.now(); const b = await gpu.predict(qs); res.webgpu80ms = Math.round(performance.now() - t);
    // 결과가 같은지: 첫 국면 상위 수와 확률
    res.sameTop = a[0][0].uci === b[0][0].uci; res.pCpu = a[0][0].p.toFixed(4); res.pGpu = b[0][0].p.toFixed(4);
  } catch (e) { res.gpuError = String(e).slice(0, 300); }
  return res;
}
