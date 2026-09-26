import { apiFetch } from '@core/api/client';
import { CfApiError } from './client';

/**
 * Edit mode's one request: many changes to the structure on one BOM screen,
 * saved together (POST /bom-changes, services/bomChangeService.js).
 *
 * All or nothing. A refusal is a 422 whose `problems` lists every problem at
 * once and nothing is applied; a frozen structure (closed order, released
 * line, obsolete record) is a 409. `dryRun` does the real thing and rolls it
 * back, so it answers exactly what Save would do — the codes the copies would
 * get included.
 */

export type BomChangeScope = { recordId: number } | { orderLineId: number };

export type BomChange =
  | { op: 'quantity'; lineId: number; quantity: number }
  /** null goes back to the way the child is usually made. */
  | { op: 'flow'; lineId: number; flowId: number | null }
  | { op: 'remove'; lineId: number }
  /**
   * Into a Custom BOM (an order's temporary items) a deep copy: new temporary
   * items with their values, lines and flows; catalog items, templates,
   * selections and cut plates referenced. Into a Template or Standard BOM,
   * another line to the same child. `quantity` defaults to the source line's.
   */
  | { op: 'paste'; sourceLineId: number; parentId: number; afterLineId?: number | null; quantity?: number };

export interface BomChangesRequest {
  scope: BomChangeScope;
  dryRun?: boolean;
  changes: BomChange[];
}

export interface BomChangeCounts {
  quantity: number;
  flow: number;
  pasted: number;
  /** New temporary items the pastes created. */
  copiedItems: number;
  removed: number;
  /** Rows drawn below removed lines that go with them. */
  removedBeneath: number;
  unchanged: number;
  changes: number;
}

export interface BomChangeCopy { id: number | null; code: string | null; name: string; depth: number }

export type BomChangeResult =
  | { op: 'quantity'; lineId: number; from: number; to: number; changed: boolean }
  | { op: 'flow'; lineId: number; from: number | null; to: number | null; changed: boolean }
  | { op: 'remove'; lineId: number; beneath: number; withParent: boolean }
  | {
    op: 'paste'; sourceLineId: number; parentId: number; mode: 'copy' | 'line' | 'reference';
    /** Null on a dry run — the row was never kept. */
    lineId: number | null;
    quantity: number;
    created: number;
    items: BomChangeCopy[];
    notes: string[];
  };

export interface BomChangesResponse {
  applied: boolean;
  dryRun: boolean;
  summary: { sentence: string; counts: BomChangeCounts };
  /** One per change, in the order they were sent. */
  results: (BomChangeResult | null)[];
}

/**
 * A deep copy of a large sub-structure is a few hundred round trips, and the
 * production database is ~49 ms away — a girder line measured 730 of them. The
 * platform's default 30 s timeout would give up on a save that then commits,
 * and a person who saves again gets two copies. So this call waits longer.
 */
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The same error shape cfApi gives (api/client.ts `toCfError`, which is not
 * exported): apiFetch reports a failure as text, and the `problems` list in it
 * is the whole point of a refusal.
 */
function toCfError(err: unknown): CfApiError {
  const text = err instanceof Error ? err.message : String(err);
  const m = /^API request failed: (\d{3})[^-]*- ([\s\S]*)$/.exec(text);
  if (!m) return new CfApiError(0, text.includes('timed out') ? 'The server took too long to answer. The save may still finish — reload before trying again.' : 'Could not reach the server.');
  const status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    return new CfApiError(status, body.message ?? 'Something went wrong.', body.code, Array.isArray(body.problems) ? body.problems : []);
  } catch {
    return new CfApiError(status, status === 403 ? 'You do not have permission for this.' : 'Something went wrong.');
  }
}

export async function postBomChanges(body: BomChangesRequest): Promise<BomChangesResponse> {
  // The company slug from the URL, as cfApi does; the backend takes the company from the token.
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  try {
    return await apiFetch<BomChangesResponse>(`/api/${company}/cf_erp/bom-changes`, { method: 'POST', body, timeout: TIMEOUT_MS });
  } catch (err) {
    throw toCfError(err);
  }
}
