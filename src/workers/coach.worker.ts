// 코치 Worker: 수 평가·위협·봇 수 선택을 화면과 분리된 스레드에서 한다.
// Stockfish 요청은 분석 Worker와 같은 방식으로 메인 스레드의 엔진 풀에 중계한다.
import { CoachSession, chooseBotMove, BOT_STYLES } from '../core/coach';
import { finalizeGame, type MoveAnalysis } from '../core/analyzer';
import { loadOpeningBook } from '../core/openings';
import type { Engine, EngineLine } from '../engine/uci';

export type CoachCall =
  | { method: 'init'; depth: number; bookUrl: string | null }
  | { method: 'prepare'; fen: string }
  | { method: 'best'; fen: string }
  | { method: 'evaluate'; req: Parameters<CoachSession['evaluate']>[0] }
  | { method: 'threat'; fen: string }
  | { method: 'bot'; fen: string; level: number; style: string }
  | { method: 'finalize'; moves: MoveAnalysis[]; headers: Record<string, string>; startFen: string };

export type CoachToWorker = { type: 'call'; id: number; call: CoachCall } | { type: 'engineResult'; id: number; lines: EngineLine[] | null };
export type CoachFromWorker =
  | { type: 'result'; id: number; value: unknown }
  | { type: 'error'; id: number; message: string }
  | { type: 'engine'; id: number; fen: string; opts: Parameters<Engine['analyse']>[1] };

const post = (m: CoachFromWorker) => (self as unknown as Worker).postMessage(m);

let seq = 0;
const pending = new Map<number, { resolve: (l: EngineLine[]) => void; reject: (e: unknown) => void }>();
const engine: Engine = {
  analyse(fen, opts = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); post({ type: 'engine', id, fen, opts }); });
  },
  quit() {},
};

let session: CoachSession | null = null;
/** 초기화(오프닝 데이터 받기) 중에 들어온 요청은 끝날 때까지 기다린다 */
let initializing: Promise<void> | null = null;

async function run(call: CoachCall): Promise<unknown> {
  if (call.method === 'init') {
    initializing = (async () => {
      const book = call.bookUrl ? await loadOpeningBook(call.bookUrl).catch(() => null) : null;
      session = new CoachSession(engine, call.depth, book);
    })();
    await initializing;
    return true;
  }
  if (initializing) await initializing;
  if (!session) throw new Error('코치가 아직 준비되지 않았습니다');
  switch (call.method) {
    case 'prepare': await session.lines(call.fen, 1); return true;
    case 'best': { const l = (await session.lines(call.fen, 10))[0]; return l?.uci ? { uci: l.uci, cp: l.cp, mate: l.mate, pv: l.pv } : null; }
    case 'evaluate': return session.evaluate(call.req);
    case 'threat': return session.threat(call.fen);
    case 'bot': return chooseBotMove(engine, call.fen, call.level, BOT_STYLES.find((s) => s.id === call.style) ?? BOT_STYLES[0]);
    case 'finalize': return finalizeGame(call.moves, call.headers, call.startFen, session.depth);
  }
}

self.onmessage = async (e: MessageEvent<CoachToWorker>) => {
  const msg = e.data;
  if (msg.type === 'engineResult') {
    const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.lines) p?.resolve(msg.lines); else p?.reject(new Error('cancelled'));
    return;
  }
  try { post({ type: 'result', id: msg.id, value: await run(msg.call) }); }
  catch (err) { post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) }); }
};
