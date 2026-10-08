// 한 수의 전/후 국면을 비교한 '정적 특징'. 엔진 없이 보드만 보고 계산한다.
import {
  type Color, type Grid, type PieceType, type AttackMap,
  VALUE, opp, coord, sq, forward, relRank, gridFromFen, attackMap, kingZone, findKing,
  material, nonPawnMaterial, enPrise, sumLoss, pawnWeaknesses, isolatedPawns, passedPawns, isPassed,
  outposts, space, tension, pinsAndSkewers, forkTargets, pieces, attacksFrom,
} from './grid';

/** chess.js verbose move와 호환되는 최소 형태 */
export interface MoveLike {
  from: string; to: string; color: Color; piece: PieceType;
  captured?: PieceType; promotion?: PieceType; san: string; flags: string;
}

export interface MoveContext {
  inCheckBefore: boolean;
  ply: number;
  /** 직전 상대 수 (되잡기 판정용) */
  prevMove?: MoveLike | null;
  legalMoveCount?: number;
}

export interface StaticFeatures {
  color: Color;
  piece: PieceType;
  phase: number;              // 1 = 기물 가득, 0 = 엔드게임
  isEndgame: boolean;
  ply: number;
  materialBalance: number;    // 수 두기 전 (둔 쪽 관점)

  // 물질과 위험
  capturedValue: number;
  promoValue: number;
  sacrifice: number;          // 새로 위험에 노출된 물질 - 얻은 물질
  ignoredThreat: number;      // 위협받던 기물을 그대로 둔 양
  rescued: number;            // 위험에서 벗어난 양
  threatsCreated: number;     // 상대 기물에 새로 생긴 위협
  hangOwnAfter: number;
  hangOwnBefore: number;
  /** 수 둔 후 잡힐 위험에 놓인 내 기물 칸 (미끼 후보: 새로 노출됐거나 일부러 방치한 기물) */
  riskSquares: string[];
  isRecapture: boolean;
  isTrade: boolean;           // 비슷한 가치의 교환
  piecesTraded: boolean;      // 기물(폰 제외)이 줄어드는 교환

  // 킹
  isCheck: boolean;
  isMate: boolean;
  isCastle: boolean;
  kingWalk: boolean;
  inCheckBefore: boolean;
  kingAttack: number;         // 상대 킹 주변 공격 증가량
  kingAttackTotal: number;
  attackersNearKing: number;  // 상대 킹 주변을 공격하는 내 기물 수 (수 둔 후)
  ownKingDanger: number;      // 내 킹 주변 상대 공격 증가량
  ownShieldDelta: number;
  weakensOwnKing: boolean;
  pawnStorm: boolean;

  // 활동성/공간
  mobilityDelta: number;
  oppMobilityDelta: number;
  defendedDelta: number;
  advance: number;            // + 전진, - 후퇴
  centralization: number;
  intoEnemyHalf: boolean;
  isDevelopment: boolean;
  rookOpenFile: boolean;
  rookSeventh: boolean;
  spaceDelta: number;
  centralPawnAdvance: boolean; // 중앙(c~f) 폰이 상대 진영으로 전진

  // 구조/포지셔널
  structureDelta: number;     // 내 약점 폰 증감
  oppStructureDelta: number;  // 상대 약점 폰 증감
  outpostDelta: number;
  weakPawnPressure: number;   // 상대 고립 폰을 노리는 공격 증감

  // 긴장
  tensionBefore: number;
  tensionAfter: number;
  pawnTensionBefore: number;  // 폰끼리 서로 잡을 수 있는 대치
  pawnTensionAfter: number;
  reinforcesTension: boolean; // 상대 폰과 대치 중인 내 폰을 움직인 기물이 새로 지킴
  pawnBreak: boolean;

  // 전술 모티프
  forkTargets: number;
  newPins: number;
  newSkewers: number;
  discoveredAttack: number;   // 움직인 기물이 아닌 다른 기물의 새 공격 대상 수

  // 엔드게임
  kingActivation: boolean;
  passedPawnPush: boolean;
  passedCreated: number;

  /** 아무것도 거의 바꾸지 않는 수인가 (대기수 후보) */
  quietShuffle: boolean;
  /** 체크·잡기·직접 위협이 없는 수 */
  isQuiet: boolean;
  legalMoveCount: number;
}

function zonePressure(map: AttackMap, zone: [number, number][]) {
  let n = 0;
  for (const [r, f] of zone) n += map[r][f].length;
  return n;
}

function zoneAttackers(map: AttackMap, zone: [number, number][]) {
  const set = new Set<string>();
  for (const [r, f] of zone) for (const a of map[r][f]) if (a.type !== 'k') set.add(`${a.r},${a.f}`);
  return set.size;
}

/** 폰/킹 제외 기물이 갈 수 있는 칸 수 */
function mobility(grid: Grid, map: AttackMap, color: Color) {
  let n = 0;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const x = grid[r][f];
      if (x && x.color === color) continue;
      n += map[r][f].filter((a) => a.type !== 'p' && a.type !== 'k').length;
    }
  return n;
}

function defendedCount(grid: Grid, ownMap: AttackMap, color: Color) {
  let n = 0;
  for (const [r, f, pc] of pieces(grid, color)) if (pc.type !== 'k' && ownMap[r][f].length) n++;
  return n;
}

function pawnShield(grid: Grid, color: Color) {
  const k = findKing(grid, color);
  if (!k) return 0;
  let n = 0;
  for (const df of [-1, 0, 1])
    for (const d of [1, 2]) {
      const r = k[0] + d * forward(color), f = k[1] + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const x = grid[r][f];
      if (x && x.type === 'p' && x.color === color) n++;
    }
  return n;
}

const centerDist = (r: number, f: number) => Math.max(Math.abs(r - 3.5), Math.abs(f - 3.5));

/** color 기물들이 공격하는 상대 기물(칸) 집합. exclude 칸의 기물은 제외 */
function attackedEnemies(grid: Grid, map: AttackMap, color: Color, exclude?: [number, number]) {
  const set = new Set<string>();
  for (const [r, f, pc] of pieces(grid, opp(color))) {
    if (pc.type === 'p') continue;
    for (const a of map[r][f]) {
      if (exclude && a.r === exclude[0] && a.f === exclude[1]) continue;
      if (VALUE[pc.type] >= VALUE[a.type] || pc.type === 'k') set.add(`${r},${f}`);
    }
  }
  return set;
}

function weakPawnAttacks(grid: Grid, map: AttackMap, color: Color) {
  let n = 0;
  for (const [r, f] of isolatedPawns(grid, opp(color))) n += map[r][f].length;
  return n;
}

export function extractFeatures(fenBefore: string, fenAfter: string, move: MoveLike, ctx: MoveContext): StaticFeatures {
  const c = move.color, o = opp(c);
  const B = gridFromFen(fenBefore), A = gridFromFen(fenAfter);
  const mBc = attackMap(B, c), mBo = attackMap(B, o), mAc = attackMap(A, c), mAo = attackMap(A, o);

  const capturedValue = move.captured ? VALUE[move.captured] : 0;
  const promoValue = move.promotion ? VALUE[move.promotion] - 1 : 0;
  const [fr, ff] = coord(move.from), [tr, tf] = coord(move.to);

  // ── 물질/위험 ──
  const riskB = enPrise(B, c, mBo, mBc), riskA = enPrise(A, c, mAo, mAc);
  const hangOwnBefore = sumLoss(riskB), hangOwnAfter = sumLoss(riskA);
  const hangOppBefore = sumLoss(enPrise(B, o, mBc, mBo)), hangOppAfter = sumLoss(enPrise(A, o, mAc, mAo));
  const beforeSq = new Set(riskB.map((x) => x.square)), afterSq = new Set(riskA.map((x) => x.square));
  const ignoredThreat = sumLoss(riskA.filter((x) => beforeSq.has(x.square) && x.square !== move.to));
  const newlyExposed = sumLoss(riskA.filter((x) => !beforeSq.has(x.square) || x.square === move.to));
  const escaped = sumLoss(riskB.filter((x) => !afterSq.has(x.square) || x.square === move.from));
  const sacrifice = Math.max(0, newlyExposed - capturedValue - promoValue);
  const rescued = Math.max(0, escaped - newlyExposed);
  const threatsCreated = Math.max(0, hangOppAfter - Math.max(0, hangOppBefore - capturedValue));

  const prev = ctx.prevMove;
  const isRecapture = !!(move.captured && prev?.captured && prev.to === move.to);
  const isTrade = !!move.captured && move.captured !== 'p' &&
    (isRecapture || (Math.abs(VALUE[move.captured] - VALUE[move.piece]) < 1 && mAo[tr][tf].length > 0));
  const piecesTraded = nonPawnMaterial(A) < nonPawnMaterial(B) && !!move.captured && move.captured !== 'p' && (isTrade || isRecapture);

  // ── 단계 ──
  const npm = nonPawnMaterial(B);
  const phase = Math.min(1, npm / 62);
  const isEndgame = npm <= 26;

  // ── 킹 ──
  const zoneOB = kingZone(B, o), zoneOA = kingZone(A, o), zoneCB = kingZone(B, c), zoneCA = kingZone(A, c);
  const kingAttack = zonePressure(mAc, zoneOA) - zonePressure(mBc, zoneOB);
  const ownKingDanger = zonePressure(mAo, zoneCA) - zonePressure(mBo, zoneCB);
  const isCheck = /[+#]/.test(move.san), isMate = move.san.includes('#');
  const isCastle = move.flags.includes('k') || move.flags.includes('q');
  const kingWalk = move.piece === 'k' && !isCastle;
  const advance = (tr - fr) * forward(c);

  const oppKing = findKing(A, o), ownKing = findKing(B, c);
  const oppKingOnWing = !!oppKing && (oppKing[1] <= 2 || oppKing[1] >= 5);
  const ownKingOnWing = !!ownKing && (ownKing[1] <= 2 || ownKing[1] >= 5);
  const pawnStorm = move.piece === 'p' && oppKingOnWing && advance > 0 && Math.abs(tf - oppKing![1]) <= 2 && !isEndgame;
  const weakensOwnKing = move.piece === 'p' && ownKingOnWing && !isEndgame &&
    Math.abs(ff - ownKing![1]) <= 1 && Math.abs(fr - ownKing![0]) <= 2;

  // ── 활동성 ──
  const homeRank = c === 'w' ? 0 : 7;
  const isDevelopment = (move.piece === 'n' || move.piece === 'b') && fr === homeRank && ctx.ply < 30;
  const ownPawnsOnFile = (g: Grid, f: number) => [...pieces(g, c)].some(([, pf, pc]) => pc.type === 'p' && pf === f);
  const rookOpenFile = move.piece === 'r' && !ownPawnsOnFile(A, tf) && (ff !== tf || ownPawnsOnFile(B, tf));
  const rookSeventh = move.piece === 'r' && relRank(tr, c) === 6 && relRank(fr, c) !== 6;

  // ── 구조 ──
  const structureDelta = pawnWeaknesses(A, c) - pawnWeaknesses(B, c);
  const oppStructureDelta = pawnWeaknesses(A, o) - pawnWeaknesses(B, o);

  // ── 긴장 ──
  const tensionBefore = tension(B, c === 'w' ? mBc : mBo, c === 'w' ? mBo : mBc);
  const tensionAfter = tension(A, c === 'w' ? mAc : mAo, c === 'w' ? mAo : mAc);
  const pawnTensionBefore = tension(B, c === 'w' ? mBc : mBo, c === 'w' ? mBo : mBc, true);
  const pawnTensionAfter = tension(A, c === 'w' ? mAc : mAo, c === 'w' ? mAo : mAc, true);
  // 움직인 기물이 '상대 폰에게 공격받는 내 폰'을 새로 지키는가
  const reinforcesTension = !move.captured && attacksFrom(A, tr, tf).some(([r, ff2]) => {
    const x = A[r][ff2];
    return x?.type === 'p' && x.color === c && mAo[r][ff2].some((a) => a.type === 'p');
  });
  let pawnBreak = false;
  if (move.piece === 'p') {
    const d = forward(c);
    pawnBreak = move.captured === 'p' || [[tr + d, tf - 1], [tr + d, tf + 1]].some(([r, f]) =>
      r >= 0 && r < 8 && f >= 0 && f < 8 && A[r][f]?.type === 'p' && A[r][f]?.color === o);
  }

  // ── 전술 ──
  const pinsB = pinsAndSkewers(B, c), pinsA = pinsAndSkewers(A, c);
  const fork = forkTargets(A, tr, tf, mAo);
  const enemiesB = attackedEnemies(B, mBc, c);
  const enemiesA = attackedEnemies(A, mAc, c, [tr, tf]);
  let discoveredAttack = 0;
  for (const k of enemiesA) if (!enemiesB.has(k)) discoveredAttack++;

  // ── 엔드게임 ──
  const kingActivation = isEndgame && move.piece === 'k' && (centerDist(fr, ff) - centerDist(tr, tf) > 0 || advance > 0);
  const passedPawnPush = move.piece === 'p' && advance > 0 && isPassed(A, tr, tf, c);
  const passedCreated = passedPawns(A, c).length - passedPawns(B, c).length;

  const mobilityDelta = mobility(A, mAc, c) - mobility(B, mBc, c);
  const isQuiet = !isCheck && !move.captured && !move.promotion && threatsCreated < 0.5 && fork < 2;

  return {
    color: c, piece: move.piece, phase, isEndgame, ply: ctx.ply,
    materialBalance: material(B, c) - material(B, o),
    capturedValue, promoValue, sacrifice, ignoredThreat, rescued, threatsCreated,
    hangOwnAfter, hangOwnBefore,
    riskSquares: riskA.map((x) => x.square),
    isRecapture, isTrade, piecesTraded,
    isCheck, isMate, isCastle, kingWalk, inCheckBefore: ctx.inCheckBefore,
    kingAttack, kingAttackTotal: zonePressure(mAc, zoneOA), attackersNearKing: zoneAttackers(mAc, zoneOA),
    ownKingDanger, ownShieldDelta: pawnShield(A, c) - pawnShield(B, c), weakensOwnKing, pawnStorm,
    mobilityDelta, oppMobilityDelta: mobility(A, mAo, o) - mobility(B, mBo, o),
    defendedDelta: defendedCount(A, mAc, c) - defendedCount(B, mBc, c),
    advance, centralization: centerDist(fr, ff) - centerDist(tr, tf),
    intoEnemyHalf: relRank(tr, c) >= 4, isDevelopment, rookOpenFile, rookSeventh,
    spaceDelta: space(A, c, mAc) - space(B, c, mBc),
    centralPawnAdvance: move.piece === 'p' && !move.captured && advance > 0 && tf >= 2 && tf <= 5 && relRank(tr, c) >= 4,
    structureDelta, oppStructureDelta,
    outpostDelta: outposts(A, c, mAc) - outposts(B, c, mBc),
    weakPawnPressure: weakPawnAttacks(A, mAc, c) - weakPawnAttacks(B, mBc, c),
    tensionBefore, tensionAfter, pawnTensionBefore, pawnTensionAfter, reinforcesTension, pawnBreak,
    forkTargets: fork,
    newPins: Math.max(0, pinsA.pins - pinsB.pins),
    newSkewers: Math.max(0, pinsA.skewers - pinsB.skewers),
    discoveredAttack: move.piece === 'k' ? 0 : discoveredAttack,
    kingActivation, passedPawnPush, passedCreated,
    quietShuffle: isQuiet && Math.abs(mobilityDelta) <= 3 && !move.flags.includes('b') && !pawnBreak && !passedPawnPush && !isCastle,
    isQuiet,
    legalMoveCount: ctx.legalMoveCount ?? 30,
  };
}

export { sq };
