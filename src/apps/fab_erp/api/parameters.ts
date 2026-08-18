/**
 * parameters.ts — the values an order's flows ask for.
 *
 * One server-built grid rather than the client assembling it from items,
 * field defs and values. Which fields a part needs is derived from the
 * formulas on its flow, and that derivation already lives on the server —
 * rebuilding it here meant the screen could only guess, which is how a plate
 * that is only ever cut ended up with an editable weld-length cell.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet } from './client';

const base = () =>
  `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

export interface ParameterColumn {
  fieldKey: string;
  label: string;
  unit: string | null;
  dataType: string | null;
  sortOrder: number;
}

export interface ParameterRow {
  itemId: number;
  code: string | null;
  name: string | null;
  levelKind: string | null;
  flowId: number | null;
  /** How many real parts this row writes to — >1 when it leads a similarity group. */
  represents: number;
  /** Only these fields are asked of this part. Anything else is not its question. */
  required: string[];
  values: Record<string, string | null>;
}

export interface ParameterGrid {
  columns: ParameterColumn[];
  rows: ParameterRow[];
  /** Rows folded away into a peer leader — the measure of what marking similar saved. */
  groupedAway: number;
}

export const getParameterGrid = (orderId: number): Promise<ParameterGrid> =>
  fabGet<ParameterGrid>(`orders/${orderId}/parameters`);

export interface ParameterEdit { itemId: number; fieldKey: string; value: string | null }

export async function saveParameters(orderId: number, edits: ParameterEdit[]) {
  const res = await api.post(`${base()}/orders/${orderId}/parameters`, { edits });
  return res.data as { written: number; itemsTouched: number };
}

/** Download the sheet. Browser-driven so the file lands in Downloads as usual. */
export function exportParametersUrl(orderId: number) {
  return `${base()}/orders/${orderId}/parameters/export`;
}

export async function importParameters(orderId: number, file: File) {
  const form = new FormData();
  form.append('excel_file', file);
  const res = await api.post(`${base()}/orders/${orderId}/parameters/import`, form);
  return res.data as {
    written: number; itemsTouched: number; edits: number; rowsRead: number;
    warnings: Array<{ row: number; message: string }>;
  };
}

// ── similarity ──────────────────────────────────────────────────────────────

export interface SimilarGroup {
  groupKey: string;
  levelKind: string;
  members: Array<{ id: number; code: string | null; name: string | null }>;
}

export const getSimilarGroups = (orderId: number): Promise<{ groups: SimilarGroup[] }> =>
  fabGet<{ groups: SimilarGroup[] }>(`orders/${orderId}/similar`);

export async function markSimilar(orderId: number, itemIds: number[], groupKey: string | null) {
  const res = await api.post(`${base()}/orders/${orderId}/similar`, { itemIds, groupKey });
  return res.data as { groupKey: string | null; members: number; groups: SimilarGroup[] };
}
