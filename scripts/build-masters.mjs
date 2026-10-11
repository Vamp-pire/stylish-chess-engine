// 유명 선수 프로필을 합쳐 src/data/masters.json을 만든다.
// 먼저 test/masters.build.test.ts로 선수별 결과(JSON)를 만든 뒤: node scripts/build-masters.mjs <결과폴더>
// 기보 출처: antlr/grammars-v4 pgn 예제, CRAN bigchess 패키지 예제 (Carlsen, Kasparov). 사이트에는 기보가 아니라 집계 숫자만 넣는다.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('사용법: node scripts/build-masters.mjs <결과폴더>'); process.exit(1); }

const INFO = {
  Alekhine: { ko: '알렉산드르 알레힌', era: '1920~40년대', desc: '4대 세계 챔피언. 복잡한 국면에서 깊은 콤비네이션으로 공격을 밀어붙였다.' },
  Karpov: { ko: '아나톨리 카르포프', era: '1970~90년대', desc: '12대 세계 챔피언. 상대의 반격을 미리 막고 천천히 조여 가는 포지셔널 플레이의 대가.' },
  Kasparov: { ko: '가리 카스파로프', era: '1980~2000년대', desc: '13대 세계 챔피언. 역동적인 주도권과 날카로운 공격 준비로 유명하다.' },
  Anand: { ko: '비스와나탄 아난드', era: '1990~2010년대', desc: '15대 세계 챔피언. 빠르고 정확한 계산으로 어떤 국면에도 적응하는 만능형.' },
  Carlsen: { ko: '망누스 칼센', era: '2000~2020년대', desc: '16대 세계 챔피언. 작은 우위를 엔드게임까지 끈질기게 짜내는 만능형.' },
  Topalov: { ko: '베셀린 토팔로프', era: '1990~2010년대', desc: 'FIDE 세계 챔피언(2005). 교환 희생을 즐기는 공격적인 스타일.' },
  Shirov: { ko: '알렉세이 쉬로프', era: '1990~2010년대', desc: '화려한 희생과 전술로 유명한 공격수. 저서 제목도 "Fire on Board".' },
  Morozevich: { ko: '알렉산드르 모로제비치', era: '1990~2010년대', desc: '정석을 벗어난 독창적인 수로 국면을 예측 불가하게 만든다.' },
  Ivanchuk: { ko: '바실리 이반추크', era: '1990~2010년대', desc: '거의 모든 오프닝을 두는 창의적인 선수. 날카로운 계산과 의외의 수.' },
  Adams: { ko: '마이클 애덤스', era: '1990~2010년대', desc: '영국 최강자. 군더더기 없는 견고하고 깔끔한 플레이.' },
};

const KINDS = ['soundSacrifice', 'speculative', 'trap', 'gamble'];
const masters = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
  const { name, games, profile: p } = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const risk = KINDS.reduce((s, k) => s + (p.risk[k]?.count ?? 0), 0);
  return {
    id: name, name, ...(INFO[name] ?? { ko: name, era: '', desc: '' }),
    games, counted: p.counted, accuracy: p.accuracy, archetype: p.archetype.name,
    avg: p.avg, riskRate: p.counted ? Math.round((risk / p.counted) * 1000) / 1000 : 0,
  };
}).sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/masters.json', JSON.stringify(masters, null, 1) + '\n');
console.log(masters.map((m) => `${m.ko}: ${m.games}판 ${m.counted}수 · ${m.archetype} · 위험 ${m.riskRate}`).join('\n'));
