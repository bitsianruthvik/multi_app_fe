import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  FormControlLabel, MenuItem, Switch, TextField, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { CaptureAt, Formula, Rule, Specification, ValueRule } from '../api/types';
import { ErrorNotice, Mono } from './ui';
import { DialogHeader } from './FormDialog';

const RULE_HELP: Record<ValueRule, string> = {
  entered: 'Typed in on each item.',
  fixed: 'One value set higher up (here or above); items cannot change it.',
  defaulted: 'A value set higher up that items start with and may override.',
  calculated: 'Worked out by a formula from the same item’s other values.',
  rollup: 'Added up from BOM children (each × its BOM quantity). Works once BOMs exist.',
  inherited: 'Taken from the BOM parent, e.g. a web takes its girder’s grade. Works once BOMs exist.',
};
const CAPTURE_HELP: Record<CaptureAt, string> = {
  item: 'One value per item.',
  batch: 'Recorded on each batch when it is received, e.g. heat number.',
  individual: 'Recorded on each physical unit, e.g. measured weight.',
};

/**
 * Adds or edits a spec rule on one subject. A rule's identity — spec, subject,
 * capture level — is fixed once saved; editing changes how the value is
 * obtained. "Switch off" makes a rule that removes an inherited spec here.
 * `forMachines`: a machine keeps its values on itself and has no BOM, so it
 * captures at item level only and never rolls up or inherits.
 */
export function RuleDialog({
  open, onClose, onSaved, subjectType, subjectId, subjectLabel, existing, forMachines = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  subjectType: 'classification' | 'master' | 'machine';
  subjectId: number;
  subjectLabel: string;
  existing?: Rule | null;
  forMachines?: boolean;
}) {
  const [specs, setSpecs] = useState<Specification[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [specId, setSpecId] = useState<number | null>(null);
  const [captureAt, setCaptureAt] = useState<CaptureAt>('item');
  const [valueRule, setValueRule] = useState<ValueRule>('entered');
  const [isRequired, setIsRequired] = useState(false);
  const [switchedOff, setSwitchedOff] = useState(false);
  const [formulaId, setFormulaId] = useState<number | null>(null);
  const [optionIds, setOptionIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    Promise.all([cfApi.get<Specification[]>('/specifications'), cfApi.get<Formula[]>('/formulas')])
      .then(([s, f]) => { setSpecs(s); setFormulas(f); })
      .catch((e) => setError(e));
    setSpecId(existing?.specificationId ?? null);
    setCaptureAt(existing?.captureAt ?? 'item');
    setValueRule(existing?.valueRule ?? 'entered');
    setIsRequired(existing?.isRequired ?? false);
    setSwitchedOff(existing ? !existing.isApplicable : false);
    setFormulaId(existing?.formulaId ?? null);
    setOptionIds(existing?.optionIds ?? []);
  }, [open, existing]);

  const spec = useMemo(() => specs.find((s) => s.id === specId) ?? null, [specs, specId]);
  const needsFormula = valueRule === 'calculated' || valueRule === 'rollup';
  const ruleChoices: ValueRule[] = forMachines ? ['entered', 'fixed', 'defaulted', 'calculated']
    : captureAt === 'item' ? ['entered', 'fixed', 'defaulted', 'calculated', 'rollup', 'inherited'] : ['entered', 'calculated'];
  // A calculated rule takes a formula of plain codes, a roll-up one reading children.X; timing formulas belong to operations.
  // The rule's own formula stays on the list even if it has since been retired,
  // so editing the rule does not quietly blank it.
  const formulaChoices = formulas.filter((f) => (f.status === 'active' && (f.kind ?? 'value') === (valueRule === 'rollup' ? 'rollup' : 'value')) || f.id === formulaId);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      captureAt, valueRule, isRequired: switchedOff ? false : isRequired, isApplicable: !switchedOff,
      formulaId: needsFormula && !switchedOff ? formulaId : null,
      optionIds: spec?.dataType === 'option' && !switchedOff ? optionIds : [],
    };
    try {
      if (existing) await cfApi.put(`/rules/${existing.id}`, body);
      else await cfApi.post('/rules', { ...body, specificationId: specId, subjectType, subjectId });
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>{existing ? `Rule for ${existing.specCode}` : 'Add a specification rule'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13, mb: 2 }}>On {subjectLabel}. More specific levels override this one; it overrides broader levels.</Typography>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Autocomplete
            options={specs.filter((s) => s.status === 'active' || s.id === specId)}
            value={spec}
            disabled={!!existing}
            getOptionLabel={(s) => `${s.name} (${s.code})`}
            renderOption={(props, s) => (
              <li {...props} key={s.id}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', width: '100%' }}>
                  <Box sx={{ flex: 1 }}>{s.name}</Box><Mono muted>{s.code}</Mono><Mono muted>{s.dataType}{s.defaultUom ? ` · ${s.defaultUom}` : ''}</Mono>
                </Box>
              </li>
            )}
            onChange={(_, s) => { setSpecId(s?.id ?? null); setOptionIds([]); }}
            renderInput={(p) => <TextField {...p} label="Specification" required={!existing} autoFocus={!existing} />}
          />
          <TextField select label="Captured at" value={captureAt} disabled={!!existing || forMachines}
            helperText={forMachines ? 'A machine keeps its values on itself.' : CAPTURE_HELP[captureAt]}
            onChange={(e) => { const v = e.target.value as CaptureAt; setCaptureAt(v); if (v !== 'item' && !['entered', 'calculated'].includes(valueRule)) setValueRule('entered'); }}>
            <MenuItem value="item">Item</MenuItem>
            <MenuItem value="batch">Batch</MenuItem>
            <MenuItem value="individual">Individual unit</MenuItem>
          </TextField>
          <FormControlLabel control={<Switch checked={switchedOff} onChange={(e) => setSwitchedOff(e.target.checked)} />}
            label="Switch this specification off here (it does not apply at this level or below)" />
          {!switchedOff && (
            <>
              <TextField select label="How the value is obtained" value={valueRule} helperText={RULE_HELP[valueRule]} onChange={(e) => setValueRule(e.target.value as ValueRule)}>
                {ruleChoices.map((r) => <MenuItem key={r} value={r}>{({ entered: 'Entered', fixed: 'Fixed', defaulted: 'Defaulted', calculated: 'Calculated', rollup: 'Roll-up', inherited: 'Inherited' } as const)[r]}</MenuItem>)}
              </TextField>
              {needsFormula && (
                <TextField select label="Formula" required value={formulaId ?? ''} error={!formulaId} onChange={(e) => setFormulaId(Number(e.target.value) || null)}
                  helperText={formulas.find((f) => f.id === formulaId)?.expression
                    ?? (formulaChoices.length ? 'Pick the formula that works this value out.' : `No ${valueRule === 'rollup' ? 'roll-up' : 'value'} formula exists yet — add one under Setup › Formulas.`)}>
                  {formulaChoices.map((f) => <MenuItem key={f.id} value={f.id}>{f.name} ({f.code})</MenuItem>)}
                </TextField>
              )}
              {spec?.dataType === 'option' && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.5 }}>Allowed options here</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>Leave all unticked to allow every option of {spec.code}.</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {(spec.options ?? []).filter((o) => o.status !== 'inactive').map((o) => (
                      <FormControlLabel key={o.id} label={o.label || o.value}
                        control={<Checkbox size="small" checked={optionIds.includes(o.id)} onChange={(e) => setOptionIds((ids) => e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id))} />} />
                    ))}
                  </Box>
                </Box>
              )}
              <FormControlLabel control={<Checkbox checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />} label={forMachines ? 'Required — shown as missing on the machine until set' : 'Required before an item can be activated'} />
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !specId || (needsFormula && !switchedOff && !formulaId)} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Saving…' : existing ? 'Save rule' : 'Add rule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
