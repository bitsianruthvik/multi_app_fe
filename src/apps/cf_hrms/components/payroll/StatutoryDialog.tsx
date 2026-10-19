/**
 * Add or change one dated row of statutory settings (spec §25.2): PF, ESI,
 * professional tax or labour welfare fund. Typed fields per kind, a slab editor
 * for professional tax, and the source — every value says where it comes from.
 *
 * A row a locked run used keeps its values (the server refuses): the dialog
 * still lets the source and "verified" change; for new values add a new row
 * from the day the change applies.
 */
import { useState } from 'react';
import {
  Box, Button, Checkbox, Chip, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { FormDialog } from '@shared/ui';
import { payrollApi, type StatutoryInput, type StatutoryKind, type StatutoryRow } from '../../api/payroll';
import { STATUTORY_KIND_WORD } from './payWords';

interface Field { key: string; label: string; unit: '%' | '₹' }

const STATUTORY_FIELDS: Record<StatutoryKind, Field[]> = {
  PF: [
    { key: 'employeeRate', label: 'Employee', unit: '%' },
    { key: 'employerRate', label: 'Employer', unit: '%' },
    { key: 'epsRate', label: 'Of which pension (EPS)', unit: '%' },
    { key: 'wageCeiling', label: 'Wage ceiling a month', unit: '₹' },
    { key: 'edliRate', label: 'EDLI', unit: '%' },
    { key: 'adminRate', label: 'Admin charges', unit: '%' },
    { key: 'adminMinimum', label: 'Admin charges, at least a month', unit: '₹' },
    { key: 'edliAdminRate', label: 'EDLI admin', unit: '%' },
  ],
  ESI: [
    { key: 'employeeRate', label: 'Employee', unit: '%' },
    { key: 'employerRate', label: 'Employer', unit: '%' },
    { key: 'wageCeiling', label: 'Covered up to (a month)', unit: '₹' },
    { key: 'wageCeilingDisabled', label: 'Covered up to, with a disability', unit: '₹' },
    { key: 'exemptDailyWage', label: 'Employee share exempt up to a day', unit: '₹' },
  ],
  PT: [{ key: 'yearlyMaximum', label: 'At most a year', unit: '₹' }],
  LWF: [
    { key: 'employee', label: 'Employee', unit: '₹' },
    { key: 'employer', label: 'Employer', unit: '₹' },
  ],
};
const REQUIRED: Record<StatutoryKind, string[]> = {
  PF: ['employeeRate', 'employerRate', 'epsRate', 'wageCeiling', 'edliRate', 'adminRate'],
  ESI: ['employeeRate', 'employerRate', 'wageCeiling'],
  PT: [],
  LWF: ['employee', 'employer'],
};
const DEFAULT_ROUNDING: Record<StatutoryKind, string> = { PF: 'NEAREST', ESI: 'UP', PT: '', LWF: '' };
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Draft {
  kind: StatutoryKind;
  stateCode: string;
  effectiveFrom: string;
  values: Record<string, string>;
  rounding: string;
  slabs: { upTo: string; amount: string }[];
  months: number[];
  source: string;
  sourceUrl: string;
  verified: boolean;
  note: string;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function draftOf(row: StatutoryRow | null, kind: StatutoryKind, stateCode: string): Draft {
  const s = row?.settings ?? {};
  const k = row?.kind ?? kind;
  return {
    kind: k,
    stateCode: row?.stateCode ?? (k === 'PF' || k === 'ESI' ? 'IN' : stateCode),
    effectiveFrom: row?.effectiveFrom ?? '',
    values: Object.fromEntries(STATUTORY_FIELDS[k].map((f) => [f.key, str(s[f.key])])),
    rounding: str(s.rounding) || DEFAULT_ROUNDING[k],
    slabs: Array.isArray(s.slabs) ? (s.slabs as { upTo: unknown; amount: unknown }[]).map((x) => ({ upTo: str(x.upTo), amount: str(x.amount) })) : [{ upTo: '', amount: '' }],
    months: Array.isArray(s.months) ? (s.months as unknown[]).map(Number) : [12],
    source: row?.source ?? '',
    sourceUrl: row?.sourceUrl ?? '',
    verified: row?.verification === 'VERIFIED',
    note: row?.note ?? '',
  };
}

function settingsOf(d: Draft, original: Record<string, unknown>): Record<string, unknown> {
  // Keys this form does not edit (ESI's contribution periods, PT's basis …) are kept as they were.
  const out: Record<string, unknown> = { ...original };
  for (const f of STATUTORY_FIELDS[d.kind]) {
    const v = d.values[f.key]?.trim();
    if (v === '' || v === undefined) delete out[f.key];
    else out[f.key] = Number(v);
  }
  if (d.rounding) out.rounding = d.rounding; else delete out.rounding;
  if (d.kind === 'ESI' && !Array.isArray(out.periods)) out.periods = [{ from: '04-01', to: '09-30' }, { from: '10-01', to: '03-31' }];
  if (d.kind === 'PT') {
    out.slabs = d.slabs.map((x) => ({ upTo: x.upTo.trim() === '' ? null : Number(x.upTo), amount: Number(x.amount || 0) }));
    if (!out.basis) out.basis = 'GROSS';
  }
  if (d.kind === 'LWF') out.months = [...d.months].sort((a, b) => a - b);
  return out;
}

export function StatutoryDialog({
  open, row, kind, stateCode, states, onClose, onSaved,
}: {
  open: boolean;
  /** null: a new row. */
  row: StatutoryRow | null;
  kind: StatutoryKind;
  /** The company's state: where a new PT or LWF row goes by default. */
  stateCode: string;
  states: { code: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return <Body row={row} kind={kind} stateCode={stateCode} states={states} onClose={onClose} onSaved={onSaved} />;
}

function Body({ row, kind, stateCode, states, onClose, onSaved }: {
  row: StatutoryRow | null; kind: StatutoryKind; stateCode: string; states: { code: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(row, kind, stateCode));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const national = d.kind === 'PF' || d.kind === 'ESI';
  const missing = REQUIRED[d.kind].some((k) => !d.values[k]?.trim()) || !d.effectiveFrom || !d.source.trim()
    || (d.kind === 'PT' && d.slabs.filter((s) => s.upTo.trim() === '').length !== 1)
    || (d.kind === 'LWF' && !d.months.length);

  const save = async () => {
    const body: StatutoryInput = {
      kind: d.kind, stateCode: national ? 'IN' : d.stateCode, effectiveFrom: d.effectiveFrom,
      settings: settingsOf(d, row?.settings ?? {}), source: d.source.trim(), sourceUrl: d.sourceUrl.trim() || null,
      verification: d.verified ? 'VERIFIED' : 'UNVERIFIED', note: d.note.trim() || null,
    };
    if (row) await payrollApi.updateStatutory(row.id, body);
    else await payrollApi.createStatutory(body);
    onSaved();
  };

  return (
    <FormDialog
      open
      title={row ? `Change ${STATUTORY_KIND_WORD[d.kind]}` : `New ${STATUTORY_KIND_WORD[d.kind]} settings`}
      subtitle={row ? 'Values a locked run used cannot change — add a new row from the day the change applies.' : 'A dated row: it applies from its day until the next row of the same kind and state.'}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={missing}
      maxWidth="sm"
      enterSubmits={false}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        <TextField select size="small" label="Kind" value={d.kind} disabled={!!row}
          onChange={(e) => setD(draftOf(null, e.target.value as StatutoryKind, stateCode))}>
          {(['PF', 'ESI', 'PT', 'LWF'] as StatutoryKind[]).map((k) => <MenuItem key={k} value={k}>{STATUTORY_KIND_WORD[k]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="State" value={national ? 'IN' : d.stateCode} disabled={national} onChange={(e) => set({ stateCode: e.target.value })}
          helperText={national ? 'The same everywhere.' : undefined}>
          {states.filter((s) => (national ? s.code === 'IN' : s.code !== 'IN')).map((s) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
          {!national && !states.some((s) => s.code === d.stateCode) && <MenuItem value={d.stateCode}>{d.stateCode}</MenuItem>}
        </TextField>
        <TextField size="small" type="date" label="From" required value={d.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {STATUTORY_FIELDS[d.kind].map((f) => (
          <TextField
            key={f.key} size="small" type="number" label={`${f.label} (${f.unit})`} value={d.values[f.key] ?? ''}
            required={REQUIRED[d.kind].includes(f.key)}
            onChange={(e) => set({ values: { ...d.values, [f.key]: e.target.value } })}
            inputProps={{ min: 0, step: 'any', 'data-field': f.key }}
          />
        ))}
        {(d.kind === 'PF' || d.kind === 'ESI') && (
          <TextField select size="small" label="Rounding" value={d.rounding} onChange={(e) => set({ rounding: e.target.value })}>
            <MenuItem value="NEAREST">To the nearest rupee</MenuItem>
            <MenuItem value="UP">Up to the next rupee</MenuItem>
            <MenuItem value="DOWN">Down to the rupee</MenuItem>
          </TextField>
        )}
      </Box>

      {d.kind === 'PT' && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Slabs — on the month’s gross</Typography>
          <Stack spacing={1}>
            {d.slabs.map((s, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField size="small" type="number" label="Gross up to (₹)" value={s.upTo} placeholder="Empty: above the rest"
                  onChange={(e) => set({ slabs: d.slabs.map((x, j) => (j === i ? { ...x, upTo: e.target.value } : x)) })}
                  slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
                <TextField size="small" type="number" label="Tax a month (₹)" value={s.amount}
                  onChange={(e) => set({ slabs: d.slabs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} sx={{ flex: 1 }} />
                <Tooltip title="Remove this slab">
                  <span>
                    <IconButton size="small" aria-label="Remove this slab" disabled={d.slabs.length < 2}
                      onClick={() => set({ slabs: d.slabs.filter((_, j) => j !== i) })}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ))}
          </Stack>
          <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} onClick={() => set({ slabs: [...d.slabs, { upTo: '', amount: '' }] })}>Add a slab</Button>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Exactly one slab has no upper limit — the top one.</Typography>
        </Box>
      )}

      {d.kind === 'LWF' && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Deducted in</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {MONTH_SHORT.map((m, i) => {
              const on = d.months.includes(i + 1);
              return (
                <Chip key={m} label={m} size="small" color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                  onClick={() => set({ months: on ? d.months.filter((x) => x !== i + 1) : [...d.months, i + 1] })} />
              );
            })}
          </Box>
        </Box>
      )}

      <TextField size="small" label="Source" required multiline minRows={2} value={d.source} onChange={(e) => set({ source: e.target.value })}
        helperText="Where these values come from: the act, the notification, the page." inputProps={{ maxLength: 4000 }} />
      <TextField size="small" label="Link to the source (optional)" value={d.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} inputProps={{ maxLength: 500 }} />
      <TextField size="small" label="Note (optional)" multiline minRows={1} value={d.note} onChange={(e) => set({ note: e.target.value })} inputProps={{ maxLength: 500 }} />
      <FormControlLabel
        control={<Checkbox size="small" checked={d.verified} onChange={(e) => set({ verified: e.target.checked })} />}
        label="Verified — checked on an official page (or by the company’s CA)"
      />
    </FormDialog>
  );
}
