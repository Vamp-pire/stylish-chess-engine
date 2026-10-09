// 전송 방식(브라우저 Worker / Node 프로세스)과 무관한 UCI 프로토콜 처리.

export interface Transport { send(line: string): void; onLine(cb: (line: string) => void): void }

export interface EngineLine {
  uci: string;
  cp: number;       // 둘 차례 관점 센티폰. 메이트는 ±(10000 - 수)
  mate: number | null;
  pv: string[];
  depth: number;
  /** Stockfish가 직접 낸 승/무/패 확률 (1000분율, 둘 차례 관점) */
  wdl: [number, number, number] | null;
}

/** 기대 점수 0~1 (승 1, 무 0.5): Stockfish WDL에서 계산 */
export const expectedScore = (l: EngineLine) =>
  l.wdl ? (l.wdl[0] + l.wdl[1] / 2) / 1000 : l.cp > 0 ? 1 : l.cp < 0 ? 0 : 0.5;

export interface Engine {
  /** priority: 엔진 풀에서 먼저 처리할 요청일수록 크게 (단일 엔진은 무시) */
  analyse(fen: string, opts?: { depth?: number; multipv?: number; searchmoves?: string[]; priority?: number }): Promise<EngineLine[]>;
  quit(): void;
}

export const MATE_CP = 10000;

export class UciEngine implements Engine {
  private queue: Promise<unknown> = Promise.resolve();
  private listener: ((line: string) => void) | null = null;
  private currentMultiPv = 0;

  constructor(private t: Transport, private onQuit: () => void = () => {}) {
    t.onLine((line) => this.listener?.(line));
  }

  private waitFor(pred: (l: string) => boolean) {
    return new Promise<string>((resolve) => {
      this.listener = (line) => { if (pred(line)) { this.listener = null; resolve(line); } };
    });
  }

  async init(options: Record<string, string | number> = {}) {
    const ok = this.waitFor((l) => l === 'uciok');
    this.t.send('uci');
    await ok;
    // 품질 판정에 쓰는 승/무/패 확률은 항상 켠다
    for (const [k, v] of Object.entries({ UCI_ShowWDL: 'true', ...options })) this.t.send(`setoption name ${k} value ${v}`);
    await this.ready();
    return this;
  }

  private async ready() {
    const r = this.waitFor((l) => l === 'readyok');
    this.t.send('isready');
    await r;
  }

  analyse(fen: string, { depth = 14, multipv = 3, searchmoves }: { depth?: number; multipv?: number; searchmoves?: string[]; priority?: number } = {}): Promise<EngineLine[]> {
    const job = async () => {
      if (multipv !== this.currentMultiPv) {
        this.t.send(`setoption name MultiPV value ${multipv}`);
        this.currentMultiPv = multipv;
        await this.ready();
      }
      return new Promise<EngineLine[]>((resolve) => {
        const lines: EngineLine[] = [];
        this.listener = (line) => {
          if (line.startsWith('info') && line.includes(' pv ') && line.includes(' score ')) {
            if (line.includes('lowerbound') || line.includes('upperbound')) return;
            const k = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
            const d = Number(line.match(/ depth (\d+)/)?.[1] ?? 0);
            const m = line.match(/ score (cp|mate) (-?\d+)/)!;
            const pv = line.split(' pv ')[1].trim().split(/\s+/);
            let cp = Number(m[2]), mate: number | null = null;
            if (m[1] === 'mate') { mate = cp; cp = cp > 0 ? MATE_CP - cp : -MATE_CP - cp; }
            const w = line.match(/ wdl (\d+) (\d+) (\d+)/);
            const wdl = w ? [Number(w[1]), Number(w[2]), Number(w[3])] as [number, number, number] : null;
            lines[k - 1] = { uci: pv[0], cp, mate, pv, depth: d, wdl };
          } else if (line.startsWith('bestmove')) {
            this.listener = null;
            resolve(lines.filter(Boolean));
          }
        };
        this.t.send(`position fen ${fen}`);
        this.t.send(`go depth ${depth}${searchmoves?.length ? ` searchmoves ${searchmoves.join(" ")}` : ""}`);
      });
    };
    // 한 번에 하나만 분석하도록 직렬화
    const p = this.queue.then(job);
    this.queue = p.catch(() => {});
    return p;
  }

  quit() { this.t.send('quit'); this.onQuit(); }
}
