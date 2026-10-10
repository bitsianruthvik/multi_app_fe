import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { CfApiError } from '../../api/client';
import { setLineExpected } from '../../api/purchase';
import { updatePurchaseLine } from '../../api/requisitions';
import type { PurchaseOrder } from '../../api/types';
import { dayText } from '../../lib/money';
import { useToast } from '../toastContext';

/**
 * One line's tentative expected date, edited in place: it is saved when the box loses focus (or Enter), never on
 * every keystroke — a date typed digit by digit passes through nonsense years. A line without a date is highlighted.
 */
export function DateCell({ value, label, lineId, disabled, missing, onSaved }: {
  value: string | null; label: string; lineId: number; disabled?: boolean; missing?: boolean; onSaved: (po: PurchaseOrder) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(dayText(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(dayText(value)); }, [value]);
  const save = async () => {
    if (busy || draft === dayText(value)) return;
    setBusy(true);
    try { onSaved(await setLineExpected(lineId, draft || null)); }
    catch (e) { setDraft(dayText(value)); toast.error(e instanceof CfApiError ? (e.problems[0] ?? e.message) : (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Box component="input" type="date" value={draft} disabled={disabled || busy} aria-label={label} data-testid="expected-date" data-missing={missing ? 'true' : 'false'}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
      sx={{
        fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)',
        border: `1px solid ${missing ? 'var(--c-warning-500)' : 'var(--c-border)'}`,
      }} />
  );
}

/**
 * One line's ordered quantity, edited in place and saved when the box loses focus. It cannot go below what has
 * arrived; the server refuses that with its own sentence.
 */
export function QtyCell({ value, label, lineId, disabled, onSaved }: {
  value: number; label: string; lineId: number; disabled?: boolean; onSaved: (po: PurchaseOrder) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  const save = async () => {
    const q = Number(draft);
    if (busy || draft.trim() === '' || q === value) { if (draft.trim() === '') setDraft(String(value)); return; }
    if (!Number.isFinite(q) || q <= 0) { setDraft(String(value)); toast.error('Enter a quantity above zero.'); return; }
    setBusy(true);
    try { onSaved(await updatePurchaseLine(lineId, { quantity: q })); }
    catch (e) { setDraft(String(value)); toast.error(e instanceof CfApiError ? (e.problems[0] ?? e.message) : (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Box component="input" value={draft} disabled={disabled || busy} inputMode="decimal" aria-label={label} data-testid="line-qty"
      onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
      sx={{ width: 90, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }} />
  );
}
