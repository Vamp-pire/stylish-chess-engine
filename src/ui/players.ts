// 플레이어 성향 저장소 (localStorage). 플레이어마다 게임별 요약을 저장하고, 보여줄 때 합친다.
// 수 하나하나의 분석은 너무 커서 저장하지 않는다 (그건 IndexedDB 분석 캐시에 있다).
import type { PlayerProfile } from '../core/profile';
import { mergeProfiles } from '../core/profile';
import type { Source } from '../online/sources';

const KEY = 'stylish.players.v1';

export type PlayerSource = Source | 'pgn';

export interface SavedGame {
  gameId: string;
  date: number | null;       // 대국 날짜 (ms)
  savedAt: number;
  color: 'w' | 'b';
  opponent: string;
  result: 'win' | 'loss' | 'draw' | null;
  opening: string | null;
  depth: number;
  url: string | null;
  profile: PlayerProfile;
}

export interface SavedPlayer {
  key: string;
  name: string;
  source: PlayerSource;
  updatedAt: number;
  games: Record<string, SavedGame>;
}

type Store = Record<string, SavedPlayer>;

export const SOURCE_NAME: Record<PlayerSource, string> = { chesscom: 'Chess.com', lichess: 'Lichess', pgn: 'PGN' };

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store; } catch { return {}; }
}

function write(store: Store): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}

export const playerKey = (source: PlayerSource, name: string) => `${source}:${name.trim().toLowerCase()}`;

/** 이름이 없거나 익명인 플레이어는 저장하지 않는다 */
export function isNamed(name: string | undefined | null) {
  const n = (name ?? '').trim();
  return !!n && !['?', '-', 'anonymous', '백', '흑', 'white', 'black'].includes(n.toLowerCase());
}

/** 게임 하나의 플레이어 성향을 저장(같은 게임이면 덮어씀). 용량이 넘치면 false */
export function savePlayerGame(source: PlayerSource, name: string, game: SavedGame): boolean {
  if (!isNamed(name) || !game.profile.moves) return true;
  const store = read();
  const key = playerKey(source, name);
  const p = store[key] ?? { key, name: name.trim(), source, updatedAt: 0, games: {} };
  p.games[game.gameId] = game;
  p.updatedAt = Date.now();
  store[key] = p;
  return write(store);
}

export function listPlayers(): SavedPlayer[] {
  return Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPlayer(key: string): SavedPlayer | null {
  return read()[key] ?? null;
}

export function deletePlayer(key: string) {
  const store = read();
  delete store[key];
  write(store);
}

export function deleteGame(key: string, gameId: string) {
  const store = read();
  const p = store[key]; if (!p) return;
  delete p.games[gameId];
  if (!Object.keys(p.games).length) delete store[key];
  write(store);
}

export function clearPlayers() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 저장된 모든 판을 합친 성향 */
export function combinedProfile(p: SavedPlayer): PlayerProfile | null {
  return mergeProfiles(Object.values(p.games).map((g) => g.profile));
}

export function gamesOf(p: SavedPlayer): SavedGame[] {
  return Object.values(p.games).sort((a, b) => (b.date ?? b.savedAt) - (a.date ?? a.savedAt));
}
