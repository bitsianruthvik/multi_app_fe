import { useMemo, useState } from 'react';
import { cfApi, CfApiError } from '../../api/client';
import type { BomType, BomView, Explosion, Kind, LineStructure, OrderStatus, RecordStatus, StructureNode, WhereUsedRow } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { bomAsTree, bomTypeOfKind } from './bomModel';

/** Where a BOM is read from: a record's own, or the structure an order line sells. */
export type BomSource =
  | { kind: 'record'; recordId: number }
  | { kind: 'orderLine'; lineId: number };

/** One BOM, whichever endpoint answered. */
export interface BomState {
  root: StructureNode;
  stats: Explosion['stats'];
  truncated: boolean;
  /** Null when this record holds nothing — a selection chooses an item instead. */
  bomType: BomType | null;
  /** The server's own answer for the root, so the rules are not kept in two places. Null when it was not asked (an order's structure). */
  canHaveBom: boolean | null;
  allowedChildKinds: Kind[] | null;
  /** A standard or template BOM has a status and a revision; a custom one has neither. */
  bom: { status: RecordStatus; revision: string | null } | null;
  /** The order a temporary item belongs to, or the order the line is on. */
  order: { id: number; code: string; status: OrderStatus } | null;
  released: boolean;
  /** The sales line this was read through, when it was read through one. */
  line: { lineNo: number; lineType: 'standard' | 'custom' } | null;
  /** Nothing here can change, whatever the person's role — the backend refuses it too. */
  frozen: boolean;
}

/** Stages in which an order's work stops changing (salesOrderService LOCKED). */
export const LOCKED_ORDER: OrderStatus[] = ['closed', 'lost', 'cancelled'];

/**
 * The one way in and out of a BOM. Both screens read a different endpoint —
 * they are live and stay as they are — but every read, every write and every
 * reload after a change goes through here, so a change is made once.
 */
export function useBom(source: BomSource, { whereUsed = false, onChanged }: { whereUsed?: boolean; onChanged?: () => void } = {}) {
  const recordId = source.kind === 'record' ? source.recordId : null;
  const lineId = source.kind === 'orderLine' ? source.lineId : null;
  const view = useLoad(() => (recordId == null ? Promise.resolve(null) : cfApi.get<BomView>(`/records/${recordId}/bom`)), [recordId]);
  /*
   * THE WHOLE TREE, NOT JUST THE FIRST LEVEL.
   *
   * `/bom` answers for the record's OWN lines — the ones this tab can change —
   * and carries the facts about that BOM (its type, status, revision, what it
   * may hold). It does not say what the children are made of, so a catalog item
   * built from other catalog items showed its inputs as dead ends.
   *
   * `/bom/tree` is the same explosion an order's Structure tab draws, down to
   * the leaves, in the same node shape. So the tree comes from there and the
   * facts about the root BOM still come from `/bom`. Nothing about editing
   * changes: BomPanel only offers changes on the root and on an order's own
   * temporary items, so a sub-BOM that belongs to another record is drawn but
   * stays read-only here — it is changed on that record, with that record's grant.
   */
  const tree = useLoad(() => (recordId == null ? Promise.resolve(null) : cfApi.get<Explosion>(`/records/${recordId}/bom/tree`)), [recordId]);
  const structure = useLoad(() => (lineId == null ? Promise.resolve(null) : cfApi.get<LineStructure>(`/order-lines/${lineId}/structure`)), [lineId]);
  // Only the record's own tab asks the question, so nothing else pays for it.
  const used = useLoad(() => (recordId == null || !whereUsed ? Promise.resolve(null) : cfApi.get<WhereUsedRow[]>(`/records/${recordId}/where-used`)), [recordId, whereUsed]);
  const [actionError, setActionError] = useState<CfApiError | null>(null);

  const v = view.data;
  const s = structure.data;
  const state: BomState | null = useMemo(() => {
    // Whichever endpoint answered, it ends as the same tree and the same facts.
    const common = s
      ? {
        root: s.root,
        stats: s.stats,
        truncated: s.truncated,
        bomType: s.root.bom?.bomType ?? bomTypeOfKind(s.root.kind),
        // The structure endpoint answers about a whole tree, not about one
        // record's BOM, so there is nothing to take from it here.
        canHaveBom: null,
        allowedChildKinds: null,
        bom: s.root.bom,
        order: { id: s.order.id, code: s.order.code, status: s.order.status },
        // The backend calls a line uneditable once it is released or its order closed.
        released: !s.order.editable && !LOCKED_ORDER.includes(s.order.status),
        line: { lineNo: s.line.lineNo, lineType: s.line.lineType },
      }
      : v
        ? {
          // The full explosion once it has landed; until then the first level from
          // `/bom`, so the tab never opens empty.
          ...(tree.data ?? bomAsTree(v)),
          bomType: v.bomType,
          canHaveBom: v.canHaveBom,
          allowedChildKinds: v.allowedChildKinds,
          bom: v.bom,
          order: v.order,
          released: !!v.order?.released,
          line: null,
        }
        : null;
    if (!common) return null;
    return {
      ...common,
      frozen: common.root.status === 'obsolete' || !!(common.order && LOCKED_ORDER.includes(common.order.status)) || common.released,
    };
  }, [v, s, tree.data]);

  const reload = () => { view.reload(); tree.reload(); structure.reload(); used.reload(); onChanged?.(); };

  /**
   * A change to the BOM itself — its status or its revision. The answer is the
   * fresh BOM, so the screen it came from needs no second request.
   */
  const act = async (path: string, body: unknown) => {
    if (!state) return false;
    setActionError(null);
    try {
      const fresh = await cfApi.post<BomView>(`/records/${state.root.id}/bom/${path}`, body);
      view.setData(fresh);
      // A new revision can change the lines, and the tree is drawn from `/bom/tree`.
      tree.reload();
      structure.reload();
      onChanged?.();
      return true;
    } catch (e) {
      setActionError(e as CfApiError);
      return false;
    }
  };

  return {
    state,
    whereUsed: used.data ?? [],
    whereUsedError: used.error,
    reloadWhereUsed: used.reload,
    error: view.error ?? structure.error ?? tree.error,
    loading: view.loading || structure.loading,
    actionError,
    reload,
    setStatus: (status: RecordStatus) => act('status', { status }),
    revise: () => act('revision', {}),
    removeLine: async (id: number) => { await cfApi.del(`/bom-lines/${id}`); reload(); },
  };
}
