import type { ChecklistItem, ImpactMetrics, ImpactPlate, PlateChangeChecklist, PlateChangeImpact, PlateChangeRequest } from '../api/plateChanges';
import type { Family } from '../components/ui';
import { rupeeText } from './money';

/**
 * Plate changes after a purchase order (init.sql §62): the words and figures the screens show. Pure, so the
 * suite (scripts/cf_erp_plate_change_test.mjs) checks them without a server.
 */

const group = (n: number) => `${n}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const num = (n: number, digits = 0) => (digits ? n.toFixed(digits) : group(Math.round(n)));
const signed = (n: number, text: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${text}`;

/** A request's badge: the family and the words. */
export function statusBadge(r: Pick<PlateChangeRequest, 'status' | 'stale' | 'statusLabel'>): { family: Family; label: string } {
  if (r.stale) return { family: 'danger', label: 'Out of date' };
  const family: Record<string, Family> = { pending: 'warning', stale: 'danger', approved: 'info', applied: 'success', rejected: 'danger', withdrawn: 'neutral' };
  return { family: family[r.status] ?? 'neutral', label: r.statusLabel };
}

/** "12 mm × 3,000 × 1,500" — a plate's size, the way the shop says it. */
export const plateSize = (p: Pick<ImpactPlate, 'thickness' | 'length' | 'width'>) => (p.thickness == null ? 'size not known'
  : p.length == null || p.width == null ? `${Number(p.thickness)} mm` : `${Number(p.thickness)} mm × ${group(Math.round(p.length))} × ${group(Math.round(p.width))}`);

/** A cost, or "not costed" — never ₹0 for a price nobody has said. */
export const costWord = (v: number | null | undefined) => rupeeText(v ?? null);

export interface MetricRow { key: string; label: string; before: string; after: string; diff: string; worse: boolean | null; hint?: string }

/**
 * The impact sheet's table: plates, steel bought, parts, waste (offcuts in it), cost — before, after, and the
 * difference. `worse` is true when the change buys more (more plates, more steel, more waste, more money).
 */
export function metricRows(i: Pick<PlateChangeImpact, 'before' | 'after' | 'delta'>): MetricRow[] {
  const b: ImpactMetrics = i.before; const a: ImpactMetrics = i.after; const d = i.delta;
  const t = (n: number | null) => (n == null ? '—' : `${n.toFixed(3)} t`);
  const dt = (n: number | null) => (n == null ? '—' : Math.abs(n) < 0.0005 ? '0' : signed(n, `${Math.abs(n).toFixed(3)} t`));
  const w = (m: ImpactMetrics) => `${num(m.wasteKg)} kg · ${m.wastePct == null ? '—' : `${m.wastePct.toFixed(1)}%`}`;
  const worse = (n: number | null) => (n == null || Math.abs(n) < 1e-9 ? null : n > 0);
  return [
    { key: 'plates', label: 'Plates', before: num(b.plates), after: num(a.plates), diff: d.plates ? signed(d.plates, num(Math.abs(d.plates))) : '0', worse: worse(d.plates) },
    { key: 'steel', label: 'Steel bought', before: t(b.tonnesBought), after: t(a.tonnesBought), diff: dt(d.tonnesBought), worse: worse(d.tonnesBought) },
    { key: 'parts', label: 'Parts', before: t(b.partsTonnes), after: t(a.partsTonnes), diff: dt(d.partsTonnes), worse: null },
    {
      key: 'waste', label: 'Waste', before: w(b), after: w(a),
      diff: d.wasteKg == null ? '—' : Math.abs(d.wasteKg) < 0.5 ? '0' : `${signed(d.wasteKg, `${num(Math.abs(d.wasteKg))} kg`)}${d.wastePct == null || Math.abs(d.wastePct) < 0.05 ? '' : ` · ${signed(d.wastePct, `${Math.abs(d.wastePct).toFixed(1)}%`)}`}`,
      worse: worse(d.wasteKg), hint: 'Everything bought that is not a part. Offcuts count as waste.',
    },
    { key: 'offcuts', label: 'Offcuts in the waste', before: `${num(b.offcutKg)} kg`, after: `${num(a.offcutKg)} kg`, diff: d.offcutKg == null || Math.abs(d.offcutKg) < 0.5 ? '0' : signed(d.offcutKg, `${num(Math.abs(d.offcutKg))} kg`), worse: null },
    {
      key: 'cost', label: 'Cost', before: costWord(b.cost.value), after: costWord(a.cost.value),
      diff: d.cost == null ? 'not costed' : Math.abs(d.cost) < 0.5 ? '₹0' : signed(d.cost, rupeeText(Math.abs(d.cost))),
      worse: worse(d.cost), hint: d.costReason ?? a.cost.reason ?? b.cost.reason ?? (a.cost.basis ? `Priced at the plate rate (${a.cost.basis}).` : undefined),
    },
  ];
}

/** The plates that change, one line each: "+4 × PL-12 (12 mm × 3,000 × 1,500)". */
export function plateLines(i: Pick<PlateChangeImpact, 'plates'>): { key: string; text: string; tone: 'add' | 'remove' | 'change' }[] {
  return [
    ...i.plates.added.map((p) => ({ key: `a${p.plateItemId}`, text: `+${p.count} × ${p.code} (${plateSize(p)})`, tone: 'add' as const })),
    ...i.plates.removed.map((p) => ({ key: `r${p.plateItemId}`, text: `−${p.count} × ${p.code} (${plateSize(p)})`, tone: 'remove' as const })),
    ...i.plates.changed.map((p) => ({ key: `c${p.plateItemId}`, text: `${p.code} (${plateSize(p)}): ${p.from} → ${p.to}`, tone: 'change' as const })),
  ];
}

/** "2 of 3 done" — the buyer's progress on a checklist. */
export function checklistProgress(c: PlateChangeChecklist | null | undefined): { done: number; total: number; text: string } {
  const all = (c?.items ?? []).flatMap((x) => x.actions);
  const done = all.filter((a) => a.done).length;
  return { done, total: all.length, text: all.length ? `${done} of ${all.length} done` : 'Nothing to change on the purchase orders' };
}

/** "Need 1 → 0 · on PO-000101: 1 (0 received) · held 0" — one checklist row's facts. */
export function checklistFacts(x: ChecklistItem): string {
  const q = (n: number) => `${Number(n.toFixed(3))}`;
  const pos = x.onOrder.length ? x.onOrder.map((o) => `${o.poCode}: ${q(o.quantity)} (${q(o.received)} received)`).join(', ') : 'on no PO';
  return `Need ${q(x.needBefore)} → ${q(x.needAfter)} · ${pos} · held ${q(x.held)}`;
}

/** "Asked by Ravi on 16 Oct 2026" */
export function askedWords(r: Pick<PlateChangeRequest, 'requestedBy' | 'requestedAt'>): string {
  const when = r.requestedAt ? new Date(r.requestedAt) : null;
  const day = when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return ['Asked', r.requestedBy?.name ? `by ${r.requestedBy.name}` : null, day ? `on ${day}` : null].filter(Boolean).join(' ');
}

/** The words the save dialogs use once a PO covers the line. */
export const NEEDS_APPROVAL = 'A purchase order covers this line, so this change goes to the MD for approval. Nothing is saved until it is approved.';
export const REASON_LABEL = 'Why is this change needed?';
export const REASON_EXAMPLE = 'For example: supplier has no 11 mm.';
