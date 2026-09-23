import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Sourcing, DraftPreview, MasterRecord, Tree } from '../api/types';
import { SOURCING_HELP, SOURCING_OPTIONS } from '../lib/records';
import { ClassificationPicker } from './ClassificationPicker';
import { SpecsTable } from './SpecsTable';
import { CapsLabel, ErrorNotice, Mono, Surface } from './ui';
import { DialogHeader } from './FormDialog';

/**
 * Creates a catalog item or a definition. The form previews, as you type,
 * which specifications apply (from the chosen Variant, and for definitions
 * nothing yet beyond the Variant) and what code and name the coding rules
 * would give — nothing is saved and no number is taken until Create.
 *
 * Temporary items are not created here: they belong to a sales order line and
 * will be created by the order and BOM screens.
 */
export function CreateRecordDialog({ open, onClose, onCreated, recordKind, tree, initialClassificationId }: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: MasterRecord) => void;
  recordKind: 'item' | 'definition';
  tree: Tree | null;
  initialClassificationId?: number | null;
}) {
  const isItem = recordKind === 'item';
  const [definitionType, setDefinitionType] = useState<'template' | 'selection'>('template');
  const [classificationId, setClassificationId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [shortName, setShortName] = useState('');
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

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPreview(null);
    setPreviewError(null);
    setDefinitionType('template');
    setClassificationId(initialClassificationId ?? null);
    setName(''); setCode(''); setShortName(''); setUom('nos'); setTrackedBy('quantity'); setSourcing('stock');
    setSelectionMode('allowed_list'); setCandidateClassificationId(null); setValues({});
  }, [open, initialClassificationId]);

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
    const common = { classificationId, name: name || null, code: code || null, shortName: shortName || null, status, values: valueList };
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
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="lg" fullWidth>
      <DialogHeader title={isItem ? 'New catalog item' : 'New definition'} onClose={onClose} busy={busy}
        subtitle="Nothing is saved and no number is taken until you create it." />
      <DialogContent>
        <ErrorNotice error={error} />
        {!isItem && (
          <ToggleButtonGroup exclusive size="small" value={definitionType} onChange={(_, v) => v && setDefinitionType(v)} sx={{ mb: 2, flexWrap: 'wrap' }} aria-label="Definition type">
            <ToggleButton value="template">Template — creates order-specific items</ToggleButton>
            <ToggleButton value="selection">Selection — picks a catalog item</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, pt: 0.5 }}>
          <ClassificationPicker tree={tree} value={classificationId} onChange={setClassificationId} scope={isItem ? 'item' : 'definition'}
            required autoFocus={!initialClassificationId}
            helperText="Rules set on this Variant and above decide which specifications apply" />
          <TextField label="Name" value={name} autoFocus={!!initialClassificationId} onChange={(e) => setName(e.target.value)} placeholder={preview?.name?.text ?? ''} helperText="Leave empty to use the naming rule" />
          <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={preview?.code?.text ?? ''} helperText="Leave empty to use the coding rule"
            inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField label="Short name" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="WEB" helperText="The stock and WIP codes are built from this"
            inputProps={{ style: { fontFamily: 'var(--font-mono)', textTransform: 'uppercase' } }} />
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
            {isItem ? (
              preview?.resolution ? (
                <SpecsTable resolution={preview.resolution} draftValues={values} onDraftChange={(id, v) => setValues((m) => ({ ...m, [id]: v }))}
                  emptyHint="No specification rules reach this Variant yet — add them under Setup › Classification." />
              ) : previewError ? (
                <Typography sx={{ color: 'var(--c-text-3)' }}>Which specifications apply could not be worked out — you can still create this as a draft and fill them in on the item.</Typography>
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
