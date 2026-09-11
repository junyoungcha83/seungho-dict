// 승호의사전 — 무료 오프라인 한↔영 사전
// 데이터: data/{enko,koen,ipa,idioms}.json (kengdic·ipa-dict 가공, SW 캐시)
// 발음소리: 브라우저 음성합성(speechSynthesis)  ·  예문: Tatoeba API(캐시)
'use strict';

const APP_VER = 'v12';
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
// 예전엔 3개만 받아 두었는데, 이제는 품사별로 나눠 담고 쉬운 것부터 골라야 해서
// 넉넉히(20개) 받아 둔다. 캐시 이름을 ex2 로 바꾼 것은 3개만 든 옛 캐시를 흘려보내려는 것.
async function fetchExamples(word) {
  const w = word.toLowerCase();
  const bundled = await loadData('examples');           // 내장 예문(오프라인) 우선
  const base = (bundled && bundled[w]) ? bundled[w].slice() : [];
  const key = 'sd:ex2:' + w;
  try { const c = localStorage.getItem(key); if (c) return base.concat(JSON.parse(c)); } catch (e) {}
  try {
    const r = await fetch(`${EX_API}?q=${encodeURIComponent(word)}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    const out = (j.examples || []).slice(0, 20);
    try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return base.concat(out);
  } catch (e) { return base.length ? base : null; }   // 오프라인이면 내장 예문만이라도
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

// ══ 낱말 풀이 네 칸 (품사별 뜻·예문 / 활용형 / 단어정보 / 퀴즈) ══════════════
// 재료는 두 갈래다.
//   ① data/core.json — 손으로 다듬은 초등·중등 필수 낱말. 품사마다 뜻과 예문이 붙어 있다.
//   ② 나머지 낱말 — 내장 사전(enko)의 뜻을 한글 꼬리로 품사를 갈라 묶고(word.js),
//      예문은 Tatoeba 에서 받아 품사별로 나눠 담는다. 뜻·예문이 ① 만큼 곱지는 않다.

// 난이도 낱말집(초등·중등)은 한 줄 문자열이라 Set 으로 바꿔 둔다
let _lv = null;
async function levelSets() {
  if (_lv) return _lv;
  const j = await loadData('level');
  const mk = s => new Set(String(s || '').split(/\s+/).filter(Boolean));
  _lv = { lv1: mk(j.lv1), lv2: mk(j.lv2) };
  return _lv;
}
function levelOf(word, lv) {
  const w = String(word || '').toLowerCase();
  return lv.lv1.has(w) ? 1 : lv.lv2.has(w) ? 2 : 0;
}

// 예문을 품사별로 나눠 담는다. 'lit' 이 든 문장은 light 의 동사 칸으로, 'lights' 는 명사 칸으로.
// 어느 칸에도 안 걸리는 문장이 대부분이므로, 모자란 칸은 공용 더미에서 쉬운 순으로 채운다.
function splitExamplesByPos(word, senses, list, inflect, lv) {
  const pool = SDWord.pickExamples(list, lv, 40);
  const used = new Set();
  const per = senses.map(s => {
    const forms = new Set(SDWord.allForms(word, inflect, s.t).map(f => f.toLowerCase()));
    const base = word.toLowerCase();
    const mine = pool.filter(e => {
      const ws = (e.en.toLowerCase().match(/[a-z']+/g) || []);
      // 원형은 어느 품사에나 들어가므로 증거가 못 된다 — 그 품사만의 꼴이 있어야 한다
      return ws.some(x => x !== base && forms.has(x));
    });
    return mine;
  });
  // 품사 칸이 적으면 한 칸에 더 넉넉히 담는다(최소 3개, 칸이 하나뿐이면 5개)
  const want = Math.min(5, Math.max(3, Math.ceil(12 / Math.max(1, senses.length))));
  return senses.map((s, i) => {
    const out = [];
    for (const e of per[i]) { if (used.has(e.en)) continue; used.add(e.en); out.push(e); if (out.length >= 5) break; }
    for (const e of pool) {
      if (out.length >= want) break;
      if (used.has(e.en)) continue;
      used.add(e.en); out.push(e);
    }
    return out;
  });
}

// 검색한 낱말의 풀이 한 덩어리
async function wordDetail(word) {
  const w = String(word || '').toLowerCase();
  const [core, enko, pos, inflect, info, lv] = await Promise.all([
    loadData('core'), loadData('enko'), loadData('pos'),
    loadData('inflect'), loadData('wordinfo'), levelSets(),
  ]);
  const entry = core[w];
  let senses, curated;
  if (entry) {
    senses = entry.p.map(s => ({ t: s.t, k: s.k, e: s.e.map(([en, ko]) => ({ en, ko })) }));
    curated = true;
  } else {
    senses = SDWord.groupByPos(enko[w] || '', pos[w] || '');
    curated = false;
  }
  return { w, senses, curated, inflect, info, enko, lv, level: (entry && entry.lv) || levelOf(w, lv) };
}

// ── 칸 1: 품사별 뜻과 예문 ──
function secSenses(d) {
  if (!d.senses.length) return '';
  const rows = d.senses.map((s, i) => `
    <div class="sense" data-si="${i}">
      <div class="sense-h"><span class="pos">${escapeHtml(SDWord.posKo(s.t))}</span>
        <span class="sense-k">${escapeHtml(s.k) || '<span class="nf">뜻 정보 없음</span>'}</span></div>
      <div class="sense-ex" id="sx${i}">${s.e ? exList(s.e) : '<span class="load">예문 불러오는 중…</span>'}</div>
    </div>`).join('');
  return `<section class="sec"><h3>품사별 뜻과 예문</h3><div class="senses">${rows}</div>
    ${d.curated ? '' : '<p class="src">※ 품사는 한글 뜻의 모양으로 자동 분류한 것이라 가끔 어긋날 수 있어요.</p>'}</section>`;
}
function exList(ex) {
  if (!ex || !ex.length) return '<span class="nf">예문을 찾지 못했어요</span>';
  return `<ol class="exn">${ex.map(e => `<li><div class="en">${escapeHtml(e.en)} ${speakerBtn(e.en)}</div>${
    e.ko ? `<div class="ko">${escapeHtml(e.ko)}</div>` : ''}</li>`).join('')}</ol>`;
}

// ── 칸 2: 활용형 ──
// 그 낱말이 가진 품사마다 표를 하나씩. 아래에는 파생어(명사형·형용사형…)를 붙인다.
function secForms(d) {
  const tags = [...new Set(d.senses.map(s => s.t))].filter(t => ['v', 'n', 'a', 'r'].includes(t));
  if (!tags.length && !d.senses.length) return '';
  const tables = tags.map(t => {
    const rows = SDWord.formTable(d.w, t, d.inflect);
    if (!rows.length) return '';
    return `<div class="ftab"><div class="ftab-h">${escapeHtml(SDWord.posKo(t))}일 때</div>
      <table><tbody>${rows.map(([label, form, hint]) => `<tr>
        <th>${escapeHtml(label)}</th>
        <td class="f">${/^[a-z]/i.test(form) ? `<button class="wlink" data-w="${escapeAttr(form)}">${escapeHtml(form)}</button> ${speakerBtn(form)}` : escapeHtml(form)}</td>
        <td class="h">${escapeHtml(hint || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');

  const der = SDWord.derived(d.w, d.enko, d.inflect, 5, [...new Set(d.senses.map(s => s.t))]);
  const derHtml = der.length ? `<div class="ftab"><div class="ftab-h">이 낱말에서 나온 말</div>
    <div class="der">${der.map(x => `<div class="deri">
      <button class="wlink big" data-w="${escapeAttr(x.w)}">${escapeHtml(x.w)}</button>
      <span class="pos sm">${escapeHtml(SDWord.posKo(x.pos))}</span> ${speakerBtn(x.w)}
      <div class="ko">${escapeHtml(String(x.ko).split(';').slice(0, 3).join(', '))}</div>
      <div class="hint">-${escapeHtml(x.suf)} : ${escapeHtml(x.hint)}</div>
    </div>`).join('')}</div></div>` : '';

  if (!tables && !derHtml) return '';
  return `<section class="sec"><h3>활용형</h3>${tables}${derHtml}
    <p class="src">파란 글씨를 누르면 그 낱말을 바로 찾아봐요.</p></section>`;
}

// ── 칸 3: 단어정보 ──
function secInfo(d) {
  const pv = SDWord.phrasals(d.w, d.idioms || {}, d.info, 8);
  const mix = SDWord.confusables(d.w, d.info);
  const tip = (d.info.tip || {})[d.w];
  if (!pv.length && !mix.length && !tip) return '';
  const pvHtml = pv.length ? `<div class="info-b"><b>구동사 — 동사 뒤에 말이 붙어 뜻이 통째로 바뀌는 것</b>
    ${pv.map(([en, ko, note]) => `<div class="pvi">
      <span class="en">${escapeHtml(en)} ${speakerBtn(en)}</span>
      <span class="ko">${escapeHtml(ko)}</span>
      ${note ? `<div class="note">${escapeHtml(note)}</div>` : ''}</div>`).join('')}</div>` : '';
  const mixHtml = mix.length ? `<div class="info-b"><b>헷갈리기 쉬워요</b>
    ${mix.map(m => `<div class="mixi"><span class="t">${escapeHtml(m.t)}</span>
      <div class="note">${escapeHtml(m.d)}</div></div>`).join('')}</div>` : '';
  const tipHtml = tip ? `<div class="info-b"><b>알아 두기</b><div class="note">${escapeHtml(tip)}</div></div>` : '';
  return `<section class="sec"><h3>단어정보</h3>${tipHtml}${pvHtml}${mixHtml}</section>`;
}

// ── 칸 4: 퀴즈타임 ──
// 오답은 다른 낱말의 '같은 품사' 뜻에서 가져온다. 아무 말이나 섞으면 답이 뻔해져 공부가 안 된다.
let _pool = null;
async function quizPool() {
  if (_pool) return _pool;
  const core = await loadData('core');
  _pool = [];
  for (const [w, ent] of Object.entries(core)) for (const s of ent.p) _pool.push({ w, k: s.k, t: s.t });
  return _pool;
}
async function secQuiz(d) {
  const pool = await quizPool();
  const qs = SDWord.makeQuiz(d.w, d.senses.filter(s => s.k), pool, 3);
  if (!qs.length) return '';
  return `<section class="sec quiz" id="quiz"><h3>퀴즈타임 🎯</h3>
    <div class="qlist">${qs.map((q, i) => `<div class="qi" data-qi="${i}" data-ans="${escapeAttr(q.answer)}">
      <div class="qq"><b>${i + 1}.</b> <span class="qw">${escapeHtml(q.q)}</span>
        <span class="pos sm">${escapeHtml(SDWord.posKo(q.pos))}</span> 의 뜻은?</div>
      <div class="qc">${q.choices.map((c, ci) => `<button class="qb" data-c="${escapeAttr(c)}">
        <span class="qn">${'①②③④'[ci]}</span> ${escapeHtml(c)}</button>`).join('')}</div>
      <div class="qr"></div>
    </div>`).join('')}</div>
    <button class="qagain" id="qAgain">다시 풀기</button></section>`;
}
// 보기를 누르면 맞았는지 알려 주고, 한 문제는 한 번만 고르게 잠근다
function wireQuiz(root, reload) {
  const box = root.querySelector('#quiz'); if (!box) return;
  box.querySelectorAll('.qi').forEach(qi => {
    const ans = qi.dataset.ans;
    qi.querySelectorAll('.qb').forEach(b => b.onclick = () => {
      if (qi.classList.contains('done')) return;
      qi.classList.add('done');
      const ok = b.dataset.c === ans;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) qi.querySelectorAll('.qb').forEach(x => { if (x.dataset.c === ans) x.classList.add('right'); });
      qi.querySelector('.qr').innerHTML = ok
        ? '<span class="ok">정답! 잘했어요 🎉</span>'
        : `<span class="no">아쉬워요. 정답은 <b>${escapeHtml(ans)}</b> 예요.</span>`;
    });
  });
  const again = box.querySelector('#qAgain');
  if (again) again.onclick = reload;
}

// 네 칸을 한꺼번에 그려 붙인다. 예문이 없는 낱말은 받아 온 뒤 칸만 다시 채운다.
async function renderWordSections(word, host) {
  if (!host) return;
  const d = await wordDetail(word);
  d.idioms = await loadData('idioms');
  host.innerHTML = secSenses(d) + secForms(d) + secInfo(d) + (await secQuiz(d));
  wireSpeakers(host); wireWordLinks(host);
  wireQuiz(host, () => renderWordSections(word, host));
  // 손으로 다듬은 낱말이 아니면 예문을 받아 품사 칸에 나눠 담는다
  if (!d.curated && d.senses.length) {
    const ex = await fetchExamples(d.w);
    const buckets = ex ? splitExamplesByPos(d.w, d.senses, ex, d.inflect, d.lv) : null;
    d.senses.forEach((s, i) => {
      const el = host.querySelector('#sx' + i);
      if (!el) return;
      el.innerHTML = buckets ? exList(buckets[i]) : '<span class="nf">오프라인이라 예문을 불러오지 못했어요</span>';
      wireSpeakers(el);
    });
  }
}
// 활용형·파생어의 파란 글씨를 누르면 그 낱말로 검색이 넘어간다
function wireWordLinks(root) {
  if (!root) return;
  root.querySelectorAll('.wlink').forEach(b => b.onclick = () => {
    setQuery(b.dataset.w); setTab('word'); doSearch();
  });
}

// ── 렌더 ──
function speakerBtn(word) { return `<button class="spk" data-say="${escapeAttr(word)}" title="발음 듣기" aria-label="발음 듣기">🔊</button>`; }

async function render(res) {
  const box = document.getElementById('result');
  if (!res) { box.innerHTML = ''; return; }

  if (res.dir === 'en') {
    const head = res.head || res.query.toLowerCase();
    const lv = await levelSets();
    box.innerHTML = `
      <article class="card">
        <div class="head">
          <div class="word">${escapeHtml(res.query)}${levelBadge(head, lv)}</div>
          <div class="phon">${res.ipa ? escapeHtml(res.ipa) : ''} ${speakerBtn(head)} ${favBtn(res.query)}</div>
        </div>
        <div class="mean">${res.kor ? escapeHtml(res.kor).split('; ').map(m => `<span class="tag">${escapeHtml(m)}</span>`).join('') : '<span class="nf">뜻을 찾지 못했어요</span>'}</div>
        ${res.auto ? '<div class="autonote">🌐 자동 번역 (사전 미수록 단어)</div>' : ''}
        ${head !== res.query.toLowerCase() ? `<div class="autonote">🔎 <b>${escapeHtml(head)}</b> 의 활용형으로 보고 찾았어요</div>` : ''}
        <div id="wsec"><span class="load">풀이를 준비하는 중…</span></div>
      </article>`;
    wireSpeakers(box); wireFav(box);
    await renderWordSections(head, document.getElementById('wsec'));
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
        ${head ? '<div id="wsec"><span class="load">풀이를 준비하는 중…</span></div>' : ''}
      </article>`;
    wireSpeakers(box); wireFav(box);
    // 한글로 찾았어도 영어 대표 낱말이 나왔으면 그 낱말의 네 칸을 그대로 보여 준다
    if (head) await renderWordSections(head.toLowerCase(), document.getElementById('wsec'));
  }
}
// 초등·중등 필수 낱말이면 작은 딱지를 붙인다 — 무엇부터 외울지 고르는 데 쓴다
function levelBadge(word, lv) {
  const n = levelOf(word, lv);
  if (!n) return '';
  return `<span class="lvb lv${n}">${n === 1 ? '초등 필수' : '중등 필수'}</span>`;
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

// 첫 화면에 초등 필수 낱말을 몇 개 띄워 둔다. 무엇을 쳐야 할지 모르는 아이에게
// 고를 거리를 주려는 것 — 손으로 다듬어 둔 낱말(core) 중에서만 고른다.
async function renderWordSuggest() {
  const box = document.getElementById('wordSuggest'); if (!box) return;
  const [core, lv] = await Promise.all([loadData('core'), levelSets()]);
  const words = Object.keys(core).filter(w => lv.lv1.has(w));
  if (!words.length) return;
  const pick = SDWord.shuffle(words.slice()).slice(0, 12);
  box.innerHTML = `<div class="recent-title">초등 필수 낱말로 시작해 볼까요?</div>
    <div class="chips">${pick.map(w => `<button class="chip" data-w="${escapeAttr(w)}">${escapeHtml(w)}</button>`).join('')}</div>`;
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => { setQuery(b.dataset.w); doSearch(); });
}

// 첫 화면으로 되돌리기
function goHome() {
  document.getElementById('result').innerHTML = HOME_HTML;
  renderFavs(); renderRecent(); renderWordSuggest();
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

// 탭 배선
document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));

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
renderWordSuggest();
// 데이터 미리 살짝 예열(첫 검색 체감속도).
// core·inflect·wordinfo·level 은 다 합쳐도 작고, 첫 검색에서 바로 필요하다.
loadData(ipaName()); loadData('examples');
loadData('core'); loadData('inflect'); loadData('wordinfo'); loadData('pos'); levelSets();
// ?q= 로 들어오면 자동 검색(딥링크)
const _q0 = new URLSearchParams(location.search).get('q');
if (_q0) {
  try { history.replaceState({ q: _q0 }, '', location.search); } catch (e) {}
  setQuery(_q0); doSearch(false);
}
