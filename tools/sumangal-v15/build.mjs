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
const panes = rd('panes.html'), ext = rd('ext.js'), norm = rd('norm.js');
const pat = (a, b, all) => { if (!app.includes(a)) throw new Error('app patch not found: ' + a); app = all ? app.split(a).join(b) : app.replace(a, b); };
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
html = rep(html, '</style>', css + '</style>');
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
for (const [n, c] of [['norm', norm], ['app', app], ['ext', ext]]) if (/<\/script/i.test(c)) throw new Error(`${n} contains </script`);
const boot = `<script>
(function () {
  var wait = document.getElementById('v15wait');
  function boot(p) {
    if (window.__V15) return; window.__V15 = p;
    try {
      ['v15norm', 'v15app', 'v15ext'].forEach(function (id) { var s = document.createElement('script'); s.text = (id === 'v15norm' ? 'const D=window.__V15.D,S=window.__V15.S,H=window.__V15.H;\\n' : '') + document.getElementById(id).textContent; document.body.appendChild(s); });
      document.body.classList.add('v15on'); if (wait) wait.remove();
    } catch (e) { if (wait) wait.textContent = 'The dashboard could not start: ' + e.message; }
  }
  window.addEventListener('message', function (e) { if (e.origin !== location.origin || !e.data || e.data.type !== 'sumangal-v15-data') return; boot(e.data.payload); });
  if (window.parent === window && wait) wait.textContent = 'Open this from the Sumangal dashboard in the platform (ERP dashboard).';
})();
</script>`;
const out = `${chartLines}\n${html}\n<script type="text/plain" id="v15norm">\n${norm}\n</script>\n<script type="text/plain" id="v15app">\n${app}\n</script>\n<script type="text/plain" id="v15ext">\n${ext}\n</script>\n${boot}\n</body></html>\n`;
const dest = path.join(here, '..', '..', 'public', 'sumangal-v15.html');
fs.writeFileSync(dest, out);
console.log('written', dest, out.length);
