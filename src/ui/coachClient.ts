// 메인 스레드 쪽 코치 연결: 코치 Worker를 띄우고 엔진 요청을 엔진 풀로 중계한다.
import type { MoveAnalysis, GameAnalysis } from '../core/analyzer';
import type { EvalRequest } from '../core/coach';
import type { CoachCall, CoachFromWorker, CoachToWorker } from '../workers/coach.worker';
import CoachWorker from '../workers/coach.worker?worker';
import { getEngine } from './runner';

let tagSeq = 1_000_000; // 분석 화면(AnalysisRun)의 tag와 겹치지 않게

export class CoachClient {
  private worker = new CoachWorker();
  private seq = 0;
  private calls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private tag = ++tagSeq;
  private closed = false;
  readonly ready: Promise<unknown>;

  constructor(depth: number) {
    this.worker.onmessage = async (e: MessageEvent<CoachFromWorker>) => {
      const msg = e.data;
      if (msg.type === 'engine') {
        const { engine } = await getEngine();
        const lines = await engine.analyse(msg.fen, msg.opts, this.tag).catch(() => null);
        if (!this.closed) this.send({ type: 'engineResult', id: msg.id, lines });
        return;
      }
      const c = this.calls.get(msg.id); this.calls.delete(msg.id);
      if (msg.type === 'result') c?.resolve(msg.value); else c?.reject(new Error(msg.message));
    };
    this.ready = this.call({ method: 'init', depth, bookUrl: new URL(import.meta.env.BASE_URL + 'openings.json', location.href).href });
  }

  private send(m: CoachToWorker) { this.worker.postMessage(m); }

  private call(call: CoachCall): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('closed'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => { this.calls.set(id, { resolve, reject }); this.send({ type: 'call', id, call }); });
  }

  prepare(fen: string) { return this.call({ method: 'prepare', fen }); }
  /** 지금 국면의 Stockfish 최선 수 (둘 차례 관점 cp) */
  best(fen: string) { return this.call({ method: 'best', fen }) as Promise<{ uci: string; cp: number; mate: number | null; pv: string[] } | null>; }
  evaluate(req: EvalRequest) { return this.call({ method: 'evaluate', req }) as Promise<MoveAnalysis>; }
  threat(fen: string) { return this.call({ method: 'threat', fen }) as Promise<{ uci: string; san: string; gainCp: number } | null>; }
  bot(fen: string, level: number, style: string) { return this.call({ method: 'bot', fen, level, style }) as Promise<string | null>; }
  finalize(moves: MoveAnalysis[], headers: Record<string, string>, startFen: string) {
    return this.call({ method: 'finalize', moves, headers, startFen }) as Promise<GameAnalysis>;
  }

  close() {
    this.closed = true;
    this.worker.terminate();
    getEngine().then(({ engine }) => engine.cancel(this.tag)).catch(() => {});
    for (const c of this.calls.values()) c.reject(new Error('closed'));
    this.calls.clear();
  }
}
