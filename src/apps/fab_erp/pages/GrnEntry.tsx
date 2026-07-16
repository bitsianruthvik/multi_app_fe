import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Link, MenuItem, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';

import { fabQuery, fabMutate } from '../api/client';
import api, { API_HOST } from '@core/utils/axiosConfig';
import type { FabCustomField, FabGrn, FabItemCatalog, FabPlant, FabStockLocation, FabSupplier } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, useToast, EntityList, EntityRow } from '../components';

interface QueryResult<T> { data: T[]; total?: number }

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface CatalogOption { id: number; name: string; code: string }

interface SupplierDraft { name: string; code: string; contactName: string; phone: string; email: string; address: string; notes: string }
const BLANK_SUPPLIER = (): SupplierDraft => ({ name: '', code: '', contactName: '', phone: '', email: '', address: '', notes: '' });

function SupplierDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabSupplier | null; onClose: () => void; onSaved: (supplier: FabSupplier) => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<SupplierDraft>(BLANK_SUPPLIER());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? {
      name: initial.name, code: initial.code, contactName: initial.contactName ?? '',
      phone: initial.phone ?? '', email: initial.email ?? '', address: initial.address ?? '', notes: initial.notes ?? '',
    } : BLANK_SUPPLIER());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof SupplierDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: draft.name.trim(), code: draft.code.trim(),
        contact_name: draft.contactName.trim() || null, phone: draft.phone.trim() || null,
        email: draft.email.trim() || null, address: draft.address.trim() || null, notes: draft.notes.trim() || null,
      };
      if (isNew) {
        const res = await fabMutate<{ id?: number; data?: { insertId?: number }; insertId?: number }>('fabErpSupplier', 'insert', payload);
        const newId = res.id ?? res.insertId ?? res.data?.insertId;
        onSaved({
          id: newId as number, companyId: 0, name: payload.name, code: payload.code,
          contactName: payload.contact_name, phone: payload.phone, email: payload.email,
          address: payload.address, notes: payload.notes, createdAt: '', updatedAt: '', deletedAt: null,
        } as FabSupplier);
      } else {
        await fabMutate('fabErpSupplier', 'update', { id: initial!.id, ...payload });
        onSaved({ ...initial!, name: payload.name, code: payload.code, contactName: payload.contact_name, phone: payload.phone, email: payload.email, address: payload.address, notes: payload.notes });
      }
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'Add supplier' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Supplier name" value={draft.name} size="small" required autoFocus sx={{ flex: 2 }} onChange={(e) => set('name', e.target.value)} />
          <TextField label="Code" value={draft.code} size="small" required sx={{ flex: 1 }} onChange={(e) => set('code', e.target.value)} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Contact name" value={draft.contactName} size="small" sx={{ flex: 1 }} onChange={(e) => set('contactName', e.target.value)} />
          <TextField label="Phone" value={draft.phone} size="small" sx={{ flex: 1 }} onChange={(e) => set('phone', e.target.value)} />
          <TextField label="Email" value={draft.email} size="small" sx={{ flex: 1 }} onChange={(e) => set('email', e.target.value)} />
        </Box>
        <TextField label="Address" value={draft.address} size="small" fullWidth onChange={(e) => set('address', e.target.value)} />
        <TextField label="Notes" value={draft.notes} size="small" fullWidth multiline minRows={2} onChange={(e) => set('notes', e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || !draft.code.trim()}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SupplierDeleteDialog({ item, onClose, onDeleted }: { item: FabSupplier | null; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function confirm() {
    if (!item) return;
    setBusy(true); setErr('');
    try { await fabMutate('fabErpSupplier', 'delete', { id: item.id }); onDeleted(); }
    catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.message ?? 'Delete failed');
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Delete supplier</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>Delete <strong>{item?.name}</strong>? This action cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

let pieceKeySeq = 0;
interface PieceDraft {
  key: number;
  qty: string; batchNo: string; heatNo: string; serialNo: string; markNo: string;
  customValues: Record<string, string>;
}
function makePiece(qty: string): PieceDraft {
  return { key: ++pieceKeySeq, qty, batchNo: '', heatNo: '', serialNo: '', markNo: '', customValues: {} };
}

interface LineDraft {
  catalogItem: CatalogOption | null;
  qty: string; // target total qty — UI convenience only, prefills the first piece; not sent to the server directly
  unitCost: string;
  pieces: PieceDraft[];
  customFieldTemplates: FabCustomField[];
  selectedPieceKeys: Set<number>;
  bulkFieldValues: Record<string, string>;
}
const BLANK_LINE = (): LineDraft => ({
  catalogItem: null, qty: '', unitCost: '', pieces: [], customFieldTemplates: [],
  selectedPieceKeys: new Set(), bulkFieldValues: {},
});

const ADD_SUPPLIER_OPTION: FabSupplier = {
  id: -1, companyId: 0, name: '+ Add new supplier', code: '',
  contactName: null, phone: null, email: null, address: null, notes: null,
  createdAt: '', updatedAt: '', deletedAt: null,
};

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

export default function GrnEntry() {
  const { company } = useParams<{ company: string }>();
  const canManage = usePermission('fab_erp_grn_manage');
  const { toast } = useToast();

  const [tab, setTab] = useState(0);

  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [suppliers, setSuppliers] = useState<FabSupplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogOption[]>([]);

  const [grnNumber, setGrnNumber] = useState('');
  const [grnDate, setGrnDate] = useState(todayStr());
  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [supplier, setSupplier] = useState<FabSupplier | null>(null);
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([BLANK_LINE()]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ grnId: number } | null>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);

  const [supDlg, setSupDlg] = useState<{ open: boolean; item: FabSupplier | null }>({ open: false, item: null });
  const [supDelete, setSupDelete] = useState<FabSupplier | null>(null);

  // ── GRN history tab ──
  const [grns, setGrns] = useState<FabGrn[]>([]);
  const [grnsLoading, setGrnsLoading] = useState(false);
  const [locById, setLocById] = useState<Map<number, FabStockLocation>>(new Map());

  const fetchGrns = useCallback(async () => {
    setGrnsLoading(true);
    try {
      const [g, locs] = await Promise.all([
        fabQuery<QueryResult<FabGrn>>('fabErpGrn', { orderBy: [{ field: 'grnDate', direction: 'desc' }, { field: 'id', direction: 'desc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { pagination: { limit: 1000 } }),
      ]);
      setGrns(g.data ?? []);
      setLocById(new Map((locs.data ?? []).map((l) => [l.id, l])));
    } catch (e) { setFormError((e as Error).message); }
    finally { setGrnsLoading(false); }
  }, []);

  useEffect(() => { if (tab === 2) fetchGrns(); }, [tab, fetchGrns]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fabQuery<QueryResult<FabSupplier>>('fabErpSupplier', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } });
    setSuppliers(res.data ?? []);
    return res.data ?? [];
  }, []);

  const fetchInitial = useCallback(async () => {
    try {
      const [plantsRes, catalogRes] = await Promise.all([
        fabQuery<QueryResult<FabPlant>>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
        fabQuery<QueryResult<FabItemCatalog>>('fabErpItemCatalog', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
      ]);
      setPlants(plantsRes.data ?? []);
      setCatalogItems((catalogRes.data ?? []).map((c) => ({ id: c.id, name: c.name, code: c.code })));
      await fetchSuppliers();
    } catch (e) { setFormError((e as Error).message); }
  }, [fetchSuppliers]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  useEffect(() => {
    setLocationId('');
    if (plantId === '') { setStockLocations([]); return; }
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { filters: { plantId }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } })
      .then((res) => setStockLocations(res.data ?? []))
      .catch(() => setStockLocations([]));
  }, [plantId]);

  function setLine(i: number, patch: Partial<LineDraft>) { setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); }
  function addLine() { setLines((ls) => [...ls, BLANK_LINE()]); }
  function removeLine(i: number) { setLines((ls) => (ls.length <= 1 ? ls : ls.filter((_, idx) => idx !== i))); }

  function setLineQty(i: number, qty: string) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      // Keep the single default piece's qty in sync with the target qty until the user manually redistributes.
      const pieces = l.pieces.length === 1 ? [{ ...l.pieces[0], qty }] : l.pieces;
      return { ...l, qty, pieces };
    }));
  }

  async function selectItemForLine(i: number, newVal: CatalogOption | null, currentQty: string) {
    setLine(i, {
      catalogItem: newVal, customFieldTemplates: [], pieces: newVal ? [makePiece(currentQty)] : [],
      selectedPieceKeys: new Set(), bulkFieldValues: {},
    });
    if (!newVal) return;
    try {
      const res = await fabQuery<QueryResult<FabCustomField>>('fabErpCustomField', {
        filters: { level: 'item', levelId: newVal.id },
        orderBy: [{ field: 'sortOrder', direction: 'asc' }],
        pagination: { limit: 100 },
      });
      setLine(i, { customFieldTemplates: res.data ?? [] });
    } catch { /* ignore — item just won't show custom-field inputs */ }
  }

  function addPiece(i: number) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, pieces: [...l.pieces, makePiece('')] } : l)));
  }
  function removePiece(i: number, pieceKey: number) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const nextSelected = new Set(l.selectedPieceKeys);
      nextSelected.delete(pieceKey);
      return { ...l, pieces: l.pieces.filter((p) => p.key !== pieceKey), selectedPieceKeys: nextSelected };
    }));
  }
  function setPiece(i: number, pieceKey: number, patch: Partial<PieceDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, pieces: l.pieces.map((p) => (p.key === pieceKey ? { ...p, ...patch } : p)) } : l)));
  }
  function setPieceCustomValue(i: number, pieceKey: number, fieldKey: string, value: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? {
      ...l,
      pieces: l.pieces.map((p) => (p.key === pieceKey ? { ...p, customValues: { ...p.customValues, [fieldKey]: value } } : p)),
    } : l)));
  }
  function togglePieceSelected(i: number, pieceKey: number) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const next = new Set(l.selectedPieceKeys);
      if (next.has(pieceKey)) next.delete(pieceKey); else next.add(pieceKey);
      return { ...l, selectedPieceKeys: next };
    }));
  }
  function toggleAllPiecesSelected(i: number, checked: boolean) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, selectedPieceKeys: checked ? new Set(l.pieces.map((p) => p.key)) : new Set() } : l)));
  }
  function setBulkFieldValue(i: number, fieldKey: string, value: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, bulkFieldValues: { ...l.bulkFieldValues, [fieldKey]: value } } : l)));
  }
  function applyBulkField(i: number, fieldKey: string, target: 'selected' | 'all') {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const value = l.bulkFieldValues[fieldKey] ?? '';
      const applyKeys = target === 'all' ? new Set(l.pieces.map((p) => p.key)) : l.selectedPieceKeys;
      return {
        ...l,
        pieces: l.pieces.map((p) => (applyKeys.has(p.key) ? { ...p, customValues: { ...p.customValues, [fieldKey]: value } } : p)),
      };
    }));
  }

  function validate(): string | null {
    if (!grnNumber.trim()) return 'GRN number is required.';
    if (!grnDate.trim()) return 'GRN date is required.';
    if (plantId === '') return 'Plant is required.';
    if (locationId === '') return 'Stock location is required.';
    if (lines.length === 0) return 'At least one line item is required.';
    for (const [i, l] of lines.entries()) {
      if (!l.catalogItem) return `Line ${i + 1}: an item must be selected.`;
      if (l.pieces.length === 0) return `Line ${i + 1}: at least one piece is required.`;
      for (const [j, p] of l.pieces.entries()) {
        const qty = Number(p.qty);
        if (!p.qty || !(qty > 0)) return `Line ${i + 1}, piece ${j + 1}: quantity must be greater than 0.`;
      }
    }
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) { setFormError(validationError); return; }

    setSubmitting(true); setFormError(''); setSuccessInfo(null);
    try {
      const body = {
        header: {
          grn_number: grnNumber.trim(), grn_date: grnDate, plant_id: plantId, stock_location_id: locationId,
          supplier_id: supplier?.id ?? null, supplier_ref: supplierRef.trim() || null, notes: notes.trim() || null,
        },
        lines: lines.map((l) => ({
          catalog_item_id: l.catalogItem!.id,
          unit_cost: l.unitCost.trim() !== '' ? Number(l.unitCost) : null,
          pieces: l.pieces.map((p) => ({
            qty: Number(p.qty),
            batch_no: p.batchNo.trim() || null,
            heat_no: p.heatNo.trim() || null,
            serial_no: p.serialNo.trim() || null,
            mark_no: p.markNo.trim() || null,
            custom_fields: l.customFieldTemplates
              .filter((t) => (p.customValues[t.fieldKey] ?? '').trim() !== '')
              .map((t, idx) => ({
                field_key: t.fieldKey,
                field_type: t.fieldType,
                field_value: (p.customValues[t.fieldKey] ?? '').trim(),
                sort_order: t.sortOrder ?? idx,
              })),
          })),
        })),
      };
      const res = await api.post(`${API_HOST}/api/${company}/fab_erp/grn/post`, body);
      setSuccessInfo({ grnId: res.data.grnId });
      setGrnNumber(''); setSupplierRef(''); setNotes(''); setLines([BLANK_LINE()]);
      toast('GRN posted successfully');
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setFormError(ax.response?.data?.message ?? ax.message ?? 'Post failed');
    } finally { setSubmitting(false); }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Goods Receipt (GRN)" subtitle="Record incoming stock against a supplier delivery" />

      <Box sx={{ borderBottom: '1px solid var(--c-divider)', mb: 2.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="New GRN" />
          <Tab label="Suppliers" />
          <Tab label="History" />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!canManage && <Alert severity="warning">You don't have permission to create GRNs.</Alert>}
          {formError && <Alert severity="error" onClose={() => setFormError('')}>{formError}</Alert>}
          {successInfo && (
            <Alert severity="success" onClose={() => setSuccessInfo(null)}>
              GRN posted successfully.{' '}
              <Link href={`/${company}/fab_erp/grn-detail?grnId=${successInfo.grnId}`}>View GRN #{successInfo.grnId}</Link>
            </Alert>
          )}

          <Surface e={1} sx={{ p: 2.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>GRN header</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField label="GRN number" value={grnNumber} size="small" required sx={{ flex: 1, minWidth: 160 }} disabled={!canManage} onChange={(e) => setGrnNumber(e.target.value)} />
              <TextField label="GRN date" type="date" value={grnDate} size="small" required sx={{ flex: 1, minWidth: 160 }} disabled={!canManage} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => setGrnDate(e.target.value)} />
              <TextField select label="Plant" value={plantId} size="small" required sx={{ flex: 1, minWidth: 160 }} disabled={!canManage} onChange={(e) => setPlantId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">— Select plant —</MenuItem>
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
              </TextField>
              <TextField select label="Stock location" value={locationId} size="small" required sx={{ flex: 1, minWidth: 160 }} disabled={!canManage || plantId === ''} onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">— Select location —</MenuItem>
                {stockLocations.map((l) => <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Autocomplete<FabSupplier, false, false, false>
                options={canManage ? [...suppliers, ADD_SUPPLIER_OPTION] : suppliers}
                value={supplier}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                sx={{ flex: 1, minWidth: 220 }}
                disabled={!canManage}
                onChange={(_e, newVal) => {
                  if (newVal && newVal.id === -1) { setAddSupplierOpen(true); return; }
                  setSupplier(newVal);
                }}
                renderOption={(props, opt) => <li {...props} key={opt.id}>{opt.id === -1 ? <em>{opt.name}</em> : opt.name}</li>}
                renderInput={(params) => <TextField {...params} label="Supplier (optional)" size="small" />}
              />
              <TextField label="Supplier ref" value={supplierRef} size="small" sx={{ flex: 1, minWidth: 160 }} disabled={!canManage} onChange={(e) => setSupplierRef(e.target.value)} />
              <TextField label="Notes" value={notes} size="small" multiline minRows={1} sx={{ flex: 2, minWidth: 220 }} disabled={!canManage} onChange={(e) => setNotes(e.target.value)} />
            </Box>
          </Surface>

          <Surface e={1} sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>Line items</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addLine} disabled={!canManage}>Add line</Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                  <TableCell sx={th}>Item</TableCell>
                  <TableCell sx={{ ...th, width: 140 }}>Target qty</TableCell>
                  <TableCell sx={{ ...th, width: 140 }}>Unit cost</TableCell>
                  <TableCell sx={{ ...th, width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, i) => {
                  const distributed = line.pieces.reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
                  const target = Number(line.qty) || 0;
                  const showDistribution = line.qty.trim() !== '';
                  const mismatch = showDistribution && distributed !== target;
                  return (
                  <Fragment key={i}>
                  <TableRow>
                    <TableCell sx={td}>
                      <Autocomplete<CatalogOption, false, false, false>
                        options={catalogItems} value={line.catalogItem}
                        getOptionLabel={(o) => `${o.name} (${o.code})`}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        disabled={!canManage} size="small"
                        onChange={(_e, newVal) => selectItemForLine(i, newVal, line.qty)}
                        renderInput={(params) => <TextField {...params} placeholder="Select item…" size="small" required />}
                      />
                    </TableCell>
                    <TableCell sx={td}>
                      <TextField type="number" value={line.qty} size="small" fullWidth disabled={!canManage} slotProps={{ htmlInput: { min: 0, step: 'any' } }} onChange={(e) => setLineQty(i, e.target.value)} />
                    </TableCell>
                    <TableCell sx={td}>
                      <TextField type="number" value={line.unitCost} size="small" fullWidth disabled={!canManage} slotProps={{ htmlInput: { min: 0, step: 'any' } }} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                    </TableCell>
                    <TableCell sx={td} align="right">
                      <Tooltip title="Remove line">
                        <IconButton size="small" color="error" disabled={!canManage || lines.length <= 1} onClick={() => removeLine(i)}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} sx={{ ...td, background: 'var(--c-surface-1)', p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)' }}>
                          Pieces
                          {showDistribution && (
                            <Box component="span" sx={{ ml: 1, fontWeight: 400, color: mismatch ? 'var(--c-warning-700, #b45309)' : 'var(--c-text-3)' }}>
                              — distributed {distributed} of {target}
                            </Box>
                          )}
                        </Typography>
                        <Button size="small" startIcon={<AddIcon />} disabled={!canManage || !line.catalogItem} onClick={() => addPiece(i)}>Add piece</Button>
                      </Box>
                      {!line.catalogItem ? (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Select an item to add pieces.</Typography>
                      ) : (
                        <>
                        {line.customFieldTemplates.length > 0 && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5, p: 1.5, background: 'var(--c-surface-2)', borderRadius: 1 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
                              Bulk-fill custom fields ({line.selectedPieceKeys.size} piece{line.selectedPieceKeys.size === 1 ? '' : 's'} selected)
                            </Typography>
                            {line.customFieldTemplates.map((t) => (
                              <Box key={t.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <TextField
                                  label={t.fieldKey} value={line.bulkFieldValues[t.fieldKey] ?? ''} size="small" sx={{ flex: 1, maxWidth: 260 }}
                                  disabled={!canManage}
                                  type={(t.fieldType === 'number' || (t.fieldType as string) === 'decimal') ? 'number' : 'text'}
                                  onChange={(e) => setBulkFieldValue(i, t.fieldKey, e.target.value)}
                                />
                                <Button size="small" disabled={!canManage || line.selectedPieceKeys.size === 0} onClick={() => applyBulkField(i, t.fieldKey, 'selected')}>Apply to selected</Button>
                                <Button size="small" disabled={!canManage || line.pieces.length === 0} onClick={() => applyBulkField(i, t.fieldKey, 'all')}>Apply to all</Button>
                              </Box>
                            ))}
                          </Box>
                        )}
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ ...th, width: 36 }}>
                                <Checkbox
                                  size="small"
                                  checked={line.pieces.length > 0 && line.selectedPieceKeys.size === line.pieces.length}
                                  indeterminate={line.selectedPieceKeys.size > 0 && line.selectedPieceKeys.size < line.pieces.length}
                                  disabled={!canManage || line.pieces.length === 0}
                                  onChange={(e) => toggleAllPiecesSelected(i, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell sx={{ ...th, width: 100 }}>Qty</TableCell>
                              <TableCell sx={th}>Batch no.</TableCell>
                              <TableCell sx={th}>Heat no.</TableCell>
                              <TableCell sx={th}>Serial no.</TableCell>
                              <TableCell sx={th}>Mark no.</TableCell>
                              {line.customFieldTemplates.map((t) => (
                                <TableCell key={t.id} sx={th}>{t.fieldKey}</TableCell>
                              ))}
                              <TableCell sx={{ ...th, width: 40 }} />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {line.pieces.map((p) => (
                              <TableRow key={p.key}>
                                <TableCell sx={td}>
                                  <Checkbox size="small" checked={line.selectedPieceKeys.has(p.key)} disabled={!canManage} onChange={() => togglePieceSelected(i, p.key)} />
                                </TableCell>
                                <TableCell sx={td}>
                                  <TextField type="number" value={p.qty} size="small" fullWidth required disabled={!canManage} slotProps={{ htmlInput: { min: 0, step: 'any' } }} onChange={(e) => setPiece(i, p.key, { qty: e.target.value })} />
                                </TableCell>
                                <TableCell sx={td}>
                                  <TextField value={p.batchNo} size="small" fullWidth disabled={!canManage} placeholder="Optional" onChange={(e) => setPiece(i, p.key, { batchNo: e.target.value })} />
                                </TableCell>
                                <TableCell sx={td}>
                                  <TextField value={p.heatNo} size="small" fullWidth disabled={!canManage} placeholder="Optional" onChange={(e) => setPiece(i, p.key, { heatNo: e.target.value })} />
                                </TableCell>
                                <TableCell sx={td}>
                                  <TextField value={p.serialNo} size="small" fullWidth disabled={!canManage} placeholder="Optional" onChange={(e) => setPiece(i, p.key, { serialNo: e.target.value })} />
                                </TableCell>
                                <TableCell sx={td}>
                                  <TextField value={p.markNo} size="small" fullWidth disabled={!canManage} placeholder="Optional" onChange={(e) => setPiece(i, p.key, { markNo: e.target.value })} />
                                </TableCell>
                                {line.customFieldTemplates.map((t) => (
                                  <TableCell key={t.id} sx={td}>
                                    <TextField
                                      value={p.customValues[t.fieldKey] ?? ''}
                                      size="small" fullWidth disabled={!canManage}
                                      type={(t.fieldType === 'number' || (t.fieldType as string) === 'decimal') ? 'number' : 'text'}
                                      placeholder={t.fieldValue ?? ''}
                                      onChange={(e) => setPieceCustomValue(i, p.key, t.fieldKey, e.target.value)}
                                    />
                                  </TableCell>
                                ))}
                                <TableCell sx={td} align="right">
                                  <Tooltip title="Remove piece">
                                    <IconButton size="small" color="error" disabled={!canManage || line.pieces.length <= 1} onClick={() => removePiece(i, p.key)}>
                                      <DeleteOutlineRounded fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Surface>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" size="large" disabled={!canManage || submitting} onClick={submit}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Post GRN'}
            </Button>
          </Box>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {canManage && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSupDlg({ open: true, item: null })}>Add supplier</Button>
            </Box>
          )}

          {suppliers.length === 0 ? (
            <EmptyState title="No suppliers defined" />
          ) : (
            <EntityList>
              {suppliers.map((s) => (
                <EntityRow
                  key={s.id}
                  code={<Mono chip>{s.code}</Mono>}
                  primary={s.name}
                  secondary={[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact info'}
                  actions={canManage ? (<>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setSupDlg({ open: true, item: s })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setSupDelete(s)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                  </>) : undefined}
                />
              ))}
            </EntityList>
          )}
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {grnsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={28} /></Box>
          ) : grns.length === 0 ? (
            <EmptyState title="No GRNs posted yet" />
          ) : (
            <Surface e={1} sx={{ p: 0, overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                    <TableCell>GRN #</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Plant</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Supplier</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {grns.map((g) => {
                    const plant = plants.find((p) => p.id === g.plantId);
                    const loc = locById.get(g.stockLocationId);
                    const sup = suppliers.find((s) => s.id === g.supplierId);
                    return (
                      <TableRow key={g.id} hover>
                        <TableCell><Mono>{g.grnNumber}</Mono></TableCell>
                        <TableCell>{g.grnDate}</TableCell>
                        <TableCell>{plant ? `${plant.code} — ${plant.name}` : g.plantId}</TableCell>
                        <TableCell>{loc ? loc.name : (g.stockLocationName ?? g.stockLocationId)}</TableCell>
                        <TableCell>{sup ? sup.name : (g.supplierName ?? '—')}</TableCell>
                        <TableCell>{g.status}</TableCell>
                        <TableCell align="right"><Link href={`/${company}/fab_erp/grn-detail?grnId=${g.id}`}>View</Link></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Surface>
          )}
        </Box>
      )}

      <SupplierDialog open={supDlg.open} initial={supDlg.item} onClose={() => setSupDlg({ open: false, item: null })}
        onSaved={() => { setSupDlg({ open: false, item: null }); toast('Supplier saved'); fetchSuppliers(); }} />
      <SupplierDeleteDialog item={supDelete} onClose={() => setSupDelete(null)}
        onDeleted={() => { setSupDelete(null); toast('Supplier deleted'); fetchSuppliers(); }} />

      <SupplierDialog open={addSupplierOpen} initial={null} onClose={() => setAddSupplierOpen(false)}
        onSaved={async (newSupplier) => {
          setAddSupplierOpen(false);
          const all = await fetchSuppliers();
          const match = all.find((s) => s.id === newSupplier.id) ?? newSupplier;
          setSupplier(match);
          toast('Supplier added');
        }} />
    </Box>
  );
}
