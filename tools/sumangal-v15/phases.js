
// ===================== Open orders by phase, now (replaces "From order to dispatch") =====================
// User, 2026-11-25: on Today, no date range: show where the open orders are right now, double-click for the lines.
// Each open order line's open pieces (ordered − dispatched) are placed, as of the latest ERP day, in:
//   awaiting a work order (ordered − put on work orders) → work order, not batched (on work orders − batched) →
//   each production stage (the line's batch items in WIP) → ready to dispatch (cleared − dispatched) →
//   short (what is left: open − all of the above; usually rejected or lost pieces not yet made again).
// Each phase is capped by what is still open after the later phases, so the bars add up to the open pieces.
let PH = null;
function renderFunnel() {
  const box = document.getElementById('funBox'); if (!box) return;
  const lines = ORDS.filter((x) => x.open > 0);
  const byLine = new Map(lines.map((x) => [x.j, x]));
  const stageRows = new Map(); // stage -> wip rows of open lines
  const wipLine = new Map(); // line -> pieces in WIP
  for (const r of wipRows) {
    const i = ITX.get(r.it); if (i == null) continue; const j = S.it[i][3]; if (!byLine.has(j)) continue;
    (stageRows.get(r.k) || stageRows.set(r.k, []).get(r.k)).push(r); wipLine.set(j, (wipLine.get(j) || 0) + r.pcs);
  }
  const ph = { awaitWo: [], woNotBatched: [], ready: [], short: [] }; const T = { awaitWo: 0, woNotBatched: 0, ready: 0, short: 0, open: 0 };
  for (const x of lines) {
    const v = (p) => val(p, p * x.kg);
    const woq = x.o[10].reduce((s, r) => s + r[1], 0);
    const bq = (ITEMS_BY_ORD.get(x.j) || []).reduce((s, i) => s + D.items[i][6], 0);
    let left = x.open;
    const ready = Math.min(x.ready, left); left -= ready;
    const wip = Math.min(wipLine.get(x.j) || 0, left); left -= wip;
    const awaitWo = Math.min(Math.max(0, x.q - woq), left); left -= awaitWo;
    const woNb = Math.min(Math.max(0, woq - bq), left); left -= woNb;
    x.ph = { ready, wip, awaitWo, woNb, short: left };
    T.open += v(x.open); T.ready += v(ready); T.awaitWo += v(awaitWo); T.woNotBatched += v(woNb); T.short += v(left);
    if (ready) ph.ready.push(x); if (awaitWo) ph.awaitWo.push(x); if (woNb) ph.woNotBatched.push(x); if (left) ph.short.push(x);
  }
  const bars = [['awaitWo', 'Awaiting work order', T.awaitWo, colOf('PO Received – WO Pending')], ['woNotBatched', 'Work order, not batched', T.woNotBatched, colOf('WO Released – PRC Pending')]];
  for (const k of SORD) { if (k === 7 || k === 8) continue; const rs = stageRows.get(k); if (!rs) continue; bars.push(['s' + k, STG[k], rs.reduce((s, r) => s + val(r.pcs, r.kg), 0), colOf(STG[k])]); }
  bars.push(['ready', 'Ready to dispatch', T.ready, colOf('Cleared for dispatch')], ['short', 'Short (to make again)', T.short, 'var(--bad)']);
  PH = { ph, stageRows };
  const mx = Math.max(1, ...bars.map((b) => b[2]));
  box.innerHTML = bars.filter((b) => b[2] > 0).map(([k, l, v, c]) => `<div class="fb" ondblclick="phDrill('${k}')" title="Double-click for the lines"><span>${esc(l)}</span><div class="tr"><i style="width:${(v / mx * 100).toFixed(1)}%;background:${c}"></i></div><b>${nf(v)}</b><span class="note">${T.open ? (v / T.open * 100).toFixed(1) + '% of open' : ''}</span></div>`).join('')
    + `<p class="note">${lines.length} open order lines · ${nf(T.open)} ${uL()} open</p>`;
}
function phDrill(k) {
  if (!PH) return;
  if (k[0] === 's' && k !== 'short') { const st = +k.slice(1); showItems(STG[st] + ' · open order lines', 'Batch items of open order lines in this stage', PH.stageRows.get(st) || []); return; }
  const t = { awaitWo: 'Awaiting work order', woNotBatched: 'Work order, not batched', ready: 'Ready to dispatch', short: 'Short (to make again)' }[k];
  linesTable(t, PH.ph[k] || []);
}
