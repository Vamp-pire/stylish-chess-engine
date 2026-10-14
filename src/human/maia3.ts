// Maia3: 사람이 실제로 둘 수를 레이팅별 확률로 예측하는 신경망 (CSSLab, maiachess.com).
// 입력 인코딩과 수 목록(maia3-moves.json)은 CSSLab/maia-platform-frontend(GPLv3)를 따른다.
// 브라우저 Worker와 Node 테스트가 같은 코드를 쓰도록 onnxruntime 모듈은 밖에서 받는다.
import type * as Ort from 'onnxruntime-web';
import VOCAB from './maia3-moves.json';
import { Position } from '../search/position';

export interface HumanQuery { fen: string; elo: number; oppElo: number }
export interface HumanMove { uci: string; p: number }
/** 합법수별 확률 (내림차순, 합 1) */
export type HumanPolicy = HumanMove[];
export interface HumanModel { predict(queries: HumanQuery[]): Promise<HumanPolicy[]> }

/** Maia3가 학습한 레이팅 범위. 밖의 값은 끝값으로 맞춘다 */
export const ELO_MIN = 600, ELO_MAX = 2600;
/** 레이팅 정보가 없는 기보에 쓰는 값 */
export const ELO_DEFAULT = 1500;

const MOVES = VOCAB as Record<string, number>;
const MOVE_COUNT = 4352;
const PIECES = 'PNBRQKpnbrqk';

const mirrorSq = (s: string) => s[0] + (9 - Number(s[1]));
const mirrorUci = (u: string) => mirrorSq(u.slice(0, 2)) + mirrorSq(u.slice(2, 4)) + u.slice(4);

export function clampElo(elo: number | null | undefined) {
  if (!elo || !Number.isFinite(elo)) return ELO_DEFAULT;
  return Math.max(ELO_MIN, Math.min(ELO_MAX, elo));
}

/** 국면 → (64칸 × 12기물) 입력. 흑 차례면 판을 위아래로 뒤집고 색을 바꿔 항상 백 시점으로 만든다 */
export function encodeMaia3(fen: string): Float32Array {
  const [placement, side] = fen.split(' ');
  const black = side === 'b';
  const rows = placement.split('/');
  const t = new Float32Array(64 * 12);
  for (let r = 0; r < 8; r++) {
    const rank = black ? r : 7 - r;
    let file = 0;
    for (const c of rows[r]) {
      if (c >= '1' && c <= '8') { file += Number(c); continue; }
      let idx = PIECES.indexOf(c);
      if (black) idx = idx < 6 ? idx + 6 : idx - 6;
      t[(rank * 8 + file) * 12 + idx] = 1;
      file++;
    }
  }
  return t;
}

/** 모델 출력(전체 수 목록에 대한 로짓) → 합법수 확률 */
export function decodeMaia3(fen: string, logits: Float32Array, offset = 0): HumanPolicy {
  const pos = Position.fromFen(fen);
  const black = fen.split(' ')[1] === 'b';
  const scored: { uci: string; l: number }[] = [];
  for (const m of pos.legalMoves()) {
    const uci = pos.toUci(m);
    const idx = MOVES[black ? mirrorUci(uci) : uci];
    scored.push({ uci, l: idx == null ? -Infinity : logits[offset + idx] });
  }
  if (!scored.length) return [];
  const max = Math.max(...scored.map((s) => s.l));
  const exps = scored.map((s) => (Number.isFinite(s.l) ? Math.exp(s.l - max) : 0));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return scored.map((s, i) => ({ uci: s.uci, p: exps[i] / sum })).sort((a, b) => b.p - a.p);
}

const BATCH = 16;

/** onnxruntime 세션으로 HumanModel을 만든다 */
export async function createMaia3(ort: typeof Ort, model: Uint8Array, options?: Ort.InferenceSession.SessionOptions, batchSize = BATCH): Promise<HumanModel> {
  const session = await ort.InferenceSession.create(model, options);
  return {
    async predict(queries) {
      const out: HumanPolicy[] = [];
      for (let b = 0; b < queries.length; b += batchSize) {
        const batch = queries.slice(b, b + batchSize);
        const n = batch.length;
        const tokens = new Float32Array(n * 64 * 12);
        batch.forEach((q, i) => tokens.set(encodeMaia3(q.fen), i * 64 * 12));
        const res = await session.run({
          tokens: new ort.Tensor('float32', tokens, [n, 64, 12]),
          elo_self: new ort.Tensor('float32', Float32Array.from(batch.map((q) => clampElo(q.elo))), [n]),
          elo_oppo: new ort.Tensor('float32', Float32Array.from(batch.map((q) => clampElo(q.oppElo))), [n]),
        });
        const logits = res.logits_move.data as Float32Array;
        batch.forEach((q, i) => out.push(decodeMaia3(q.fen, logits, i * MOVE_COUNT)));
      }
      return out;
    },
  };
}
