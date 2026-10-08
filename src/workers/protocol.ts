// 메인 스레드 ↔ 분석 Worker 메시지 형식
import type { EngineLine } from '../engine/uci';
import type { GameAnalysis, MoveAnalysis } from '../core/analyzer';

export type ToWorker =
  | { type: 'analyze'; pgn: string; depth: number }
  | { type: 'abort' }
  | { type: 'engineResult'; id: number; lines: EngineLine[] };

export type FromWorker =
  | { type: 'engine'; id: number; fen: string; opts: { depth?: number; multipv?: number; searchmoves?: string[] } }
  | { type: 'progress'; done: number; total: number }
  | { type: 'move'; move: MoveAnalysis }
  | { type: 'done'; result: GameAnalysis }
  | { type: 'error'; message: string };
