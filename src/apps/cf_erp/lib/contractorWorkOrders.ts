import type { ContractorGrid, GridRow, WoLane } from '../api/contractorWorkOrders';

/**
 * Pure helpers of the contractor work-order screens (Step 6). The grid's SELECTION is a set of cell keys
 * "<rowKey>|<operationId>" kept apart from what is shown, so it survives scrolling and filtering until "Clear".
 */

export const cellKey = (rowKey: string, operationId: number) => `${rowKey}|${operationId}`;
export const splitKey = (k: string) => { const i = k.lastIndexOf('|'); return { rowKey: k.slice(0, i), operationId: Number(k.slice(i + 1)) }; };

/** A cell that may be picked: in the row's flow, not with anybody, not started. */
export const pickable = (row: GridRow, operationId: number) => !!row.cells[operationId]?.editable;

/** Toggles one cell (only a pickable one). */
export function toggleCell(sel: ReadonlySet<string>, row: GridRow, operationId: number): Set<string> {
  const out = new Set(sel);
  const k = cellKey(row.key, operationId);
  if (out.has(k)) out.delete(k);
  else if (pickable(row, operationId)) out.add(k);
  return out;
}

/**
 * Adds (or, when all are picked already, removes) every pickable cell of these rows × operations — a row header, a
 * column header, or a Shift-click rectangle.
 */
export function toggleBlock(sel: ReadonlySet<string>, rows: GridRow[], operationIds: number[]): Set<string> {
  const keys = rows.flatMap((r) => operationIds.filter((o) => pickable(r, o)).map((o) => cellKey(r.key, o)));
  const out = new Set(sel);
  const all = keys.length > 0 && keys.every((k) => out.has(k));
  for (const k of keys) { if (all) out.delete(k); else out.add(k); }
  return out;
}

/** The rows shown for a filter (name, code, flow); a parent of a match stays so the tree reads. */
export function filterRows(rows: GridRow[], text: string): GridRow[] {
  const t = text.trim().toLowerCase();
  if (!t) return rows;
  const hit = (r: GridRow) => [r.name, r.code ?? '', r.flowName ?? ''].some((s) => s.toLowerCase().includes(t));
  return rows.filter(hit);
}

/** What the picked cells come to, per operation: rows, tonnes (rows with no weight counted apart). */
export function selectionSummary(grid: ContractorGrid | null, sel: ReadonlySet<string>) {
  const byOp = new Map<number, { operation: { id: number; code: string; name: string }; rows: number; tonnes: number; unweighed: number }>();
  if (!grid) return [];
  const rowOf = new Map(grid.rows.map((r) => [r.key, r]));
  for (const k of sel) {
    const { rowKey, operationId } = splitKey(k);
    const r = rowOf.get(rowKey);
    const op = grid.operations.find((o) => o.id === operationId);
    if (!r || !op) continue;
    const s = byOp.get(operationId) ?? { operation: op, rows: 0, tonnes: 0, unweighed: 0 };
    s.rows += 1;
    if (r.tonnes == null) s.unweighed += 1; else s.tonnes = Math.round((s.tonnes + r.tonnes) * 1e6) / 1e6;
    byOp.set(operationId, s);
  }
  return grid.operations.filter((o) => byOp.has(o.id)).map((o) => byOp.get(o.id)!);
}

/** Rates to start from: what was typed, else the contractor's last rate for the operation. */
export function prefillRates(grid: ContractorGrid | null, contractorId: number | null, typed: Record<string, string>, opIds: number[]): Record<string, string> {
  const last = contractorId && grid ? grid.lastRates[String(contractorId)] ?? {} : {};
  const out: Record<string, string> = {};
  for (const id of opIds) out[id] = typed[id] ?? (last[id] != null ? String(last[id]) : '');
  return out;
}

export const tonnesText = (t: number | null | undefined) => (t == null ? '—' : `${(Math.round(t * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} t`);

export const LANE_HELP: Record<Exclude<WoLane, 'cancelled'>, string> = {
  waiting_approval: 'Contractor PO with Management.',
  issued: 'Approved — the contractor may start.',
  in_progress: 'Work done and paid week by week.',
  completed: 'All done (or closed short) — money still owed.',
  paid: 'Done and paid in full (last 90 days).',
};
export const LANE_FAMILY: Record<WoLane, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  waiting_approval: 'warning', issued: 'info', in_progress: 'info', completed: 'warning', paid: 'success', cancelled: 'neutral',
};

/** A payment line's amount: what was typed, else tonnes × rate. */
export function paymentAmount(tonnes: string, rate: string, amount: string): number {
  if (amount.trim() !== '') return Number(amount) || 0;
  const t = Number(tonnes) || 0;
  const r = Number(rate) || 0;
  return Math.round(t * r * 100) / 100;
}

export const todayText = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
