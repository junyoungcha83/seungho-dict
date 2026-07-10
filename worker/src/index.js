// 승호의사전 예문 프록시 — Tatoeba(영어문장+한국어번역)를 CORS 허용으로 중계.
// 비용 없음(무료 티어). GET /ex?q=WORD → { examples:[{en,ko}] }
const ALLOW = [
  'https://junyoungcha83.github.io',
  'http://localhost:8000','http://localhost:8080','http://localhost:8896','http://127.0.0.1:8000',
];
function cors(req){
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOW.includes(o) ? o : ALLOW[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
export default {
  async fetch(req){
    const url = new URL(req.url);
    const c = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: c });
    if (url.pathname === '/ex') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return new Response(JSON.stringify({ examples: [] }), { headers: { ...c, 'Content-Type':'application/json' } });
      try {
        const r = await fetch(`https://tatoeba.org/en/api_v0/search?from=eng&to=kor&query=${encodeURIComponent(q)}&sort=relevance`, { headers: { 'User-Agent': 'seungho-dict' } });
        const j = await r.json();
        const out = [];
        for (const it of (j.results || [])) {
          const ko = (it.translations || []).flat().find(t => t && t.lang === 'kor');
          if (it.text) out.push({ en: it.text, ko: ko ? ko.text : '' });
          if (out.length >= 3) break;
        }
        return new Response(JSON.stringify({ examples: out }), {
          headers: { ...c, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'public, max-age=604800' } });
      } catch (e) {
        return new Response(JSON.stringify({ examples: [], error: 'upstream' }), { status: 200, headers: { ...c, 'Content-Type':'application/json' } });
      }
    }
    if (url.pathname === '/tr') {
      // 사전에 없는 단어 폴백 번역(MyMemory, 무료). dir=enko|koen
      const q = (url.searchParams.get('q') || '').trim();
      const dir = url.searchParams.get('dir') === 'koen' ? 'koen' : 'enko';
      if (!q) return new Response(JSON.stringify({ text: '' }), { headers: { ...c, 'Content-Type': 'application/json' } });
      const sl = dir === 'koen' ? 'ko' : 'en', tl = dir === 'koen' ? 'en' : 'ko';
      try {
        const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        const text = ((j[0] || []).map(x => x[0]).join('') || '').trim();
        return new Response(JSON.stringify({ text }), {
          headers: { ...c, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=2592000' } });
      } catch (e) {
        return new Response(JSON.stringify({ text: '', error: 'upstream' }), { headers: { ...c, 'Content-Type': 'application/json' } });
      }
    }
    return new Response('seungho-dict-api', { headers: c });
  }
};
