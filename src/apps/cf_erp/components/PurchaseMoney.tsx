import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, TextField } from '@mui/material';
import type { PurchaseLine } from '../api/types';
import { dayText, priceText } from '../lib/money';

/** "last paid ₹1,250 (Acme Steel, 2026-09-12)" with a one-click Use. */
export function LastPaidHint({ lastPaid, onUse, current }: { lastPaid: PurchaseLine['lastPaid']; onUse?: (price: number) => void; current?: number | null }) {
  if (!lastPaid) return <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}>never bought before</Box>;
  const who = [lastPaid.supplierName, dayText(lastPaid.date)].filter(Boolean).join(', ');
  const same = current != null && Math.abs(current - lastPaid.unitPrice) < 0.00005;
  return (
    <Box component="span" data-testid="last-paid" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}>
      last paid {priceText(lastPaid.unitPrice)}{who ? ` (${who})` : ''}
      {onUse && !same && <Button size="small" onClick={() => onUse(lastPaid.unitPrice)} sx={{ minWidth: 0, py: 0, ml: 0.5, fontSize: 11.5 }}>Use</Button>}
    </Box>
  );
}

/**
 * A line's price, typed in place. It saves when you leave the box or press
 * Enter; empty clears the price. `onSave` throws to say why it was refused.
 */
export function PriceCell({ line, onSave, disabled }: { line: PurchaseLine; onSave: (price: string | null) => Promise<void>; disabled?: boolean }) {
  const [text, setText] = useState(line.unitPrice == null ? '' : String(line.unitPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(line.unitPrice == null ? '' : String(line.unitPrice)); }, [line.unitPrice]);
  const commit = async (value: string) => {
    const before = line.unitPrice == null ? '' : String(line.unitPrice);
    if (value.trim() === before) return;
    setBusy(true);
    setError(null);
    try { await onSave(value.trim() === '' ? null : value.trim()); } catch (e) { setError((e as Error).message); setText(before); } finally { setBusy(false); }
  };
  return (
    <Box sx={{ textAlign: 'right', minWidth: 130 }}>
      <TextField size="small" value={text} disabled={disabled || busy} placeholder="price" onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit(text)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        error={!!error} helperText={error ?? undefined}
        inputProps={{ inputMode: 'decimal', 'aria-label': `Price of ${line.item.code ?? line.item.name}`, style: { fontFamily: 'var(--font-mono)', textAlign: 'right', width: 90 } }}
        InputProps={{ startAdornment: <span style={{ color: 'var(--c-text-3)', marginRight: 2 }}>₹</span>, endAdornment: busy ? <CircularProgress size={12} /> : undefined }} />
      <Box><LastPaidHint lastPaid={line.lastPaid} current={line.unitPrice} onUse={disabled ? undefined : (p) => void commit(String(p))} /></Box>
    </Box>
  );
}
