import { dayLabel, firstPeriodFrom, monthShort, periodContaining } from './periods';
import type { EngineOptions, EvalLabels, Period, Plan, PlannerLine, PlannerOrder, PlannerSnapshot, PlannerUnit } from './types';

/**
 * The per-snapshot index every engine call shares (cached by snapshot object).
 * Units, functions, periods and supply lots are addressed by integer position.
 */
export interface Model {
  snap: PlannerSnapshot;
  periods: Period[];
  P: number;
  periodIdx: Map<string, number>;
  months: string[];
  /** month position of each period */
  periodMonth: Int32Array;
  /** [first, last] period positions of each month */
  monthRange: [number, number][];

  units: PlannerUnit[];
  N: number;
  unitIdx: Map<string, number>;
  children: number[][];
  /** parent position, -1 for none (root pieces point at their line unit when it exists) */
  parent: Int32Array;
  /** 0 for a line unit, else the piece depth */
  depth: Int32Array;
  /** start units of each order line (its line unit, else its root pieces) */
  lineTops: Map<string, number[]>;
  lines: Map<string, { line: PlannerLine; order: PlannerOrder }>;
  /** groups a unit covers → mark count */
  covers: Map<string, number>[];
  groupTotal: Map<string, number>;
  /** groups in first-seen order (unit order) */
  groups: string[];
  /** unit priority position: order rank, line no, committed date, unit order */
  prio: Int32Array;
  committed: (string | null)[];

  F: number;
  fnKeys: string[];
  fnNames: string[];
  unlimited: boolean[];
  /** capacity flat [f * P + p]; Infinity when unlimited */
  cap: Float64Array;
  /** per unit: function positions and minutes (minutes > 0 only) */
  workFn: Int32Array[];
  workMin: Float64Array[];
  lead: Int32Array;

  /** supply */
  itemPos: Map<string, number>;
  itemIds: string[];
  itemLots: [number, number][];
  lotQty: Float64Array;
  /** earliest lead-start period position a lot allows (P = beyond the horizon) */
  lotPeriod: Int32Array;
  lotDate: string[];
  lotSource: string[];
  lotItem: Int32Array;
  /** per unit: item positions (−1 = item has no supply at all) and quantities */
  matItem: Int32Array[];
  matQty: Float64Array[];
  matItemId: string[][];

  labels: EvalLabels;
}

const cache = new WeakMap<PlannerSnapshot, Model>();

export function getModel(snap: PlannerSnapshot): Model {
  let m = cache.get(snap);
  if (!m) {
    m = buildModel(snap);
    cache.set(snap, m);
  }
  return m;
}

const cmpStr = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

function buildModel(snap: PlannerSnapshot): Model {
  const periods = snap.horizon.periods;
  const P = periods.length;
  const periodIdx = new Map(periods.map((p, i) => [p.key, i]));
  const months: string[] = [];
  const periodMonth = new Int32Array(P);
  const monthRange: [number, number][] = [];
  periods.forEach((p, i) => {
    if (months[months.length - 1] !== p.month) {
      months.push(p.month);
      monthRange.push([i, i]);
    }
    periodMonth[i] = months.length - 1;
    monthRange[months.length - 1][1] = i;
  });

  // orders and lines
  const lines = new Map<string, { line: PlannerLine; order: PlannerOrder }>();
  const orders = [...snap.orders].sort((a, b) => {
    const pa = a.priority ?? Infinity, pb = b.priority ?? Infinity;
    if (pa !== pb) return pa - pb;
    const c = cmpStr(a.committedDate, b.committedDate);
    if (c) return c;
    return String(a.code).localeCompare(String(b.code)) || String(a.id).localeCompare(String(b.id));
  });
  const orderRank = new Map<string, number>();
  const orderById = new Map<string, PlannerOrder>();
  orders.forEach((o, i) => {
    orderRank.set(String(o.id), i);
    orderById.set(String(o.id), o);
    for (const l of o.lines) lines.set(String(l.id), { line: l, order: o });
  });

  // units
  const units = snap.units;
  const N = units.length;
  const unitIdx = new Map<string, number>();
  units.forEach((u, i) => unitIdx.set(u.key, i));
  const depth = new Int32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const lineUnit = new Map<string, number>();
  units.forEach((u, i) => {
    depth[i] = u.pieceId == null ? 0 : Number(u.depth) || 0;
    if (u.pieceId == null) lineUnit.set(String(u.lineId), i);
  });
  const children: number[][] = Array.from({ length: N }, () => []);
  const rootsByLine = new Map<string, number[]>();
  units.forEach((u, i) => {
    let p = u.parentKey != null ? (unitIdx.get(u.parentKey) ?? -1) : -1;
    if (p < 0 && u.pieceId != null) {
      const lu = lineUnit.get(String(u.lineId));
      if (lu !== undefined) p = lu;
      else {
        const arr = rootsByLine.get(String(u.lineId)) ?? [];
        arr.push(i);
        rootsByLine.set(String(u.lineId), arr);
      }
    }
    parent[i] = p;
    if (p >= 0) children[p].push(i);
  });
  const lineTops = new Map<string, number[]>();
  for (const [lid, lu] of lineUnit) lineTops.set(lid, [lu]);
  for (const [lid, arr] of rootsByLine) if (!lineTops.has(lid)) lineTops.set(lid, arr);

  // groups and covers (bottom-up by depth)
  const groupTotal = new Map<string, number>();
  const groups: string[] = [];
  const seen = new Set<string>();
  units.forEach((u) => {
    if (!seen.has(u.groupKey)) {
      seen.add(u.groupKey);
      groups.push(u.groupKey);
    }
    if (u.isMark) groupTotal.set(u.groupKey, (groupTotal.get(u.groupKey) ?? 0) + 1);
  });
  const hasMarks = new Set(groupTotal.keys());
  for (const g of groups) if (!groupTotal.has(g)) groupTotal.set(g, 1); // a line without marks = its root is the mark
  const covers: Map<string, number>[] = new Array(N);
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => depth[b] - depth[a] || b - a);
  for (const i of order) {
    const c = new Map<string, number>();
    const u = units[i];
    if (u.isMark) c.set(u.groupKey, 1);
    for (const ch of children[i]) for (const [g, n] of covers[ch]) c.set(g, (c.get(g) ?? 0) + n);
    if (!c.size && !hasMarks.has(u.groupKey)) c.set(u.groupKey, 1);
    covers[i] = c;
  }

  // priority
  const committed = units.map((u) => u.committedDate ?? orderById.get(String(u.orderId))?.committedDate ?? null);
  // Inside a line, units dragged into an order come first, in that order (snapshot.ranks, §38).
  const ranks = snap.ranks ?? {};
  const pos = Array.from({ length: N }, (_, i) => i).sort((a, b) => {
    const ua = units[a], ub = units[b];
    const ra = orderRank.get(String(ua.orderId)) ?? 1e9, rb = orderRank.get(String(ub.orderId)) ?? 1e9;
    if (ra !== rb) return ra - rb;
    const la = lines.get(String(ua.lineId))?.line.lineNo ?? 1e9, lb = lines.get(String(ub.lineId))?.line.lineNo ?? 1e9;
    if (la !== lb) return la - lb;
    if (String(ua.lineId) !== String(ub.lineId)) return String(ua.lineId) < String(ub.lineId) ? -1 : 1;
    const ka = ranks[ua.key] ?? Infinity, kb = ranks[ub.key] ?? Infinity;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return cmpStr(committed[a], committed[b]) || a - b;
  });
  const prio = new Int32Array(N);
  pos.forEach((u, r) => (prio[u] = r));

  // functions
  const fnKeys: string[] = [];
  const fnNames: string[] = [];
  const unlimited: boolean[] = [];
  const fnPos = new Map<string, number>();
  for (const f of snap.functions) {
    if (fnPos.has(f.key)) continue;
    fnPos.set(f.key, fnKeys.length);
    fnKeys.push(f.key);
    fnNames.push(f.name);
    unlimited.push(!!f.unlimited || f.key === 'contractor');
  }
  for (const u of units) for (const k of Object.keys(u.work || {})) {
    if (!fnPos.has(k)) { // work on a function the snapshot does not list: counted, never limiting
      fnPos.set(k, fnKeys.length);
      fnKeys.push(k);
      fnNames.push(k);
      unlimited.push(true);
    }
  }
  const F = fnKeys.length;
  const cap = new Float64Array(F * P);
  const avg = new Float64Array(F);
  snap.functions.forEach((f) => {
    const fi = fnPos.get(f.key)!;
    let sum = 0;
    for (let p = 0; p < P; p++) {
      const c = unlimited[fi] ? Infinity : Math.max(0, Number(f.capacity?.[periods[p].key]) || 0);
      cap[fi * P + p] = c;
      sum += c;
    }
    avg[fi] = P ? sum / P : 0;
  });
  for (let fi = snap.functions.length; fi < F; fi++) for (let p = 0; p < P; p++) cap[fi * P + p] = Infinity;
  for (let fi = 0; fi < F; fi++) if (unlimited[fi]) for (let p = 0; p < P; p++) cap[fi * P + p] = Infinity;

  const workFn: Int32Array[] = new Array(N);
  const workMin: Float64Array[] = new Array(N);
  const lead = new Int32Array(N);
  units.forEach((u, i) => {
    const fs: number[] = [], ms: number[] = [];
    let ratio = 0;
    for (const [k, v] of Object.entries(u.work || {})) {
      const min = Number(v) || 0;
      if (min <= 0) continue;
      const fi = fnPos.get(k)!;
      fs.push(fi);
      ms.push(min);
      if (!unlimited[fi]) ratio = Math.max(ratio, avg[fi] > 0 ? min / (0.6 * avg[fi]) : Infinity);
    }
    workFn[i] = Int32Array.from(fs);
    workMin[i] = Float64Array.from(ms);
    lead[i] = Math.min(4, Math.max(1, Math.ceil(ratio - 1e-9)));
  });

  // supply
  const itemPos = new Map<string, number>();
  const itemIds: string[] = [];
  const itemLots: [number, number][] = [];
  const qty: number[] = [], li: number[] = [], lp: number[] = [], ld: string[] = [], ls: string[] = [];
  for (const [id, item] of Object.entries(snap.supply || {})) {
    const lots = [...(item.lots || [])].filter((l) => Number(l.qty) > 0).sort((a, b) => {
      const sa = a.source === 'stock' ? 0 : 1, sb = b.source === 'stock' ? 0 : 1;
      return sa - sb || cmpStr(a.date, b.date) || String(a.source).localeCompare(String(b.source));
    });
    itemPos.set(String(id), itemIds.length);
    itemIds.push(String(id));
    const start = qty.length;
    for (const l of lots) {
      qty.push(Number(l.qty));
      li.push(itemIds.length - 1);
      let p: number;
      if (l.received || l.source === 'stock') p = Math.max(0, periodContaining(periods, l.date));
      else p = firstPeriodFrom(periods, l.date);
      lp.push(Math.min(p, P));
      ld.push(l.date);
      ls.push(l.source);
    }
    itemLots.push([start, qty.length]);
  }
  const matItem: Int32Array[] = new Array(N);
  const matQty: Float64Array[] = new Array(N);
  const matItemId: string[][] = new Array(N);
  units.forEach((u, i) => {
    const agg = new Map<string, number>();
    for (const mt of u.materials || []) {
      const q = Number(mt.qty) || 0;
      if (q > 0) agg.set(String(mt.itemId), (agg.get(String(mt.itemId)) ?? 0) + q);
    }
    const ids = [...agg.keys()];
    matItemId[i] = ids;
    matItem[i] = Int32Array.from(ids.map((id) => itemPos.get(id) ?? -1));
    matQty[i] = Float64Array.from(ids.map((id) => agg.get(id)!));
  });

  // labels
  const levelWord = (u: PlannerUnit) => {
    const l = lines.get(String(u.lineId))?.line;
    const v = u.pieceId == null ? 'line' : String(u.depth);
    return l?.levels?.find((x) => String(x.value) === v)?.label ?? '';
  };
  const labels: EvalLabels = {
    periods: Object.fromEntries(periods.map((p) => [p.key, p.label])),
    months: Object.fromEntries(months.map((m) => [m, monthShort(m)])),
    functions: Object.fromEntries(fnKeys.map((k, i) => [k, fnNames[i]])),
    units: Object.fromEntries(units.map((u) => [u.key, u.code || u.name || u.key])),
    lines: Object.fromEntries(groups.map((g) => {
      const gi = unitIdx.get(g);
      if (gi === undefined) return [g, g];
      const u = units[gi];
      const w = levelWord(u);
      const name = u.code || u.name || g;
      return [g, w ? `${w} ${name}` : name];
    })),
  };

  return {
    snap, periods, P, periodIdx, months, periodMonth, monthRange,
    units, N, unitIdx, children, parent, depth, lineTops, lines, covers, groupTotal, groups, prio, committed,
    F, fnKeys, fnNames, unlimited, cap, workFn, workMin, lead,
    itemPos, itemIds, itemLots, lotQty: Float64Array.from(qty), lotPeriod: Int32Array.from(lp), lotDate: ld, lotSource: ls, lotItem: Int32Array.from(li),
    matItem, matQty, matItemId, labels,
  };
}

/** The level in force for an order line. */
export function levelOf(m: Model, lineId: string, opts?: EngineOptions): string {
  const o = opts?.levels?.[lineId];
  if (o != null) return String(o);
  return String(m.lines.get(lineId)?.line.level ?? 'line');
}

/**
 * Active units (see types.ts header) as unit positions, in unit order per line.
 * `extraKey` counts as planned (canPlace / trial placements).
 */
export function activeUnits(m: Model, plan: Plan, opts?: EngineOptions, extraKey?: string): number[] {
  const planned = (i: number) => m.units[i].key in plan || m.units[i].key === extraKey;
  // ancestors of planned units
  const hasPlannedBelow = new Uint8Array(m.N);
  const mark = (key: string) => {
    const i = m.unitIdx.get(key);
    if (i === undefined) return;
    for (let p = m.parent[i]; p >= 0 && !hasPlannedBelow[p]; p = m.parent[p]) hasPlannedBelow[p] = 1;
  };
  for (const k of Object.keys(plan)) mark(k);
  if (extraKey) mark(extraKey);

  const out: number[] = [];
  const lineIds = new Set<string>();
  for (const l of m.lines.keys()) lineIds.add(l);
  for (const l of m.lineTops.keys()) lineIds.add(l);
  const sorted = [...lineIds].sort((a, b) => {
    const ta = m.lineTops.get(a)?.[0] ?? 1e9, tb = m.lineTops.get(b)?.[0] ?? 1e9;
    return ta - tb;
  });
  for (const lid of sorted) {
    const tops = m.lineTops.get(lid);
    if (!tops) continue;
    const lv = levelOf(m, lid, opts);
    const target = lv === 'line' ? 0 : Number(lv) || 0;
    const stack = [...tops].reverse();
    while (stack.length) {
      const i = stack.pop()!;
      const kids = m.children[i];
      if (m.depth[i] >= target) {
        if (planned(i) || !hasPlannedBelow[i] || !kids.length) out.push(i);
        else for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
      } else if (!kids.length) out.push(i);
      else for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
    }
  }
  return out;
}

/** "14 Nov (PO-12)" */
export const materialWords = (date: string, source: string | null) =>
  source && source !== 'stock' ? `${dayLabel(date)} (${source})` : dayLabel(date);
