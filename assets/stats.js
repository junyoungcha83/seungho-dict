/* 검색 통계 — 첫 화면 아래 1/3 에 주간 검색 추이를 그린다.
 *
 *  선  = 그 주의 검색 건수(합계)
 *  점 라벨 = 그 주의 하루 평균 (합계 ÷ 지난 날 수)
 *
 * 계열이 하나뿐이라 범례 없이 제목이 계열을 밝힌다.
 * 숫자·글자는 먹색 토큰으로, 색은 선과 점에만 쓴다.
 */
(function () {
  const KEY = 'sd:searchlog';
  const KEEP_DAYS = 140;              // 20주치만 남긴다
  const INK = '#0f172a', MUTED = '#64748b', LINE = '#1d4ed8', GRID = '#dbe3ec';

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const read = () => {
    try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  // 월요일이 첫날인 주의 시작일
  function weekStart(d) {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function log() {
    const o = read(), today = new Date(), k = dayKey(today);
    o[k] = (o[k] || 0) + 1;
    const cut = new Date(today); cut.setDate(cut.getDate() - KEEP_DAYS);
    for (const key of Object.keys(o)) { const d = new Date(key); if (isNaN(d) || d < cut) delete o[key]; }
    write(o);
    render();
  }

  // 최근 n주. 이번 주는 아직 안 지난 날을 평균에서 빼야 값이 왜곡되지 않는다.
  function buildWeeks(n) {
    const o = read(), today = new Date(); today.setHours(0, 0, 0, 0);
    const cur = weekStart(today), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(cur); start.setDate(start.getDate() - i * 7);
      let total = 0, days = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(day.getDate() + d);
        if (day > today) break;
        days++; total += o[dayKey(day)] || 0;
      }
      days = days || 1;
      out.push({ start, total, days, avg: total / days });
    }
    return out;
  }

  const niceMax = (v) => {
    if (v <= 5) return 5;
    const step = v <= 20 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : 50;
    return Math.ceil(v / step) * step;
  };

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  }

  function draw() {
    const host = document.getElementById('statsChart');
    if (!host) return;
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    if (w < 40 || h < 40) return;

    const n = w < 330 ? 6 : 8;
    const data = buildWeeks(n);
    const grand = data.reduce((s, d) => s + d.total, 0);

    const sum = document.getElementById('statsSum');
    if (sum) {
      const wkAvg = grand / data.length;
      sum.textContent = grand ? `최근 ${n}주 ${grand}건 · 주평균 ${wkAvg.toFixed(1)}건` : '';
    }

    if (!grand) {
      host.innerHTML = '<p class="stats-none">검색하면 여기에 주간 추이가 쌓입니다.</p>';
      return;
    }

    const ml = 12, mr = 12, mt = 24, mb = 18;
    const iw = w - ml - mr, ih = h - mt - mb;
    const max = niceMax(Math.max(...data.map((d) => d.total)));
    const x = (i) => ml + (data.length === 1 ? iw / 2 : (iw * i) / (data.length - 1));
    const y = (v) => mt + ih - (ih * v) / max;

    const pts = data.map((d, i) => [x(i), y(d.total)]);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${path} L${pts[pts.length - 1][0].toFixed(1)} ${(mt + ih).toFixed(1)} L${pts[0][0].toFixed(1)} ${(mt + ih).toFixed(1)} Z`;

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

    host.innerHTML =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
            aria-label="최근 ${n}주 주간 검색 건수 추이. 합계 ${grand}건.">
        <defs>
          <linearGradient id="sdFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${LINE}" stop-opacity=".16"/>
            <stop offset="1" stop-color="${LINE}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${ml}" y1="${mt}" x2="${w - mr}" y2="${mt}" stroke="${GRID}" stroke-width="1"/>
        <line x1="${ml}" y1="${mt + ih}" x2="${w - mr}" y2="${mt + ih}" stroke="${GRID}" stroke-width="1"/>
        <path d="${area}" fill="url(#sdFill)"/>
        <path d="${path}" fill="none" stroke="${LINE}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
        ${data.map((d, i) => {
          const [cx, cy] = pts[i];
          const label = d.avg.toFixed(1);
          const lx = Math.min(Math.max(cx, ml + 12), w - mr - 12);
          return `<g>
            <title>${esc(md(d.start))} 주 · ${d.total}건 · 하루 평균 ${label}건</title>
            <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5"
                    fill="${LINE}" stroke="#fff" stroke-width="2"/>
            <text x="${lx.toFixed(1)}" y="${(cy - 10).toFixed(1)}" text-anchor="middle"
                  font-size="10" font-weight="700" fill="${INK}"
                  stroke="#fff" stroke-width="3" paint-order="stroke"
                  stroke-linejoin="round">${label}</text>
            <text x="${cx.toFixed(1)}" y="${(mt + ih + 13).toFixed(1)}" text-anchor="middle"
                  font-size="9" fill="${MUTED}">${md(d.start)}</text>
          </g>`;
        }).join('')}
      </svg>`;
  }

  // 검색 결과가 떠 있으면 통계를 감춘다 — 첫 화면(빈 상태)에서만 보인다.
  function syncVisible() {
    const empty = !!document.getElementById('empty');
    document.body.classList.toggle('is-empty', empty);
    if (empty) render();
  }

  function init() {
    const host = document.getElementById('statsChart');
    const result = document.getElementById('result');
    if (result) new MutationObserver(syncVisible).observe(result, { childList: true, subtree: true });
    if (host && window.ResizeObserver) new ResizeObserver(render).observe(host);
    addEventListener('resize', render);
    syncVisible();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();

  window.SDStats = { log, render };
})();
