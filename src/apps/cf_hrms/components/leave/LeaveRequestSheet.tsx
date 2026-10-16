/**
 * One leave request in a side sheet, with everything a manager needs to decide
 * it (CF_HRMS_HIRING_SPEC.md §22.6): the request and its reason, the balance
 * before → after and why, the day list, the checks, this person's leave so far
 * this year, who else in the team is off on those days, the policy line, the
 * rule sentence and the notice given. Approve (optional note) / Reject (note
 * required); HR may also cancel, with a note.
 *
 * Shared by Approvals (the approver's door) and HR's Leave requests (HR's door):
 * the caller hands in how to read and how to act, so the sheet is the same.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { DetailSkeleton, ErrorNotice, PromptDialog, SideSheet, useToast } from '@shared/ui';
import {
  dateWord, daysWord, numberWord, rangeWord, requestLine,
  type LeaveRequest, type RequestWithContext,
} from '../../api/leaveRequests';
import { BalanceChange, Block, ChecksList, DayList, LeaveStatusBadge } from './LeaveParts';

export interface SheetActions {
  load: (id: number) => Promise<RequestWithContext>;
  approve: (id: number, note?: string) => Promise<LeaveRequest>;
  reject: (id: number, note: string) => Promise<LeaveRequest>;
  /** HR only. */
  cancel?: (id: number, note: string) => Promise<LeaveRequest>;
}

function noticeWord(n: number): string {
  if (n < 0) return `Asked ${-n} ${-n === 1 ? 'day' : 'days'} after the first day of leave.`;
  if (n === 0) return 'Asked on the first day of leave.';
  return `Asked ${n} ${n === 1 ? 'day' : 'days'} ahead.`;
}

export function LeaveRequestSheet({
  id,
  onClose,
  actions,
  onChanged,
}: {
  /** The request to show; null = closed. */
  id: number | null;
  onClose: () => void;
  actions: SheetActions;
  /** After an approve, reject or cancel: the list reloads. */
  onChanged: (r: LeaveRequest) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<RequestWithContext | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (id == null) return undefined;
    let live = true;
    setData(null);
    setError(null);
    setNote('');
    setNoteError(false);
    setActError(null);
    actions.load(id)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [id, actions]);

  const r = data?.request;
  const c = data?.context;

  const act = async (kind: 'approve' | 'reject') => {
    if (!r) return;
    if (kind === 'reject' && !note.trim()) {
      setNoteError(true);
      noteRef.current?.focus();
      return;
    }
    setBusy(kind);
    setActError(null);
    try {
      const next = kind === 'approve'
        ? await actions.approve(r.id, note.trim() || undefined)
        : await actions.reject(r.id, note.trim());
      toast.success(kind === 'approve' ? `Approved: ${r.person.name}'s leave.` : `Rejected: ${r.person.name}'s leave.`);
      onChanged(next);
      onClose();
    } catch (e) {
      setActError(e);
    } finally {
      setBusy(null);
    }
  };

  const mayDecide = !!r && r.status === 'PENDING' && (r.can.approve || r.can.reject);
  const mayCancel = !!r && !!actions.cancel && r.can.cancel;

  return (
    <>
      <SideSheet
        open={id != null}
        onClose={onClose}
        width={560}
        title={r ? r.person.name : 'Leave request'}
        subtitle={r ? [r.person.employeeCode, r.person.positionTitle, r.person.departmentName].filter(Boolean).join(' · ') : undefined}
        actions={r && (mayDecide || mayCancel) ? (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
            {mayCancel && (
              <Button color="inherit" onClick={() => setCancelOpen(true)} disabled={!!busy} sx={{ mr: 'auto' }} data-action="cancel-leave">
                Cancel leave
              </Button>
            )}
            {mayDecide && r.can.reject && (
              <Button
                color="error" variant="outlined" disabled={!!busy} onClick={() => void act('reject')} data-action="reject-leave"
                startIcon={busy === 'reject' ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                Reject
              </Button>
            )}
            {mayDecide && r.can.approve && (
              <Button
                variant="contained" color="success" disabled={!!busy} onClick={() => void act('approve')} data-action="approve-leave"
                startIcon={busy === 'approve' ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                Approve
              </Button>
            )}
          </Box>
        ) : undefined}
      >
        {error ? (
          <ErrorNotice error={error} fallback="Could not open this request." />
        ) : !r || !c ? (
          <DetailSkeleton />
        ) : (
          <Box data-leave-sheet={r.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{requestLine(r)}</Typography>
              <LeaveStatusBadge status={r.status} />
            </Box>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
              {r.submittedAt ? `Asked on ${dateWord(r.submittedAt)}` : 'Asked'}
              {r.raisedByHr ? ' by HR on their behalf' : ''}. {noticeWord(c.noticeDays)}
              {r.approver ? ` Goes to ${r.approver.name}.` : ' Waiting for HR — no manager above this position.'}
            </Typography>

            <Block title="Reason">
              <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{r.reason || '—'}</Typography>
            </Block>

            {(r.decisionNote || r.cancelNote) && (
              <Block title={r.status === 'CANCELLED' ? 'Why it was cancelled' : 'Decision'}>
                <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {r.status === 'CANCELLED' ? r.cancelNote : r.decisionNote}
                </Typography>
                {r.decidedBy && (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {r.decidedBy}{r.decidedAt ? `, ${dateWord(r.decidedAt)}` : ''}
                  </Typography>
                )}
              </Block>
            )}

            {c.checks.length > 0 && (
              <Block title="Checks">
                <ChecksList checks={c.checks} />
              </Block>
            )}

            <Block title={`${c.balance.name} balance`}>
              {r.status === 'PENDING' || r.status === 'APPROVED' ? (
                // The context's balance leaves this request out (spec §22.3: re-checked
                // "without this request's own hold"), so it is the balance before it.
                <BalanceChange
                  before={c.balance.available}
                  after={c.balance.available == null ? null : Math.round((c.balance.available - r.quantity) * 100) / 100}
                  why={c.balance.why}
                  limited={c.balance.limited}
                />
              ) : (
                <>
                  <Typography sx={{ fontSize: 14 }}>
                    Available now: <b>{numberWord(c.balance.available, c.balance.limited)}</b>
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>{c.balance.why}</Typography>
                </>
              )}
            </Block>

            <Block title="The days">
              <DayList days={c.days} />
            </Block>

            <Block title="Others off on these days">
              {c.teamOff.length === 0 ? (
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nobody else in the team is off then.</Typography>
              ) : (
                <Stack spacing={0.5} data-team-off="">
                  {c.teamOff.map((t, i) => (
                    <Box key={`${t.person.employeeId}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{t.person.name}</Typography>
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 0 }}>
                        {t.leaveTypeName} · {rangeWord(t.from, t.to)}
                      </Typography>
                      <LeaveStatusBadge status={t.status} />
                    </Box>
                  ))}
                </Stack>
              )}
            </Block>

            <Block title="Leave so far this year">
              {c.yearSoFar.length === 0 ? (
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No other leave this year.</Typography>
              ) : (
                <Stack spacing={0.5} data-year-so-far="">
                  {c.yearSoFar.map((y, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>
                        {y.leaveTypeName} · {daysWord(y.quantity)} · {rangeWord(y.from, y.to)}
                      </Typography>
                      <LeaveStatusBadge status={y.status} />
                    </Box>
                  ))}
                </Stack>
              )}
            </Block>

            <Block title="The rule">
              <Typography sx={{ fontSize: 13.5 }}>{c.policyLine}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{c.ruleSentence}</Typography>
            </Block>

            {mayDecide && (
              <Box sx={{ mt: 2.5 }}>
                <TextField
                  inputRef={noteRef}
                  label="Your note"
                  multiline
                  minRows={2}
                  size="small"
                  fullWidth
                  value={note}
                  onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setNoteError(false); }}
                  error={noteError}
                  helperText={noteError ? 'Say why it is rejected. The person reads this.' : 'Optional to approve. Needed to reject.'}
                  inputProps={{ maxLength: 1000, 'data-field': 'decision-note' }}
                />
                <ErrorNotice error={actError} fallback="Could not save the decision." sx={{ mt: 1.5 }} />
              </Box>
            )}
            {!mayDecide && actError != null && <ErrorNotice error={actError} />}
          </Box>
        )}
      </SideSheet>

      {r && actions.cancel && (
        <PromptDialog
          open={cancelOpen}
          title="Cancel this leave?"
          body={`${requestLine(r)} for ${r.person.name}. The days go back to their balance.`}
          label="Why it is cancelled"
          confirmLabel="Cancel leave"
          danger
          onClose={() => setCancelOpen(false)}
          onConfirm={async (v) => {
            const next = await actions.cancel!(r.id, v);
            toast.success(`Cancelled: ${r.person.name}'s leave.`);
            onChanged(next);
            onClose();
          }}
        />
      )}
    </>
  );
}
