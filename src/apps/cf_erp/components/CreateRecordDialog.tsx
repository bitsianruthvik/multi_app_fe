import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Sourcing, DraftPreview, MasterRecord, Resolution, ResolvedSpec, Tree } from '../api/types';
import { SOURCING_HELP, SOURCING_OPTIONS } from '../lib/records';
import { toInputString } from '../lib/tree';
import { ClassificationPicker } from './ClassificationPicker';
import { SpecsTable } from './SpecsTable';
import { CapsLabel, ErrorNotice, Mono, Surface } from './ui';
import { ShortNameField } from './ShortNameField';
import { shortNameBody } from '../lib/shortName';
import { DialogHeader } from './FormDialog';

/**
 * Can a person type this value on the record being created? The same test
 * SpecsTable uses to decide which inputs to open, and the same one the backend
 * enforces when the values are saved: `setValues` in valueService.js refuses a
 * fixed value ("change it at <level>") and a calculated, rolled-up or inherited
 * one ("it cannot be typed in"). A definition resolves in 'setup' mode, where a
 * fixed value IS typed in — that is where the fixed value is set.
 */
function typeable(s: ResolvedSpec, mode: Resolution['mode']): boolean {
  if (!s.applicable || s.captureAt !== 'item') return false;
  if (mode === 'item') return s.rule.valueRule === 'entered' || s.rule.valueRule === 'defaulted';
  return !['calculated', 'rollup', 'inherited'].includes(s.rule.valueRule);
}

/**
 * Worth copying from the record being copied: a value that record holds in its
 * own right, under a rule that lets it be typed in again. Everything else is
 * left out on purpose —
 *   - fixed, calculated, rolled-up and inherited values are produced by the
 *     rules, and `PUT /records/:id/values` refuses them outright;
 *   - a default shown from a level above is not the source's own value, and the
 *     new record inherits the very same default; copying it would quietly turn
 *     "follows the default" into "typed in", which then stops following it.
 */
function copyable(s: ResolvedSpec, mode: Resolution['mode']): boolean {
  return typeable(s, mode) && !!s.value && s.value.from === 'here' && s.value.source === 'entered';
}

/** Why a value that the source holds was left behind, in one word. */
function skipWord(s: ResolvedSpec): string {
  if (['fixed', 'calculated', 'rollup', 'inherited'].includes(s.rule.valueRule)) {
    return s.rule.valueRule === 'rollup' ? 'rolled up' : s.rule.valueRule;
  }
  if (s.captureAt !== 'item') return s.captureAt === 'batch' ? 'per batch' : 'per unit';
  return 'default from above';
}

/**
 * Creates a catalog item or a definition. The form previews, as you type,
 * which specifications apply (from the chosen Variant, and for definitions
 * nothing yet beyond the Variant) and what code and name the coding rules
 * would give — nothing is saved and no number is taken until Create.
 *
 * With `copyFrom` it is the same form, opened pre-filled from an existing
 * record — everything except the code and the name, which are unique and are
 * generated for the new record exactly as a fresh create generates them.
 *
 * Temporary items are not created here: they belong to a sales order line and
 * will be created by the order and BOM screens.
 */
export function CreateRecordDialog({ open, onClose, onCreated, recordKind, tree, initialClassificationId, copyFrom, onTreeChanged }: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: MasterRecord) => void;
  recordKind: 'item' | 'definition';
  tree: Tree | null;
  initialClassificationId?: number | null;
  /** Start from this record instead of from nothing — "make a similar one". */
  copyFrom?: MasterRecord | null;
  /** A Variant was created from the picker — the screen that owns the tree reads it again. */
  onTreeChanged?: () => void;
}) {
  const isItem = recordKind === 'item';
  const copyId = copyFrom?.id ?? null;
  const [definitionType, setDefinitionType] = useState<'template' | 'selection'>('template');
  const [classificationId, setClassificationId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [shortName, setShortName] = useState('');
  const [noShortName, setNoShortName] = useState(false);
  const [description, setDescription] = useState('');
  const [revision, setRevision] = useState('');
  const [uom, setUom] = useState('nos');
  const [trackedBy, setTrackedBy] = useState<'quantity' | 'batch' | 'individual'>('quantity');
  const [sourcing, setSourcing] = useState<Sourcing>('stock');
  const [selectionMode, setSelectionMode] = useState<'allowed_list' | 'spec_match' | 'both'>('allowed_list');
  const [candidateClassificationId, setCandidateClassificationId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [previewError, setPreviewError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  /** The source's own specification values — read once per opening, then copied in. */
  const [sourceSpecs, setSourceSpecs] = useState<Resolution | null>(null);
  const [sourceError, setSourceError] = useState<CfApiError | null>(null);

  // Set up once per opening (the pattern CreateClassificationDialog uses): a
  // parent that hands a fresh `copyFrom` object every render must not wipe what
  // has already been typed into the form.
  const started = useRef(false);
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) { started.current = false; seeded.current = false; return; }
    if (started.current) return;
    started.current = true;
    setError(null);
    setPreview(null);
    setPreviewError(null);
    setValues({});
    // The code and the name are never copied — they are unique per record, and
    // the coding rules mint the new one's just as they would for a fresh create.
    setName(''); setCode('');
    setDefinitionType(copyFrom?.definition?.definitionType ?? 'template');
    setClassificationId(copyFrom?.classificationId ?? initialClassificationId ?? null);
    setShortName(copyFrom?.shortName ?? '');
    setNoShortName(copyFrom?.shortName === '');
    setDescription(copyFrom?.description ?? '');
    setRevision(copyFrom?.revision ?? '');
    setUom(copyFrom?.item?.uom ?? 'nos');
    setTrackedBy(copyFrom?.item?.trackedBy ?? 'quantity');
    setSourcing(copyFrom?.item?.sourcing ?? 'stock');
    setSelectionMode(copyFrom?.definition?.selectionMode ?? 'allowed_list');
    setCandidateClassificationId(copyFrom?.definition?.candidateClassificationId ?? null);
  }, [open, initialClassificationId, copyFrom]);

  // The source's values, read straight from the record rather than from the
  // list row, so the copy carries what it actually holds.
  useEffect(() => {
    setSourceSpecs(null);
    setSourceError(null);
    if (!open || !copyId) return undefined;
    let alive = true;
    cfApi.get<Resolution>(`/records/${copyId}/specs`)
      .then((r) => { if (alive) setSourceSpecs(r); })
      .catch((e) => { if (alive) setSourceError(e as CfApiError); });
    return () => { alive = false; };
  }, [open, copyId]);

  const copied = useMemo(() => (sourceSpecs ? sourceSpecs.specs.filter((s) => copyable(s, sourceSpecs.mode)) : []), [sourceSpecs]);
  const skipped = useMemo(
    () => (sourceSpecs ? sourceSpecs.specs.filter((s) => s.applicable && !!s.value && !copyable(s, sourceSpecs.mode)) : []),
    [sourceSpecs],
  );

  useEffect(() => {
    if (!open || seeded.current || !copyId || !sourceSpecs) return;
    seeded.current = true;
    setValues(Object.fromEntries(copied.map((s) => [s.spec.id, toInputString(s.value?.raw ?? null)])));
  }, [open, copyId, sourceSpecs, copied]);

  const valueList = useMemo(() => Object.entries(values).filter(([, v]) => v !== '').map(([id, v]) => ({ specificationId: Number(id), value: v })), [values]);
  const draft = useMemo(() => ({
    recordKind, itemType: 'catalog', definitionType, classificationId, trackedBy, name: name || null, code: code || null, values: valueList,
  }), [recordKind, definitionType, classificationId, trackedBy, name, code, valueList]);

  useEffect(() => {
    if (!open || !classificationId) { setPreview(null); setPreviewError(null); return undefined; }
    const t = window.setTimeout(() => {
      // A failed preview used to leave "Working out which specifications
      // apply…" on screen for good, with no way to tell why.
      cfApi.post<DraftPreview>('/records/preview', draft)
        .then((p) => { setPreview(p); setPreviewError(null); })
        .catch((e) => { setPreview(null); setPreviewError(e as CfApiError); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, open, classificationId]);

  const create = async (status: 'draft' | 'active') => {
    setBusy(true);
    setError(null);
    // Only what the record being created can actually take. Copied values (or
    // typed ones) for a specification that the Variant on screen no longer
    // reaches would be refused outright and lose the whole create, so they are
    // dropped here instead — the preview above is the same list on screen.
    const res = preview?.resolution ?? null;
    const accepted = res ? new Set(res.specs.filter((s) => typeable(s, res.mode)).map((s) => s.spec.id)) : null;
    const sending = accepted ? valueList.filter((v) => accepted.has(v.specificationId)) : valueList;
    const common = {
      classificationId, name: name || null, code: code || null, ...shortNameBody(shortName, noShortName),
      description: description || null, revision: revision || null, status, values: sending,
    };
    try {
      const created = isItem
        ? await cfApi.post<MasterRecord>('/items', { ...common, itemType: 'catalog', uom, trackedBy, sourcing })
        : await cfApi.post<MasterRecord>('/definitions', {
          ...common, definitionType,
          ...(definitionType === 'selection' ? { selectionMode, candidateClassificationId } : {}),
        });
      setBusy(false);
      onCreated(created);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  const genLine = (label: string, g: DraftPreview['code'], typed: string) => {
    if (typed) return null;
    return (
      <Box sx={{ minWidth: 200 }}>
        <CapsLabel>{label}</CapsLabel>
        <Box sx={{ mt: 0.25 }}>
          {!g || g.noRule ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No rule applies — type one in</Typography>
            : g.error ? <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{g.error}</Typography>
              : g.text ? <Mono sx={{ fontSize: 14, color: 'var(--c-text)' }}>{g.text}</Mono>
                : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Needs {g.missing.join(', ')}</Typography>}
          {g?.schemeCode && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>rule {g.schemeCode}</Typography>}
        </Box>
      </Box>
    );
  };

  const missing = preview?.resolution?.missingRequired ?? [];
  const thing = isItem ? 'item' : 'definition';
  const startFilled = !!initialClassificationId || !!copyFrom;
  // What is deliberately left behind, so nothing has to be discovered later on
  // an empty tab.
  const notCarried: string[] = [];
  if (copyFrom?.definition?.definitionType === 'selection') notCarried.push('its allowed list and its matching criteria');
  if (copyFrom?.bomStatus || copyFrom?.bom) notCarried.push('its BOM');
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="lg" fullWidth>
      <DialogHeader
        title={copyFrom ? `New ${thing}, like ${copyFrom.code ?? copyFrom.name}` : (isItem ? 'New catalog item' : 'New definition')}
        onClose={onClose} busy={busy}
        subtitle="Nothing is saved and no number is taken until you create it." />
      <DialogContent>
        <ErrorNotice error={error} />
        {copyFrom && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 'var(--r-sm)' }}>
            <Typography sx={{ fontSize: 13 }}>
              Filled in from <Mono>{copyFrom.code ?? '—'}</Mono> {copyFrom.name}. Its <strong>code and name are not copied</strong> — they are
              unique, and the coding rules give this one its own below. Change anything before creating it.
            </Typography>
            <Typography sx={{ fontSize: 13, mt: 0.75 }}>
              {sourceError ? 'Its specification values could not be read, so none were copied — fill them in below.'
                : !sourceSpecs ? 'Reading its specification values…'
                  : copied.length
                    ? `${copied.length} specification value${copied.length === 1 ? '' : 's'} copied.`
                    : 'It holds no typed-in specification values, so there were none to copy.'}
              {skipped.length > 0 && (
                <> Left out: {skipped.slice(0, 6).map((s) => `${s.spec.code} (${skipWord(s)})`).join(', ')}
                  {skipped.length > 6 ? ` and ${skipped.length - 6} more` : ''} — the same rules work these out again here.</>
              )}
            </Typography>
            {notCarried.length > 0 && (
              <Typography sx={{ fontSize: 13, mt: 0.75 }}>
                Not copied: {notCarried.join(' and ')} — set {notCarried.length > 1 ? 'those' : 'that'} up on the new {thing} once it exists.
              </Typography>
            )}
          </Alert>
        )}
        {!isItem && (
          <ToggleButtonGroup exclusive size="small" value={definitionType} onChange={(_, v) => v && setDefinitionType(v)} sx={{ mb: 2, flexWrap: 'wrap' }} aria-label="Definition type">
            <ToggleButton value="template">Template — creates order-specific items</ToggleButton>
            <ToggleButton value="selection">Selection — picks a catalog item</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, pt: 0.5 }}>
          {/* The Variant that is missing is made from the list itself — this
              form keeps everything typed into it while that happens. */}
          <ClassificationPicker tree={tree} value={classificationId} onChange={setClassificationId} scope={isItem ? 'item' : 'definition'}
            required autoFocus={!startFilled} allowCreate onTreeChanged={onTreeChanged}
            helperText="Rules set on this Variant and above decide which specifications apply. Not there? Create it from the list." />
          <TextField label="Name" value={name} autoFocus={startFilled} onChange={(e) => setName(e.target.value)} placeholder={preview?.name?.text ?? ''}
            helperText={copyFrom ? 'Generated — the source’s name is not reused' : 'Leave empty to use the naming rule'} />
          <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={preview?.code?.text ?? ''}
            helperText={copyFrom ? 'Generated — a code is unique per record' : 'Leave empty to use the coding rule'}
            inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          <ShortNameField value={shortName} none={noShortName} onChange={(n) => { setShortName(n.value); setNoShortName(n.none); }}
            helperText="Codes are built from this — empty falls back to the template’s, then the first word of the name" />
          {isItem && (
            <>
              <TextField select label="Tracked by" value={trackedBy} onChange={(e) => setTrackedBy(e.target.value as typeof trackedBy)}
                helperText={{ quantity: 'A total quantity only', batch: 'Separate balances per batch (heat numbers)', individual: 'Every physical unit has its own identity' }[trackedBy]}>
                <MenuItem value="quantity">Quantity</MenuItem>
                <MenuItem value="batch">Batch</MenuItem>
                <MenuItem value="individual">Individual unit</MenuItem>
              </TextField>
              <TextField label="Unit of measure" value={uom} onChange={(e) => setUom(e.target.value)} helperText="How stock is counted: nos, kg, m…" />
              <TextField select label="Comes from" value={sourcing} sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}
                onChange={(e) => setSourcing(e.target.value as Sourcing)} helperText={SOURCING_HELP[sourcing]}>
                {SOURCING_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </>
          )}
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline
            sx={{ gridColumn: { xs: 'auto', md: 'span 3' } }} />
          <TextField label="Revision" value={revision} onChange={(e) => setRevision(e.target.value)} helperText="Usually empty until it is revised"
            sx={{ alignSelf: 'start' }} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          {!isItem && definitionType === 'selection' && (
            <>
              <TextField select label="Chooses from" value={selectionMode} onChange={(e) => setSelectionMode(e.target.value as typeof selectionMode)}
                helperText={{ allowed_list: 'Only items on its allowed list', spec_match: 'Any catalog item whose values match its criteria', both: 'Items on the list that also match' }[selectionMode]}>
                <MenuItem value="allowed_list">An allowed list</MenuItem>
                <MenuItem value="spec_match">Matching specifications</MenuItem>
                <MenuItem value="both">Both</MenuItem>
              </TextField>
              <ClassificationPicker tree={tree} value={candidateClassificationId} onChange={setCandidateClassificationId} leafOnly={false} label="Search within (optional)" />
            </>
          )}
        </Box>

        {classificationId && (
          <Surface sx={{ mt: 2.5, p: 2 }}>
            <ErrorNotice error={previewError} />
            {!previewError && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
                {genLine('Code it will get', preview?.code ?? null, code)}
                {genLine('Name it will get', preview?.name ?? null, name)}
              </Box>
            )}
            {isItem || copyFrom ? (
              preview?.resolution ? (
                /* Nobody is sent to another screen from here any more: the
                   Variant itself is made from the picker above, and its
                   specification rules can follow at any time.
                   A definition normally shows no table here — while copying it
                   does, because the values carried over are the whole point and
                   must be visible before they are saved. */
                <SpecsTable resolution={preview.resolution} draftValues={values} onDraftChange={(id, v) => setValues((m) => ({ ...m, [id]: v }))}
                  emptyHint={`No specification rules reach this Variant yet, so there is nothing to fill in — create the ${thing} now; rules added to the Variant later reach it.`} />
              ) : previewError ? (
                <Typography sx={{ color: 'var(--c-text-3)' }}>Which specifications apply could not be worked out — you can still create this as a draft and fill them in on the {thing}.</Typography>
              ) : <Typography sx={{ color: 'var(--c-text-3)' }}>Working out which specifications apply…</Typography>
            ) : (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {definitionType === 'template'
                  ? 'After creating it, add the specification rules every item it creates must capture, and any defaults.'
                  : 'After creating it, fill its allowed list or matching criteria; it can be activated once it has them.'}
              </Typography>
            )}
            {isItem && missing.length > 0 && (
              <Alert severity="info" sx={{ mt: 1.5, borderRadius: 'var(--r-sm)' }}>
                Required before activating: {missing.map((m) => m.name).join(', ')}. You can still save it as a draft.
              </Alert>
            )}
          </Surface>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => create('draft')} disabled={busy || !classificationId}>Save as draft</Button>
        <Button variant="contained" onClick={() => create('active')} disabled={busy || !classificationId || (isItem && missing.length > 0)}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Saving…' : 'Create and activate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
