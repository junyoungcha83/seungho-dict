// 무료 데이터셋(kengdic 한-영, ipa-dict 발음)을 앱용 JSON 으로 가공.
//  입력: scripts/kengdic.tsv, scripts/ipa_en_us.txt
//  출력: data/enko.json, data/koen.json, data/ipa.json, data/idioms.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

const HANGUL = /[가-힣]/;
const ART = /^(to |a |an |the )/;
function normGloss(g) {
  let s = String(g || '').toLowerCase().trim();
  s = s.replace(/^["'“”‘’(]+|["'“”‘’).,;:!?]+$/g, '').trim();
  s = s.replace(ART, '').trim();
  s = s.replace(/\s+/g, ' ');
  return s;
}
const isAlphaWord = w => /^[a-z][a-z'’-]*$/.test(w);
const isAlphaPhrase = s => s.split(' ').every(isAlphaWord);

// ── kengdic 파싱 ──
const koen = Object.create(null);   // 한글 → Set(영어뜻)
const enko = Object.create(null);   // 영어단어 → Set(한글뜻)
const idiomIdx = Object.create(null); // 영어단어 → [[구, 한글]] (2~3단어 숙어/표현)

const add = (obj, k, v, cap = 8) => {
  if (!k || !v) return;
  (obj[k] = obj[k] || new Set());
  if (obj[k].size < cap) obj[k].add(v);
};

const lines = fs.readFileSync(path.join(dir, 'kengdic.tsv'), 'utf8').split('\n');
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split('\t');
  const surface = (c[1] || '').trim();
  const gloss = (c[3] || '').trim();
  if (!surface || !gloss || !HANGUL.test(surface)) continue;
  const ng = normGloss(gloss);
  if (!ng) continue;
  // 한→영 (읽기 좋은 형태로 저장)
  add(koen, surface, ng);
  const words = ng.split(' ');
  if (words.length === 1 && isAlphaWord(ng)) {
    add(enko, ng, surface);                    // 영→한 (단일 단어)
  } else if (words.length >= 2 && words.length <= 3 && isAlphaPhrase(ng)) {
    for (const w of words) {                   // 숙어/표현 인덱스
      if (w.length < 2) continue;
      (idiomIdx[w] = idiomIdx[w] || []);
      if (idiomIdx[w].length < 8 && !idiomIdx[w].some(x => x[0] === ng)) idiomIdx[w].push([ng, surface]);
    }
  }
}

// ── ipa-dict 파싱 ──
const ipa = Object.create(null);
const ipaLines = fs.readFileSync(path.join(dir, 'ipa_en_us.txt'), 'utf8').split('\n');
for (const ln of ipaLines) {
  const t = ln.split('\t');
  if (t.length < 2) continue;
  const w = t[0].trim().toLowerCase();
  const p = (t[1].split(',')[0] || '').trim();   // 첫 발음만
  if (w && p && !ipa[w]) ipa[w] = p;
}

// ── Set → 정렬된 배열(문자열) 로 직렬화 ──
const flatten = obj => {
  const out = Object.create(null);
  for (const k of Object.keys(obj)) out[k] = [...obj[k]].join('; ');
  return out;
};
const koenO = flatten(koen);
const enkoO = flatten(enko);

const w = (name, obj) => {
  const p = path.join(root, 'data', name);
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log(name, '→', Object.keys(obj).length, '항목,', (fs.statSync(p).size / 1e6).toFixed(2), 'MB');
};
w('koen.json', koenO);
w('enko.json', enkoO);
w('ipa.json', ipa);
w('idioms.json', idiomIdx);
console.log('완료');
