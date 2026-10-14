// 메인 스레드: Stockfish Worker와 분석 Worker를 띄우고 둘 사이 요청을 중계한다.
import { getLang } from '../i18n';
import { createBrowserEngine } from '../engine/browser';
import type { EnginePool } from '../engine/pool';
import type { GameAnalysis, MoveAnalysis } from '../core/analyzer';
import type { FromWorker, ToWorker } from '../workers/protocol';
import AnalysisWorker from '../workers/analysis.worker?worker';
import { getHumanModel } from '../human/browser';
import { positionKey, getPosition, putPosition } from '../engine/positionCache';

export interface RunCallbacks {
  onProgress(done: number, total: number): void;
  onMove(m: MoveAnalysis): void;
}

let enginePromise: Promise<{ engine: EnginePool }> | null = null;
export function getEngine() {
  enginePromise ??= createBrowserEngine(import.meta.env.BASE_URL + 'engine/');
  return enginePromise;
}

let runSeq = 0;

export class AnalysisRun {
  private worker = new AnalysisWorker();
  private cancelled = false;
  private id = ++runSeq;
  private pool: EnginePool | null = null;

  constructor(private cb: RunCallbacks) {}

  async start(pgn: string, depth: number): Promise<GameAnalysis> {
    const { engine } = await getEngine();
    this.pool = engine;
    return new Promise((resolve, reject) => {
      const send = (m: ToWorker) => this.worker.postMessage(m);
      this.worker.onmessage = async (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'engine': {
            // 이 분석의 요청임을 표시해 두면 취소할 때 대기열에서 한꺼번에 버릴 수 있다
            // 같은 국면·같은 조건은 캐시에서 (같은 사람 게임의 겹치는 오프닝, 다시 분석할 때)
            const key = positionKey(msg.fen, msg.opts ?? {});
            let lines = await getPosition(key);
            if (!lines) {
              lines = await engine.analyse(msg.fen, msg.opts, this.id).catch(() => null);
              if (lines?.length) putPosition(key, lines);
            }
            if (lines && !this.cancelled) send({ type: 'engineResult', id: msg.id, lines });
            break;
          }
          case 'human': {
            // 모델은 첫 분석 때 받기 시작한다. 실패하면 null을 돌려줘 규칙 기반으로 계속한다
            const model = await getHumanModel();
            const policies = model ? await model.predict(msg.queries).catch(() => null) : null;
            if (!this.cancelled) send({ type: 'humanResult', id: msg.id, policies });
            break;
          }
          case 'progress': this.cb.onProgress(msg.done, msg.total); break;
          case 'move': this.cb.onMove(msg.move); break;
          case 'done': this.worker.terminate(); resolve(msg.result); break;
          case 'error': this.worker.terminate(); reject(new Error(msg.message)); break;
        }
      };
      this.worker.onerror = (e) => reject(new Error(e.message));
      send({ type: 'analyze', pgn, depth, bookUrl: new URL(import.meta.env.BASE_URL + 'openings.json', location.href).href, human: true, lang: getLang() });
    });
  }

  cancel() {
    this.cancelled = true;
    this.worker.terminate();
    this.pool?.cancel(this.id);
  }
}
