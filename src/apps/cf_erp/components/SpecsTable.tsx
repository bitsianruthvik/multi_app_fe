import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { CfApiError } from '../api/client';
import type { Resolution, ResolvedSpec } from '../api/types';
import { DangerBadge, ErrorNotice, Mono, RuleBadge, SourceBadge, WarnBadge, EmptyState } from './ui';
import { SpecValueInput } from './SpecValueInput';
import { toInputString } from '../lib/tree';

const CAPTURE_LABEL = { item: 'Item', batch: 'Each batch', individual: 'Each unit' } as const;

/** Can a person type this value here? Items: entered/defaulted only. Setup: anything not computed. */
function editableHere(s: ResolvedSpec, mode: Resolution['mode']) {
  if (!s.applicable || s.captureAt !== 'item') return false;
  if (mode === 'item') return s.rule.valueRule === 'entered' || s.rule.valueRule === 'defaulted';
  return !['calculated', 'rollup', 'inherited'].includes(s.rule.valueRule);
}

function statusNote(s: ResolvedSpec): ReactNode {
  switch (s.status) {
    case 'missing': return <DangerBadge label="Missing" title="Required before the item can be activated." />;
    case 'no_fixed_value': return <WarnBadge label="No fixed value" title={s.problem} />;
    case 'waiting_inputs':
    case 'waiting_parent': {
      const missing = s.missingInputs ?? [];
      const label = missing.length > 2 ? `Needs ${missing.length} values` : `Needs ${missing.join(', ')}`;
      const why = s.status === 'waiting_parent' ? 'Inherited from the BOM parent, which has no value yet.' : s.rule.valueRule === 'rollup' ? 'The roll-up needs every BOM child’s value first' : 'The formula needs these values first';
      return <WarnBadge label={label} title={`${why}${missing.length ? `: ${missing.join(', ')}` : ''}`} />;
    }
    case 'formula_error':
    case 'formula_cycle':
    case 'formula_missing': return <DangerBadge label="Formula problem" title={s.problem} />;
    case 'no_bom': return <Tooltip title={s.note ?? ''}><Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No BOM to roll up yet</Typography></Tooltip>;
    case 'no_parent': return <Tooltip title={s.note ?? ''}><Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No BOM parent to inherit from</Typography></Tooltip>;
    case 'captured_later': return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Recorded on {s.captureAt === 'batch' ? 'each batch' : 'each unit'}</Typography>;
    case 'not_capturable': return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Not tracked at that level</Typography>;
    case 'switched_off': return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Switched off at {s.definedAt.level.toLowerCase()}</Typography>;
    case 'computed_on_items': return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Worked out on each item</Typography>;
    case 'default_from_above': return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Default from {s.value?.from.toLowerCase()}</Typography>;
    default: return null;
  }
}

/**
 * Every rule that reaches a thing, with its value and where both came from.
 * `onSave` makes the value column editable in place; the backend refuses what
 * the rules forbid (fixed and calculated values cannot be typed), so this only
 * offers inputs where typing is allowed.
 */
export function SpecsTable({
  resolution, onSave, emptyHint, draftValues, onDraftChange,
}: {
  resolution: Resolution;
  onSave?: (values: { specificationId: number; value: string }[]) => Promise<void>;
  emptyHint?: string;
  /** Create-form mode: inputs are always open and changes go to the parent. */
  draftValues?: Record<number, string>;
  onDraftChange?: (specId: number, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const drafting = !!onDraftChange;

  const rows = useMemo(() => resolution.specs.filter((s) => s.applicable), [resolution]);
  const off = useMemo(() => resolution.specs.filter((s) => !s.applicable), [resolution]);
  // A closed, lost or cancelled order's item keeps the values it had: nothing is editable.
  const editable = resolution.frozen ? [] : rows.filter((s) => editableHere(s, resolution.mode));

  useEffect(() => { if (!editing) setEdits({}); }, [editing]);

  /**
   * The value this record itself holds, as input text. A default shown from
   * above is not the record's own, so its input starts empty (the default
   * appears as the label) and leaving it empty keeps following the default.
   */
  const ownInput = (s: ResolvedSpec) => {
    const own = s.value && (resolution.mode === 'setup' ? s.value.from === 'here' : s.value.source === 'entered' || s.rule.valueRule === 'entered');
    return own ? toInputString(s.value?.raw) : '';
  };

  const start = () => {
    setEdits(Object.fromEntries(editable.map((s) => [s.spec.id, ownInput(s)])));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!onSave) return;
    const initial = new Map(editable.map((s) => [s.spec.id, ownInput(s)]));
    const changed = Object.entries(edits).filter(([id, v]) => initial.get(Number(id)) !== v).map(([id, v]) => ({ specificationId: Number(id), value: v }));
    if (!changed.length) { setEditing(false); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave(changed);
      setEditing(false);
    } catch (e) {
      setError(e as CfApiError);
    } finally {
      setBusy(false);
    }
  };

  if (!resolution.specs.length) {
    return <EmptyState title="No specifications apply yet" body={emptyHint ?? 'Add specification rules on the classification or the record itself.'} />;
  }

  return (
    <Box>
      {resolution.frozen && (
        <Alert severity="info" icon={<LockRounded fontSize="small" />} sx={{ mb: 1.5, borderRadius: 'var(--r-sm)' }}>
          Order {resolution.frozen.orderCode} is {resolution.frozen.orderStatus}. These values are kept as they were when it locked — nothing here is edited or worked out again.
        </Alert>
      )}
      {onSave && !drafting && !resolution.frozen && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>Save values</Button>
            </>
          ) : (
            <Tooltip title={editable.length ? '' : 'Nothing here can be typed in — every rule that applies is fixed, calculated, rolled up, inherited, or captured on a batch or unit.'}>
              <Box component="span" sx={{ display: 'inline-flex' }}>
                <Button startIcon={<EditRounded />} onClick={start} disabled={!editable.length}>Edit values</Button>
              </Box>
            </Tooltip>
          )}
        </Box>
      )}
      <ErrorNotice error={error} />
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell scope="col">Specification</TableCell>
              <TableCell scope="col" sx={{ width: 240 }}>Value</TableCell>
              <TableCell scope="col">Source</TableCell>
              <TableCell scope="col">Rule</TableCell>
              <TableCell scope="col">Set at</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => {
              const open = (editing || drafting) && editableHere(s, resolution.mode);
              const key = `${s.spec.id}-${s.captureAt}`;
              return (
                <TableRow key={key} sx={{ '& td': { verticalAlign: 'middle' } }}>
                  <TableCell>
                    <Box sx={{ fontWeight: 500 }}>{s.spec.name}</Box>
                    <Mono muted>{s.spec.code}</Mono>
                  </TableCell>
                  <TableCell>
                    {open ? (
                      <SpecValueInput
                        dataType={s.spec.dataType}
                        unit={s.spec.unit}
                        options={s.options}
                        value={drafting ? (draftValues?.[s.spec.id] ?? '') : (edits[s.spec.id] ?? '')}
                        onChange={(v) => (drafting ? onDraftChange?.(s.spec.id, v) : setEdits((m) => ({ ...m, [s.spec.id]: v })))}
                        label={s.rule.valueRule === 'defaulted' && s.value && s.value.source !== 'entered' ? `Default: ${s.value.display}` : undefined}
                      />
                    ) : s.value ? (
                      <Mono sx={{ fontSize: 13, color: 'var(--c-text)' }}>{s.value.display}</Mono>
                    ) : (
                      <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                      {s.value && <SourceBadge source={s.value.source} from={s.value.from} />}
                      {statusNote(s)}
                      {s.conflict && <WarnBadge label="Overridden" title={s.conflict} />}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                      <RuleBadge rule={s.rule.valueRule} />
                      {s.rule.isRequired && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>required</Typography>}
                      {s.captureAt !== 'item' && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>· {CAPTURE_LABEL[s.captureAt]}</Typography>}
                      {s.rule.formula && <Tooltip title={s.rule.formula.expression}><Box component="span"><Mono muted>{s.rule.formula.code} v{s.rule.formula.version}</Mono></Box></Tooltip>}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 13 }}>{s.definedAt.level}</Typography>
                    {s.overrides.length > 0 && (
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>overrides {s.overrides.map((o) => o.level.toLowerCase()).join(', ')}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      {off.length > 0 && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1.5 }}>
          Switched off here: {off.map((s) => `${s.spec.code} (at ${s.definedAt.level.toLowerCase()})`).join(', ')}
        </Typography>
      )}
      {resolution.unassignedValues.length > 0 && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
          Kept from earlier setup (no rule applies now): {resolution.unassignedValues.map((v) => v.code).join(', ')}
        </Typography>
      )}
    </Box>
  );
}
