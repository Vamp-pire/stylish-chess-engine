// 특징 → 스타일 19종 점수 + 위험 판정 + 품질.
// 모든 점수는 '근거 목록'의 가중합이라 왜 그렇게 판정했는지 그대로 보여줄 수 있다.
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

export const STYLES: Record<StyleKey, StyleInfo> = {
  aggressive:    { label: '공격적',     group: '공격',     color: '#e5484d', desc: '상대 킹을 향한 압박' },
  tactical:      { label: '전술적',     group: '공격',     color: '#f76b15', desc: '포크·핀 등 구체적 전술' },
  initiative:    { label: '주도권',     group: '공격',     color: '#e54666', desc: '위협으로 상대 응수를 강제' },
  counterattack: { label: '반격',       group: '공격',     color: '#d6409f', desc: '막지 않고 더 큰 위협으로 맞받음' },
  positional:    { label: '포지셔널',   group: '포지션',   color: '#3e63dd', desc: '구조·약점·아웃포스트' },
  prophylactic:  { label: '예방적',     group: '포지션',   color: '#0090ff', desc: '상대의 구체적 위협을 미리 차단' },
  restriction:   { label: '제한',       group: '포지션',   color: '#00a2c7', desc: '상대 기물 활동 범위 축소' },
  active:        { label: '활동적',     group: '포지션',   color: '#ffb224', desc: '전개·중앙화·기동성' },
  space:         { label: '공간 확보',  group: '포지션',   color: '#ad7f58', desc: '폰 전진으로 영역 확대' },
  tension:       { label: '긴장 유지',  group: '포지션',   color: '#8e4ec6', desc: '교환 가능한 대치를 유지·생성' },
  solid:         { label: '안정적',     group: '안전',     color: '#30a46c', desc: '어떤 응수에도 평가가 흔들리지 않음' },
  defensive:     { label: '수비적',     group: '안전',     color: '#12a594', desc: '위협 해소·킹 보호·구출' },
  simplifying:   { label: '단순화',     group: '안전',     color: '#8da4ef', desc: '교환으로 국면 정리' },
  complicating:  { label: '복잡화',     group: '실전',     color: '#ab4aba', desc: '국면을 날카롭게 만듦' },
  quiet:         { label: '조용한 수',  group: '실전',     color: '#6e56cf', desc: '조용하지만 확실히 강한 수' },
  waiting:       { label: '대기수',     group: '실전',     color: '#7c7c7c', desc: '상대를 주그츠방에 빠뜨리는 템포 수' },
  practical:     { label: '실용적',     group: '실전',     color: '#978365', desc: '최선은 아니지만 국면을 쉽게 만듦' },
  kingActivity:  { label: '킹 활성화',  group: '엔드게임', color: '#29a383', desc: '엔드게임에서 킹 전진' },
  passedPawn:    { label: '패스폰 추진', group: '엔드게임', color: '#5bb98c', desc: '패스폰 전진·생성' },
};

export type RiskKind = 'soundSacrifice' | 'trap' | 'gamble';
export const RISK_LABEL: Record<RiskKind, string> = {
  soundSacrifice: '건전한 희생',
  trap: '함정수',
  gamble: '도박수',
};

export type QualityKey = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export const QUALITY_LABEL: Record<QualityKey, string> = {
  best: '최선', good: '좋은 수', inaccuracy: '부정확', mistake: '실수', blunder: '블런더',
};

/**
 * 품질은 전적으로 Stockfish 출력으로 판정한다: Stockfish가 낸 승/무/패 확률(WDL)로 계산한
 * 기대 점수가 최선 수 대비 얼마나 떨어졌는가 (%p). 이미 이긴/진 국면의 큰 cp 변동은 실수로 보지 않는다.
 */
export function qualityOf(cpLoss: number, winDrop: number, isBest: boolean): QualityKey {
  if (isBest || cpLoss <= 10) return 'best';
  // Stockfish 19의 WDL은 +1.00 = 승률 50%로 맞춰져 있어 기대 점수가 빠르게 움직인다.
  // 평형 국면 기준 대략 -50cp / -100cp / -300cp 손실에 해당하도록 기준을 정했다.
  if (winDrop < 12) return 'good';
  if (winDrop < 25) return 'inaccuracy';
  if (winDrop < 50) return 'mistake';
  return 'blunder';
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
  if (f.isMate) add('aggressive', 6, '체크메이트');
  else if (f.isCheck) add('aggressive', 1.5, '체크');
  if (f.kingAttack > 0) add('aggressive', clamp(0.5 * f.kingAttack, 0, 3), `상대 킹 주변 압박 +${f.kingAttack}`);
  if (f.attackersNearKing >= 3) add('aggressive', clamp(0.4 * (f.attackersNearKing - 2), 0, 1.5), `상대 킹 주변에 기물 ${f.attackersNearKing}개 집결`);
  if (f.pawnStorm) add('aggressive', 1.5, '상대 킹 쪽 폰 돌격');
  if (f.intoEnemyHalf && f.advance > 0 && f.piece !== 'k' && f.piece !== 'p') add('aggressive', 0.4, '상대 진영으로 침투');
  if (f.capturedValue > 0) add('aggressive', clamp(0.2 * f.capturedValue, 0, 1), '기물을 잡음');
  if (d && d.pvChecksByMover > 0 && !f.isMate) add('aggressive', clamp(0.5 * d.pvChecksByMover, 0, 1.5), '이후 수순에서 체크 공격이 이어짐');
  if (d && d.pvKingPressureMax >= 4) add('aggressive', 0.8, '수순 진행 중 킹 공격이 거세짐');
  if (realSac && (f.kingAttack > 0 || f.isCheck || (d && d.pvChecksByMover > 0))) add('aggressive', 1.5, '킹 공격을 위한 희생');

  // ── 전술적 ──
  if (f.forkTargets >= 2) add('tactical', 2 + 0.5 * (f.forkTargets - 2), `포크 (표적 ${f.forkTargets}개)`);
  if (f.newPins > 0) add('tactical', clamp(1.2 * f.newPins, 0, 2.4), '핀');
  if (f.newSkewers > 0) add('tactical', clamp(1.5 * f.newSkewers, 0, 3), '스큐어');
  if (f.discoveredAttack > 0) add('tactical', clamp(1.2 * f.discoveredAttack, 0, 2.4), '디스커버드 어택');
  if (f.threatsCreated >= 2) add('tactical', clamp(0.6 * f.threatsCreated, 0, 2), `기물 위협 (${r1(f.threatsCreated)}점어치)`);
  if (d && d.pvMaterialEnd >= 1.5 && d.pvForcingByMover >= 1 && d.cpLoss <= 60) add('tactical', 2.5, `강제 수순으로 물질 이득 (+${r1(d.pvMaterialEnd)})`);
  if (d && sac >= 2.5 && d.pvMaterialEnd >= -0.5) add('tactical', 2, '기물 희생 후 회수 (콤비네이션)');

  // ── 주도권 ──
  const forcing = f.isCheck || f.threatsCreated >= 0.9 || (d ? d.ourThreatAfter >= 100 : false);
  if (f.isCheck && !f.isMate) add('initiative', 1, '체크로 응수 강제');
  if (d && d.ourThreatAfter >= 100 && d.ourThreatBefore < 80) add('initiative', 1.5, '새 위협으로 상대 응수를 강제');
  if (f.threatsCreated >= 0.9) add('initiative', 0.8, '상대 기물을 위협');
  if (d && d.pvForcingByMover >= 2) add('initiative', 1.2, '강제적인 수가 계속 이어짐');
  if (forcing && (f.mobilityDelta > 0 || f.isDevelopment)) add('initiative', 1, '템포를 얻으며 기물 개선');

  // ── 반격 ──
  // 상대가 노리던 것을 막지 않고, 새로 커진 내 위협으로 맞받거나 상쇄
  // 내 맞위협은 물질 위협(소형 탐색)이거나 상대 킹을 향한 압박·체크
  const counter = !!d && d.threatBefore >= 150 && f.rescued < 0.5 && !f.inCheckBefore && d.cpLoss <= 80 &&
    ((d.ourThreatAfter >= 100 && d.ourThreatAfter >= d.ourThreatBefore + 50) || f.kingAttack >= 2 || f.isCheck);
  if (counter) add('counterattack', 2.5, '상대 위협을 막지 않고 맞위협으로 상쇄');
  if (d) {
    if (d.threatBefore >= 150 && d.threatAfterOpp >= 100 && (d.ourThreatAfter >= 0.7 * d.threatAfterOpp || f.isCheck) && d.cpLoss <= 80)
      add('counterattack', 3, '상대 위협을 막지 않고 맞위협');
  } else if (f.ignoredThreat >= 1 && (f.threatsCreated >= f.ignoredThreat * 0.7 || f.isCheck)) {
    add('counterattack', 2, '위협받는 기물을 두고 맞위협');
  }

  // ── 포지셔널 ──
  if (f.structureDelta < 0) add('positional', 1, '내 폰 구조 개선');
  if (f.structureDelta > 0) add('positional', -0.8, '내 폰 구조 약화');
  if (f.oppStructureDelta > 0) add('positional', 1.2, '상대 폰 구조 약화');
  if (f.outpostDelta > 0) add('positional', 1.5, '아웃포스트 확보');
  if (f.weakPawnPressure > 0) add('positional', clamp(0.5 * f.weakPawnPressure, 0, 1.5), '상대 약한 폰 공략');
  if (f.rookOpenFile) add('positional', 1.6, '룩을 열린 파일로');
  if (f.rookSeventh) add('positional', 1.2, '룩을 7랭크로');
  if (f.isQuiet && f.centralization > 0 && f.piece !== 'p' && f.piece !== 'k') add('positional', 0.4, '조용한 기물 재배치');

  // ── 예방적 ──
  if (d && !counter && d.threatBefore >= 100 && d.threatAfterOpp <= d.threatBefore - 80 && f.rescued < 0.5 && !f.inCheckBefore)
    add('prophylactic', 1.5 + clamp(d.threatBefore / 100, 0, 2), `상대의 위협(${Math.round(d.threatBefore)}cp)을 미리 차단`);

  // ── 제한 ──
  if (f.oppMobilityDelta < 0) add('restriction', clamp(-0.12 * f.oppMobilityDelta, 0, 3), `상대 기동성 ${f.oppMobilityDelta}`);
  if (f.oppMobilityDelta <= -6) add('restriction', 0.5, '상대 기물을 크게 묶음');

  // ── 활동적 ──
  if (f.mobilityDelta > 0) add('active', clamp(0.15 * f.mobilityDelta, 0, 2.5), `기동성 +${f.mobilityDelta}`);
  if (f.mobilityDelta < 0) add('active', clamp(0.1 * f.mobilityDelta, -1.5, 0), `기동성 ${f.mobilityDelta}`);
  if (f.centralization > 0 && f.piece !== 'k') add('active', 0.6 * f.centralization, '기물 중앙화');
  if (f.isDevelopment) add('active', 1.5, '기물 전개');
  if (f.pawnBreak) add('active', 0.8, '폰 브레이크로 라인 개방');
  if (f.advance > 0 && f.piece !== 'p' && f.piece !== 'k') add('active', 0.3, '기물 전진');
  if (f.rookOpenFile) add('active', 0.5, '룩 활성화');

  // ── 공간 확보 ──
  if (f.spaceDelta > 0) add('space', clamp(0.6 * f.spaceDelta, 0, 3), `공간 +${r1(f.spaceDelta)}`);
  if (f.centralPawnAdvance) add('space', 1.2, '중앙 폰 전진으로 영역 확대');

  // ── 긴장 유지 ──
  // 긴장 = 폰끼리 서로 잡을 수 있는 대치. 기물끼리 노려보는 것은 약하게만 반영
  if (f.pawnTensionBefore > 0 && f.pawnTensionAfter >= f.pawnTensionBefore && !f.capturedValue) add('tension', 0.8, '폰 교환을 할 수 있는데 대치를 풀지 않음');
  if (f.pawnTensionAfter > f.pawnTensionBefore && !f.capturedValue) add('tension', clamp(1.5 * (f.pawnTensionAfter - f.pawnTensionBefore), 0, 2.5), '새 폰 대치 생성');
  if (f.reinforcesTension && f.pawnTensionAfter > 0) add('tension', 1.2, '대치 중인 폰을 보강하며 긴장 유지');
  const pieceTension = (f.tensionAfter - f.pawnTensionAfter) - (f.tensionBefore - f.pawnTensionBefore);
  if (pieceTension > 0 && !f.capturedValue) add('tension', 0.5, '기물 간 대치 생성');

  // ── 안정적 ──
  if (d && d.oppSharpness <= 40 && d.replySpread <= 100 && f.hangOwnAfter < 0.5) add('solid', 1.2, '어떤 응수에도 평가가 안정적');
  if (f.isCastle) add('solid', 1.5, '캐슬링으로 킹 안전 확보');
  if (f.hangOwnAfter < 0.5 && sac <= 0.5) add('solid', 0.5, '모든 기물이 안전함');
  if (f.defendedDelta > 0) add('solid', clamp(0.3 * f.defendedDelta, 0, 1.2), `수비받는 기물 +${f.defendedDelta}`);
  if (f.weakensOwnKing) add('solid', -1, '킹 약화');
  if (sac > 0.5) add('solid', -1.2 * sac, '물질 위험 감수');
  if (f.ownKingDanger > 0) add('solid', clamp(-0.3 * f.ownKingDanger, -1.5, 0), '내 킹 주변 위협 증가');

  // ── 수비적 ──
  if (f.inCheckBefore) add('defensive', 3, '체크에 대응');
  if (f.rescued > 0.5) add('defensive', clamp(0.9 * f.rescued, 0, 4), `위협받던 기물 구출 (${r1(f.rescued)}점)`);
  if (f.ownKingDanger < 0) add('defensive', clamp(-0.4 * f.ownKingDanger, 0, 2.5), `내 킹 주변 위협 감소 ${f.ownKingDanger}`);
  if (f.ownShieldDelta > 0) add('defensive', 0.8, '킹 앞 방패 강화');
  if (f.advance < 0 && f.piece !== 'p' && !f.isCastle) add('defensive', 1, '후퇴');
  if (f.defendedDelta > 0) add('defensive', clamp(0.3 * f.defendedDelta, 0, 1.2), '기물 간 보호 강화');
  if (d && d.threatBefore >= 100 && d.threatAfterOpp <= d.threatBefore - 80 && (f.rescued >= 0.5 || f.inCheckBefore))
    add('defensive', 1.5, '상대 위협 차단');

  // ── 단순화 ──
  if (f.piecesTraded) add('simplifying', 2, '기물 교환');
  else if (f.isTrade) add('simplifying', 1, '교환');
  const ahead = d ? d.evalBefore >= 150 : f.materialBalance >= 2;
  if (ahead && f.piecesTraded) add('simplifying', 1.5, '앞선 상황에서 단순화');
  if (f.capturedValue && f.tensionAfter < f.tensionBefore) add('simplifying', 0.5, '대치를 교환으로 해소');

  // ── 복잡화 ──
  // 실수로 생긴 '상대만 정답을 찾으면 되는' 국면은 복잡화로 치지 않는다
  const unclear = d && d.cpLoss <= 80 && Math.abs(d.evalAfter) < 500;
  if (unclear && d.oppSharpness >= 120) add('complicating', 1.5, '상대에게 정답이 거의 하나뿐인 국면');
  if (unclear && d.replySpread >= 300) add('complicating', 1.2, '응수에 따라 결과가 크게 갈림');
  if (unclear && d.oppSharpness >= d.ownSharpnessBefore + 80) add('complicating', 1, '국면이 날카로워짐');
  if (f.tensionAfter > f.tensionBefore) add('complicating', 0.5, '대치 증가');
  if (sac > 0.5) add('complicating', 0.8, '물질 불균형 생성');
  if (f.kingAttack > 0 && f.ownKingDanger > 0) add('complicating', 1, '양쪽 킹이 모두 위험해짐');
  if (f.piecesTraded) add('complicating', -1, '교환으로 단순해짐');

  // ── 조용한 수 ──
  if (d && f.isQuiet && !f.isCastle && !f.inCheckBefore && d.cpLoss <= 10 && d.bestGap >= 60)
    add('quiet', 2.5 + clamp((d.bestGap - 60) / 100, 0, 1.5), `조용하지만 대안보다 ${Math.round(d.bestGap)}cp 좋은 수`);

  // ── 대기수 ──
  if (d && f.quietShuffle && d.cpLoss <= 20 && d.zugzwang >= 80) add('waiting', 4, '상대를 주그츠방에 빠뜨림');

  // ── 실용적 ──
  if (d && d.cpLoss >= 15 && d.cpLoss <= 80) {
    if (f.piecesTraded) add('practical', 1.5, '최선은 아니지만 교환으로 정리');
    if (d.threatAfterOpp < d.threatBefore - 50) add('practical', 1.2, '최선은 아니지만 상대 위협을 없앰');
    if (f.ownKingDanger < 0) add('practical', 0.8, '최선은 아니지만 킹을 안전하게');
    if (d.oppSharpness <= 40 && d.ownSharpnessBefore >= 100) add('practical', 1.2, '복잡한 국면을 쉬운 국면으로');
  }

  // ── 엔드게임 ──
  if (f.kingActivation) add('kingActivity', 3, '엔드게임 킹 전진');
  // 패스폰은 엔드게임에서 더 큰 의미
  const ppw = f.isEndgame ? 1 : 0.6;
  if (f.passedPawnPush) add('passedPawn', 2.5 * ppw, '패스폰 전진');
  if (f.passedCreated > 0) add('passedPawn', 2 * ppw, '패스폰 생성');

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
    quality: d ? qualityOf(d.cpLoss, d.winDrop, d.isBest) : null,
    forced: d?.forced ?? (f.legalMoveCount === 1),
  };
}
