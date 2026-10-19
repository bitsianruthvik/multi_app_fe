/**
 * One attendance request in a side sheet, with its context (CF_HRMS_HIRING_SPEC.md §28.5): the
 * request and reason, the day as recorded and its punches, the shift, this month's late marks,
 * earlier requests, the policy in words. Approve (optional note) / Reject (note required).
 * Shared by Approvals (the approver's door) and HR's Attendance › Requests (HR's door).
 */
import { useEffect, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { DetailSkeleton, ErrorNotice, SideSheet, StatusBadge, useToast, errorMessage } from '@shared/ui';
import { STATUS_WORDS, dayLabel, hm, minutesWord, type AttRequest, type AttRequestWithContext } from '../../api/attendance';
import { PolicySentences } from './AttendanceParts';

export interface AttSheetActions {
  load: (id: number) => Promise<AttRequestWithContext>;
  approve: (id: number, note?: string) => Promise<unknown>;
  reject: (id: number, note: string) => Promise<unknown>;
}

const Label = ({ children }: { children: React.ReactNode }) => <Typography sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--c-text-3)', mt: 1.5, mb: 0.5 }}>{children}</Typography>;

export function AttendanceRequestSheet({ id, onClose, actions, onChanged }: { id: number | null; onClose: () => void; actions: AttSheetActions; onChanged: (r?: AttRequest) => void }) {
  const toast = useToast();
  const [data, setData] = useState<AttRequestWithContext | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id == null) return undefined;
    let live = true;
    setData(null); setError(null); setNote('');
    actions.load(id).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [id, actions]);

  const act = async (verdict: 'approve' | 'reject') => {
    if (!data) return;
    if (verdict === 'reject' && !note.trim()) { toast.error('Write why it is rejected.'); return; }
    setBusy(true);
    try {
      if (verdict === 'approve') await actions.approve(data.request.id, note.trim() || undefined);
      else await actions.reject(data.request.id, note.trim());
      toast.success(verdict === 'approve' ? 'Approved — the day is updated.' : 'Rejected.');
      onChanged();
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const r = data?.request;
  const cx = data?.context;
  return (
    <SideSheet
      open={id != null}
      onClose={onClose}
      width={520}
      title={r ? r.title : 'Attendance request'}
      subtitle={r ? `${r.person.name} · ${dayLabel(r.date)}` : undefined}
      actions={r && (r.can.approve || r.can.reject) ? (
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => act('reject')} data-action="reject-att">Reject</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" disabled={busy} onClick={() => act('approve')} data-action="approve-att">Approve</Button>
        </Box>
      ) : undefined}
    >
      <ErrorNotice error={error} />
      {!data && !error && <DetailSkeleton />}
      {r && cx && (
        <Stack spacing={0.5} data-att-sheet={r.id}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={r.status} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{[r.person.positionTitle, r.person.departmentName].filter(Boolean).join(' · ')}</Typography>
          </Box>
          <Typography sx={{ fontSize: 14, mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{r.reason}”</Typography>
          {r.decisionNote && <Typography sx={{ fontSize: 13 }}>Decision: “{r.decisionNote}” {r.decidedBy ? `— ${r.decidedBy}` : ''}</Typography>}

          <Label>The day as recorded</Label>
          {cx.day ? (
            <Box sx={{ fontSize: 13.5 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{STATUS_WORDS[cx.day.status]} · In {hm(cx.day.inTime) || '—'} · Out {hm(cx.day.outTime) || '—'}{cx.day.workedMinutes != null ? ` · worked ${minutesWord(cx.day.workedMinutes)}` : ''}</Typography>
              {cx.day.why && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{cx.day.why}</Typography>}
            </Box>
          ) : <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing recorded yet.</Typography>}
          {cx.shift && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Shift {cx.shift.name}: {cx.shift.plan}</Typography>}
          <Typography sx={{ fontSize: 13 }} data-att-punches={cx.punches.length}>
            Punches: {cx.punches.length ? cx.punches.map((p) => `${hm(p.at)}${p.direction !== 'UNKNOWN' ? ` ${p.direction}` : ''} (${p.method.toLowerCase()})`).join(', ') : 'none'}
          </Typography>

          <Label>This month</Label>
          <Typography sx={{ fontSize: 13.5 }}>
            {cx.lateMarksThisMonth.length ? `${cx.lateMarksThisMonth.length} late mark${cx.lateMarksThisMonth.length === 1 ? '' : 's'}: ${cx.lateMarksThisMonth.map((m) => `${dayLabel(m.date)} (${minutesWord(m.minutes)})`).join(', ')}` : 'No late marks.'}
          </Typography>
          {cx.earlierThisMonth.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13 }}>{cx.earlierThisMonth.map((e) => <li key={e.id}>{dayLabel(e.date)} · {e.title} · {e.status.toLowerCase()}</li>)}</Box>
          )}

          <Label>The policy</Label>
          <PolicySentences line={cx.policyLine} sentences={cx.policySentences} />

          {(r.can.approve || r.can.reject) && (
            <TextField sx={{ mt: 2 }} label="Note (needed to reject)" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} data-field="decision-note" />
          )}
        </Stack>
      )}
    </SideSheet>
  );
}
