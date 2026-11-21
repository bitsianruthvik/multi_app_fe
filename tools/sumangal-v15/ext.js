// ===================== Merged dashboard additions (on top of V13) =====================
// Uses V13 globals: D, P, STG, BK, val, uL, nf, fmtD, toDay, toStr, END, passItem, passPart, bucket, inR, RL, wipAt, mk, multiSel,
// periodKey, periodLab, PST, PSTN, prodDaily, TCOL, wipRows, outRows, venOpen, rfdRows, F, U, asofEl, aMinEl, aMaxEl.
// S = supplement: it[i]=[WO no, heats, batch type, ord index, WO type]; plan[j]; man[]; heats[].
const ITX = new Map(D.items.map((x, i) => [x, i]));
const ORDX = new Map(D.ord.map((o, i) => [o[0], i]));
const isWed = (d) => new Date(D0 + d * 864e5).getUTCDay() === 3;
const workDays = (a, b) => { let n = 0; for (let d = a; d <= b; d++) if (!isWed(d)) n++; return Math.max(1, n); };
const wmed = (arr, q = 0.5) => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x[0] - y[0]); const t = s.reduce((a, x) => a + x[1], 0); let c = 0; for (const [v, w] of s) { c += w; if (c >= t * q) return v; } return s[s.length - 1][0]; };
const wavg = (arr) => { const t = arr.reduce((a, x) => a + x[1], 0); return t ? arr.reduce((a, x) => a + x[0] * x[1], 0) / t : null; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const partLab = (p) => (P[p] ? P[p][0] + ' ' + P[p][1] : '');
const custOfPart = (p) => (P[p] && P[p][4] >= 0 ? D.cust[P[p][4]] : '');
const store = { get(k, d) { try { const v = localStorage.getItem('sum_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sum_' + k, JSON.stringify(v)); } catch (e) {} } };
const SET = { pour: store.get('pour', 2250), win: store.get('win', 60) };
const itemFacts = (i) => { const s = S.it[i] || []; const o = s[3] >= 0 ? D.ord[s[3]] : null; return { wo: s[0] || '', heats: s[1] || '', bt: s[2], ord: o ? o[1] : (s[4] === 2 ? 'manual WO' : s[4] === 3 ? 'test bars' : ''), del: o ? o[8] : null, oi: s[3] }; };
const ITEMS_BY_ORD = (() => { const m = new Map(); D.items.forEach((it, i) => { const j = S.it[i][3]; if (j >= 0) (m.get(j) || m.set(j, []).get(j)).push(i); }); return m; })();

// ===================== Drill table (drawer) =====================
// showTable(title, note, head, rows, opt): rows are arrays. opt.link(row) -> called on row double-click. Columns whose values are numbers are summed.
const DR = { stack: [] };
function drawerHtml() {
  const t = DR.cur; if (!t) return '';
  const textCols = t.head.map((h, i) => i).filter((i) => t.rows.some((r) => typeof r[i] === 'string' && r[i] !== ''));
  const ageI = t.head.findIndex((h) => /^(Age|Days|Age \(days\)|Days late|Days overdue|Wait \(days\))/.test(h));
  return `<div class="dhead"><div><button class="x2" id="dBack" ${DR.stack.length ? '' : 'disabled'}>← Back</button><button class="x2" id="dClose">Close ✕</button></div>
  <h2 id="dT">${esc(t.title)}</h2><p class="note">${esc(t.note || '')}</p>
  <div class="dtools"><label>Search<input id="dQ" placeholder="any column" value="${esc(t.q || '')}"></label>
  <label>Group by<select id="dG"><option value="">— none (all lines) —</option>${textCols.map((i) => `<option value="${i}" ${t.g == i ? 'selected' : ''}>${esc(t.head[i])}</option>`).join('')}</select></label>
  ${ageI >= 0 ? `<label>${esc(t.head[ageI])} from<span><input id="dA1" type="number" value="${t.a1 ?? ''}" style="width:70px"> – <input id="dA2" type="number" value="${t.a2 ?? ''}" style="width:70px"></span></label>` : ''}
  <button class="x2" id="dCsv">Download CSV</button><span class="note" style="margin:0">Double-click a row to drill in. Type in a column box to filter it (e.g. <code>&gt;100</code>, <code>10-20</code>, text).</span></div>
  <div class="kpis" id="dK"></div><div class="scroll" style="max-height:68vh"><table id="dX"></table></div>`;
}
function filteredRows() {
  const t = DR.cur; const ageI = t.head.findIndex((h) => /^(Age|Days|Age \(days\)|Days late|Days overdue|Wait \(days\))/.test(h));
  const q = (t.q || '').toLowerCase();
  return t.rows.filter((r) => {
    if (q && !r.some((x) => String(x ?? '').toLowerCase().includes(q))) return false;
    if (ageI >= 0) { const v = +r[ageI]; if (t.a1 != null && t.a1 !== '' && !(v >= +t.a1)) return false; if (t.a2 != null && t.a2 !== '' && !(v <= +t.a2)) return false; }
    for (const [i, f] of Object.entries(t.cf || {})) {
      if (!f) continue; const x = r[i];
      const m = /^\s*([<>]=?)\s*(-?[\d.]+)\s*$/.exec(f), rg = /^\s*(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*$/.exec(f);
      if (m && typeof x === 'number') { const n = +m[2]; if (!(m[1] === '>' ? x > n : m[1] === '>=' ? x >= n : m[1] === '<' ? x < n : x <= n)) return false; }
      else if (rg && typeof x === 'number') { if (x < +rg[1] || x > +rg[2]) return false; }
      else if (!String(x ?? '').toLowerCase().includes(f.toLowerCase())) return false;
    }
    return true;
  });
}
function renderDrawer(keepFocus) {
  const t = DR.cur; const rs0 = filteredRows();
  const numI = t.head.map((h, i) => i).filter((i) => t.rows.length && t.rows.every((r) => r[i] == null || r[i] === '' || typeof r[i] === 'number') && t.rows.some((r) => typeof r[i] === 'number'));
  const sumI = numI.filter((i) => !/Age|Days|%|per|rate|median|average|Wait/i.test(t.head[i]));
  let rs = rs0, head = t.head, grouped = false;
  if (t.g !== '' && t.g != null) {
    grouped = true; const g = +t.g; const m = new Map();
    for (const r of rs0) { const k = r[g] ?? ''; const o = m.get(k) || m.set(k, { k, n: 0, s: sumI.map(() => 0), mx: null }).get(k); o.n++; sumI.forEach((i, j) => (o.s[j] += +r[i] || 0)); }
    head = [t.head[g], 'Lines', ...sumI.map((i) => t.head[i])];
    rs = [...m.values()].sort((a, b) => (b.s[0] ?? b.n) - (a.s[0] ?? a.n)).map((o) => [o.k, o.n, ...o.s.map((x) => Math.round(x * 10) / 10)]);
  }
  if (t.sort != null) { const i = t.sort, d = t.dir || -1; rs = rs.slice().sort((a, b) => { const x = a[i], y = b[i]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * d; }); }
  t.shown = rs; t.shownGrouped = grouped;
  const sums = sumI.map((i) => rs0.reduce((a, r) => a + (+r[i] || 0), 0));
  document.getElementById('dK').innerHTML = `<div class="kpi"><div class="v">${nf(rs0.length)}</div><div class="m">lines${rs0.length !== t.rows.length ? ' (of ' + nf(t.rows.length) + ')' : ''}</div></div>` + sumI.slice(0, 4).map((i, j) => `<div class="kpi"><div class="v">${nf(sums[j])}</div><div class="m">${esc(t.head[i])}</div></div>`).join('');
  const isNum = (i) => (grouped ? i > 0 : numI.includes(i));
  const fmtc = (x, i) => (typeof x === 'number' ? (Number.isInteger(x) || Math.abs(x) >= 100 ? nf(x) : x.toLocaleString('en-IN', { maximumFractionDigits: 2 })) : esc(x ?? ''));
  let h = '<tr data-s="1">' + head.map((x, i) => `<th class="${isNum(i) ? 'n' : 'l'}"><span class="srt" data-i="${i}">${esc(x)}${t.sort === i ? (t.dir > 0 ? ' ▲' : ' ▼') : ''}</span>${grouped ? '' : `<br><input class="cf" data-i="${i}" value="${esc((t.cf || {})[i] || '')}" placeholder="filter">`}</th>`).join('') + '</tr>';
  h += rs.slice(0, 3000).map((r, ri) => `<tr data-r="${ri}" class="dr">` + r.map((x, i) => `<td class="${isNum(i) ? 'n' : 'l'}">${fmtc(x, i)}</td>`).join('') + '</tr>').join('');
  if (!grouped) h += `<tr class="tot"><td>Total (${nf(rs0.length)}${rs.length > 3000 ? ', first 3,000 shown' : ''})</td>${head.slice(1).map((_, j) => { const i = j + 1; const k = sumI.indexOf(i); return `<td class="n">${k >= 0 ? nf(sums[k]) : ''}</td>`; }).join('')}</tr>`;
  const X = document.getElementById('dX'); X.innerHTML = h;
  X.querySelectorAll('.srt').forEach((s) => (s.onclick = () => { const i = +s.dataset.i; if (t.sort === i) t.dir = -(t.dir || -1); else { t.sort = i; t.dir = isNum(i) ? -1 : 1; } renderDrawer(); }));
  X.querySelectorAll('.cf').forEach((inp) => (inp.oninput = () => { t.cf = t.cf || {}; t.cf[inp.dataset.i] = inp.value; renderDrawer(inp.dataset.i); }));
  if (keepFocus != null) { const el = X.querySelector(`.cf[data-i="${keepFocus}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  X.querySelectorAll('tr.dr').forEach((tr) => (tr.ondblclick = () => {
    const r = t.shown[+tr.dataset.r];
    if (t.shownGrouped) { const g = +t.g; const sub = t.rows.filter((x) => (x[g] ?? '') === r[0]); pushTable({ ...t, title: t.title + ' · ' + r[0], rows: sub, g: '', q: '', cf: {}, sort: null }); return; }
    if (t.link) { const src = t.rows.indexOf(r) >= 0 ? r : r; t.link(src); }
  }));
}
function wireDrawer() {
  const t = DR.cur;
  document.getElementById('dClose').onclick = hideDetail;
  document.getElementById('dBack').onclick = () => { if (DR.stack.length) { DR.cur = DR.stack.pop(); openDrawer(); } };
  document.getElementById('dQ').oninput = (e) => { t.q = e.target.value; renderDrawer(); };
  document.getElementById('dG').onchange = (e) => { t.g = e.target.value; t.sort = null; renderDrawer(); };
  const a1 = document.getElementById('dA1'), a2 = document.getElementById('dA2');
  if (a1) { a1.oninput = () => { t.a1 = a1.value; renderDrawer(); }; a2.oninput = () => { t.a2 = a2.value; renderDrawer(); }; }
  document.getElementById('dCsv').onclick = () => {
    const rs = t.shownGrouped ? t.shown : filteredRows(); const hd = t.shownGrouped ? [t.head[+t.g], 'Lines'] : t.head;
    const csv = [hd, ...rs].map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = (t.title || 'table').replace(/[^\w]+/g, '_').slice(0, 60) + '.csv'; a.click();
  };
}
function openDrawer() { const el = document.getElementById('drw'); el.querySelector('.pane2').innerHTML = drawerHtml(); el.style.display = 'block'; wireDrawer(); renderDrawer(); }
function pushTable(t) { if (DR.cur && document.getElementById('drw').style.display === 'block') DR.stack.push(DR.cur); DR.cur = t; openDrawer(); }
const LAB = new Map(D.parts.map((p, i) => [p[0] + ' ' + p[1], i]));
function splitPart(head, rows) { const i = head.indexOf('Part'); if (i < 0) return [head, rows]; const h = [...head.slice(0, i), 'Die no.', 'Part no.', 'Part', ...head.slice(i + 1)];
  return [h, rows.map((x) => { const pi = LAB.get(x[i]); const a = pi != null ? [D.parts[pi][0], D.dwg[pi] || '', D.parts[pi][1]] : ['', '', x[i]]; return [...x.slice(0, i), ...a, ...x.slice(i + 1)]; })]; }
showTable = function (title, note, head, rows, opt = {}) { [head, rows] = splitPart(head, rows); const open = document.getElementById('drw').style.display === 'block'; if (!opt.keep && !open) DR.stack = []; pushTable({ title, note, head, rows, link: opt.link, g: '', cf: {}, sort: null, a1: '', a2: '' }); };
hideDetail = function () { const el = document.getElementById('drw'); if (el) el.style.display = 'none'; DR.stack = []; DR.cur = null; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideDetail(); });
document.getElementById('drw').addEventListener('click', (e) => { if (e.target.id === 'drw') hideDetail(); });

// Batch-item lists (WIP etc.) gain WO no., order, heats and a link to Trace
showItems = function (title, note, rows) {
  showTable(title, note, ['Batch item / WO / Order', 'WO no.', 'Order', 'Customer', 'Part', 'Metal type', 'Order type', 'Stage', 'Since', 'Flag', 'Age (days)', 'Pieces', 'kg', 'Heats'],
    rows.map((r) => { const i = ITX.get(r.it); const f = i != null ? itemFacts(i) : { wo: r.k === 7 ? r.it[0] : '', ord: r.k === 8 ? r.it[0] : '', heats: '' }; const p = P[r.it[2]]; return [r.it[0], f.wo, f.ord, D.cust[r.it[1]], p[0] + ' ' + p[1], D.metals[r.it[3]], D.types[r.it[8]] ?? '', STG[r.k].split(' – ')[1] || STG[r.k], fmtD(r.since), r.stale ? 'Stale' : '', r.age, r.pcs, Math.round(r.kg), f.heats]; }),
    { link: (row) => traceAny(row[0]) });
};

// Double-click instead of click: move inline onclick handlers of table cells to ondblclick
function splitDom(root) { root.querySelectorAll('table').forEach((tb) => { if (tb.id === 'dX') return; const hr = tb.rows[0]; if (!hr) return; const ths = [...hr.cells]; const i = ths.findIndex((th) => th.textContent.replace(/ [▲▼]$/, '').trim() === 'Part' && !th.dataset.sp); if (i < 0) return;
  const th = ths[i]; th.dataset.sp = 1; const nt = document.createElement('th'); nt.textContent = 'Die no.'; nt.className = 'l'; nt.dataset.sp = 1; hr.insertBefore(nt, th);
  for (let r = 1; r < tb.rows.length; r++) { const row = tb.rows[r]; const c = row.cells[i]; if (!c) continue; if (c.colSpan > 1) { c.colSpan++; continue; } const td = document.createElement('td'); td.className = 'l'; if (!row.classList.contains('tot')) { const pi = LAB.get(c.textContent.trim()); if (pi != null) { td.textContent = D.parts[pi][0]; c.textContent = D.parts[pi][1]; } } row.insertBefore(td, c); } }); }
function toDbl(root) { splitDom(root); root.querySelectorAll('td[onclick]').forEach((td) => { td.setAttribute('ondblclick', td.getAttribute('onclick')); td.removeAttribute('onclick'); td.title = 'Double-click for the lines behind this figure'; }); }
new MutationObserver(() => toDbl(document.body)).observe(document.body, { childList: true, subtree: true });
// Double-click on rows of V13 tables that had no drill
const DBL = {};
document.addEventListener('dblclick', (e) => {
  const td = e.target.closest('td'); if (!td || td.hasAttribute('ondblclick')) return; const tb = td.closest('table'); if (!tb || !DBL[tb.id]) return;
  const tr = td.closest('tr'); if (tr.classList.contains('tot')) return; DBL[tb.id](tr.cells[0].textContent.trim(), td.cellIndex, tr, tb);
});
DBL.prodTab = (stage) => { const i = PST.findIndex((x) => x[0].trim() === stage.trim()); if (i < 0) return; stageEntries(i, toDay(pFrom.value), toDay(pTo.value)); };
DBL.trendTab = (stage) => { const i = PST.findIndex((x, j) => PSTN(j) === stage); if (i < 0) return; stageEntries(i, toDay(tFrom.value), toDay(tTo.value)); };
function stageEntries(i, a, b) {
  const [nm, s] = PST[i]; const rows = [];
  if (s >= 0) D.items.forEach((it, ix) => { if (!passItem(it)) return; for (const r of it[7][s]) if (r[0] >= a && r[0] <= b) rows.push([it[0], S.it[ix][0], D.cust[it[1]], partLab(it[2]), fmtD(r[0]), r[1], r[2] ?? r[1], Math.round(r[1] * it[4]), s === 5 ? (r[3] ? 'HT vendor' : 'in-house') : '']); });
  else if (s === -2) D.items.forEach((it, ix) => { if (!passItem(it)) return; for (const r of it[7][5]) if (r[3] && r[0] >= a && r[0] <= b) rows.push([it[0], S.it[ix][0], D.cust[it[1]], partLab(it[2]), fmtD(r[0]), r[1], r[1], Math.round(r[1] * it[4]), 'HT vendor']); });
  else if (s === -1) for (const r of D.disp) { if (r[0] < a || r[0] > b || !passPart(r[2], r[1], r[3], r[7])) continue; const o = D.ord[ORDX.get(r[6])]; rows.push([o ? o[1] : '', '', D.cust[r[1]], partLab(r[2]), fmtD(r[0]), r[4], r[4], Math.round(r[5]), 'dispatch']); }
  else for (const r of D.rcv) { if (r[0] < a || r[0] > b || !passPart(r[3], null, null)) continue; if (PROCG(D.procs[r[2]]) !== s) continue; rows.push([D.vendors[r[1]], '', custOfPart(r[3]), partLab(r[3]), fmtD(r[0]), r[4], r[4] - r[5], Math.round(r[6]), D.procs[r[2]]]); }
  showTable(nm.trim() + ' · ' + fmtD(a) + ' – ' + fmtD(b), 'Every entry in the range', ['Batch item / order / vendor', 'WO no.', 'Customer', 'Part', 'Date', 'Pieces', 'Good', 'kg', 'Note'], rows, { link: (r) => traceAny(r[0]) });
}
const qRej = () => { const a = toDay(qFrom.value), b = toDay(qTo.value); return D.rej.filter((r) => r[0] >= a && r[0] <= b && (!QS || QS.has(r[1])) && (!QR || QR.has(RKEY[r[2]])) && passItem(D.items[r[3]])); };
const rejRows = (rs) => rs.map((r) => { const it = D.items[r[3]]; return [it[0], S.it[r[3]][0], D.cust[it[1]], partLab(it[2]), D.rstg[r[1]], D.rsn[r[2]], D.rdep[r[2]] || '', fmtD(r[0]), r[4], Math.round(r[4] * it[4]), S.it[r[3]][1]]; });
const REJH = ['Batch item', 'WO no.', 'Customer', 'Part', 'Caught at', 'Reason', 'Responsible dept', 'Date', 'Pieces', 'kg', 'Heats'];
DBL.qParts = (lab) => { const rs = qRej().filter((r) => String(P[D.items[r[3]][2]][0]) === lab); showTable('Rejections · die ' + lab, '', REJH, rejRows(rs), { link: (r) => traceAny(r[0]) }); };
DBL.qMatrix = (stage, ci, tr, tb) => { const dep = ci > 0 ? tb.rows[0].cells[ci].textContent.replace(/ [▲▼]$/, '') : null; const rs = qRej().filter((r) => D.rstg[r[1]] === stage && (!dep || dep === 'Total' || (D.rdep[r[2]] || 'Not set') === dep)); showTable(`Caught at ${stage}${dep && dep !== 'Total' ? ' · caused by ' + dep : ''}`, '', REJH, rejRows(rs), { link: (r) => traceAny(r[0]) }); };
DBL.qWorse = (reason) => { const rs = qRej().filter((r) => D.rsn[r[2]] === reason); showTable('Rejections · ' + reason, '', REJH, rejRows(rs), { link: (r) => traceAny(r[0]) }); };
DBL.qCust = (d, ci, tr) => { const c = [...tr.cells].map((x) => x.textContent); showTable('Customer rejection · ' + c[2], c[6] || '', ['Date', 'Customer', 'Part', 'Heat', 'Pieces', 'kg', 'Reason'], [[c[0], c[1], c[2], c[3], +c[4].replace(/,/g, ''), +c[5].replace(/,/g, ''), c[6]]]); };
DBL.sPart = (lab, ci, tr) => { const p = lab.split(' ')[0]; const rows = scrRows.filter((r) => P[r.p][0] === p).map((r) => [D.vendors[r.ven], D.procs[r.pr], partLab(r.p), fmtD(r.d), r.pcs, Math.round(r.kg), r.scr]); showTable('Scrap lines · ' + lab, '', ['Vendor', 'Process', 'Part', 'Received', 'Pieces', 'kg', 'Scrap kg'], rows); };
DBL.sFet = (ven) => { const a = toDay(sFrom.value), b = toDay(sTo.value); const rows = D.rcv.filter((r) => r[0] >= a && r[0] <= b && D.vendors[r[1]] === ven && D.procs[r[2]].startsWith('Contract fettling')).map((r) => [D.vendors[r[1]], partLab(r[3]), custOfPart(r[3]), fmtD(r[0]), r[4], r[5], Math.round(r[6])]); showTable('Contract fettling · ' + ven, '', ['Contractor', 'Part', 'Customer', 'Returned', 'Pieces', 'Rejected', 'kg'], rows); };

// ===================== Trace (batch item / order / WO) =====================
const NO_IX = new Map(D.items.map((it, i) => [String(it[0]).toUpperCase(), i]));
function traceAny(key) {
  key = String(key || '').trim(); if (!key) return; hideDetail(); TRQ = key; openTab('pTrace');
}
let TRQ = '';
const EN = [['Injection', 9], ['Wax assembly', 1], ['Coating', 2], ['De-waxing', 3], ['Melting (poured)', 4], ['Knock-out', 10], ['Heat treatment', 5], ['Final inspection (QC)', 6], ['Machining inspection', 8], ['Cleared for dispatch', 7]];
const RSTG_OF_E = { 9: 0, 1: 1, 2: 2, 3: 3, 4: 4, 10: 5, 6: 6, 8: 7 };
function itemNow(it, asof) { const out = []; // same logic as V13 wipAt, for one item
  const e = it[7]; let last = it[5], started = false; for (const s of e) for (const r of s) if (r[0] <= asof) { started = true; if (r[0] > last) last = r[0]; }
  if (it[5] <= asof && !started) out.push({ k: 9, pcs: it[6], age: asof - it[5] });
  else if (it[5] <= asof) for (let k = 0; k < 7; k++) { const arr = k == 0 ? [[it[5], it[6]]] : e[k].map((r) => [r[0], r[2]]); let con = 0; for (const r of e[k + 1]) if (r[0] <= asof) con += r[1]; if (k == 6) for (const r of e[8]) if (r[0] <= asof) con += r[1] - r[2]; if (k == 0) for (const r of e[11]) if (r[0] <= asof) con += r[1]; if (k == 4) for (const r of e[10]) if (r[0] <= asof) con += r[1] - r[2];
    for (const [d, n] of arr) { if (d > asof) continue; const t = Math.min(n, con); con -= t; if (n - t > 0) out.push({ k, pcs: n - t, age: asof - d }); } }
  return { out, idle: asof - last }; }
function renderTrace() {
  const box = document.getElementById('trOut'); const q = document.getElementById('trQ'); if (TRQ && q.value !== TRQ) q.value = TRQ;
  const key = (q.value || '').trim().toUpperCase(); const asof = toDay(asofEl.value);
  if (!key) { box.innerHTML = '<p class="note">Type a batch item (e.g. 249/24-25/1/A), an order number (e.g. 506/25-26) or a WO number.</p>'; return; }
  if (NO_IX.has(key)) { box.innerHTML = traceItem(NO_IX.get(key), asof); wireTrace(box); return; }
  const ords = D.ord.map((o, j) => [o, j]).filter(([o]) => String(o[1]).toUpperCase() === key);
  const woItems = D.items.map((it, i) => i).filter((i) => String(S.it[i][0]).toUpperCase() === key);
  if (ords.length) { box.innerHTML = traceOrder(ords, asof); wireTrace(box); return; }
  if (woItems.length) { box.innerHTML = `<div class="card"><h2>WO ${esc(key)}</h2><p class="note">${woItems.length} batch items</p>${itemsTable(woItems, asof)}</div>`; wireTrace(box); return; }
  const m = D.items.map((it, i) => i).filter((i) => String(D.items[i][0]).toUpperCase().includes(key) || String(S.it[i][0]).toUpperCase().includes(key)).slice(0, 60);
  const mo = D.ord.filter((o) => String(o[1]).toUpperCase().includes(key)).slice(0, 30);
  box.innerHTML = `<div class="card"><h2>Matches</h2>${mo.length ? '<p class="note">Orders</p><div class="chips">' + [...new Set(mo.map((o) => o[1]))].map((n) => `<button class="chip" data-tr="${esc(n)}">${esc(n)}</button>`).join('') + '</div>' : ''}${m.length ? '<p class="note">Batch items</p><div class="chips">' + m.map((i) => `<button class="chip" data-tr="${esc(D.items[i][0])}">${esc(D.items[i][0])}</button>`).join('') + '</div>' : ''}${!m.length && !mo.length ? '<p class="note">Nothing found.</p>' : ''}</div>`;
  wireTrace(box);
}
function wireTrace(box) { box.querySelectorAll('[data-tr]').forEach((b) => (b.ondblclick = b.onclick = () => { TRQ = b.dataset.tr; document.getElementById('trQ').value = TRQ; renderTrace(); })); }
function itemsTable(idx, asof) {
  return `<div class="scroll"><table><tr data-s="1"><th class="l">Batch item</th><th class="l">WO no.</th><th class="l">Part</th><th class="l">Batched</th><th>Pieces</th><th>Rejected</th><th>Cleared</th><th class="l">Where the rest is now</th><th class="l">Heats</th></tr>` + idx.map((i) => { const it = D.items[i]; const n = itemNow(it, asof); const rj = D.rej.reduce((a, r) => a + (r[3] === i && r[0] <= asof ? r[4] : 0), 0); const cl = it[7][7].reduce((a, r) => a + (r[0] <= asof ? r[2] : 0), 0);
    return `<tr><td class="l"><button class="chip" data-tr="${esc(it[0])}">${esc(it[0])}</button></td><td class="l">${esc(S.it[i][0])}</td><td class="l">${esc(partLab(it[2]))}</td><td class="l">${fmtD(it[5])}</td><td>${nf(it[6])}</td><td>${rj ? nf(rj) : '–'}</td><td>${cl ? nf(cl) : '–'}</td><td class="l">${n.out.length ? n.out.map((x) => `${nf(x.pcs)} · ${esc(STG[x.k])} (${x.age} d)`).join('<br>') : '<span class="note">nothing pending</span>'}${n.out.length && n.idle > 180 ? ' <b class="stale">stale</b>' : ''}</td><td class="l">${esc(S.it[i][1])}</td></tr>`; }).join('') + '</table></div>';
}
function traceItem(i, asof) {
  const it = D.items[i]; const f = itemFacts(i); const e = it[7]; const n = itemNow(it, asof);
  const rows = []; for (const [nm, k] of EN) for (const r of e[k]) { const rs = RSTG_OF_E[k]; const rj = rs == null ? [] : D.rej.filter((x) => x[3] === i && x[1] === rs && x[0] === r[0]); rows.push({ d: r[0], nm: nm + (k === 5 && r[3] ? ' (at vendor)' : ''), k, q: r[1], g: r[2] ?? r[1], rj: rj.reduce((a, x) => a + x[4], 0), why: rj.map((x) => `${nf(x[4])} ${esc(D.rsn[x[2]])}`).join('<br>') }); }
  const ord = EN.map((x) => x[1]); rows.sort((a, b) => a.d - b.d || ord.indexOf(a.k) - ord.indexOf(b.k)); let prev = it[5]; rows.forEach((r) => { r.gap = r.d - prev; prev = Math.max(prev, r.d); });
  // vendor challans for this part while the item was between heat treatment and inspection (by part, indicative)
  const ht = e[5].length ? e[5][0][0] : null, qc = e[6].length ? e[6][e[6].length - 1][0] : asof;
  const ven = ht == null ? [] : D.vend.filter((v) => v[2] === it[2] && v[3] >= ht - 3 && v[3] <= qc);
  return `<div class="card"><h2>Batch item ${esc(it[0])}</h2><p class="note">${esc(D.cust[it[1]])} · ${esc(partLab(it[2]))} · ${esc(D.metals[it[3]])} · ${esc(D.types[it[8]] ?? '')} · ${nf(it[6])} pieces (${nf(it[6] * it[4])} kg) · batched ${fmtD(it[5])} · WO ${esc(f.wo)} · ${f.ord ? 'order ' + `<button class="chip" data-tr="${esc(f.ord)}">${esc(f.ord)}</button>` : 'no order'}${f.del != null ? ' · delivery ' + fmtD(f.del) : ''}${f.heats ? ' · heats ' + esc(f.heats) : ''}</p>
  <div class="kpis">${n.out.length ? n.out.map((x) => `<div class="kpi"><div class="v">${nf(x.pcs)}</div><div class="m">${esc(STG[x.k])} · ${x.age} days</div></div>`).join('') : '<div class="kpi"><div class="v">0</div><div class="m">nothing pending at ' + fmtD(asof) + '</div></div>'}${n.out.length && n.idle > 180 ? '<div class="kpi"><div class="v stale">Stale</div><div class="m">no entry for ' + n.idle + ' days</div></div>' : ''}</div>
  <div class="scroll"><table><tr data-s="1"><th class="l">Date</th><th class="l">Step</th><th>Days since previous entry</th><th>Processed</th><th>Good</th><th>Rejected</th><th class="l">Reason</th></tr>${rows.map((r) => `<tr><td class="l">${fmtD(r.d)}</td><td class="l">${esc(r.nm)}</td><td>${r.gap}</td><td>${nf(r.q)}</td><td>${nf(r.g)}</td><td>${r.rj ? nf(r.rj) : '–'}</td><td class="l">${r.why}</td></tr>`).join('')}</table></div>
  ${ven.length ? `<h3 style="font-size:13px;margin:14px 0 6px">Vendor challans for this part between its heat treatment and final inspection <span class="note">(by part, so they may include other batches)</span></h3><div class="scroll"><table><tr data-s="1"><th class="l">Vendor</th><th class="l">Process</th><th class="l">Sent</th><th>Pieces sent</th><th class="l">Received back</th></tr>${ven.map((v) => `<tr><td class="l">${esc(D.vendors[v[0]])}</td><td class="l">${esc(D.procs[v[1]])}</td><td class="l">${fmtD(v[3])}</td><td>${nf(v[4])}</td><td class="l">${(v[8] || []).map((x) => fmtD(x[0]) + ': ' + nf(x[1])).join(', ') || 'open'}</td></tr>`).join('')}</table></div>` : ''}</div>`;
}
function traceOrder(ords, asof) {
  return ords.map(([o, j]) => { const items = ITEMS_BY_ORD.get(j) || []; const disp = o[11].filter((r) => r[0] <= asof); const dq = disp.reduce((a, r) => a + r[1], 0); const cl = items.reduce((a, i) => a + D.items[i][7][7].reduce((s, r) => s + (r[0] <= asof ? r[2] : 0), 0), 0); const wo = o[10].filter((r) => r[0] <= asof);
    return `<div class="card"><h2>Order ${esc(o[1])} · ${esc(partLab(o[4]))}</h2><p class="note">${esc(D.cust[o[3]])} · ${esc(D.metals[o[5]])} · ${esc(D.types[o[9]] ?? '')} · ordered ${nf(o[6])} on ${fmtD(o[2])} · delivery ${o[8] != null ? fmtD(o[8]) : '–'}</p>
    <div class="kpis"><div class="kpi"><div class="v">${nf(o[6])}</div><div class="m">ordered</div></div><div class="kpi"><div class="v">${nf(S.plan[j])}</div><div class="m">planned</div></div><div class="kpi"><div class="v">${nf(wo.reduce((a, r) => a + r[1], 0))}</div><div class="m">on work orders (${wo.map((r) => fmtD(r[0])).join(', ') || '–'})</div></div><div class="kpi"><div class="v">${nf(items.reduce((a, i) => a + D.items[i][6], 0))}</div><div class="m">batched in ${items.length} items</div></div><div class="kpi"><div class="v">${nf(cl)}</div><div class="m">cleared</div></div><div class="kpi"><div class="v">${nf(dq)}</div><div class="m">dispatched${disp.length ? ' (' + disp.map((r) => fmtD(r[0]) + ': ' + nf(r[1])).join(', ') + ')' : ''}</div></div><div class="kpi"><div class="v ${o[8] != null && o[8] < asof && dq < o[6] ? 'stale' : ''}">${nf(Math.max(0, o[6] - dq))}</div><div class="m">still open${o[8] != null && o[8] < asof && dq < o[6] ? ' · ' + (asof - o[8]) + ' days late' : ''}</div></div></div>
    ${items.length ? itemsTable(items, asof) : '<p class="note">No batch items yet.</p>'}</div>`; }).join('');
}

// ===================== Orders & customers =====================
function ordState(asof) {
  const wipBy = new Map(); for (const r of wipRows) { const i = ITX.get(r.it); if (i == null) continue; const j = S.it[i][3]; if (j < 0) continue; wipBy.set(j, (wipBy.get(j) || 0) + r.pcs); }
  return D.ord.map((o, j) => {
    if (o[2] > asof || o.h) return null; const dq = o[11].reduce((a, r) => a + (r[0] <= asof ? r[1] : 0), 0); const items = ITEMS_BY_ORD.get(j) || [];
    const cl = items.reduce((a, i) => a + D.items[i][7][7].reduce((s, r) => s + (r[0] <= asof ? r[2] : 0), 0), 0);
    const open = Math.max(0, o[6] - dq), ready = Math.max(0, Math.min(cl, o[6]) - dq), wip = wipBy.get(j) || 0, late = open > 0 && o[8] != null && o[8] < asof ? asof - o[8] : 0;
    return { j, o, no: o[1], c: o[3], p: o[4], q: o[6], dq, cl, open, ready, wip, short: Math.max(0, open - ready - wip), late, kg: o[7] };
  }).filter(Boolean);
}
const lineRow = (x) => [x.no, D.cust[x.c], partLab(x.p), D.types[x.o[9]] ?? '', fmtD(x.o[2]), x.o[8] != null ? fmtD(x.o[8]) : '–', x.late, x.q, S.plan[x.j], x.dq, x.open, x.ready, x.wip, x.short, Math.round(x.open * x.kg)];
const LINEH = ['Order', 'Customer', 'Part', 'Order type', 'Ordered on', 'Delivery', 'Days late', 'Ordered', 'Planned', 'Dispatched', 'Open pcs', 'Ready pcs', 'In WIP pcs', 'Short pcs (not in plant)', 'Open kg'];
const linesTable = (title, rows) => showTable(title, 'Open = ordered − dispatched. Ready = cleared (up to the order quantity) − dispatched. Short = open − ready − in WIP: pieces not anywhere in the plant yet. Double-click a line to trace the order.', LINEH, rows.map(lineRow), { link: (r) => traceAny(r[0]) });
let ORDS = [];
function renderOrd() {
  const asof = toDay(asofEl.value); ORDS = ordState(asof).filter((x) => passPart(x.p, x.c, x.o[5], x.o[9]));
  const C = new Map(); const g = (c) => C.get(c) || C.set(c, { c, n: 0, o: 0, od: 0, oc: 0, w: 0, v: 0, r: 0, s: 0, d: 0 }).get(c);
  for (const x of ORDS) { if (x.open <= 0) continue; const y = g(x.c); const vv = (p) => val(p, p * x.kg); y.n++; y.o += vv(x.open); if (x.late) { y.od += vv(x.open); if (inR(x.late)) y.oc += vv(x.open); } y.w += vv(Math.min(x.wip, x.open)); y.r += vv(x.ready); y.s += vv(x.short); }
  for (const r of outRows) { const c = P[r.p][4]; if (c >= 0 && C.has(c)) C.get(c).v += val(r.pcs, r.kg); }
  for (const r of D.disp) if (r[0] <= asof && r[0] > asof - 30 && passPart(r[2], r[1], r[3], r[7]) && C.has(r[1])) C.get(r[1]).d += val(r[4], r[5]);
  const rows = [...C.values()].sort((a, b) => b.o - a.o); const T = { n: 0, o: 0, od: 0, oc: 0, w: 0, v: 0, r: 0, s: 0, d: 0 }; rows.forEach((x) => Object.keys(T).forEach((k) => (T[k] += x[k])));
  const cell = (v, c, k) => `<td class="click ${k === 'od' && v ? 'h5' : ''}" ondblclick="ordDrill(${c},'${k}')">${v ? nf(v) : '–'}</td>`;
  document.getElementById('ordTab').innerHTML = `<tr><th>Customer (${uL()})</th><th>Open lines</th><th>Open orders</th><th>of which overdue</th><th style="background:#eef0ff">Overdue by ${RL()}<br><span style="font-weight:400">(custom)</span></th><th>In WIP (for these lines)</th><th>At vendors<br><span style="font-weight:400">(by part)</span></th><th>Ready to dispatch<br><span style="font-weight:400">(by order line)</span></th><th style="background:#fdecea">Short<br><span style="font-weight:400">(not in plant yet)</span></th><th>Dispatched, last 30 days</th></tr>` +
    rows.map((x) => `<tr><td class="l click" ondblclick="ordDrill(${x.c},'o')">${esc(D.cust[x.c])}</td>${cell(x.n, x.c, 'o')}${['o', 'od', 'oc', 'w', 'v', 'r', 's', 'd'].map((k) => cell(x[k], x.c, k)).join('')}</tr>`).join('') + `<tr class="tot"><td>Total</td>${['n', 'o', 'od', 'oc', 'w', 'v', 'r', 's', 'd'].map((k) => `<td>${nf(T[k])}</td>`).join('')}</tr>`;
  renderFunnel(); renderOpenLines();
}
function ordDrill(c, k) {
  const asof = toDay(asofEl.value);
  if (k === 'v') { const rows = outRows.filter((r) => P[r.p][4] == c); showTable('At vendors · ' + D.cust[c], 'Open challan lines (by part)', ['Vendor', 'Process', 'Part', 'Sent on', 'Age (days)', 'Pieces', 'kg'], rows.map((r) => [D.vendors[r.ven], D.procs[r.pr], partLab(r.p), fmtD(r.d), r.age, r.pcs, Math.round(r.kg)])); return; }
  if (k === 'd') { const rows = D.disp.filter((r) => r[1] == c && r[0] <= asof && r[0] > asof - 30); showTable('Dispatched in the last 30 days · ' + D.cust[c], '', ['Order', 'Part', 'Dispatched on', 'Pieces', 'kg'], rows.map((r) => { const o = D.ord[ORDX.get(r[6])]; return [o ? o[1] : '', partLab(r[2]), fmtD(r[0]), r[4], Math.round(r[5])]; }), { link: (r) => traceAny(r[0]) }); return; }
  if (k === 'w') { const rows = wipRows.filter((r) => { const i = ITX.get(r.it); return i != null && S.it[i][3] >= 0 && D.ord[S.it[i][3]][3] == c; }); showItems('WIP for open order lines · ' + D.cust[c], '', rows); return; }
  const f = { o: (x) => x.open > 0, od: (x) => x.late > 0, oc: (x) => x.late > 0 && inR(x.late), r: (x) => x.ready > 0, s: (x) => x.short > 0 }[k] || ((x) => x.open > 0);
  linesTable({ o: 'Open order lines', od: 'Overdue order lines', oc: 'Overdue by ' + RL(), r: 'Ready to dispatch, by order line', s: 'Short: not in the plant yet' }[k] + ' · ' + D.cust[c], ORDS.filter((x) => x.c == c && f(x)));
}
let FUN = { from: null, to: null };
function renderFunnel() {
  const a = FUN.from ?? END - 364, b = FUN.to ?? END; const el = document.getElementById('funFrom'); if (el && !el.value) { el.value = toStr(a); document.getElementById('funTo').value = toStr(b); }
  const L = D.ord.map((o, j) => [o, j]).filter(([o, j]) => o[2] >= a && o[2] <= b && passPart(o[4], o[3], o[5], o[9]) && (ITEMS_BY_ORD.get(j) || []).length);
  let O = 0, Pl = 0, B = 0, R = 0, Cl = 0, Ds = 0; const rows = [];
  const rejBy = new Map(); for (const r of D.rej) rejBy.set(r[3], (rejBy.get(r[3]) || 0) + r[4]);
  for (const [o, j] of L) { const its = ITEMS_BY_ORD.get(j); const kg = o[7]; const v = (p) => val(p, p * kg); const bq = its.reduce((s, i) => s + D.items[i][6], 0), rq = its.reduce((s, i) => s + (rejBy.get(i) || 0), 0), cq = its.reduce((s, i) => s + D.items[i][7][7].reduce((t, r) => t + r[2], 0), 0), dq = o[11].reduce((s, r) => s + r[1], 0);
    O += v(o[6]); Pl += v(S.plan[j]); B += v(bq); R += v(rq); Cl += v(cq); Ds += v(dq); rows.push([o[1], D.cust[o[3]], partLab(o[4]), fmtD(o[2]), o[6], S.plan[j], o[6] ? Math.round((S.plan[j] / o[6] - 1) * 1000) / 10 : 0, bq, rq, bq ? Math.round(rq / bq * 1000) / 10 : 0, cq, dq, Math.max(0, dq - o[6]), Math.max(0, cq - dq)]); }
  const mx = Math.max(O, Pl, B, 1); const H = ['Order', 'Customer', 'Part', 'Ordered on', 'Ordered', 'Planned', 'Planned over order %', 'Batched', 'Rejected', 'Rejected % of batched', 'Cleared', 'Dispatched', 'Dispatched beyond order', 'Cleared, not dispatched'];
  window._FUN = { rows, H };
  const bar = (l, v, c, i) => `<div class="fb" ondblclick="funDrill(${i})" title="Double-click for the order lines"><span>${l}</span><div class="tr"><i style="width:${(v / mx * 100).toFixed(1)}%;background:${c}"></i></div><b>${nf(v)}</b><span class="note">${i ? ((v / O - 1) * 100 >= 0 && i < 3 ? '+' : '') + (i === 3 ? (B ? (v / B * 100).toFixed(1) + '% of batched' : '') : ((v / O) * 100).toFixed(1) + '% of ordered') : ''}</span></div>`;
  document.getElementById('funBox').innerHTML = bar('Ordered', O, '#2f5d8a', 0) + bar('Planned', Pl, '#8e6bbf', 1) + bar('Batched', B, '#5b9bd5', 2) + bar('Rejected in-house', R, '#d9534f', 3) + bar('Cleared', Cl, '#3a9d5d', 4) + bar('Dispatched', Ds, '#7f7f7f', 5) + `<p class="note">${L.length} order lines placed ${fmtD(a)} – ${fmtD(b)} with at least one batch. ${uL()}.</p>`;
}
function funDrill(i) { const { rows, H } = window._FUN; const sortCol = [4, 6, 7, 9, 10, 11][i]; const t = rows.slice().sort((a, b) => b[sortCol] - a[sortCol]); showTable('Order lines · ' + ['ordered', 'planned', 'batched', 'rejected', 'cleared', 'dispatched'][i], 'Sorted by the figure you double-clicked. Planned over order and rejected % sit side by side so you can see if the extra covers the losses.', H, t, { link: (r) => traceAny(r[0]) }); }
function renderOpenLines() {
  const rows = ORDS.filter((x) => x.open > 0).sort((a, b) => b.late - a.late || (a.o[8] ?? 1e9) - (b.o[8] ?? 1e9));
  document.getElementById('olTab').innerHTML = `<tr data-s="1"><th class="l">Order</th><th class="l">Customer</th><th class="l">Part</th><th class="l">Delivery</th><th>Days late</th><th>Open</th><th>Ready</th><th>In WIP</th><th>Short</th><th class="l">Cover</th></tr>` + rows.slice(0, 300).map((x) => { const st = x.short > 0 ? `<span class="pill bad">short ${nf(x.short)}</span>` : x.ready >= x.open ? '<span class="pill ok">ready</span>' : '<span class="pill">in production</span>'; return `<tr ondblclick="traceAny('${esc(x.no)}')" title="Double-click to trace the order"><td class="l">${esc(x.no)}</td><td class="l">${esc(D.cust[x.c])}</td><td class="l">${esc(partLab(x.p))}</td><td class="l">${x.o[8] != null ? fmtD(x.o[8]) : '–'}</td><td class="${x.late ? 'h5' : ''}">${x.late || '–'}</td><td>${nf(x.open)}</td><td>${x.ready ? nf(x.ready) : '–'}</td><td>${x.wip ? nf(x.wip) : '–'}</td><td>${x.short ? nf(x.short) : '–'}</td><td class="l">${st}</td></tr>`; }).join('') + (rows.length > 300 ? `<tr><td colspan="10" class="l note">First 300 of ${rows.length}. Use the customer table for the full lists.</td></tr>` : '');
}

// ===================== WIP trend =====================
const WT = { gran: 'm', sel: null, amin: '', from: null, to: null, cache: new Map() };
function renderWipTrend() {
  const a = WT.from ?? END - 364, b = WT.to ?? END; const fe = document.getElementById('wtFrom'); if (!fe.value) { fe.value = toStr(a); document.getElementById('wtTo').value = toStr(b); }
  const ends = []; let cur = null; for (let d = a; d <= b; d++) { const k = periodKey(d, WT.gran); if (k !== cur) { if (cur != null) ends.push([cur, d - 1]); cur = k; } } ends.push([cur, b]);
  const amin = WT.amin === '' ? null : +WT.amin; const SK = SORD; const sel = WT.sel || new Set([0, 1, 2, 3, 4, 5, 6]);
  const series = SK.filter((k) => sel.has(k)).map((k) => ({ k, v: [] })); const key = (d) => [d, F.c, F.t, F.m, HIDESTALE].join('|');
  for (const [, d] of ends) { let rows = WT.cache.get(key(d)); if (!rows) { rows = wipAt(d); WT.cache.set(key(d), rows); } for (const s of series) s.v.push(Math.round(rows.filter((r) => r.k === s.k && (amin == null || r.age >= amin)).reduce((t, r) => t + val(r.pcs, r.kg), 0))); }
  const labs = ends.map(([k]) => periodLab(k, WT.gran));
  mk('wtChart', { type: 'line', data: { labels: labs, datasets: series.map((s, i) => ({ label: STG[s.k], data: s.v, borderColor: TCOL[i % TCOL.length], backgroundColor: TCOL[i % TCOL.length] + '33', fill: false, tension: 0.25, pointRadius: labs.length > 40 ? 0 : 3 })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(c.parsed.y)} ${uL()}` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: uL() + ' in WIP at period end' } } },
      onClick: (ev, els) => { if (!els.length) return; const e0 = els[0]; wtDrill(series[e0.datasetIndex].k, ends[e0.index][1]); } } }, 380);
  document.getElementById('wtTab').innerHTML = `<tr><th>Stage (${uL()}) at period end${amin != null ? ', aged ' + amin + '+ days' : ''}</th>${labs.map((l) => `<th>${l}</th>`).join('')}<th>Average</th></tr>` + series.map((s) => `<tr><td class="l">${STG[s.k]}</td>${s.v.map((v, i) => `<td class="click" ondblclick="wtDrill(${s.k},${ends[i][1]})">${v ? nf(v) : '–'}</td>`).join('')}<td><b>${nf(s.v.reduce((x, y) => x + y, 0) / s.v.length)}</b></td></tr>`).join('') + `<tr class="tot"><td>Total</td>${labs.map((_, i) => `<td>${nf(series.reduce((t, s) => t + s.v[i], 0))}</td>`).join('')}<td></td></tr>`;
}
function wtDrill(k, d) { const key = [d, F.c, F.t, F.m, HIDESTALE].join('|'); const rows = (WT.cache.get(key) || wipAt(d)).filter((r) => r.k === k && (WT.amin === '' || r.age >= +WT.amin)); showItems(STG[k] + ' · at ' + fmtD(d), 'Batch items in this stage at the period end', rows); }

// ===================== Where time goes =====================
const TG = { from: null, to: null, parts: null, stage: 5 };
const TSTAGES = [[8, 'PO Received – WO Pending'], [7, 'WO Released – PRC Pending'], [0, STG[0] + ' (incl. batches not started)'], [1, STG[1]], [2, STG[2]], [3, STG[3]], [4, STG[4]], [5, STG[5]], [6, STG[6]], [10, 'Cleared – Dispatch Pending']];
function fifoWait(chunks, rows, a, b, out, ref) { const ch = chunks.map((c) => c.slice()); let ci = 0; for (const r of rows) { let need = r[1]; while (need > 0 && ci < ch.length) { const t = Math.min(need, ch[ci][1]); if (r[0] >= a && r[0] <= b && r[0] >= ch[ci][0]) out.push([r[0] - ch[ci][0], t, ref, r[0]]); ch[ci][1] -= t; need -= t; if (ch[ci][1] <= 0) ci++; } } }
function timeData() {
  const a = TG.from ?? END - 179, b = TG.to ?? END; const W = {}; TSTAGES.forEach(([k]) => (W[k] = []));
  const okPart = (p) => !TG.parts || TG.parts.has(p);
  D.items.forEach((it, i) => { if (!passItem(it) || !okPart(it[2])) return; const e = it[7]; const chain = [[[it[5], it[6]]], ...[1, 2, 3, 4, 5, 6].map((s) => e[s].map((r) => [r[0], r[2] ?? r[1]]))];
    for (let k = 0; k < 7; k++) { const nxt = e[k + 1]; if (!nxt.length) break; fifoWait(chain[k], nxt.map((r) => [r[0], r[1]]), a, b, W[k], i); } });
  D.ord.forEach((o, j) => { if (!passPart(o[4], o[3], o[5], o[9]) || !okPart(o[4])) return; fifoWait([[o[2], o[6]]], o[10], a, b, W[8], 'o' + j);
    const items = ITEMS_BY_ORD.get(j) || []; const cl = []; for (const i of items) for (const r of D.items[i][7][7]) cl.push([r[0], r[2]]); cl.sort((x, y) => x[0] - y[0]); fifoWait(cl, o[11], a, b, W[10], 'o' + j); });
  D.wo.forEach((w, j) => { const it = [w[0], w[1], w[2], w[3], w[4], 0, 0, null, w[10]]; if (!passItem(it) || !okPart(w[2])) return; fifoWait([[w[5], w[6]]], w[7], a, b, W[7], 'w' + j); });
  return { a, b, W };
}
let TD = null;
function renderTime() {
  const fe = document.getElementById('tgFrom'); if (!fe.value) { fe.value = toStr(TG.from ?? END - 179); document.getElementById('tgTo').value = toStr(TG.to ?? END); }
  TD = timeData(); const { W } = TD; const rows = TSTAGES.map(([k, n]) => { const arr = W[k]; return { k, n, med: wmed(arr), p80: wmed(arr, 0.8), avg: wavg(arr), pcs: arr.reduce((t, x) => t + x[1], 0) }; });
  const mx = Math.max(1, ...rows.map((r) => r.p80 || 0)); const tot = rows.reduce((t, r) => t + (r.med || 0), 0);
  document.getElementById('tgTab').innerHTML = `<tr><th>Stage (time from finishing one step to being recorded at the next)</th><th>Median days</th><th>80% within (days)</th><th>Average days</th><th>Pieces measured</th><th class="l" style="min-width:260px">Median ▮ and 80th percentile ▯</th><th>Share of the median path</th></tr>` +
    rows.map((r) => `<tr><td class="l click" ondblclick="tgDrill(${r.k})">${esc(r.n)}</td><td class="click" ondblclick="tgDrill(${r.k})"><b>${r.med ?? '–'}</b></td><td>${r.p80 ?? '–'}</td><td>${r.avg != null ? r.avg.toFixed(1) : '–'}</td><td>${nf(r.pcs)}</td><td class="l"><div class="tr2"><i style="width:${((r.med || 0) / mx * 100).toFixed(1)}%"></i><i class="lt" style="width:${(((r.p80 || 0) - (r.med || 0)) / mx * 100).toFixed(1)}%"></i></div></td><td>${tot && r.med != null ? Math.round(r.med / tot * 100) + '%' : '–'}</td></tr>`).join('') +
    `<tr class="tot"><td>Sum of medians</td><td>${tot}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
  // monthly median of the chosen stage
  const k = +document.getElementById('tgStage').value; const arr = W[k]; const ks = [...new Set(arr.map((x) => periodKey(x[3], 'm')))].sort((x, y) => x - y);
  mk('tgChart', { type: 'line', data: { labels: ks.map((x) => periodLab(x, 'm')), datasets: [{ label: 'Median days', data: ks.map((m) => wmed(arr.filter((x) => periodKey(x[3], 'm') === m))), borderColor: '#2f5d8a', backgroundColor: '#2f5d8a', tension: 0.25 }, { label: '80% within', data: ks.map((m) => wmed(arr.filter((x) => periodKey(x[3], 'm') === m), 0.8)), borderColor: '#e07b39', backgroundColor: '#e07b39', borderDash: [5, 4], tension: 0.25 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'days' } } } } }, 300);
}
function tgDrill(k) {
  const arr = TD.W[k]; const by = new Map(); for (const [d, q, ref] of arr) { const o = by.get(ref) || by.set(ref, { ref, q: 0, dq: 0, mx: 0 }).get(ref); o.q += q; o.dq += d * q; o.mx = Math.max(o.mx, d); }
  const rows = [...by.values()].map((o) => { if (typeof o.ref === 'number') { const it = D.items[o.ref]; return [it[0], S.it[o.ref][0], itemFacts(o.ref).ord, D.cust[it[1]], partLab(it[2]), o.q, Math.round(o.dq / o.q * 10) / 10, o.mx]; } if (o.ref[0] === 'o') { const x = D.ord[+o.ref.slice(1)]; return [x[1], '', x[1], D.cust[x[3]], partLab(x[4]), o.q, Math.round(o.dq / o.q * 10) / 10, o.mx]; } const w = D.wo[+o.ref.slice(1)]; return [w[0], w[0], '', D.cust[w[1]], partLab(w[2]), o.q, Math.round(o.dq / o.q * 10) / 10, o.mx]; });
  showTable(TSTAGES.find((x) => x[0] === k)[1] + ' · time spent', `Pieces that reached the next step ${fmtD(TD.a)} – ${fmtD(TD.b)}`, ['Batch item / order / WO', 'WO no.', 'Order', 'Customer', 'Part', 'Pieces', 'Wait (days, average)', 'Longest wait (days)'], rows, { link: (r) => traceAny(r[0]) });
}

// ===================== Vendor performance (V.Speed + V.Quality) =====================
const VP = { from: null, to: null, mc: false };
function vendorPerf() {
  const a = VP.from ?? END - 179, b = VP.to ?? END; const nd = workDays(a, b);
  const M = new Map(); const g = (v, pr) => M.get(v + '|' + pr) || M.set(v + '|' + pr, { v, pr, sent: 0, sentKg: 0, back: 0, backKg: 0, tat: [], rec: 0, att: 0, attRows: [], loaded: new Set(), open: 0 }).get(v + '|' + pr);
  for (const v of D.vend) { if (!passPart(v[2], null, null)) continue; const o = g(v[0], v[1]); const kgpc = v[4] ? v[5] / v[4] : 0; if (v[3] >= a && v[3] <= b) { o.sent += v[4]; o.sentKg += v[5]; }
    let left = v[4]; let d0 = v[3]; for (const [d, q] of v[8] || []) { if (d >= a && d <= b) { o.back += q; o.backKg += q * kgpc; o.tat.push([d - v[3], q]); } left -= q; }
    const endD = left > 0 ? b : Math.max(...(v[8] || [[v[3]]]).map((x) => x[0])); for (let d = Math.max(a, d0); d <= Math.min(b, endD); d++) if (!isWed(d)) o.loaded.add(d); if (left > 0 && v[3] <= b) o.open += left * kgpc; }
  for (const r of D.rcv) { if (r[0] < a || r[0] > b || !passPart(r[3], null, null)) continue; g(r[1], r[2]).rec += r[5]; }
  // attribution: rejections at final / machining inspection go to the vendors whose lots of that part came back in the W days before
  const RCV = new Map(); for (const r of D.rcv) (RCV.get(r[3]) || RCV.set(r[3], []).get(r[3])).push(r);
  const W = +SET.win; let attTot = 0, rejTot = 0;
  for (const r of D.rej) { if (r[0] < a || r[0] > b || (r[1] !== 6 && r[1] !== 7)) continue; const it = D.items[r[3]]; if (!passItem(it)) continue; if (VP.mc && !/M\/C/i.test(D.rdep[r[2]] || '')) continue; rejTot += r[4];
    const rcAll = (RCV.get(it[2]) || []).filter((x) => x[0] <= r[0] && x[0] >= r[0] - W && x[4] > 0); const lastD = rcAll.length ? Math.max(...rcAll.map((x) => x[0])) : null; const rc = rcAll.filter((x) => x[0] === lastD); const tq = rc.reduce((t, x) => t + x[4], 0); if (!tq) continue; attTot += r[4];
    for (const x of rc) { const o = g(x[1], x[2]); const sh = r[4] * x[4] / tq; o.att += sh; o.attRows.push([it[0], S.it[r[3]][0], D.cust[it[1]], partLab(it[2]), D.rstg[r[1]], D.rsn[r[2]], D.rdep[r[2]] || '', fmtD(r[0]), fmtD(x[0]), Math.round(sh * 10) / 10]); } }
  const rows = [...M.values()].filter((o) => o.sent || o.back).map((o) => ({ ...o, perDay: o.backKg / nd, perLoaded: o.loaded.size ? o.backKg / o.loaded.size : 0, tatMed: wmed(o.tat), rate: o.back ? (o.att + o.rec) / o.back * 100 : null, pourShare: (o.backKg / nd) / SET.pour * 100 }));
  return { a, b, nd, rows, attTot, rejTot };
}
let VPD = null;
function renderVperf() {
  const fe = document.getElementById('vpFrom'); if (!fe.value) { fe.value = toStr(VP.from ?? END - 179); document.getElementById('vpTo').value = toStr(VP.to ?? END); }
  VPD = vendorPerf(); const { rows, nd, attTot, rejTot } = VPD; rows.sort((x, y) => y.backKg - x.backKg);
  document.getElementById('vpNote').textContent = `${nd} working days. Of ${nf(rejTot)} pieces rejected at final / machining inspection in the range${VP.mc ? ' (machining reasons only)' : ''}, ${nf(attTot)} (${rejTot ? Math.round(attTot / rejTot * 100) : 0}%) came after a vendor had returned that part within ${SET.win} days. Each is charged to the vendor whose return came last before the rejection (split by pieces if two came back the same day). Estimate, because challans name the part, not the batch item.`;
  document.getElementById('vpTab').innerHTML = `<tr><th>Vendor</th><th>Process</th><th>Sent (pcs)</th><th>Received (pcs)</th><th>Received kg / working day</th><th>kg / day while holding our material</th><th>vs pour rate ${nf(SET.pour)} kg/day</th><th>Turnaround (median days)</th><th>Open now (kg)</th><th>Rejected on receipt (recorded)</th><th>Rejected later at inspection (charged)</th><th>Rejection % of received</th></tr>` +
    rows.map((o, i) => `<tr><td class="l click" ondblclick="vpDrill(${i},'att')">${esc(D.vendors[o.v])}</td><td class="l">${esc(D.procs[o.pr])}</td><td>${nf(o.sent)}</td><td class="click" ondblclick="vpDrill(${i},'rcv')">${nf(o.back)}</td><td>${nf(o.perDay)}</td><td>${nf(o.perLoaded)}</td><td>${o.pourShare.toFixed(1)}%</td><td>${o.tatMed ?? '–'}</td><td>${o.open ? nf(o.open) : '–'}</td><td>${o.rec ? nf(o.rec) : '–'}</td><td class="click" ondblclick="vpDrill(${i},'att')">${o.att ? nf(o.att) : '–'}</td><td class="${o.rate > 5 ? 'h5' : o.rate > 2 ? 'h3' : ''}">${o.rate != null ? o.rate.toFixed(1) + '%' : '–'}</td></tr>`).join('');
  const pts = rows.filter((o) => o.back >= 100 && o.tatMed != null);
  mk('vpChart', { type: 'bubble', data: { datasets: pts.map((o, i) => ({ label: D.vendors[o.v] + ' · ' + D.procs[o.pr], data: [{ x: o.tatMed, y: +(o.rate || 0).toFixed(2), r: Math.max(4, Math.min(28, Math.sqrt(o.backKg) / 6)) }], backgroundColor: TCOL[i % TCOL.length] + 'aa' })) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.x} days turnaround, ${c.raw.y}% rejected` } } }, scales: { x: { title: { display: true, text: 'Turnaround, median days (faster ←)' }, beginAtZero: true }, y: { title: { display: true, text: 'Rejection % of received (better ↓)' }, beginAtZero: true } },
      onClick: (ev, els) => { if (els.length) vpDrill(rows.indexOf(pts[els[0].datasetIndex]), 'att'); } } }, 380);
}
function vpDrill(i, kind) {
  const o = VPD.rows[i]; if (!o) return;
  if (kind === 'att') { showTable(`${D.vendors[o.v]} · ${D.procs[o.pr]} · rejections charged`, 'Each inspection rejection of a part this vendor returned in the window before it. Pieces = this vendor\'s share.', ['Batch item', 'WO no.', 'Customer', 'Part', 'Caught at', 'Reason', 'Responsible dept', 'Rejected on', 'Vendor returned on', 'Pieces'], o.attRows, { link: (r) => traceAny(r[0]) }); return; }
  const rows = D.rcv.filter((r) => r[1] === o.v && r[2] === o.pr && r[0] >= VPD.a && r[0] <= VPD.b && passPart(r[3], null, null)).map((r) => [partLab(r[3]), custOfPart(r[3]), fmtD(r[0]), r[4], r[5], Math.round(r[6]), r[7] || 0]);
  showTable(`${D.vendors[o.v]} · ${D.procs[o.pr]} · receipts`, '', ['Part', 'Customer', 'Received on', 'Pieces', 'Rejected (recorded)', 'kg', 'Scrap kg'], rows);
}

// ===================== Capacity =====================
const CP = { from: null, to: null };
function capData() {
  const a = CP.from ?? END - 89, b = CP.to ?? END; const nd = workDays(a, b);
  const st = [['Injection', 'in', 9], ['Wax assembly', 'in', 1], ['Coating', 'in', 2], ['De-waxing', 'in', 3], ['Melting (poured)', 'in', 4], ['Knock-out', 'in', 10], ['Heat treatment', 'ht', 5], ['Fettling', 'ch', ['Contract fettling (in-house)', 'Fettling']], ['Machining', 'ch', ['Machining']], ['Turning', 'ch', ['Turning']], ['Other finishing (EP, shot blasting, plating…)', 'ch', null], ['Final inspection', 'in', 6], ['Machining inspection', 'in', 8], ['Cleared for dispatch', 'in', 7], ['Dispatched', 'disp']];
  const res = st.map(([n, t, s]) => ({ n, t, s, inKg: 0, outKg: 0, week: new Map() }));
  const addW = (o, d, kg) => { const k = periodKey(d, 'w'); o.week.set(k, (o.week.get(k) || 0) + kg); };
  let pourMach = 0;
  for (const it of D.items) { if (!passItem(it)) continue; const e = it[7]; res.forEach((o) => { if (o.t === 'in') for (const r of e[o.s]) { if (r[0] < a || r[0] > b) continue; const kg = r[1] * it[4]; o.inKg += kg; addW(o, r[0], kg); }
      if (o.t === 'ht') for (const r of e[5]) { if (r[0] < a || r[0] > b) continue; const kg = r[1] * it[4]; if (r[3]) o.outKg += kg; else o.inKg += kg; addW(o, r[0], kg); } });
    if (['Machining', 'PM'].includes(D.types[it[8]])) for (const r of e[4]) if (r[0] >= a && r[0] <= b) pourMach += r[1] * it[4]; }
  for (const r of D.rcv) { if (r[0] < a || r[0] > b || !passPart(r[3], null, null)) continue; const pn = D.procs[r[2]]; if (pn === 'Heat Treatment') continue;
    let o = res.find((x) => x.t === 'ch' && x.s && x.s.includes(pn)); if (!o) o = res.find((x) => x.t === 'ch' && !x.s); if (pn === 'Contract fettling (in-house)') o.inKg += r[6]; else o.outKg += r[6]; addW(o, r[0], r[6]); }
  for (const r of D.disp) { if (r[0] < a || r[0] > b || !passPart(r[2], r[1], r[3], r[7])) continue; const o = res.find((x) => x.t === 'disp'); o.inKg += r[5]; addW(o, r[0], r[5]); }
  const pour = res.find((x) => x.n.startsWith('Melting')); const pourDay = (pour.inKg) / nd;
  res.forEach((o) => { o.tot = (o.inKg + o.outKg) / nd; o.inD = o.inKg / nd; o.outD = o.outKg / nd; const w = [...o.week.values()].map((x) => x / 6).sort((x, y) => x - y); o.peak = w.length ? w[Math.floor(w.length * 0.9)] : 0; o.need = o.n === 'Machining' || o.n === 'Turning' || o.n === 'Machining inspection' ? pourMach / nd : o.n.startsWith('Other') ? null : pourDay; });
  return { a, b, nd, res, pourDay, pourMach: pourMach / nd };
}
let CPD = null;
function renderCap() {
  const fe = document.getElementById('cpFrom'); if (!fe.value) { fe.value = toStr(CP.from ?? END - 89); document.getElementById('cpTo').value = toStr(CP.to ?? END); }
  CPD = capData(); const { res, nd, pourDay, pourMach } = CPD; const T = +SET.pour;
  document.getElementById('cpNote').innerHTML = `${nd} working days (Wednesdays off). Actual pour rate: <b>${nf(pourDay)} kg/day</b> (target ${nf(T)} kg/day). Machined parts are ${nf(pourMach)} kg/day of that, which is what machining and machining inspection need to keep up with. Weights are raw casting weight × pieces. Peak = 90th-percentile week ÷ 6 working days.`;
  document.getElementById('cpTab').innerHTML = `<tr><th>Step</th><th>In-house kg/day</th><th>Outsourced kg/day</th><th>Total capacity used kg/day</th><th>Peak week kg/day</th><th>Needed kg/day (= pour)</th><th>vs needed</th><th>vs target ${nf(T)}</th></tr>` +
    res.map((o, i) => { const vs = o.need ? o.tot / o.need * 100 : null; return `<tr><td class="l click" ondblclick="cpDrill(${i})">${esc(o.n)}</td><td>${o.inD ? nf(o.inD) : '–'}</td><td>${o.outD ? nf(o.outD) : '–'}</td><td class="click" ondblclick="cpDrill(${i})"><b>${nf(o.tot)}</b></td><td>${nf(o.peak)}</td><td>${o.need ? nf(o.need) : '–'}</td><td class="${vs != null && vs < 95 ? 'h5' : vs != null && vs < 100 ? 'h3' : ''}">${vs != null ? vs.toFixed(0) + '%' : '–'}</td><td class="${o.tot < T * 0.95 && o.need ? 'h3' : ''}">${(o.tot / T * 100).toFixed(0)}%</td></tr>`; }).join('');
  mk('cpChart', { type: 'bar', data: { labels: res.map((o) => o.n), datasets: [{ label: 'In-house kg/day', data: res.map((o) => Math.round(o.inD)), backgroundColor: '#5b9bd5', stack: 's' }, { label: 'Outsourced kg/day', data: res.map((o) => Math.round(o.outD)), backgroundColor: '#f2a65a', stack: 's' }, { type: 'line', label: 'Needed (pour) kg/day', data: res.map((o) => o.need ? Math.round(o.need) : null), borderColor: '#c0392b', backgroundColor: '#c0392b', pointRadius: 4, showLine: false }, { type: 'line', label: 'Target ' + nf(T), data: res.map(() => T), borderColor: '#333', borderDash: [6, 4], pointRadius: 0 }] },
    options: { indexAxis: 'x', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, ticks: { autoSkip: false, maxRotation: 50, minRotation: 30, font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'kg per working day' } } }, onClick: (ev, els) => { if (els.length) cpDrill(els[0].index); } } }, 360);
}
function cpDrill(i) { const o = CPD.res[i]; const ks = [...o.week.keys()].sort((x, y) => x - y); showTable(o.n + ' · by week', 'kg per week and per working day (6 per week)', ['Week', 'kg', 'kg per working day'], ks.map((k) => [periodLab(k, 'w'), Math.round(o.week.get(k)), Math.round(o.week.get(k) / 6)])); }

// ===================== Dispatch trends =====================
const DT = { from: null, to: null, gran: 'm' };
function renderDisp() {
  const fe = document.getElementById('dtFrom'); if (!fe.value) { fe.value = toStr(DT.from ?? END - 364); document.getElementById('dtTo').value = toStr(DT.to ?? END); }
  const a = DT.from ?? END - 364, b = DT.to ?? END, gr = DT.gran; const keys = []; for (let d = a; d <= b; d++) { const k = periodKey(d, gr); if (keys[keys.length - 1] !== k) keys.push(k); } const KI = new Map(keys.map((k, i) => [k, i]));
  const rows = D.disp.filter((r) => r[0] >= a && r[0] <= b && passPart(r[2], r[1], r[3], r[7])); const C = new Map();
  for (const r of rows) { const o = C.get(r[1]) || C.set(r[1], { c: r[1], kg: 0, pcs: 0, days: new Set(), per: new Array(keys.length).fill(0), onT: 0, lateN: 0, n: 0, late: [] }).get(r[1]); o.kg += r[5]; o.pcs += r[4]; o.days.add(r[0]); o.per[KI.get(periodKey(r[0], gr))] += val(r[4], r[5]);
    const ord = D.ord[ORDX.get(r[6])]; if (ord && ord[8] != null) { o.n++; if (r[0] <= ord[8]) o.onT++; else o.late.push(r[0] - ord[8]); } }
  const cs = [...C.values()].sort((x, y) => y.kg - x.kg); const top = cs.slice(0, 8); const other = new Array(keys.length).fill(0); cs.slice(8).forEach((o) => o.per.forEach((v, i) => (other[i] += v)));
  window._DT = { rows, keys, gr };
  mk('dtChart', { type: 'bar', data: { labels: keys.map((k) => periodLab(k, gr)), datasets: [...top.map((o, i) => ({ label: D.cust[o.c], data: o.per.map(Math.round), backgroundColor: TCOL[i % TCOL.length], stack: 's' })), { label: 'Others', data: other.map(Math.round), backgroundColor: '#cfd6de', stack: 's' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: uL() + ' dispatched' } } }, onClick: (ev, els) => { if (!els.length) return; const e0 = els[0]; const k = keys[e0.index]; const c = e0.datasetIndex < top.length ? top[e0.datasetIndex].c : null; dtDrill(c, k); } } }, 380);
  document.getElementById('dtTab').innerHTML = `<tr><th>Customer</th><th>Dispatched kg</th><th>Pieces</th><th>Dispatch days</th><th>kg per dispatch day (median)</th><th>Days between dispatches (median)</th><th>Lines on time</th><th>Median days late (late lines)</th>${keys.map((k) => `<th>${periodLab(k, gr)}</th>`).join('')}</tr>` +
    cs.map((o) => { const ds = [...o.days].sort((x, y) => x - y); const gaps = ds.slice(1).map((d, i) => [d - ds[i], 1]); const per = ds.map((d) => [rows.filter((r) => r[1] === o.c && r[0] === d).reduce((t, r) => t + r[5], 0), 1]); return `<tr><td class="l click" ondblclick="dtDrill(${o.c},null)">${esc(D.cust[o.c])}</td><td>${nf(o.kg)}</td><td>${nf(o.pcs)}</td><td>${o.days.size}</td><td>${nf(wmed(per) || 0)}</td><td>${wmed(gaps) ?? '–'}</td><td class="${o.n && o.onT / o.n < 0.7 ? 'h5' : ''}">${o.n ? Math.round(o.onT / o.n * 100) + '%' : '–'}</td><td>${o.late.length ? wmed(o.late.map((x) => [x, 1])) : '–'}</td>${o.per.map((v, i) => `<td class="click" ondblclick="dtDrill(${o.c},${keys[i]})">${v ? nf(v) : '–'}</td>`).join('')}</tr>`; }).join('');
}
function dtDrill(c, k) { const { rows, gr } = window._DT; const rs = rows.filter((r) => (c == null || r[1] === c) && (k == null || periodKey(r[0], gr) === k)); showTable('Dispatches' + (c != null ? ' · ' + D.cust[c] : '') + (k != null ? ' · ' + periodLab(k, gr) : ''), '', ['Order', 'Customer', 'Part', 'Dispatched on', 'Delivery date', 'Days late', 'Pieces', 'kg'], rs.map((r) => { const o = D.ord[ORDX.get(r[6])]; return [o ? o[1] : '', D.cust[r[1]], partLab(r[2]), fmtD(r[0]), o && o[8] != null ? fmtD(o[8]) : '–', o && o[8] != null ? Math.max(0, r[0] - o[8]) : 0, r[4], Math.round(r[5])]; }), { link: (r) => traceAny(r[0]) }); }

// ===================== Insights =====================
function renderIns() {
  const a = END - 729; // two years
  // --- 1. 150 kg per batch item
  const its = D.items.map((it, i) => [it, i]).filter(([it]) => it[5] >= a && passItem(it));
  const kg = its.map(([it]) => it[6] * it[4]); const bins = new Array(12).fill(0); kg.forEach((x) => bins[Math.min(11, Math.floor(x / 50))]++);
  const srt = kg.slice().sort((x, y) => x - y); const q = (p) => Math.round(srt[Math.floor(p * (srt.length - 1))] || 0);
  const H = S.heats.filter((h) => h[0] >= a); const hk = H.map((h) => h[1]).sort((x, y) => x - y); const hq = (p) => Math.round(hk[Math.floor(p * (hk.length - 1))] || 0); const hn = H.map((h) => h[2]).sort((x, y) => x - y);
  const multiHeat = its.filter(([, i]) => (S.it[i][1] || '').split(' ').filter(Boolean).length > 1).length, withHeat = its.filter(([, i]) => S.it[i][1]).length;
  const lineBands = [[0, 150], [150, 300], [300, 600], [600, 1200], [1200, 1e9]].map(([lo, hi]) => { const L = [...ITEMS_BY_ORD.entries()].filter(([j, ii]) => { const o = D.ord[j]; const w = o[6] * o[7]; return o[2] >= a && w >= lo && w < hi && passPart(o[4], o[3], o[5], o[9]); }); const n = L.reduce((t, [, ii]) => t + ii.length, 0); const ik = L.flatMap(([, ii]) => ii.map((i) => D.items[i][6] * D.items[i][4])).sort((x, y) => x - y); return [`${lo}–${hi > 1e8 ? '' : hi} kg`, L.length, L.length ? (n / L.length).toFixed(1) : '–', ik.length ? Math.round(ik[Math.floor(ik.length / 2)]) : '–']; });
  window._INS = { its, bins };
  document.getElementById('in1').innerHTML = `<div class="kpis"><div class="kpi"><div class="v">${q(0.5)} kg</div><div class="m">median batch item (p10 ${q(0.1)}, p90 ${q(0.9)})</div></div><div class="kpi"><div class="v">${hq(0.5)} kg</div><div class="m">median heat poured (p10 ${hq(0.1)}, p90 ${hq(0.9)})</div></div><div class="kpi"><div class="v">${hn[Math.floor(hn.length / 2)] || '–'}</div><div class="m">batch items per heat (median)</div></div><div class="kpi"><div class="v">${withHeat ? Math.round(multiHeat / withHeat * 100) : 0}%</div><div class="m">of batch items poured over 2+ heats</div></div></div>
  <p class="note">Batch items made in the last two years. Lines are split into items of about 150 kg, each a whole number of trees (item quantity is a multiple of the die's set-up quantity for 99% of items). A heat pours a similar weight but takes it from about 3 items, so items and heats do not line up: most items are poured over two heats. Double-click a bar for its batch items.</p>`;
  mk('in1Chart', { type: 'bar', data: { labels: bins.map((_, i) => i < 11 ? `${i * 50}–${i * 50 + 50}` : '550+'), datasets: [{ label: 'Batch items by weight (kg)', data: bins, backgroundColor: '#5b9bd5' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'batch items' } } }, onClick: (ev, els) => { if (!els.length) return; const b = els[0].index; showItems(`Batch items of ${b * 50}–${b < 11 ? b * 50 + 50 : '+'} kg`, '', window._INS.its.filter(([it]) => Math.min(11, Math.floor(it[6] * it[4] / 50)) === b).map(([it]) => ({ k: 0, it, pcs: it[6], kg: it[6] * it[4], age: toDay(asofEl.value) - it[5], since: it[5], stale: false }))); } } }, 260);
  document.getElementById('in1Tab').innerHTML = `<tr><th>Order line weight</th><th>Lines</th><th>Batch items per line</th><th>Median item kg</th></tr>` + lineBands.map((r) => `<tr><td class="l">${r[0]}</td><td>${nf(r[1])}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  // --- 2. Are customers buying the extra pieces?
  const done = [...ITEMS_BY_ORD.entries()].filter(([j]) => { const o = D.ord[j]; return o[2] >= a && o[2] < END - 150 && passPart(o[4], o[3], o[5], o[9]); }).map(([j, ii]) => { const o = D.ord[j]; const b2 = ii.reduce((t, i) => t + D.items[i][6], 0); const cl = ii.reduce((t, i) => t + D.items[i][7][7].reduce((s, r) => s + r[2], 0), 0); const dq = o[11].reduce((s, r) => s + r[1], 0); return { j, o, q: o[6], b: b2, cl, dq, extraMade: Math.max(0, cl - o[6]), extraBought: Math.max(0, Math.min(dq, cl) - o[6]), extraLeft: Math.max(0, cl - Math.max(dq, o[6])), short: Math.max(0, o[6] - cl) }; });
  const C2 = new Map(); for (const x of done) { const y = C2.get(x.o[3]) || C2.set(x.o[3], { c: x.o[3], n: 0, q: 0, b: 0, cl: 0, dq: 0, em: 0, eb: 0, el: 0, sh: 0, lines: [] }).get(x.o[3]); y.n++; y.q += x.q; y.b += x.b; y.cl += x.cl; y.dq += x.dq; y.em += x.extraMade; y.eb += x.extraBought; y.el += x.extraLeft; y.sh += x.short; y.lines.push(x); }
  const c2 = [...C2.values()].sort((x, y) => y.em - x.em); const T2 = c2.reduce((t, y) => ({ q: t.q + y.q, em: t.em + y.em, eb: t.eb + y.eb, el: t.el + y.el, sh: t.sh + y.sh }), { q: 0, em: 0, eb: 0, el: 0, sh: 0 });
  window._EX = c2;
  document.getElementById('in2').innerHTML = `<div class="kpis"><div class="kpi"><div class="v">${nf(T2.em)}</div><div class="m">extra pieces cleared beyond the order (${T2.q ? (T2.em / T2.q * 100).toFixed(1) : 0}% of ordered)</div></div><div class="kpi"><div class="v">${nf(T2.eb)}</div><div class="m">of them dispatched to the customer (${T2.em ? Math.round(T2.eb / T2.em * 100) : 0}%)</div></div><div class="kpi"><div class="v">${nf(T2.el)}</div><div class="m">left over, not dispatched</div></div><div class="kpi"><div class="v">${nf(T2.sh)}</div><div class="m">pieces short on other lines (cleared below order)</div></div></div><p class="note">Order lines placed in the last two years and at least 150 days old. Extra = cleared above the order quantity. Bought = dispatched above the order quantity (customer accepted the over-supply). Double-click a customer for its lines.</p>`;
  document.getElementById('in2Tab').innerHTML = `<tr><th>Customer</th><th>Lines</th><th>Ordered</th><th>Batched</th><th>Cleared</th><th>Dispatched</th><th>Extra cleared</th><th>Extra dispatched (bought)</th><th>Share bought</th><th>Extra left over</th><th>Short</th></tr>` + c2.map((y, i) => `<tr><td class="l click" ondblclick="exDrill(${i})">${esc(D.cust[y.c])}</td><td>${y.n}</td><td>${nf(y.q)}</td><td>${nf(y.b)}</td><td>${nf(y.cl)}</td><td>${nf(y.dq)}</td><td class="click" ondblclick="exDrill(${i})">${nf(y.em)}</td><td>${nf(y.eb)}</td><td>${y.em ? Math.round(y.eb / y.em * 100) + '%' : '–'}</td><td class="${y.el > 0 ? 'h3' : ''}">${nf(y.el)}</td><td>${nf(y.sh)}</td></tr>`).join('');
  // --- 3. Manual work orders
  const man = S.man.filter((m) => m[1] >= a && (m[2] < 0 || passPart(m[2], null, null)));
  const cls = (m) => (m[10] === 3 || (P[m[2]] && /^TB$/i.test(P[m[2]][0])) ? 'Test bars' : m[5] != null && m[1] - m[5] <= 180 ? 'New-die trial' : /trial|trail|sample|rt purpose|robot/i.test(m[4]) ? 'Process trial' : 'Other (die older than 180 days)');
  const groups = ['New-die trial', 'Process trial', 'Other (die older than 180 days)', 'Test bars']; const cnt = groups.map((g) => man.filter((m) => cls(m) === g).length);
  const prev = man.filter((m) => m[7]).length, nxt = man.filter((m) => m[8] != null && m[8] <= 180).map((m) => [m[8], 1]), prod = man.filter((m) => cls(m) === 'New-die trial' && m[9] != null && m[9] >= 0).map((m) => [m[9], 1]);
  window._MAN = man.map((m) => [m[0], fmtD(m[1]), m[2] >= 0 ? partLab(m[2]) : '', m[2] >= 0 ? custOfPart(m[2]) : '', m[3], cls(m), m[4], m[5] != null ? m[1] - m[5] : '', m[6], m[7] ? 'yes' : 'no', m[8] ?? '', m[9] ?? '']);
  document.getElementById('in3').innerHTML = `<div class="kpis"><div class="kpi"><div class="v">${man.length}</div><div class="m">manual / test-bar work orders, last two years</div></div>${groups.map((g, i) => `<div class="kpi click" ondblclick="manDrill('${g}')"><div class="v">${cnt[i]}</div><div class="m">${g}</div></div>`).join('')}<div class="kpi"><div class="v">${man.length ? Math.round(prev / man.length * 100) : 0}%</div><div class="m">for a part the customer had already ordered</div></div><div class="kpi"><div class="v">${wmed(nxt) ?? '–'} d</div><div class="m">median to the next order of the part (${man.length ? Math.round(nxt.length / man.length * 100) : 0}% get one within 180 days)</div></div><div class="kpi"><div class="v">${wmed(prod) ?? '–'} d</div><div class="m">new-die trial → first production batch (median)</div></div></div>
  <p class="note"><b>What they are:</b> mostly the first castings off a <b>new or modified die</b>, made <b>after</b> the customer's order arrives and before any production batch (no new die went into production before its trial). Where a remark is written, older-die ones are process trials (robot, coating, sand, RT samples). They are not samples sent before a sales order: only a few are for a part never ordered. Double-click a group, or open the full list.</p><button class="chip" onclick="manDrill('')">Open all manual work orders</button>`;
}
function exDrill(i) { const y = window._EX[i]; showTable('Extra pieces · ' + D.cust[y.c], 'Per order line', ['Order', 'Part', 'Ordered on', 'Ordered', 'Planned', 'Batched', 'Cleared', 'Dispatched', 'Extra cleared', 'Extra dispatched (bought)', 'Extra left over', 'Short'], y.lines.map((x) => [x.o[1], partLab(x.o[4]), fmtD(x.o[2]), x.q, S.plan[x.j], x.b, x.cl, x.dq, x.extraMade, x.extraBought, x.extraLeft, x.short]), { link: (r) => traceAny(r[0]) }); }
function manDrill(g) { const rows = (window._MAN || []).filter((r) => !g || r[5] === g); showTable('Manual work orders' + (g ? ' · ' + g : ''), 'Die age = days from die created to the work order. Next order / first production batch = days after the work order.', ['WO no.', 'Date', 'Part', 'Customer', 'Pieces', 'Kind', 'Remark', 'Die age (days)', 'Die status', 'Part ordered before', 'Days to next order', 'Days to first production batch'], rows, { link: (r) => traceAny(r[0]) }); }

// ===================== Wiring =====================
function openTab(p) { const btn = document.querySelector(`#subtabs button[data-p="${p}"]`); if (!btn) return; const g = btn.dataset.g; if ((g === 'h') !== (MODE === 'h')) go(g === 'h' ? 'hist' : 'dashv'); btn.click(); }
const EXT = { pOrd: renderOrd, pTrace: renderTrace, pWipT: renderWipTrend, pTime: renderTime, pVperf: renderVperf, pCap: renderCap, pDisp: renderDisp, pIns: renderIns };
const curPane = () => { const b = document.querySelector('#subtabs button.on'); return b ? b.dataset.p : null; };
function extRefresh() { const p = curPane(); if (EXT[p]) EXT[p](); }
document.querySelectorAll('#subtabs button').forEach((b) => b.addEventListener('click', () => {
  const p = b.dataset.p; const hist = ['pWipT', 'pTime', 'pVperf', 'pCap', 'pDisp', 'pIns'].includes(p);
  if (EXT[p] || hist) { asofBox.classList.toggle('hidden', hist); ageBox.classList.toggle('hidden', !['pOrd'].includes(p)); rngBox.classList.add('hidden'); }
  if (EXT[p]) setTimeout(() => EXT[p](), 0);
}));
[fCust, fType, fMet].forEach((e) => e.addEventListener('change', () => { WT.cache.clear(); extRefresh(); }));
document.querySelectorAll('#fUnit button').forEach((b) => b.addEventListener('click', () => setTimeout(extRefresh, 0)));
[asofEl, aMinEl, aMaxEl].forEach((e) => e.addEventListener('change', () => { if (['pOrd', 'pTrace'].includes(curPane())) extRefresh(); }));
hideStale.addEventListener('change', () => WT.cache.clear());
const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
on('trQ', 'input', () => { TRQ = document.getElementById('trQ').value; clearTimeout(window._trT); window._trT = setTimeout(renderTrace, 250); });
on('funFrom', 'change', (e) => { FUN.from = toDay(e.target.value); renderFunnel(); }); on('funTo', 'change', (e) => { FUN.to = toDay(e.target.value); renderFunnel(); });
on('wtFrom', 'change', (e) => { WT.from = toDay(e.target.value); renderWipTrend(); }); on('wtTo', 'change', (e) => { WT.to = toDay(e.target.value); renderWipTrend(); });
on('wtGran', 'change', (e) => { WT.gran = e.target.value; renderWipTrend(); }); on('wtAge', 'input', (e) => { WT.amin = e.target.value; clearTimeout(window._wtT); window._wtT = setTimeout(renderWipTrend, 300); });
multiSel(document.getElementById('msWt'), SORD.map((k) => STG[k]), (s) => { WT.sel = s ? new Set([...s].map((j) => SORD[j])) : null; renderWipTrend(); }, [3, 4, 5, 6, 7, 8, 9]);
on('tgFrom', 'change', (e) => { TG.from = toDay(e.target.value); renderTime(); }); on('tgTo', 'change', (e) => { TG.to = toDay(e.target.value); renderTime(); });
on('tgStage', 'change', renderTime);
{ const used = [...new Set(D.items.map((it) => it[2]))].sort((x, y) => String(P[x][0]).localeCompare(String(P[y][0]), undefined, { numeric: true })); multiSel(document.getElementById('msSku'), used.map((p) => partLab(p) + (custOfPart(p) ? ' · ' + custOfPart(p) : '')), (s) => { TG.parts = s ? new Set([...s].map((j) => used[j])) : null; renderTime(); }); }
document.getElementById('tgStage').innerHTML = TSTAGES.map(([k, n]) => `<option value="${k}" ${k === 5 ? 'selected' : ''}>${n}</option>`).join('');
on('vpFrom', 'change', (e) => { VP.from = toDay(e.target.value); renderVperf(); }); on('vpTo', 'change', (e) => { VP.to = toDay(e.target.value); renderVperf(); });
on('vpMc', 'change', (e) => { VP.mc = e.target.checked; renderVperf(); });
on('vpWin', 'change', (e) => { SET.win = Math.max(1, +e.target.value || 60); store.set('win', SET.win); renderVperf(); });
on('cpFrom', 'change', (e) => { CP.from = toDay(e.target.value); renderCap(); }); on('cpTo', 'change', (e) => { CP.to = toDay(e.target.value); renderCap(); });
['cpPour', 'vpPour'].forEach((id) => on(id, 'change', (e) => { SET.pour = Math.max(1, +e.target.value || 2250); store.set('pour', SET.pour); document.getElementById('cpPour').value = document.getElementById('vpPour').value = SET.pour; extRefresh(); }));
document.getElementById('cpPour').value = document.getElementById('vpPour').value = SET.pour; document.getElementById('vpWin').value = SET.win;
on('dtFrom', 'change', (e) => { DT.from = toDay(e.target.value); renderDisp(); }); on('dtTo', 'change', (e) => { DT.to = toDay(e.target.value); renderDisp(); }); on('dtGran', 'change', (e) => { DT.gran = e.target.value; renderDisp(); });
toDbl(document.body);

// Machining rejections are not part of scrap (scrap = metal removed): show them beside it
function mcRejKpi() { const el = document.getElementById('sKpi'); if (!el || !sFrom.value) return; const a = toDay(sFrom.value), b = toDay(sTo.value); let pcs = 0, kg = 0;
  for (const r of D.rej) { if (r[0] < a || r[0] > b || r[1] !== 7) continue; const it = D.items[r[3]]; if (!passItem(it)) continue; pcs += r[4]; kg += r[4] * it[4]; }
  const sc = scrRows.reduce((t, r) => t + (r.scr || 0), 0); window._MCR = [a, b];
  el.insertAdjacentHTML('beforeend', '<div class="kpi click" ondblclick="mcRejDrill()" title="Double-click for the lines"><div class="v">' + nf(pcs) + ' pcs · ' + nf(kg) + ' kg</div><div class="m">rejected at machining inspection (casting kg), not in scrap</div></div><div class="kpi"><div class="v">' + nf(sc + kg) + ' kg</div><div class="m">machining loss = scrap + rejected castings</div></div>'); }
function mcRejDrill() { const [a, b] = window._MCR; const rs = D.rej.filter((r) => r[0] >= a && r[0] <= b && r[1] === 7 && passItem(D.items[r[3]])); showTable('Rejected at machining inspection', 'Casting weight × pieces. These pieces are not in the scrap figure.', REJH, rejRows(rs), { link: (r) => traceAny(r[0]) }); }
{ const _rs = renderScrap; renderScrap = function () { _rs(); mcRejKpi(); }; [sFrom, sTo, sProc].forEach((e) => e.addEventListener('change', mcRejKpi)); }
