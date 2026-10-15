/**
 * The plan page's reviews and actions (CF_HRMS_HIRING_SPEC.md §20.3): its
 * check-ins and final review, "Open a check-in" for a slot that has begun, and
 * its action items (add, change, done, drop) — for HR (mode 'hr') and for a
 * manager on a plan of someone below them (mode 'team'). What may be done is the
 * server's answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ErrorNotice, FormDialog, SectionCard, useToast } from '@shared/ui';
import { REVIEW_SOURCES, type Action, type PlanReviews } from '../../api/reviews';
import { ActionDialog, ActionsList, DueChip, ReviewStatusBadge } from './ReviewParts';
import { longDay } from '../jobDates';

export function PlanReviewsSection({ planId, company, mode, tick = 0 }: { planId: number; company: string; mode: 'hr' | 'team'; tick?: number }) {
  const src = REVIEW_SOURCES[mode];
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<PlanReviews | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [opening, setOpening] = useState(false);
  const [slotKey, setSlotKey] = useState('');
  const [actionDialog, setActionDialog] = useState<{ action: Action | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await src.planReviews!(planId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [planId, src]);
  useEffect(() => { void load(); }, [load, tick]);

  if (!data && !error) return null;
  if (!data) return <SectionCard title="Reviews and actions"><ErrorNotice error={error} onRetry={() => void load()} /></SectionCard>;

  const free = data.slots.filter((s) => s.open && !s.hasCheckIn);
  return (
    <>
      <SectionCard
        title="Reviews"
        subtitle={data.line ?? `Check-ins during the period; the final review ${data.finalOpensOn <= new Date().toISOString().slice(0, 10) ? 'was made' : 'is made'} on ${longDay(data.finalOpensOn)}.`}
        actions={data.can.openCheckIn && free.length > 0 ? (
          <Button size="small" onClick={() => { setSlotKey(`${free[free.length - 1].start}|${free[free.length - 1].end}`); setOpening(true); }}>Open a check-in</Button>
        ) : undefined}
      >
        {data.reviews.length === 0 ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>No reviews yet.</Typography>
        ) : (
          <Box data-plan-reviews="">
            {data.reviews.map((r) => (
              <Box
                key={r.id}
                component={RouterLink}
                to={src.reviewPath(company, r.id)}
                data-plan-review={r.id}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1, px: 1, textDecoration: 'none', color: 'inherit',
                  borderBottom: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', '&:last-of-type': { borderBottom: 0 }, '&:hover': { background: 'var(--c-surface-2)' },
                }}
              >
                <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.kindLabel}{r.slot ? ` · ${r.slot.name}` : ''}</Typography>
                  {r.rating && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Rating {r.rating.value} — {r.rating.label}</Typography>}
                </Box>
                <DueChip dueDate={r.dueDate} overdue={r.overdue} daysOverdue={r.daysOverdue} open={r.status === 'OPEN' || r.status === 'EMPLOYEE_DONE'} />
                <ReviewStatusBadge status={r.status} />
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      <SectionCard
        title="Actions"
        subtitle="What was agreed for this plan — who does it, by when."
        actions={data.can.addAction ? <Button size="small" onClick={() => setActionDialog({ action: null })}>Add an action</Button> : undefined}
      >
        <ActionsList
          actions={data.actions}
          empty="No actions on this plan."
          onDone={async (a, note) => { await src.actionDone!(a.id, note); toast.success('Action done.'); await load(); }}
          onDrop={async (a, note) => { await src.dropAction!(a.id, note); toast.success('Action dropped.'); await load(); }}
          onChange={(a) => setActionDialog({ action: a })}
        />
      </SectionCard>

      <FormDialog
        open={opening}
        title="Open a check-in"
        subtitle="A conversation about one slot of the plan. The person writes their part; you write yours and close it."
        onClose={() => setOpening(false)}
        submitLabel="Open"
        submitDisabled={!slotKey}
        onSubmit={async () => {
          const [slotStart, slotEnd] = slotKey.split('|');
          const made = await src.openCheckIn!(planId, { slotStart, slotEnd });
          toast.success('Check-in opened.');
          navigate(src.reviewPath(company, made.id));
        }}
      >
        <TextField select label="For" value={slotKey} onChange={(e) => setSlotKey(e.target.value)}>
          {free.map((s) => <MenuItem key={`${s.start}|${s.end}`} value={`${s.start}|${s.end}`}>{s.name}{s.whole ? ' (the whole period)' : ''}</MenuItem>)}
        </TextField>
        <Stack><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>It is due on the slot&rsquo;s last day.</Typography></Stack>
      </FormDialog>

      {actionDialog && (
        <ActionDialog
          open
          action={actionDialog.action}
          owners={data.owners}
          onClose={() => setActionDialog(null)}
          onSubmit={async (body) => {
            if (actionDialog.action) await src.changeAction!(actionDialog.action.id, body);
            else await src.addAction!(planId, body);
            toast.success(actionDialog.action ? 'Action changed.' : 'Action added.');
            await load();
          }}
        />
      )}
    </>
  );
}
