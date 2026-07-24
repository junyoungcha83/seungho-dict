// 자주 쓰는 영단어 중 사전에 없는 것들을 무료 구글 번역으로 미리 채워 enko.json 에 내장(오프라인 확장).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

const freq = fs.readFileSync(path.join(dir, 'freq_en.txt'), 'utf8').split('\n');
const enkoPath = path.join(root, 'data', 'enko.json');
const enko = JSON.parse(fs.readFileSync(enkoPath, 'utf8'));

const LIMIT = Number(process.argv[2] || 10000);
const targets = [];
const seen = new Set();
for (const ln of freq) {
  const w = (ln.split(' ')[0] || '').trim();
  if (/^[a-z]{2,}$/.test(w) && !enko[w] && !seen.has(w)) { seen.add(w); targets.push(w); }
  if (targets.length >= LIMIT) break;
}
console.log('대상(사전 미수록 빈출어):', targets.length);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const added = Object.create(null);
let done = 0, fail = 0;
for (let i = 0; i < targets.length; i += 60) {
  const batch = targets.slice(i, i + 60);
  const q = batch.join('\n');
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    for (const c of (j[0] || [])) {
      const orig = (c[1] || '').trim().toLowerCase();
      const tr = (c[0] || '').trim();
      if (orig && tr && tr.toLowerCase() !== orig && /[가-힣]/.test(tr)) added[orig] = tr;
    }
    done += batch.length;
  } catch (e) { fail += batch.length; }
  if (i % 1200 === 0) console.log('진행', i, '/', targets.length, '· 수집', Object.keys(added).length);
  await sleep(120);
}
let n = 0;
for (const w of Object.keys(added)) { if (!enko[w]) { enko[w] = added[w]; n++; } }
fs.writeFileSync(enkoPath, JSON.stringify(enko));
console.log('완료 · 추가된 단어:', n, '· 실패배치단어:', fail, '· enko 총:', Object.keys(enko).length,
  '·', (fs.statSync(enkoPath).size / 1e6).toFixed(2), 'MB');
