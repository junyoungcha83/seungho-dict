// 낱말을 뜯어보는 계산만 모아 둔 곳 — 화면·통신은 여기 없다(app.js 담당).
// 그래서 브라우저와 node(tools/build-core.mjs) 가 같은 코드를 쓴다.
//   · 활용형 만들기 (3인칭단수/과거/과거분사/-ing/복수/비교급)
//   · 한글 뜻만 보고 품사 짐작하기 (내장 사전에는 품사가 안 붙어 있다)
//   · 예문 쉬운 것부터 고르기
//   · 구동사 추리기 · 퀴즈 만들기
'use strict';
(function (root) {

const VOWEL = 'aeiou';
const isV = c => VOWEL.includes(c);

// ── 품사 이름 ──
const POS_KO = {
  v: '동사', n: '명사', a: '형용사', r: '부사',
  prep: '전치사', conj: '접속사', pron: '대명사', int: '감탄사',
  det: '한정사', aux: '조동사', num: '수사',
};
// 화면에 늘 같은 차례로 나오게 한다(동사 → 명사 → 형용사 → 부사 → 나머지)
const POS_ORDER = ['v', 'n', 'a', 'r', 'pron', 'prep', 'conj', 'aux', 'det', 'num', 'int'];
const posKo = t => POS_KO[t] || t;
const posRank = t => { const i = POS_ORDER.indexOf(t); return i < 0 ? 99 : i; };

// ── 규칙 활용형 ──
// 마지막이 '자음+모음+자음' 이면 끝 자음을 한 번 더 쓴다(stop→stopped). 다만 강세를
// 코드로는 알 수 없어서 inflect.json 의 double 목록에 적힌 낱말만 두 번 쓴다.
function doubles(w, dbl) { return !!(dbl && dbl.has(w)); }

function vIng(w, inf) {
  const irr = inf.verb && inf.verb[w];
  if (irr && irr[3]) return irr[3];
  if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';          // lie → lying
  if (w.endsWith('ee') || w.endsWith('oe') || w.endsWith('ye')) return w + 'ing';  // see → seeing
  if (w.endsWith('e')) return w.slice(0, -1) + 'ing';            // make → making
  if (doubles(w, inf._dbl)) return w + w.slice(-1) + 'ing';      // run → running
  return w + 'ing';
}
function v3(w, inf) {
  const irr = inf.verb && inf.verb[w];
  if (irr && irr[2]) return irr[2];
  if (/(s|x|z|ch|sh|o)$/.test(w)) return w + 'es';               // wash → washes
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';       // study → studies
  return w + 's';
}
function vPast(w, inf) {
  const irr = inf.verb && inf.verb[w];
  if (irr) return [irr[0], irr[1]];
  let p;
  if (w.endsWith('e')) p = w + 'd';
  else if (/[^aeiou]y$/.test(w)) p = w.slice(0, -1) + 'ied';
  else if (doubles(w, inf._dbl)) p = w + w.slice(-1) + 'ed';
  else p = w + 'ed';
  return [p, p];
}
function plural(w, inf) {
  if (inf._unc && inf._unc.has(w)) return '';                    // 셀 수 없는 명사
  const irr = inf.plural && inf.plural[w];
  if (irr) return irr;
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(f)$/.test(w)) return w.slice(0, -1) + 'ves';             // leaf → leaves
  if (/fe$/.test(w)) return w.slice(0, -2) + 'ves';
  return w + 's';
}
// 형용사가 -er/-est 를 받는지, more/most 를 받는지. 1음절이면 -er, 3음절 이상이면 more,
// 2음절은 갈리므로 inflect.json 의 목록을 먼저 본다.
function syllables(w) { return (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || ['']).length; }
function compare(w, inf) {
  const irr = inf.adj && inf.adj[w];
  if (irr) return irr;
  const n = syllables(w);
  const short = (inf._er && inf._er.has(w)) || (n <= 1 && !(inf._more && inf._more.has(w)));
  if (!short) return ['more ' + w, 'most ' + w];
  if (w.endsWith('e')) return [w + 'r', w + 'st'];
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest'];
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) return [w + w.slice(-1) + 'er', w + w.slice(-1) + 'est'];
  return [w + 'er', w + 'est'];
}

// inflect.json 은 사람이 읽기 좋게 배열로 돼 있다. 찾아보기 빠르게 Set 을 붙여 둔다.
function prep(inf) {
  if (!inf || inf._ready) return inf || {};
  inf._dbl = new Set(inf.double || []);
  inf._unc = new Set(inf.uncount || []);
  inf._er = new Set(inf.er || []);
  inf._more = new Set(inf.more || []);
  inf._ready = true;
  return inf;
}

// 한 낱말이 가질 수 있는 꼴. 예문 안에서 그 낱말을 알아보는 데도 쓴다.
// pos 를 주면 그 품사의 꼴만 만든다 — 안 주면 동사 꼴이 명사에도 섞여(run → runner)
// 엉뚱한 낱말을 '이미 아는 꼴' 로 잘못 치게 된다.
function allForms(w, inf, pos) {
  inf = prep(inf);
  const out = new Set([w]);
  const add = x => { if (x && !x.includes(' ')) out.add(x); };
  if (!pos || pos === 'v') {
    const [pa, pp] = vPast(w, inf);
    [v3(w, inf), vIng(w, inf), pa, pp].forEach(add);
  }
  if (!pos || pos === 'n') add(plural(w, inf));
  if (!pos || pos === 'a' || pos === 'r') compare(w, inf).forEach(add);
  return [...out];
}

// 화면에 보여 줄 활용형 표. 품사에 따라 줄이 달라진다.
function formTable(w, pos, inf) {
  inf = prep(inf);
  const rows = [];
  if (pos === 'v') {
    const [pa, pp] = vPast(w, inf);
    rows.push(['원형 (I / you / we / they)', w, '나는·너는·우리는 ~한다']);
    rows.push(['3인칭 단수 현재 (he / she / it)', v3(w, inf), '그는·그녀는·그것은 ~한다']);
    rows.push(['과거형', pa, '~했다']);
    rows.push(['과거분사 (have + p.p.)', pp, '~한 적이 있다 · ~되어진']);
    rows.push(['-ing형 (be + -ing)', vIng(w, inf), '~하고 있다 · ~하기']);
    if (inf.verb && inf.verb[w]) rows.push(['※', '불규칙 동사', '규칙(-ed)이 아니라 통째로 외워야 한다']);
  } else if (pos === 'n') {
    const pl = plural(w, inf);
    rows.push(['단수 (하나)', w, 'a ' + (isV(w[0]) ? '→ an ' : '') + w]);
    if (pl) rows.push(['복수 (둘 이상)', pl, '두 개 이상일 때']);
    else rows.push(['복수', '없음', '셀 수 없는 명사라 복수형을 쓰지 않는다']);
  } else if (pos === 'a' || pos === 'r') {
    const [c, s] = compare(w, inf);
    rows.push(['원급', w, '그냥 ~한']);
    rows.push(['비교급', c, '더 ~한 (than 과 함께)']);
    rows.push(['최상급', s, '가장 ~한 (the 와 함께)']);
  }
  return rows;
}

// ── 파생어(명사형·형용사형…) ──
// 낱말 뒤에 꼬리를 붙여 보고, 그 꼴이 내장 사전(enko)에 있으면 진짜 낱말로 친다.
// 꼬리를 아무렇게나 이어 붙이면 엉뚱한 낱말이 걸린다(care + er → career).
// 영어 철자 규칙대로 밑말을 먼저 다듬는다.
function stemFor(w, suf, inf) {
  // -y 도 모음 꼬리처럼 앞의 e 를 밀어낸다 (ice → icy, care → cary)
  const vowelSuffix = VOWEL.includes(suf[0]) || suf === 'y';
  if (vowelSuffix) {
    if (w.endsWith('e') && !/(ee|oe|ye)$/.test(w)) return [w.slice(0, -1)];   // make → making
    if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'i'];                  // happy → happiness
    if (inf._dbl && inf._dbl.has(w)) return [w + w.slice(-1)];                // run → runner
    return [w];
  }
  // 자음으로 시작하는 꼬리(-ly, -ness, -ful …)
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'i', w];                 // happy → happily
  return [w];
}
function derived(w, enko, inf, limit, posTags) {
  inf = prep(inf);
  // 활용형은 파생어가 아니므로 미리 빼 둔다. 어떤 꼴을 뺄지는 그 낱말이 실제로 가진
  // 품사로 정한다 — 싸잡아 다 빼면 runner(run 의 파생어)까지 사라지고, 안 빼면
  // brighter(bright 의 비교급)가 파생어인 척 끼어든다.
  const tags = (posTags && posTags.length) ? posTags : ['v', 'n'];
  const seen = new Set([w]);
  for (const t of tags) for (const f of allForms(w, inf, t)) seen.add(f);
  const out = [];
  for (const [suf, hint] of (inf.suffix || [])) {
    for (const base of stemFor(w, suf, inf)) {
      const cand = base + suf;
      if (seen.has(cand) || !enko[cand]) continue;
      seen.add(cand);
      out.push({ w: cand, ko: enko[cand], suf, hint, pos: guessPosBySuffix(suf) });
      break;
    }
    if (out.length >= (limit || 6)) break;
  }
  return out;
}
function guessPosBySuffix(s) {
  if (['er', 'or', 'ing', 'tion', 'ation', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence', 'ist', 'ism', 'ship', 'hood', 'dom'].includes(s)) return 'n';
  if (['ful', 'less', 'y', 'al', 'able', 'ible', 'ous', 'ive'].includes(s)) return 'a';
  if (s === 'ly') return 'r';
  if (['ize', 'en'].includes(s)) return 'v';
  return 'n';
}

// ── 한글 뜻으로 품사 짐작하기 ──
// 내장 사전(enko)에는 품사가 안 붙어 있다. 다행히 한글 뜻은 꼬리에 품사가 드러난다.
//   '달리다' → 동사 · '가벼운' → 형용사 · '빨리' → 부사 · '물' → 명사
// 한국어는 형용사도 '다' 로 끝나(가볍다·예쁘다) 동사와 갈라내기 어렵다. 자주 쓰는
// 형용사는 목록으로 두고, 나머지는 꼬리 모양(-롭다·-스럽다·-있다…)으로 가른다.
const ADJ_KO = new Set(('크다 작다 좋다 나쁘다 예쁘다 이쁘다 가볍다 무겁다 밝다 어둡다 높다 낮다 길다 짧다 ' +
  '넓다 좁다 깊다 얕다 두껍다 얇다 빠르다 느리다 덥다 춥다 뜨겁다 차갑다 시원하다 따뜻하다 ' +
  '맛있다 맛없다 재미있다 재미없다 아름답다 곱다 귀엽다 멋있다 슬프다 기쁘다 즐겁다 아프다 ' +
  '배고프다 목마르다 힘들다 쉽다 어렵다 많다 적다 싸다 비싸다 강하다 약하다 부드럽다 단단하다 ' +
  '거칠다 달다 시다 짜다 맵다 조용하다 시끄럽다 깨끗하다 더럽다 새롭다 낡다 젊다 늙다 같다 다르다 ' +
  '멀다 가깝다 바쁘다 한가하다 행복하다 안전하다 위험하다 중요하다 이상하다 분명하다 친절하다 ' +
  '착하다 똑똑하다 게으르다 용감하다 건강하다 유명하다 편하다 불편하다 궁금하다 신기하다').split(' '));

function classifyKo(gloss) {
  const g = String(gloss || '').trim();
  if (!g) return 'n';
  if (ADJ_KO.has(g)) return 'a';
  if (/(롭다|스럽다|답다|있다|없다)$/.test(g)) return 'a';   // 자유롭다·사랑스럽다·맛있다
  if (/(하다|되다|시키다|짓다|주다|받다|내다|들다|보다|가다|오다|서다|치다|이다)$/.test(g)) return 'v';
  if (/[가-힣]다$/.test(g)) return 'v';                      // 먹다·자다처럼 '다' 로 끝나는 말
  if (/(한|운|은|는|인|로운|스러운|적인|같은|없는|있는)$/.test(g)) return 'a';
  if (/(히|게|이|로|째|껏)$/.test(g) && g.length <= 4) return 'r';
  return 'n';
}

// 짐작한 품사를 못 쓸 때 대신 가 볼 품사. 부사는 형용사와, 동사는 명사와 가깝다.
const NEAR = { r: ['a', 'n', 'v'], a: ['r', 'n', 'v'], v: ['n', 'a', 'r'], n: ['a', 'v', 'r'] };

// 내장 사전의 뜻 뭉치('물; 근해; 광택도')를 품사별로 묶는다.
// posTags 는 data/pos.json 의 'nv' 같은 글자 — 사전이 인정하는 품사 목록이라,
// 한글 꼬리로 짐작한 것과 어긋나면 그쪽을 믿는다.
function groupByPos(gloss, posTags) {
  const parts = String(gloss || '').split(';').map(s => s.trim()).filter(Boolean);
  const allow = new Set((posTags || '').split(''));
  const bag = new Map();
  for (const m of parts) {
    let t = classifyKo(m);
    if (allow.size && !allow.has(t)) {
      // 짐작한 품사를 사전이 인정하지 않으면 가장 가까운 품사로 옮긴다.
      // POS_ORDER 순서(동사 먼저)로 아무거나 집으면 '플레이' 가 동사가 돼 버린다.
      t = (NEAR[t] || []).find(x => allow.has(x)) || POS_ORDER.find(x => allow.has(x)) || t;
    }
    if (!bag.has(t)) bag.set(t, []);
    if (bag.get(t).length < 6) bag.get(t).push(m);
  }
  // 뜻은 하나도 못 얻었는데 품사 표만 있는 경우에도 칸은 보여 준다
  if (!bag.size) for (const t of allow) bag.set(t, []);
  return [...bag.entries()]
    .sort((a, b) => posRank(a[0]) - posRank(b[0]))
    .map(([t, ks]) => ({ t, k: ks.join(', ') }));
}

// ── 예문 고르기 ──
// 초등학생이 읽을 수 있는 문장이 먼저 와야 한다. 점수가 낮을수록 쉬운 문장.
//   · 아는 낱말(초등 필수)로 채워져 있을수록 쉽다
//   · 짧을수록 쉽다 (6~12 낱말이 가장 좋다)
//   · 한글 해석이 붙어 있으면 크게 가산
function easiness(en, ko, lv) {
  const words = String(en || '').toLowerCase().match(/[a-z']+/g) || [];
  if (!words.length) return 999;
  let unknown = 0;
  for (const w of words) {
    if (lv.lv1.has(w)) continue;
    if (lv.lv2.has(w)) { unknown += 0.5; continue; }
    unknown += 1;
  }
  const hardRate = unknown / words.length;
  const n = words.length;
  const lenPenalty = n < 3 ? (3 - n) * 0.6 : n > 12 ? (n - 12) * 0.25 : 0;
  return hardRate * 10 + lenPenalty + (ko ? 0 : 3);
}
// 쉬운 순으로 고르되, 문장이 서로 겹치지 않게 한다.
function pickExamples(list, lv, want) {
  const seen = new Set();
  const scored = [];
  for (const e of (list || [])) {
    const en = (e.en || '').trim();
    const key = en.toLowerCase().replace(/[^a-z ]/g, '');
    if (!en || seen.has(key)) continue;
    seen.add(key);
    scored.push({ en, ko: (e.ko || '').trim(), s: easiness(en, e.ko, lv) });
  }
  scored.sort((a, b) => a.s - b.s);
  return scored.slice(0, want || 5);
}

// ── 구동사 ──
// 내장 숙어 목록에서 '낱말 + 부사/전치사' 꼴만 골라낸다. 'milk run' 같은 건 구동사가 아니다.
// 구동사의 둘째 자리에는 '부사 노릇을 하는 말' 이 온다(run away). 전치사만 오는
// 'decide with resolve' 같은 것은 그냥 동사 + 전치사구라 구동사가 아니다.
const ADVP = new Set(['up', 'down', 'in', 'out', 'on', 'off', 'away', 'back', 'over',
  'through', 'across', 'around', 'along', 'apart', 'aside', 'ahead', 'forward', 'together', 'by']);
// 세 낱말짜리(run out of · put up with)의 마지막 자리에 올 수 있는 전치사
const PREP2 = new Set(['of', 'with', 'to', 'for', 'on', 'from', 'into', 'at', 'in', 'about']);
function phrasalsFrom(word, idioms) {
  const out = [];
  for (const [en, ko] of (idioms[word] || [])) {
    const parts = String(en).toLowerCase().split(/\s+/);
    if (parts[0] !== word || !ADVP.has(parts[1])) continue;
    if (parts.length === 3 && !PREP2.has(parts[2])) continue;
    if (parts.length < 2 || parts.length > 3) continue;
    out.push([en, ko, '']);
  }
  return out;
}
// 손으로 적어 둔 설명(wordinfo.pv)을 먼저, 모자라면 내장 숙어로 채운다.
function phrasals(word, idioms, info, limit) {
  const out = [];
  const seen = new Set();
  for (const row of ((info && info.pv && info.pv[word]) || [])) {
    out.push(row); seen.add(row[0].toLowerCase());
  }
  for (const row of phrasalsFrom(word, idioms || {})) {
    if (seen.has(row[0].toLowerCase())) continue;
    seen.add(row[0].toLowerCase());
    out.push(row);
    if (out.length >= (limit || 8)) break;
  }
  return out.slice(0, limit || 8);
}
// 헷갈리는 짝 — 그 낱말이 들어간 항목만 뽑는다
function confusables(word, info) {
  return ((info && info.mix) || []).filter(m => (m.w || []).includes(word));
}

// ── 퀴즈 ──
// 뜻을 물어보는 사지선다. 오답은 '그럴듯하지만 다른 뜻' 이어야 공부가 된다.
// 그래서 같은 품사끼리 모아 두고 그 안에서 뽑는다.
function shuffle(a, rnd) {
  const r = rnd || Math.random;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// pool: [{w, k, t}] 보기로 쓸 수 있는 낱말들
function makeQuiz(word, senses, pool, count, rnd) {
  const qs = [];
  const usedSense = new Set();
  for (const s of senses) {
    if (qs.length >= (count || 3)) break;
    const answer = s.k;
    if (!answer || usedSense.has(answer)) continue;
    usedSense.add(answer);
    const bad = [];
    const cands = shuffle(pool.filter(p => p.t === s.t && p.k !== answer && p.w !== word), rnd);
    for (const c of cands) {
      if (bad.some(b => b === c.k)) continue;
      bad.push(c.k);
      if (bad.length >= 3) break;
    }
    // 같은 품사만으로 3개를 못 채우면 품사를 가리지 않고 채운다
    if (bad.length < 3) {
      for (const c of shuffle(pool.filter(p => p.k !== answer && !bad.includes(p.k)), rnd)) {
        bad.push(c.k);
        if (bad.length >= 3) break;
      }
    }
    if (bad.length < 3) continue;
    qs.push({
      q: word, pos: s.t,
      choices: shuffle([answer, ...bad], rnd),
      answer,
    });
  }
  return qs;
}

const SDWord = {
  posKo, posRank, POS_ORDER,
  prep, allForms, formTable, derived,
  classifyKo, groupByPos,
  easiness, pickExamples,
  phrasals, confusables,
  makeQuiz, shuffle,
  v3, vIng, vPast, plural, compare,
};

root.SDWord = SDWord;
if (typeof module !== 'undefined' && module.exports) module.exports = SDWord;   // node(빌드 도구)에서도 쓴다

})(typeof globalThis !== 'undefined' ? globalThis : this);
