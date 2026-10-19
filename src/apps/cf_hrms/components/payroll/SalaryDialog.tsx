/**
 * Revise a salary (POST /payroll/salaries) or correct one no locked run paid on
 * (PUT /payroll/salaries/:id) — spec §25.2. CTC, structure, the day it starts,
 * PF, the reason, and optional fixed amounts for single lines; under them the
 * LIVE PREVIEW of the breakdown, worked out by the server with the ceilings in
 * force on that day.
 */
import { useMemo, useState } from 'react';
import { Box, Collapse, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import { payrollApi, type PayStructure, type PfMode, type SalaryRow } from '../../api/payroll';
import { BreakdownTable, ProblemList } from './PayParts';
import { usePreview } from './usePreview';
import { PF_MODE_WORD, parseAmount, rupees } from './payWords';
import { todayIso } from '../jobDates';

export function SalaryDialog({
  open, mode, employee, row, structures, onClose, onSaved,
}: {
  open: boolean;
  /** revise = a new row (POST); correct = change `row` (PUT). */
  mode: 'revise' | 'correct';
  employee: { id: number; name: string };
  /** The row to correct, or the current one a revision starts from. */
  row: SalaryRow | null;
  structures: PayStructure[];
  onClose: () => void;
  /** `note`: the server's arrears message after a back-dated revision. */
  onSaved: (note: string | null) => void;
}) {
  if (!open) return null;
  return <Body mode={mode} employee={employee} row={row} structures={structures} onClose={onClose} onSaved={onSaved} />;
}

function Body({ mode, employee, row, structures, onClose, onSaved }: {
  mode: 'revise' | 'correct'; employee: { id: number; name: string }; row: SalaryRow | null; structures: PayStructure[];
  onClose: () => void; onSaved: (note: string | null) => void;
}) {
  const [ctc, setCtc] = useState(row ? String(row.annualCtc) : '');
  const [structureId, setStructureId] = useState<string>(row ? String(row.structureId) : String(structures.find((s) => s.status === 'ACTIVE')?.id ?? ''));
  const [from, setFrom] = useState(mode === 'correct' && row ? row.effectiveFrom : '');
  const [pfMode, setPfMode] = useState<PfMode>(row?.pfMode ?? 'CEILING');
  const [reason, setReason] = useState(mode === 'correct' ? row?.reason ?? '' : '');
  const [overrides, setOverrides] = useState<Record<number, string>>(() => Object.fromEntries((row?.overrides ?? []).map((o) => [o.componentId, String(o.amount)])));
  const [showOverrides, setShowOverrides] = useState((row?.overrides ?? []).length > 0);

  const structure = structures.find((s) => String(s.id) === structureId) ?? null;
  const ctcNum = parseAmount(ctc);
  const ctcOk = ctcNum != null && Number.isFinite(ctcNum) && ctcNum >= 0;
  const overrideList = useMemo(() => (structure?.lines ?? [])
    .map((l) => ({ componentId: l.componentId, raw: overrides[l.componentId] ?? '' }))
    .filter((o) => o.raw.trim() !== ''), [structure, overrides]);
  const overridesOk = overrideList.every((o) => { const n = parseAmount(o.raw); return n != null && Number.isFinite(n) && n >= 0; });

  const input = structure && ctcOk && overridesOk ? {
    lines: structure.lines.map((l) => ({ componentId: l.componentId, formula: l.formula })),
    annualCtc: ctcNum as number,
    overrides: Object.fromEntries(overrideList.map((o) => [String(o.componentId), parseAmount(o.raw) as number])),
    pfMode,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(from) ? { on: from } : {}),
  } : null;
  const { result: preview, busy } = usePreview(input);

  const back = from && from < todayIso();
  const submit = async () => {
    const body = {
      annualCtc: ctcNum as number, structureId: Number(structureId), effectiveFrom: from, pfMode, reason: reason.trim() || null,
      overrides: overrideList.map((o) => ({ componentId: o.componentId, amount: parseAmount(o.raw) as number })),
    };
    if (mode === 'correct' && row) {
      await payrollApi.updateSalary(row.id, body);
      onSaved(null);
    } else {
      const r = await payrollApi.createSalary({ ...body, employeeId: employee.id });
      onSaved(r.note);
    }
  };

  return (
    <FormDialog
      open
      title={mode === 'correct' ? 'Correct this salary' : row ? 'Revise salary' : 'Add a salary'}
      subtitle={mode === 'correct'
        ? `${employee.name}. A correction changes this row as if it had always been so.`
        : `${employee.name}. ${row ? `The salary from ${row.effectiveFrom} ends the day before the new one starts.` : 'Their first salary here.'}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={mode === 'correct' ? 'Save correction' : 'Save salary'}
      submitDisabled={!ctcOk || !structure || !from || !overridesOk}
      maxWidth="md"
      enterSubmits={false}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <TextField size="small" label="CTC a year (₹)" required value={ctc} onChange={(e) => setCtc(e.target.value)}
          error={ctc.trim() !== '' && !ctcOk}
          helperText={ctcOk ? `${rupees(ctcNum)} a year · ${rupees(Math.round((ctcNum as number) / 12 * 100) / 100)} a month` : 'The yearly cost to company, in rupees.'}
          inputProps={{ inputMode: 'decimal', 'data-field': 'annual-ctc' }} />
        <TextField select size="small" label="Structure" required value={structureId} onChange={(e) => setStructureId(e.target.value)}>
          {structures.filter((s) => s.status === 'ACTIVE' || String(s.id) === structureId).map((s) => (
            <MenuItem key={s.id} value={String(s.id)}>{s.name}{s.status !== 'ACTIVE' ? ' (inactive)' : ''}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label="Effective from" required value={from} onChange={(e) => setFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={back && mode === 'revise' ? 'A past day: the next payroll run pays the arrears for months already paid.' : 'The day this salary starts.'} />
        <TextField select size="small" label="PF" value={pfMode} onChange={(e) => setPfMode(e.target.value as PfMode)}>
          {(['CEILING', 'FULL', 'NONE'] as PfMode[]).map((m) => <MenuItem key={m} value={m}>{PF_MODE_WORD[m]}</MenuItem>)}
        </TextField>
      </Box>
      <TextField size="small" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual revision, promotion, joining …" inputProps={{ maxLength: 500 }} />

      {structure && (
        <Box>
          <Button size="small" onClick={() => setShowOverrides((v) => !v)} sx={{ ml: -0.75 }}>
            {showOverrides ? 'Hide fixed amounts' : `Fix the amount of a line for this person${overrideList.length ? ` (${overrideList.length})` : ''}`}
          </Button>
          <Collapse in={showOverrides}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
              A fixed amount a month replaces the line’s formula for this person; the balance line takes up the difference.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.25 }}>
              {structure.lines.map((l) => {
                const raw = overrides[l.componentId] ?? '';
                const n = parseAmount(raw);
                return (
                  <TextField key={l.componentId} size="small" label={`${l.name} a month (₹)`} value={raw} placeholder={l.formula}
                    error={raw.trim() !== '' && !(n != null && Number.isFinite(n) && n >= 0)}
                    onChange={(e) => setOverrides({ ...overrides, [l.componentId]: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }} inputProps={{ inputMode: 'decimal' }} />
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>
          Breakdown {busy ? '— working it out…' : ''}
        </Typography>
        {!input && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Type the CTC and choose the structure to see the breakdown.</Typography>}
        {input && preview && (
          <Stack spacing={1.25}>
            <ProblemList problems={preview.problems} warnings={preview.warnings} />
            {preview.ok && <BreakdownTable lines={preview.lines} totals={preview.totals} monthlyCtc={preview.monthlyCtc} annualCtc={preview.annualCtc} />}
          </Stack>
        )}
      </Box>
    </FormDialog>
  );
}
