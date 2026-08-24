// 첫 화면 — 배경 사진을 꽉 채워 5초 보여준 뒤 검색 화면으로 넘어간다.
// 기다리기 싫으면 아무 데나 탭(또는 키 입력)하면 바로 넘어간다.
(function () {
  const HOLD = 5000;                 // 사진을 보여주는 시간 — CSS 진행바 애니메이션과 같아야 한다
  const el = document.getElementById('splash');
  if (!el) return;

  // ?q= 딥링크로 들어왔으면 결과를 바로 보여줘야 하므로 첫 화면을 건너뛴다
  if (new URLSearchParams(location.search).get('q')) { el.remove(); return; }

  document.body.classList.add('splash-on');

  let done = false;
  const timer = setTimeout(close, HOLD);

  function close() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    off();
    el.classList.add('out');
    document.body.classList.remove('splash-on');
    setTimeout(() => el.remove(), 450);       // 페이드아웃이 끝난 뒤 치운다
    if (window.SDStats) SDStats.render();     // 가려져 있던 통계 차트를 다시 그린다
  }

  // pointerdown 하나로 터치·마우스·펜을 모두 받는다(click 과 겹치지 않게)
  const onKey = (e) => { if (e.key !== 'Tab') close(); };
  function off() {
    el.removeEventListener('pointerdown', close);
    removeEventListener('keydown', onKey);
  }
  el.addEventListener('pointerdown', close);
  addEventListener('keydown', onKey);
})();
