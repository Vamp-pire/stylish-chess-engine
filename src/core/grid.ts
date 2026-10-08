// 특징 계산용 보드 표현과 공격 관계.
// 좌표: r = 0..7 (0 = 1랭크), f = 0..7 (0 = a파일)

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece { type: PieceType; color: Color }
export type Grid = (Piece | null)[][];
export interface Attacker { type: PieceType; r: number; f: number }
export type AttackMap = Attacker[][][];
export interface RiskItem { square: string; type: PieceType; loss: number }

export const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
/** 공격자로서의 가치 (킹은 '가장 비싼' 공격자) */
export const ATTACKER_VALUE: Record<PieceType, number> = { ...VALUE, k: 100 };

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const sq = (r: number, f: number) => 'abcdefgh'[f] + (r + 1);
export const coord = (s: string): [number, number] => [Number(s[1]) - 1, s.charCodeAt(0) - 97];
export const inside = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
/** color 기준 '앞으로' 방향 */
export const forward = (c: Color) => (c === 'w' ? 1 : -1);
/** color 기준 랭크 (0 = 자기 첫 랭크) */
export const relRank = (r: number, c: Color) => (c === 'w' ? r : 7 - r);

export function gridFromFen(fen: string): Grid {
  const rows = fen.split(' ')[0].split('/');
  const grid: Grid = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  rows.forEach((row, i) => {
    const r = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else grid[r][f++] = { type: ch.toLowerCase() as PieceType, color: ch === ch.toUpperCase() ? 'w' : 'b' };
    }
  });
  return grid;
}

export function* pieces(grid: Grid, color?: Color): Generator<[number, number, Piece]> {
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const pc = grid[r][f];
      if (pc && (!color || pc.color === color)) yield [r, f, pc];
    }
}

export function attacksFrom(grid: Grid, r: number, f: number): [number, number][] {
  const pc = grid[r][f];
  if (!pc) return [];
  const out: [number, number][] = [];
  const step = (offs: number[][]) => {
    for (const [dr, df] of offs) if (inside(r + dr, f + df)) out.push([r + dr, f + df]);
  };
  const slide = (dirs: number[][]) => {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (inside(rr, ff)) {
        out.push([rr, ff]);
        if (grid[rr][ff]) break;
        rr += dr; ff += df;
      }
    }
  };
  switch (pc.type) {
    case 'p': step([[forward(pc.color), -1], [forward(pc.color), 1]]); break;
    case 'n': step(KNIGHT); break;
    case 'k': step(KING); break;
    case 'b': slide(BISHOP_DIRS); break;
    case 'r': slide(ROOK_DIRS); break;
    case 'q': slide(ROOK_DIRS); slide(BISHOP_DIRS); break;
  }
  return out;
}

export function attackMap(grid: Grid, color: Color): AttackMap {
  const map: AttackMap = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => []));
  for (const [r, f, pc] of pieces(grid, color))
    for (const [ar, af] of attacksFrom(grid, r, f)) map[ar][af].push({ type: pc.type, r, f });
  return map;
}

export function findKing(grid: Grid, color: Color): [number, number] | null {
  for (const [r, f, pc] of pieces(grid, color)) if (pc.type === 'k') return [r, f];
  return null;
}

/** 킹 주변 영역: 킹 칸 + 인접 8칸 + 앞쪽으로 한 줄 더 */
export function kingZone(grid: Grid, color: Color): [number, number][] {
  const k = findKing(grid, color);
  if (!k) return [];
  const [kr, kf] = k;
  const zone: [number, number][] = [[kr, kf], ...KING.map(([dr, df]) => [kr + dr, kf + df] as [number, number])];
  for (const df of [-1, 0, 1]) zone.push([kr + 2 * forward(color), kf + df]);
  return zone.filter(([r, f]) => inside(r, f));
}

export function material(grid: Grid, color: Color): number {
  let s = 0;
  for (const [, , pc] of pieces(grid, color)) s += VALUE[pc.type];
  return s;
}

/** 폰과 킹을 뺀 기물 가치 합 (게임 단계 판단용) */
export function nonPawnMaterial(grid: Grid): number {
  let s = 0;
  for (const [, , pc] of pieces(grid)) if (pc.type !== 'p' && pc.type !== 'k') s += VALUE[pc.type];
  return s;
}

/**
 * color 쪽 기물 중 잡힐 위험에 놓인 것 (교환 평가 근사).
 * 수비가 없으면 가치 전부, 더 싼 기물에게 공격받으면 (가치 - 공격자 가치)를 잃는다.
 */
export function enPrise(grid: Grid, color: Color, enemy = attackMap(grid, opp(color)), own = attackMap(grid, color)): RiskItem[] {
  const list: RiskItem[] = [];
  for (const [r, f, pc] of pieces(grid, color)) {
    if (pc.type === 'k') continue;
    const attackers = enemy[r][f];
    if (!attackers.length) continue;
    const defenders = own[r][f];
    const usable = defenders.length ? attackers.filter((a) => a.type !== 'k') : attackers;
    if (!usable.length) continue;
    const minAtt = Math.min(...usable.map((a) => ATTACKER_VALUE[a.type]));
    const value = VALUE[pc.type];
    const loss = !defenders.length ? value : minAtt < value ? value - minAtt : 0;
    if (loss > 0.5) list.push({ square: sq(r, f), type: pc.type, loss });
  }
  return list;
}

export const sumLoss = (list: RiskItem[]) => list.reduce((s, x) => s + x.loss, 0);

// ───────────── 폰 구조 ─────────────

export function pawnFiles(grid: Grid, color: Color): number[] {
  const files = Array(8).fill(0);
  for (const [, f, pc] of pieces(grid, color)) if (pc.type === 'p') files[f]++;
  return files;
}

/** 고립 폰 + 겹친 폰 수 */
export function pawnWeaknesses(grid: Grid, color: Color): number {
  const files = pawnFiles(grid, color);
  let weak = 0;
  files.forEach((n, f) => {
    if (!n) return;
    if (n > 1) weak += n - 1;
    if (!(f > 0 && files[f - 1]) && !(f < 7 && files[f + 1])) weak += n;
  });
  return weak;
}

/** 고립 폰의 칸 목록 */
export function isolatedPawns(grid: Grid, color: Color): [number, number][] {
  const files = pawnFiles(grid, color);
  const out: [number, number][] = [];
  for (const [r, f, pc] of pieces(grid, color))
    if (pc.type === 'p' && !(f > 0 && files[f - 1]) && !(f < 7 && files[f + 1])) out.push([r, f]);
  return out;
}

export function isPassed(grid: Grid, r: number, f: number, color: Color): boolean {
  const d = forward(color);
  for (let rr = r + d; rr >= 0 && rr < 8; rr += d)
    for (const ff of [f - 1, f, f + 1]) {
      if (!inside(rr, ff)) continue;
      const pc = grid[rr][ff];
      if (pc && pc.type === 'p' && pc.color !== color) return false;
    }
  return true;
}

export function passedPawns(grid: Grid, color: Color): [number, number][] {
  const out: [number, number][] = [];
  for (const [r, f, pc] of pieces(grid, color)) if (pc.type === 'p' && isPassed(grid, r, f, color)) out.push([r, f]);
  return out;
}

/** 상대 폰이 앞으로 와서 공격할 수 없는 칸인가 (아웃포스트 판정) */
export function safeFromPawns(grid: Grid, r: number, f: number, color: Color): boolean {
  const enemy = opp(color);
  const d = forward(enemy); // 상대 폰이 전진하는 방향
  for (const ff of [f - 1, f + 1]) {
    if (ff < 0 || ff > 7) continue;
    // 상대 폰이 (r - d) 쪽 뒤에 있으면 언젠가 (r,f)를 공격할 수 있다
    for (let rr = r - d; rr >= 0 && rr < 8; rr -= d) {
      const pc = grid[rr][ff];
      if (pc && pc.type === 'p' && pc.color === enemy) return false;
    }
  }
  return true;
}

/** 아웃포스트 위의 나이트/비숍 수: 상대 진영, 자기 폰이 지킴, 상대 폰이 쫓아낼 수 없음 */
export function outposts(grid: Grid, color: Color, ownMap: AttackMap): number {
  let n = 0;
  for (const [r, f, pc] of pieces(grid, color)) {
    if (pc.type !== 'n' && pc.type !== 'b') continue;
    const rr = relRank(r, color);
    if (rr < 3 || rr > 5) continue;
    if (!ownMap[r][f].some((a) => a.type === 'p')) continue;
    if (safeFromPawns(grid, r, f, color)) n++;
  }
  return n;
}

/** 공간: 상대 진영(자기 기준 4~6랭크)에서 내 폰이 통제하는 칸 + 전진한 중앙 폰 */
export function space(grid: Grid, color: Color, ownMap: AttackMap): number {
  let n = 0;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const rr = relRank(r, color);
      if (rr >= 3 && rr <= 5 && ownMap[r][f].some((a) => a.type === 'p')) n++;
    }
  for (const [r, f, pc] of pieces(grid, color))
    if (pc.type === 'p' && f >= 2 && f <= 5) n += Math.max(0, relRank(r, color) - 2) * 0.5;
  return n;
}

/** 긴장: 서로 잡을 수 있는 폰-폰 쌍 수. pawnsOnly=false면 서로 공격하는 기물 쌍도 0.5씩 더한다 */
export function tension(grid: Grid, mapW: AttackMap, mapB: AttackMap, pawnsOnly = false): number {
  let n = 0;
  for (const [r, f, pc] of pieces(grid)) {
    const enemyMap = pc.color === 'w' ? mapB : mapW;
    const ownMap = pc.color === 'w' ? mapW : mapB;
    if (pc.type === 'k') continue;
    // 이 기물을 공격하는 적 중, 이 기물도 되받아 공격하는 경우만 '긴장'
    for (const a of enemyMap[r][f]) {
      const back = ownMap[a.r][a.f].some((x) => x.r === r && x.f === f);
      if (back) n += pc.type === 'p' && a.type === 'p' ? 1 : pawnsOnly ? 0 : 0.5;
    }
  }
  return n / 2; // 쌍마다 두 번 셌다
}

// ───────────── 전술 모티프 ─────────────

/**
 * color 쪽 슬라이더가 만드는 핀/스큐어 수.
 * 같은 줄에 적 기물 두 개가 있고, 뒤쪽이 앞쪽보다 가치가 크거나 킹이면 핀, 반대면 스큐어.
 */
export function pinsAndSkewers(grid: Grid, color: Color): { pins: number; skewers: number } {
  let pins = 0, skewers = 0;
  const enemy = opp(color);
  for (const [r, f, pc] of pieces(grid, color)) {
    const dirs = pc.type === 'b' ? BISHOP_DIRS : pc.type === 'r' ? ROOK_DIRS : pc.type === 'q' ? [...ROOK_DIRS, ...BISHOP_DIRS] : [];
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      let first: Piece | null = null;
      while (inside(rr, ff)) {
        const x = grid[rr][ff];
        if (x) {
          if (x.color !== enemy) break;
          if (!first) first = x;
          else {
            const v1 = first.type === 'k' ? 100 : VALUE[first.type];
            const v2 = x.type === 'k' ? 100 : VALUE[x.type];
            if (v2 > v1 && v2 > VALUE[pc.type] - 0.5) pins++;
            else if (v1 > v2 && first.type !== 'p' && x.type !== 'p') skewers++;
            break;
          }
        }
        rr += dr; ff += df;
      }
    }
  }
  return { pins, skewers };
}

/**
 * (r,f)의 기물이 동시에 노리는 '의미 있는' 표적 수.
 * 표적 = 킹, 자기보다 비싼 기물, 또는 수비 없는 기물. 2개 이상이면 포크.
 */
export function forkTargets(grid: Grid, r: number, f: number, enemyMap: AttackMap): number {
  const pc = grid[r][f];
  if (!pc) return 0;
  let n = 0;
  for (const [ar, af] of attacksFrom(grid, r, f)) {
    const t = grid[ar][af];
    if (!t || t.color === pc.color) continue;
    if (t.type === 'k' || VALUE[t.type] > VALUE[pc.type] + 0.5 || (!enemyMap[ar][af].length && t.type !== 'p')) n++;
  }
  return n;
}
