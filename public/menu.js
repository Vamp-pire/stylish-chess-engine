// 공통 메뉴 동작: PC는 마우스를 올리거나 눌러서 펼치고, 키보드(Tab·Enter·방향키·Esc)와 휴대폰(☰)도 지원한다.
// 메뉴가 다시 그려져도 동작하도록 document에 위임으로 건다.
(function () {
  if (window.__mmWired) return;
  window.__mmWired = true;
  var hoverable = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 861px)');
  var closeTimer = 0;
  var hoverOpenedAt = 0; // 마우스를 올려 펼친 직후의 클릭이 바로 닫아 버리지 않게

  function groups() { return Array.prototype.slice.call(document.querySelectorAll('.mm-group')); }
  function setOpen(g, open) {
    if (!g) return;
    g.classList.toggle('open', open);
    var b = g.querySelector('.mm-top');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAll(except) { groups().forEach(function (g) { if (g !== except) setOpen(g, false); }); }
  function closeMobile() {
    var nav = document.querySelector('.mm');
    if (!nav) return;
    nav.classList.remove('mm-open');
    var b = nav.querySelector('.mm-burger');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function items(g) { return Array.prototype.slice.call(g.querySelectorAll('.mm-item')); }
  window.closeSiteMenu = function () { closeAll(); closeMobile(); };

  document.addEventListener('click', function (e) {
    var t = e.target;
    var burger = t.closest && t.closest('.mm-burger');
    if (burger) {
      var nav = burger.closest('.mm');
      var open = !nav.classList.contains('mm-open');
      var bar = nav.closest('.topbar');
      if (bar) nav.style.setProperty('--mm-top', Math.round(bar.getBoundingClientRect().bottom) + 'px');
      nav.classList.toggle('mm-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) closeAll();
      return;
    }
    var top = t.closest && t.closest('.mm-top');
    if (top) {
      var g = top.closest('.mm-group');
      var willOpen = !g.classList.contains('open') || Date.now() - hoverOpenedAt < 600;
      closeAll(g);
      setOpen(g, willOpen);
      return;
    }
    if (t.closest && t.closest('.mm-item, .mm-cta')) { closeAll(); closeMobile(); return; }
    if (!(t.closest && t.closest('.mm'))) { closeAll(); closeMobile(); }
  });

  // PC: 마우스를 올리면 펼치고, 벗어나면 조금 있다 닫는다 (대각선으로 움직여도 안 닫히게)
  document.addEventListener('mouseover', function (e) {
    if (!hoverable.matches) return;
    var g = e.target.closest && e.target.closest('.mm-group');
    if (!g) return;
    clearTimeout(closeTimer);
    if (!g.classList.contains('open')) { closeAll(g); setOpen(g, true); hoverOpenedAt = Date.now(); }
  });
  document.addEventListener('mouseout', function (e) {
    if (!hoverable.matches) return;
    var g = e.target.closest && e.target.closest('.mm-group');
    if (!g || (e.relatedTarget && g.contains(e.relatedTarget))) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { setOpen(g, false); }, 250);
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === 'Escape') {
      var open = document.querySelector('.mm-group.open');
      if (open) { setOpen(open, false); open.querySelector('.mm-top').focus(); e.preventDefault(); }
      else closeMobile();
      return;
    }
    if (!(t.closest && t.closest('.mm-group'))) return;
    var g = t.closest('.mm-group');
    var tops = groups().map(function (x) { return x.querySelector('.mm-top'); });
    if (t.classList.contains('mm-top')) {
      var i = tops.indexOf(t);
      if (e.key === 'ArrowDown') { closeAll(g); setOpen(g, true); var first = items(g)[0]; if (first) first.focus(); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = tops[(i + (e.key === 'ArrowRight' ? 1 : tops.length - 1)) % tops.length];
        var wasOpen = g.classList.contains('open');
        closeAll(); if (wasOpen) setOpen(next.closest('.mm-group'), true);
        next.focus(); e.preventDefault();
      }
      return;
    }
    if (t.classList.contains('mm-item')) {
      var list = items(g), k = list.indexOf(t);
      if (e.key === 'ArrowDown') { (list[k + 1] || list[0]).focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { if (k === 0) g.querySelector('.mm-top').focus(); else list[k - 1].focus(); e.preventDefault(); }
    }
  });
  // 키보드로 메뉴 밖으로 나가면 닫는다
  document.addEventListener('focusin', function (e) {
    var g = e.target.closest && e.target.closest('.mm-group');
    groups().forEach(function (x) { if (x !== g && x.classList.contains('open') && !x.matches(':hover')) setOpen(x, false); });
  });
})();
