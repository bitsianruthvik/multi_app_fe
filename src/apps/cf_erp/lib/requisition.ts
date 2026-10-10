import type { Party } from '../api/types';
import type { MakePo, ReadyState, ReqLine, ReqStatus, Requisition } from '../api/requisitions';
import { qtyText } from './inventory';

/**
 * Words and small sums for the Buying stage (CF_ERP_BUYING_V2.md). Every state, status and sentence comes from the
 * server; this file only colours them, orders them and builds the forms' bodies. Nothing here decides whether a
 * material is ready.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-21 → "21 Oct". Anything that is not a date is returned as it came. */
export function shortDate(d: string | null | undefined): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)) : null;
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : d ?? '';
}

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

/** The words of the material-ready line for one unit of work. */
export function readyLabel(state: ReadyState | null, date: string | null): string {
  if (state === 'ready') return 'Ready';
  if (state === 'dated') return date ? `Ready from ${shortDate(date)}` : 'Ready on a date';
  if (state === 'late') return date ? `Late since ${shortDate(date)}` : 'Late';
  if (state === 'waiting') return 'Waiting for stock';
  return 'Not known yet';
}

export const readyTone = (state: ReadyState | null): Tone =>
  state === 'ready' ? 'success' : state === 'dated' ? 'info' : state === 'late' ? 'danger' : state === 'waiting' ? 'warning' : 'neutral';

/** Waiting first, then late, dated, ready — the order a person should read the reasons in. */
const READY_RANK: Record<string, number> = { waiting: 0, late: 1, dated: 2, ready: 3 };
export const byReadyRank = <T extends { state: ReadyState }>(a: T, b: T) => (READY_RANK[a.state] ?? 9) - (READY_RANK[b.state] ?? 9);

export interface CoverChip {
  key: string;
  kind: 'stock' | 'po' | 'asked' | 'undated' | 'skipped' | 'open' | 'over' | 'closed';
  label: string;
  title?: string;
  tone: Tone;
  /** A purchase order id, when the chip opens one. */
  poId?: number;
}

/** How one requisition line is covered, one chip per source — several chips when it is split over POs. */
export function coverChips(line: ReqLine): CoverChip[] {
  const out: CoverChip[] = [];
  const uom = line.item.uom;
  const c = line.cover;
  if (c.held > 0) {
    const where = line.holds.map((h) => `${qtyText(h.quantity)}${h.batch ? ` of batch ${h.batch.code}` : ''}${h.purchaseOrder ? ` (arrived on ${h.purchaseOrder.code})` : ''}`).join(', ');
    out.push({ key: 'held', kind: 'stock', label: `From stock ${qtyText(c.held)}`, title: `${qtyText(c.held)} ${uom} is held for this line and nobody else can use it${where ? `: ${where}` : ''}.`, tone: 'success' });
  }
  if (c.reserved > 0) out.push({ key: 'reserved', kind: 'stock', label: `Reserved ${qtyText(c.reserved)}`, title: 'Reserved for the line’s work.', tone: 'success' });
  if (c.issued > 0) out.push({ key: 'issued', kind: 'stock', label: `Issued ${qtyText(c.issued)}`, title: 'Already issued to the line’s work.', tone: 'success' });
  for (const p of line.purchase) {
    const code = p.purchaseOrder.code;
    const got = p.received > 0 ? ` (${qtyText(p.received)} received)` : '';
    if (p.state === 'closed') {
      out.push({ key: `p${p.allocationId}`, kind: 'closed', label: `${code} · closed`, title: `${code} is cancelled or received — nothing more is coming from it.`, tone: 'neutral', poId: p.purchaseOrder.id });
    } else if (p.state === 'asked') {
      out.push({ key: `p${p.allocationId}`, kind: 'asked', label: `Asked for, no date yet · ${qtyText(p.quantity)}`, title: `${code}: asked for and not ordered yet. Production waits until it is ordered with a date.`, tone: 'warning', poId: p.purchaseOrder.id });
    } else if (p.state === 'undated') {
      out.push({ key: `p${p.allocationId}`, kind: 'undated', label: `${code} · ${qtyText(p.quantity)} · no date`, title: `${code} is ordered but has no receiving date. Production waits until one is set.`, tone: 'warning', poId: p.purchaseOrder.id });
    } else if (p.state === 'received') {
      out.push({ key: `p${p.allocationId}`, kind: 'po', label: `${code} · ${qtyText(p.quantity)} · received`, title: `${code} arrived${p.supplier ? ` from ${p.supplier.name}` : ''}.`, tone: 'success', poId: p.purchaseOrder.id });
    } else {
      out.push({
        key: `p${p.allocationId}`, kind: 'po', label: `${code} · ${qtyText(p.quantity)} · ${p.late ? 'was due' : 'due'} ${shortDate(p.date)}${got}`,
        title: `${p.supplier?.name ?? 'No supplier yet'}: ${qtyText(p.outstanding)} still to come${p.date ? `, due ${p.date}` : ''}${p.late ? ' — overdue' : ''}.`,
        tone: p.late ? 'danger' : 'info', poId: p.purchaseOrder.id,
      });
    }
  }
  if (line.skipped) {
    const who = line.skipped.by?.name ?? 'Someone';
    out.push({
      key: 'skipped', kind: 'skipped', label: 'Skipped — waits for stock',
      title: `Skipped by ${who} on ${shortDate(line.skipped.at)}${line.skipped.note ? `: ${line.skipped.note}` : ''}. ${line.sentence}`, tone: 'warning',
    });
  }
  if (c.over > 0) out.push({ key: 'over', kind: 'over', label: `Over by ${qtyText(c.over)}`, title: 'More is held or coming than the line needs now. You can let the excess go.', tone: 'warning' });
  // What is still undecided: only while the line is not resolved (a skipped line says so in its own chip).
  if (c.open > 0 && !line.skipped) out.push({ key: 'open', kind: 'open', label: `Open ${qtyText(c.open)}`, title: line.sentence, tone: 'neutral' });
  return out;
}

/** A line the person can still do something about: it has a part with no decision. */
export const lineIsOpen = (l: ReqLine) => l.cover.open > 0 && !l.skipped && l.status !== 'not_needed';
/** Can a PO be made for this line? Something is still open, whether or not it is skipped. */
export const lineCanBuy = (l: ReqLine) => l.cover.open > 0 && l.status !== 'not_needed';

/** Requisitions grouped for the order screen: the ones with something to decide first. */
export const REQ_STATUS_ORDER: ReqStatus[] = ['open', 'partly_covered', 'mixed', 'skipped', 'covered', 'fulfilled_from_stock', 'empty'];

export const reqTone = (s: ReqStatus): Tone =>
  s === 'covered' || s === 'fulfilled_from_stock' ? 'success' : s === 'mixed' ? 'info' : s === 'skipped' || s === 'partly_covered' ? 'warning' : 'neutral';

export const reqLines = (reqs: Requisition[]) => reqs.flatMap((r) => r.lines.map((l) => ({ req: r, line: l })));

// ---- the Buy… form ------------------------------------------------------------------

export interface DraftLine { prLineId: number; quantity: string; date: string }
export interface PoDraft { key: number; supplier: Party | null; place: boolean; lines: DraftLine[] }
/** What each requisition line still has open, by id — the most the drafts may add up to. */
export type OpenById = Record<number, number>;

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** How much of each line the drafts already take. */
export function assigned(drafts: PoDraft[]): OpenById {
  const out: OpenById = {};
  for (const d of drafts) for (const l of d.lines) { const q = num(l.quantity); if (Number.isFinite(q)) out[l.prLineId] = (out[l.prLineId] ?? 0) + q; }
  return out;
}

/** What is left to put on a purchase order for a line, after the drafts. */
export const leftOver = (open: OpenById, drafts: PoDraft[], prLineId: number) => Math.max(0, Math.round(((open[prLineId] ?? 0) - (assigned(drafts)[prLineId] ?? 0)) * 1e6) / 1e6);

/** One purchase order for everything still open, each at its open quantity — the start of the form. */
export function initialDrafts(lines: ReqLine[]): PoDraft[] {
  return [{ key: 1, supplier: null, place: true, lines: lines.map((l) => ({ prLineId: l.id, quantity: String(l.cover.open), date: '' })) }];
}

/** Every problem we can see before asking the server; the server still has the last word and lists its own. */
export function draftProblems(drafts: PoDraft[], open: OpenById, label: (prLineId: number) => string): string[] {
  const out: string[] = [];
  drafts.forEach((d, i) => {
    const n = i + 1;
    if (d.lines.length === 0) out.push(`Purchase order ${n} has no lines.`);
    if (d.place && !d.supplier) out.push(`Purchase order ${n}: choose the supplier, or untick “Place the order now”.`);
    for (const l of d.lines) {
      const q = num(l.quantity);
      if (!Number.isFinite(q) || q <= 0) out.push(`Purchase order ${n} · ${label(l.prLineId)}: enter a quantity above zero.`);
    }
  });
  const used = assigned(drafts);
  for (const [id, q] of Object.entries(used)) {
    const o = open[Number(id)] ?? 0;
    if (q > o + 1e-9) out.push(`${label(Number(id))}: only ${qtyText(o)} is still open — ${qtyText(q)} would buy more than the line needs.`);
  }
  return out;
}

/** The body for POST /requisitions/purchase-orders. A blank date is left out, never sent as an empty string. */
export function draftsBody(drafts: PoDraft[]): MakePo[] {
  return drafts.map((d) => ({
    ...(d.supplier ? { supplierId: d.supplier.id } : {}),
    ...(d.place ? { place: true } : {}),
    lines: d.lines.map((l) => ({ prLineId: l.prLineId, quantity: Number(l.quantity), ...(l.date ? { expectedDate: l.date } : {}) })),
  }));
}

/** Drafts whose purchase order would have no date on a line: said before they are sent, because production waits for it. */
export const undatedCount = (drafts: PoDraft[]) => drafts.reduce((t, d) => t + (d.place ? d.lines.filter((l) => !l.date).length : 0), 0);
