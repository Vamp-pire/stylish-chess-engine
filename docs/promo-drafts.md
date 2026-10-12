# Stylish 홍보 글 초안

> 올리기 전에 각 커뮤니티의 자기 홍보 규칙을 꼭 확인하세요. 광고처럼 보이지 않게 "만든 사람이 직접 소개하고 피드백을 받는" 형식이 좋습니다.
> `[내 결과 이미지]`에는 사이트의 '내 결과 이미지 만들기'로 만든 내 카드를 붙이세요.
> 링크: https://stylish-chess-engine.pages.dev

---

## 1. 국내 체스 커뮤니티 (디시 체스 갤러리, 네이버 체스 카페, 오픈카톡·디스코드)

**제목**: 체스 유형 테스트(MBTI 같은 4글자) 만들어 봤는데 한번 해보실 분?

**본문**:

체스 좋아해서 취미로 만든 사이트인데 피드백 받고 싶어서 올려봅니다.

Lichess나 Chess.com 아이디를 넣으면 최근 게임을 분석해서 **4글자 체스 유형**을 알려줘요.

- **A/P**: 공격형인지 포지션형인지
- **W/S**: 난전을 즐기는지 안전하게 두는지
- **I/R**: 먼저 판을 끌고 가는지 받아치는지
- **O/E**: 같은 레이팅 사람들이 잘 안 두는 수를 두는지

저는 [내 유형]이 나왔어요.

[내 결과 이미지]

몇 가지 특징이 있어요.
- **같은 레이팅끼리 비교**해서 초보든 고수든 16유형이 다 나와요. 실제 Lichess 플레이어 480명 게임으로 기준을 맞췄어요.
- 수마다 공격적인지, 함정수인지, 도박수인지도 보여줘요. 함정수는 "같은 레이팅의 사람이 실제로 걸려들 확률"로 판정해요(사람 수를 학습한 AI Maia3 사용).
- 무료이고 가입도 없어요. 분석은 전부 내 브라우저에서 돌아가서 기록이 어디로 보내지지 않아요.

👉 https://stylish-chess-engine.pages.dev

10판 정도 넣으면 결과가 정확해져요. 유형 나오면 댓글로 알려주세요! 이상한 판정이나 버그도 환영합니다.

---

## 2. 국내 개발자 커뮤니티 (GeekNews Show, velog, 클리앙 개발)

**제목**: 서버 없이 브라우저에서 Stockfish + 사람 수 예측 AI로 체스 스타일을 분석하는 사이트

**본문**:

체스 기보의 수마다 "좋은 수인가"가 아니라 **"어떤 수인가"**(공격적, 예방적, 함정수, 도박수 등 19가지)를 분석하고, 플레이어의 4글자 체스 유형을 알려주는 사이트를 만들었습니다.

**기술적으로 재밌었던 점**

- **서버가 없습니다.** Stockfish 19(WASM)를 브라우저 Web Worker 여러 개로 돌리고, 정적 사이트(Cloudflare Pages)로만 운영합니다. 사용자가 늘어도 연산 비용이 0입니다.
- **"사람 기준" 함정수 판정**: 엔진이 보기엔 뻔한 수라도 사람은 걸려듭니다. 그래서 사람의 실제 수를 학습한 신경망 **Maia3**(CSSLab, ONNX 약 45MB)를 onnxruntime-web으로 돌려서 "이 레이팅의 상대가 이 응수를 둘 확률"을 계산합니다. 실제 Lichess 3천 국면에서 사람이 둔 수를 1순위로 맞히는 비율이 기존 규칙 기반 24.5% → 53.6%로 올랐습니다.
- **보정 데이터**: 유형 기준선은 Lichess 플레이어 480명(레이팅 600~2200+) × 10판을 GitHub Actions에서 사이트와 같은 조건으로 분석해 정했습니다. 지표 대부분이 레이팅과 상관이 커서(전술적 수 r=−0.49 등) 레이팅 회귀 기대값 대비로 비교하도록 바꿨더니, 모든 레이팅 구간에서 16유형이 고르게 나옵니다.
- Cloudflare Pages는 파일당 25MB 제한이 있어 모델을 20MB 조각으로 나눠 올리고 브라우저에서 합칩니다.

👉 https://stylish-chess-engine.pages.dev
👉 소스(GPLv3): https://github.com/Vamp-pire/stylish-chess-engine

판정이 이상한 수나 성능 문제 피드백 주시면 감사하겠습니다.

---

## 3. Reddit (r/chess, r/chessbeginners, r/lichess) — 영어판 공개 후

**Title**: I made a free "chess personality test" that gives you a 4-letter type from your actual games

**Body**:

I built a side project that analyzes your recent Lichess or Chess.com games and gives you one of 16 chess types, sort of like MBTI but based on how you actually play:

- **A/P**: Attack vs Position
- **W/S**: Wild vs Safe
- **I/R**: Initiative vs Reactive
- **O/E**: Original vs Expected (do you play moves that people at your rating rarely play?)

I got [my type]:

[my result image]

A few things that might be interesting:
- **You're compared with players at your own rating**, so beginners and masters both get all 16 types. The cutoffs come from analyzing 480 real Lichess players.
- It labels moves as traps or gambles **based on how likely a human at that rating is to fall for them**, using Maia3 (a neural net trained on human games) together with Stockfish.
- Free, no sign-up, and everything runs in your browser. Your games are never uploaded.

https://stylish-chess-engine.pages.dev/en/

It works best with about 10 games. I'd love to hear what type you get and whether it feels right!

---

## 4. Hacker News (Show HN) — 영어판 공개 후

**Title**: Show HN: Chess personality types from your games, Stockfish and Maia3 in the browser

**Body**:

Stylish analyzes chess games to describe what kind of move each move is (aggressive, prophylactic, trap, gamble, and so on) and summarizes a player as one of 16 four-letter types.

Everything runs client-side: Stockfish 19 (WASM) in a small worker pool, plus Maia3, a human-move prediction network (ONNX, ~45 MB, onnxruntime-web), to judge traps and gambles by how likely a human at that rating is to fall for them. On 3,000 real Lichess positions, Maia3 predicted the human's actual move as its top choice 53.6% of the time, versus 24.5% for my previous rule-based heuristic.

Type cutoffs were calibrated on 480 Lichess players (10 games each) using GitHub Actions. Most style metrics turned out to be strongly correlated with rating, so each metric is compared against a rating-regressed expectation. That way every rating band produces all 16 types.

It's a static site on Cloudflare Pages with zero server compute. GPLv3.

https://stylish-chess-engine.pages.dev/en/
https://github.com/Vamp-pire/stylish-chess-engine
