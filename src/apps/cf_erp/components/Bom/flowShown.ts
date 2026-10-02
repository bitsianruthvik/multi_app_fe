import type { StructureNode } from '../../api/types';

/**
 * Choosing how a BOM row is made on a sales order (user, 2026-10-02: "get the
 * default from the template but give an option to change it too").
 *
 *   default = what applies when the line names no flow: the item's own, else the
 *             template's. Never typed here.
 *   changed = this order's line names a flow of its own (operation_flow_id).
 */

export interface FlowRef { id: number; code: string; name: string }
export interface FlowDefault extends FlowRef { from: 'item' | 'template' }
export type FlowTagKind = 'default' | 'changed' | null;
export interface FlowShown {
  /** The flow that applies (or will, once saved). Null: none. */
  flow: FlowRef | null;
  tag: FlowTagKind;
  /** What "Use the default" gives — null when nothing is set up. */
  usual: FlowDefault | null;
  /** The row's own choice, as it will be saved: null = follows the default. */
  chosen: number | null;
  /** Waiting for Save. */
  unsaved: boolean;
}

/** What applies to a row once its own choice is taken away. */
export const usualFlowOf = (node: StructureNode): FlowDefault | null => {
  const f = node.flow;
  if (!f) return null;
  if (f.from === 'line') return f.usual ?? null;
  return { id: f.id, code: f.code, name: f.name, from: f.from };
};

/** Where the default comes from, in words. */
export const usualFromText = (d: FlowDefault | null) => (d ? (d.from === 'template' ? 'the template' : 'the item') : '');

/** What a row shows, with any choice still waiting for Save laid over what is saved. */
export function flowShown(node: StructureNode, pendingFlow: Record<number, number | null>, lookup: (id: number) => FlowRef | undefined): FlowShown {
  const usual = usualFlowOf(node);
  const saved = node.flow?.from === 'line' ? node.flow.id : null;
  const id = node.lineId;
  const has = id != null && id in pendingFlow;
  const chosen = has ? pendingFlow[id as number] ?? null : saved;
  const unsaved = has && chosen !== saved;
  if (chosen == null) return { flow: usual ? { id: usual.id, code: usual.code, name: usual.name } : null, tag: usual ? 'default' : null, usual, chosen: null, unsaved };
  const ref = chosen === node.flow?.id ? node.flow : lookup(chosen);
  return { flow: { id: chosen, code: ref?.code ?? `flow ${chosen}`, name: ref?.name ?? '' }, tag: 'changed', usual, chosen, unsaved };
}

/** A row that is built here, not bought: it needs a flow. */
export const isMade = (node: StructureNode) => node.kind === 'temporary' || node.bom != null;

export interface BulkRow { key: string; node: StructureNode; label: string; depth: number }

/** The chip's tooltip: what it is and where it comes from. */
export function flowTooltip(shown: FlowShown, node: StructureNode, made: boolean): string {
  const name = node.code ?? node.name;
  if (!shown.flow) return made ? `${name} has no flow, so nothing can be planned for it. Click to choose one.` : `${name} has no flow (it is bought, or needs none). Click to choose one.`;
  const base = `${shown.flow.code}${shown.flow.name ? ` · ${shown.flow.name}` : ''}`;
  if (shown.tag === 'changed') {
    return `${base} — changed on this order.${shown.usual ? ` The default is ${shown.usual.code}, from ${usualFromText(shown.usual)}.` : ' It has no default.'} Click to change or reset.`;
  }
  return `${base} — default, from ${usualFromText(shown.usual)}. Click to change it on this order.`;
}

