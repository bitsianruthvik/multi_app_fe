import { useEffect, useMemo, useState } from 'react';
import { Box, FormControlLabel, Radio, RadioGroup, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import {
  LEGACY_CLOSE_GROUPS, hiringApi,
  type CloseNext, type CloseReasonGroup, type CloseReasonOption, type Hiring,
} from '../api/hiring';

/**
 * Closing a hiring without an employee (CF_HRMS_HIRING_SPEC.md §3.4).
 *
 * THE REASONS ARE THE SERVER'S: `GET /hiring/close-reasons?hiringId=` returns
 * the ones that can be true at this stage, in two groups — the candidate, the
 * company — already in the order they most often happen. This dialog draws that
 * list and decides nothing: it does not hide, add or reorder a reason.
 *
 * The chosen reason carries three things the dialog acts on: a hint (shown
 * under it), whether a note is required, and `next` — what to offer once the
 * hiring is closed, which is handed back to the flow.
 *
 * A closed hiring cannot be reopened, so the candidate's name is repeated here
 * and the button is the destructive colour.
 */
export function HiringCloseDialog({
  open,
  hiring,
  onClose,
  onClosed,
}: {
  open: boolean;
  hiring: Hiring;
  onClose: () => void;
  onClosed: (hiring: Hiring, next: CloseNext) => void;
}) {
  const [groups, setGroups] = useState<CloseReasonGroup[] | null>(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setGroups(null);
    setCode('');
    setNote('');
    hiringApi
      .closeReasons(hiring.id)
      .then((r) => {
        if (live) setGroups((r.groups ?? []).filter((g) => g.reasons?.length));
      })
      // A server without the list still closes with the first version's three reasons.
      .catch(() => {
        if (live) setGroups(LEGACY_CLOSE_GROUPS);
      });
    return () => {
      live = false;
    };
  }, [open, hiring.id]);

  const chosen: CloseReasonOption | null = useMemo(
    () => groups?.flatMap((g) => g.reasons).find((r) => r.code === code) ?? null,
    [groups, code],
  );
  const candidate = hiring.candidateName?.trim() || null;
  const position = [hiring.roleTitle, hiring.positionCode].filter(Boolean).join(' · ');
  const noteMissing = !!chosen?.noteRequired && !note.trim();

  const submit = async () => {
    if (!chosen) return;
    const { hiring: closed } = await hiringApi.close(hiring.id, { reason: chosen.code, note: note.trim() || undefined });
    onClosed(closed, chosen.next ?? null);
  };

  return (
    <FormDialog
      open={open}
      title="Close this hiring"
      subtitle={candidate ? `${candidate} · ${position}` : `No candidate yet · ${position}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Close hiring"
      submitColor="error"
      submitDisabled={!chosen || noteMissing}
      maxWidth="sm"
      enterSubmits={false}
    >
      <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.55, mb: 1.5 }}>
        {candidate ? `${candidate} will not be hired through this hiring.` : 'Nobody is hired through this hiring.'} The
        position becomes vacant again and no employee is created. A closed hiring cannot be reopened.
      </Typography>

      {groups == null ? (
        <Stack spacing={1} aria-busy="true" aria-label="Loading the reasons">
          <Skeleton variant="rounded" height={36} />
          <Skeleton variant="rounded" height={36} />
          <Skeleton variant="rounded" height={36} />
        </Stack>
      ) : (
        <RadioGroup value={code} onChange={(e) => setCode(e.target.value)} aria-label="Why is this hiring being closed">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: groups.length > 1 ? '1fr 1fr' : '1fr' }, columnGap: 2.5, rowGap: 1.5, alignItems: 'start' }}>
            {groups.map((g) => (
              <Box key={g.label} data-closegroup={g.label} sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.25 }}>
                  {g.label}
                </Typography>
                {g.reasons.map((r) => (
                  <Box key={r.code}>
                    <FormControlLabel
                      value={r.code}
                      control={<Radio size="small" sx={{ py: 0.5 }} />}
                      sx={{ alignItems: 'flex-start', m: 0, '& .MuiFormControlLabel-label': { pt: '5px' } }}
                      label={<Typography sx={{ fontSize: 13.5, lineHeight: 1.4 }}>{r.label}</Typography>}
                    />
                    {code === r.code && r.hint && (
                      <Typography data-closehint="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45, pl: '30px', pb: 0.5 }}>
                        {r.hint}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </RadioGroup>
      )}

      <TextField
        label={chosen?.noteRequired ? 'Note' : 'Note (optional)'}
        required={!!chosen?.noteRequired}
        size="small"
        fullWidth
        multiline
        minRows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        helperText={chosen?.noteRequired ? 'This reason needs a sentence saying what happened.' : undefined}
        sx={{ mt: 2 }}
      />
    </FormDialog>
  );
}

export default HiringCloseDialog;
