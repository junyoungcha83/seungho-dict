// 승호의사전 — 무료 오프라인 한↔영 사전
// 데이터: data/{enko,koen,ipa,idioms}.json (kengdic·ipa-dict 가공, SW 캐시)
// 발음소리: 브라우저 음성합성(speechSynthesis)  ·  예문: Tatoeba API(캐시)
'use strict';

const APP_VER = 'v10';
const HANGUL = /[가-힣]/;
const API = 'https://seungho-dict-api.junyoung-cha83.workers.dev';
const EX_API = API + '/ex';   // 예문 프록시(무료)
const TR_API = API + '/tr';   // 사전에 없는 단어 폴백 번역(무료) → 캐시로 계속 축적
const KR_API = API + '/kr';   // 국립국어원 한국어기초사전 — 한국어 표제어의 뜻풀이 + 영어 대역
let accent = (localStorage.getItem('sd:acc') === 'uk') ? 'uk' : 'us';       // 발음: 미국/영국
const ipaName = () => 'ipa_' + accent;
const speakLang = () => (accent === 'uk' ? 'en-GB' : 'en-US');
let lastQuery = '';
// 첫 화면(빈 상태) 마크업 원본 — render() 가 #result 를 덮어쓰므로 뒤로가기 복원용으로 보관
const HOME_HTML = document.getElementById('result').innerHTML;

// ── 데이터 지연 로딩(필요할 때 한 번만) ──
const _data = {};
const _loading = {};
async function loadData(name) {
  if (_data[name]) return _data[name];
  if (!_loading[name]) {
    _loading[name] = fetch(`./data/${name}.json`).then(r => r.json()).then(j => (_data[name] = j)).catch(() => ({}));
  }
  return _loading[name];
}

// ── 발음 소리 (음성합성) ──
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speakLang(); u.rate = 0.92;
    const want = speakLang().toLowerCase();
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => v.lang && v.lang.replace('_', '-').toLowerCase() === want) || vs.find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { /* 미지원 */ }
}
try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}

// ── 예문 (Tatoeba, localStorage 캐시) ──
async function fetchExamples(word) {
  const w = word.toLowerCase();
  const bundled = await loadData('examples');           // 내장 예문(오프라인) 우선
  if (bundled && bundled[w] && bundled[w].length) return bundled[w];
  const key = 'sd:ex:' + w;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch (e) {}
  try {
    const r = await fetch(`${EX_API}?q=${encodeURIComponent(word)}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    const out = (j.examples || []).slice(0, 3);
    try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return out;
  } catch (e) { return null; }   // 오프라인 등
}

// ── 최근 검색 ──
function recentList() { try { return JSON.parse(localStorage.getItem('sd:recent') || '[]'); } catch (e) { return []; } }
function pushRecent(q) {
  let a = recentList().filter(x => x !== q); a.unshift(q); a = a.slice(0, 12);
  try { localStorage.setItem('sd:recent', JSON.stringify(a)); } catch (e) {}
}
function removeRecent(q) {
  const a = recentList().filter(x => x !== q);
  try { localStorage.setItem('sd:recent', JSON.stringify(a)); } catch (e) {}
  renderRecent();
}
function renderRecent() {
  const box = document.getElementById('recent'); if (!box) return;
  const a = recentList();
  box.innerHTML = a.length
    ? `<div class="recent-title">최근 검색</div><div class="chips">${a.map(w =>
        `<span class="chip-wrap"><button class="chip-x" data-x="${escapeAttr(w)}" title="삭제" aria-label="삭제">×</button><button class="chip" data-w="${escapeAttr(w)}">${escapeHtml(w)}</button></span>`
      ).join('')}</div>`
    : '';
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => { setQuery(b.dataset.w); setTab('word'); doSearch(); });
  box.querySelectorAll('.chip-x').forEach(b => b.onclick = (e) => { e.stopPropagation(); removeRecent(b.dataset.x); });
}

// ── 즐겨찾기 ──
function favList() { try { return JSON.parse(localStorage.getItem('sd:fav') || '[]'); } catch (e) { return []; } }
function isFav(q) { return favList().includes(q); }
function saveFav(a) { try { localStorage.setItem('sd:fav', JSON.stringify(a)); } catch (e) {} }
function toggleFav(q) { const a = favList(); const i = a.indexOf(q); if (i >= 0) a.splice(i, 1); else a.unshift(q); saveFav(a.slice(0, 100)); }
function removeFav(q) { saveFav(favList().filter(x => x !== q)); renderFavs(); }
function renderFavs() {
  const box = document.getElementById('fav'); if (!box) return;
  const a = favList();
  box.innerHTML = a.length
    ? `<div class="recent-title">⭐ 즐겨찾기</div><div class="chips">${a.map(w =>
        `<span class="chip-wrap"><button class="chip-x" data-x="${escapeAttr(w)}" title="삭제" aria-label="삭제">×</button><button class="chip fav-chip" data-w="${escapeAttr(w)}">${escapeHtml(w)}</button></span>`
      ).join('')}</div>`
    : '';
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => { setQuery(b.dataset.w); setTab('word'); doSearch(); });
  box.querySelectorAll('.chip-x').forEach(b => b.onclick = (e) => { e.stopPropagation(); removeFav(b.dataset.x); });
  // 즐겨찾기도 최근검색도 없을 때만 안내를 띄운다
  const hint = document.getElementById('favEmpty');
  if (hint) hint.classList.toggle('hidden', !!(a.length || recentList().length));
}
function favBtn(q) { return `<button class="favbtn ${isFav(q) ? 'on' : ''}" data-fav="${escapeAttr(q)}" title="즐겨찾기" aria-label="즐겨찾기">${isFav(q) ? '★' : '☆'}</button>`; }
function wireFav(root) {
  if (!root) return;
  root.querySelectorAll('.favbtn').forEach(b => b.onclick = () => {
    const q = b.dataset.fav; toggleFav(q);
    const on = isFav(q); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
    renderFavs();
  });
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

// ── 조회 로직 ──
function firstWord(s) { return String(s || '').split(/[;,]/)[0].trim().split(/\s+/)[0]; }

// 사전에 없는 단어 → 무료 온라인 번역 폴백 + 기기 캐시(영구 축적)
async function onlineTranslate(word, dir) {
  const key = 'sd:fb:' + dir + ':' + word.toLowerCase();
  try { const c = localStorage.getItem(key); if (c !== null) return c; } catch (e) {}
  try {
    const r = await fetch(`${TR_API}?q=${encodeURIComponent(word)}&dir=${dir}`);
    const j = await r.json();
    let t = (j.text || '').trim();
    if (/MYMEMORY|WARNING|USED ALL/i.test(t)) t = '';
    if (t && t.toLowerCase() === word.toLowerCase()) t = '';   // 번역 안 됨
    try { localStorage.setItem(key, t); } catch (e) {}
    return t;
  } catch (e) { return ''; }
}

// ── 국립국어원 뜻풀이 (한국어 표제어) ──
// 워커가 인증키를 붙여 중계한다. 결과는 기기에 영구 캐시해 같은 말을 다시 묻지 않는다
// (하루 5만 건 한도가 있고, 뜻풀이는 잘 바뀌지 않는다).
async function krdictSenses(word) {
  const key = 'sd:kr:' + word;
  try { const c = localStorage.getItem(key); if (c !== null) return JSON.parse(c); } catch (e) {}
  try {
    const r = await fetch(`${KR_API}?q=${encodeURIComponent(word)}`);
    const j = await r.json();
    // 키가 없거나 서버가 실패한 경우의 '빈 결과' 를 캐시하면, 나중에 키를 넣어도
    // 그 단어는 영영 뜻풀이가 안 뜬다. 제대로 답을 받았을 때만 저장한다.
    if (j.error) return [];
    const items = Array.isArray(j.items) ? j.items : [];
    // 표제어가 정확히 같은 것만 쓴다. 비슷한 말을 대신 보여 주면('사과' → '사과나무')
    // 엉뚱한 뜻을 읽게 된다. 없으면 뜻풀이 칸을 아예 안 띄우는 편이 낫다.
    // 동음이의어는 item 이 따로 오므로(사과=과일/사죄) 여러 개가 잡히는 게 정상이다.
    const flat = s => String(s || '').replace(/\s+/g, '');
    const use = items.filter(i => i.word === word || flat(i.word) === flat(word));
    const out = [];
    for (const it of use) {
      for (const s of (it.senses || [])) {
        out.push({ word: it.word, pos: it.pos || '', def: s.def || '', en: s.en || '', enDef: s.enDef || '' });
        if (out.length >= 6) break;
      }
      if (out.length >= 6) break;
    }
    try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return out;
  } catch (e) { return []; }    // 오프라인·키 없음 → 조용히 건너뛴다
}

async function lookup(q) {
  q = q.trim();
  if (!q) return null;
  if (HANGUL.test(q)) {
    // 한글 → 영어. 내장 사전(단어 대 단어)에 더해 국립국어원에서 뜻풀이를 받아 온다.
    const koen = await loadData('koen');
    let eng = koen[q] || koen[q.replace(/\s+/g, '')] || null;
    let auto = false;
    const senses = await krdictSenses(q);
    // 내장 사전에 없으면 국립국어원의 영어 대역을 대신 쓴다(비공식 번역 폴백보다 정확하다)
    if (!eng && senses.length) {
      const words = [...new Set(senses.map(s => s.en).filter(Boolean))];
      if (words.length) eng = words.join('; ');
    }
    if (!eng) { const t = await onlineTranslate(q, 'koen'); if (t) { eng = t.toLowerCase(); auto = true; } }
    return { dir: 'ko', query: q, eng, auto, senses };
  } else {
    // 영어 → 한글
    const lc = q.toLowerCase();
    const [enko, ipa] = await Promise.all([loadData('enko'), loadData(ipaName())]);
    let kor = enko[lc];
    let head = lc, auto = false;
    if (!kor) {                                   // 간단 표제어 보정(복수/과거/진행)
      for (const cand of lemmas(lc)) { if (enko[cand]) { kor = enko[cand]; head = cand; break; } }
    }
    if (!kor) { const t = await onlineTranslate(lc, 'enko'); if (t) { kor = t; auto = true; } }
    return { dir: 'en', query: q, head, kor, auto, ipa: ipa[lc] || ipa[head] || '' };
  }
}
function lemmas(w) {
  const out = [];
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  if (w.endsWith('ing')) { out.push(w.slice(0, -3)); out.push(w.slice(0, -3) + 'e'); }
  if (w.endsWith('ed')) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
  return out;
}

// ── 렌더 ──
function speakerBtn(word) { return `<button class="spk" data-say="${escapeAttr(word)}" title="발음 듣기" aria-label="발음 듣기">🔊</button>`; }

async function render(res) {
  const box = document.getElementById('result');
  if (!res) { box.innerHTML = ''; return; }

  if (res.dir === 'en') {
    const head = res.head || res.query.toLowerCase();
    box.innerHTML = `
      <article class="card">
        <div class="head">
          <div class="word">${escapeHtml(res.query)}</div>
          <div class="phon">${res.ipa ? escapeHtml(res.ipa) : ''} ${speakerBtn(head)} ${favBtn(res.query)}</div>
        </div>
        <div class="mean">${res.kor ? escapeHtml(res.kor).split('; ').map(m => `<span class="tag">${escapeHtml(m)}</span>`).join('') : '<span class="nf">뜻을 찾지 못했어요</span>'}</div>
        ${res.auto ? '<div class="autonote">🌐 자동 번역 (사전 미수록 단어)</div>' : ''}
        <section class="sec"><h3>예문</h3><div id="ex" class="ex"><span class="load">불러오는 중…</span></div></section>
        <section class="sec"><h3>관련 숙어·표현</h3><div id="idm" class="idm"></div></section>
      </article>`;
    wireSpeakers(box); wireFav(box);
    // 예문
    const ex = await fetchExamples(head);
    const exEl = document.getElementById('ex');
    if (exEl) exEl.innerHTML = ex && ex.length
      ? ex.map(e => `<div class="exi"><div class="en">${escapeHtml(e.en)} ${speakerBtn(e.en)}</div>${e.ko ? `<div class="ko">${escapeHtml(e.ko)}</div>` : ''}</div>`).join('')
      : (ex === null ? '<span class="nf">오프라인이라 예문을 불러오지 못했어요</span>' : '<span class="nf">예문이 없어요</span>');
    wireSpeakers(exEl);
    // 숙어
    const idioms = await loadData('idioms');
    const list = (idioms[head] || []).slice(0, 6);
    const idmEl = document.getElementById('idm');
    if (idmEl) idmEl.innerHTML = list.length
      ? list.map(([en, ko]) => `<div class="idmi"><span class="en">${escapeHtml(en)} ${speakerBtn(en)}</span><span class="ko">${escapeHtml(ko)}</span></div>`).join('')
      : '<span class="nf">관련 숙어가 없어요</span>';
    wireSpeakers(idmEl);
  } else {
    // 한글 → 영어
    const engs = res.eng ? res.eng.split('; ') : [];
    const head = engs.length ? firstWord(engs[0]) : '';
    const ipa = head ? (await loadData(ipaName()))[head.toLowerCase()] || '' : '';
    box.innerHTML = `
      <article class="card">
        <div class="head">
          <div class="word">${escapeHtml(res.query)}</div>
          <div class="phon">${favBtn(res.query)}</div>
        </div>
        <div class="mean">${engs.length ? engs.map(m => `<span class="tag en">${escapeHtml(m)}</span>`).join('') : '<span class="nf">단어를 찾지 못했어요</span>'}</div>
        ${res.auto ? '<div class="autonote">🌐 자동 번역 (사전 미수록 단어)</div>' : ''}
        ${(res.senses || []).length ? `<section class="sec"><h3>뜻풀이</h3><div class="defs">${
          res.senses.map((s, i) => `<div class="defi">
            <div class="ko">${res.senses.length > 1 ? `<b class="dno">${i + 1}</b> ` : ''}${escapeHtml(s.def)}</div>
            ${s.en ? `<div class="en">${escapeHtml(s.en)}${s.enDef ? ` — ${escapeHtml(s.enDef)}` : ''}</div>` : ''}
          </div>`).join('')
        }</div><p class="src">출처: 국립국어원 한국어기초사전 (CC BY-SA)</p></section>` : ''}
        ${head ? `<div class="phon big">${escapeHtml(head)} ${ipa ? escapeHtml(ipa) : ''} ${speakerBtn(head)}</div>` : ''}
        ${head ? `<section class="sec"><h3>예문</h3><div id="ex" class="ex"><span class="load">불러오는 중…</span></div></section>` : ''}
      </article>`;
    wireSpeakers(box); wireFav(box);
    if (head) {
      const ex = await fetchExamples(head);
      const exEl = document.getElementById('ex');
      if (exEl) exEl.innerHTML = ex && ex.length
        ? ex.map(e => `<div class="exi"><div class="en">${escapeHtml(e.en)} ${speakerBtn(e.en)}</div>${e.ko ? `<div class="ko">${escapeHtml(e.ko)}</div>` : ''}</div>`).join('')
        : (ex === null ? '<span class="nf">오프라인이라 예문을 불러오지 못했어요</span>' : '<span class="nf">예문이 없어요</span>');
      wireSpeakers(exEl);
    }
  }
}
function wireSpeakers(root) { if (!root) return; root.querySelectorAll('.spk').forEach(b => b.onclick = () => speak(b.dataset.say)); }

// ── 검색 실행 ──
const $q = () => document.getElementById('q');
function setQuery(v) { $q().value = v; }
async function doSearch(push = true) {
  const q = $q().value.trim();
  if (!q) return;
  lastQuery = q;
  // 검색을 히스토리에 쌓아야 뒤로가기가 앱을 나가지 않고 첫 화면으로 돌아온다
  if (push) {
    try { history.pushState({ q }, '', '?q=' + encodeURIComponent(q)); } catch (e) {}
  }
  const res = await lookup(q);
  pushRecent(q);
  if (window.SDStats) SDStats.log();   // 주간 통계용 검색 기록
  await render(res);
  window.scrollTo(0, 0);
}

// ── 탭 ────────────────────────────────────────
// 즐겨찾기·통계는 볼 때마다 새로 그린다. 다른 탭에서 별표를 누르거나 검색을 해도
// 돌아오면 최신이 보이게 하려는 것.
let curTab = 'word';
function setTab(tab) {
  curTab = tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.tab !== tab));
  document.querySelectorAll('.tab-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (tab === 'fav') { renderFavs(); renderRecent(); }
  if (tab === 'stats' && window.SDStats) SDStats.render();
  window.scrollTo(0, 0);
}

// ── 예문검색 ──────────────────────────────────
async function doExSearch() {
  const w = document.getElementById('qEx').value.trim();
  if (!w) return;
  const box = document.getElementById('exResult');
  box.innerHTML = '<div class="empty"><span class="load">찾는 중…</span></div>';
  const ex = await fetchExamples(w);
  if (!ex) { box.innerHTML = '<div class="empty"><p class="nf">오프라인이라 예문을 불러오지 못했어요.</p></div>'; return; }
  if (!ex.length) { box.innerHTML = `<div class="empty"><p class="nf">‘${escapeHtml(w)}’ 예문을 찾지 못했어요.</p></div>`; return; }
  box.innerHTML = `<article class="card">
    <div class="head"><div class="word">${escapeHtml(w)}</div>${speakerBtn(w)}</div>
    <section class="sec"><h3>예문 ${ex.length}개</h3><div class="ex">${
      ex.map(e => `<div class="exi"><div class="en">${escapeHtml(e.en)} ${speakerBtn(e.en)}</div>${
        e.ko ? `<div class="ko">${escapeHtml(e.ko)}</div>` : ''}</div>`).join('')
    }</div></section></article>`;
  wireSpeakers(box);
  if (window.SDStats) SDStats.log();     // 예문검색도 검색 건수에 넣는다
}

// 첫 화면으로 되돌리기
function goHome() {
  document.getElementById('result').innerHTML = HOME_HTML;
  renderFavs(); renderRecent();
  lastQuery = '';
  setQuery('');
  window.scrollTo(0, 0);
}

addEventListener('popstate', (e) => {
  const q = (e.state && e.state.q) || new URLSearchParams(location.search).get('q');
  if (q) { setQuery(q); doSearch(false); } else goHome();
});

document.getElementById('go').onclick = () => doSearch();
$q().addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
document.getElementById('ver').textContent = APP_VER;

// 탭 · 예문검색 배선
document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.getElementById('goEx').onclick = () => doExSearch();
document.getElementById('qEx').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doExSearch(); }
});

// 발음(US/UK) 토글
function updateAccentUI() {
  document.querySelectorAll('#acc button').forEach(b => b.classList.toggle('on', b.dataset.a === accent));
}
document.querySelectorAll('#acc button').forEach(b => b.onclick = () => {
  if (accent === b.dataset.a) return;
  accent = b.dataset.a; try { localStorage.setItem('sd:acc', accent); } catch (e) {}
  updateAccentUI();
  loadData(ipaName());
  if (lastQuery) doSearch(false);   // 같은 단어 재렌더 — 히스토리는 그대로
});
updateAccentUI();

renderFavs();
renderRecent();
// 데이터 미리 살짝 예열(첫 검색 체감속도)
loadData(ipaName()); loadData('examples');
// ?q= 로 들어오면 자동 검색(딥링크)
const _q0 = new URLSearchParams(location.search).get('q');
if (_q0) {
  try { history.replaceState({ q: _q0 }, '', location.search); } catch (e) {}
  setQuery(_q0); doSearch(false);
}
