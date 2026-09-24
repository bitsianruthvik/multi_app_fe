import { useMemo, useState, type KeyboardEvent } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import { cfApi, CfApiError } from '../../api/client';
import type { Resolution, ResolvedSpec, StructureNode } from '../../api/types';
import { DangerBadge, ErrorNotice, Mono, RuleBadge, SkeletonRows } from '../ui';
import { SpecValueInput } from '../SpecValueInput';
import { baseInputs, specsToFill, specsToShow, type SaveValuesResult, type ValueWrite } from './bomModel';
import type { NodeValues } from './useSpecValues';

/** Which of the backend's `problems` belong to a given specification. */
function problemsFor(problems: string[], code: string): string[] {
  const re = new RegExp(`(^|[^A-Z0-9_])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9_]|$)`, 'i');
  return problems.filter((p) => re.test(p));
}

/**
 * One node's specification values, opened under its row in the tree.
 *
 * A bridge is ~120 temporary items and every one of them needs its thickness,
 * length and width before it can leave draft, so this is built to be typed
 * through rather than clicked through: it opens on the first empty field,
 * Enter saves and moves to the next node that still has a gap, and Escape puts
 * focus back on the row.
 *
 * Only what `valueService.setValues` would accept is offered as an input. A
 * fixed, calculated, rolled-up or inherited value is shown underneath, with the
 * badge that says why it is not typed here.
 */
export function BomValuesEditor({
  node, entry, canEdit, whyNot, hasNext, autoFocus = true, onSaved, onNext, onClose, onReread,
}: {
  node: StructureNode;
  entry: NodeValues | undefined;
  canEdit: boolean;
  /** Said in place when the values are readable but not changeable from here. */
  whyNot?: string | null;
  /** Off while the arrows are walking the tree — the keys have to stay with the rows then. */
  autoFocus?: boolean;
  /** Another node still has an empty required value, so "save and go on" means something. */
  hasNext: boolean;
  onSaved: (r: Resolution) => void;
  onNext: () => void;
  onClose: () => void;
  /** Read this node's specifications again — the way out of a failed read. */
  onReread?: () => void;
}) {
  const r = entry?.resolution ?? null;
  const base = useMemo(() => (r ? baseInputs(r) : {}), [r]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const fill = r ? specsToFill(r) : [];
  const show = r ? specsToShow(r) : [];
  const missing = new Set(entry?.missing ?? []);
  const at = (s: ResolvedSpec) => edits[s.spec.code] ?? base[s.spec.code] ?? '';
  const changed: ValueWrite[] = fill
    .filter((s) => at(s) !== (base[s.spec.code] ?? ''))
    .map((s) => ({ specCode: s.spec.code, value: at(s) === '' ? null : at(s) }));
  // Open on the first gap — the reason the node was selected — and on the first
  // field when there is none, so a correction starts where the eye already is.
  const focusCode = (fill.find((s) => at(s) === '') ?? fill[0])?.spec.code ?? null;

  const save = async (then: 'next' | 'stay') => {
    // Nothing to send is not a reason to stop: Enter on a node that is already
    // filled is how someone skips past it to the one that is not.
    const onward = () => { if (then === 'next') { if (hasNext) onNext(); else onClose(); } };
    if (!changed.length) { onward(); return; }
    setBusy(true);
    setError(null);
    try {
      const out = await cfApi.put<SaveValuesResult>(`/records/${node.id}/values`, { values: changed });
      setEdits({});
      onSaved(out.specs);
      onward();
    } catch (e) {
      setError(e as CfApiError);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The keys that make 120 nodes bearable. Everything is handled here and goes
   * no further: the row above listens for the same arrows, and an arrow pressed
   * inside a number field belongs to the field.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { onClose(); e.stopPropagation(); return; }
    if (e.key === 'Enter' && canEdit && !busy) {
      // A closed select opens on Enter — that is the one place plain Enter is
      // the field's, so there Ctrl/⌘+Enter is the way through.
      const inSelect = !!(e.target as HTMLElement).closest('[role="combobox"], [aria-haspopup="listbox"]');
      if (!inSelect || e.ctrlKey || e.metaKey) { e.preventDefault(); void save('next'); }
    }
    e.stopPropagation();
  };

  const label = node.code ?? node.name;
  return (
    <Box onKeyDown={onKeyDown} aria-label={`Values for ${label}`}
      sx={{ p: 2, background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-divider)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Values</Typography>
        <Mono muted>{label}</Mono>
        {missing.size > 0 && <DangerBadge label={`${missing.size} missing`} title={[...missing].join(', ')} />}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" aria-label="Close values" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
      </Box>

      {entry?.error && <ErrorNotice error={entry.error} onRetry={onReread} />}
      {!entry && <SkeletonRows rows={2} height={48} />}
      {entry && !entry.error && !r && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing to read here.</Typography>}

      {r && (
        <>
          {whyNot && <Alert severity="info" sx={{ mb: 1.5 }}>{whyNot}</Alert>}
          <ErrorNotice error={error} />
          {fill.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              Nothing here is typed in — every rule that reaches {label} is fixed, worked out, or captured on a batch or a unit.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 1.5 }}>
              {fill.map((s) => {
                const gap = missing.has(s.spec.code);
                const said = error ? problemsFor(error.problems, s.spec.code) : [];
                const isDefault = s.rule.valueRule === 'defaulted' && s.value && s.value.source !== 'entered';
                return (
                  <Box key={s.spec.code} sx={{ minWidth: 0 }}>
                    <SpecValueInput
                      dataType={s.spec.dataType}
                      unit={s.spec.unit}
                      options={s.options}
                      value={at(s)}
                      disabled={!canEdit || busy}
                      autoFocus={autoFocus && s.spec.code === focusCode}
                      onChange={(v) => setEdits((m) => ({ ...m, [s.spec.code]: v }))}
                      label={`${s.spec.name}${s.rule.isRequired ? ' *' : ''}`}
                    />
                    <Typography sx={{ fontSize: 11, mt: 0.25, color: said.length || gap ? 'var(--c-danger-600)' : 'var(--c-text-3)' }}>
                      {said.length ? said.join(' ') : isDefault ? `Default ${s.value?.display} — leave empty to keep it` : gap ? `${s.spec.code} · required` : s.spec.code}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {show.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: fill.length ? 2 : 1, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
              {show.map((s) => (
                <Box key={`${s.spec.code}-${s.captureAt}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12 }}>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.spec.name}</Typography>
                  <Mono>{s.value?.display ?? '—'}</Mono>
                  <RuleBadge rule={s.rule.valueRule} />
                  {s.captureAt !== 'item' && (
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                      on each {s.captureAt === 'batch' ? 'batch' : 'unit'}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {canEdit && fill.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 2 }}>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: 1, minWidth: 200 }}>
                Enter saves and jumps to the next node that still needs values · Esc closes · ↑ ↓ move between nodes
              </Typography>
              <Button size="small" onClick={onClose} disabled={busy}>Cancel</Button>
              <Tooltip title="Save and stay on this node">
                <Box component="span" sx={{ display: 'inline-flex' }}>
                  <Button size="small" startIcon={busy ? <CircularProgress size={13} color="inherit" /> : <SaveRounded />}
                    onClick={() => void save('stay')} disabled={busy || !changed.length}>Save</Button>
                </Box>
              </Tooltip>
              <Button size="small" variant="contained" endIcon={<SkipNextRounded />} disabled={busy}
                onClick={() => void save('next')}>{hasNext ? 'Save · next gap' : 'Save · done'}</Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
