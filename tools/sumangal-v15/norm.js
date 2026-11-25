// ---- Data normalisation (runs before V13's code): history from 2022, short customer names, casting weight everywhere
(function () {
  const base = D.items.length;
  D.custFull = H.cust; D.cust = H.cust.map((c, i) => H.short[i] || c);
  D.parts = H.parts; D.rsn = H.rsn; D.rdep = H.rdep; D.vendors = H.vendors; D.dwg = H.dwg;
  for (const it of H.items) D.items.push(it);
  for (let i = base; i < D.items.length; i++) { const it = D.items[i]; let l = it[5]; for (const st of it[7]) for (const r of st) if (r[0] > l) l = r[0]; it.h = 1; it.last = l; }
  const baseOrd = D.ord.length;
  S.it.push(...H.sit); D.rej.push(...H.rej); D.disp.push(...H.disp); D.ord.push(...H.ord);
  for (let j = baseOrd; j < D.ord.length; j++) D.ord[j].h = 1; // history order lines: in trends and analyses, never counted as open work
  // 2022–23 challans and vendor receipts (this line had been swallowed into the comment above, so they never arrived).
  // Like history orders: in trends, scrap and vendor performance, never as material out today (26 history challans
  // are still open in the ERP, ~69,000 pieces, almost surely receipts never booked; openQ and vendorPerf skip them).
  const baseVend = D.vend.length; D.vend.push(...H.vend); D.rcv.push(...H.rcv);
  for (let j = baseVend; j < D.vend.length; j++) D.vend[j].h = 1;
  S.plan = S.plan || []; while (S.plan.length < D.ord.length) S.plan.push(0);
  // casting weight is the standard: every kg = pieces x the die's casting weight
  const cw = (p) => (D.parts[p] ? D.parts[p][2] : 0);
  for (const r of D.disp) { r[8] = r[5]; r[5] = +(r[4] * cw(r[2])).toFixed(1); }
  for (const r of D.rcv) { r[8] = r[6]; r[6] = +(r[4] * cw(r[3])).toFixed(1); }
  for (const v of D.vend) { v[5] = +(v[4] * cw(v[2])).toFixed(1); }
  // the customers each part is made, ordered, shipped or stocked for: the customer filter's test for a line that
  // carries only the part (challans, vendor receipts, scrap), instead of the die master's single customer
  D.pcs = [];
  const addPC = (p, c) => { if (p == null || c == null || c < 0) return; (D.pcs[p] || (D.pcs[p] = new Set())).add(c); };
  for (const it of D.items) addPC(it[2], it[1]);
  for (const o of D.ord) addPC(o[4], o[3]);
  for (const r of D.disp) addPC(r[2], r[1]);
  for (const r of D.rfd) addPC(r[2], r[1]);
  D.end = D.end || '2026-10-20';
})();
