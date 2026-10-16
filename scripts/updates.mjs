// 업데이트 소식(패치노트): /updates, /en/updates. 새 업데이트는 맨 앞에 추가한다. date가 없으면 '이전 업데이트'로 묶인다.
// 방문자에게 보이는 글이라 개발 용어 대신 무엇이 달라졌는지만 쓴다.
export const UPDATES = [
  {
    date: '2026-10-16',
    ko: [
      ['메뉴 개편', [
        '맨 위 메뉴를 <b>분석 · 내 기록 · 커뮤니티 · 알아보기</b> 네 가지로 정리했어요. PC에서는 마우스를 올리거나 누르면 펼쳐지고, 휴대폰에서는 ☰ 버튼으로 열어요. 키보드(Tab·방향키·Esc)로도 쓸 수 있어요.',
        '프로필 화면 맨 아래에 숨어 있던 <b>그룹 유형 지도</b>, <b>기기 동기화·백업</b>과 <b>연습 과제</b>, <b>월간 결산</b>, <b>유형 비교</b>, <b>Lichess 북마클릿</b>을 각각 메뉴에서 바로 열 수 있어요.',
        '<b>유형 궁합 모아 보기</b>와 <b>유형별 오프닝 모아 보기</b> 페이지를 새로 만들었어요.',
      ]],
    ],
    en: [
      ['New menu', [
        'The top menu is now four groups: <b>Analyze · My records · Community · Learn</b>. Hover or click to open on PC, or use the ☰ button on phones. Keyboard (Tab, arrows, Esc) works too.',
        '<b>Group type maps</b>, <b>Sync & backup</b>, <b>Practice</b>, <b>Monthly recap</b>, <b>Compare types</b> and the <b>Lichess bookmarklet</b>, which were tucked away at the bottom of the profile page, now each open straight from the menu.',
        'New pages collecting <b>all type matchups</b> and <b>openings for every type</b>.',
      ]],
    ],
  },
  {
    date: '2026-10-15',
    ko: [
      ['친구·커뮤니티와 함께', [
        '<b>그룹 유형 지도</b>가 생겼어요. 그룹을 만들어 코드나 링크로 공유하면, 들어온 사람들의 유형이 16칸 지도와 축별 인원으로 보여요. 내 유형은 종합 분석할 때마다 자동으로 갱신되고, 이름은 체스 아이디 대신 닉네임으로 바꿀 수 있어요.',
        '<b>링크 미리보기</b>: 친구 비교 링크, 그룹 링크, 내 고정 주소를 카톡·디스코드에 붙이면 유형 카드가 미리보기로 떠요.',
      ]],
      ['내 기록 이어 보기', [
        '<b>기기 동기화</b>: 동기화 코드 하나로 휴대폰과 PC에서 같은 기록을 볼 수 있어요. 가입은 필요 없고, 마지막으로 쓴 지 30일이 지나면 서버에서 자동으로 지워져요.',
        '<b>내 고정 주소</b>: <code>/u/lichess/아이디</code>를 즐겨찾기 해 두면, 열 때마다 새로 둔 게임만 바로 분석해요.',
        '<b>Lichess 북마클릿</b>(PC): 즐겨찾기 줄의 버튼을 누르면 보고 있던 Lichess 게임이 바로 Stylish로 와서 분석돼요.',
        '<b>월간 결산 카드</b>: 이번 달(월초에는 지난달) 유형·정확도 변화·희생수·많이 둔 오프닝을 카드 한 장으로 받아 공유할 수 있어요.',
      ]],
      ['새로 읽을거리', [
        '<b>유형 궁합</b> 136가지: 두 유형이 만나면 축마다 어떻게 부딪히는지, 서로를 상대할 때 어디를 노리면 좋은지 정리했어요. 유형 페이지 아래 \'다른 유형과의 궁합\'에서 볼 수 있어요.',
        '<b>유형에 어울리는 오프닝</b>: 오프닝 데이터베이스를 미리 분석한 스타일로, 각 유형의 글자와 잘 맞는 백·흑 오프닝을 3개씩 골랐어요.',
      ]],
      ['더 안전하게', [
        '보안 점검을 하고 보안 설정을 보강했어요. 새 기능에서 쓰는 서버는 사람 확인(Cloudflare Turnstile)을 거치고, 다른 사람의 항목은 고칠 수 없어요.',
      ]],
    ],
    en: [
      ['With friends and communities', [
        '<b>Group type maps</b>: create a group and share its code or link, and everyone who joins shows up on a 16-cell type map with counts per axis. Your type updates automatically after each combined analysis, and you can show a nickname instead of your chess ID.',
        '<b>Link previews</b>: compare links, group links and your permanent link now show a type card when pasted into chats like Discord.',
      ]],
      ['Pick up where you left off', [
        '<b>Device sync</b>: one sync code shows the same records on your phone and PC. No sign-up; data is deleted from the server 30 days after last use.',
        '<b>Permanent link</b>: bookmark <code>/u/lichess/your-id</code> and every visit analyzes only your new games.',
        '<b>Lichess bookmarklet</b> (PC): click the bookmark while viewing a Lichess game to analyze it in Stylish.',
        '<b>Monthly recap card</b>: this month\'s (or, early in the month, last month\'s) type, accuracy change, sacrifices and most-played opening on one shareable card.',
      ]],
      ['New to read', [
        '<b>136 type matchups</b>: how two types clash axis by axis and where each should press. Find them under \'Matchups with other types\' on each type page.',
        '<b>Openings that suit each type</b>: three White and three Black openings whose pre-analyzed style matches each type\'s letters.',
      ]],
      ['Safer', [
        'We ran a security review and tightened settings. The new features check that you are human (Cloudflare Turnstile), and nobody can edit someone else\'s entry.',
      ]],
    ],
  },
  {
    date: '2026-10-14',
    ko: [
      ['더 빨라졌어요', [
        '<b>여러 판을 동시에 분석해요.</b> 종합 분석이 한 번에 2판씩 진행되고, 남은 시간도 보여 줘요.',
        '<b>그래픽카드로 계산해요.</b> 지원하는 기기에서는 사람 수 예측이 2~3배 빨라져요. 안 되는 기기는 지금처럼 자동으로 CPU로 계산해요.',
        '<b>오프닝 이론 수는 건너뛰어요.</b> 누구나 두는 이론 수는 깊게 분석하지 않아서 한 판이 더 빨리 끝나요.',
        '<b>새로고침해도 이어서 분석해요.</b> 분석 중에 창을 닫아도, 다시 열면 끝난 판은 두고 남은 판만 분석해요.',
        '<b>한 번 본 국면은 기억해요.</b> 같은 국면을 다시 만나면 계산하지 않아요.',
      ]],
      ['오프닝은 \'오프닝의 스타일\'로', [
        '이론 수를 한 수씩 평가하지 않고, <b>그 오프닝의 스타일</b>(미리 분석)로 보여 줘요. 다른 오프닝과 비교해 두드러진 점과 갬빗 여부를 알려 줘요. 예: 에반스 갬빗 → 갬빗 · 더 주도권 · 더 전술적',
        '내 성향에는 오프닝 선택을 <b>조금만</b> 반영해요. 갬빗을 즐긴다는 건 남기되, 성향이 오프닝에 휩쓸리지 않게요.',
        '<b>정확도는 이론을 벗어난 뒤의 수만으로</b> 계산해요.',
      ]],
      ['결과를 더 정직하게', [
        '<b>판 수가 적으면 유형을 신중하게 보여 줘요.</b> 같은 사람도 몇 판만 보면 유형이 바뀌곤 해서, 판이 적을수록 축 막대가 가운데 쪽에 가깝고 애매한 글자는 흐리게 보여요. 판을 더 분석하면 또렷해져요.',
        '<b>유형 변화</b>는 예전·최근이 각각 20판을 넘지 않으면 \'부정확\'으로 흐리게 표시해요.',
        '<b>정확도는 \'Stylish 기준\'이에요.</b> Lichess와 같은 방식으로 계산하지만 분석 깊이가 달라서, 보통 Lichess보다 몇 점 높게 나와요.',
        '<b>\'부정확\' 등급은 참고용으로 흐리게</b> 보여 줘요. 실수·블런더보다 판정이 많이 흔들리는 등급이에요.',
        '유형 기준 데이터를 새 방식으로 다시 만들었어요 (불릿·블리츠·래피드별 Lichess 플레이어 약 3,600명).',
      ]],
      ['다시 와서 볼 것들', [
        '<b>이번 주 리포트</b>: 최근 7일 정확도·유형·희생수',
        '<b>유형 도감</b>: 지금까지 나온 내 유형을 16칸에 모아요',
        '<b>스타일 챌린지</b>: 한 축을 반대 스타일로 둬 보기',
        '<b>체스 친구</b>: 비교 링크를 보내 준 친구의 유형을 모아 봐요',
        '오랜만에 오면 "N일 만이에요" 인사와 함께 내 프로필로 바로 가요',
      ]],
      ['보기 편하게', [
        '프로필은 요약만 먼저 보여 주고, 나머지는 \'자세히 보기\'로 접어 둬요',
        '기록 내보내기·가져오기로 다른 기기에서도 내 기록을 볼 수 있어요',
        '희생·함정·도박 표시에 마우스를 올리면 뜻을 알려 줘요',
        '게임을 못 불러왔을 때 \'다시 시도\' 버튼이 생겼어요',
        '첫 화면에서 어떤 결과를 받는지 예시 카드로 미리 볼 수 있어요',
      ]],
    ],
    en: [
      ['Faster', [
        '<b>Several games at once.</b> Combined analysis runs two games at a time and shows the time left.',
        '<b>Uses your graphics card.</b> On supported devices, human-move prediction is 2–3× faster. Other devices fall back to the CPU automatically.',
        '<b>Opening theory is skipped.</b> Theory moves everyone plays are not analyzed deeply, so each game finishes sooner.',
        '<b>Resumes after a refresh.</b> Close the tab mid-analysis and the finished games are kept; only the rest are analyzed.',
        '<b>Remembers positions.</b> A position it has already seen is not calculated again.',
      ]],
      ['Openings shown as the opening\'s style', [
        'Theory moves are no longer rated one by one. Instead you see <b>the opening\'s style</b> (pre-analyzed): what stands out compared with other openings, and whether it is a gambit. Example: Evans Gambit → Gambit · more initiative · more tactical',
        'Your opening choice counts toward your style <b>only lightly</b>: loving gambits still shows, without the opening taking over your profile.',
        '<b>Accuracy only counts moves after you leave theory.</b>',
      ]],
      ['More honest results', [
        '<b>Few games, more caution.</b> The same player\'s type can change over just a few games, so with fewer games the axis bars sit closer to the middle and uncertain letters are faded. More games make them clearer.',
        '<b>Type change</b> is faded and marked "Unreliable" unless both the older and recent sets have more than 20 games.',
        '<b>Accuracy is "Stylish accuracy".</b> It is computed like Lichess but at a different engine depth, so it usually reads a few points higher than Lichess.',
        '<b>"Inaccuracy" is shown faded, for reference.</b> It is much less certain than mistakes and blunders.',
        'The type reference data was rebuilt with the new method (about 3,600 Lichess players across bullet, blitz and rapid).',
      ]],
      ['Reasons to come back', [
        '<b>This week</b>: your last 7 days of accuracy, type and sacrifices',
        '<b>Type collection</b>: every type you have gotten, in 16 slots',
        '<b>Style challenge</b>: try playing one axis the opposite way',
        '<b>Chess friends</b>: collect the types of friends who sent you a compare link',
        'Come back after a while and you get a welcome-back note with a shortcut to your profile',
      ]],
      ['Easier to read', [
        'Profiles show a summary first; the rest is folded under "More"',
        'Export and import your records to use them on another device',
        'Hover over sacrifice, trap and gamble labels to see what they mean',
        'A "Try again" button when games fail to load',
        'The home page shows an example of the result you get',
      ]],
    ],
  },
  {
    ko: [
      ['이전 업데이트', [
        '정확도를 Lichess와 같은 방식(가중 평균 + 조화 평균)으로 계산하고, 시간 부족 정확도는 승부가 걸린 국면만으로 계산해요',
        '바로 되잡히는 수나 어차피 잡힐 기물로 둔 수가 함정·도박으로 잘못 표시되던 문제를 고쳤어요',
        '프로필 수치를 같은 레이팅 플레이어와 비교한 백분위로 보여 줘요',
        '레이팅을 직접 입력할 수 있고, Chess.com 레이팅은 Lichess 기준으로 바꿔서 비교해요',
        '불릿·블리츠·래피드별로 유형을 따로 보여 줘요',
        '약점 설명을 "이럴 때 조심"처럼 상황 중심으로 바꿨어요',
        '결과 이미지 저장, 글자 겹침, 유형 장면 그림을 고쳤어요',
      ]],
    ],
    en: [
      ['Earlier updates', [
        'Accuracy is computed like Lichess (weighted + harmonic mean); low-time accuracy only counts undecided positions',
        'Fixed recaptures and desperado moves being wrongly labeled as traps or gambles',
        'Profile numbers are shown as percentiles against players of the same rating',
        'Enter your rating manually; Chess.com ratings are converted to the Lichess scale',
        'Separate types for bullet, blitz and rapid',
        'Weakness notes now read as "watch out in this situation"',
        'Fixed result image saving, overlapping text and type scene pictures',
      ]],
    ],
  },
];
