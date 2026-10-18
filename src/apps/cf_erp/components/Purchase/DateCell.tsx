import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { CfApiError } from '../../api/client';
import { updatePurchaseLine, type WithPlanned } from '../../api/requisitions';
import { setPoExpectedDate } from '../../api/purchaseRequests';
import type { PurchaseOrder } from '../../api/types';
import { dayText } from '../../lib/money';
import { useToast } from '../toastContext';

/**
 * One PO line's expected date, edited in place on the purchase order (the vendor said another day): saved when the box
 * loses focus (or Enter), never on every keystroke — a date typed digit by digit passes through nonsense years. The
 * answer carries `plannedUnits`, the planned cards the new date makes late. A line without a date is highlighted.
 */
export function DateCell({ value, label, lineId, poId, disabled, missing, onSaved, testId = 'expected-date' }: {
  value: string | null; label: string; lineId?: number; disabled?: boolean; missing?: boolean; onSaved: (po: WithPlanned<PurchaseOrder>) => void;
  /** The PO's own date (the header) instead of a line's. */
  poId?: number;
  testId?: string;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(dayText(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(dayText(value)); }, [value]);
  const save = async () => {
    if (busy || draft === dayText(value)) return;
    setBusy(true);
    try { onSaved(poId != null ? await setPoExpectedDate(poId, draft || null) : await updatePurchaseLine(lineId ?? 0, { expectedDate: draft || null })); }
    catch (e) { setDraft(dayText(value)); toast.error(e instanceof CfApiError ? (e.problems[0] ?? e.message) : (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Box component="input" type="date" value={draft} disabled={disabled || busy} aria-label={label} data-testid={testId} data-missing={missing ? 'true' : 'false'}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
      sx={{
        fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)',
        border: `1px solid ${missing ? 'var(--c-warning-500)' : 'var(--c-border)'}`,
      }} />
  );
}
