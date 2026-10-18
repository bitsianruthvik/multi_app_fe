import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogContent, FormControlLabel, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { cfApi, LONG_WRITE_MS } from '../../api/client';
import type { MasterRecord, SalesOrder, SalesOrderLine } from '../../api/types';
import type { PriceBasis } from '../../api/money';
import { BASIS_OPTIONS } from '../../lib/money';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { LOCKED_STATUSES } from '../../lib/orders';
import { Mono, WarnBadge } from '../ui';
import { DialogHeader, FormDialog } from '../FormDialog';
import { ServerPicker } from '../ServerPicker';
import { fileToBase64 } from '../../api/bomSheet';
import { uploadDrawings } from '../../api/drawings';
import {
  addLineFromStandard, getLineStandard, keepStandard, lineStandardSentence, listStandards, markLineStandard, saveLineToStandard, standardLabel,
  type LineStandardState, type StandardSummary,
} from '../../api/standards';
import { RecordPicker } from '../RecordPicker';
import { useToast } from '../toastContext';
import { codeOrName } from '../../lib/displayCode';

/**
 * The dialogs of a sales order's LINES, used by the Structure & values step (OrderStructureStep): add a line (from
 * the catalog, a template, or a standard drawing), change its quantity / date / price, and its standard drawing.
 * They were the Line items stage's (OrderLinesPanel) until Line items merged into Structure & values (2026-10-18).
 */

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * A new line: a catalog item (standard) or a template definition (custom — its structure is created at once), or
 * FROM A STANDARD DRAWING (its BOM, values and part drawings copied, init.sql §69). A custom line can take its
 * drawing at once; ticked "This is a standard drawing", the drawing is saved to Standard drawings too.
 */
export function AddLineDialog({ order, open, initialMode = 'catalog', onClose, onDone }: { order: SalesOrder; open: boolean; initialMode?: 'catalog' | 'standard'; onClose: () => void; onDone: (o: SalesOrder, message?: string) => void }) {
  const [mode, setMode] = useState<'catalog' | 'standard'>(initialMode);
  const [rec, setRec] = useState<MasterRecord | null>(null);
  const [std, setStd] = useState<StandardSummary | null>(null);
  const [form, setForm] = useState({ quantity: '1', committedDate: '', description: '', rate: '', basis: '' as PriceBasis | '' });
  const [file, setFile] = useState<File | null>(null);
  const [isStandard, setIsStandard] = useState(false);
  const [stdForm, setStdForm] = useState({ number: '', name: '', revision: '' });
  useEffect(() => {
    if (open) {
      setMode(order.orderType === 'stock' ? 'catalog' : initialMode); setRec(null); setStd(null); setFile(null); setIsStandard(false); setStdForm({ number: '', name: '', revision: '' });
      setForm({ quantity: '1', committedDate: '', description: '', rate: '', basis: '' });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const stock = order.orderType === 'stock';
  const price = {
    // Empty rate = the item's list price (a catalog line). Empty basis = the item's own, or per tonne for a custom line.
    ...(form.rate.trim() ? { rate: form.rate.trim() } : {}), ...(form.basis ? { rateBasis: form.basis } : {}),
  };
  const save = async () => {
    if (mode === 'standard') {
      if (!std) return;
      const out = await addLineFromStandard(order.id, { standardId: std.id, quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null, ...price });
      onDone(out, out.fromStandard ? `Line added from ${standardLabel({ number: out.fromStandard.number, versionNo: out.fromStandard.versionNo })}: ${out.fromStandard.rows} rows copied.` : undefined);
      return;
    }
    // A template line copies its whole Template BOM beneath it — long on production, so wait for it.
    const before = new Set((order.lines ?? []).map((l) => l.id));
    let saved = await cfApi.post<SalesOrder>(`/orders/${order.id}/lines`, {
      recordId: rec?.id ?? null, quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null, ...price,
    }, { timeoutMs: LONG_WRITE_MS });
    const added = (saved.lines ?? []).find((l) => !before.has(l.id));
    if (file && added?.item) {
      const content = await fileToBase64(file);
      if (isStandard) {
        await markLineStandard(added.id, { number: stdForm.number.trim(), name: stdForm.name.trim() || undefined, revision: stdForm.revision.trim() || undefined, file: { name: file.name, content } });
      } else {
        await uploadDrawings(order.id, added.id, [{ name: file.name, content, rowId: added.item.id }], false);
      }
      saved = await cfApi.get<SalesOrder>(`/orders/${order.id}`);
      onDone(saved, isStandard ? `Line added. ${stdForm.number.trim()} is saved to Standard drawings — save the BOM onto it once it is filled.` : 'Line added with its drawing.');
      return;
    }
    onDone(saved);
  };
  const hint = rec?.kind === 'template'
    ? `Lays ${codeOrName(rec)} out as this line’s structure, its whole Template BOM beneath it. Nothing is coded until the design is frozen.`
    : rec?.kind === 'catalog' ? 'A standard line: the catalog item as it is, with its Standard BOM if it has one.'
      : stock ? 'Stock orders make catalog items only.' : 'A catalog item for a standard line, or a template definition for a custom one.';
  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !stdForm.number) setStdForm((s) => ({ ...s, number: f.name.replace(/\.(dxf|pdf)$/i, '') }));
  };
  const canSave = mode === 'standard'
    ? !!std && !!std.version
    : !!rec && (!file || !isStandard || !!stdForm.number.trim());
  return (
    <FormDialog open={open} title={<>Add a line to <Mono sx={{ fontSize: 'inherit' }}>{order.code}</Mono></>} onClose={onClose} onSubmit={save}
      submitLabel="Add line" busyLabel="Adding…" submitDisabled={!canSave}>
      {!stock && (
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => { if (v) setMode(v); }} aria-label="How to add the line" sx={{ flexWrap: 'wrap' }}>
          <ToggleButton value="catalog">From the catalog</ToggleButton>
          <ToggleButton value="standard">From a standard drawing</ToggleButton>
        </ToggleButtonGroup>
      )}
      {mode === 'standard' ? (
        <ServerPicker<StandardSummary> search={async (term) => (await listStandards(term)).rows} value={std} onChange={setStd} noun="standard drawing"
          getId={(s) => s.id} getLabel={(s) => `${s.number} — ${s.name}`} label="Drawing number" autoFocus
          renderOption={(s) => (
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Mono sx={{ fontWeight: 600 }}>{s.number}</Mono>
                {s.version ? <Mono muted>v{s.version.versionNo} · {s.version.parts} parts</Mono> : <WarnBadge label="No BOM yet" />}
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{s.name}</Typography>
            </Box>
          )}
          helperText={std ? (std.version
            ? `Copies version ${std.version.versionNo}: ${std.version.rows} rows with their values and drawings. You can change them before the design is frozen.`
            : `${std.number} has no BOM yet. Make the line from a template, then save its BOM to the standard.`) : 'Type the drawing number.'}
          error={!!std && !std.version} />
      ) : (
        <RecordPicker kinds={stock ? ['catalog'] : ['catalog', 'template']} value={rec} onChange={setRec} activeOnly label="What it sells" autoFocus helperText={hint} />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '140px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={rec?.kind === 'template' ? 'Identical copies' : undefined} />
        <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty = the order's date" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Rate (₹, before tax)" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={rec?.kind === 'catalog' ? "Empty = the item's list price" : 'Optional — it can be set later'} />
        <TextField select label="Priced" value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value as PriceBasis | '' })}
          helperText={rec?.kind === 'template' ? 'A custom line is priced per tonne unless you change it' : undefined}>
          <MenuItem value="">{rec?.kind === 'template' ? 'Per tonne (usual)' : "The item's own"}</MenuItem>
          {BASIS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      </Box>
      <TextField label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="The customer's wording" />
      {mode === 'catalog' && rec?.kind === 'template' && (
        <Box sx={{ display: 'grid', gap: 1.5, borderTop: '1px solid var(--c-border)', pt: 1.5 }} data-testid="line-drawing">
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" size="small">
              {file ? 'Change drawing' : 'Upload its drawing (optional)'}
              <input hidden type="file" accept=".dxf,.pdf" aria-label="Line drawing" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </Button>
            {file && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{file.name}</Typography>}
          </Box>
          {file && (
            <FormControlLabel control={<Checkbox checked={isStandard} onChange={(e) => setIsStandard(e.target.checked)} />}
              label="This is a standard drawing" />
          )}
          {file && isStandard && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 110px' }, gap: 2 }}>
                <TextField label="Standard drawing number" value={stdForm.number} onChange={(e) => setStdForm({ ...stdForm, number: e.target.value })} required />
                <TextField label="Revision" value={stdForm.revision} onChange={(e) => setStdForm({ ...stdForm, revision: e.target.value })} />
              </Box>
              <TextField label="Standard name" value={stdForm.name} onChange={(e) => setStdForm({ ...stdForm, name: e.target.value })} placeholder="e.g. 24.4 m composite girder"
                helperText="Saved under Standard drawings. Once the BOM is filled, save it onto the standard from the line." />
            </>
          )}
        </Box>
      )}
    </FormDialog>
  );
}

/**
 * The line and its standard drawing (init.sql §69): where it came from, and what can be done — save the BOM onto
 * the standard (the first version), "Update the standard too (new version)" or "Keep the standard as it is" once the
 * BOM was changed, or mark a line's BOM as a new standard drawing.
 */
export function StandardLineDialog({ line, order, onClose, onChanged }: { line: SalesOrderLine | null; order: SalesOrder; onClose: () => void; onChanged: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_orders_manage') && !LOCKED_STATUSES.includes(order.status);
  const [state, setState] = useState<LineStandardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ number: '', name: '', revision: '' });
  useEffect(() => {
    let live = true;
    setState(null); setError(null); setForm({ number: '', name: '', revision: '' });
    if (line) getLineStandard(line.id).then((s) => { if (live) setState(s); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [line]);
  const act = async (fn: () => Promise<LineStandardState | unknown>, done: string) => {
    setBusy(true); setError(null);
    try {
      const out = await fn();
      if (out && typeof out === 'object' && 'line' in (out as LineStandardState)) setState(out as LineStandardState);
      else if (line) setState(await getLineStandard(line.id));
      toast.success(done); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const s = state;
  return (
    <Dialog open={!!line} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={<>Line {line?.lineNo} · standard drawing</>} subtitle={s?.standard ? `${s.standard.number} — ${s.standard.name}` : undefined} onClose={onClose} />
      <DialogContent>
        {!s && !error && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Checking the line against its standard…</Typography>}
        {error && <Typography role="alert" sx={{ fontSize: 13, color: 'var(--c-danger-700)', mb: 1 }}>{error}</Typography>}
        {s && (
          <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="standard-line">
            <Typography sx={{ fontSize: 14 }}>{lineStandardSentence(s)}</Typography>
            {s.standard && (
              <Box component={Link} to={appPath(company, `standard-drawings/${s.standard.id}`)} sx={{ ...linkSx, fontSize: 13, color: 'var(--c-primary-700)' }}>Open the standard drawing</Box>
            )}
            {canManage && s.offer === 'save' && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" disabled={busy} onClick={() => act(() => saveLineToStandard(s.line.id), 'The BOM is saved to the standard.')}>Save this BOM to the standard</Button>
              </Box>
            )}
            {canManage && s.offer === 'update' && (
              <>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Other lines made from it keep their own copy either way.</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="contained" disabled={busy} onClick={() => act(() => saveLineToStandard(s.line.id), 'The standard has a new version.')}>Update the standard too (new version)</Button>
                  <Button variant="outlined" disabled={busy} onClick={() => act(() => keepStandard(s.line.id), 'The standard stays as it is.')}>Keep the standard as it is</Button>
                </Box>
              </>
            )}
            {canManage && !s.standard && s.canCreate && (
              <Box sx={{ display: 'grid', gap: 1.5, borderTop: '1px solid var(--c-border)', pt: 1.5 }}>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Make this line’s BOM a standard drawing. Other orders can then add it by its number.</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 110px' }, gap: 2 }}>
                  <TextField label="Drawing number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                  <TextField label="Revision" value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
                </Box>
                <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Box>
                  <Button variant="contained" disabled={busy || !form.number.trim()}
                    onClick={() => act(async () => {
                      await markLineStandard(s.line.id, { number: form.number.trim(), name: form.name.trim() || undefined, revision: form.revision.trim() || undefined });
                      return saveLineToStandard(s.line.id);
                    }, 'Saved as a standard drawing.')}>Save as a standard drawing</Button>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Changes a line's quantity, date and wording. What it sells cannot change — remove it and add another. */
export function EditOrderLineDialog({ line, onClose, onDone }: { line: SalesOrderLine | null; onClose: () => void; onDone: (o: SalesOrder) => void }) {
  const [form, setForm] = useState({ quantity: '', committedDate: '', description: '', rate: '', basis: 'unit' as PriceBasis });
  useEffect(() => {
    if (line) setForm({ quantity: String(line.quantity), committedDate: line.committedDate ?? '', description: line.description ?? '', rate: line.rate == null ? '' : String(line.rate),
      // An unpriced custom line is priced by tonnage unless someone says otherwise.
      basis: line.rate == null && line.lineType === 'custom' ? 'tonne' : (line.rateBasis ?? 'unit') });
  }, [line]);
  // A released line keeps its quantity, but what it sells for is commercial and can still change.
  const priceOnly = !!line?.release;
  const save = async () => onDone(await cfApi.put<SalesOrder>(`/order-lines/${line?.id}`, {
    ...(priceOnly ? {} : { quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null }),
    rate: form.rate.trim(), rateBasis: form.basis,
  }));
  return (
    <FormDialog open={!!line} title={`${priceOnly ? 'Price' : 'Change'} line ${line?.lineNo ?? ''}`} onClose={onClose} onSubmit={save} maxWidth="xs"
      subtitle={priceOnly ? 'Released to production — only its price can change.' : 'What it sells cannot change — remove the line and add another.'}>
      {!priceOnly && <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 2 }}>
        <TextField label="Rate (₹)" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} autoFocus={priceOnly} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={line?.billed != null && form.basis !== 'unit' ? `× ${Number(Number(line.billed).toFixed(3))} ${line.billedUom ?? ''} on this line` : 'Before tax. Empty = not priced.'} />
        <TextField select label="Priced" value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value as PriceBasis })}>
          {BASIS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      </Box>
      {!priceOnly && <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} />}
      {!priceOnly && <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
    </FormDialog>
  );
}

/** What is under a line, in a phrase: a custom structure's counts, or the Standard BOM it uses. */
export function LineStructureText({ line: l }: { line: SalesOrderLine }) {
  if (l.lineType === 'custom' && l.structure) {
    const s = l.structure;
    return (
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13 }}>{s.temporaryItems} row{s.temporaryItems === 1 ? '' : 's'}</Typography>
        {s.unresolvedSelections > 0 && <WarnBadge label={`${s.unresolvedSelections} to choose`} title="Selections still without a catalog item." />}
      </Box>
    );
  }
  if (l.bom) return <Typography sx={{ fontSize: 13 }}>Standard BOM <Mono>rev {l.bomRevision ?? '—'}</Mono>{l.bom.currentRevision !== l.bomRevision && <Mono muted> (now {l.bom.currentRevision ?? '—'})</Mono>}</Typography>;
  return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No BOM — bought or traded</Typography>;
}
