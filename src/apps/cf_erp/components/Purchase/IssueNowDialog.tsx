import { useEffect, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { FormDialog } from '../FormDialog';
import { Mono } from '../ui';
import { issueMaterialRequest, type MrIssueResult, type MrScreen } from '../../api/purchaseRequests';
import { qtyText } from '../../lib/inventory';

const EPS = 1e-6;
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/**
 * §95 ISSUE NOW (BE POST /material-requests/:id/issue): what is earmarked for the MR and still in the store — taken from
 * stock, or received on its purchase orders — leaves the store as ONE stock issue. Used for the MR's sales order, else
 * General; an MR for a maintenance order puts the MO on the issue (its parts cost). Where it comes from is the server's
 * dry run (storage first, the most first); the quantities may be lowered to issue part of it now.
 */
export function IssueNowDialog({ mr, onClose, onDone }: {
  mr: MrScreen | null;
  onClose: () => void;
  onDone: (next: MrScreen, message: string) => void;
}) {
  const lines = (mr?.lines ?? []).filter((l) => (l.toIssue ?? 0) > EPS);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [date, setDate] = useState('');
  const [plan, setPlan] = useState<MrIssueResult | null>(null);
  useEffect(() => {
    if (!mr) return undefined;
    setQty(Object.fromEntries(mr.lines.filter((l) => (l.toIssue ?? 0) > EPS).map((l) => [l.id, String(l.toIssue)])));
    setDate('');
    setPlan(null);
    let alive = true;
    issueMaterialRequest(mr.id, { dryRun: true }).then((p) => { if (alive) setPlan(p); }).catch(() => { /* the submit says why */ });
    return () => { alive = false; };
  }, [mr]);
  const problemOf = (lineId: number, max: number) => {
    const q = num(qty[lineId] ?? '');
    if (!Number.isFinite(q) || q < 0) return 'A number, zero or more';
    if (q > max + EPS) return `At most ${qtyText(max)}`;
    return null;
  };
  const chosen = lines.map((l) => ({ lineId: l.id, quantity: num(qty[l.id] ?? '') })).filter((x) => Number.isFinite(x.quantity) && x.quantity > EPS);
  const bad = lines.some((l) => problemOf(l.id, l.toIssue) != null);
  const usedFor = mr?.issueUsedFor === 'order' && mr.order ? `sales order ${mr.order.code}` : 'General (overhead)';
  return (
    <FormDialog open={!!mr} onClose={onClose} title={`Issue now — ${mr?.code ?? ''}`} submitLabel="Issue" busyLabel="Issuing…" maxWidth="md"
      subtitle={<>One stock issue, used for <b>{usedFor}</b>{mr?.forType === 'maintenance_order' ? ', costed to its maintenance order' : ''}.</>}
      submitDisabled={bad || !chosen.length}
      onSubmit={async () => {
        const r = await issueMaterialRequest(mr!.id, { lines: chosen, ...(date ? { movementDate: date } : {}) });
        if (r.materialRequest) onDone(r.materialRequest, r.message ?? `${r.movement?.code ?? 'The issue'} is posted.`);
      }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 1, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Material — from</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', textAlign: 'right' }}>In store, to issue</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Issue</Typography>
        {lines.map((l) => {
          const from = plan?.lines.find((p) => p.lineId === l.id)?.from ?? [];
          const problem = problemOf(l.id, l.toIssue);
          return (
            <Box key={l.id} sx={{ display: 'contents' }}>
              <Box sx={{ minWidth: 0 }}>
                <Mono>{l.item.code ?? l.item.name}</Mono>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>
                  {from.length ? from.map((f) => `${f.area}${f.batch ? ` (lot ${f.batch})` : ''} ${qtyText(f.quantity)}`).join(' · ') : l.item.name}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}><Mono>{qtyText(l.toIssue)}</Mono> <Mono muted>{l.item.uom}</Mono></Box>
              <TextField size="small" value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                error={!!problem} helperText={problem ?? undefined} sx={{ width: 120 }}
                inputProps={{ inputMode: 'decimal', 'aria-label': `Issue — ${l.item.code ?? l.item.name}`, 'data-testid': 'mr-issue-qty' }} />
            </Box>
          );
        })}
      </Box>
      <TextField size="small" type="date" label="Date (blank = today)" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 200 }}
        inputProps={{ 'data-testid': 'mr-issue-date' }} />
    </FormDialog>
  );
}
