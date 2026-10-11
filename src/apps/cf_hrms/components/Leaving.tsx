import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, FormControlLabel, Radio, RadioGroup, Skeleton, Stack, TextField, Typography } from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { ConfirmDialog, FormDialog, useToast } from '@shared/ui';
import { noticeLabel, peopleApi, type Exit, type ExitReasonType, type NoticeRef } from '../api/people';
import { hiringApi, niceDate, todayIso } from '../api/hiring';

/**
 * Leaving — notice, and then closing the employee (CF_HRMS_HIRING_SPEC.md §4).
 *
 * AN EMPLOYEE IS NEVER DELETED. Leaving is three states and two decisions:
 *
 *   working  --"Start leaving"-->  on notice  --"End notice and close employee"-->  left
 *                                      \--"Cancel the notice"-->  working again
 *
 * While on notice the person is still in their position and still counted;
 * nothing about their work changes until the notice is ended. Ending it is the
 * one step that cannot be taken back here: their assignment ends, the position
 * becomes vacant and their login stops working — so its dialog says exactly
 * that, and the button is the destructive colour.
 *
 * One component for both places the user asked for it — the person in the org
 * chart panel and the employee page — so the two cannot say different things.
 * The status sentence is the server's (`exit.statusLine`), shown as written.
 *
 * The words are "leaving", "notice" and "left". Nobody is deleted or terminated.
 */

/** Used only when the server has no reason list yet (§4.3, in its order). */
const FALLBACK_REASONS: ExitReasonType[] = [
  {
    type: 'RESIGNED',
    label: 'The employee resigned',
    reasons: [
      ['BETTER_JOB', 'Better job elsewhere'], ['PERSONAL', 'Personal or family reasons'], ['RELOCATION', 'Moving to another place'],
      ['PAY', 'Pay'], ['WORK_CONDITIONS', 'Work, shift or conditions'], ['HEALTH', 'Health'], ['STUDIES', 'Further studies'],
      ['RETIRED', 'Retirement'], ['OTHER', 'Something else'],
    ].map(([code, label]) => ({ code, label, noteRequired: code === 'OTHER' })),
  },
  {
    type: 'REMOVED',
    label: 'We ended the employment',
    reasons: [
      ['ABSENT', 'Stopped coming to work'], ['PERFORMANCE', 'Performance'], ['PROBATION', 'Not confirmed after probation'],
      ['MISCONDUCT', 'Misconduct'], ['CONTRACT_END', 'Contract or project ended'], ['ROLE_REMOVED', 'Position no longer needed'],
      ['DECEASED', 'Passed away'], ['OTHER', 'Something else'],
    ].map(([code, label]) => ({ code, label, noteRequired: code === 'OTHER' })),
  },
];

const CHOICE_WORDS: Record<'RESIGNED' | 'REMOVED', { title: string; hint: string }> = {
  RESIGNED: { title: 'The employee resigned', hint: 'They told us they are leaving.' },
  REMOVED: { title: 'We are ending the employment', hint: 'The company decided.' },
};

const addDays = (iso: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const daysBetween = (from: string, to: string): number | null => {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86_400_000);
};
const daysWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');


/** The label as a quiet warning chip, for HTML rows. */
export function NoticeChip({ notice }: { notice: Pick<NoticeRef, 'lastWorkingDay'> }) {
  return (
    <Box
      component="span"
      data-notice=""
      sx={{
        fontSize: 11,
        px: 0.75,
        py: '1px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--c-warning-50)',
        color: 'var(--c-warning-800)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {noticeLabel(notice)}
    </Box>
  );
}

interface Person {
  id: number;
  fullName: string;
}

const shrink = { inputLabel: { shrink: true } };

/** Start leaving — or, with `exit`, change the dates and the reason of a notice that is running. */
export function StartLeavingDialog({
  open,
  person,
  positionWords,
  exit,
  onClose,
  onDone,
}: {
  open: boolean;
  person: Person;
  /** "Shift Incharge · P021-1", repeated on the confirm step. */
  positionWords?: string | null;
  /** Present to edit a running notice. */
  exit?: Exit | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [types, setTypes] = useState<ExitReasonType[] | null>(null);
  const [noticeDays, setNoticeDays] = useState(30);
  const [type, setType] = useState<'RESIGNED' | 'REMOVED' | null>(null);
  const [reason, setReason] = useState('');
  const [noticeDate, setNoticeDate] = useState(todayIso());
  const [lastDay, setLastDay] = useState('');
  /** Until someone sets it, the last working day follows the notice date. */
  const [lastTouched, setLastTouched] = useState(false);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setStep('form');
    setType(exit?.exitType ?? null);
    setReason(exit?.reasonCode ?? '');
    setNote(exit?.note ?? '');
    const from = day(exit?.noticeDate) || todayIso();
    setNoticeDate(from);
    setLastDay(day(exit?.lastWorkingDay) || addDays(from, noticeDays));
    setLastTouched(!!exit);
    peopleApi
      .exitReasons()
      .then((r) => {
        if (live) setTypes(r.types?.length ? r.types : FALLBACK_REASONS);
      })
      .catch(() => {
        if (live) setTypes(FALLBACK_REASONS);
      });
    // The company's own notice period sets the default last day; 30 when it has none.
    hiringApi
      .settings()
      .then((r) => {
        const n = Number(r.settings?.noticeDaysConfirmed);
        if (!live || !Number.isFinite(n) || n < 0) return;
        setNoticeDays(n);
        if (!exit) setLastDay(addDays(from, n));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Reset only when the dialog opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reasons = useMemo(() => types?.find((t) => t.type === type)?.reasons ?? [], [types, type]);
  const chosen = reasons.find((r) => r.code === reason) ?? null;
  const span = noticeDate && lastDay ? daysBetween(noticeDate, lastDay) : null;
  const backwards = span != null && span < 0;
  const noteMissing = !!chosen?.noteRequired && !note.trim();
  const ready = !!type && !!chosen && !!noticeDate && !!lastDay && !backwards && !noteMissing;

  // TWO DIALOGS, ONE AFTER THE OTHER. The kit's FormDialog closes itself when its
  // submit succeeds, so "Continue" cannot keep it open: the form hands over to a
  // confirm dialog, and "Back" there returns to the form with everything still typed.
  const leavingForm = useRef(false);
  const toConfirm = () => {
    leavingForm.current = true;
    setStep('confirm');
  };
  const closeForm = () => {
    // The FormDialog's own close after "Continue" is not the person closing it.
    if (leavingForm.current) {
      leavingForm.current = false;
      return;
    }
    onClose();
  };

  const send = async () => {
    if (!type || !chosen) return;
    const body = { exitType: type, reasonCode: chosen.code, note: note.trim() || null, noticeDate, lastWorkingDay: lastDay };
    if (exit) await peopleApi.updateExit(person.id, body);
    else await peopleApi.startExit(person.id, body);
    toast.success(exit ? 'Notice updated.' : `${person.fullName} is on notice until ${niceDate(lastDay)}.`);
    onDone();
    setStep('form');
    onClose();
  };

  const typeLabel = types?.find((t) => t.type === type)?.label ?? (type ? CHOICE_WORDS[type].title : '');

  return (
    <>
      <FormDialog
        open={open && step === 'form'}
        title={exit ? `Change the notice of ${person.fullName}` : `${person.fullName} is leaving`}
        subtitle={
          exit
            ? 'They stay on notice; only what is recorded about it changes.'
            : 'This puts them on notice. They stay in their position, and in every count, until the notice is ended.'
        }
        onClose={closeForm}
        onSubmit={toConfirm}
        submitLabel="Continue"
        submitDisabled={!ready}
        maxWidth="sm"
        enterSubmits={false}
      >
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box role="group" aria-label="Who decided" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {(['RESIGNED', 'REMOVED'] as const).map((t) => {
              const on = type === t;
              return (
                <Box
                  key={t}
                  component="button"
                  type="button"
                  aria-pressed={on}
                  data-leaving-type={t}
                  onClick={() => {
                    setType(t);
                    if (type !== t) setReason('');
                  }}
                  sx={{
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    p: 1.5,
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid',
                    borderColor: on ? 'var(--c-primary-500)' : 'var(--c-border)',
                    background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                    '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                  }}
                >
                  <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{CHOICE_WORDS[t].title}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{CHOICE_WORDS[t].hint}</Typography>
                </Box>
              );
            })}
          </Box>

          {type && (
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>Reason</Typography>
              {types == null ? (
                <Skeleton variant="rounded" height={90} />
              ) : (
                <RadioGroup
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-label="Reason"
                  sx={{ display: 'block', columnCount: { xs: 1, sm: 2 }, columnGap: 2, '& > label': { display: 'flex', breakInside: 'avoid' } }}
                >
                  {reasons.map((r) => (
                    <FormControlLabel
                      key={r.code}
                      value={r.code}
                      control={<Radio size="small" sx={{ py: 0.5 }} />}
                      sx={{ m: 0 }}
                      label={<Typography sx={{ fontSize: 13.5 }}>{r.label}</Typography>}
                    />
                  ))}
                </RadioGroup>
              )}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField
              label="Notice given on"
              type="date"
              size="small"
              value={noticeDate}
              onChange={(e) => {
                setNoticeDate(e.target.value);
                if (!lastTouched && e.target.value) setLastDay(addDays(e.target.value, noticeDays));
              }}
              slotProps={shrink}
            />
            <TextField
              label="Last working day"
              type="date"
              size="small"
              value={lastDay}
              error={backwards}
              onChange={(e) => {
                setLastDay(e.target.value);
                setLastTouched(true);
              }}
              slotProps={shrink}
              helperText={
                backwards
                  ? 'The last working day cannot be before the notice was given.'
                  : span == null
                    ? undefined
                    : span === 0
                      ? 'No notice: they leave the day it is given.'
                      : `${daysWord(span)}’ notice${!lastTouched ? ` — the company’s usual ${daysWord(noticeDays)}` : ''}`
              }
            />
          </Box>

          <TextField
            label={chosen?.noteRequired ? 'Note' : 'Note (optional)'}
            required={!!chosen?.noteRequired}
            size="small"
            multiline
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            helperText={chosen?.noteRequired ? 'This reason needs a sentence saying what happened.' : undefined}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={open && step === 'confirm'}
        title={exit ? 'Save these changes to the notice?' : `Put ${person.fullName} on notice?`}
        confirmLabel={exit ? 'Save the notice' : 'Start the notice'}
        // "Cancel" here is "Back": the form returns with everything still typed.
        onClose={() => setStep('form')}
        onConfirm={send}
        body={
          <Box data-leaving-confirm="">
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.5, m: 0, mb: 1.5, fontSize: 14 }}>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Name</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{person.fullName}</Box>
              {positionWords && (
                <>
                  <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Position</Box>
                  <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{positionWords}</Box>
                </>
              )}
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Why</Box>
              <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{typeLabel} — {chosen?.label}</Box>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Notice given</Box>
              <Box component="dd" sx={{ m: 0 }}>{niceDate(noticeDate)}</Box>
              <Box component="dt" sx={{ color: 'var(--c-text-2)' }}>Last working day</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 600 }}>
                {niceDate(lastDay)}
                {span != null ? ` (${span === 0 ? 'no notice — they leave today' : `${daysWord(span)}’ notice`})` : ''}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--c-text-2)' }}>
              Nothing else changes yet. On or after the last working day, end the notice to close the employee — or cancel
              the notice if they stay.
            </Typography>
          </Box>
        }
      />
    </>
  );
}

/** End notice and close employee. */
function EndNoticeDialog({
  open,
  person,
  exit,
  onClose,
  onDone,
}: {
  open: boolean;
  person: Person;
  exit: Exit;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const today = todayIso();
  const recorded = day(exit.lastWorkingDay);
  const early = recorded > today;
  const [lastDay, setLastDay] = useState(recorded);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    // A notice that still has days to run can only be ended on a day that has come.
    setLastDay(early ? today : recorded);
    setNote('');
  }, [open, early, today, recorded]);

  const future = !!lastDay && lastDay > today;

  const submit = async () => {
    const r = await peopleApi.closeExit(person.id, { lastWorkingDay: lastDay || undefined, note: note.trim() || undefined });
    const freed = r.vacatedPositions?.length ?? 0;
    toast.success(
      `${person.fullName} has left.` +
        (freed ? ` ${freed === 1 ? 'Their position is' : `${freed} positions are`} now vacant.` : '') +
        (r.loginDisabled ? ' Their login no longer works.' : ''),
    );
    onDone();
    onClose();
  };

  return (
    <FormDialog
      open={open}
      title="End notice and close employee"
      subtitle={person.fullName}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="End notice and close employee"
      submitColor="error"
      submitDisabled={!lastDay || future}
      maxWidth="xs"
      enterSubmits={false}
    >
      <Stack spacing={1.5} sx={{ pt: 0.75 }}>
        <TextField
          label="Last working day"
          type="date"
          size="small"
          value={lastDay}
          error={future}
          onChange={(e) => setLastDay(e.target.value)}
          slotProps={shrink}
          helperText={
            future
              ? 'Choose today or an earlier day. A notice cannot be ended on a day that has not come.'
              : early
                ? `Recorded as ${niceDate(recorded)}, which has not come yet. This ends the notice early.`
                : undefined
          }
        />
        <Typography data-endnotice-effect="" sx={{ fontSize: 14, lineHeight: 1.55 }}>
          Their assignment ends, the position becomes vacant and their login stops working.
        </Typography>
        <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: 'var(--c-text-2)' }}>
          Their record, documents and employee code are kept, under Employees › Left. This cannot be undone from here.
        </Typography>
        <TextField label="Note (optional)" size="small" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Stack>
    </FormDialog>
  );
}

/**
 * The leaving state of one person, and what can be done about it:
 *   working    nothing is drawn but, with `showStart`, the "Start leaving" button;
 *   on notice  the band, with End / Cancel / Change;
 *   left       the band, read-only, with whatever `afterLeft` offers.
 */
export function LeavingBand({
  person,
  status,
  exit,
  exitDate,
  positionWords,
  canManage,
  showStart = true,
  dense = false,
  afterLeft,
  onChanged,
}: {
  person: Person;
  /** `employmentStatus`. */
  status: string;
  exit: Exit | null | undefined;
  /** The employee's own exit date, for someone who left before leaving records existed. */
  exitDate?: string | null;
  positionWords?: string | null;
  canManage: boolean;
  /** Off where the page puts "Start leaving" among its own header buttons. */
  showStart?: boolean;
  /** The org chart panel: tighter. */
  dense?: boolean;
  /** Under the "Left on …" line — e.g. "Hire for the position they left". */
  afterLeft?: ReactNode;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [dialog, setDialog] = useState<'start' | 'edit' | 'end' | 'cancel' | null>(null);
  const open = exit && exit.status === 'OPEN' ? exit : null;
  const onNotice = status === 'NOTICE';
  const left = status === 'EXITED';

  const start = (
    <StartLeavingDialog
      open={dialog === 'start' || dialog === 'edit'}
      person={person}
      positionWords={positionWords}
      exit={dialog === 'edit' ? open : null}
      onClose={() => setDialog(null)}
      onDone={onChanged}
    />
  );

  if (!onNotice && !left) {
    if (!showStart || !canManage || status !== 'ACTIVE') return null;
    return (
      <>
        <Button size="small" variant="outlined" color="inherit" startIcon={<LogoutRounded />} data-startleaving="" onClick={() => setDialog('start')}>
          Start leaving
        </Button>
        {start}
      </>
    );
  }

  const tone = left ? 'neutral' : 'warning';
  const days = open?.daysLeft;
  const headline = exit?.statusLine ?? (left ? `Left${exitDate ? ` on ${niceDate(day(exitDate))}` : ''}` : 'On notice');
  const detail = exit
    ? [
        `${exit.typeLabel} — ${exit.reasonLabel.charAt(0).toLowerCase()}${exit.reasonLabel.slice(1)}`,
        !left && exit.noticeDate ? `notice given ${niceDate(day(exit.noticeDate))}` : null,
        !left && days != null ? (days > 0 ? `${daysWord(days)} left` : days === 0 ? 'last day is today' : `last day was ${daysWord(-days)} ago`) : null,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <Box
      data-leavingband={left ? 'left' : 'notice'}
      role="status"
      sx={{
        borderLeft: `3px solid var(--c-${tone}-600)`,
        background: `var(--c-${tone}-50)`,
        px: dense ? 1.25 : 1.75,
        py: dense ? 1 : 1.25,
        mb: dense ? 1.25 : 2,
        borderRadius: '0 var(--r-sm) var(--r-sm) 0',
      }}
    >
      <Typography sx={{ fontSize: dense ? 13.5 : 14.5, fontWeight: 600, color: `var(--c-${tone}-800)`, overflowWrap: 'anywhere' }}>{headline}</Typography>
      {detail && <Typography sx={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{detail}</Typography>}
      {exit?.note?.trim() && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>Note: {exit.note.trim()}</Typography>
      )}
      {onNotice && !open && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>
          No leaving record goes with this status, so there is no last working day to show.
        </Typography>
      )}

      {onNotice && open && canManage && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          <Button size="small" variant="contained" color="error" data-endnotice="" onClick={() => setDialog('end')}>
            End notice and close employee
          </Button>
          <Button size="small" variant="outlined" color="inherit" data-cancelnotice="" onClick={() => setDialog('cancel')}>
            Cancel the notice
          </Button>
          <Button size="small" color="inherit" onClick={() => setDialog('edit')}>
            Change dates or reason
          </Button>
        </Stack>
      )}
      {left && afterLeft && <Box sx={{ mt: 1 }}>{afterLeft}</Box>}

      {start}
      {open && (
        <>
          <EndNoticeDialog open={dialog === 'end'} person={person} exit={open} onClose={() => setDialog(null)} onDone={onChanged} />
          <ConfirmDialog
            open={dialog === 'cancel'}
            // The kit names its other button "Cancel", so this one says what it does in other words.
            title="Take the notice back?"
            confirmLabel="Yes, they are staying"
            body={`${person.fullName} goes back to working as before and stays in their position. The notice is kept in their history as withdrawn.`}
            onClose={() => setDialog(null)}
            onConfirm={async () => {
              await peopleApi.withdrawExit(person.id);
              toast.success(`The notice is cancelled. ${person.fullName} is working as before.`);
              onChanged();
            }}
          />
        </>
      )}
    </Box>
  );
}

export default LeavingBand;
