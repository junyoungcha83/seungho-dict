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
// ── 국립국어원 XML 파싱 ──
// 워커에는 DOMParser 가 없다. 구조가 단순해(item > sense > translation) 정규식으로 충분하다.
function xmlAll(xml, tag){
  const out = [], re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m; while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function xmlOne(xml, tag){ const a = xmlAll(xml, tag); return a.length ? a[0] : ''; }
function unxml(s){
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')                       // 뜻풀이에 섞여 오는 태그 제거
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')                        // & 는 마지막 — 먼저 풀면 이중 해제된다
    .replace(/\s+/g, ' ').trim();
}
function parseKrdict(xml){
  return xmlAll(xml, 'item').map(it => {
    const senses = xmlAll(it, 'sense').map(s => ({
      def:   unxml(xmlOne(s, 'definition')),
      en:    unxml(xmlOne(s, 'trans_word')),
      enDef: unxml(xmlOne(s, 'trans_dfn')),
    })).filter(s => s.def || s.en);
    return { word: unxml(xmlOne(it, 'word')), pos: unxml(xmlOne(it, 'pos')), senses };
  }).filter(i => i.word && i.senses.length);
}

export default {
  async fetch(req, env){
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
    if (url.pathname === '/kr') {
      // 국립국어원 한국어기초사전 — 한국어 표제어의 뜻풀이 + 영어 대역.
      // 인증키는 브라우저에 두면 안 되므로(앱이 공개돼 있다) 여기서만 붙인다.
      // 하루 5만 건. 응답은 XML 이라 여기서 JSON 으로 바꿔 보낸다.
      const q = (url.searchParams.get('q') || '').trim();
      const jres = (body, extra) => new Response(JSON.stringify(body), {
        headers: { ...c, 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) } });
      if (!q) return jres({ items: [] });
      if (!env || !env.KRDICT_KEY) return jres({ items: [], error: 'no_key' });

      const call = async (method) => {
        const api = 'https://krdict.korean.go.kr/api/search'
          + `?key=${encodeURIComponent(env.KRDICT_KEY)}`
          + `&q=${encodeURIComponent(q)}`
          + `&part=word&sort=dict&num=10&translated=y&trans_lang=1&method=${method}`;
        const r = await fetch(api);
        if (!r.ok) throw new Error('upstream ' + r.status);
        return await r.text();
      };

      try {
        let xml = await call('exact');
        let items = parseKrdict(xml);
        // 정확히 일치하는 표제어가 없으면 앞부분이 같은 말이라도 찾아 준다
        if (!items.length && !/<error/i.test(xml)) items = parseKrdict(await call('start'));
        const err = (xml.match(/<error_code>([^<]*)<\/error_code>/i) || [])[1] || '';
        if (!items.length && err) return jres({ items: [], error: 'krdict_' + err });
        return jres({ items }, { 'Cache-Control': 'public, max-age=2592000' });
      } catch (e) {
        return jres({ items: [], error: 'upstream' });
      }
    }
    return new Response('seungho-dict-api', { headers: c });
  }
};
