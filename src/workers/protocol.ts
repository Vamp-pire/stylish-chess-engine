// 메인 스레드 ↔ 분석 Worker 메시지 형식
import type { Lang } from '../i18n';
import type { EngineLine } from '../engine/uci';
import type { GameAnalysis, MoveAnalysis } from '../core/analyzer';
import type { HumanPolicy, HumanQuery } from '../human/maia3';

export type ToWorker =
  | { type: 'analyze'; pgn: string; depth: number; bookUrl: string | null; human: boolean; lang: Lang }
  | { type: 'abort' }
  | { type: 'engineResult'; id: number; lines: EngineLine[] }
  | { type: 'humanResult'; id: number; policies: HumanPolicy[] | null };

export type FromWorker =
  | { type: 'engine'; id: number; fen: string; opts: { depth?: number; multipv?: number; searchmoves?: string[]; priority?: number } }
  | { type: 'human'; id: number; queries: HumanQuery[] }
  | { type: 'progress'; done: number; total: number }
  | { type: 'move'; move: MoveAnalysis }
  | { type: 'done'; result: GameAnalysis }
  | { type: 'error'; message: string };
