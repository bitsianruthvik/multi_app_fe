/**
 * Builds public/sumangal-v15.html: the Sumangal ERP dashboard V15 (Shaurya's V13 + the rebuild review), without data.
 * The platform page (src/apps/sumangal_dashboard/pages/ErpV15.tsx) shows it in a frame and posts the data to it.
 *
 *   node tools/sumangal-v15/build.mjs
 *
 * Sources here: v13-ui.html (V13 as received, with its embedded data line removed), panes.html (the added tabs),
 * norm.js (applies the history, short customer names and casting weight to the data), ext.js (the added screens,
 * the drill-down drawer, double-click everywhere). The data is built by multi_app_be/apps/sumangal_dashboard/scripts/v15.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const src = rd('v13-ui.html').split('\n');
const chartLines = src.slice(0, 16).join('\n'); // doctype .. Chart.js script
let html = src.slice(16, 132).join('\n'); // style .. trailing <script> opener
let app = src.slice(132).join('\n').replace(/<\/script><\/body><\/html>\s*$/, '');
const panes = rd('panes.html'), norm = rd('norm.js'), colors = rd('colors.js');
let ext = rd('ext.js');
const pat = (a, b, all) => { if (!app.includes(a)) throw new Error('app patch not found: ' + a); app = all ? app.split(a).join(b) : app.replace(a, b); };
const patx = (a, b, all) => { if (!ext.includes(a)) throw new Error('ext patch not found: ' + a); ext = all ? ext.split(a).join(b) : ext.replace(a, b); };
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error('not found: ' + a.slice(0, 80)); return s.replace(a, b); };
const css = `
#drw{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:50;display:none}
#drw .pane2{position:absolute;right:0;top:0;bottom:0;width:min(1240px,100%);background:#fff;overflow:auto;padding:14px 18px;box-shadow:-6px 0 24px rgba(0,0,0,.18)}
.dhead>div{display:flex;gap:6px;justify-content:flex-end}.dhead h2{font-size:16px;margin:4px 0 2px}
.x2{border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px}.x2:disabled{opacity:.4;cursor:default}
.dtools{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:8px 0}.dtools label{display:flex;flex-direction:column;font-size:11px;color:var(--mut);gap:2px}
input.cf{width:100%;min-width:56px;font-size:11px;padding:2px 4px;margin-top:3px;font-weight:400}.srt{cursor:pointer}tr.dr{cursor:pointer}tr.dr:hover td{background:var(--acc2)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}.chip{border:1px solid var(--line);background:var(--acc2);color:var(--acc);border-radius:99px;padding:2px 10px;cursor:pointer;font:inherit;font-size:12px}
.pill{display:inline-block;font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mut)}.pill.bad{color:var(--bad);border-color:var(--bad)}.pill.ok{color:#2e7d32;border-color:#2e7d32}
.fb{display:grid;grid-template-columns:150px 1fr 100px 170px;gap:10px;align-items:center;padding:4px 0;cursor:pointer;font-size:13px}.fb:hover{background:var(--acc2)}
.fb .tr,.tr2{height:14px;background:var(--line);border-radius:4px;overflow:hidden;display:flex}.fb .tr i,.tr2 i{display:block;height:100%;background:var(--acc)}.tr2 i.lt{opacity:.35}
.stale{color:var(--bad)}.kpi.click{cursor:pointer}.kpi.click:hover{border-color:var(--acc)}
.grid2>div{min-width:0}select{max-width:100%}
code{background:#f1f4f7;padding:0 4px;border-radius:4px;font-size:11px}
#v15wait{max-width:640px;margin:80px auto;padding:20px;text-align:center;color:var(--mut);font-size:14px}
body:not(.v15on)>header,body:not(.v15on)>section{display:none}
@media(max-width:700px){.fb{grid-template-columns:110px 1fr 80px}.fb .note{display:none}header{padding:10px 12px}main{padding:12px}.filters{padding:8px 12px}}
`;
// The platform's look (shared/ui/tokens.css): the page posts its current token values (light or dark) to the frame;
// the values after the commas are the light ones, used until the first message. The app's menu replaces the
// frame's header, home cards and tabs.
const platformCss = `
:root{--bg:var(--c-canvas,#F6F7FB);--card:var(--c-surface,#fff);--ink:var(--c-text,#1A1C2E);--mut:var(--c-text-2,#5A5E78);--line:var(--c-border,#E4E6F0);
--acc:var(--c-primary-600,#6D28D9);--acc2:var(--c-primary-50,#F5F1FE);--warn:var(--c-warning-600,#D97706);--warnbg:var(--c-warning-50,#FBF0DD);--bad:var(--c-danger-600,#E11D48);--badbg:var(--c-danger-50,#FCE9EC);
--t3:var(--c-text-3,#8A8EA8);--s2:var(--c-surface-2,#F7F8FD);--s3:var(--c-surface-3,#EFF1F8);--dv:var(--c-divider,#ECEDF5);--rs:var(--r-sm,8px);--rm:var(--r-md,12px);--sh1:var(--e-1,0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06));--sh2:var(--e-2,0 2px 4px rgba(16,24,40,.04),0 6px 16px rgba(16,24,40,.08))}
body{font:13.5px/1.5 var(--font-ui,'Geist',system-ui,-apple-system,'Segoe UI',sans-serif);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
header,#home,#subtabs,.homebtn,.filters,.v15date{display:none!important}
html,body{overflow:hidden;background:transparent!important}body{margin:0}
main .scroll{max-height:none!important;overflow-x:auto;overflow-y:hidden}
.filters label,.row label,.dtools label{font-size:11.5px!important;font-weight:500;color:var(--t3)!important;gap:4px}
select,input{font:inherit;font-size:13px;height:32px;padding:4px 10px;border:1px solid var(--line);border-radius:var(--rs);background:var(--card);color:var(--ink)}
input[type=checkbox]{height:auto;accent-color:var(--acc)}input.cf{height:26px;font-size:11.5px;border-radius:6px}
select:hover,input:hover{border-color:var(--t3)}select:focus,input:focus{outline:2px solid var(--c-focus,#7C3AED);outline-offset:-1px;border-color:transparent}
.seg{border-radius:var(--rs);border-color:var(--line);height:32px}.seg button{font:inherit;font-size:13px;background:var(--card);color:var(--mut);padding:0 12px}.seg button.on{background:var(--acc2);color:var(--c-primary-700,#5B21B6);font-weight:600}
main{padding:0 0 8px;max-width:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--rm);box-shadow:var(--sh1);padding:16px 18px;margin-bottom:16px}
.card h2{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.005em;margin:0 0 4px}.card .note,.note{color:var(--t3);font-size:12.5px;line-height:1.55}
table{font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink)}th,td{border-bottom:1px solid var(--dv);padding:7px 10px}
th{font-size:11.5px;font-weight:600;color:var(--t3);background:var(--s2);box-shadow:0 1px 0 var(--line)}
.scroll{border:1px solid var(--line);border-radius:var(--rs)}.scroll th:first-child,.scroll td:first-child{background:var(--card);box-shadow:1px 0 0 var(--line)}.scroll th:first-child{background:var(--s2)}
tr.tot td{background:var(--s3)!important;font-weight:600}td.click:hover,tr.dr:hover td,.fb:hover{background:var(--acc2)}
.h1{background:rgba(2,132,199,.07)}.h2{background:rgba(2,132,199,.15)}.h3{background:rgba(217,119,6,.13)}.h4{background:rgba(217,119,6,.24)}.h5{background:rgba(225,29,72,.18)}
.kpis{gap:12px}.kpi{border:1px solid var(--line);border-radius:var(--rs);background:var(--s2);padding:10px 14px}.kpi .v{font-size:20px;font-weight:600;letter-spacing:-.01em}.kpi .m{color:var(--t3);font-size:11.5px}
.al{border-radius:var(--rs)}.al.ok{border-left-color:var(--c-success-600,#0E9F6E);background:var(--c-success-50,#E7F6EF)}
.x,.x2,.chip,.ms summary,#drw button,main button:not(.chip):not(.seg button){font:inherit;font-size:13px;border-radius:var(--rs);border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.x2:hover,.x:hover,.ms summary:hover{border-color:var(--t3)}
.chip{background:var(--acc2);color:var(--c-primary-700,#5B21B6);border-color:var(--c-primary-100,#EADDFD);border-radius:99px}
.ms summary{height:32px;display:flex;align-items:center;padding:0 10px}.ms .box{background:var(--card)!important;border:1px solid var(--line)!important;border-radius:var(--rs)!important;box-shadow:var(--sh2)}
#drw{background:rgba(10,12,24,.35);position:absolute!important;bottom:auto!important}#drw .pane2{background:var(--card);color:var(--ink);box-shadow:var(--sh2)}
code{background:var(--s3);color:var(--ink)}.pill.ok{color:var(--c-success-600,#0E9F6E);border-color:var(--c-success-600,#0E9F6E)}
.fb .tr,.tr2{background:var(--s3)}.fb .tr i,.tr2 i{background:var(--acc)}
#v15wait{color:var(--t3)}
`;
html = rep(html, '</style>', css + platformCss + '</style>');
html = rep(html, '</head>', '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap"></head>');
html = rep(html, '<body>', '<body><div id="v15wait">Loading the ERP dashboard data…</div>');
html = rep(html, 'prototype (HTML file)', 'double-click any figure for the lines behind it');
html = rep(html, '<p>Where things stand: WIP, ready to dispatch, production, vendors, quality and customers.</p>', '<p>Where things stand: WIP, ready to dispatch, production, vendors, orders &amp; customers, and trace a batch or an order.</p>');
html = rep(html, '<p>Production trends, quality and scrap over time.</p>', '<p>Production and WIP trends, where time goes, vendor performance, capacity, dispatch trends, quality, scrap and insights.</p>');
html = rep(html, '<button data-g="d" data-p="pCust">Customers</button>', '<button data-g="d" data-p="pOrd">Orders &amp; customers</button><button data-g="d" data-p="pTrace">Trace a batch / order</button>');
html = rep(html, '<button data-g="h" data-p="pTrend">Production trend</button><button data-g="h" data-p="pQual">Quality</button><button data-g="h" data-p="pScrap">Scrap</button>',
  '<button data-g="h" data-p="pTrend">Production trend</button><button data-g="h" data-p="pWipT">WIP trend</button><button data-g="h" data-p="pTime">Where time goes</button><button data-g="h" data-p="pVperf">Vendor performance</button><button data-g="h" data-p="pCap">Capacity</button><button data-g="h" data-p="pDisp">Dispatch trends</button><button data-g="h" data-p="pQual">Quality</button><button data-g="h" data-p="pScrap">Scrap</button><button data-g="h" data-p="pIns">Insights</button>');
html = rep(html, 'Click any figure for the batch list.', 'Double-click any figure for the batch list (with WO no., order and heats; double-click a line there to trace it).');
html = rep(html, '<p class="note">Click a vendor for its parts.</p>', '<p class="note">Double-click a vendor for its parts.</p>');
html = rep(html, 'Click a customer for its open order lines.', 'Double-click a customer for its open order lines.');
html = rep(html, '<div class="card" id="detail">', panes + '\n<div class="card" id="detail" style="display:none!important">');
html = rep(html, '</main></section>', '</main></section>\n<div id="drw"><div class="pane2"></div></div>');
html = rep(html, 'Scrap % = scrap ÷ (weight received + scrap).', 'Scrap % = scrap ÷ casting weight received (pieces × the die casting weight). Scrap is metal removed only: rejected pieces are not in it (shown separately below).');
html = html.replace(/<script>\s*$/, '');
pat('for(const it of D.items){if(!passItem(it))continue;const e=it[7];if(it[5]>asof)continue;', 'for(const it of D.items){if(!passItem(it))continue;const e=it[7];if(it[5]>asof)continue;if(it.h&&asof-it.last>180)continue;');
pat('for(const o of D.ord){if(o[2]>asof)continue;', 'for(const o of D.ord){if(o[2]>asof||o.h)continue;');
pat('sk/(rk+sk)', 'sk/rk', 1); pat('o.s/(o.s+o.k)', 'o.s/o.k', 1); pat('s/(s+kk)', 's/kk', 1);
// Customer filter (user, 2026-11-25: "wasn't working properly"). Challans, vendor receipts and scrap carry only the
// part; V13 took the part's customer from the die master, but ~8% of batch items are made for another customer than
// the die's (S.I. orders ANIPL dies, IWG orders DCC CHAKAN dies…), so those customers lost their vendor work and the
// die's customer got it. A part-only line now passes when the chosen customer orders that part (D.pcs, norm.js).
pat("if(F.c!==''&&(ci??p[4])!=+F.c)return false;", "if(F.c!==''&&(ci!=null?ci!=+F.c:!(D.pcs[pi]?D.pcs[pi].has(+F.c):p[4]==+F.c)))return false;");
pat("const pc=P[p][4];if(F.c!==''&&pc!=+F.c)continue;", 'if(!passPart(p,null,null))continue;');
patx("const custOfPart = (p) => (P[p] && P[p][4] >= 0 ? D.cust[P[p][4]] : '');", "const custOfPart = (p) => (D.pcs[p] ? [...D.pcs[p]].map((c) => D.cust[c]).join(', ') : P[p] && P[p][4] >= 0 ? D.cust[P[p][4]] : '');");
// the list offers every customer with batches or order lines, the short name with the full one beside it
pat('for(const it of D.items)cw[it[1]]=(cw[it[1]]||0)+it[6]*it[4];fCust.innerHTML=opt(Object.keys(cw).sort((a,b)=>cw[b]-cw[a]).map(i=>[i,D.cust[i]]));',
  "for(const it of D.items)cw[it[1]]=(cw[it[1]]||0)+it[6]*it[4];for(const o of D.ord)if(o[3]>=0)cw[o[3]]=cw[o[3]]||0;fCust.innerHTML=opt(Object.keys(cw).sort((a,b)=>cw[b]-cw[a]||D.cust[a].localeCompare(D.cust[b])).map(i=>[i,D.cust[i]+(D.custFull[i]&&D.custFull[i]!==D.cust[i]?' · '+D.custFull[i]:'')]));");
// Fixed colours per process, vendor and customer (colors.js): never by position in the chart, so filters don't move them.
pat('borderColor:QCOL[i%8],backgroundColor:QCOL[i%8]', 'borderColor:colOf(s.name),backgroundColor:colOf(s.name)');
pat('const col=TCOL[ci%TCOL.length];const nm=PSTN(i);', 'const nm=PSTN(i);const col=colOf(nm);');
pat('borderColor:TCOL[(i+1)%TCOL.length],backgroundColor:TCOL[(i+1)%TCOL.length]', 'borderColor:colOf(D.vendors[v]),backgroundColor:colOf(D.vendors[v])');
pat("label:D.vendors[c],data:ks.map(k=>{const m=M[c+'|'+k];return m&&m.p?+(100*m.r/m.p).toFixed(2):null}),borderColor:TCOL[i],backgroundColor:TCOL[i]", "label:D.vendors[c],data:ks.map(k=>{const m=M[c+'|'+k];return m&&m.p?+(100*m.r/m.p).toFixed(2):null}),borderColor:colOf(D.vendors[c]),backgroundColor:colOf(D.vendors[c])");
pat("datasets:[{label:PST[sel][0]+' ('+uL()+')',data:vals,backgroundColor:'#5b9bd5'}]", "datasets:[{label:PST[sel][0]+' ('+uL()+')',data:vals,backgroundColor:colOf(PSTN(sel))}]");
patx("borderColor: TCOL[i % TCOL.length], backgroundColor: TCOL[i % TCOL.length] + '33'", "borderColor: colOf(STG[s.k]), backgroundColor: colOf(STG[s.k]) + '33'");
patx("backgroundColor: TCOL[i % TCOL.length] + 'aa'", "backgroundColor: colOf(D.vendors[o.v]) + 'aa'");
patx("label: D.cust[o.c], data: o.per.map(Math.round), backgroundColor: TCOL[i % TCOL.length]", "label: D.cust[o.c], data: o.per.map(Math.round), backgroundColor: colOf(D.cust[o.c])");
pat("),borderColor:'#333',borderDash:[6,5]", "),borderColor:INK(),borderDash:[6,5]");
patx("borderColor: '#333', borderDash: [6, 4]", "borderColor: INK(), borderDash: [6, 4]");
for (const [n, c] of [['norm', norm], ['app', app], ['ext', ext], ['colors', colors]]) if (/<\/script/i.test(c)) throw new Error(`${n} contains </script`);
const boot = `<script>
${colors}
</script>
<script>
(function () {
  var wait = document.getElementById('v15wait'), booted = false, want = null, quiet = 0, tm = 0;
  var post = function (m) { if (window.parent !== window) window.parent.postMessage(m, location.origin); };
  // the platform's tokens (light or dark) as CSS variables, and the charts' text and grid colours to match
  function theme(m) {
    var r = document.documentElement.style; for (var k in m.vars) if (m.vars[k]) r.setProperty(k, m.vars[k]);
    document.documentElement.setAttribute('data-theme', m.dark ? 'dark' : 'light'); chartTheme();
  }
  function chartTheme() {
    if (!window.Chart) return;
    var cs = getComputedStyle(document.documentElement), v = function (n, d) { return cs.getPropertyValue(n).trim() || d; };
    var txt = v('--c-text-2', '#5A5E78'), grid = v('--c-chart-grid', '#ECEDF5'), font = v('--font-ui', '');
    Chart.defaults.color = txt; Chart.defaults.borderColor = grid; Chart.defaults.font.size = 12; if (font) Chart.defaults.font.family = font;
    try {
      Object.values(charts).forEach(function (c) {
        var sc = c.options.scales || {};
        Object.keys(sc).forEach(function (k) { var x = sc[k]; if (x.ticks) x.ticks.color = txt; if (x.grid) x.grid.color = grid; if (x.title) x.title.color = txt; });
        var lg = c.options.plugins && c.options.plugins.legend; if (lg && lg.labels) lg.labels.color = txt;
        c.update('none');
      });
    } catch (e) { /* no charts yet */ }
  }
  // the app's menu picks the screen; the frame has no tabs of its own
  function show(p) {
    if (!booted) { want = p; return; }
    if (curPane() === p) return;
    quiet++; try { openTab(p); } finally { quiet--; }
  }
  function boot(p) {
    if (window.__V15) return; window.__V15 = p;
    try {
      ['v15norm', 'v15app', 'v15ext'].forEach(function (id) { var s = document.createElement('script'); s.text = (id === 'v15norm' ? 'const D=window.__V15.D,S=window.__V15.S,H=window.__V15.H;\\n' : '') + document.getElementById(id).textContent; document.body.appendChild(s); });
      document.body.classList.add('v15on'); if (wait) wait.remove();
      chartTheme();
      quiet++; try { go('dashv'); } finally { quiet--; }
      booted = true; show(want || 'pWip');
      // the screens' own date boxes are set from the page's one period
      PAIRS.forEach(function (p) { [p[0], p[1]].forEach(function (id) { var el = document.getElementById(id), l = el && el.closest('label'); if (l) l.classList.add('v15date'); }); });
      var opts = function (id) { return [].map.call(document.getElementById(id).options, function (o) { return [o.value, o.text]; }); };
      post({ type: 'sumangal-v15-options', options: { cust: opts('fCust'), types: opts('fType'), metals: opts('fMet'), end: D.end } });
      if (wantF) filters(wantF);
      // a screen opened from inside (a drill-down to Trace) tells the menu
      document.querySelectorAll('#subtabs button').forEach(function (b) {
        b.addEventListener('click', function () { if (quiet) return; clearTimeout(tm); tm = setTimeout(function () { post({ type: 'sumangal-v15-pane-changed', pane: curPane() }); }, 30); });
      });
    } catch (e) { if (wait) wait.textContent = 'The dashboard could not start: ' + e.message; }
  }
  // the page's filter bar: customer, order type, metal, kg / pieces, age range, and one period for every dated screen
  var PAIRS = [['pFrom', 'pTo'], ['tFrom', 'tTo'], ['qFrom', 'qTo'], ['sFrom', 'sTo'], ['funFrom', 'funTo', 'FUN'], ['wtFrom', 'wtTo', 'WT'],
    ['tgFrom', 'tgTo', 'TG'], ['vpFrom', 'vpTo', 'VP'], ['cpFrom', 'cpTo', 'CP'], ['dtFrom', 'dtTo', 'DT']];
  var wantF = null, range = '';
  var global = function (n) { try { return eval(n); } catch (e) { return null; } };
  function filters(f) {
    if (!booted) { wantF = f; return; }
    var ch = function (id, v) { var el = document.getElementById(id); if (el && el.value !== v) { el.value = v; el.dispatchEvent(new Event('change')); } };
    ch('fCust', f.c || ''); ch('fType', f.t || ''); ch('fMet', f.m || '');
    var ub = document.querySelector('#fUnit button[data-u="' + f.u + '"]'); if (ub && !ub.classList.contains('on')) ub.click();
    var a = document.getElementById('aMin'), b = document.getElementById('aMax');
    if (a.value !== (f.amin || '') || b.value !== (f.amax || '')) { a.value = f.amin || ''; b.value = f.amax || ''; a.dispatchEvent(new Event('change')); }
    if (f.from && f.to && f.from + f.to !== range) {
      range = f.from + f.to;
      PAIRS.forEach(function (p) {
        var x = document.getElementById(p[0]), y = document.getElementById(p[1]); if (x) x.value = f.from; if (y) y.value = f.to;
        var o = p[2] && global(p[2]); if (o) { o.from = toDay(f.from); o.to = toDay(f.to); }
      });
      quiet++;
      try { renderProd(); var c = curPane(); if (c === 'pQual') renderQual(); else if (c === 'pTrend') renderTrend(); else if (c === 'pScrap') renderScrap(); else extRefresh(); } finally { quiet--; }
    }
  }
  // one scroll: the frame is as tall as its content, and the drill-down panel opens over the part on screen
  var drw = function () { return document.getElementById('drw'); }, view = { top: 0, h: 600 };
  function place() { var d = drw(); if (d) { d.style.top = view.top + 'px'; d.style.height = view.h + 'px'; } }
  var lastH = 0;
  function height() { var h = Math.ceil(document.body.getBoundingClientRect().height); if (h !== lastH) { lastH = h; post({ type: 'sumangal-v15-height', h: h }); } }
  if (window.ResizeObserver) new ResizeObserver(height).observe(document.body);
  window.addEventListener('load', height);
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'sumangal-v15-data') boot(e.data.payload);
    else if (e.data.type === 'sumangal-v15-theme') theme(e.data);
    else if (e.data.type === 'sumangal-v15-pane') show(e.data.pane);
    else if (e.data.type === 'sumangal-v15-filters') filters(e.data.filters);
    else if (e.data.type === 'sumangal-v15-viewport') { view = { top: e.data.top, h: e.data.h }; place(); }
  });
  if (window.parent === window && wait) wait.textContent = 'Open this from the Sumangal dashboard in the platform.';
})();
</script>`;
const out = `${chartLines}\n${html}\n<script type="text/plain" id="v15norm">\n${norm}\n</script>\n<script type="text/plain" id="v15app">\n${app}\n</script>\n<script type="text/plain" id="v15ext">\n${ext}\n</script>\n${boot}\n</body></html>\n`;
const dest = path.join(here, '..', '..', 'public', 'sumangal-v15.html');
fs.writeFileSync(dest, out);
console.log('written', dest, out.length);
