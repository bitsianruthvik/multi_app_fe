// ---- Fixed colours (user, 2026-11-25: the same colour for the same process everywhere, whatever the filters).
// Every process / step / department has one colour on every chart. Anything else (a vendor, a customer, a reason)
// takes a colour from its name, so it keeps it when filters change what else is on the chart.
const PCOLS = {
  plan1: '#64748B', // PO received, WO pending
  plan2: '#94A3B8', // WO released, PRC pending
  inj: '#CA8A04', // injection (wax patterns); department "Wax"
  wax: '#DB2777', // wax assembly
  coat: '#0891B2', // coating (shell)
  dewax: '#4338CA', // de-waxing
  melt: '#C2410C', // melting / poured
  ko: '#7C2D12', // knock-out
  ht: '#9333EA', // heat treatment
  htv: '#C084FC', // heat treatment at vendors
  cfet: '#0F766E', // contract fettling (in-house)
  fet: '#2DD4BF', // fettling at vendors
  mach: '#2563EB', // machining (vendors); "M/C Rej."
  turn: '#60A5FA', // turning
  qc: '#16A34A', // final inspection
  mi: '#65A30D', // machining inspection
  clr: '#6D28D9', // cleared / ready to dispatch
  disp: '#1E293B', // dispatched
  dev: '#475569', // development
  other: '#A1A1AA', // other / others
};
const PKEYS = [
  [/heat treatment at vendors|of which at ht vendors/, 'htv'], [/machining inspection/, 'mi'], [/contract fettling|^fettling - a$/, 'cfet'],
  [/fettling/, 'fet'], [/machining|^m\/c rej/, 'mach'], [/turning/, 'turn'], [/^wo pending|po received/, 'plan1'], [/^prc pending|wo released/, 'plan2'],
  [/injection|not started|^wax$/, 'inj'], [/wax assembly|^assembly/, 'wax'], [/de-?waxing/, 'dewax'], [/^coating|shell/, 'coat'],
  [/melting|poured|pouring/, 'melt'], [/knock-?out/, 'ko'], [/heat treatment|^ht\b/, 'ht'], [/final inspection|^inspection|\(qc\)|^qc/, 'qc'],
  [/clearance|cleared/, 'clr'], [/dispatch/, 'disp'], [/development/, 'dev'], [/^others?$/, 'other'],
];
const HCOLS = ['#6D28D9', '#0891B2', '#DB2777', '#CA8A04', '#4338CA', '#0F766E', '#C2410C', '#64748B', '#9333EA', '#2563EB', '#16A34A', '#BE123C', '#0369A1', '#A16207', '#7C3AED', '#059669'];
/** The process a label names, or '' (a WIP stage "X completed – Y pending" is the Y it waits for). */
function procKey(label) {
  let n = String(label || '').trim().toLowerCase();
  const m = n.match(/–\s*(.+?)\s+pending$/); if (m) n = m[1] === 'wo' ? 'wo pending' : m[1] === 'prc' ? 'prc pending' : m[1];
  if (/–\s*not started$/.test(String(label).toLowerCase())) n = 'not started';
  for (const [re, k] of PKEYS) if (re.test(n)) return k;
  return '';
}
const COLCACHE = new Map();
/** The colour of a label: its process's colour, else one from its name. */
function colOf(label) {
  const key = String(label || '');
  if (COLCACHE.has(key)) return COLCACHE.get(key);
  const k = procKey(key); let c;
  if (k) c = PCOLS[k];
  else { let h = 0; for (const ch of key.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; c = HCOLS[h % HCOLS.length]; }
  COLCACHE.set(key, c); return c;
}
window.colOf = colOf; window.procKey = procKey;
/** Reference lines (targets, "all selected"): the theme's text colour, so they show in dark mode too. */
const INK = () => getComputedStyle(document.documentElement).getPropertyValue('--c-text-2').trim() || '#5A5E78';
window.INK = INK;
