# HANDOFF — Stylish (체스 수 스타일 분석)

> 새 세션은 이 문서만 읽고 시작하세요. 상세 배경은 `PLAN.md`(결정 이력), 사용법은 `README.md`.
> 필요한 파일만 골라 읽도록 아래 "파일 지도"를 쓰세요. 전체 파일을 훑을 필요 없습니다.

## 1. 한 줄 요약
체스 기보의 각 수를 **19가지 스타일 + 위험 판정(건전한 희생·함정수·도박수) + 품질**로 평가하고 플레이어 성향을 보여주는 **서버 없는 정적 웹사이트**. 모든 계산은 브라우저(Stockfish 19 WASM + 자체 소형 탐색).

- 배포: https://stylish-engine.vercel.app (Vercel 프로젝트 `stylish-engine`, 팀 `iankim201402-7909s-projects`, teamId `team_jolFJ5YFMXJ6lC08EX4kMfRA`)
- 저장소: https://github.com/Vamp-pire/stylish-chess-engine (public, GPLv3). **`main`에 push하면 Vercel이 자동 배포**
- 스택: TypeScript + Vite(정적), chess.js, chessground(보드), Stockfish 19 lite single WASM, Vitest

## 2. 사용자와 일하는 방식 (중요)
- 대화·UI·주석 모두 **한국어**. 사용자는 짧게 지시함("1,3으로해줘", "배포해줘").
- **새 기능은 먼저 계획·선택지를 제시하고 승인받은 뒤 구현** (사용자가 명시적으로 요구한 원칙). 작은 버그 수정·명확한 지시는 바로 진행.
- 배포 = 커밋 후 `git push` (사용자가 이 프로젝트 배포는 승인한 상태). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 결정을 바꿀 때는 `PLAN.md`의 진행 기록에 한 줄 남김.

## 3. 확정된 핵심 결정 (바꾸기 전 사용자 확인)
| 주제 | 결정 |
|---|---|
| 손해 기준 (위험 판정) | 기대점수 하락 <10%p **그리고** cpLoss ≤100 이면 "손해 없음" (`analyzer.ts` `LOSS_PP`) |
| 희생 | **엔진 PV 물질 변화** 기준. 다른 후보 수로도 잃었을 물질은 뺌. 이 수가 직접 기물을 내놓은 경우(정적 `sacrifice`/`offered`≥1.5)는 PV 손실 0.9 이상이면 인정. 이미 진 국면(기대점수<10%)은 제외. 손해 없음 → 건전한 희생, 손해 10~40%p → **무리한 희생**(큰 기물 잡기 제외) |
| 도박수 정의 | **엔진상 손해(위 기준 + winDrop≥5)인데, 상대가 솔깃한 응수를 두면 최선 수보다 좋아지는 수**(기대점수 +3%p 또는 +30cp) |
| 함정수 | 손해 없음 + 솔깃한 응수 시 기대점수 +20%p 이상(또는 평가 +6 미만에서 150cp 이상). 미끼가 기물을 그냥 내주는 것이면 riskWhy에 "미끼 희생" |
| 위험 수 적중 | 상대 다음 수의 기대점수 하락 ≥20%p |
| 수의 품질 | **전적으로 Stockfish WDL**로: 기대점수 하락 12/25/50%p → 부정확/실수/블런더 (평형 국면 기준 약 0.5/1/3폰). 추가로 30%p+ 잃고 기대점수 10% 이하가 되거나, 40%p+ 잃고 cpLoss 200 이상이면 블런더 (2026-10-10 사용자가 조정 위임) |
| 강제된 수 | 화면 표시 안 함, **플레이어 평가에서만 제외**. 합법수 1개, 체크 회피 ≤2, 되잡기, "누구나 떠올릴 유일한 최선 수"만. 찾기 어려운 유일한 수(희생)는 포함 |
| 오프닝 이론 수 | Lichess 오프닝 목록(CC0)으로 판별. **스타일은 흐리게 표시**, 플레이어 평가에서 제외 |
| 엔진 | **단일 스레드 lite WASM만**. 멀티스레드 빌드는 일부 국면에서 30배 느려져 금지. 대신 엔진 풀(PC 4개, 터치 2개) |
| 기본 깊이 | 한 판: 정밀(18). 여러 판 종합: 빠름(10) |
| 플레이어 유형 | 스타일별 BASELINE 대비 편차로 결정 (`profile.ts`) |
| 저장 | 분석 결과 → IndexedDB(캐시), 플레이어 성향 요약 → localStorage(프로필 메뉴) |

## 4. 파일 지도
```
src/core/
  grid.ts        보드 표현·공격 맵·핀/포크/패스폰/공간/긴장 등 정적 계산 도구
  features.ts    한 수의 전/후 국면 비교 → StaticFeatures (50여 개 특징)
  natural.ts     "자연스러운(솔깃한) 수" 순위 — 함정수·도박수·강제수 판정에 사용 (나중에 Maia로 교체 가능)
  styles.ts      ★ 19종 스타일 채점 규칙(scoreMove), 품질(qualityOf), DeepFeatures 타입. 가중치 조정은 여기
  analyzer.ts    ★ 파이프라인: 전 국면 엔진 분석(동시 요청) → 수별 특징+PV 앞보기+소형 탐색 → 위험 판정(Stockfish 재확인) → 채점
  profile.ts     플레이어 프로필 집계, BASELINE, 유형(archetype), mergeProfiles(여러 판 합치기)
  openings.ts / openingKey.js(.d.ts)   오프닝 이론 조회 (국면 해시 → 이름)
  clock.ts       [%clk]·TimeControl → 수별 소요/남은 시간, 시간 부족 여부
  coach.ts       코치와 두기: CoachSession(수 하나 평가·위협·국면 캐시), chooseBotMove(레벨 = 깊이·후보 수·무작위성, 스타일 = 후보 중 스타일 적합도 가산)
  coachText.ts   코치 말풍선 문장 틀 (내 수 / 상대 수)
  masters.ts     닮은 선수 찾기 (BASELINE 대비 편차 방향의 코사인 유사도). 데이터는 src/data/masters.json
src/search/
  position.ts    0x88 수 생성기 (perft 검증됨)
  search.ts      알파-베타 + 정지 탐색, threatOf(null move)/replyOutcomes/zugzwangOf
src/engine/
  uci.ts         UCI 프로토콜(UciEngine), expectedScore(WDL)
  pool.ts        EnginePool: 우선순위 큐, 분석별 취소(tag)
  browser.ts     Stockfish Worker 생성, poolSize()
src/workers/     analysis.worker.ts(분석 스레드) + protocol.ts, coach.worker.ts(코치 RPC). 엔진 요청은 메인 스레드가 풀로 중계
src/online/sources.ts   Chess.com·Lichess 아이디 → 최근 게임 (브라우저에서 직접 호출, CORS 허용 확인됨)
src/ui/          runner.ts(분석 실행·중계) charts.ts(그래프·레이더·추이) guide.ts(스타일 사전·HOW 설명) cache.ts(IndexedDB) players.ts(localStorage 프로필)
                 coachView.ts(코치 화면) coachClient.ts(코치 Worker 연결)
                 insights.ts(시간·오프닝별·추이·닮은 선수 섹션) share.ts(공유 링크 #g=) highlights.ts(명수 카드 PNG) quiz.ts(놓친 기회 퀴즈) modal.ts
src/main.ts      ★ 화면 전부 (입력 탭, 아이디 목록, 리뷰, 종합 분석, 프로필 메뉴, 소개). 문자열 템플릿 + esc()
src/style.css    디자인 토큰(:root, 다크 모드) + 화면별 스타일
src/samples.ts   예시 기보 3개 (오페라·불멸·상록수)
public/engine/   Stockfish 19 lite single (js+wasm, GPLv3)
public/openings.json   scripts/build-openings.mjs로 생성 (Lichess chess-openings 다운로드 필요)
test/            perft, search, engine, pool, openings, styles(대표 국면 31개), profiles(고전 기보 유형), game(수별 출력용), clock, share, masters
                 masters.build.test.ts: 유명 선수 프로필 생성 (BUILD_MASTERS=1일 때만)
scripts/build-masters.mjs   선수별 결과 → src/data/masters.json (한글 이름·설명 포함)
```

## 5. 명령
```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 53개, 약 3~4분 (Stockfish WASM을 Node로 실행)
npm run build          # tsc + vite build → dist/
GAME=immortal DEPTH=12 npx vitest run test/game.test.ts --reporter=verbose   # 기보 수별 판정 출력 (가중치 조정할 때 유용)
PGN_FILE=test/fixtures/karpov-unzicker.pgn npx vitest run test/game.test.ts --reporter=verbose
node scripts/build-openings.mjs   # 오프닝 데이터 재생성 (네트워크 필요)
# 유명 선수 프로필 재생성 (규칙을 바꾸면 다시 만들 것). PGN: antlr/grammars-v4 pgn/examples, cran/bigchess inst/extdata (GitHub)
BUILD_MASTERS=1 MASTERS_DIR=<pgn폴더> MASTERS_OUT=<결과폴더> [PLAYERS=Karpov] npx vitest run test/masters.build.test.ts
node scripts/build-masters.mjs <결과폴더>
```
- 테스트 엔진: `test/node-engine.ts`가 `node_modules/stockfish/bin/stockfish-19-lite-single.js`를 자식 프로세스로 실행 (public/ 사본은 package.json `"type":"module"` 때문에 Node에서 못 돌림). `STOCKFISH_PATH`로 네이티브 엔진 지정 가능.
- 콘솔 출력이 필요하면 `--reporter=verbose`.

## 6. 주의할 함정
- **엔진 결과는 해시 상태에 따라 조금씩 달라짐**: 경계값 근처 테스트(예: cpLoss 80 기준)는 흔들릴 수 있음. 규칙을 바꿀 땐 `test/styles.test.ts`, `test/profiles.test.ts` 둘 다 확인.
- 스타일 규칙/가중치를 바꾸면 `src/ui/cache.ts`의 `RULES_VERSION`을 올려 예전 IndexedDB 캐시를 무효화할 것. BASELINE도 다시 구해야 할 수 있음(방법: 예시 기보 3개 + 카르포프 fixture를 depth 10으로 분석해 강제·이론 수 제외 평균).
- `analyzer.ts`는 시작할 때 모든 국면 분석을 한꺼번에 요청함. 판정 중 추가 분석은 `priority: URGENT`. 단일 엔진(Node 테스트)에서도 동작하지만 추가 분석이 맨 뒤로 밀림.
- 체스닷컴 API는 curl에선 Cloudflare 403이 나지만 브라우저에선 정상. 한 달 단위로 게임을 줌(목록이 길 수 있음). `rules === 'chess'`만 사용.
- 정적 사이트라 COOP/COEP 헤더 없음(멀티스레드 안 쓰므로 불필요). `vercel.json`은 엔진 캐시 헤더만.
- UI는 프레임워크 없이 `innerHTML` 템플릿. 사용자 입력·기보 헤더·외부 API 문자열은 반드시 `esc()`로 이스케이프.
- 게임 목록에서 체크 시 전체를 다시 그리지 말 것(스크롤 튐 버그가 있었음) → `syncSelection()` 패턴 사용.

## 7. 현재 상태와 남은 일 (2026-10-09)
- 코치와 두기(메뉴 "코치") 추가: analyzer의 analyzeMove·markBook·finalizeGame을 export해 수 단위로 재사용. 봇 강도 이름은 상대 단계일 뿐 레이팅 아님(Stockfish UCI_Elo는 lite 빌드 지원 미확인이라 안 씀). 승격은 퀸 자동.
- 블런더 기준 조정 완료(50%p, 또는 30%p+진 국면, 또는 40%p+200cp). 1.e4 e5 2.Nf3 Qg5??가 이제 블런더.
- 브랜치 `claude/nifty-hamilton-qp9prs`: 희생·도박수 판정 개선(무리한 희생 추가, WDL 기준), 기능 8종(닮은 선수, 퀴즈, 명수 카드, 변화 수순, 공유 링크, 시간, 오프닝별, 추이), 모바일 UI 정리. 2026-10-09 main에 병합·배포됨.
- 유명 선수 10명 모두 유형이 대부분 "만능형"으로 나옴 → BASELINE이 고전 공격 기보 기준이라 현대 선수의 편차가 작음. 닮은 선수는 편차 '방향'을 표준화해 비교하므로 동작하지만, BASELINE 재보정 시 masters.json도 다시 만들 것.
- 토팔로프 PGN은 스페인어 기보법(C·A/F·T·D·R)이라 변환 후 사용.
- 최신 커밋: 엔진 풀(깊이 12에서 2.4배) + 강제 국면 얕게. 테스트 53개 통과, 배포됨.
- 사용자가 제안만 받고 보류한 속도 방안: ② 이론 구간 얕게(15~25% 절약), ④ MultiPV 3→2, ⑤ 깊이 대신 노드 제한.
- 개선 거리: 스타일 대표 국면 보강(제한·실용적·복잡화·대기수 예시 부족), 다양한 현대 기보로 BASELINE 재보정, 모바일에서 수 카드가 보드 아래에 있어 스크롤 필요, "자연스러운 수"를 Maia로 교체 검토.
