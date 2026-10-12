// 코치 말풍선: 판정 결과(품질·위험·스타일·근거)를 문장 틀에 넣어 한국어 한마디로 만든다.
import { tr } from '../i18n';
import type { MoveAnalysis } from './analyzer';
import { STYLES, RISK_LABEL } from './styles';

export type Tone = 'great' | 'good' | 'warn' | 'bad' | 'info';
export interface CoachLine { tone: Tone; title: string; text: string }

/** 같은 상황에서도 문장이 조금씩 달라지도록 수 번호로 고른다 */
const pick = (list: string[], seed: number) => list[seed % list.length];

function styleLine(m: MoveAnalysis): string {
  if (m.primary === 'neutral') return '';
  const why = m.reasons[m.primary][0]?.why;
  return tr(`${STYLES[m.primary].label}인 수${why ? ` — ${why}` : ''}.`, `A ${STYLES[m.primary].label.toLowerCase()} move${why ? ` — ${why}` : ''}.`);
}

/** 내가 둔 수에 대한 한마디 */
export function commentMine(m: MoveAnalysis): CoachLine {
  const s = m.ply;
  const style = styleLine(m);
  const better = m.bestSan ? `${m.bestSan}${m.bestPvSan.length > 1 ? tr(` (이후 ${m.bestPvSan.slice(1, 4).join(' ')})`, ` (then ${m.bestPvSan.slice(1, 4).join(' ')})`) : ''}` : '';
  if (m.book) return { tone: 'info', title: tr('오프닝 이론', 'Opening theory'), text: `${m.opening ? `${m.opening.name}. ` : ''}${tr('잘 알려진 이론 수예요.', 'A well-known theory move.')}` };
  if (m.risk === 'soundSacrifice') return { tone: 'great', title: pick([tr('멋진 희생!', 'Beautiful sacrifice!'), tr('과감하고 정확해요!', 'Bold and accurate!')], s), text: `${m.riskWhy}.` };
  if (m.risk === 'trap') return { tone: 'great', title: tr('함정을 팠어요', 'You set a trap'), text: `${m.riskWhy}` };
  if (m.risk === 'speculative') return { tone: 'warn', title: tr('대담한 희생', 'A daring sacrifice'), text: tr(`${m.riskWhy}. 더 안전한 수는 ${better}.`, `${m.riskWhy}. A safer move was ${better}.`) };
  if (m.risk === 'gamble') return { tone: 'warn', title: tr('도박수', 'A gamble'), text: `${m.riskWhy}` };
  if (m.forced) return { tone: 'info', title: tr('사실상 유일한 수', 'Practically forced'), text: pick([tr('선택의 여지가 거의 없었어요.', 'There was hardly any choice.'), tr('이 수밖에 없었어요.', 'This was the only move.')], s) };
  switch (m.quality) {
    case 'best':
      return { tone: 'great', title: m.deep.bestGap >= 150 ? tr('유일한 정답!', 'The only move!') : pick([tr('최선 수예요', 'Best move'), tr('완벽해요', 'Perfect'), tr('엔진과 같은 수', 'Engine move')], s), text: style || tr('엔진이 꼽은 최선 수입니다.', 'The engine\'s top choice.') };
    case 'good':
      return { tone: 'good', title: pick([tr('좋은 수예요', 'Good move'), tr('괜찮은 선택', 'Solid choice'), tr('좋아요', 'Nice')], s), text: style || tr('흐름을 잘 유지했어요.', 'You kept the flow.') };
    case 'inaccuracy':
      return { tone: 'warn', title: tr('조금 아쉬워요', 'Slightly inaccurate'), text: `${better ? tr(`${better}가 더 정확했어요.`, `${better} was more accurate.`) : ''} ${style}`.trim() };
    case 'mistake': {
      const reply = m.playedPvSan[0];
      return { tone: 'bad', title: tr('실수예요', 'Mistake'), text: tr(`${reply ? `상대의 ${reply} 응수에 ` : ''}기대 승률이 ${Math.round(m.deep.winDrop)}%p 떨어져요.${better ? ` ${better}가 더 좋았어요.` : ''}`, `${reply ? `After ${reply}, ` : ''}your expected score drops ${Math.round(m.deep.winDrop)} pp.${better ? ` ${better} was better.` : ''}`) };
    }
    case 'blunder': {
      const reply = m.playedPvSan[0];
      return { tone: 'bad', title: tr('큰 실수!', 'Blunder!'), text: tr(`${reply ? `상대가 ${reply}로 응수하면 크게 불리해져요.` : ''}${better ? ` 최선은 ${better}였어요.` : ''}`, `${reply ? `If the opponent answers ${reply}, you are in big trouble.` : ''}${better ? ` The best move was ${better}.` : ''}`).trim() };
    }
    default:
      return { tone: 'info', title: '', text: style };
  }
}

/** 상대가 둔 수에 대한 한마디 (기회를 알려주되 정답은 말하지 않는다) */
export function commentOpponent(m: MoveAnalysis): CoachLine | null {
  if (m.book) return null;
  if (m.quality === 'blunder') return { tone: 'great', title: tr('기회예요!', 'Your chance!'), text: tr('상대가 큰 실수를 했어요. 이득을 볼 수 있는 수를 찾아보세요.', 'The opponent blundered. Look for the move that takes advantage.') };
  if (m.quality === 'mistake') return { tone: 'good', title: tr('상대의 실수', 'Opponent\'s mistake'), text: tr('상대가 실수했어요. 좋은 수가 있을지 살펴보세요.', 'The opponent made a mistake. See if there is a strong move.') };
  if (m.risk === 'trap') return { tone: 'warn', title: tr('조심하세요', 'Careful'), text: tr('솔깃한 수가 함정일 수 있어요. 잡기 전에 한 번 더 생각해 보세요.', 'The tempting move may be a trap. Think twice before taking.') };
  if (m.risk === 'gamble' || m.risk === 'speculative') return { tone: 'warn', title: tr(`상대의 ${RISK_LABEL[m.risk]}`, `Opponent's ${RISK_LABEL[m.risk].toLowerCase()}`), text: tr('상대가 위험을 감수했어요. 침착하게 정확한 수를 찾으면 유리해질 수 있어요.', 'The opponent took a risk. Stay calm and find the precise move to get the upper hand.') };
  if (m.risk === 'soundSacrifice') return { tone: 'warn', title: tr('상대의 희생', 'Opponent\'s sacrifice'), text: tr('상대가 물질을 내줬어요. 받아도 괜찮은지 수순을 잘 따져 보세요.', 'The opponent gave up material. Calculate carefully whether taking is safe.') };
  return null;
}
