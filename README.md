# Stylish ♞

체스 기보의 **각 수가 어떤 스타일인지**(공격적, 전술적, 예방적, 긴장 유지, 복잡화 …)와 **두 플레이어의 성향**을 평가하는 웹사이트입니다.
서버 없이 **모든 계산을 브라우저 안에서** 합니다.

## 무엇을 평가하나

한 수에 대해 네 가지를 따로 판정합니다.

| 축 | 내용 |
|---|---|
| **스타일 19종** (여러 개 동시에, 각 0~100점) | 공격적 · 전술적 · 주도권 · 반격 / 포지셔널 · 예방적 · 제한 · 활동적 · 공간 확보 · 긴장 유지 / 안정적 · 수비적 · 단순화 / 복잡화 · 조용한 수 · 대기수 · 실용적 / 킹 활성화 · 패스폰 추진 |
| **위험 판정** (해당될 때 하나) | 건전한 희생 · 함정수 · 도박수 |
| **품질** | 최선 · 좋은 수 · 부정확 · 실수 · 블런더 (전적으로 Stockfish 판정: 승/무/패 확률로 본 기대 점수 하락폭) |
| **강제된 수** (내부 필터) | 선택의 여지가 없던 수는 플레이어 평가에서 제외 |

- **도박수**: Stockfish 기준으로 손해인데, 상대가 솔깃한 응수를 두면 최선 수보다 더 좋아지는 수 (상대가 틀리길 노리는 수)
- **함정수**: 손해가 없는데, 상대가 미끼를 물면 크게 이득을 보는 수

**오프닝 이론 수**(Lichess 공개 오프닝 목록, CC0)는 스타일을 흐리게만 보여주고 플레이어 평가에서 뺍니다.

**Chess.com·Lichess 아이디**로 최근 게임을 불러와 한 판씩 보거나, 여러 판을 골라 그 사람의 수만 모은 **종합 프로필**을 만들 수 있습니다. 분석 결과는 브라우저(IndexedDB)에 저장돼 다시 열면 바로 나옵니다. 분석한 플레이어의 성향은 오른쪽 위 **프로필** 메뉴에 판마다 쌓여(localStorage) 합친 프로필로 볼 수 있습니다.

플레이어 평가는 스타일 분포, 비슷한 대안 중 무엇을 골랐는지(선택 성향), 희생·함정·도박 횟수와 적중률, 게임 단계·형세별 변화, 정확도를 보여주고 유형 이름을 붙입니다 (예: 로맨틱 공격수, 견고한 전략가).

## 어떻게 동작하나

```
Stockfish 19 (WASM)  ─ 국면마다 1회 MultiPV 3 분석: 평가, 최선 수, 후보, 주요 변화
        │
정적 특징 추출        ─ 수 두기 전/후 비교: 킹 압박, 희생량, 핀·포크, 공간, 긴장, 폰 구조 …
PV 앞보기            ─ 주요 변화를 2~3수 따라가며 희생 보상·공격 지속 확인
자체 소형 탐색        ─ 0x88 수 생성기 + 알파-베타: 위협(null move), 자연스러운 응수 결과
Stockfish 재확인      ─ 함정수·도박수·대기수 후보만 추가 분석
        │
채점                 ─ 스타일별 근거 목록의 가중합 → 0~100점 (근거를 그대로 표시)
```

- 객관적인 좋고 나쁨은 전부 Stockfish가 판단하고, 자체 탐색은 특징을 뽑는 보조 계산만 합니다.
- 분석은 Web Worker에서 돌고, Stockfish는 단일 스레드 엔진 여러 개(엔진 풀: PC 최대 4개, 터치 기기 2개)가 국면을 나눠 동시에 분석합니다(깊이 12 기준 약 2.4배). 멀티스레드 빌드는 깊이 고정 탐색에서 특정 국면이 수십 배 느려지는 문제가 있어 쓰지 않습니다.
- 둘 수 있는 수가 1개뿐이거나 체크를 피하는 수가 2개 이하인 국면은 얕게(깊이 −4) 분석합니다.

## 개발

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 수 생성기 perft, 탐색, 엔진, 스타일 대표 국면, 플레이어 유형 검사
npm run build      # dist/ 정적 파일
```

테스트는 브라우저와 같은 Stockfish 19 lite WASM을 Node로 실행합니다. 네이티브 Stockfish와 비교하려면 `STOCKFISH_PATH`를 지정하세요.

```bash
GAME=immortal DEPTH=14 npx vitest run test/game.test.ts --reporter=verbose    # 예시 기보 수별 결과 출력
PGN_FILE=test/fixtures/karpov-unzicker.pgn npx vitest run test/game.test.ts --reporter=verbose
```

### 구조

```
src/
  core/      grid.ts(공격 관계·구조) · features.ts(정적 특징) · natural.ts(자연스러운 수)
             styles.ts(19종 채점·위험·품질) · analyzer.ts(파이프라인) · profile.ts(플레이어 평가)
  search/    position.ts(0x88 수 생성기) · search.ts(알파-베타, 위협·응수 질의)
  engine/    uci.ts(UCI 프로토콜) · browser.ts(Stockfish WASM Worker)
  workers/   analysis.worker.ts(분석 Worker) · protocol.ts
  ui/        runner.ts · charts.ts · guide.ts
  main.ts    화면
public/engine/  Stockfish 19 lite WASM (GPLv3)
```

## 배포 (Vercel)

정적 사이트라 특별한 서버 설정이 필요 없습니다. `vercel.json`은 엔진 파일 캐시 헤더만 설정합니다. 배포 주소: https://stylish-engine.vercel.app

## 라이선스

GPLv3 ([LICENSE](LICENSE)). 다음 GPLv3 소프트웨어를 포함합니다.

- [Stockfish](https://github.com/official-stockfish/Stockfish) 19 / [stockfish.js](https://github.com/nmrugg/stockfish.js) — `public/engine/`
- [chessground](https://github.com/lichess-org/chessground) — 보드 UI
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) — 기보 처리
- [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0) — 오프닝 이론 데이터 (`scripts/build-openings.mjs`로 `public/openings.json` 생성)
