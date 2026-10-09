// 스타일 사전: 각 스타일이 무엇이고 어떻게 측정하는지
import { STYLES, STYLE_KEYS, RISK_LABEL, QUALITY_LABEL, type StyleKey, type RiskKind, type QualityKey } from '../core/styles';

export const HOW: Record<StyleKey, string> = {
  aggressive: '상대 킹 주변을 공격하는 내 기물 수의 증가, 체크, 킹 쪽 폰 돌격, 이후 주요 변화에서 이어지는 체크와 킹 압박',
  tactical: '포크·핀·스큐어·디스커버드 어택 생성, 강제 수순으로 얻는 물질, 기물 희생 후 회수(콤비네이션)',
  initiative: '체크나 새 위협으로 상대의 응수를 강제하고, 그 사이 기물을 개선하는 수',
  counterattack: '상대가 무언가를 노리는 상황에서 막지 않고 같거나 더 큰 위협으로 맞받는 수',
  positional: '폰 구조 개선, 상대 폰 구조 약화, 아웃포스트, 고립 폰 공략, 열린 파일·7랭크의 룩',
  prophylactic: '내가 한 수 쉬면 상대가 얻을 이득(null move 탐색)이 이 수로 사라짐. 직접적인 기물 구출은 제외',
  restriction: '상대 기물들이 갈 수 있는 칸 수를 크게 줄임',
  active: '기물 전개, 중앙화, 기동성 증가, 폰 브레이크로 라인 개방',
  space: '상대 진영 쪽으로 폰이 통제하는 칸 증가, 중앙 폰 전진',
  tension: '서로 잡을 수 있는 폰·기물 대치를 교환으로 풀지 않고 유지하거나 새로 만듦',
  solid: '상대의 여러 응수에 대해 평가가 크게 흔들리지 않고, 내 기물이 모두 안전한 수',
  defensive: '체크 대응, 위협받던 기물 구출, 내 킹 주변 위협 감소, 후퇴',
  simplifying: '기물 교환. 앞서 있을 때 더 가중',
  complicating: '상대에게 좋은 수가 거의 하나뿐이거나 응수에 따라 결과가 크게 갈리는 국면으로 만듦',
  quiet: '체크·잡기·직접 위협 없이, 다른 후보보다 확실히 좋은 최선 수',
  waiting: '국면을 거의 바꾸지 않는 수인데 상대가 주그츠방(차라리 쉬고 싶은 상태)에 빠짐',
  practical: '최선은 아니지만(손실이 작음) 교환이나 위협 제거로 국면을 쉽게 만듦',
  kingActivity: '엔드게임에서 킹을 중앙이나 상대 진영으로 전진',
  passedPawn: '패스폰을 전진시키거나 새로 만듦',
};

const RISK_DESC: Record<RiskKind, string> = {
  soundSacrifice: '물질을 내주고(교환 희생, 공격받던 기물을 그냥 두는 것 포함) Stockfish 주요 변화를 따라가도 회수되지 않지만, 평가는 유지되는 수.',
  speculative: '물질을 내주는 희생인데 Stockfish 기준으로는 손해(기대 점수 10%p 이상 하락)인 수. 블런더 수준은 아니며, 정확한 수비가 어려워 실전에서 통할 수 있다.',
  trap: 'Stockfish 기준 손해가 없는데, 상대가 솔깃하게 미끼를 물면(자연스러운 잡기·체크) 기대 점수가 20%p 이상 오르는 수. 기물을 그냥 내주는 미끼면 "미끼 희생"이라고 함께 적는다.',
  gamble: 'Stockfish 기준 손해인데, 상대가 솔깃한 응수를 두면 최선 수보다 더 좋아지는 수. 상대가 틀리길 노리는 수.',
};

const QUALITY_DESC: Record<QualityKey, string> = {
  best: 'Stockfish 최선 수이거나 손실 10cp 이하',
  good: 'Stockfish 승/무/패 확률로 본 기대 점수 하락 12%p 미만',
  inaccuracy: '기대 점수 하락 12~25%p (평형 국면에서 대략 0.5폰)',
  mistake: '기대 점수 하락 25~50%p (대략 1폰)',
  blunder: '기대 점수 하락 50%p 이상 (대략 3폰)',
};

export function renderGuide(): string {
  const groups = [...new Set(STYLE_KEYS.map((k) => STYLES[k].group))];
  const styleSections = groups.map((g) => `
    <section class="guide-group">
      <h2>${g} 계열</h2>
      <div class="guide-list">
        ${STYLE_KEYS.filter((k) => STYLES[k].group === g).map((k) => `
          <div class="card guide-item">
            <h3><span class="dot" style="background:${STYLES[k].color}"></span>${STYLES[k].label}</h3>
            <p>${STYLES[k].desc}</p>
            <div class="how">측정: ${HOW[k]}</div>
          </div>`).join('')}
      </div>
    </section>`).join('');
  const risk = (Object.keys(RISK_LABEL) as RiskKind[]).map((k) => `
    <div class="card guide-item"><h3>${RISK_LABEL[k]}</h3><p>${RISK_DESC[k]}</p></div>`).join('');
  const quality = (Object.keys(QUALITY_LABEL) as QualityKey[]).map((k) => `
    <div class="card guide-item"><h3><span class="pill q-${k}">${QUALITY_LABEL[k]}</span></h3><p>${QUALITY_DESC[k]}</p></div>`).join('');
  return `
    <div class="guide">
      <div class="hero"><h1>스타일 사전</h1><p>한 수는 여러 스타일을 동시에 가질 수 있고(각 0~100점), 위험 판정과 품질은 별도로 매깁니다.</p></div>
      ${styleSections}
      <section class="guide-group"><h2>위험 판정 (해당될 때 하나만)</h2><div class="guide-list">${risk}</div></section>
      <section class="guide-group"><h2>수의 품질</h2><div class="guide-list">${quality}</div></section>
      <section class="guide-group card card-pad">
        <h2>오프닝 이론 수</h2>
        <p class="muted">Lichess가 공개한 오프닝 목록(약 3,300개 변화)에 있는 국면까지는 이론 수로 봅니다. 수순이 바뀌어 같은 국면에 와도 인식합니다. 누구나 두는 수라 스타일 점수는 참고용으로 흐리게 보여주고 플레이어 평가에서는 뺍니다. 처음 이론을 벗어난 수는 ↳로 표시합니다.</p>
      </section>
      <section class="guide-group card card-pad">
        <h2>강제된 수</h2>
        <p class="muted">합법 수가 하나뿐이거나, 체크를 피하는 수가 거의 없거나, 당연한 되잡기처럼 누구나 먼저 떠올릴 유일한 최선 수는 플레이어의 선택이 아니므로 플레이어 평가 집계에서 제외합니다. 찾기 어려운 유일한 수(희생 등)는 포함합니다.</p>
      </section>
    </div>`;
}
