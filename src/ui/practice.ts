// 내 실수로 만드는 연습 과제: 분석한 게임에서 놓친 기회 국면을 플레이어별로 모아 두고(localStorage),
// 매주 5문제씩 낸다. 아직 안 푼 문제·손해가 컸던 문제가 먼저 나온다.
import type { MoveAnalysis } from '../core/analyzer';

const KEY = 'stylish.practice.v1';
const MAX_PER_PLAYER = 60;
export const WEEKLY = 5;

/** 퀴즈에 필요한 만큼만 저장한 국면 */
export interface PracticeItem {
  id: string;
  fenBefore: string; color: 'w' | 'b'; moveNumber: number; san: string; uci: string;
  bestMove: string; bestSan: string; bestPvSan: string[]; winDrop: number;
  game: string; addedAt: number; solvedAt: number | null; tries: number;
}
type Store = Record<string, PracticeItem[]>;

function read(): Store { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } }
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 가득 차면 이번엔 저장하지 않음 */ } }

/** 놓친 기회들을 플레이어 문제집에 추가 (같은 국면·같은 수면 한 번만) */
export function addPractice(player: string, moves: MoveAnalysis[], game: string) {
  if (!moves.length) return;
  const s = read();
  const list = s[player] ?? [];
  for (const m of moves) {
    if (!m.deep.bestMove || !m.bestSan) continue;
    const id = `${m.fenBefore}|${m.uci}`;
    if (list.some((x) => x.id === id)) continue;
    list.push({
      id, fenBefore: m.fenBefore, color: m.color, moveNumber: m.moveNumber, san: m.san, uci: m.uci,
      bestMove: m.deep.bestMove, bestSan: m.bestSan, bestPvSan: m.bestPvSan, winDrop: m.deep.winDrop,
      game, addedAt: Date.now(), solvedAt: null, tries: 0,
    });
  }
  // 넘치면 이미 푼 것 → 손해가 작은 것 순으로 뺀다
  list.sort((a, b) => Number(!!a.solvedAt) - Number(!!b.solvedAt) || b.winDrop - a.winDrop);
  s[player] = list.slice(0, MAX_PER_PLAYER);
  write(s);
}

const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

/** 이번 주 과제: 안 푼 문제(손해 큰 순) → 오래전에 푼 문제 순으로 5개 */
export function weeklySet(player: string): PracticeItem[] {
  const list = read()[player] ?? [];
  const unsolved = list.filter((x) => !x.solvedAt).sort((a, b) => b.winDrop - a.winDrop);
  const old = list.filter((x) => x.solvedAt && x.solvedAt < weekStart()).sort((a, b) => a.solvedAt! - b.solvedAt!);
  return [...unsolved, ...old].slice(0, WEEKLY);
}

export function practiceStats(player: string) {
  const list = read()[player] ?? [];
  const ws = weekStart();
  return { total: list.length, solvedThisWeek: list.filter((x) => x.solvedAt && x.solvedAt >= ws).length, unsolved: list.filter((x) => !x.solvedAt).length };
}

export function markPractice(player: string, id: string, solved: boolean) {
  const s = read();
  const item = s[player]?.find((x) => x.id === id);
  if (!item) return;
  item.tries++;
  if (solved) item.solvedAt = Date.now();
  write(s);
}

/** 퀴즈가 쓰는 모양(MoveAnalysis 일부)으로 */
export function asQuizMove(p: PracticeItem): MoveAnalysis {
  return {
    fenBefore: p.fenBefore, color: p.color, moveNumber: p.moveNumber, san: p.san, uci: p.uci,
    bestSan: p.bestSan, bestPvSan: p.bestPvSan, deep: { bestMove: p.bestMove, winDrop: p.winDrop },
  } as unknown as MoveAnalysis;
}

export function clearPractice(player?: string) {
  if (!player) { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } return; }
  const s = read(); delete s[player]; write(s);
}
