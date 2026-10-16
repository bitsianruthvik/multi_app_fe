/**
 * "Ask for leave" (CF_HRMS_HIRING_SPEC.md §22.6) — the form and its live answer.
 *
 * The person picks a leave type, one day or a range, a half day where the rule
 * allows it, and writes a reason. While they type, the server is asked what
 * would happen (debounced): the summary sentence, every date and whether it
 * counts, the balance before → after, the checks, and who it goes to. Nothing
 * is worked out here — the preview IS the server's answer, re-run on submit.
 *
 * Used twice: on My leave (the person's own preview route) and by HR asking on
 * somebody's behalf (the HR preview route, with an employee id). The caller
 * hands in the two calls; the form does not know which door it is behind.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, CircularProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import SendRounded from '@mui/icons-material/SendRounded';
import { ErrorNotice, Surface } from '@shared/ui';
import {
  numberWord, personLine,
  type AskBody, type Balance, type HalfDay, type LeaveRequest, type Person, type Preview,
} from '../../api/leaveRequests';
import { BalanceChange, Block, ChecksList, DayList } from './LeaveParts';

const PREVIEW_DELAY_MS = 400;

type Mode = 'ONE' | 'RANGE';

export function AskLeaveForm({
  balances,
  approver,
  preview,
  submit,
  onSubmitted,
  submitLabel = 'Send for approval',
}: {
  balances: Balance[];
  /** Who it would go to, before the first preview answers. */
  approver?: Person | null;
  preview: (body: AskBody) => Promise<Preview>;
  submit: (body: AskBody & { reason: string }) => Promise<LeaveRequest>;
  onSubmitted: (r: LeaveRequest) => void;
  submitLabel?: string;
}) {
  const usable = useMemo(() => balances.filter((b) => b.canAsk), [balances]);
  const [typeId, setTypeId] = useState<number | ''>(usable[0]?.leaveTypeId ?? '');
  const [mode, setMode] = useState<Mode>('ONE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState<HalfDay | ''>('');
  const [reason, setReason] = useState('');

  const [answer, setAnswer] = useState<{ key: string; preview: Preview } | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const seq = useRef(0);

  const balance = balances.find((b) => b.leaveTypeId === typeId) ?? null;
  const halfAllowed = !!balance?.halfDayAllowed && mode === 'ONE';
  // A half day the rule no longer allows (the type or the mode changed) is dropped.
  const halfDay: HalfDay | undefined = halfAllowed && half ? half : undefined;

  const body: AskBody | null = useMemo(() => {
    if (typeId === '' || !from) return null;
    const end = mode === 'ONE' ? from : to;
    if (!end) return null;
    return { leaveTypeId: typeId, from, to: end, ...(halfDay ? { halfDay } : {}) };
  }, [typeId, from, to, mode, halfDay]);
  const key = body ? JSON.stringify(body) : '';

  useEffect(() => {
    if (!body) return undefined;
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      setAsking(true);
      preview(body)
        .then((p) => {
          if (seq.current !== mine) return;
          setAnswer({ key, preview: p });
          setPreviewError(null);
        })
        .catch((e) => {
          if (seq.current !== mine) return;
          setPreviewError(e);
        })
        .finally(() => {
          if (seq.current === mine) setAsking(false);
        });
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `body` is described by `key`; `preview` is a stable call from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The answer on screen is for what is on the form now — or it is not shown.
  const p = body && answer?.key === key ? answer.preview : null;
  const blocked = !!p && (p.checks.some((c) => c.level === 'BLOCK') || !p.canSubmit);
  const canSend = !!p && !blocked && !!reason.trim() && !sending && !asking;
  const goesTo = p ? p.approver : approver;

  const send = async () => {
    if (!body || !canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await submit({ ...body, reason: reason.trim() });
      setFrom('');
      setTo('');
      setHalf('');
      setReason('');
      setAnswer(null);
      onSubmitted(r);
    } catch (e) {
      setSendError(e);
    } finally {
      setSending(false);
    }
  };

  if (!usable.length) {
    return (
      <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
        There is no leave type you can ask for right now. The cards above say why.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Stack spacing={1.75} data-ask-form="">
        <TextField
          select
          size="small"
          label="Leave type"
          value={typeId}
          onChange={(e) => setTypeId(Number(e.target.value))}
          fullWidth
        >
          {usable.map((b) => (
            <MenuItem key={b.leaveTypeId} value={b.leaveTypeId}>
              {b.name}
              <Box component="span" sx={{ ml: 1, color: 'var(--c-text-2)', fontSize: 13 }}>
                {b.limited ? `${numberWord(b.available)} available` : 'no limit'}
              </Box>
            </MenuItem>
          ))}
        </TextField>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v: Mode | null) => {
            if (!v) return;
            setMode(v);
            if (v === 'RANGE' && from && !to) setTo(from);
          }}
          aria-label="One day or a range"
        >
          <ToggleButton value="ONE" sx={{ px: 2 }}>One day</ToggleButton>
          <ToggleButton value="RANGE" sx={{ px: 2 }}>A range</ToggleButton>
        </ToggleButtonGroup>

        {mode === 'ONE' ? (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              type="date" size="small" label="Date" value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: '1 1 160px' }}
              inputProps={{ 'data-field': 'date' }}
            />
            {halfAllowed && (
              <TextField
                select size="small" label="How much" value={half}
                onChange={(e) => setHalf(e.target.value as HalfDay | '')}
                sx={{ flex: '1 1 160px' }}
                SelectProps={{ displayEmpty: true }}
                slotProps={{ inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Full day</MenuItem>
                <MenuItem value="FIRST">First half</MenuItem>
                <MenuItem value="SECOND">Second half</MenuItem>
              </TextField>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              type="date" size="small" label="From" value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: '1 1 140px' }}
              inputProps={{ 'data-field': 'from' }}
            />
            <TextField
              type="date" size="small" label="To" value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: '1 1 140px' }}
              inputProps={{ 'data-field': 'to', min: from || undefined }}
            />
          </Box>
        )}

        <TextField
          label="Reason"
          required
          multiline
          minRows={3}
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Read by whoever approves it."
          fullWidth
          inputProps={{ maxLength: 1000, 'data-field': 'reason' }}
        />

        <ErrorNotice error={sendError} fallback="Could not send this request." />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
            disabled={!canSend}
            onClick={() => void send()}
            data-action="submit-leave"
          >
            {submitLabel}
          </Button>
          {p && blocked && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger-700)' }}>Fix the red lines first.</Typography>
          )}
          {p && !blocked && !reason.trim() && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Write a reason to send it.</Typography>
          )}
        </Box>
      </Stack>

      <Surface e={0} data-preview="" sx={{ p: 2, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', minWidth: 0 }}>
        {!body ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
            {mode === 'ONE' ? 'Pick a date' : 'Pick the first and last day'} to see what will be counted.
          </Typography>
        ) : previewError && !p ? (
          <ErrorNotice error={previewError} fallback="Could not work this out." />
        ) : !p ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Working it out…</Typography>
          </Box>
        ) : (
          <Box sx={{ opacity: asking ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }}>
            <Typography data-preview-summary="" sx={{ fontSize: 14.5, fontWeight: 500, color: 'var(--c-text)', mb: 1.5, lineHeight: 1.45 }}>
              {p.summary}
            </Typography>
            {p.checks.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <ChecksList checks={p.checks} />
              </Box>
            )}
            <Block title="Balance">
              <BalanceChange before={p.balance.before} after={p.balance.after} why={p.balance.why} limited={balance?.limited ?? true} />
            </Block>
            <Block title="The days">
              <DayList days={p.days} dense />
            </Block>
            <Typography data-goes-to="" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              {goesTo ? <>Goes to <b>{personLine(goesTo)}</b></> : 'Goes to HR — there is no manager above this position.'}
            </Typography>
          </Box>
        )}
      </Surface>
    </Box>
  );
}
