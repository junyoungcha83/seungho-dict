// tools/core-src/*.json (사람이 손으로 채우는 낱말 묶음) → data/core.json 하나로 합친다.
// 손으로 쓰는 파일이라 형식이 틀리기 쉽다. 합치기 전에 규칙을 검사해서 틀린 곳을 짚어 준다.
//   실행: node tools/build-core.mjs
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const srcDir = path.join(dir, 'core-src');
// 앱이 쓰는 활용형 계산기를 그대로 가져다 쓴다 — 검사 기준이 앱과 어긋나면 안 된다
const SDWord = createRequire(import.meta.url)(path.join(root, 'assets', 'word.js'));
const inflect = JSON.parse(fs.readFileSync(path.join(root, 'data', 'inflect.json'), 'utf8'));

// 쓸 수 있는 품사 표시. 화면에 붙는 한글 이름은 assets/word.js 가 갖고 있다.
const POS = new Set(['v', 'n', 'a', 'r', 'prep', 'conj', 'pron', 'int', 'det', 'aux', 'num']);
const MIN_EX = 3;                 // 품사마다 예문을 최소 3개 (요구사항)

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
const out = Object.create(null);
const errs = [];
const owner = Object.create(null);   // 낱말 → 처음 나온 파일. 두 파일에 겹쳐 적히는 것을 막는다.

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8')); }
  catch (e) { errs.push(`${f}: JSON 을 읽지 못했다 — ${e.message}`); continue; }

  for (const [w, ent] of Object.entries(j)) {
    if (w.startsWith('_')) continue;                       // 메모용 키는 건너뛴다
    if (owner[w]) { errs.push(`${f}: '${w}' 가 ${owner[w]} 에도 있다 (한 낱말은 한 곳에만)`); continue; }
    owner[w] = f;
    if (!/^[a-z][a-z'-]*$/.test(w)) errs.push(`${f}: 표제어 '${w}' — 소문자 영어만 쓴다`);
    if (!Array.isArray(ent.p) || !ent.p.length) { errs.push(`${f}: '${w}' 에 품사(p) 가 없다`); continue; }

    for (const [i, s] of ent.p.entries()) {
      const at = `${f}: ${w}[${i}]`;
      if (!POS.has(s.t)) errs.push(`${at} — 모르는 품사 '${s.t}'`);
      if (!s.k || !/[가-힣]/.test(s.k)) errs.push(`${at} — 한글 뜻(k) 이 비었다`);
      if (!Array.isArray(s.e) || s.e.length < MIN_EX) {
        errs.push(`${at} — 예문이 ${(s.e || []).length}개 (최소 ${MIN_EX}개)`);
      }
      for (const [ei, ex] of (s.e || []).entries()) {
        if (!Array.isArray(ex) || ex.length !== 2) { errs.push(`${at} 예문${ei} — [영어, 한글] 두 개여야 한다`); continue; }
        const [en, ko] = ex;
        if (!/[a-zA-Z]/.test(en)) errs.push(`${at} 예문${ei} — 영어 문장이 비었다`);
        if (!/[가-힣]/.test(ko)) errs.push(`${at} 예문${ei} — 한글 해석이 비었다`);
        // 예문은 그 낱말이 들어가야 뜻이 보인다. went·made 같은 불규칙 활용형도
        // 그 낱말로 쳐 주려고 앱과 같은 활용형 계산기로 모든 꼴을 만들어 견준다.
        const forms = SDWord.allForms(w, inflect, s.t);
        const inSentence = (en.toLowerCase().match(/[a-z']+/g) || []);
        if (!forms.some(f => inSentence.includes(f))) {
          errs.push(`${at} 예문${ei} — '${w}' 가 문장에 안 보인다(${forms.join('/')}): ${en}`);
        }
      }
    }
    out[w] = ent;
  }
}

if (errs.length) {
  console.error('✗ 고칠 곳 ' + errs.length + '군데\n' + errs.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}

const dst = path.join(root, 'data', 'core.json');
fs.writeFileSync(dst, JSON.stringify(out));
const words = Object.keys(out);
const senses = words.reduce((n, w) => n + out[w].p.length, 0);
const exs = words.reduce((n, w) => n + out[w].p.reduce((m, s) => m + s.e.length, 0), 0);
console.log(`✓ data/core.json — 낱말 ${words.length} · 품사별 뜻 ${senses} · 예문 ${exs} · ${(fs.statSync(dst).size / 1024).toFixed(1)}KB`);
