/**
 * The dashboard's downloads (2026-10-01): "give ways to download the data to do
 * further analysis across all the tabs". Every tab turns the data it already
 * holds into FLAT tables — one row per fact, one column per measure, numbers as
 * numbers, a blank for "not known" (never 0) — and offers them as an Excel
 * workbook (one sheet per table) or one CSV per table.
 *
 * No library: package.json carries no spreadsheet package, and an .xlsx is a zip
 * of a few XML files, so the writer here is ~100 lines (a zip with the entries
 * STORED, not compressed — these files are small and every reader accepts it).
 *
 * Everything above `downloadTables` is pure, so the jsdom test drives the row
 * builders and reads the workbook back.
 */
import type {
  DashMachine, DashOrder, DashWorkOrder, DashContractor, MachinesDashboard, ReasonLegend, TimeBucket, TreeRow, TypePathNode,
} from '../api/dashboard';

export type Cell = string | number | boolean | null | undefined;
export interface Table { name: string; columns: string[]; rows: Cell[][] }

/** A number, or blank when it is missing or not finite. */
const n = (v: number | null | undefined): Cell => (v == null || !Number.isFinite(v) ? null : v);
const r1 = (v: number): number => Math.round(v * 10) / 10;

/* =====================================================================================
 * BY MACHINE
 * ================================================================================== */

/** Columns "Type level 1 … n" (named by the level when the data names it), then the type path of one machine. */
function typeColumns(machines: DashMachine[]): { headers: string[]; of: (m: DashMachine) => Cell[] } {
  const depth = Math.max(1, ...machines.map((m) => m.type?.path?.length ?? (m.type ? 1 : 0)));
  const label = (d: number) => machines.map((m) => m.type?.path?.[d]?.level).find(Boolean) ?? `level ${d + 1}`;
  const headers = Array.from({ length: depth }, (_, d) => `Type ${label(d)}`);
  const of = (m: DashMachine): Cell[] => {
    const path: TypePathNode[] = m.type?.path ?? (m.type ? [{ id: m.type.id, name: m.type.name, depth: 0 }] : []);
    return Array.from({ length: depth }, (_, d) => path[d]?.name ?? null);
  };
  return { headers, of };
}

/** Every reason the data knows (the legend), else those seen on the machines. */
function reasonList(data: MachinesDashboard, machines: DashMachine[]): { id: number; code: string | null; label: string }[] {
  const legend = data.time?.reasons ?? [];
  if (legend.length) return legend.map((r: ReasonLegend) => ({ id: r.reasonId, code: r.code, label: r.label }));
  const seen = new Map<number, { id: number; code: string | null; label: string }>();
  for (const m of machines) for (const r of m.reasons) if (!seen.has(r.id)) seen.set(r.id, { id: r.id, code: r.code, label: r.label });
  return [...seen.values()];
}

/**
 * Three tables for the machines shown (the type chips and the search apply):
 *   Machine days    one row per machine per day: type path, shift / run / overtime / stop /
 *                   not-recorded minutes, utilisation, operations, pieces, tonnes, and one
 *                   column per stop reason (minutes)
 *   Machine summary one row per machine for the period: status, the same measures,
 *                   standard minutes, and one column per time bucket (Running, Break,
 *                   Not recorded, each stop reason) in minutes
 *   Shift time      the buckets in long form: machine × bucket, minutes, % of the shift
 */
export function machinesTables(data: MachinesDashboard, machines: DashMachine[] = data.machines): Table[] {
  const tc = typeColumns(machines);
  const reasons = reasonList(data, machines);
  const days: Table = {
    name: 'Machine days',
    columns: ['Machine code', 'Machine', ...tc.headers, 'Date', 'Shift min (net of break)', 'Run min', 'Run in shift min', 'Overtime min', 'Stop min', 'Stop in shift min',
      'Not recorded min', 'Utilisation %', 'Operations done', 'Pieces good', 'Pieces scrap', 'Tonnes', ...reasons.map((r) => `Stop: ${r.label} (min)`)],
    rows: [],
  };
  for (const m of machines) {
    for (const d of m.days) {
      days.rows.push([
        m.code, m.name, ...tc.of(m), d.date, d.shift, d.run, d.runIn, m.hasShifts ? d.overtime : null, d.stop, n(d.stopIn), n(d.notRecorded),
        d.shift > 0 ? r1((d.runIn / d.shift) * 100) : null, n(d.ops), n(d.pieces), n(d.scrap), d.tonnes,
        ...reasons.map((r) => (d.reasons ? (d.reasons[String(r.id)] ?? 0) : null)),
      ]);
    }
  }

  const bucketCols = (() => {
    const cols = new Map<string, string>([['run', 'Running'], ['break', 'Break'], ['unrecorded', 'Not recorded']]);
    for (const r of reasons) cols.set(`reason:${r.id}`, r.label);
    return [...cols.entries()];
  })();
  const minutesOf = (m: DashMachine, key: string): Cell => (m.time && !m.time.noShift ? (m.time.buckets.find((b: TimeBucket) => b.key === key)?.minutes ?? 0) : null);
  const summary: Table = {
    name: 'Machine summary',
    columns: ['Machine code', 'Machine', ...tc.headers, 'Status now', 'Has shifts', 'Shift window min', 'Shift min (net of break)', 'Run min', 'Run in shift min', 'Overtime min', 'Stop min',
      'Stop in shift min', 'Not recorded min', 'Utilisation %', 'Operations done', 'Steps worked', 'Pieces good', 'Pieces scrap', 'Tonnes', 'Jobs not weighed',
      'Standard min earned', 'Standard coverage %', 'Performance %', ...bucketCols.map(([, label]) => `Time: ${label} (min)`)],
    rows: machines.map((m) => [
      m.code, m.name, ...tc.of(m), m.now.state, m.hasShifts, n(m.time?.shiftMinutes), m.shiftMin, m.runMin, m.runInShiftMin, n(m.overtimeMin), m.stopMin,
      m.stopInShiftMin, m.notRecordedMin, n(m.utilisationPct), m.output.operationsDone, m.output.stepsWorked, m.output.piecesGood, m.output.piecesScrap, n(m.output.tonnes),
      m.output.unweighedSessions, m.standard.earnedMin, n(m.standard.coveragePct), n(m.standard.performancePct),
      ...bucketCols.map(([key]) => minutesOf(m, key)),
    ]),
  };

  const long: Table = {
    name: 'Shift time',
    columns: ['Machine code', 'Machine', ...tc.headers, 'Bucket', 'Kind', 'Reason code', 'Minutes', '% of shift window', 'Stops'],
    rows: [],
  };
  for (const m of machines) {
    if (!m.time || m.time.shiftMinutes <= 0) continue;
    for (const b of m.time.buckets) {
      long.rows.push([m.code, m.name, ...tc.of(m), b.label, b.kind, b.code ?? null, b.minutes, r1((b.minutes / m.time.shiftMinutes) * 100), n(b.stops)]);
    }
  }
  return [days, summary, long];
}

/* =====================================================================================
 * BY ORDER
 * ================================================================================== */

/**
 * Orders shown (the risk chip and the search apply):
 *   Orders    one row per order: risk, dates, % complete, tonnes, holds, material,
 *             bottleneck and — only when the reader may see money — value, invoiced, material issued
 *   Lines     one row per order line
 *   Stages    one row per order × operation (the flow strip)
 *   Short material  one row per order × short item
 */
export function ordersTables(orders: DashOrder[], withMoney: boolean): Table[] {
  const t: Table = {
    name: 'Orders',
    columns: ['Order', 'Revision', 'Title', 'Customer', 'Type', 'Plan priority', 'Risk', 'Risk detail', 'Committed date', 'Forecast date', 'Pace forecast', 'Plan forecast',
      'Days left', 'Slip days', '% complete', 'Progress basis', 'Tonnes total', 'Tonnes made', 'Tonnes dispatched', 'Lines', 'Lines released',
      'Period work min', 'Period % gained', 'Period tonnes made', 'Period tonnes dispatched', 'Steps on hold', 'Steps waiting for material',
      'Bottleneck operation', 'Bottleneck % of work left', 'Material items', 'Material in stock', 'Material on order', 'Material to buy',
      ...(withMoney ? ['Order value (before tax)', 'Invoiced (before tax)', 'Material issued cost'] : [])],
    rows: orders.map((o) => [
      o.code, o.revision, o.title, o.customer?.name ?? null, o.orderType, n(o.planPriority), o.risk.status, o.risk.why, o.committedDate, o.forecast.date, o.forecast.pace, o.forecast.plan,
      n(o.risk.daysLeft), n(o.risk.slipDays), o.progress.pct, o.progress.basis, n(o.tonnes.total), n(o.tonnes.made), n(o.tonnes.dispatched), o.lines.total, o.lines.released,
      o.period.workMin, o.period.pctGained, n(o.period.tonnesMade), n(o.period.tonnesDispatched), o.blocked.onHold, o.blocked.materialSteps,
      o.bottleneck?.name ?? null, n(o.bottleneck?.sharePct), o.material.items, o.material.inStock, o.material.onOrder, o.material.toBuy,
      ...(withMoney ? [n(o.money?.value), n(o.money?.invoiced), n(o.money?.materialCost)] : []),
    ]),
  };
  const lines: Table = {
    name: 'Lines',
    columns: ['Order', 'Line', 'Item code', 'Item', 'Quantity', 'Made', 'Delivered', 'Released', 'Committed date', '% complete', 'Progress basis', 'Steps',
      'Tonnes total', 'Tonnes made', 'Tonnes dispatched', 'Period work min', 'Period % gained', 'Plan: first ship', 'Plan: last ship', ...(withMoney ? ['Line amount (before tax)'] : [])],
    rows: orders.flatMap((o) => o.lineRows.map((l) => [
      o.code, l.lineNo, l.item.code, l.item.name, l.quantity, l.made, l.delivered, l.released, l.committedDate, l.progressPct, l.basis, l.stepsTotal,
      n(l.tonnes), n(l.tonnesMade), n(l.tonnesDispatched), l.period.workMin, l.period.pctGained, l.plan?.first ?? null, l.plan?.last ?? null,
      ...(withMoney ? [n(l.amount)] : []),
    ])),
  };
  const stages: Table = {
    name: 'Stages',
    columns: ['Order', 'Operation code', 'Operation', 'Steps', 'Done', 'In progress', 'On hold', 'With a contractor', '% done', 'Work min left'],
    rows: orders.flatMap((o) => o.stages.map((s) => [o.code, s.code, s.name, s.steps, s.done, s.inProgress, s.onHold, s.contracted, s.pctDone, n(s.workMinLeft)])),
  };
  const shortMaterial: Table = {
    name: 'Short material',
    columns: ['Order', 'Item code', 'Item', 'UoM', 'Needed', 'Issued', 'Reserved', 'Short', 'Steps waiting', 'Free stock now', 'On order', 'Expected', 'Status'],
    rows: orders.flatMap((o) => o.material.short.map((m) => [o.code, m.code, m.name, m.uom, m.needed, m.issued, m.reserved, m.short, m.shortSteps, m.freeNow, m.onOrder, m.expected, m.status])),
  };
  return [t, lines, stages, shortMaterial];
}

/** "Download full (all levels)": one row per piece / part of every released line (GET /dashboard/orders/tree-rows). */
export function treeTable(rows: TreeRow[], orderCodes?: Set<string>): Table {
  const kept = orderCodes ? rows.filter((r) => orderCodes.has(r.orderCode)) : rows;
  return {
    name: 'Piece tree',
    columns: ['Order', 'Line', 'Piece code', 'Parent code', 'Level', 'Name', 'Item code', 'Quantity', 'Piece no', 'Operations', 'Done', 'In progress', 'On hold', 'With a contractor', '% complete', 'Blocked'],
    rows: kept.map((r) => [r.orderCode, r.lineNo, r.code, r.parentCode, r.level, r.name, r.itemCode, r.quantity, r.pieceNo, r.steps, r.stepsDone, r.inProgress, r.onHold, r.contracted, n(r.pct), r.blocked]),
  };
}

/* =====================================================================================
 * WORK ORDERS
 * ================================================================================== */

/**
 * Work orders shown (the contractor chip, status chip and search apply):
 *   Work orders       one row per work order
 *   Work order operations  one row per work order × operation
 *   Contractors       one row per contractor (of the work orders shown)
 */
export function workOrdersTables(workOrders: DashWorkOrder[], contractors: DashContractor[]): Table[] {
  const shownContractors = new Set(workOrders.map((w) => w.contractor.id));
  const wo: Table = {
    name: 'Work orders',
    columns: ['Work order', 'Status', 'Contractor code', 'Contractor', 'Order', 'Line', 'Item code', 'Item', 'Pieces', 'Operations assigned', 'Operations released', 'Operations done',
      'Operations in progress', 'Operations on hold', '% complete', 'Released', 'Start date', 'Due date', 'Overdue days', 'First started', 'Last activity', 'Done this period (operations)'],
    rows: workOrders.map((w) => [
      w.code, w.status, w.contractor.code, w.contractor.name, w.order.code, w.line.lineNo, w.line.itemCode, w.line.itemName, w.pieces,
      w.operations.assigned, w.operations.steps, w.operations.done, w.operations.inProgress, w.operations.onHold, n(w.operations.pct), w.released, w.startDate, w.dueDate,
      w.overdue ? w.daysOverdue : null, w.firstStartedAt, w.lastActivityAt, w.period.opsDone,
    ]),
  };
  const ops: Table = {
    name: 'Work order operations',
    columns: ['Work order', 'Status', 'Contractor', 'Order', 'Line', 'Operation code', 'Operation', 'Assigned', 'Released', 'Done', 'In progress', 'On hold', '% complete', 'Done this period (operations)'],
    rows: workOrders.flatMap((w) => w.byOperation.map((o) => [w.code, w.status, w.contractor.name, w.order.code, w.line.lineNo, o.code, o.name, o.assigned, o.steps, o.done, o.inProgress, o.onHold, n(o.pct), o.periodOps])),
  };
  const con: Table = {
    name: 'Contractors',
    columns: ['Contractor code', 'Contractor', 'Work orders', 'Open', 'Active (issued / in progress)', 'Operations assigned', 'Operations released', 'Operations done', '% complete', 'Overdue', 'Done this period (operations)'],
    rows: contractors.filter((c) => shownContractors.has(c.id)).map((c) => [c.code, c.name, c.workOrders, c.open, c.active, c.assigned, c.steps, c.done, n(c.pct), c.overdue, c.periodOps]),
  };
  return [wo, ops, con];
}

/* =====================================================================================
 * FILES: file names, CSV, XLSX
 * ================================================================================== */

/** dashboard-machines-2026-09-28_2026-10-01 (+ -<table> for a CSV of one table of several). */
export function fileStem(tab: string, from: string, to: string, table?: string): string {
  const slug = table ? `-${table.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
  return `dashboard-${tab}${slug}-${from}_${to}`;
}

/** RFC 4180: quote a cell holding a comma, quote or line break. A boolean is TRUE / FALSE. */
export function toCsv(t: Table): string {
  const cell = (v: Cell): string => {
    if (v == null) return '';
    const s = typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Characters XML 1.0 cannot carry (control characters other than tab, CR, LF; U+FFFE / U+FFFF). */
const xmlSafe = (s: string) => [...s].filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13 ? c !== 0xfffe && c !== 0xffff : false; }).join('');
const esc = (s: string) => xmlSafe(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A1-style column letters: 0 → A, 26 → AA. */
export const colName = (i: number): string => { let s = ''; let x = i; do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0); return s; };

/** Sheet names: ≤ 31 characters, none of []:*?/\, unique. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 31 - String(k).length - 1)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(t: Table): string {
  const widths = t.columns.map((c, i) => {
    let w = c.length;
    for (const r of t.rows.slice(0, 200)) { const v = r[i]; if (v != null) w = Math.max(w, String(v).length); }
    return Math.min(48, Math.max(8, w + 2));
  });
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const cellXml = (v: Cell, ref: string, style?: number): string => {
    if (v == null || v === '') return '';
    const s = style ? ` s="${style}"` : '';
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : '';
    if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  };
  const rowXml = (cells: Cell[], rowNo: number, style?: number) => `<row r="${rowNo}">${cells.map((v, i) => cellXml(v, `${colName(i)}${rowNo}`, style)).join('')}</row>`;
  const lastRef = `${colName(Math.max(0, t.columns.length - 1))}${t.rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:${lastRef}"/>`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `${cols}<sheetData>${rowXml(t.columns, 1, 1)}${t.rows.map((r, i) => rowXml(r, i + 2)).join('')}</sheetData>`
    + `<autoFilter ref="A1:${lastRef}"/></worksheet>`;
}

const enc = new TextEncoder();
let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[i] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every entry stored (method 0). */
export function zipStore(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array<ArrayBuffer> {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true);
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, time); u16(lv, 12, date);
    u32(lv, 14, crc); u32(lv, 18, f.data.length); u32(lv, 22, f.data.length); u16(lv, 26, name.length); u16(lv, 28, 0);
    local.set(name, 30);
    chunks.push(local, f.data);
    const c = new Uint8Array(46 + name.length);
    const cv = new DataView(c.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, time); u16(cv, 14, date);
    u32(cv, 16, crc); u32(cv, 20, f.data.length); u32(cv, 24, f.data.length); u16(cv, 28, name.length);
    u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
    c.set(name, 46);
    central.push(c);
    offset += local.length + f.data.length;
  }
  const cdSize = central.reduce((t, c) => t + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((t, c) => t + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

/** An .xlsx workbook, one sheet per table (header row bold and frozen, with a filter). */
export function buildXlsx(tables: Table[]): Uint8Array<ArrayBuffer> {
  const names = sheetNames(tables.map((t) => t.name));
  const NS = 'http://schemas.openxmlformats.org/';
  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { name: '_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets>${names.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS}package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${tables.length + 1}" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${NS}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`) },
    ...tables.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(t)) })),
  ];
  return zipStore(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Save bytes as a file (an anchor click, as the tables' CSV export does). */
export function saveFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** The byte-order mark lets Excel read a UTF-8 CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
export const saveCsv = (name: string, t: Table) => saveFile(`${name}.csv`, `${BOM}${toCsv(t)}`, 'text/csv;charset=utf-8');
export const saveXlsx = (name: string, tables: Table[]) => saveFile(`${name}.xlsx`, buildXlsx(tables), XLSX_MIME);
