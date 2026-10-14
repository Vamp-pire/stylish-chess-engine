// 테스트는 한국어 문구 기준. 컴퓨터 언어(영어 환경의 CI·클라우드 등)와 관계없이 한국어로 고정한다
Object.defineProperty(globalThis, 'navigator', { value: { ...globalThis.navigator, language: 'ko-KR' }, configurable: true });
