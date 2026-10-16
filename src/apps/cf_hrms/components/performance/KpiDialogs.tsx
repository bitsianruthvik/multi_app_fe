/**
 * The two KPI dialogs of the plan page (CF_HRMS_HIRING_SPEC.md §18.3):
 *
 *   KpiFormDialog       add a KPI, or change one, on a DRAFT plan
 *   TargetChangeDialog  change a target on an ACTIVE plan — from a day, with a reason
 */
import { useEffect, useState } from 'react';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import type { CombineRule, Direction, KpiInput, Option, PlanKpi, TargetChangeInput } from '../../api/performance';
import { todayIso } from '../jobDates';
import { DIRECTION_LABEL, frequencyWord } from './planWords';

const DIRECTIONS: Direction[] = ['HIGHER_BETTER', 'LOWER_BETTER', 'EXACT', 'TEXT'];

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export function KpiFormDialog({
  open,
  kpi,
  kraName,
  directions,
  entryFrequencies,
  combineRules = [],
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null = add a new KPI. */
  kpi: PlanKpi | null;
  /** Where a new KPI goes: a KRA's name, or "Not under a KRA". */
  kraName: string;
  directions: Option<Direction>[];
  entryFrequencies: string[];
  /** How several slots make one actual (spec §19.1): added up, average, latest. */
  combineRules?: Option<CombineRule>[];
  onClose: () => void;
  /** Throw to keep the dialog open with the server's words. */
  onSubmit: (body: KpiInput) => Promise<unknown>;
}) {
  const adding = !kpi;
  // A KPI copied from the job keeps the job's name; only one added for this period can be renamed.
  const nameEditable = adding || kpi?.mark === 'ADDED';
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<Direction>('HIGHER_BETTER');
  const [number, setNumber] = useState('');
  const [words, setWords] = useState('');
  const [unit, setUnit] = useState('');
  const [frequency, setFrequency] = useState('');
  const [weight, setWeight] = useState('');
  const [combine, setCombine] = useState<CombineRule | ''>('');

  useEffect(() => {
    if (!open) return;
    setName(kpi?.name ?? '');
    setDirection(kpi?.direction ?? 'HIGHER_BETTER');
    setNumber(kpi?.targetNumber != null ? String(kpi.targetNumber) : '');
    setWords(kpi?.targetText ?? '');
    setUnit(kpi?.unit ?? '');
    setFrequency(kpi?.frequency ?? '');
    setWeight(kpi?.weightPercent != null ? String(kpi.weightPercent) : '');
    setCombine(kpi?.combine ?? '');
  }, [open, kpi]);

  const dirOptions = directions.length ? directions : DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] }));
  const asWords = direction === 'TEXT';
  const badNumber = !asWords && number.trim() !== '' && Number.isNaN(Number(number));
  const badWeight = weight.trim() !== '' && (Number.isNaN(Number(weight)) || Number(weight) < 0 || Number(weight) > 100);

  const submit = () => {
    const body: KpiInput = {
      direction,
      targetNumber: asWords ? null : numOrNull(number),
      targetText: asWords ? words.trim() || null : null,
      unit: unit.trim() || null,
      frequency: frequency || null,
      weightPercent: numOrNull(weight),
      ...(combine ? { combine } : {}),
    };
    if (nameEditable) body.name = name.trim();
    return onSubmit(body);
  };

  return (
    <FormDialog
      open={open}
      title={adding ? 'Add a KPI' : `Change “${kpi?.name}”`}
      subtitle={adding ? `For this period only, under ${kraName}. The job is not changed.` : 'For this period only. The job is not changed.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={adding ? 'Add' : 'Save'}
      submitDisabled={(nameEditable && !name.trim()) || badNumber || badWeight}
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        {nameEditable && (
          <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />
        )}
        <TextField select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value as Direction)} size="small" fullWidth>
          {dirOptions.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
        </TextField>
        {asWords ? (
          <TextField label="Target, in words" value={words} onChange={(e) => setWords(e.target.value)} size="small" fullWidth multiline minRows={2} />
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Target"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              size="small"
              fullWidth
              error={badNumber}
              helperText={badNumber ? 'A number, please.' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField label="Unit" placeholder="%, hours, count, ₹" value={unit} onChange={(e) => setUnit(e.target.value)} size="small" fullWidth />
          </Stack>
        )}
        <TextField
          select
          label="How often actuals are entered"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          size="small"
          fullWidth
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">Same as the plan</MenuItem>
          {entryFrequencies.map((f) => <MenuItem key={f} value={f}>{frequencyWord(f)}</MenuItem>)}
        </TextField>
        {combineRules.length > 0 && (
          <TextField
            select
            label="When it is entered more than once a period, its actual is"
            value={combine}
            onChange={(e) => setCombine(e.target.value as CombineRule | '')}
            size="small"
            fullWidth
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText="Added up for counts and output; the average for percentages, rates and times; the latest for a level at the end."
          >
            {adding && <MenuItem value="">Chosen from the unit</MenuItem>}
            {combineRules.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
        )}
        <TextField
          label="Weight within its KRA (%)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          size="small"
          fullWidth
          error={badWeight}
          helperText={badWeight ? 'A number from 0 to 100, or leave it empty.' : 'Optional.'}
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        />
      </Stack>
    </FormDialog>
  );
}

export function TargetChangeDialog({
  open,
  kpi,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kpi: PlanKpi | null;
  onClose: () => void;
  onSubmit: (body: TargetChangeInput) => Promise<unknown>;
}) {
  const [number, setNumber] = useState('');
  const [words, setWords] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setNumber(kpi?.targetNumber != null ? String(kpi.targetNumber) : '');
    setWords(kpi?.targetText ?? '');
    setFrom(todayIso());
    setReason('');
  }, [open, kpi]);

  const asWords = kpi?.direction === 'TEXT';
  const badNumber = !asWords && (number.trim() === '' || Number.isNaN(Number(number)));

  return (
    <FormDialog
      open={open}
      title={`Change the target of “${kpi?.name ?? ''}”`}
      subtitle="The plan is active, so the change is kept with its date and reason."
      onClose={onClose}
      onSubmit={() => onSubmit({
        ...(asWords ? { targetText: words.trim() } : { targetNumber: Number(number) }),
        effectiveFrom: from,
        reason: reason.trim(),
      })}
      submitLabel="Change target"
      submitDisabled={!reason.trim() || !from || (asWords ? !words.trim() : badNumber)}
      enterSubmits={false}
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Now: {kpi?.target || '—'}</Typography>
        {asWords ? (
          <TextField label="New target, in words" required value={words} onChange={(e) => setWords(e.target.value)} size="small" fullWidth multiline minRows={2} />
        ) : (
          <TextField
            label={`New target${kpi?.unit ? ` (${kpi.unit})` : ''}`}
            required
            autoFocus
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            size="small"
            fullWidth
            error={number.trim() !== '' && Number.isNaN(Number(number))}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        )}
        <TextField
          type="date"
          label="Takes effect"
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          size="small"
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} size="small" fullWidth multiline minRows={2} />
      </Stack>
    </FormDialog>
  );
}
