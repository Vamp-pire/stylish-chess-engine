// 분석 Worker: 특징 추출·소형 탐색·채점을 화면과 분리된 스레드에서 돌린다.
// Stockfish는 메인 스레드가 띄운 엔진 Worker에 요청을 중계받아 쓴다 (Worker 중첩을 피하기 위해).
import { analyzeGame } from '../core/analyzer';
import { loadOpeningBook } from '../core/openings';
import type { Engine, EngineLine } from '../engine/uci';
import type { ToWorker, FromWorker } from './protocol';

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

let seq = 0;
const pending = new Map<number, (lines: EngineLine[]) => void>();
const signal = { aborted: false };

const engine: Engine = {
  analyse(fen, opts = {}) {
    const id = ++seq;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      post({ type: 'engine', id, fen, opts });
    });
  },
  quit() {},
};

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'engineResult') {
    pending.get(msg.id)?.(msg.lines);
    pending.delete(msg.id);
  } else if (msg.type === 'abort') {
    signal.aborted = true;
  } else if (msg.type === 'analyze') {
    signal.aborted = false;
    try {
      // 오프닝 데이터를 못 받아도 분석은 계속한다 (이론 판별만 빠짐)
      const book = msg.bookUrl ? await loadOpeningBook(msg.bookUrl).catch(() => null) : null;
      const result = await analyzeGame(msg.pgn, engine, {
        depth: msg.depth,
        book,
        signal,
        onProgress: (done, total) => post({ type: 'progress', done, total }),
        onMove: (move) => post({ type: 'move', move }),
      });
      post({ type: 'done', result });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
};
