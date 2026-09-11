// tools/gloss-src/*.json (손으로 적는 짧은 뜻) → data/gloss.json 하나로 합친다.
// 내장 사전(kengdic)은 흔한 낱말일수록 뜻이 엉뚱해서('i → 알파벳 9번째의 문자')
// 필수영단어 목록에 그대로 쓸 수 없다. 여기 적어 둔 뜻이 그 자리를 대신한다.
//   실행: node tools/build-gloss.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const srcDir = path.join(dir, 'gloss-src');

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
const out = Object.create(null);
const errs = [];
const owner = Object.create(null);

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8')); }
  catch (e) { errs.push(`${f}: JSON 을 읽지 못했다 — ${e.message}`); continue; }
  for (const [w, ko] of Object.entries(j)) {
    if (w.startsWith('_')) continue;                     // 메모용 키
    if (owner[w]) { errs.push(`${f}: '${w}' 가 ${owner[w]} 에도 있다`); continue; }
    owner[w] = f;
    if (!/^[a-z][a-z'.\- ]*$/.test(w)) errs.push(`${f}: 표제어 '${w}' — 소문자 영어만 쓴다`);
    if (!ko || !/[가-힣]/.test(ko)) { errs.push(`${f}: '${w}' 의 뜻이 비었다`); continue; }
    out[w] = ko;
  }
}

if (errs.length) {
  console.error('✗ 고칠 곳 ' + errs.length + '군데\n' + errs.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}

const dst = path.join(root, 'data', 'gloss.json');
fs.writeFileSync(dst, JSON.stringify(out));
console.log(`✓ data/gloss.json — 뜻 ${Object.keys(out).length}개 · ${(fs.statSync(dst).size / 1024).toFixed(1)}KB`);

// 필수영단어 목록에서 아직 뜻이 없는 낱말을 알려 준다. core.json 에 있는 낱말은
// 그쪽의 품사별 뜻을 쓰므로 여기 없어도 된다.
const level = JSON.parse(fs.readFileSync(path.join(root, 'data', 'level.json'), 'utf8'));
const core = JSON.parse(fs.readFileSync(path.join(root, 'data', 'core.json'), 'utf8'));
for (const [name, key] of [['초등', 'lv1'], ['중등 이상', 'lv2']]) {
  const miss = String(level[key] || '').split(/\s+/).filter(w => w && !out[w] && !core[w]);
  console.log(miss.length
    ? `  ※ ${name}: 아직 뜻이 없는 낱말 ${miss.length}개 — ${miss.slice(0, 12).join(' ')}${miss.length > 12 ? ' …' : ''}`
    : `  ✓ ${name}: 모든 낱말에 뜻이 있다`);
}
