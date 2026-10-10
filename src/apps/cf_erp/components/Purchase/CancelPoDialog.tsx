import type { PurchaseOrder } from '../../api/types';
import { cancelPurchaseOrder, type PlannedUnits } from '../../api/requisitions';
import { PromptDialog } from '../PromptDialog';

/** The requisitions this PO's lines are bought for, by code. */
const requisitionCodes = (po: PurchaseOrder): string[] =>
  [...new Set(po.lines.flatMap((l) => (l.orders ?? []).map((o) => o.requisition?.code).filter((c): c is string => !!c)))];

/**
 * Cancel a purchase order — the one place a PO is cancelled from (the board's cards and the order's Buying stage open the PO page).
 * Says first what it does to the requisition: its materials go back to Open and the work that needed this delivery waits again.
 * The answer's `plannedUnits` is handed back so the page can list the planned cards it made late or waiting.
 */
export function CancelPoDialog({ po, open, onClose, onCancelled }: {
  po: PurchaseOrder; open: boolean; onClose: () => void; onCancelled: (next: PurchaseOrder, planned: PlannedUnits | null) => void;
}) {
  const prs = requisitionCodes(po);
  const body = prs.length
    ? `Cancelling ${po.code} puts what it was bought for back to Open on ${prs.join(', ')}. The work that needed this delivery waits until the material is decided again. Nothing has been received against it. It stays on the list under All.`
    : 'Nothing has been received against it. It stays on the list under All.';
  return (
    <PromptDialog open={open} title={`Cancel ${po.code}?`} label="Why" confirmLabel="Cancel the order" danger body={body} onClose={onClose}
      onConfirm={async (reason: string) => { const r = await cancelPurchaseOrder(po.id, reason); onCancelled(r, r.plannedUnits ?? null); }} />
  );
}
