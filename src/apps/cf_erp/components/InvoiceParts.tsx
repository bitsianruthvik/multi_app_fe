import { Alert, Box, Button, Typography } from '@mui/material';
import type { Invoice, InvoiceStatus } from '../api/gst';
import { issueConfirmText, money2, normalizeProblems } from '../lib/gst';
import { Badge, Mono } from './ui';
import { AmountInWords } from './GstUi';

/** Draft grey, issued green, cancelled red — the same three words everywhere an invoice appears. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === 'issued') return <Badge family="success" label="Issued" />;
  if (status === 'cancelled') return <Badge family="danger" label="Cancelled" />;
  return <Badge family="neutral" noIcon label="Draft" />;
}

/**
 * Why a draft cannot be issued yet, one line each, with a link to where it is
 * fixed. `onGo` is given the fix's path so the page decides how to navigate.
 */
export function InvoiceProblems({ problems, onGo }: { problems: Invoice['problems']; onGo: (to: string) => void }) {
  const list = normalizeProblems(problems);
  if (list.length === 0) return null;
  return (
    <Alert severity="warning" data-testid="invoice-problems" sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Fill these in before it can be issued</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {list.map((p) => (
          <li key={p.text} data-testid="invoice-problem">
            {p.text}
            {p.fix && <Button size="small" onClick={() => onGo(p.fix!.to)} sx={{ ml: 1, py: 0, minWidth: 0 }}>{p.fix.label}</Button>}
          </li>
        ))}
      </Box>
    </Alert>
  );
}

/** Taxable, the tax split the place of supply asks for, round-off, total — and the total in words. */
export function InvoiceTotals({ totals, isIgst }: { totals: Invoice['totals']; isIgst: boolean }) {
  const rows: [string, number, boolean?][] = [
    ['Taxable value', totals.taxable],
    ...(isIgst ? [['IGST', totals.igst] as [string, number]] : [['CGST', totals.cgst], ['SGST', totals.sgst]] as [string, number][]),
    ['Round-off', totals.roundOff],
    ['Total', totals.grandTotal, true],
  ];
  return (
    <Box data-testid="invoice-totals" sx={{ ml: 'auto', maxWidth: 360, px: 2, py: 1.5, borderTop: '1px solid var(--c-divider)' }}>
      {rows.map(([label, value, strong]) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.25 }}>
          <Typography sx={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 600 : 400, color: strong ? 'var(--c-text)' : 'var(--c-text-2)' }}>{label}</Typography>
          <Mono sx={strong ? { fontWeight: 600, fontSize: 14 } : undefined}>{money2(value)}</Mono>
        </Box>
      ))}
      <Box sx={{ mt: 0.5 }}><AmountInWords words={totals.inWords} /></Box>
    </Box>
  );
}

/** What the Issue confirmation says: what happens, what is frozen, and how a mistake is mended afterwards. */
export function IssueConfirmBody({ invoice }: { invoice: Pick<Invoice, 'order' | 'customer' | 'totals'> }) {
  const t = issueConfirmText(invoice);
  return (
    <Box data-testid="issue-confirm">
      <Typography sx={{ fontSize: 14, mb: 1 }}>{t.lead}</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Frozen at that moment:</Typography>
      <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5, fontSize: 13.5, color: 'var(--c-text-2)' }}>{t.frozen.map((f) => <li key={f}>{f}</li>)}</Box>
      <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{t.after}</Typography>
    </Box>
  );
}
