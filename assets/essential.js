// 필수영단어 탭 — 교육부 기본 어휘 목록을 죽 늘어놓고 하나씩 외워 나가는 화면.
// 목록은 data/level.json (tools/build-level.py 가 원문 PDF 에서 뽑는다).
// 외운 표시는 기기에만 남는다(localStorage). 아이가 쓰는 앱이라 계정도 서버도 없다.
'use strict';
(function () {

const KEY = 'sd:known';
const STEP = 120;            // 한 번에 그리는 낱말 수. 1,800개를 한꺼번에 그리면 폰이 버벅인다.

// 차례는 ABC 순이 기본이다. '자주 쓰는 순' 으로 두면 the·of·to 같은 기능어가 앞을 다
// 차지해서, 외울 낱말을 찾으러 온 아이에게는 첫 화면이 쓸모없어 보인다.
const ui = { lv: 1, sort: 'abc', onlyNew: false, shown: STEP };

function known() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); } }
function saveKnown(s) { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) {} }
function toggleKnown(w) { const s = known(); if (s.has(w)) s.delete(w); else s.add(w); saveKnown(s); return s.has(w); }

// 한글 뜻 — 좋은 것부터 고른다.
//   ① core.json  손으로 다듬은 품사별 뜻
//   ② gloss.json 흔한 낱말의 짧은 뜻 (내장 사전이 'i → 알파벳 9번째의 문자' 처럼 엉뚱해서 따로 적어 둔 것)
//   ③ enko.json  내장 사전
function meaning(w, core, gloss, enko) {
  const c = core[w];
  if (c) return c.p.map(s => s.k).join(' · ');
  if (gloss[w]) return gloss[w];
  const e = enko[w];
  if (!e) return '';
  return e.split(';').map(x => x.trim()).filter(Boolean).slice(0, 3).join(', ');
}

async function render() {
  const box = document.getElementById('essResult');
  if (!box) return;
  box.innerHTML = '<div class="empty"><span class="load">낱말집을 여는 중…</span></div>';
  const [lvj, core, gloss, enko] = await Promise.all([
    loadData('level'), loadData('core'), loadData('gloss'), loadData('enko')]);
  const all = String(ui.lv === 1 ? lvj.lv1 : lvj.lv2).split(/\s+/).filter(Boolean);
  const kn = known();

  let list = all.slice();
  if (ui.sort === 'abc') list.sort();
  if (ui.onlyNew) list = list.filter(w => !kn.has(w));
  const total = all.length;
  const done = all.filter(w => kn.has(w)).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const page = list.slice(0, ui.shown);

  box.innerHTML = `
    <div class="ess-top">
      <div class="seg" id="essLv">
        <button data-v="1" class="${ui.lv === 1 ? 'on' : ''}">초등 ${String(lvj.lv1 || '').split(/\s+/).filter(Boolean).length}</button>
        <button data-v="2" class="${ui.lv === 2 ? 'on' : ''}">중등 이상 ${String(lvj.lv2 || '').split(/\s+/).filter(Boolean).length}</button>
      </div>
      <div class="ess-bar"><i style="width:${pct}%"></i></div>
      <div class="ess-cnt"><b>${done}</b> / ${total} 외웠어요 <span>(${pct}%)</span></div>
      <div class="ess-opt">
        <div class="seg sm" id="essSort">
          <button data-v="freq" class="${ui.sort === 'freq' ? 'on' : ''}">자주 쓰는 순</button>
          <button data-v="abc" class="${ui.sort === 'abc' ? 'on' : ''}">ABC 순</button>
        </div>
        <label class="ess-chk"><input type="checkbox" id="essOnlyNew" ${ui.onlyNew ? 'checked' : ''}> 아직 못 외운 것만</label>
      </div>
    </div>
    ${page.length ? `<ol class="ess-list" start="1">${page.map(w => {
      const on = kn.has(w);
      return `<li class="essi ${on ? 'done' : ''}">
        <button class="ess-check" data-k="${escapeAttr(w)}" aria-label="외웠어요">${on ? '✓' : ''}</button>
        <button class="ess-word" data-w="${escapeAttr(w)}">${escapeHtml(w)}</button>
        <span class="ess-ko">${escapeHtml(meaning(w, core, gloss, enko)) || '<span class="nf">뜻은 눌러서 확인</span>'}</span>
      </li>`;
    }).join('')}</ol>` : '<div class="empty"><p>이 단계는 다 외웠어요! 🎉</p></div>'}
    ${list.length > ui.shown ? `<button class="ess-more" id="essMore">${list.length - ui.shown}개 더 보기</button>` : ''}
    <p class="src">출처: ${escapeHtml(lvj.src || '')}<br>${escapeHtml(lvj.mark || '')}</p>`;

  box.querySelectorAll('#essLv button').forEach(b => b.onclick = () => {
    ui.lv = Number(b.dataset.v); ui.shown = STEP; render();
  });
  box.querySelectorAll('#essSort button').forEach(b => b.onclick = () => {
    ui.sort = b.dataset.v; ui.shown = STEP; render();
  });
  const chk = box.querySelector('#essOnlyNew');
  if (chk) chk.onchange = () => { ui.onlyNew = chk.checked; ui.shown = STEP; render(); };
  const more = box.querySelector('#essMore');
  if (more) more.onclick = () => { ui.shown += STEP; render(); };

  // 체크는 목록을 다시 그리지 않고 그 줄만 바꾼다 — 다시 그리면 보던 자리를 놓친다.
  box.querySelectorAll('.ess-check').forEach(b => b.onclick = () => {
    const on = toggleKnown(b.dataset.k);
    b.textContent = on ? '✓' : '';
    b.closest('.essi').classList.toggle('done', on);
    bumpCount(box, on ? 1 : -1, total);
  });
  box.querySelectorAll('.ess-word').forEach(b => b.onclick = () => {
    setQuery(b.dataset.w); setTab('word'); doSearch();
  });
}

// 세어 놓은 숫자와 막대만 손본다
function bumpCount(box, delta, total) {
  const cnt = box.querySelector('.ess-cnt b');
  const bar = box.querySelector('.ess-bar i');
  const span = box.querySelector('.ess-cnt span');
  if (!cnt) return;
  const n = Math.max(0, Number(cnt.textContent) + delta);
  const pct = total ? Math.round(n / total * 100) : 0;
  cnt.textContent = n;
  if (bar) bar.style.width = pct + '%';
  if (span) span.textContent = `(${pct}%)`;
}

window.SDEssential = { render };

})();
