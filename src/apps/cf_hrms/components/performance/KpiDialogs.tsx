/**
 * The two KPI dialogs of the plan page (CF_HRMS_HIRING_SPEC.md §18.3):
 *
 *   KpiFormDialog       add a KPI, or change one, on a DRAFT plan
 *   TargetChangeDialog  change a target on an ACTIVE plan — from a day, with a reason
 *
 * Both type the target in THE KPI target input (KpiTargetInput, spec §24 step 2): the plan KPI's
 * which-way and unit make its rule — a number with its unit and mark, a range, a date, or words.
 */
import { useEffect, useMemo, useState } from 'react';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import type { CombineRule, Direction, KpiInput, Option, PlanKpi, TargetChangeInput } from '../../api/performance';
import { todayIso } from '../jobDates';
import { DIRECTION_LABEL, frequencyWord } from './planWords';
import { KpiTargetInput } from '../KpiTargetInput';
import { EMPTY_DRAFT, readDraft, unitMeasure, type TargetDraft, type TargetRule } from '../kpiTarget';

const DIRECTIONS: Direction[] = ['HIGHER_BETTER', 'LOWER_BETTER', 'EXACT', 'TARGET_RANGE', 'DATE', 'TEXT'];

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** A plan KPI's rule for the target input: its which-way and its unit. Words: no rule (a text box). */
function planRule(direction: Direction, unit: string | null): TargetRule {
  if (direction === 'TEXT') return { measure: null, unit: null, direction: null };
  if (direction === 'DATE') return { measure: 'DATE', unit: null, direction: null };
  return { measure: unitMeasure(unit) ?? 'NUMBER', unit: unit || null, direction };
}
/** A plan KPI's target -> the input's draft. */
function planDraft(kpi: Pick<PlanKpi, 'direction' | 'targetNumber' | 'targetMax' | 'targetDate' | 'targetText'> | null): TargetDraft {
  if (!kpi) return { ...EMPTY_DRAFT };
  const s = (n: number | null | undefined) => (n == null ? '' : String(n));
  if (kpi.direction === 'TEXT') return { ...EMPTY_DRAFT, words: true, text: kpi.targetText ?? '' };
  if (kpi.direction === 'DATE') return { ...EMPTY_DRAFT, date: kpi.targetDate ?? '' };
  if (kpi.direction === 'TARGET_RANGE') return { ...EMPTY_DRAFT, min: s(kpi.targetNumber), max: s(kpi.targetMax) };
  return { ...EMPTY_DRAFT, value: s(kpi.targetNumber) };
}
/** The input's draft -> a plan's target fields; `problem` when it cannot be sent. */
function planTargetFields(direction: Direction, draft: TargetDraft, rule: TargetRule): { fields: Pick<KpiInput, 'targetNumber' | 'targetMax' | 'targetDate' | 'targetText'>; problem: string | null } {
  if (direction === 'TEXT') {
    const t = draft.text.trim();
    return { fields: { targetNumber: null, targetMax: null, targetDate: null, targetText: t || null }, problem: t ? null : 'Write the target in words.' };
  }
  const r = readDraft({ ...draft, words: false }, rule);
  const s = r.spec;
  if (!s) return { fields: {}, problem: r.problem ?? 'Give the target.' };
  if (direction === 'DATE') return { fields: { targetDate: s.date ?? null, targetNumber: null, targetMax: null, targetText: null }, problem: null };
  if (direction === 'TARGET_RANGE') return { fields: { targetNumber: s.min ?? null, targetMax: s.max ?? null, targetDate: null, targetText: null }, problem: null };
  return { fields: { targetNumber: s.value ?? null, targetMax: null, targetDate: null, targetText: null }, problem: null };
}

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
  const [draft, setDraft] = useState<TargetDraft>({ ...EMPTY_DRAFT });
  const [unit, setUnit] = useState('');
  const [frequency, setFrequency] = useState('');
  const [weight, setWeight] = useState('');
  const [combine, setCombine] = useState<CombineRule | ''>('');

  useEffect(() => {
    if (!open) return;
    setName(kpi?.name ?? '');
    setDirection(kpi?.direction ?? 'HIGHER_BETTER');
    setDraft(planDraft(kpi));
    setUnit(kpi?.unit ?? '');
    setFrequency(kpi?.frequency ?? '');
    setWeight(kpi?.weightPercent != null ? String(kpi.weightPercent) : '');
    setCombine(kpi?.combine ?? '');
  }, [open, kpi]);

  const dirOptions = directions.length ? directions : DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] }));
  const rule = useMemo(() => planRule(direction, unit.trim() || null), [direction, unit]);
  const target = planTargetFields(direction, draft, rule);
  const badWeight = weight.trim() !== '' && (Number.isNaN(Number(weight)) || Number(weight) < 0 || Number(weight) > 100);
  const changeDirection = (d: Direction) => {
    setDirection(d);
    // Words carry over as words; a number box starts from what was there.
    setDraft((x) => ({ ...x, words: d === 'TEXT' }));
  };

  const submit = () => {
    const body: KpiInput = {
      direction,
      ...target.fields,
      unit: direction === 'TEXT' || direction === 'DATE' ? null : unit.trim() || null,
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
      submitDisabled={(nameEditable && !name.trim()) || Boolean(target.problem) || badWeight}
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        {nameEditable && (
          <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth />
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label="Which way is better" value={direction} onChange={(e) => changeDirection(e.target.value as Direction)} size="small" fullWidth>
            {dirOptions.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
          </TextField>
          {direction !== 'TEXT' && direction !== 'DATE' && (
            <TextField label="Unit" placeholder="%, hours, count, ₹" value={unit} onChange={(e) => setUnit(e.target.value)} size="small" fullWidth />
          )}
        </Stack>
        <KpiTargetInput rule={rule} draft={draft} onChange={setDraft} kpiName={name} label={direction === 'TEXT' ? 'Target, in words' : 'Target'} allowWords={false} helper="" readWords={direction !== 'TEXT'} />
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
        {combineRules.length > 0 && direction !== 'DATE' && (
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
  const [draft, setDraft] = useState<TargetDraft>({ ...EMPTY_DRAFT });
  const [from, setFrom] = useState(todayIso());
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(planDraft(kpi));
    setFrom(todayIso());
    setReason('');
  }, [open, kpi]);

  const direction: Direction = kpi?.direction ?? 'TEXT';
  const rule = useMemo(() => planRule(direction, kpi?.unit ?? null), [direction, kpi?.unit]);
  const target = planTargetFields(direction, draft, rule);

  return (
    <FormDialog
      open={open}
      title={`Change the target of “${kpi?.name ?? ''}”`}
      subtitle="The plan is active, so the change is kept with its date and reason."
      onClose={onClose}
      onSubmit={() => onSubmit({ ...target.fields, effectiveFrom: from, reason: reason.trim() })}
      submitLabel="Change target"
      submitDisabled={!reason.trim() || !from || Boolean(target.problem)}
      enterSubmits={false}
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Now: {kpi?.target || '—'}</Typography>
        <KpiTargetInput rule={rule} draft={draft} onChange={setDraft} kpiName={kpi?.name ?? ''} label={direction === 'TEXT' ? 'New target, in words' : 'New target'} allowWords={false} autoFocus helper="" readWords={direction !== 'TEXT'} />
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
