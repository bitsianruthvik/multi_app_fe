import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { CfApiError } from '../../api/client';
import { updatePurchaseLine, type WithPlanned } from '../../api/requisitions';
import { setPoExpectedDate } from '../../api/purchaseRequests';
import type { PurchaseOrder } from '../../api/types';
import { dayText } from '../../lib/money';
import { useToast } from '../toastContext';
import { PromptDialog } from '../PromptDialog';

/**
 * One PO line's expected date, edited in place on the purchase order (the vendor said another day): saved when the box
 * loses focus (or Enter), never on every keystroke — a date typed digit by digit passes through nonsense years. The
 * answer carries `plannedUnits`, the planned cards the new date makes late. A line without a date is highlighted.
 *
 * §110 (user, 2026-11-14): MOVING a date that was set asks what the vendor said — kept with the change, and sent with
 * the alert that goes to Stores, Planning and the MD. A first date needs no reason.
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
  const [asking, setAsking] = useState(false);
  useEffect(() => { setDraft(dayText(value)); }, [value]);
  const write = async (note: string | null) => {
    setBusy(true);
    try {
      onSaved(poId != null ? await setPoExpectedDate(poId, draft || null, note) : await updatePurchaseLine(lineId ?? 0, { expectedDate: draft || null, ...(note ? { dateNote: note } : {}) }));
      if (value && draft !== dayText(value)) toast.success('Date moved — Stores, Planning and the MD are told.');
    } catch (e) { setDraft(dayText(value)); toast.error(e instanceof CfApiError ? (e.problems[0] ?? e.message) : (e as Error).message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy || asking || draft === dayText(value)) return;
    if (value) { setAsking(true); return; }
    await write(null);
  };
  return (
    <>
      <Box component="input" type="date" value={draft} disabled={disabled || busy} aria-label={label} data-testid={testId} data-missing={missing ? 'true' : 'false'}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
        sx={{
          fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)',
          border: `1px solid ${missing ? 'var(--c-warning-500)' : 'var(--c-border)'}`,
        }} />
      <PromptDialog open={asking} title={`Move the delivery date to ${draft ? new Date(`${draft}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'none'}?`}
        body="What did the vendor say? It goes with the alert to Stores, Planning and the MD, and the plan uses the new date when it is run next."
        label="Vendor's update" required={false} confirmLabel="Move the date"
        onConfirm={async (note) => { setAsking(false); await write(note.trim() || null); }}
        onClose={() => { setAsking(false); setDraft(dayText(value)); }} />
    </>
  );
}
