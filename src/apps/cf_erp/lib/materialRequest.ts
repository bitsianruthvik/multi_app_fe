import type { ReleaseSummary } from '../api/types';
import type { LineMaterialReady, MaterialSupply, OrderRequisitions, ReqLine, Requisition } from '../api/requisitions';
import { SUPPLY_LABEL } from '../api/requisitions';
import { qtyText } from './inventory';

/**
 * MATERIAL REQUEST (MR) words and small sums (init.sql §66, TM/CF_ERP_BUYING_V2.md "2026-10-16"). The order stage
 * once called Buying is the Material request: one MR per order line, numbered MR-<order>-<line> (one raised before
 * keeps its PR- number). Every figure is the server's; this file only words it.
 */

export const MR_STAGE_LABEL = 'Material request';

export const supplyLabel = (s: MaterialSupply | null | undefined) => SUPPLY_LABEL[s === 'customer' ? 'customer' : 'we_buy'];

/** "3 of 4 locked" for one MR (§71): its lines whose need is wholly earmarked for the order. */
export function lockedWords(r: Pick<Requisition, 'lines'>): string {
  const live = r.lines.filter((l) => l.status !== 'not_needed');
  if (!live.length) return 'Nothing to buy';
  const locked = live.filter((l) => (l.cover.earmarked ?? l.cover.stock) + 1e-6 >= l.need).length;
  return `${locked} of ${live.length} locked`;
}

/** The five figures of an MR line, as the MR table shows them (older answers without them fall back to the cover). */
export function mrFigures(l: ReqLine): { need: number; earmarked: number; onPo: number; received: number; open: number } {
  const c = l.cover;
  const onPo = c.onPo ?? l.purchase.reduce((t, p) => t + p.outstanding, 0);
  const received = c.received ?? l.purchase.reduce((t, p) => t + p.received, 0);
  return { need: l.need, earmarked: c.earmarked ?? c.stock, onPo, received, open: c.open };
}

/** What the release dialog says before releasing: the MR this line's material comes from, and what is earmarked on it. */
export function materialFromMr(mr: LineMaterialReady | null | undefined): { code: string; earmarked: { code: string; qty: number; uom: string | null }[] } | null {
  if (!mr?.requisition) return null;
  const earmarked = (mr.materials ?? [])
    .map((m) => ({ code: m.item.code ?? m.item.name, uom: m.item.uom ?? null, qty: m.cover.filter((x) => x.kind === 'held').reduce((t, x) => t + x.qty, 0) }))
    .filter((x) => x.qty > 0);
  return { code: mr.requisition.code, earmarked };
}

const listOf = (rows: { item: { code: string | null; name: string; uom?: string | null }; quantity: number }[]) =>
  rows.map((r) => `${r.item.code ?? r.item.name} ${qtyText(r.quantity)}${r.item.uom ? ` ${r.item.uom}` : ''}`).join(', ');

/** The toast after a release: the release, and what of the MR became its reservations. */
export function releasedMessage(lineNo: number | undefined, r: (ReleaseSummary & { fromMr?: ReleaseSummary['fromMr'] }) | null | undefined): string {
  const head = `Line ${lineNo ?? ''} released to production.`;
  const m = r?.fromMr;
  if (!m?.requisition) return head;
  if (!m.reserved.length) return `${head} Nothing is earmarked on ${m.requisition.code} yet — its material is reserved when it arrives.`;
  return `${head} Material from ${m.requisition.code}: ${listOf(m.reserved)} reserved for production.`;
}

/** The toast after raising: how many MRs, what was earmarked, and the purchase orders asked of the customer. */
export function raisedMessage(r: OrderRequisitions, { lines }: { lines?: number[] } = {}): string {
  const made = r.raised ?? 0;
  const head = made ? `${made === 1 ? 'MR raised' : `${made} MRs raised`}.` : lines ? 'MR brought up to date.' : 'MRs brought up to date.';
  const held = r.earmarked ?? [];
  const parts = [head];
  if (held.length) parts.push(`Earmarked: ${held.map((e) => `${e.item.code ?? e.item.name} ${qtyText(e.quantity)}${e.owner === 'customer' ? " (the customer's)" : ''}`).join(', ')}.`);
  const pos = r.customerPurchaseOrders ?? [];
  if (pos.length) parts.push(`${pos.map((p) => p.code).join(', ')} made to ${pos[0].supplier?.name ?? 'the customer'} for what they send.`);
  return parts.join(' ');
}
