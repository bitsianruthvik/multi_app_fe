import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, MenuItem, TextField, Typography } from '@mui/material';
import { checkOnSample, type BuilderCheck, type BuilderContext } from '../../api/formulaBuilder';
import {
  fieldFor, numberText, refsIn, resultWarning, timeInWords, tryParse, unitText, unitWarnings, type FieldIndex, type FieldRole,
} from '../../lib/formulaBuilder';
import { minutesText } from '../../lib/production';
import { CapsLabel } from '../ui';

const FROM_LABEL: Record<string, string> = { piece: 'from the piece', machine: 'from the machine', typed: 'typed' };

/**
 * LIVE PREVIEW: the formula on a real piece and a real machine of the rule's
 * type (or on typed values), checked by the backend as you type — minutes, the
 * formula in words, what each name read, unit slips and problems.
 */
export function PreviewPanel({ expression, ctx, idx, which, onCheck }: {
  expression: string | null;
  ctx: BuilderContext | null;
  idx: FieldIndex;
  which: 'setup' | 'work';
  onCheck?: (c: BuilderCheck | null) => void;
}) {
  const pieces = useMemo(() => ctx?.samplePieces ?? [], [ctx]);
  const machines = useMemo(() => ctx?.machines ?? [], [ctx]);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<BuilderCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const expr = (expression ?? '').trim();
  // Until someone picks a piece, show the formula on a real piece that HAS the
  // values it reads (the newest piece often has none of them yet).
  const [picked, setPicked] = useState(false);
  const itemCodes = refsIn(tryParse(expr)).filter((r) => r.role === 'item' && !r.table).map((r) => r.code).join(',');
  useEffect(() => {
    if (picked || !pieces.length) return;
    const codes = itemCodes ? itemCodes.split(',') : [];
    const best = pieces.find((p) => codes.every((c) => p.values[c] != null))
      ?? [...pieces].sort((a, b) => codes.filter((c) => b.values[c] != null).length - codes.filter((c) => a.values[c] != null).length)[0];
    if (best && best.id !== pieceId) setPieceId(best.id);
  }, [pieces, itemCodes, picked, pieceId]);
  useEffect(() => { if (machineId == null && machines.length) setMachineId(machines[0].id); }, [machines, machineId]);

  useEffect(() => {
    if (!expr) { setCheck(null); onCheck?.(null); return undefined; }
    const sample: Record<string, number> = {};
    for (const [k, v] of Object.entries(typed)) if (v.trim() !== '' && Number.isFinite(Number(v))) sample[k] = Number(v);
    let alive = true;
    const t = window.setTimeout(() => {
      setChecking(true);
      checkOnSample({ expression: expr, itemId: pieceId, machineId, sample })
        .then((c) => { if (alive) { setCheck(c); onCheck?.(c); } })
        .catch(() => { if (alive) { setCheck(null); onCheck?.(null); } })
        .finally(() => { if (alive) setChecking(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
    // onCheck is the parent's setter; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, pieceId, machineId, typed]);

  // A rate formula reads as a rate ("1.2 min per m of SAW weld length"), anything else in words.
  const words = expr && tryParse(expr) ? timeInWords({ minutes: null, formula: { code: '', expression: expr } }, which, idx) : null;
  const units = expr ? unitWarnings(expr, idx) : [];
  const value = check?.result?.value ?? null;
  const sanity = resultWarning(value);
  const refs = refsIn(tryParse(expr));
  const inputFor = (role: FieldRole, code: string) => check?.inputs?.find((i) => i.ref === `${role}.${code}`) ?? null;
  const piece = pieces.find((p) => p.id === pieceId) ?? null;

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="preview-panel" aria-live="polite" aria-busy={checking}>
      <CapsLabel>Live preview</CapsLabel>
      <Autocomplete size="small" options={pieces} value={piece} onChange={(_, p) => { setPicked(true); setPieceId(p?.id ?? null); }}
        getOptionLabel={(p) => `${p.code ?? p.name}${p.orderCode ? ` · ${p.orderCode}` : ''}`} isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={({ key, ...props }, p) => (
          <Box component="li" key={key} {...props}>
            <Box>
              <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{p.code ?? '—'}</Box>
              <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.name}{p.orderCode ? ` · ${p.orderCode}${p.lineNo ? ` line ${p.lineNo}` : ''}` : ''}</Box>
            </Box>
          </Box>
        )}
        noOptionsText="No pieces yet — type values below"
        renderInput={(p) => <TextField {...p} label="Try it on a piece" helperText={pieces.length && !pieces[0].fromOperation ? 'Nothing goes through this operation yet — these are recent order pieces' : 'Real pieces whose flow has this operation; or clear it and type values'} />} />
      <TextField select size="small" label="On machine" value={machineId ?? ''} onChange={(e) => setMachineId(Number(e.target.value) || null)}
        helperText={machines.length ? undefined : 'No active machine is under this rule'} inputProps={{ 'data-testid': 'preview-machine' }}>
        {machines.map((m) => <MenuItem key={m.id} value={m.id}>{m.code} · {m.name}</MenuItem>)}
      </TextField>

      <Box sx={{ p: 2, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }} data-testid="preview-result">
        {!expr ? (
          <Typography sx={{ color: 'var(--c-text-3)' }}>Build the time on the left — the result shows here.</Typography>
        ) : value != null ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, lineHeight: 1.1 }} data-testid="preview-minutes">{numberText(value)} min</Typography>
              <Typography sx={{ color: 'var(--c-text-2)' }}>{which === 'setup' ? 'per run' : 'per piece'}{value >= 60 ? ` · ${minutesText(value)}` : ''}</Typography>
            </Box>
          </>
        ) : check?.result?.missing?.length ? (
          <Typography sx={{ color: 'var(--c-warning-800)' }}>Needs {check.result.missing.map((m) => m.replace(/^(item|machine) · /, '')).join(', ')} — {piece ? 'not on this piece or machine; ' : ''}type a value below to try.</Typography>
        ) : check?.result?.error ? (
          <Typography sx={{ color: 'var(--c-danger-800)' }}>{check.result.error}</Typography>
        ) : (
          <Typography sx={{ color: 'var(--c-text-3)' }}>{checking ? 'Working it out…' : '—'}</Typography>
        )}
        {words && <Typography sx={{ mt: 1, color: 'var(--c-text-2)', fontSize: 14 }} data-testid="preview-words">{words}</Typography>}
      </Box>

      {refs.length > 0 && (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {refs.filter((r) => r.role === 'item' || r.role === 'machine').map((r) => {
            const f = fieldFor(idx, r.role, r.code);
            const inp = inputFor(r.role, r.code);
            const key = `${r.role}.${r.code}`;
            return (
              <Box key={key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 1, alignItems: 'center' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500 }}>{f?.name ?? r.code}{f?.unit ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}> · {unitText(f.unit)}</Box> : null}</Box>
                  <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    {r.table ? (inp?.chart ? `chart: ${inp.chart}` : 'chart — none on this machine') : inp?.value != null ? `${typeof inp.value === 'number' ? numberText(inp.value) : `“${inp.value}”`} ${inp.from ? FROM_LABEL[inp.from] : ''}` : 'no value'}
                  </Box>
                </Box>
                {!r.table && (
                  <TextField size="small" type="number" placeholder={inp?.value != null ? String(inp.value) : 'value'} value={typed[key] ?? ''}
                    onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                    inputProps={{ step: 'any', 'aria-label': `Try another ${f?.name ?? r.code}`, 'data-testid': `typed-${key}` }} />
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {check && check.problems.length > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 'var(--r-sm)' }} data-testid="preview-problems">{check.problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>
      )}
      {[...units, ...(sanity ? [sanity] : [])].length > 0 && (
        <Alert severity="info" sx={{ borderRadius: 'var(--r-sm)' }} data-testid="unit-warnings">{[...units, ...(sanity ? [sanity] : [])].map((w) => <Box key={w}>{w}</Box>)}</Alert>
      )}
    </Box>
  );
}
