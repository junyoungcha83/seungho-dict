// 승호의사전 — 무료 오프라인 한↔영 사전
// 데이터: data/{enko,koen,ipa,idioms}.json (kengdic·ipa-dict 가공, SW 캐시)
// 발음소리: 브라우저 음성합성(speechSynthesis)  ·  예문: Tatoeba API(캐시)
'use strict';

const APP_VER = 'v1';
const HANGUL = /[가-힣]/;
const EX_API = 'https://seungho-dict-api.junyoung-cha83.workers.dev/ex';   // 예문 프록시(무료)

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
    u.lang = 'en-US'; u.rate = 0.92;
    const v = speechSynthesis.getVoices().find(v => /en(-|_)?US/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { /* 미지원 */ }
}
try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}

// ── 예문 (Tatoeba, localStorage 캐시) ──
async function fetchExamples(word) {
  const key = 'sd:ex:' + word.toLowerCase();
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
function renderRecent() {
  const box = document.getElementById('recent'); if (!box) return;
  const a = recentList();
  box.innerHTML = a.length
    ? `<div class="recent-title">최근 검색</div><div class="chips">${a.map(w => `<button class="chip" data-w="${escapeAttr(w)}">${escapeHtml(w)}</button>`).join('')}</div>`
    : '';
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => { setQuery(b.dataset.w); doSearch(); });
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

// ── 조회 로직 ──
function firstWord(s) { return String(s || '').split(/[;,]/)[0].trim().split(/\s+/)[0]; }

async function lookup(q) {
  q = q.trim();
  if (!q) return null;
  if (HANGUL.test(q)) {
    // 한글 → 영어
    const koen = await loadData('koen');
    const eng = koen[q] || koen[q.replace(/\s+/g, '')] || null;
    return { dir: 'ko', query: q, eng };
  } else {
    // 영어 → 한글
    const lc = q.toLowerCase();
    const [enko, ipa] = await Promise.all([loadData('enko'), loadData('ipa')]);
    let kor = enko[lc];
    let head = lc;
    if (!kor) {                                   // 간단 표제어 보정(복수/과거/진행)
      for (const cand of lemmas(lc)) { if (enko[cand]) { kor = enko[cand]; head = cand; break; } }
    }
    return { dir: 'en', query: q, head, kor, ipa: ipa[lc] || ipa[head] || '' };
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
          <div class="phon">${res.ipa ? escapeHtml(res.ipa) : ''} ${speakerBtn(head)}</div>
        </div>
        <div class="mean">${res.kor ? escapeHtml(res.kor).split('; ').map(m => `<span class="tag">${escapeHtml(m)}</span>`).join('') : '<span class="nf">뜻을 찾지 못했어요</span>'}</div>
        <section class="sec"><h3>예문</h3><div id="ex" class="ex"><span class="load">불러오는 중…</span></div></section>
        <section class="sec"><h3>관련 숙어·표현</h3><div id="idm" class="idm"></div></section>
      </article>`;
    wireSpeakers(box);
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
    const ipa = head ? (await loadData('ipa'))[head.toLowerCase()] || '' : '';
    box.innerHTML = `
      <article class="card">
        <div class="head">
          <div class="word">${escapeHtml(res.query)}</div>
        </div>
        <div class="mean">${engs.length ? engs.map(m => `<span class="tag en">${escapeHtml(m)}</span>`).join('') : '<span class="nf">단어를 찾지 못했어요</span>'}</div>
        ${head ? `<div class="phon big">${escapeHtml(head)} ${ipa ? escapeHtml(ipa) : ''} ${speakerBtn(head)}</div>` : ''}
        ${head ? `<section class="sec"><h3>예문</h3><div id="ex" class="ex"><span class="load">불러오는 중…</span></div></section>` : ''}
      </article>`;
    wireSpeakers(box);
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
async function doSearch() {
  const q = $q().value.trim();
  if (!q) return;
  const res = await lookup(q);
  pushRecent(q);
  await render(res);
  window.scrollTo(0, 0);
}

document.getElementById('go').onclick = doSearch;
$q().addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
document.getElementById('ver').textContent = APP_VER;
renderRecent();
// 데이터 미리 살짝 예열(첫 검색 체감속도)
loadData('ipa');
// ?q= 로 들어오면 자동 검색(딥링크)
const _q0 = new URLSearchParams(location.search).get('q');
if (_q0) { setQuery(_q0); doSearch(); }
