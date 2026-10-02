import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, TextField, Typography } from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Formula, FormulaCheck, Specification } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { FormulaEditor } from './FormulaBuilder/FormulaEditor';
import { fieldIndex, formulaInWords, unitWarnings, type BuilderField } from '../lib/formulaBuilder';
import { ErrorNotice, Mono, Surface } from './ui';
import { DialogHeader } from './FormDialog';

/** Creates or edits a formula — on Setup › Formulas, and in place from an operation's time. */
export function FormulaDialog({ open, onClose, onSaved, existing, canManage, forTiming = false }: {
  open: boolean; onClose: () => void; onSaved: (saved: Formula | null) => void; existing: Formula | null; canManage: boolean;
  /** Opened from an operation's time: it must read item.X / machine.X to count as a timing formula. */
  forTiming?: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [sample, setSample] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<FormulaCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  // Every number / table specification, for the editor's field picker and the formula in words.
  const specs = useLoad(() => (open ? cfApi.get<Specification[]>('/specifications') : Promise.resolve(null)), [open]);
  const fields = useMemo<BuilderField[]>(() => (specs.data ?? []).filter((sp) => sp.status === 'active' && (sp.dataType === 'number' || sp.dataType === 'table'))
    .map((sp) => ({ code: sp.code, name: sp.name, dataType: sp.dataType, measurementType: sp.measurementType, unit: sp.defaultUom, tableConfig: sp.tableConfig ?? null })), [specs.data]);
  const idx = useMemo(() => fieldIndex(fields, fields, fields), [fields]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCheck(null);
    setSample({});
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setExpression(existing?.expression ?? '');
    setDescription(existing?.description ?? '');
    setStatus(existing?.status ?? 'active');
  }, [open, existing]);

  // Checked as you type (debounced): parse errors, unknown names, and a sample result.
  useEffect(() => {
    if (!open || !expression.trim()) { setCheck(null); return undefined; }
    const t = window.setTimeout(() => {
      cfApi.post<FormulaCheck>('/formulas/check', { expression, sample }).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [expression, sample, open]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = existing
        ? await cfApi.put<Formula>(`/formulas/${existing.id}`, { name, expression, description: description || null, status })
        : await cfApi.post<Formula>('/formulas', { code, name, expression, description: description || null });
      setBusy(false);
      onSaved(saved ?? null);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  const result = check?.result;
  // The backend refuses an expression with problems, so do not offer to save one.
  // An untouched expression on an existing formula is never re-checked there,
  // so a name-only edit still goes through.
  const expressionChanged = !existing || expression.trim() !== existing.expression;
  const blocked = expressionChanged && !!check && check.problems.length > 0;
  const incomplete = !name.trim() || !expression.trim() || (!existing && !code.trim());
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New formula'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 2fr)' }, gap: 2, mt: 1 }}>
          <TextField label="Code" required={!existing} value={code} disabled={!!existing} autoFocus={!existing} onChange={(e) => setCode(e.target.value.toUpperCase())} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }}
            helperText={existing ? `Version ${existing.version} — changing the expression makes version ${existing.version + 1}` : 'e.g. PLATE_WEIGHT'} />
          <TextField label="Name" required value={name} autoFocus={!!existing} onChange={(e) => setName(e.target.value)} />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <FormulaEditor value={expression} onChange={setExpression} idx={idx} itemFields={fields} machineFields={fields} plainFields={fields} timingOnly={forTiming} label="Expression" />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>
              Specification codes, numbers, + − × ÷ % ^, MIN, MAX, ROUND(x, n), ABS, SQRT, CEIL, FLOOR, IF(a &gt; b, x, y). Roll-ups: SUM(children.WEIGHT). Operation times: item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS).
            </Typography>
            {expression.trim() && formulaInWords(expression, idx) && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }} data-testid="formula-words">In words: {formulaInWords(expression, idx)}</Typography>}
            {unitWarnings(expression, idx).map((w) => <Typography key={w} sx={{ fontSize: 12.5, color: 'var(--c-info-800)', mt: 0.5 }}>{w}</Typography>)}
          </Box>
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          {existing && (
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          )}
        </Box>
        {forTiming && (!check || check.kind !== 'timing') && expression.trim() !== '' && !check?.problems.length && (
          <Alert severity="info" sx={{ mt: 2, borderRadius: 'var(--r-sm)' }}>An operation time reads the piece being worked on and the machine: use item.X and machine.X (for example item.CUT_LENGTH / machine.CUTTING_SPEED).</Alert>
        )}
        {check && (
          <Box sx={{ mt: 2 }}>
            {check.problems.length > 0 ? (
              <Alert severity="warning" sx={{ borderRadius: 'var(--r-sm)' }}>{check.problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>
            ) : check.usesRollup ? (
              <Alert severity="info" sx={{ borderRadius: 'var(--r-sm)' }}>A roll-up — it reads {check.rollupTerms?.join(', ')} from BOM children and is evaluated once BOMs exist.</Alert>
            ) : (
              <Surface sx={{ p: 2, background: 'var(--c-surface-2)' }}>
                <Typography sx={{ fontWeight: 500, mb: 1 }}>Try it{check.kind === 'timing' ? ' — minutes, from a sample item and machine' : ''}</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[...check.references, ...(check.itemRefs ?? []).map((c) => `item.${c}`), ...(check.machineRefs ?? []).map((c) => `machine.${c}`)].map((r) => (
                    <TextField key={r} size="small" label={r} type="number" value={sample[r] ?? ''} sx={{ width: 150 }}
                      onChange={(e) => setSample((s) => ({ ...s, [r]: e.target.value }))} inputProps={{ step: 'any', style: { fontFamily: 'var(--font-mono)' } }} />
                  ))}
                  <Typography sx={{ ml: 1 }}>=</Typography>
                  <Mono sx={{ fontSize: 16, color: 'var(--c-text)' }}>
                    {result?.value != null ? result.value : result?.missing ? `needs ${result.missing.join(', ')}` : result?.error ?? '—'}
                  </Mono>
                </Box>
              </Surface>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
        {canManage && (
          <Button variant="contained" onClick={save} disabled={busy || incomplete || blocked} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save' : 'Create'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
