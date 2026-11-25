// ---- Fixed colours (user, 2026-11-25: the same colour for the same process everywhere, whatever the filters).
// Every process / step / department has one colour on every chart. Anything else (a vendor, a customer, a reason)
// takes a colour from its name, so it keeps it when filters change what else is on the chart.
// ONE palette for the whole dashboard (user, 2026-11-25: colours that look like one piece, easy to tell apart,
// in the platform's style, and meaningful: green = right, red = wrong).
//  - SEM: meaning. good (green) / bad (red) / warn (amber) are used ONLY for good, bad and needs-attention.
//  - AGE: the age scale on every aged table and chart, fresh → old: mint, grey, light amber, amber, red.
//  - PCOLS: processes, one family per area, two shades (light = first step, dark = second); no green or red here.
//  - main / mainLight: a plain measure (output, turnaround, sizes) and a second series of it; targets use INK().
const SEM = { good: '#0E9F6E', bad: '#E11D48', warn: '#D97706', neutral: '#A1A1AA', main: '#7C3AED', mainLight: '#A78BFA' };
const AGE = ['#6EE7B7', '#CBD5E1', '#FCD34D', '#F59E0B', '#E11D48'];
const PCOLS = {
  plan1: '#94A3B8', plan2: '#64748B', // planning (slate): PO received, WO pending · WO released, PRC pending
  inj: '#A78BFA', wax: '#7C3AED', // wax room (violet): injection · wax assembly; department "Wax"
  coat: '#38BDF8', dewax: '#0369A1', // shell (sky): coating · de-waxing
  melt: '#FB923C', ko: '#C2410C', // foundry (orange): melting / poured · knock-out
  ht: '#C026D3', htv: '#E879F9', // heat treatment (fuchsia): in-house final pass · at vendors
  cfet: '#0891B2', fet: '#67E8F9', // fettling (cyan): contract (in-house) · at vendors
  mach: '#4F46E5', turn: '#A5B4FC', // machining (indigo): machining; "M/C Rej." · turning
  qc: '#CA8A04', mi: '#FACC15', // inspection (gold): final inspection · machining inspection
  clr: '#34D399', disp: '#0E9F6E', // done (green, the one place green is a process: finished is the right state)
  dev: '#78716C', other: '#A1A1AA', // development (stone) · other
};
const PKEYS = [
  [/heat treatment at vendors|of which at ht vendors/, 'htv'], [/machining inspection/, 'mi'], [/contract fettling|^fettling - a$/, 'cfet'],
  [/fettling/, 'fet'], [/machining|^m\/c rej/, 'mach'], [/turning/, 'turn'], [/^wo pending|po received/, 'plan1'], [/^prc pending|wo released/, 'plan2'],
  [/injection|not started|^wax$/, 'inj'], [/wax assembly|^assembly/, 'wax'], [/de-?waxing/, 'dewax'], [/^coating|shell/, 'coat'],
  [/melting|poured|pouring/, 'melt'], [/knock-?out/, 'ko'], [/heat treatment|^ht\b/, 'ht'], [/final inspection|^inspection|\(qc\)|^qc/, 'qc'],
  [/clearance|cleared/, 'clr'], [/dispatch/, 'disp'], [/development/, 'dev'], [/^others?$/, 'other'],
];
// names (vendors, customers, reasons): the process families' mid shades, never green or red
const HCOLS = ['#7C3AED', '#0891B2', '#C026D3', '#FB923C', '#4F46E5', '#CA8A04', '#0369A1', '#64748B', '#A78BFA', '#38BDF8', '#E879F9', '#C2410C', '#A5B4FC', '#78716C'];
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
window.SEM = SEM; window.AGE = AGE;
