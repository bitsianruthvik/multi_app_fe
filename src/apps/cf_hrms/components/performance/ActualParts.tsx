/**
 * The pieces of ACTUALS (CF_HRMS_HIRING_SPEC.md §19), shared by Performance ›
 * Actuals, the plan page, My plan and the org chart, so an actual, an
 * achievement and a band read the same everywhere.
 *
 *   AchievementChip   "96.8% · On track" — the band's tone, never colour alone
 *   BandDot           a small dot with the band in words for screen readers
 *   ScoreLine         a plan's / KRA's score and "based on N of M KPIs"
 *   ActualInput       the cell: a number, or Met / Not met for a target written as
 *                     words. A first value saves by itself a moment after typing
 *                     stops; changing a value already entered asks why first.
 *   NoteButton        the note of an actual (no reason needed)
 *   HistoryDialog     every value a KPI's slots have had, corrections included
 *
 * Words: "actual", "target", "achievement", "on track / at risk / behind".
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import StickyNote2Outlined from '@mui/icons-material/StickyNote2Outlined';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { ErrorNotice, PromptDialog, ToneBadge, errorMessage } from '@shared/ui';
import type { Actual, ActualHistory, Band, BasedOn, Direction, KpiActuals } from '../../api/performance';
import { BAND_LABEL, BAND_TONE, actualWord } from './planWords';
import { longDay } from '../jobDates';

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/** "96.8% · On track", in the band's tone. Nothing entered: a quiet "No data". */
export function AchievementChip({ achievement, band, title }: { achievement: number | null; band: Band; title?: string }) {
  if (achievement == null || band === 'NO_DATA') {
    return <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>No data</Typography>;
  }
  return <ToneBadge tone={BAND_TONE[band]} label={`${pct(achievement)} · ${BAND_LABEL[band]}`} title={title ?? 'Achievement: the actual against the target'} />;
}

/** A small dot in the band's colour; the band is said in words for a screen reader and on hover. */
export function BandDot({ band, title, size = 9 }: { band: Band; title?: string; size?: number }) {
  const tone = BAND_TONE[band];
  const word = title ?? BAND_LABEL[band];
  return (
    <Tooltip title={word}>
      <Box
        component="span"
        role="img"
        aria-label={word}
        data-band={band}
        sx={{
          display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
          background: band === 'NO_DATA' ? 'transparent' : `var(--c-${tone}-600)`,
          border: band === 'NO_DATA' ? '1.5px solid var(--c-text-3)' : 'none',
        }}
      />
    </Tooltip>
  );
}

/** A score: "Score 94.5% · On track — based on 4 of 6 KPIs". */
export function ScoreLine({ score, band, basedOn, line, label = 'Score' }: { score: number | null; band: Band; basedOn?: BasedOn; line?: string | null; label?: string }) {
  return (
    <Box data-score="" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{label}</Typography>
      <AchievementChip achievement={score} band={band} title="The weighted average of the achievements entered so far" />
      {(line || basedOn) && (
        <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {line ?? (basedOn && basedOn.total ? `based on ${basedOn.counted} of ${basedOn.total} KPI${basedOn.total === 1 ? '' : 's'}` : '')}
        </Typography>
      )}
    </Box>
  );
}

/** `value`: a number — or, for a KPI due by a date, the day it was done (YYYY-MM-DD). */
export interface ActualCellValue { value?: number | string | null; met?: 'YES' | 'NO' | null; note?: string | null; reason?: string }

/**
 * The cell. A first value saves by itself 700 ms after typing stops (or on Enter
 * / leaving the box), with a quiet "Saved"; a change to a value already entered
 * asks for the reason first, and is saved only with one. The server is the
 * judge: its sentence is shown under the box when it refuses.
 */
export function ActualInput({
  direction, unit, actual, canEnter, label, onSave,
}: {
  direction: Direction;
  unit: string | null;
  actual: Actual | null;
  canEnter: boolean;
  /** For screen readers: "First pass yield, Oct 2026". */
  label: string;
  onSave: (v: ActualCellValue) => Promise<unknown>;
}) {
  const isText = direction === 'TEXT';
  // A KPI due by a date (spec §24 step 2): the actual is the day it was done.
  const isDate = direction === 'DATE';
  const initial = isText ? (actual?.met ?? '') : isDate ? (actual?.valueText ?? '') : (actual?.value != null ? String(actual.value) : '');
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [askWhy, setAskWhy] = useState<ActualCellValue | null>(null);
  const timer = useRef<number | null>(null);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  if (!canEnter) {
    return <Typography component="span" sx={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>{actualWord(actual, unit)}</Typography>;
  }

  const had = isText ? actual?.met != null : isDate ? actual?.valueText != null : actual?.value != null;
  const save = async (v: ActualCellValue) => {
    setState('saving');
    setProblem(null);
    try {
      await onSave(v);
      setState('saved');
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setState('idle');
      setProblem(errorMessage(e));
    }
  };
  const commit = (raw: string) => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const t = raw.trim();
    if (t === initial) { setProblem(null); return; }
    if (t === '') {
      if (had) { setProblem('A value once entered is corrected, not removed.'); setText(initial); }
      return;
    }
    let v: ActualCellValue;
    if (isText) v = { met: t as 'YES' | 'NO' };
    else if (isDate) v = { value: t };
    else {
      const n = Number(t.replace(/,/g, ''));
      if (!Number.isFinite(n)) { setProblem('Type a number.'); return; }
      v = { value: n };
    }
    if (had) setAskWhy(v);
    else void save(v);
  };

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        {isDate ? (
          <TextField
            type="date" size="small" value={text}
            onChange={(e) => { setText(e.target.value); setProblem(null); }}
            onBlur={() => commit(text)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(text); } }}
            error={!!problem}
            sx={{ width: 160 }}
            slotProps={{ htmlInput: { 'aria-label': `Done on: ${label}` } }}
          />
        ) : isText ? (
          <TextField
            select size="small" value={text}
            onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
            slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': `Met or not met: ${label}` } }}
            sx={{ width: 128 }}
            error={!!problem}
          >
            <MenuItem value="" disabled={had}><em>Not entered</em></MenuItem>
            <MenuItem value="YES">Met</MenuItem>
            <MenuItem value="NO">Not met</MenuItem>
          </TextField>
        ) : (
          <TextField
            size="small" value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              setProblem(null);
              // A first value saves by itself once typing stops; a correction waits for Enter or leaving the box.
              if (timer.current) window.clearTimeout(timer.current);
              if (!had) timer.current = window.setTimeout(() => commit(v), 700);
            }}
            onBlur={() => commit(text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(text); }
              else if (e.key === 'Escape') { setText(initial); setProblem(null); }
            }}
            error={!!problem}
            placeholder="—"
            sx={{ width: 118 }}
            slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Actual: ${label}`, style: { textAlign: 'right' } } }}
          />
        )}
        <Box component="span" aria-live="polite" sx={{ fontSize: 12, color: 'var(--c-text-3)', minWidth: 40 }}>
          {state === 'saving' ? <CircularProgress size={12} /> : state === 'saved' ? 'Saved' : (unit && !isText && !isDate ? unit : '')}
        </Box>
      </Box>
      {problem && <Typography role="alert" sx={{ fontSize: 12, color: 'var(--c-danger-600)', mt: 0.5, maxWidth: 280 }}>{problem}</Typography>}
      <PromptDialog
        open={!!askWhy}
        title="Correct a value already entered?"
        body={`It was ${actualWord(actual, unit)}; it becomes ${askWhy ? (askWhy.met ? (askWhy.met === 'YES' ? 'Met' : 'Not met') : typeof askWhy.value === 'string' ? actualWord({ value: null, valueText: askWhy.value } as Actual, unit) : actualWord({ value: askWhy.value ?? null } as Actual, unit)) : ''}. The earlier value is kept in the history.`}
        label="Why is it corrected?"
        required
        confirmLabel="Correct it"
        onClose={() => { setAskWhy(null); setText(initial); }}
        onConfirm={async (reason) => {
          const v = askWhy;
          if (!v) return;
          await onSave({ ...v, reason: reason.trim() });
          setAskWhy(null);
          setState('saved');
          window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
        }}
      />
    </Box>
  );
}

/** The note of an actual: an icon (filled when there is one); opens a box to write it. */
export function NoteButton({ actual, canEnter, label, onSave }: {
  actual: Actual | null; canEnter: boolean; label: string; onSave: (note: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const note = actual?.note ?? '';
  if (!canEnter && !note) return null;
  return (
    <>
      <Tooltip title={note || (actual ? 'Add a note' : 'Enter the actual first, then a note')}>
        <span>
          <IconButton
            size="small"
            aria-label={note ? `Note: ${note}` : `Add a note: ${label}`}
            disabled={!canEnter ? false : !actual}
            onClick={() => setOpen(true)}
            sx={{ color: note ? 'var(--c-primary-600, var(--c-text))' : 'var(--c-text-3)' }}
          >
            <StickyNote2Outlined fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {canEnter ? (
        <PromptDialog
          open={open}
          title="Note on this actual"
          body={label}
          label="Note"
          initialValue={note}
          required={false}
          multiline
          confirmLabel="Save note"
          onClose={() => setOpen(false)}
          onConfirm={async (v) => { await onSave(v.trim()); setOpen(false); }}
        />
      ) : (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Note</DialogTitle>
          <DialogContent><Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{note}</Typography></DialogContent>
          <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
        </Dialog>
      )}
    </>
  );
}

/** "History" — every value of a KPI's slots, the live one first, with who corrected what and why. */
export function HistoryButton({ load, title }: { load: () => Promise<ActualHistory>; title: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ActualHistory | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setData(null);
    setError(null);
    load().then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [open, load]);
  const unit = data?.kpi.unit ?? null;
  const slots = data ? [...new Set(data.rows.map((r) => r.slotStart))] : [];
  return (
    <>
      <Button size="small" startIcon={<HistoryRounded />} onClick={() => setOpen(true)}>History</Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
          {error != null && <ErrorNotice error={error} />}
          {!data && error == null && <CircularProgress size={20} />}
          {data && data.rows.length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>No actuals yet.</Typography>}
          {data && slots.map((s) => (
            <Box key={s} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>From {longDay(s)}</Typography>
              <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0, pl: 1.5, borderLeft: '2px solid var(--c-border)' }}>
                {data.rows.filter((r) => r.slotStart === s).map((r) => (
                  <Box component="li" key={r.id} sx={{ fontSize: 13, color: r.live ? 'var(--c-text)' : 'var(--c-text-2)' }}>
                    <b>{actualWord(r, unit)}</b>
                    {r.live ? ' — now' : ' — replaced'}
                    {' · '}{r.by ?? 'someone'}, {new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {r.source === 'EXCEL' ? ' · by Excel' : ''}
                    {r.reason ? <Box component="span" sx={{ display: 'block', color: 'var(--c-text-2)' }}>Why: {r.reason}</Box> : null}
                    {r.note ? <Box component="span" sx={{ display: 'block', color: 'var(--c-text-2)' }}>Note: {r.note}</Box> : null}
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}

/**
 * A KPI's actuals on the plan page and My plan: each slot with its value (an
 * input where this login may enter), the combined actual over the slots, the
 * achievement and band, and the history of corrections.
 */
export function KpiActualsBlock({
  kpi, canEnter, onSave, loadHistory,
}: {
  kpi: { name: string; unit: string | null; direction: Direction; actuals: KpiActuals };
  canEnter: boolean;
  onSave?: (slotStart: string, v: ActualCellValue) => Promise<unknown>;
  loadHistory?: () => Promise<ActualHistory>;
}) {
  const a = kpi.actuals;
  const many = a.slots.length > 1;
  const anyCorrected = a.slots.some((s) => s.actual?.corrected);
  const combinedWord = a.combined == null ? '—'
    : typeof a.combined === 'number' ? actualWord({ value: a.combined } as Actual, kpi.unit)
      : a.combined === 'YES' ? 'Met' : a.combined === 'NO' ? 'Not met' : a.combined;
  return (
    <Box data-kpi-actuals="" sx={{ mt: 1, p: 1, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', display: 'grid', gap: 0.75 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
        {a.slots.map((s) => (
          <Box key={s.start} data-slot={s.start} sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{many ? s.name : 'Actual'}</Typography>
            {s.open ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <ActualInput
                  direction={kpi.direction} unit={kpi.unit} actual={s.actual} canEnter={canEnter && !!onSave}
                  label={`${kpi.name}, ${s.name}`}
                  onSave={(v) => onSave!(s.start, v)}
                />
                <NoteButton actual={s.actual} canEnter={canEnter && !!onSave} label={`${kpi.name}, ${s.name}`} onSave={(note) => onSave!(s.start, { note })} />
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>from {longDay(s.start)}</Typography>
            )}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {many && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {a.combineLabel}: <b>{combinedWord}</b>
            {a.combine === 'SUM' && a.combinedTarget != null && a.counted < a.slotCount ? ` against ${actualWord({ value: a.combinedTarget } as Actual, kpi.unit)} for the ${a.counted} slot${a.counted === 1 ? '' : 's'} entered` : ''}
          </Typography>
        )}
        <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Achievement</Typography>
        <AchievementChip achievement={a.achievement} band={a.band} />
        {anyCorrected && loadHistory && <HistoryButton title={`${kpi.name} — history`} load={loadHistory} />}
      </Box>
    </Box>
  );
}
