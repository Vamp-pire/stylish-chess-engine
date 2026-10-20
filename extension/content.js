// Stylish 버튼: Chess.com·Lichess의 끝난 게임 화면에 "Stylish로 분석" 버튼을 띄운다.
// 브라우저 확장 프로그램과 Tampermonkey 스크립트가 이 파일을 같이 쓴다 (scripts/build-extension.mjs).
// 공정 플레이: 진행 중인 대국에서는 아무것도 하지 않는다. 게임이 끝난 것을 확인한 뒤에만 버튼을 보인다.
// 데이터는 모으지 않는다. 버튼을 누르면 새 탭에서 Stylish가 그 판을 분석할 뿐이다.
(() => {
  if (window.__stylishButton) return;
  window.__stylishButton = true;
  const SITE = 'https://stylish-chess-engine.pages.dev';
  const ko = /^ko/i.test(navigator.language || '');
  let lastUrl = '';
  let btn = null;

  function hide() { if (btn) { btn.remove(); btn = null; } }
  function show(href) {
    hide();
    btn = document.createElement('a');
    btn.href = href;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = ko ? '♞ Stylish로 분석' : '♞ Analyze in Stylish';
    btn.title = ko ? '이 판의 수마다 스타일을 분석해요 (끝난 게임만)' : 'Rate every move of this game by style (finished games only)';
    Object.assign(btn.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
      padding: '10px 16px', borderRadius: '12px', background: '#b5562d', color: '#fff',
      font: '700 14px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif', textDecoration: 'none',
      boxShadow: '0 6px 20px rgba(0, 0, 0, .3)', cursor: 'pointer',
    });
    document.body.appendChild(btn);
  }

  /** 진행 중인 대국은 같은 주소에서 끝나므로 10초 뒤 다시 확인한다 */
  function recheckLater(url) { setTimeout(() => { if (location.href === url) lastUrl = ''; }, 10000); }

  async function check() {
    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    hide();
    try {
      if (/(^|\.)chess\.com$/.test(location.hostname)) {
        // /game/live/123, /game/daily/123, /analysis/game/live/123
        const m = location.pathname.match(/\/game\/(live|daily)\/(\d+)/);
        if (!m) return;
        const res = await fetch(`/callback/${m[1]}/game/${m[2]}`, { credentials: 'include' });
        if (!res.ok) return;
        const g = (await res.json()).game;
        if (!g || !g.isFinished) { recheckLater(url); return; } // 진행 중인 대국에서는 띄우지 않고, 끝나면 그때 띄운다
        if (location.href !== url) return;
        const h = g.pgnHeaders || {};
        const q = new URLSearchParams({ cc: m[2], ccw: h.White || '', ccb: h.Black || '', cct: String(g.endTime || ''), ref: 'ext' });
        show(`${SITE}/app?${q}`);
      } else if (location.hostname === 'lichess.org') {
        const m = location.pathname.match(/^\/([a-zA-Z0-9]{8})(?:\/|$)/);
        if (!m) return;
        const res = await fetch(`/game/export/${m[1]}?moves=false&clocks=false&evals=false&opening=false`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const g = await res.json();
        if (!g.status || g.status === 'started' || g.status === 'created') { recheckLater(url); return; } // 진행 중이면 띄우지 않는다
        if (location.href !== url) return;
        show(`${SITE}/app?link=${encodeURIComponent(`https://lichess.org/${m[1]}`)}&ref=ext`);
      }
    } catch (e) { /* 정보를 못 읽으면 버튼을 띄우지 않는다 */ }
  }

  // 두 사이트 모두 페이지를 새로 불러오지 않고 화면만 바꾸므로 주소가 바뀌는지 지켜본다
  check();
  setInterval(check, 1000);
})();
