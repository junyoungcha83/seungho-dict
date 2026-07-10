// 무료 데이터셋 → 앱용 JSON. 흔한 뜻 우선 정렬 + 미/영 발음 분리.
//  입력: kengdic.tsv, ipa_en_us.txt, ipa_en_uk.txt, freq_en.txt
//  출력: data/{koen,enko,ipa_us,ipa_uk,idioms}.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const HANGUL = /[가-힣]/;
const PURE_KO = /^[가-힣 ]+$/;
const ART = /^(to |a |an |the )/;
function normGloss(g) {
  let s = String(g || '').toLowerCase().trim();
  s = s.replace(/^["'“”‘’(]+|["'“”‘’).,;:!?]+$/g, '').trim();
  s = s.replace(ART, '').trim().replace(/\s+/g, ' ');
  return s;
}
const isAlphaWord = w => /^[a-z][a-z'’-]*$/.test(w);
const firstWord = s => String(s).split(' ')[0];

// ── 영어 빈도 순위(낮을수록 흔함) ──
const rank = new Map();
read('freq_en.txt').split('\n').forEach((ln, i) => { const w = ln.split(' ')[0]; if (w && !rank.has(w)) rank.set(w, i); });
const rankOf = w => (rank.has(w) ? rank.get(w) : 1e9);

// ── kengdic 1차 수집 ──
const koGloss = Object.create(null);   // 한글 → Set(정규화 영어뜻)
const enKo = Object.create(null);      // 영어단어 → Set(한글)
const idiomIdx = Object.create(null);  // 영어단어 → [[구,한글]]
const addSet = (o, k, v) => { if (!k || !v) return; (o[k] = o[k] || new Set()).add(v); };

for (const line of read('kengdic.tsv').split('\n').slice(1)) {
  const c = line.split('\t');
  const ko = (c[1] || '').trim();
  const gloss = (c[3] || '').trim();
  if (!ko || !gloss || !HANGUL.test(ko)) continue;
  const ng = normGloss(gloss);
  if (!ng) continue;
  addSet(koGloss, ko, ng);
  const words = ng.split(' ');
  if (words.length === 1 && isAlphaWord(ng)) {
    addSet(enKo, ng, ko);
  } else if (words.length >= 2 && words.length <= 3 && words.every(isAlphaWord)) {
    for (const w of words) {
      if (w.length < 2) continue;
      const L = (idiomIdx[w] = idiomIdx[w] || []);
      if (L.length < 10 && !L.some(x => x[0] === ng)) L.push([ng, ko]);
    }
  }
}

// ── koen: 각 한글의 영어뜻을 '흔한 영어' 우선 정렬 ──
const glossSortKey = g => {
  const w = firstWord(g), n = g.split(' ').length;
  const r = rankOf(w);
  return [n > 1 ? 1 : 0, r === 1e9 ? 1 : 0, r];   // 단일어 우선 → 빈도표 존재 우선 → 순위
};
const koenSorted = Object.create(null);
for (const ko of Object.keys(koGloss)) {
  koenSorted[ko] = [...koGloss[ko]].sort((a, b) => {
    const ka = glossSortKey(a), kb = glossSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.length - b.length;
  });
}

// ── enko: 각 영어단어의 한글뜻을 '대표성' 점수로 정렬 ──
function koScore(ko, en) {
  let s = 0;
  const gs = koGloss[ko];
  if (gs && gs.has(en)) s += 100;                       // 상호 일치(양방향에 존재)
  if (koenSorted[ko] && koenSorted[ko][0] === en) s += 60; // en 이 이 한글의 대표(가장 흔한) 뜻
  if (!/\s/.test(ko)) s += 20;                          // 단일어
  if (PURE_KO.test(ko)) s += 15;                        // 순수 한글
  s -= ko.length;                                       // 짧을수록
  return s;
}
const enkoOut = Object.create(null);
for (const en of Object.keys(enKo)) {
  const arr = [...enKo[en]].sort((a, b) => koScore(b, en) - koScore(a, en)).slice(0, 6);
  enkoOut[en] = arr.join('; ');
}
const koenOut = Object.create(null);
for (const ko of Object.keys(koenSorted)) koenOut[ko] = koenSorted[ko].slice(0, 6).join('; ');

// ── IPA (미국/영국) ──
function parseIpa(file) {
  const o = Object.create(null);
  for (const ln of read(file).split('\n')) {
    const t = ln.split('\t'); if (t.length < 2) continue;
    const w = t[0].trim().toLowerCase(); const p = (t[1].split(',')[0] || '').trim();
    if (w && p && !o[w]) o[w] = p;
  }
  return o;
}
const ipaUs = parseIpa('ipa_en_us.txt');
const ipaUk = parseIpa('ipa_en_uk.txt');

const w = (name, obj) => {
  const p = path.join(root, 'data', name);
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log(name, '→', Object.keys(obj).length, '항목,', (fs.statSync(p).size / 1e6).toFixed(2), 'MB');
};
w('koen.json', koenOut);
w('enko.json', enkoOut);
w('ipa_us.json', ipaUs);
w('ipa_uk.json', ipaUk);
w('idioms.json', idiomIdx);
console.log('완료');
