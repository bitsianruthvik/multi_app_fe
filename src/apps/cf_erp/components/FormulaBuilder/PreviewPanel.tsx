import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, MenuItem, TextField, Typography } from '@mui/material';
import { checkOnSample, type BuilderCheck, type BuilderContext } from '../../api/formulaBuilder';
import {
  fieldFor, isLevelCode, LEVEL_FIELDS, numberText, refsIn, resultWarning, timeInWords, tryParse, unitText, unitWarnings, type FieldIndex, type FieldRole,
} from '../../lib/formulaBuilder';
import { minutesText } from '../../lib/production';
import { CapsLabel } from '../ui';

const FROM_LABEL: Record<string, string> = { piece: 'from the piece', machine: 'from the machine', typed: 'tried here' };

/**
 * LIVE PREVIEW: the formula on a real piece (or on typed values), checked by the
 * backend as you type — minutes, the formula in words, what each name read, unit
 * slips and problems.
 *
 * WHICH MACHINE (§58). It opens on the STANDARD — the machine TYPE's values, the
 * time a step is released with. The picker lists the type's machines and marks the
 * ones with their OWN chart; pick one and the panel shows the standard and that
 * machine side by side, because a step put on that machine takes the machine's time.
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
  /** The standard's result, kept beside a machine's so the two can be compared. */
  const [standardCheck, setStandardCheck] = useState<BuilderCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const standard = ctx?.standard ?? null;

  const expr = (expression ?? '').trim();
  // Until someone picks a piece, show the formula on a real piece that HAS the
  // values it reads (the newest piece often has none of them yet).
  const [picked, setPicked] = useState(false);
  const levels = ctx?.levels ?? {};
  // A chart named bare (machine.CUT_SPEED) is read by an item value the formula does not
  // spell out; the backend's expanded text does (LOOKUP(machine.CUT_SPEED, item.THICKNESS)).
  // The inputs are listed from THAT, so the preview asks for the thickness, not the chart.
  const readAs = check?.expanded && tryParse(check.expanded) ? check.expanded : expr;
  const itemCodes = refsIn(tryParse(readAs)).filter((r) => r.role === 'item' && !r.table && !isLevelCode(r.code)).map((r) => r.code).join(',');
  useEffect(() => {
    if (picked || !pieces.length) return;
    const codes = itemCodes ? itemCodes.split(',') : [];
    const best = pieces.find((p) => codes.every((c) => p.values[c] != null))
      ?? [...pieces].sort((a, b) => codes.filter((c) => b.values[c] != null).length - codes.filter((c) => a.values[c] != null).length)[0];
    if (best && best.id !== pieceId) setPieceId(best.id);
  }, [pieces, itemCodes, picked, pieceId]);
  // With no machine type to stand on (an old backend), the first machine is shown, as before.
  useEffect(() => { if (machineId == null && !standard && machines.length) setMachineId(machines[0].id); }, [machines, machineId, standard]);

  /** How a name is tried: a tree level and a pick-list from their choices, text as a word, the rest as a number. */
  const kindOf = (role: FieldRole, code: string): 'level' | 'option' | 'text' | 'number' => {
    if (role === 'item' && isLevelCode(code)) return 'level';
    const t = fieldFor(idx, role, code)?.dataType;
    return t === 'option' ? 'option' : t === 'text' || t === 'word' ? 'text' : 'number';
  };
  const wordKeyList = refsIn(tryParse(readAs)).filter((r) => (r.role === 'item' || r.role === 'machine') && ['option', 'text'].includes(kindOf(r.role, r.code))).map((r) => `${r.role}.${r.code}`).join(',');
  const wordKeys = useMemo(() => new Set(wordKeyList ? wordKeyList.split(',') : []), [wordKeyList]);

  useEffect(() => {
    if (!expr) { setCheck(null); setStandardCheck(null); onCheck?.(null); return undefined; }
    const sample: Record<string, number | string> = {};
    // A number is sent as a number; a pick-list or text value as the word; a tree level as its node id.
    for (const [k, v] of Object.entries(typed)) {
      if (v.trim() === '') continue;
      if (wordKeys.has(k)) sample[k] = v.trim();
      else if (Number.isFinite(Number(v))) sample[k] = Number(v);
    }
    let alive = true;
    const t = window.setTimeout(() => {
      setChecking(true);
      const onStandard = () => checkOnSample({ expression: expr, itemId: pieceId, machineTypeId: standard?.typeId ?? null, sample });
      // No machine picked: the standard IS the result. A machine picked: both, side by side.
      const main = machineId != null ? checkOnSample({ expression: expr, itemId: pieceId, machineId, sample }) : onStandard();
      const beside = machineId != null && standard ? onStandard() : Promise.resolve(null);
      Promise.all([main, beside.catch(() => null)])
        .then(([c, s]) => { if (alive) { setCheck(c); setStandardCheck(s); onCheck?.(c); } })
        .catch(() => { if (alive) { setCheck(null); setStandardCheck(null); onCheck?.(null); } })
        .finally(() => { if (alive) setChecking(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
    // onCheck is the parent's setter; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, pieceId, machineId, typed, standard?.typeId, wordKeyList]);

  // A rate formula reads as a rate ("1.2 min per m of SAW weld length"), anything else in words.
  const words = expr && tryParse(expr) ? timeInWords({ minutes: null, formula: { code: '', expression: expr } }, which, idx) : null;
  const units = expr ? unitWarnings(expr, idx) : [];
  const value = check?.result?.value ?? null;
  const sanity = resultWarning(value);
  const refs = refsIn(tryParse(readAs));
  // The backend names a tree level in capitals (item.VARIANT) however it was written.
  const inputFor = (role: FieldRole, code: string) => check?.inputs?.find((i) => i.ref.toLowerCase() === `${role}.${code}`.toLowerCase()) ?? null;
  /** "item · COATS" → "Coats": what is missing, by the name people know. */
  const missingName = (m: string) => {
    const hit = /^(item|machine) · (.+)$/.exec(m);
    if (!hit) return m;
    const lv = LEVEL_FIELDS.find((f) => f.code === hit[2].toLowerCase());
    return lv && hit[1] === 'item' ? lv.name : fieldFor(idx, hit[1] as FieldRole, hit[2])?.name ?? hit[2];
  };
  const piece = pieces.find((p) => p.id === pieceId) ?? null;
  const machine = machines.find((m) => m.id === machineId) ?? null;
  const standardLabel = standard ? `Standard (machine type ${standard.typeName})` : 'Standard';
  const standardValue = standardCheck?.result?.value ?? null;
  const differs = machine != null && value != null && standardValue != null && Math.abs(value - standardValue) > 1e-9;

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
      <TextField select size="small" label="On machine" value={machineId ?? (standard ? 'standard' : '')}
        onChange={(e) => setMachineId(e.target.value === 'standard' ? null : Number(e.target.value) || null)}
        helperText={!machines.length ? 'No active machine is under this rule'
          : machine ? (machine.ownChart ? `${machine.code} has its own chart: a step put on it takes this time, not the standard.` : `${machine.code} has no chart of its own: it runs at the standard.`)
            : 'The time a step is released with. Pick a machine to see its own time.'}
        inputProps={{ 'data-testid': 'preview-machine' }}>
        {standard && <MenuItem value="standard" data-testid="preview-machine-standard">{standardLabel}</MenuItem>}
        {machines.map((m) => (
          <MenuItem key={m.id} value={m.id} data-testid={`preview-machine-${m.id}`} data-own={m.ownChart ? 'yes' : 'no'}>
            {m.code} · {m.name}{m.ownChart ? ' · own chart' : ''}
          </MenuItem>
        ))}
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
            {(check?.result?.notes ?? []).map((n) => (
              <Typography key={n} sx={{ mt: 0.75, fontSize: 13, color: 'var(--c-warning-800)' }} data-testid="preview-extended">Extended past the chart: {n}</Typography>
            ))}
          </>
        ) : check?.result?.missing?.length ? (
          <Typography sx={{ color: 'var(--c-warning-800)' }}>Needs {check.result.missing.map(missingName).join(', ')} — {piece ? 'not on this piece or machine; ' : ''}type a value below to try.</Typography>
        ) : check?.result?.error ? (
          <Typography sx={{ color: 'var(--c-danger-800)' }}>{check.result.error}</Typography>
        ) : (
          <Typography sx={{ color: 'var(--c-text-3)' }}>{checking ? 'Working it out…' : '—'}</Typography>
        )}
        {expr && (
          <Typography sx={{ mt: 0.75, fontSize: 13, color: 'var(--c-text-2)' }} data-testid="preview-basis">
            {machine ? `On ${machine.code}${machine.ownChart ? ' (own chart)' : ''}` : standardLabel}
          </Typography>
        )}
        {machine && standard && standardCheck && (
          <Box data-testid="preview-compare" data-differs={differs ? 'yes' : 'no'}
            sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: 13, p: 1, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: differs ? 'var(--c-warning-50, var(--c-surface))' : 'var(--c-surface)' }}>
            <Box>
              <Box sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{standardLabel}</Box>
              <Box sx={{ fontFamily: 'var(--font-mono)' }} data-testid="preview-standard-minutes">{standardValue != null ? `${numberText(standardValue)} min` : 'no answer'}</Box>
            </Box>
            <Box>
              <Box sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{machine.code}{machine.ownChart ? ' · own chart' : ''}</Box>
              <Box sx={{ fontFamily: 'var(--font-mono)' }} data-testid="preview-machine-minutes">{value != null ? `${numberText(value)} min` : 'no answer'}</Box>
            </Box>
            <Box sx={{ gridColumn: '1 / -1', color: 'var(--c-text-2)' }}>
              {value == null && standardValue != null ? `${machine.code} has no answer for this piece — a step like it cannot be put on ${machine.code}.`
                : differs ? 'They differ: plans are made on the standard and follow the machine once one is picked.'
                  : 'The same as the standard.'}
            </Box>
          </Box>
        )}
        {words && <Typography sx={{ mt: 1, color: 'var(--c-text-2)', fontSize: 14 }} data-testid="preview-words">{words}</Typography>}
      </Box>

      {refs.length > 0 && (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {refs.filter((r) => r.role === 'item' || r.role === 'machine').map((r) => {
            const kind = kindOf(r.role, r.code);
            const f = kind === 'level' ? LEVEL_FIELDS.find((x) => x.code === r.code.toLowerCase()) ?? null : fieldFor(idx, r.role, r.code);
            const inp = inputFor(r.role, r.code);
            const key = `${r.role}.${r.code}`;
            const label = f?.name ?? r.code;
            // What to choose from: the tree's nodes at that level, or the pick-list's options.
            const choices = kind === 'level' ? (levels[r.code.toUpperCase()] ?? []).map((n) => ({ value: String(n.id), label: n.name }))
              : kind === 'option' ? (f?.options ?? []).map((o) => ({ value: o.value, label: o.label })) : null;
            // A pick-list's value comes back as its stored word; it is shown by its label.
            const shownValue = typeof inp?.value === 'number' ? numberText(inp.value)
              : inp?.value != null ? `“${choices?.find((c) => c.value.toLowerCase() === String(inp.value).toLowerCase())?.label ?? inp.value}”` : null;
            const set = (v: string) => setTyped((t) => ({ ...t, [key]: v }));
            const aria = { 'aria-label': `Try another ${label}`, 'data-testid': `typed-${key}` };
            return (
              <Box key={key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 1, alignItems: 'center' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500 }}>{label}{f?.unit ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}> · {unitText(f.unit)}</Box> : null}</Box>
                  <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    {r.table ? (inp?.chart ? `chart: ${inp.chart}` : 'chart — none on this machine') : shownValue != null ? `${shownValue} ${inp?.from ? FROM_LABEL[inp.from] : ''}` : 'no value'}
                  </Box>
                </Box>
                {r.table ? null : choices && choices.length ? (
                  <TextField select size="small" value={typed[key] ?? ''} onChange={(e) => set(e.target.value)}
                    SelectProps={{ displayEmpty: true, renderValue: (v) => (v ? choices.find((c) => c.value === v)?.label ?? String(v) : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{piece ? 'as on the piece' : 'choose'}</Box>) }}
                    inputProps={aria}>
                    <MenuItem value=""><em>{piece ? 'As on the piece' : 'None'}</em></MenuItem>
                    {choices.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                  </TextField>
                ) : kind === 'number' ? (
                  <TextField size="small" type="number" placeholder={inp?.value != null ? String(inp.value) : 'value'} value={typed[key] ?? ''}
                    onChange={(e) => set(e.target.value)} inputProps={{ step: 'any', ...aria }} />
                ) : kind === 'level' ? null : (
                  <TextField size="small" placeholder={inp?.value != null ? String(inp.value) : 'word'} value={typed[key] ?? ''}
                    onChange={(e) => set(e.target.value)} inputProps={aria} />
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
