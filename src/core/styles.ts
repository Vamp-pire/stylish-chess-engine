// 특징 → 스타일 19종 점수 + 위험 판정 + 품질.
// 모든 점수는 '근거 목록'의 가중합이라 왜 그렇게 판정했는지 그대로 보여줄 수 있다.
import { tr } from '../i18n';
import type { StaticFeatures } from './features';

export const STYLE_KEYS = [
  'aggressive', 'tactical', 'initiative', 'counterattack',
  'positional', 'prophylactic', 'restriction', 'active', 'space', 'tension',
  'solid', 'defensive', 'simplifying',
  'complicating', 'quiet', 'waiting', 'practical',
  'kingActivity', 'passedPawn',
] as const;
export type StyleKey = typeof STYLE_KEYS[number];

export interface StyleInfo { label: string; group: string; color: string; desc: string }

/** 화면 언어에 따라 이름·설명이 바뀌는 스타일 정보 */
function style(label: string, labelEn: string, group: string, groupEn: string, color: string, desc: string, descEn: string): StyleInfo {
  return { get label() { return tr(label, labelEn); }, get group() { return tr(group, groupEn); }, color, get desc() { return tr(desc, descEn); } };
}

export const STYLES: Record<StyleKey, StyleInfo> = {
  aggressive: style('공격적', 'Aggressive', '공격', 'Attack', '#e5484d', '상대 킹을 향한 압박', 'Pressure on the enemy king'),
  tactical: style('전술적', 'Tactical', '공격', 'Attack', '#f76b15', '포크·핀 등 구체적 전술', 'Concrete tactics like forks and pins'),
  initiative: style('주도권', 'Initiative', '공격', 'Attack', '#e54666', '위협으로 상대 응수를 강제', 'Forcing replies with threats'),
  counterattack: style('반격', 'Counterattack', '공격', 'Attack', '#d6409f', '막지 않고 더 큰 위협으로 맞받음', 'Answering a threat with a bigger one'),
  positional: style('포지셔널', 'Positional', '포지션', 'Position', '#3e63dd', '구조·약점·아웃포스트', 'Structure, weaknesses, outposts'),
  prophylactic: style('예방적', 'Prophylactic', '포지션', 'Position', '#0090ff', '상대의 구체적 위협을 미리 차단', 'Stopping the opponent\'s concrete threat in advance'),
  restriction: style('제한', 'Restriction', '포지션', 'Position', '#00a2c7', '상대 기물 활동 범위 축소', 'Shrinking the opponent\'s piece activity'),
  active: style('활동적', 'Active', '포지션', 'Position', '#ffb224', '전개·중앙화·기동성', 'Development, centralization, mobility'),
  space: style('공간 확보', 'Space', '포지션', 'Position', '#ad7f58', '폰 전진으로 영역 확대', 'Gaining ground with pawn advances'),
  tension: style('긴장 유지', 'Tension', '포지션', 'Position', '#8e4ec6', '교환 가능한 대치를 유지·생성', 'Keeping or creating exchangeable standoffs'),
  solid: style('안정적', 'Solid', '안전', 'Safety', '#30a46c', '어떤 응수에도 평가가 흔들리지 않음', 'The evaluation holds up against any reply'),
  defensive: style('수비적', 'Defensive', '안전', 'Safety', '#12a594', '위협 해소·킹 보호·구출', 'Parrying threats, protecting the king, rescuing pieces'),
  simplifying: style('단순화', 'Simplifying', '안전', 'Safety', '#8da4ef', '교환으로 국면 정리', 'Clearing the position with trades'),
  complicating: style('복잡화', 'Complicating', '실전', 'Practical', '#ab4aba', '국면을 날카롭게 만듦', 'Sharpening the position'),
  quiet: style('조용한 수', 'Quiet', '실전', 'Practical', '#6e56cf', '조용하지만 확실히 강한 수', 'Quiet but clearly strong'),
  waiting: style('대기수', 'Waiting', '실전', 'Practical', '#7c7c7c', '상대를 주그츠방에 빠뜨리는 템포 수', 'A tempo move that puts the opponent in zugzwang'),
  practical: style('실용적', 'Practical', '실전', 'Practical', '#978365', '최선은 아니지만 국면을 쉽게 만듦', 'Not the best, but makes the position easier'),
  kingActivity: style('킹 활성화', 'King activity', '엔드게임', 'Endgame', '#29a383', '엔드게임에서 킹 전진', 'Advancing the king in the endgame'),
  passedPawn: style('패스폰 추진', 'Passed pawn', '엔드게임', 'Endgame', '#5bb98c', '패스폰 전진·생성', 'Pushing or creating a passed pawn'),
};

export type RiskKind = 'soundSacrifice' | 'speculative' | 'trap' | 'gamble';
export const RISK_KINDS: RiskKind[] = ['soundSacrifice', 'speculative', 'trap', 'gamble'];
export const RISK_LABEL: Record<RiskKind, string> = {
  get soundSacrifice() { return tr('건전한 희생', 'Sound sacrifice'); },
  get speculative() { return tr('무리한 희생', 'Speculative sacrifice'); },
  get trap() { return tr('함정수', 'Trap'); },
  get gamble() { return tr('도박수', 'Gamble'); },
};

export type QualityKey = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export const QUALITY_LABEL: Record<QualityKey, string> = {
  get best() { return tr('최선', 'Best'); }, get good() { return tr('좋은 수', 'Good'); }, get inaccuracy() { return tr('부정확', 'Inaccuracy'); },
  get mistake() { return tr('실수', 'Mistake'); }, get blunder() { return tr('블런더', 'Blunder'); },
};

/**
 * 품질은 전적으로 Stockfish 출력으로 판정한다: Stockfish가 낸 승/무/패 확률(WDL)로 계산한
 * 기대 점수가 최선 수 대비 얼마나 떨어졌는가 (%p). 이미 이긴/진 국면의 큰 cp 변동은 실수로 보지 않는다.
 */
export function qualityOf(cpLoss: number, winDrop: number, isBest: boolean, expPlayed = 1): QualityKey {
  if (isBest || cpLoss <= 10) return 'best';
  // Stockfish 19의 WDL은 +1.00 = 승률 50%로 맞춰져 있어 기대 점수가 빠르게 움직인다.
  // 평형 국면 기준 대략 -50cp / -100cp 손실에 해당하도록 부정확·실수 기준을 정했다.
  if (winDrop < 12) return 'good';
  if (winDrop < 25) return 'inaccuracy';
  // 평형·약간 불리한 국면은 다 잃어도 하락폭이 50%p에 못 미친다. 그래서 50%p 외에
  // 30%p 이상 잃으며 사실상 진 국면(기대 점수 10% 이하)이 됐거나, 40%p 이상 잃고 실제로 2폰 이상 손해면 블런더
  if (winDrop >= 50 || (winDrop >= 30 && expPlayed <= 0.1) || (winDrop >= 40 && cpLoss >= 200)) return 'blunder';
  return 'mistake';
}

/** 엔진·탐색으로 얻는 특징 (없으면 정적 특징만으로 채점) */
export interface DeepFeatures {
  cpLoss: number;
  winDrop: number;            // Stockfish WDL 기대 점수 하락폭 (%p)
  expBefore: number;          // 최선 수 기준 기대 점수 0~1 (둔 쪽 관점)
  expPlayed: number;          // 둔 수 기준 기대 점수 0~1
  bestGap: number;            // 수 두기 전, 최선과 2위 후보 차이
  evalBefore: number;         // 둔 쪽 관점
  evalAfter: number;          // 둔 쪽 관점
  isBest: boolean;
  bestMove: string | null;
  forced: boolean;
  // PV 앞보기
  pvMaterialEnd: number;      // PV 끝에서의 물질 변화 (둔 쪽 관점, 수 두기 전 대비)
  pvForcingByMover: number;   // PV에서 둔 쪽이 이어가는 체크/잡기 수
  pvChecksByMover: number;
  pvKingPressureMax: number;  // PV 동안 상대 킹 주변을 공격하는 내 기물 수 최대치
  realSacrifice: boolean;     // PV를 따라가도 물질이 회복되지 않는 희생
  // 위협 (소형 탐색)
  threatBefore: number;       // 수 두기 전 상대가 노리던 이득
  threatAfterOpp: number;     // 수 둔 후 상대가 바로 얻을 수 있는 이득
  ourThreatBefore: number;
  ourThreatAfter: number;
  // 응수 (소형 탐색 + Stockfish 재확인)
  oppSharpness: number;       // 수 둔 후 상대 최선과 2위 응수 차이
  ownSharpnessBefore: number;
  replySpread: number;        // 자연스러운 응수들의 결과 편차
  zugzwang: number;           // 수 둔 후 상대가 '쉬고 싶은' 정도 (Stockfish)
  risk: RiskKind | null;
  riskWhy: string | null;
}

export interface Reason { w: number; why: string }

export interface StyleResult {
  scores: Record<StyleKey, number>;
  reasons: Record<StyleKey, Reason[]>;
  primary: StyleKey | 'neutral';
  top: StyleKey[];            // 점수 50 이상 스타일 (점수순)
  risk: RiskKind | null;
  riskWhy: string | null;
  quality: QualityKey | null;
  forced: boolean;
}

/** 스타일별 포화 상수: raw 합이 이 값이면 약 63점 */
const K: Record<StyleKey, number> = {
  aggressive: 3, tactical: 2.5, initiative: 2.5, counterattack: 2.5,
  positional: 2.5, prophylactic: 2.5, restriction: 2.5, active: 2.5, space: 2, tension: 2,
  solid: 3, defensive: 2.5, simplifying: 2.5,
  complicating: 2.5, quiet: 2.5, waiting: 2.5, practical: 2.5,
  kingActivity: 2, passedPawn: 2,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function scoreMove(f: StaticFeatures, d: DeepFeatures | null): StyleResult {
  const R = Object.fromEntries(STYLE_KEYS.map((k) => [k, [] as Reason[]])) as Record<StyleKey, Reason[]>;
  const add = (k: StyleKey, w: number, why: string) => { if (Math.abs(w) >= 0.05) R[k].push({ w: r1(w), why }); };

  const sac = f.isMate ? 0 : f.sacrifice;
  const realSac = d ? d.realSacrifice : sac >= 1.5;

  // ── 공격적 ──
  if (f.isMate) add('aggressive', 6, tr('체크메이트', 'Checkmate'));
  else if (f.isCheck) add('aggressive', 1.5, tr('체크', 'Check'));
  if (f.kingAttack > 0) add('aggressive', clamp(0.5 * f.kingAttack, 0, 3), tr(`상대 킹 주변 압박 +${f.kingAttack}`, `Pressure around the enemy king +${f.kingAttack}`));
  if (f.attackersNearKing >= 3) add('aggressive', clamp(0.4 * (f.attackersNearKing - 2), 0, 1.5), tr(`상대 킹 주변에 기물 ${f.attackersNearKing}개 집결`, `${f.attackersNearKing} pieces gathered near the enemy king`));
  if (f.pawnStorm) add('aggressive', 1.5, tr('상대 킹 쪽 폰 돌격', 'Pawn storm toward the enemy king'));
  if (f.intoEnemyHalf && f.advance > 0 && f.piece !== 'k' && f.piece !== 'p') add('aggressive', 0.4, tr('상대 진영으로 침투', 'Invades the enemy camp'));
  if (f.capturedValue > 0) add('aggressive', clamp(0.2 * f.capturedValue, 0, 1), tr('기물을 잡음', 'Captures material'));
  if (d && d.pvChecksByMover > 0 && !f.isMate) add('aggressive', clamp(0.5 * d.pvChecksByMover, 0, 1.5), tr('이후 수순에서 체크 공격이 이어짐', 'Checks follow in the line'));
  if (d && d.pvKingPressureMax >= 4) add('aggressive', 0.8, tr('수순 진행 중 킹 공격이 거세짐', 'The king attack grows during the line'));
  if (realSac && (f.kingAttack > 0 || f.isCheck || (d && d.pvChecksByMover > 0))) add('aggressive', 1.5, tr('킹 공격을 위한 희생', 'Sacrifice for a king attack'));

  // ── 전술적 ──
  if (f.forkTargets >= 2) add('tactical', 2 + 0.5 * (f.forkTargets - 2), tr(`포크 (표적 ${f.forkTargets}개)`, `Fork (${f.forkTargets} targets)`));
  if (f.newPins > 0) add('tactical', clamp(1.2 * f.newPins, 0, 2.4), tr('핀', 'Pin'));
  if (f.newSkewers > 0) add('tactical', clamp(1.5 * f.newSkewers, 0, 3), tr('스큐어', 'Skewer'));
  if (f.discoveredAttack > 0) add('tactical', clamp(1.2 * f.discoveredAttack, 0, 2.4), tr('디스커버드 어택', 'Discovered attack'));
  if (f.threatsCreated >= 2) add('tactical', clamp(0.6 * f.threatsCreated, 0, 2), tr(`기물 위협 (${r1(f.threatsCreated)}점어치)`, `Threatens pieces (${r1(f.threatsCreated)} points)`));
  if (d && d.pvMaterialEnd >= 1.5 && d.pvForcingByMover >= 1 && d.cpLoss <= 60) add('tactical', 2.5, tr(`강제 수순으로 물질 이득 (+${r1(d.pvMaterialEnd)})`, `Wins material by force (+${r1(d.pvMaterialEnd)})`));
  if (d && sac >= 2.5 && d.pvMaterialEnd >= -0.5) add('tactical', 2, tr('기물 희생 후 회수 (콤비네이션)', 'Sacrifice and win back (combination)'));

  // ── 주도권 ──
  const forcing = f.isCheck || f.threatsCreated >= 0.9 || (d ? d.ourThreatAfter >= 100 : false);
  if (f.isCheck && !f.isMate) add('initiative', 1, tr('체크로 응수 강제', 'Forces a reply with check'));
  if (d && d.ourThreatAfter >= 100 && d.ourThreatBefore < 80) add('initiative', 1.5, tr('새 위협으로 상대 응수를 강제', 'Forces a reply with a new threat'));
  if (f.threatsCreated >= 0.9) add('initiative', 0.8, tr('상대 기물을 위협', 'Threatens an enemy piece'));
  if (d && d.pvForcingByMover >= 2) add('initiative', 1.2, tr('강제적인 수가 계속 이어짐', 'Forcing moves keep coming'));
  if (forcing && (f.mobilityDelta > 0 || f.isDevelopment)) add('initiative', 1, tr('템포를 얻으며 기물 개선', 'Improves a piece with tempo'));

  // ── 반격 ──
  // 상대가 노리던 것을 막지 않고, 새로 커진 내 위협으로 맞받거나 상쇄
  // 내 맞위협은 물질 위협(소형 탐색)이거나 상대 킹을 향한 압박·체크
  // 반격은 다소 무리한 수(예: 트랙슬러)도 많아 명백한 실수(150cp 초과)만 제외한다. 좋고 나쁨은 품질 축에서 따로 본다
  const counter = !!d && d.threatBefore >= 150 && f.rescued < 0.5 && !f.inCheckBefore && d.cpLoss <= 150 &&
    ((d.ourThreatAfter >= 100 && d.ourThreatAfter >= d.ourThreatBefore + 50) || f.kingAttack >= 2 || f.isCheck);
  if (counter) add('counterattack', 2.5, tr('상대 위협을 막지 않고 맞위협으로 상쇄', 'Ignores the threat and offsets it with a counter-threat'));
  if (d) {
    if (d.threatBefore >= 150 && d.threatAfterOpp >= 100 && (d.ourThreatAfter >= 0.7 * d.threatAfterOpp || f.isCheck) && d.cpLoss <= 80)
      add('counterattack', 3, tr('상대 위협을 막지 않고 맞위협', 'Meets the threat with a counter-threat'));
  } else if (f.ignoredThreat >= 1 && (f.threatsCreated >= f.ignoredThreat * 0.7 || f.isCheck)) {
    add('counterattack', 2, tr('위협받는 기물을 두고 맞위협', 'Leaves the attacked piece and counter-threatens'));
  }

  // ── 포지셔널 ──
  if (f.structureDelta < 0) add('positional', 1, tr('내 폰 구조 개선', 'Improves own pawn structure'));
  if (f.structureDelta > 0) add('positional', -0.8, tr('내 폰 구조 약화', 'Weakens own pawn structure'));
  if (f.oppStructureDelta > 0) add('positional', 1.2, tr('상대 폰 구조 약화', 'Weakens the opponent\'s pawn structure'));
  if (f.outpostDelta > 0) add('positional', 1.5, tr('아웃포스트 확보', 'Secures an outpost'));
  if (f.weakPawnPressure > 0) add('positional', clamp(0.5 * f.weakPawnPressure, 0, 1.5), tr('상대 약한 폰 공략', 'Targets a weak pawn'));
  if (f.rookOpenFile) add('positional', 1.6, tr('룩을 열린 파일로', 'Rook to an open file'));
  if (f.rookSeventh) add('positional', 1.2, tr('룩을 7랭크로', 'Rook to the 7th rank'));
  if (f.isQuiet && f.centralization > 0 && f.piece !== 'p' && f.piece !== 'k') add('positional', 0.4, tr('조용한 기물 재배치', 'Quiet piece regrouping'));

  // ── 예방적 ──
  if (d && !counter && d.threatBefore >= 100 && d.threatAfterOpp <= d.threatBefore - 80 && f.rescued < 0.5 && !f.inCheckBefore)
    add('prophylactic', 1.5 + clamp(d.threatBefore / 100, 0, 2), tr(`상대의 위협(${Math.round(d.threatBefore)}cp)을 미리 차단`, `Stops the opponent's threat (${Math.round(d.threatBefore)}cp) in advance`));

  // ── 제한 ──
  if (f.oppMobilityDelta < 0) add('restriction', clamp(-0.12 * f.oppMobilityDelta, 0, 3), tr(`상대 기동성 ${f.oppMobilityDelta}`, `Opponent mobility ${f.oppMobilityDelta}`));
  if (f.oppMobilityDelta <= -6) add('restriction', 0.5, tr('상대 기물을 크게 묶음', 'Ties down enemy pieces'));

  // ── 활동적 ──
  if (f.mobilityDelta > 0) add('active', clamp(0.15 * f.mobilityDelta, 0, 2.5), tr(`기동성 +${f.mobilityDelta}`, `Mobility +${f.mobilityDelta}`));
  if (f.mobilityDelta < 0) add('active', clamp(0.1 * f.mobilityDelta, -1.5, 0), tr(`기동성 ${f.mobilityDelta}`, `Mobility ${f.mobilityDelta}`));
  if (f.centralization > 0 && f.piece !== 'k') add('active', 0.6 * f.centralization, tr('기물 중앙화', 'Centralizes a piece'));
  if (f.isDevelopment) add('active', 1.5, tr('기물 전개', 'Develops a piece'));
  if (f.pawnBreak) add('active', 0.8, tr('폰 브레이크로 라인 개방', 'Pawn break opens lines'));
  if (f.advance > 0 && f.piece !== 'p' && f.piece !== 'k') add('active', 0.3, tr('기물 전진', 'Advances a piece'));
  if (f.rookOpenFile) add('active', 0.5, tr('룩 활성화', 'Activates the rook'));

  // ── 공간 확보 ──
  if (f.spaceDelta > 0) add('space', clamp(0.6 * f.spaceDelta, 0, 3), tr(`공간 +${r1(f.spaceDelta)}`, `Space +${r1(f.spaceDelta)}`));
  if (f.centralPawnAdvance) add('space', 1.2, tr('중앙 폰 전진으로 영역 확대', 'Central pawn advance gains ground'));

  // ── 긴장 유지 ──
  // 긴장 = 폰끼리 서로 잡을 수 있는 대치. 기물끼리 노려보는 것은 약하게만 반영
  if (f.pawnTensionBefore > 0 && f.pawnTensionAfter >= f.pawnTensionBefore && !f.capturedValue) add('tension', 0.8, tr('폰 교환을 할 수 있는데 대치를 풀지 않음', 'Keeps the pawn tension instead of trading'));
  if (f.pawnTensionAfter > f.pawnTensionBefore && !f.capturedValue) add('tension', clamp(1.5 * (f.pawnTensionAfter - f.pawnTensionBefore), 0, 2.5), tr('새 폰 대치 생성', 'Creates new pawn tension'));
  if (f.reinforcesTension && f.pawnTensionAfter > 0) add('tension', 1.2, tr('대치 중인 폰을 보강하며 긴장 유지', 'Reinforces the tense pawn and keeps tension'));
  const pieceTension = (f.tensionAfter - f.pawnTensionAfter) - (f.tensionBefore - f.pawnTensionBefore);
  if (pieceTension > 0 && !f.capturedValue) add('tension', 0.5, tr('기물 간 대치 생성', 'Creates piece tension'));

  // ── 안정적 ──
  if (d && d.oppSharpness <= 40 && d.replySpread <= 100 && f.hangOwnAfter < 0.5) add('solid', 1.2, tr('어떤 응수에도 평가가 안정적', 'Evaluation holds against any reply'));
  if (f.isCastle) add('solid', 1.5, tr('캐슬링으로 킹 안전 확보', 'Castles to secure the king'));
  if (f.hangOwnAfter < 0.5 && sac <= 0.5) add('solid', 0.5, tr('모든 기물이 안전함', 'All pieces are safe'));
  if (f.defendedDelta > 0) add('solid', clamp(0.3 * f.defendedDelta, 0, 1.2), tr(`수비받는 기물 +${f.defendedDelta}`, `Defended pieces +${f.defendedDelta}`));
  if (f.weakensOwnKing) add('solid', -1, tr('킹 약화', 'Weakens the king'));
  if (sac > 0.5) add('solid', -1.2 * sac, tr('물질 위험 감수', 'Risks material'));
  if (f.ownKingDanger > 0) add('solid', clamp(-0.3 * f.ownKingDanger, -1.5, 0), tr('내 킹 주변 위협 증가', 'More threats around own king'));

  // ── 수비적 ──
  if (f.inCheckBefore) add('defensive', 3, tr('체크에 대응', 'Responds to check'));
  if (f.rescued > 0.5) add('defensive', clamp(0.9 * f.rescued, 0, 4), tr(`위협받던 기물 구출 (${r1(f.rescued)}점)`, `Rescues an attacked piece (${r1(f.rescued)} points)`));
  if (f.ownKingDanger < 0) add('defensive', clamp(-0.4 * f.ownKingDanger, 0, 2.5), tr(`내 킹 주변 위협 감소 ${f.ownKingDanger}`, `Fewer threats around own king ${f.ownKingDanger}`));
  if (f.ownShieldDelta > 0) add('defensive', 0.8, tr('킹 앞 방패 강화', 'Strengthens the king shield'));
  if (f.advance < 0 && f.piece !== 'p' && !f.isCastle) add('defensive', 1, tr('후퇴', 'Retreats'));
  if (f.defendedDelta > 0) add('defensive', clamp(0.3 * f.defendedDelta, 0, 1.2), tr('기물 간 보호 강화', 'Pieces protect each other better'));
  if (d && d.threatBefore >= 100 && d.threatAfterOpp <= d.threatBefore - 80 && (f.rescued >= 0.5 || f.inCheckBefore))
    add('defensive', 1.5, tr('상대 위협 차단', 'Blocks the opponent\'s threat'));

  // ── 단순화 ──
  if (f.piecesTraded) add('simplifying', 2, tr('기물 교환', 'Trades pieces'));
  else if (f.isTrade) add('simplifying', 1, tr('교환', 'Trade'));
  const ahead = d ? d.evalBefore >= 150 : f.materialBalance >= 2;
  if (ahead && f.piecesTraded) add('simplifying', 1.5, tr('앞선 상황에서 단순화', 'Simplifies while ahead'));
  if (f.capturedValue && f.tensionAfter < f.tensionBefore) add('simplifying', 0.5, tr('대치를 교환으로 해소', 'Resolves tension by trading'));

  // ── 복잡화 ──
  // 실수로 생긴 '상대만 정답을 찾으면 되는' 국면은 복잡화로 치지 않는다
  const unclear = d && d.cpLoss <= 80 && Math.abs(d.evalAfter) < 500;
  if (unclear && d.oppSharpness >= 120) add('complicating', 1.5, tr('상대에게 정답이 거의 하나뿐인 국면', 'Leaves the opponent almost one good move'));
  if (unclear && d.replySpread >= 300) add('complicating', 1.2, tr('응수에 따라 결과가 크게 갈림', 'The outcome swings by reply'));
  if (unclear && d.oppSharpness >= d.ownSharpnessBefore + 80) add('complicating', 1, tr('국면이 날카로워짐', 'The position gets sharper'));
  if (f.tensionAfter > f.tensionBefore) add('complicating', 0.5, tr('대치 증가', 'More tension'));
  if (sac > 0.5) add('complicating', 0.8, tr('물질 불균형 생성', 'Creates a material imbalance'));
  if (f.kingAttack > 0 && f.ownKingDanger > 0) add('complicating', 1, tr('양쪽 킹이 모두 위험해짐', 'Both kings become exposed'));
  if (f.piecesTraded) add('complicating', -1, tr('교환으로 단순해짐', 'Trades simplify the game'));

  // ── 조용한 수 ──
  if (d && f.isQuiet && !f.isCastle && !f.inCheckBefore && d.cpLoss <= 10 && d.bestGap >= 60)
    add('quiet', 2.5 + clamp((d.bestGap - 60) / 100, 0, 1.5), tr(`조용하지만 대안보다 ${Math.round(d.bestGap)}cp 좋은 수`, `Quiet, but ${Math.round(d.bestGap)}cp better than alternatives`));

  // ── 대기수 ──
  if (d && f.quietShuffle && d.cpLoss <= 20 && d.zugzwang >= 80) add('waiting', 4, tr('상대를 주그츠방에 빠뜨림', 'Puts the opponent in zugzwang'));

  // ── 실용적 ──
  if (d && d.cpLoss >= 15 && d.cpLoss <= 80) {
    if (f.piecesTraded) add('practical', 1.5, tr('최선은 아니지만 교환으로 정리', 'Not the best, but tidies up with trades'));
    if (d.threatAfterOpp < d.threatBefore - 50) add('practical', 1.2, tr('최선은 아니지만 상대 위협을 없앰', 'Not the best, but removes the threat'));
    if (f.ownKingDanger < 0) add('practical', 0.8, tr('최선은 아니지만 킹을 안전하게', 'Not the best, but keeps the king safe'));
    if (d.oppSharpness <= 40 && d.ownSharpnessBefore >= 100) add('practical', 1.2, tr('복잡한 국면을 쉬운 국면으로', 'Turns a complex position into an easy one'));
  }

  // ── 엔드게임 ──
  if (f.kingActivation) add('kingActivity', 3, tr('엔드게임 킹 전진', 'Endgame king advance'));
  // 패스폰은 엔드게임에서 더 큰 의미
  const ppw = f.isEndgame ? 1 : 0.6;
  if (f.passedPawnPush) add('passedPawn', 2.5 * ppw, tr('패스폰 전진', 'Pushes a passed pawn'));
  if (f.passedCreated > 0) add('passedPawn', 2 * ppw, tr('패스폰 생성', 'Creates a passed pawn'));

  // ── 점수화 ──
  const scores = {} as Record<StyleKey, number>;
  const strength = {} as Record<StyleKey, number>;
  for (const k of STYLE_KEYS) {
    const raw = R[k].reduce((s, x) => s + x.w, 0);
    strength[k] = raw / K[k];
    scores[k] = Math.round(100 * (1 - Math.exp(-Math.max(0, raw) / K[k])));
  }
  // 대표 스타일은 포화 전 강도로 고른다 (점수는 100 근처에서 구분이 안 되므로)
  const ranked = [...STYLE_KEYS].sort((a, b) => strength[b] - strength[a]);
  const primary = scores[ranked[0]] >= 30 ? ranked[0] : 'neutral';
  const top = ranked.filter((k) => scores[k] >= 50);

  return {
    scores, reasons: R, primary, top,
    risk: d?.risk ?? null, riskWhy: d?.riskWhy ?? null,
    quality: d ? qualityOf(d.cpLoss, d.winDrop, d.isBest, d.expPlayed) : null,
    forced: d?.forced ?? (f.legalMoveCount === 1),
  };
}
