import type { StructureNode } from '../../api/types';

/**
 * Choosing how a BOM row is made on a sales order (user, 2026-10-02: "get the
 * default from the template but give an option to change it too").
 *
 *   default = what applies when the line names no flow: the row's OWN flow — the one it
 *             took from its definition when the order was made, and keeps (2026-10-10: a
 *             later change of the definition's flow reaches new orders only).
 *   changed = this order's line names a flow of its own (operation_flow_id).
 *
 * The row's own flow can itself be set here (a pending "own flow", by record): it is the only
 * flow the TOP row of an order line has, and it is what "Take the definition's flow again"
 * writes when the definition has since moved to another flow.
 */

export interface FlowRef { id: number; code: string; name: string }
export interface FlowDefault extends FlowRef { from: 'item' | 'template' }
export type FlowTagKind = 'default' | 'changed' | null;
export interface FlowShown {
  /** The flow that applies (or will, once saved). Null: none. */
  flow: FlowRef | null;
  tag: FlowTagKind;
  /** What "Use the default" gives — the row's own flow, as it will be saved. Null when it has none. */
  usual: FlowDefault | null;
  /** The row's own choice, as it will be saved: null = follows the default. */
  chosen: number | null;
  /** Waiting for Save. */
  unsaved: boolean;
  /** What the row's definition is made by today — null when it has no definition, or the definition no flow. */
  definition: FlowRef | null;
  /** Offered when the definition's flow of today is not the flow the row is made by (or the row has none). */
  takeAgain: FlowRef | null;
}

/** The row's own SAVED flow: what applies to it once its line's choice is taken away. */
export const usualFlowOf = (node: StructureNode): FlowDefault | null => {
  const f = node.flow;
  if (!f) return null;
  if (f.from === 'line') return f.usual ?? null;
  return { id: f.id, code: f.code, name: f.name, from: f.from };
};

/** Where the default comes from, in words. */
export const usualFromText = (d: FlowDefault | null) => (d ? 'the row itself (the flow it was made with)' : '');

/**
 * What a row shows, with any choice still waiting for Save laid over what is saved.
 * `pendingFlow` is keyed by BOM line (what the line names); `pendingOwn` by record (the row's own flow).
 */
export function flowShown(
  node: StructureNode,
  pendingFlow: Record<number, number | null>,
  lookup: (id: number) => FlowRef | undefined,
  pendingOwn: Record<number, number | null> = {},
): FlowShown {
  const definition = node.definitionFlow ? { id: node.definitionFlow.id, code: node.definitionFlow.code, name: node.definitionFlow.name } : null;
  const refOf = (flowId: number): FlowRef => {
    const known = flowId === node.flow?.id ? node.flow : flowId === node.flow?.usual?.id ? node.flow?.usual : flowId === definition?.id ? definition : lookup(flowId);
    return { id: flowId, code: known?.code ?? `flow ${flowId}`, name: known?.name ?? '' };
  };
  // The row's own flow: a choice waiting for Save, else what is saved.
  const ownSaved = usualFlowOf(node);
  const hasOwn = node.id in pendingOwn;
  const ownId = hasOwn ? pendingOwn[node.id] ?? null : ownSaved?.id ?? null;
  const usual: FlowDefault | null = ownId == null ? null : ownId === ownSaved?.id ? ownSaved : { ...refOf(ownId), from: 'item' };
  const ownUnsaved = hasOwn && ownId !== (ownSaved?.id ?? null);
  // What the line names.
  const saved = node.flow?.from === 'line' ? node.flow.id : null;
  const id = node.lineId;
  const has = id != null && id in pendingFlow;
  const chosen = has ? pendingFlow[id as number] ?? null : saved;
  const unsaved = (has && chosen !== saved) || ownUnsaved;
  const flow: FlowRef | null = chosen != null ? refOf(chosen) : usual ? { id: usual.id, code: usual.code, name: usual.name } : null;
  const takeAgain = definition && definition.id !== flow?.id ? definition : null;
  return { flow, tag: chosen != null ? 'changed' : usual ? 'default' : null, usual, chosen, unsaved, definition, takeAgain };
}

/** A row that is built here, not bought: it needs a flow. */
export const isMade = (node: StructureNode) => node.kind === 'temporary' || node.bom != null;

export interface BulkRow { key: string; node: StructureNode; label: string; depth: number }

/** " Its definition is made by X today." — only when the definition has moved on from the row's own flow. */
const definitionMoved = (shown: FlowShown): string => (shown.definition && shown.definition.id !== shown.usual?.id ? ` Its definition is made by ${shown.definition.code} today.` : '');

/** The chip's tooltip: what it is and where it comes from. */
export function flowTooltip(shown: FlowShown, node: StructureNode, made: boolean): string {
  const name = node.code ?? node.name;
  if (!shown.flow) {
    return `${made ? `${name} has no flow, so nothing can be planned for it.` : `${name} has no flow (it is bought, or needs none).`}${definitionMoved(shown)} Click to choose one.`;
  }
  if (shown.tag === 'changed') {
    return `${shown.flow.code} — changed on this order line. ${shown.usual ? `The row’s own flow is ${shown.usual.code}.` : 'The row has no flow of its own.'}${definitionMoved(shown)}`;
  }
  // An order's own row took its flow from its definition; a catalog item in the structure carries its own.
  const own = node.kind === 'temporary' ? 'this row’s flow (taken from its definition when the order was made)' : 'its own flow, set on the item';
  return `${shown.flow.code} — ${own}.${definitionMoved(shown)}`;
}

/** The one line under "Take the definition's flow again". */
export const takeAgainNote = (definition: FlowRef): string => `The definition is made by ${definition.code} today; this row keeps the flow it was created with until you take it.`;
