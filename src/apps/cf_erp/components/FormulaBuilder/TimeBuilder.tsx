import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabsActions } from '@mui/material';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Drawer, FormControlLabel, IconButton, InputAdornment, MenuItem, Radio, RadioGroup,
  Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { cfApi, CfApiError } from '../../api/client';
import type { Formula, TimeView } from '../../api/types';
import { getBuilderContext, type BuilderCheck } from '../../api/formulaBuilder';
import { useLoad } from '../../hooks/useLoad';
import {
  buildRateExpression, fieldFor, fieldIndex, numberText, parseRateExpression, rateUnitsFor, suggestCode, suggestName, TEMPLATES, unitText,
  type BuilderField, type RateModel, type TemplateResult,
} from '../../lib/formulaBuilder';
import { ErrorNotice } from '../ui';
import { FormulaEditor } from './FormulaEditor';
import { PreviewPanel } from './PreviewPanel';

export type TimeMode = 'fixed' | 'rate' | 'advanced';
/** What the builder hands back: minutes, or a formula — and, from the rate form, the rule's setup minutes. */
export interface TimeAssignment { minutes: number | null; formulaId: number | null; setupMinutes?: number | null; formula?: Formula | null }

const EMPTY_RATE: RateModel = { field: '', rate: '', rateUnit: '', multiplier: null, constant: '' };

/** A field in a picker: its name, unit and a real example. */
function FieldOption({ f }: { f: BuilderField }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', width: '100%' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontWeight: 500 }}>{f.name}</Box>
        <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-3)' }}>item.{f.code}</Box>
      </Box>
      <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{f.unit ? unitText(f.unit) : 'count'}</Box>
      <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)', minWidth: 64, textAlign: 'right' }} title={f.exampleFrom ? `on ${f.exampleFrom}` : undefined}>
        {f.example != null ? `e.g. ${numberText(f.example)}` : '—'}
      </Box>
    </Box>
  );
}

function FieldPicker({ label, fields, value, onChange, helperText, testId }: {
  label: string; fields: BuilderField[]; value: string | null; onChange: (code: string | null) => void; helperText?: string; testId: string;
}) {
  const nums = fields.filter((f) => f.dataType === 'number');
  const chosen = nums.find((f) => f.code === value) ?? (value ? { code: value, name: value, dataType: 'number', measurementType: null, unit: null } as BuilderField : null);
  return (
    <Autocomplete size="small" options={nums} value={chosen} onChange={(_, f) => onChange(f?.code ?? null)}
      getOptionLabel={(f) => `${f.name} (${f.code})`} isOptionEqualToValue={(a, b) => a.code === b.code}
      filterOptions={(opts, s) => { const q = s.inputValue.trim().toLowerCase(); return q ? opts.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)) : opts; }}
      renderOption={({ key, ...props }, f) => <Box component="li" key={key} {...props}><FieldOption f={f} /></Box>}
      noOptionsText="No field matches"
      renderInput={(p) => <TextField {...p} label={label} helperText={helperText} inputProps={{ ...p.inputProps, 'data-testid': testId }} />} />
  );
}

/**
 * The TIME BUILDER: sets one time of an operation's timing rule — fixed
 * minutes, rate × quantity (the workbook's usual shape), or an advanced
 * formula — with templates, a live preview on real pieces and machines, and
 * saving that creates / versions the formula AND assigns it in one action.
 */
export function TimeBuilder({ open, onClose, operation, subject, which, current, ruleSetup = null, ruleUsesCurrent = true, formulas, canMakeFormula, onAssign, onFormulasChanged }: {
  open: boolean;
  onClose: () => void;
  operation: { id: number; code: string; name: string };
  /** Who the rule is for — the preview's machines come from it. */
  subject: { type: 'classification' | 'machine'; id: number; label?: string | null } | null;
  which: 'setup' | 'work';
  current: TimeView | null;
  /** The rule's setup, when building the work time: the rate form can set it too. */
  ruleSetup?: TimeView | null;
  /** false while the rule is not saved yet (Add rule): its formula is not "used" by it. */
  ruleUsesCurrent?: boolean;
  formulas: Formula[];
  canMakeFormula: boolean;
  onAssign: (a: TimeAssignment) => Promise<void> | void;
  onFormulasChanged?: () => void;
}) {
  const ctx = useLoad(() => (open ? getBuilderContext(operation.id, subject) : Promise.resolve(null)), [open, operation.id, subject?.type, subject?.id]);
  const itemFields = useMemo(() => ctx.data?.itemFields ?? [], [ctx.data]);
  const machineFields = useMemo(() => ctx.data?.machineFields ?? [], [ctx.data]);
  const idx = useMemo(() => fieldIndex(itemFields, machineFields), [itemFields, machineFields]);
  const timing = formulas.filter((f) => f.status === 'active' && f.kind === 'timing');

  const [tab, setTab] = useState<TimeMode>('rate');
  const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState<RateModel>(EMPTY_RATE);
  const [setupMin, setSetupMin] = useState('');
  const [expression, setExpression] = useState('');
  const [base, setBase] = useState<Formula | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [share, setShare] = useState<'all' | 'new'>('new');
  const [check, setCheck] = useState<BuilderCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [inited, setInited] = useState(false);
  // The tab underline is measured while the drawer is still sliding in; measure again once it is in.
  const tabsActions = useRef<TabsActions | null>(null);

  // Start from what the rule holds: minutes → Fixed; a rate-shaped formula → Rate; anything else → Advanced.
  useEffect(() => {
    if (!open) { setInited(false); return; }
    // Wait for the fields: a rate formula is only recognised once its field's unit is known.
    if (inited || (ctx.loading || (!ctx.data && !ctx.error))) return;
    setError(null);
    setShare('new');
    setSetupMin(ruleSetup?.minutes != null ? String(ruleSetup.minutes) : '');
    const f = current?.formula ? formulas.find((x) => x.id === current.formula?.id) ?? null : null;
    setBase(f);
    const expr = current?.formula?.expression ?? '';
    setExpression(expr);
    setMinutes(current?.minutes != null ? String(current.minutes) : '');
    const parsedRate = expr ? parseRateExpression(expr, (c) => fieldFor(idx, 'item', c)) : null;
    setRate(parsedRate ?? EMPTY_RATE);
    setTab(current?.minutes != null ? 'fixed' : expr ? (parsedRate ? 'rate' : 'advanced') : which === 'setup' ? 'fixed' : 'rate');
    setCode(suggestCode(operation.code, which, formulas.map((x) => x.code)));
    setName(suggestName(operation.name, which, subject?.label ?? null));
    setInited(true);
  }, [open, inited, ctx.loading, ctx.data, ctx.error, current, formulas, idx, operation.code, operation.name, which, subject?.label, ruleSetup?.minutes]);

  const rateField = rate.field ? fieldFor(idx, 'item', rate.field) : null;
  const units = rateUnitsFor(rateField);
  const rateUnit = units.find((u) => u.unit === rate.rateUnit) ?? units[0];
  const rateExpr = buildRateExpression({ ...rate, rateUnit: rateUnit.unit }, rateField);
  const expr = tab === 'rate' ? rateExpr : tab === 'advanced' ? expression.trim() || null : null;

  const applyTemplate = (r: TemplateResult) => {
    if (r.mode === 'rate') {
      const f = fieldFor(idx, 'item', r.model.field);
      const u = rateUnitsFor(f).find((x) => x.unit === r.model.rateUnit) ?? rateUnitsFor(f)[0];
      setRate({ ...r.model, rateUnit: u.unit });
      setTab('rate');
    } else {
      setExpression(r.expression);
      setTab('advanced');
    }
  };
  const switchTab = (t: TimeMode) => {
    // Rate → Advanced carries the built formula across, to refine it.
    if (t === 'advanced' && tab === 'rate' && rateExpr) setExpression(rateExpr);
    if (t === 'rate' && tab === 'advanced' && expression.trim()) {
      const back = parseRateExpression(expression, (c) => fieldFor(idx, 'item', c));
      if (back) setRate(back);
    }
    setTab(t);
  };
  const startFrom = (f: Formula | null) => {
    setBase(f);
    if (!f) return;
    setExpression(f.expression);
    const back = parseRateExpression(f.expression, (c) => fieldFor(idx, 'item', c));
    if (back) { setRate(back); setTab('rate'); } else setTab('advanced');
  };

  // What saving will do with the formula.
  const baseIsCurrent = !!base && ruleUsesCurrent && current?.formula?.id === base.id;
  const uses = base ? (base.timingRuleCount ?? 0) + (base.ruleCount ?? 0) : 0;
  const others = base ? uses - (baseIsCurrent ? 1 : 0) : 0;
  const changed = !!base && !!expr && expr !== base.expression.trim();
  const same = !base && expr ? timing.find((f) => f.expression.trim() === expr) ?? null : null;
  type Plan = 'minutes' | 'assign' | 'update' | 'create' | 'reuse' | 'none';
  const plan: Plan = tab === 'fixed' ? 'minutes'
    : !expr ? 'none'
      : base && !changed ? 'assign'
        : base && changed ? (others > 0 ? (share === 'all' ? 'update' : 'create') : 'update')
          : same ? 'reuse' : 'create';
  const needsSetupPerm = plan === 'update' || plan === 'create';
  const problems = check?.problems ?? [];
  const blocked = (tab !== 'fixed' && !!check && problems.length > 0) || (needsSetupPerm && !canMakeFormula) || plan === 'none'
    || (plan === 'create' && (!code.trim() || !name.trim()))
    || (tab === 'fixed' && which === 'work' && minutes.trim() === '')
    || (tab === 'fixed' && minutes.trim() !== '' && !(Number(minutes) >= 0));
  const setupFromRate = which === 'work' && tab === 'rate' && ruleSetup?.formula == null;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const extra = setupFromRate ? { setupMinutes: setupMin.trim() === '' ? null : Number(setupMin) } : {};
      if (plan === 'minutes') {
        await onAssign({ minutes: minutes.trim() === '' ? null : Number(minutes), formulaId: null });
      } else if (plan === 'assign' && base) {
        await onAssign({ minutes: null, formulaId: base.id, formula: base, ...extra });
      } else if (plan === 'reuse' && same) {
        await onAssign({ minutes: null, formulaId: same.id, formula: same, ...extra });
      } else if (plan === 'update' && base && expr) {
        const saved = await cfApi.put<Formula>(`/formulas/${base.id}`, { expression: expr });
        onFormulasChanged?.();
        await onAssign({ minutes: null, formulaId: saved.id, formula: saved, ...extra });
      } else if (plan === 'create' && expr) {
        const description = tab === 'rate' && rateField ? `${rateField.name} × ${rate.rate} ${rateUnit.label}${rate.multiplier ? ` × ${rate.multiplier}` : ''}${rate.constant ? ` + ${rate.constant} min` : ''} — built on ${operation.code}` : `Built on ${operation.code}`;
        const saved = await cfApi.post<Formula>('/formulas', { code: code.trim(), name: name.trim(), expression: expr, description });
        onFormulasChanged?.();
        await onAssign({ minutes: null, formulaId: saved.id, formula: saved, ...extra });
      }
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    }
  };

  const saveLabel = plan === 'update' ? `Save v${(base?.version ?? 0) + 1} and assign` : plan === 'create' ? 'Create formula and assign' : 'Save and assign';
  const whichText = which === 'setup' ? 'Setup, per run' : 'Work, per piece';

  return (
    <Drawer anchor="right" open={open} onClose={() => !busy && onClose()} PaperProps={{ sx: { width: { xs: '100vw', md: 'min(1120px, 96vw)' }, maxWidth: '100vw' } }}
      SlideProps={{ onEntered: () => tabsActions.current?.updateIndicator() }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-testid="time-builder">
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid var(--c-divider)' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{operation.code} · {operation.name}{subject?.label ? ` · ${subject.label}` : ''}</Typography>
            <Typography component="h2" sx={{ fontSize: 20, fontWeight: 600 }}>{whichText}</Typography>
          </Box>
          <Tooltip title="Close without saving"><IconButton aria-label="Close without saving" onClick={onClose} disabled={busy}><CloseRounded /></IconButton></Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.5fr) minmax(320px, 1fr)' }, alignItems: 'start' }}>
          <Box sx={{ p: 3, display: 'grid', gap: 2, minWidth: 0 }}>
            <ErrorNotice error={ctx.error} />
            <Tabs value={tab} action={tabsActions} onChange={(_, t) => switchTab(t)} aria-label="How the time is worked out">
              <Tab value="fixed" label="Fixed minutes" data-testid="tab-fixed" />
              <Tab value="rate" label="Rate × quantity" data-testid="tab-rate" />
              <Tab value="advanced" label="Advanced formula" data-testid="tab-advanced" />
            </Tabs>

            {tab !== 'fixed' && (
              <Box>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}><AutoAwesomeRounded sx={{ fontSize: 14 }} /> Start from a shape — prefilled, then change anything</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {TEMPLATES.map((t) => (
                    <Tooltip key={t.id} title={t.hint}>
                      <Chip label={t.label} variant="outlined" onClick={() => applyTemplate(t.build(itemFields, machineFields))} data-testid={`template-${t.id}`} sx={{ borderRadius: 'var(--r-sm)' }} />
                    </Tooltip>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 'fixed' && (
              <Box sx={{ display: 'grid', gap: 1.5, maxWidth: 360 }}>
                <TextField label={which === 'setup' ? 'Minutes per run' : 'Minutes per piece'} type="number" value={minutes} autoFocus
                  onChange={(e) => setMinutes(e.target.value)} inputProps={{ min: 0, step: 'any', 'data-testid': 'fixed-minutes' }}
                  InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                  helperText={which === 'setup' ? 'Once per batch of pieces; leave empty for none' : 'The same for every piece, whatever its size'} />
              </Box>
            )}

            {tab === 'rate' && (
              <Box sx={{ display: 'grid', gap: 2 }}>
                <FieldPicker label="Quantity on the piece" fields={itemFields} value={rate.field || null} testId="rate-field"
                  onChange={(c) => { const f = c ? fieldFor(idx, 'item', c) : null; setRate((r) => ({ ...r, field: c ?? '', rateUnit: rateUnitsFor(f)[0].unit })); }}
                  helperText="What the time grows with — weld length, holes, surface area, weight…" />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField label="Rate" type="number" value={rate.rate} onChange={(e) => setRate((r) => ({ ...r, rate: e.target.value }))}
                    inputProps={{ min: 0, step: 'any', 'data-testid': 'rate-value' }} />
                  <TextField select label="Unit" value={rateUnit.unit} onChange={(e) => setRate((r) => ({ ...r, rateUnit: e.target.value }))} inputProps={{ 'data-testid': 'rate-unit' }}>
                    {units.map((u) => <MenuItem key={u.unit} value={u.unit}>{u.label}</MenuItem>)}
                  </TextField>
                </Box>
                {rateField?.unit && Math.abs(rateUnit.factor - 1) > 1e-12 && (
                  <Typography sx={{ fontSize: 13, color: 'var(--c-info-800)' }} data-testid="rate-conversion">
                    {rateField.name} is in {unitText(rateField.unit)} — converted to {unitText(rateUnit.unit)} ({rateUnit.factor < 1 ? `÷ ${numberText(1 / rateUnit.factor)}` : `× ${numberText(rateUnit.factor)}`}) for you.
                  </Typography>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <FieldPicker label="× another field (optional)" fields={itemFields} value={rate.multiplier} testId="rate-multiplier"
                    onChange={(c) => setRate((r) => ({ ...r, multiplier: c }))} helperText="e.g. number of coats" />
                  <TextField label="+ per piece (optional)" type="number" value={rate.constant} onChange={(e) => setRate((r) => ({ ...r, constant: e.target.value }))}
                    inputProps={{ step: 'any', 'data-testid': 'rate-constant' }} InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                    helperText="Added once for every piece, e.g. 15 min manual blasting" />
                </Box>
                {setupFromRate && (
                  <TextField label="Setup per run (optional)" type="number" value={setupMin} onChange={(e) => setSetupMin(e.target.value)} sx={{ maxWidth: 280 }}
                    inputProps={{ min: 0, step: 'any', 'data-testid': 'rate-setup' }} InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                    helperText="Once per batch — saved as the rule's setup" />
                )}
                <Box sx={{ p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', fontFamily: 'var(--font-mono)', fontSize: 14 }} data-testid="rate-expression">
                  {rateExpr ?? <Box component="span" sx={{ color: 'var(--c-text-3)', fontFamily: 'var(--font-sans)' }}>Pick a field and type a rate.</Box>}
                </Box>
              </Box>
            )}

            {tab === 'advanced' && (
              <Box sx={{ display: 'grid', gap: 2 }}>
                <TextField select size="small" label="Start from an existing formula (optional)" value={base?.id ?? ''} onChange={(e) => startFrom(timing.find((f) => f.id === Number(e.target.value)) ?? null)}
                  inputProps={{ 'data-testid': 'existing-formula' }}>
                  <MenuItem value="">— a new one —</MenuItem>
                  {timing.map((f) => <MenuItem key={f.id} value={f.id}>{f.name} <Box component="span" sx={{ ml: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-3)' }}>{f.code}</Box></MenuItem>)}
                </TextField>
                <FormulaEditor value={expression} onChange={setExpression} idx={idx} itemFields={itemFields} machineFields={machineFields} label="Minutes =" />
              </Box>
            )}

            {tab !== 'fixed' && (
              <Box sx={{ display: 'grid', gap: 1.5, pt: 1, borderTop: '1px solid var(--c-divider)' }}>
                {base && changed && others > 0 && (
                  <Alert severity="warning" sx={{ borderRadius: 'var(--r-sm)' }} data-testid="shared-warning">
                    <Box sx={{ fontWeight: 500 }}>{base.code} is used by {uses} rule{uses === 1 ? '' : 's'} — change it for all, or save a new formula for this rule.</Box>
                    <RadioGroup value={share} onChange={(e) => setShare(e.target.value as 'all' | 'new')}>
                      <FormControlLabel value="all" control={<Radio size="small" />} label={`Change it for all ${uses} (version ${base.version + 1})`} data-testid="share-all" />
                      <FormControlLabel value="new" control={<Radio size="small" />} label="Save as a new formula for this rule only" data-testid="share-new" />
                    </RadioGroup>
                  </Alert>
                )}
                {plan === 'create' && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1.4fr)' }, gap: 2 }}>
                    <TextField size="small" label="Formula code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                      inputProps={{ style: { fontFamily: 'var(--font-mono)' }, 'data-testid': 'formula-code' }} helperText="Suggested from the operation — change it if you like" />
                    <TextField size="small" label="Formula name" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ 'data-testid': 'formula-name' }} />
                  </Box>
                )}
                {plan === 'update' && base && others === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Saves version {base.version + 1} of {base.code} — only this rule uses it.</Typography>}
                {plan === 'assign' && base && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Uses {base.code} as it is.</Typography>}
                {plan === 'reuse' && same && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="reuse-note">The same as {same.code} ({same.name}) — that formula is reused, not copied.</Typography>}
                {needsSetupPerm && !canMakeFormula && <Alert severity="info" sx={{ borderRadius: 'var(--r-sm)' }}>Making or changing a formula needs the Setup permission. Pick an existing formula, or use fixed minutes.</Alert>}
              </Box>
            )}
            <ErrorNotice error={error} />
          </Box>

          <Box sx={{ p: 3, borderLeft: { md: '1px solid var(--c-divider)' }, background: 'var(--c-surface)', position: { md: 'sticky' }, top: 0 }}>
            {tab === 'fixed' ? (
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="preview-panel">
                <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>Preview</Typography>
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 30 }}>{minutes.trim() === '' ? '—' : `${numberText(Number(minutes))} min`}</Typography>
                <Typography sx={{ color: 'var(--c-text-2)' }}>{which === 'setup' ? 'per run' : 'for every piece'}</Typography>
              </Box>
            ) : (
              <PreviewPanel expression={expr} ctx={ctx.data} idx={idx} which={which} onCheck={setCheck} />
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', px: 3, py: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          {ctx.loading && <CircularProgress size={16} />}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy || blocked} data-testid="builder-save"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : saveLabel}</Button>
        </Box>
      </Box>
    </Drawer>
  );
}

