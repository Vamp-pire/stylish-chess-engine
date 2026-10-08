// 메인 스레드: Stockfish Worker와 분석 Worker를 띄우고 둘 사이 요청을 중계한다.
import { createBrowserEngine } from '../engine/browser';
import type { UciEngine } from '../engine/uci';
import type { GameAnalysis, MoveAnalysis } from '../core/analyzer';
import type { FromWorker, ToWorker } from '../workers/protocol';
import AnalysisWorker from '../workers/analysis.worker?worker';

export interface RunCallbacks {
  onProgress(done: number, total: number): void;
  onMove(m: MoveAnalysis): void;
}

let enginePromise: Promise<{ engine: UciEngine }> | null = null;
export function getEngine() {
  enginePromise ??= createBrowserEngine(import.meta.env.BASE_URL + 'engine/');
  return enginePromise;
}

export class AnalysisRun {
  private worker = new AnalysisWorker();
  private cancelled = false;

  constructor(private cb: RunCallbacks) {}

  async start(pgn: string, depth: number): Promise<GameAnalysis> {
    const { engine } = await getEngine();
    return new Promise((resolve, reject) => {
      const send = (m: ToWorker) => this.worker.postMessage(m);
      this.worker.onmessage = async (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'engine': {
            const lines = await engine.analyse(msg.fen, msg.opts);
            if (!this.cancelled) send({ type: 'engineResult', id: msg.id, lines });
            break;
          }
          case 'progress': this.cb.onProgress(msg.done, msg.total); break;
          case 'move': this.cb.onMove(msg.move); break;
          case 'done': this.worker.terminate(); resolve(msg.result); break;
          case 'error': this.worker.terminate(); reject(new Error(msg.message)); break;
        }
      };
      this.worker.onerror = (e) => reject(new Error(e.message));
      send({ type: 'analyze', pgn, depth });
    });
  }

  cancel() {
    this.cancelled = true;
    this.worker.terminate();
  }
}
