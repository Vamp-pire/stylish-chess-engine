// 엔진 풀: 단일 스레드 Stockfish 여러 개에 분석 요청을 나눠 준다.
// 국면 분석은 서로 독립이라 동시에 돌릴 수 있다. 우선순위가 높은 요청(판정 중 추가 분석)을 먼저 처리한다.
import type { Engine, EngineLine } from './uci';

type Opts = Parameters<Engine['analyse']>[1] & { priority?: number };

interface Job { fen: string; opts: Opts; priority: number; seq: number; tag: number | null; resolve: (l: EngineLine[]) => void; reject: (e: unknown) => void }

export class EnginePool implements Engine {
  private queue: Job[] = [];
  private idle: Engine[];
  private seq = 0;

  constructor(private engines: Engine[]) {
    this.idle = [...engines];
  }

  get size() { return this.engines.length; }

  analyse(fen: string, opts: Opts = {}, tag: number | null = null): Promise<EngineLine[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, priority: opts.priority ?? 0, seq: this.seq++, tag, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      // 우선순위 높은 것 먼저, 같으면 먼저 들어온 것
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i], b = this.queue[best];
        if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
      }
      const job = this.queue.splice(best, 1)[0];
      const engine = this.idle.pop()!;
      const { priority: _p, ...opts } = job.opts;
      engine.analyse(job.fen, opts)
        .then(job.resolve, job.reject)
        .finally(() => { this.idle.push(engine); this.pump(); });
    }
  }

  /** 취소된 분석(tag)의 대기 요청을 버린다. 이미 돌고 있는 요청은 곧 끝난다 */
  cancel(tag: number) {
    const drop = this.queue.filter((j) => j.tag === tag);
    this.queue = this.queue.filter((j) => j.tag !== tag);
    for (const j of drop) j.reject(new Error('cancelled'));
  }

  quit() {
    for (const e of this.engines) e.quit();
    for (const j of this.queue) j.reject(new Error('engine pool closed'));
    this.queue = [];
  }
}
