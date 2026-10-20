/**
 * Parts every claim screen shares (payroll P3b): the status chip, the bills with a download each, and the
 * claim's facts — amount, type, bill date, what it was for, the journeys of an LTA claim, the notes of the
 * manager and of HR, and how much of the type's yearly limit is used. Used by Payroll › Claims (HR),
 * Approvals (the manager) and My pay › Claims (the person); each passes its own door for a bill.
 */
import { useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import { ToneBadge, errorMessage, useToast } from '@shared/ui';
import type { Claim, ClaimBill, ClaimContext } from '../../api/payrollExit';
import type { TaxFile } from '../../api/tax';
import { saveBase64File } from '../../api/excel';
import { longDay } from '../jobDates';
import { CLAIM_TONE, rupees, sizeWord, stampDay } from './payWords';

export function ClaimStatusBadge({ claim }: { claim: Pick<Claim, 'status' | 'statusWords'> }) {
  return <ToneBadge tone={CLAIM_TONE[claim.status] ?? 'neutral'} label={claim.statusWords || claim.status.toLowerCase()} noIcon />;
}

/** The bills of a claim, each one a download through the caller's door. */
export function BillList({ bills, load }: { bills: ClaimBill[]; load: (fileId: number) => Promise<TaxFile> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  if (!bills.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No bills attached.</Typography>;
  return (
    <Stack spacing={0.5} data-claim-bills={bills.length}>
      {bills.map((b) => (
        <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <AttachFileRounded sx={{ fontSize: 16, color: 'var(--c-text-3)', flexShrink: 0 }} />
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
            {b.fileName} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>· {sizeWord(b.sizeBytes)}</Box>
          </Typography>
          <Button
            size="small"
            disabled={busy != null}
            startIcon={busy === b.id ? <CircularProgress size={12} color="inherit" /> : undefined}
            onClick={async () => {
              setBusy(b.id);
              try { saveBase64File(await load(b.id)); } catch (e) { toast.error(errorMessage(e, 'The bill could not be downloaded.')); } finally { setBusy(null); }
            }}
          >
            Download
          </Button>
        </Box>
      ))}
    </Stack>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--c-text-3)', mt: 1.5, mb: 0.5 }}>{children}</Typography>
);

/** What a claim is, in words. `context` = the type's yearly limit and what is used of it. */
export function ClaimFacts({ claim: c, context, loadBill }: { claim: Claim; context?: ClaimContext | null; loadBill: (fileId: number) => Promise<TaxFile> }) {
  return (
    <Stack spacing={0.5} data-claim={c.id}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <ClaimStatusBadge claim={c} />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{c.type.name} · {c.year}</Typography>
      </Box>
      <Typography sx={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', mt: 1 }}>
        {rupees(c.amount)}
        {c.approvedAmount != null && c.approvedAmount !== c.amount && (
          <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text-2)', ml: 1 }}>approved {rupees(c.approvedAmount)}</Typography>
        )}
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
        Bill of {longDay(c.billDate)}{c.submittedAt ? ` · asked ${stampDay(c.submittedAt)}` : ''}
        {c.payMonthLabel ? ` · ${c.status === 'PAID' ? 'paid in' : 'pays in'} the ${c.payMonthLabel} payroll` : ''}
      </Typography>
      {c.description && <Typography sx={{ fontSize: 14, mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{c.description}”</Typography>}

      {c.journeys && c.journeys.length > 0 && (
        <>
          <Label>Journeys</Label>
          {c.journeys.map((j, i) => (
            <Typography key={i} sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>
              {j.from} → {j.to} · {longDay(j.startDate)}{j.endDate ? ` – ${longDay(j.endDate)}` : ''}{j.mode ? ` · ${j.mode}` : ''}
            </Typography>
          ))}
          {(c.ltaExempt != null || c.ltaNote) && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {c.ltaExempt === true ? 'Not taxed: within the journeys allowed in the block.' : c.ltaExempt === false ? 'Taxed.' : ''} {c.ltaNote ?? ''}
            </Typography>
          )}
        </>
      )}

      {context && (
        <>
          <Label>This year</Label>
          <Typography sx={{ fontSize: 13.5 }}>
            {context.limit != null
              ? `Limit ${rupees(context.limit)} a year · used ${rupees(context.usedThisYear)} · left ${rupees(Math.max(0, context.limit - context.usedThisYear))}`
              : `No yearly limit · used ${rupees(context.usedThisYear)} this year`}
          </Typography>
          {context.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{context.note}</Typography>}
        </>
      )}

      {(c.managerNote || c.managerBy) && (
        <Typography sx={{ fontSize: 13, mt: 1 }}>
          Manager{c.managerBy ? ` (${c.managerBy})` : ''}: {c.managerNote ? `“${c.managerNote}”` : 'recommended'}{c.managerAt ? ` · ${stampDay(c.managerAt)}` : ''}
        </Typography>
      )}
      {(c.decisionNote || c.decidedBy) && (
        <Typography sx={{ fontSize: 13 }}>
          Decision{c.decidedBy ? ` (${c.decidedBy})` : ''}: {c.decisionNote ? `“${c.decisionNote}”` : c.statusWords}{c.decidedAt ? ` · ${stampDay(c.decidedAt)}` : ''}
        </Typography>
      )}

      <Label>Bills</Label>
      <BillList bills={c.bills} load={loadBill} />
    </Stack>
  );
}
