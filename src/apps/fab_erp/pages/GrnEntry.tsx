import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon   from '@mui/icons-material/Edit';

import { fabQuery, fabMutate }  from '../api/client';
import api, { API_HOST }        from '@core/utils/axiosConfig';
import type {
  FabItemCatalog,
  FabPlant,
  FabStockLocation,
  FabSupplier,
} from '../types';
import { usePermission } from '@core/hooks/usePermission';

// ── shared helpers ────────────────────────────────────────────────────────────

interface QueryResult<T> {
  data: T[];
  total?: number;
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ── Catalog item Autocomplete option ─────────────────────────────────────────

interface CatalogOption {
  id:   number;
  name: string;
  code: string;
}

// ── Supplier draft + dialog ──────────────────────────────────────────────────

interface SupplierDraft {
  name:        string;
  code:        string;
  contactName: string;
  phone:       string;
  email:       string;
  address:     string;
  notes:       string;
}

const BLANK_SUPPLIER = (): SupplierDraft => ({
  name: '', code: '', contactName: '', phone: '', email: '', address: '', notes: '',
});

function SupplierDialog({ open, initial, onClose, onSaved }: {
  open:    boolean;
  initial: FabSupplier | null;
  onClose: () => void;
  onSaved: (supplier: FabSupplier) => void;
}) {
  const isNew = !initial;
  const [draft,  setDraft]  = useState<SupplierDraft>(BLANK_SUPPLIER());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? {
          name:        initial.name,
          code:        initial.code,
          contactName: initial.contactName ?? '',
          phone:       initial.phone ?? '',
          email:       initial.email ?? '',
          address:     initial.address ?? '',
          notes:       initial.notes ?? '',
        }
      : BLANK_SUPPLIER());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof SupplierDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) {
      setErr('Name and Code are required.'); return;
    }
    setSaving(true); setErr('');
    try {
      const payload = {
        name:         draft.name.trim(),
        code:         draft.code.trim(),
        contact_name: draft.contactName.trim() || null,
        phone:        draft.phone.trim() || null,
        email:        draft.email.trim() || null,
        address:      draft.address.trim() || null,
        notes:        draft.notes.trim() || null,
      };
      if (isNew) {
        const res = await fabMutate<{ id?: number; data?: { insertId?: number }; insertId?: number }>(
          'fabErpSupplier', 'insert', payload,
        );
        const newId = res.id ?? res.insertId ?? res.data?.insertId;
        onSaved({
          id: newId as number,
          companyId: 0,
          name: payload.name,
          code: payload.code,
          contactName: payload.contact_name,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          notes: payload.notes,
          createdAt: '',
          updatedAt: '',
          deletedAt: null,
        } as FabSupplier);
      } else {
        await fabMutate('fabErpSupplier', 'update', { id: initial!.id, ...payload });
        onSaved({ ...initial!, ...{
          name: payload.name,
          code: payload.code,
          contactName: payload.contact_name,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          notes: payload.notes,
        } });
      }
    } catch (e: any) {
      setErr(e.response?.data?.message ?? e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'Add Supplier' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Supplier Name" value={draft.name} size="small" required autoFocus
            sx={{ flex: 2 }}
            onChange={(e) => set('name', e.target.value)}
          />
          <TextField
            label="Code" value={draft.code} size="small" required
            sx={{ flex: 1 }}
            onChange={(e) => set('code', e.target.value)}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Contact Name" value={draft.contactName} size="small" sx={{ flex: 1 }}
            onChange={(e) => set('contactName', e.target.value)}
          />
          <TextField
            label="Phone" value={draft.phone} size="small" sx={{ flex: 1 }}
            onChange={(e) => set('phone', e.target.value)}
          />
          <TextField
            label="Email" value={draft.email} size="small" sx={{ flex: 1 }}
            onChange={(e) => set('email', e.target.value)}
          />
        </Box>
        <TextField
          label="Address" value={draft.address} size="small" fullWidth
          onChange={(e) => set('address', e.target.value)}
        />
        <TextField
          label="Notes" value={draft.notes} size="small" fullWidth multiline minRows={2}
          onChange={(e) => set('notes', e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={save}
          disabled={saving || !draft.name.trim() || !draft.code.trim()}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Supplier delete confirm ──────────────────────────────────────────────────

function SupplierDeleteDialog({ item, onClose, onDeleted }: {
  item: FabSupplier | null; onClose: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  async function confirm() {
    if (!item) return;
    setBusy(true); setErr('');
    try {
      await fabMutate('fabErpSupplier', 'delete', { id: item.id });
      onDeleted();
    } catch (e: any) {
      setErr(e.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Supplier</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>
          Delete <strong>{item?.name}</strong>? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── GRN line row type ─────────────────────────────────────────────────────────

interface LineDraft {
  catalogItem: CatalogOption | null;
  batchCode:   string;
  qty:         string;
  unitCost:    string;
}

const BLANK_LINE = (): LineDraft => ({ catalogItem: null, batchCode: '', qty: '', unitCost: '' });

// "+ Add new supplier" sentinel option for the supplier Autocomplete
const ADD_SUPPLIER_OPTION: FabSupplier = {
  id: -1, companyId: 0, name: '+ Add new supplier', code: '',
  contactName: null, phone: null, email: null, address: null, notes: null,
  createdAt: '', updatedAt: '', deletedAt: null,
};

// ── Main page ────────────────────────────────────────────────────────────────

export default function GrnEntry() {
  const { company } = useParams<{ company: string }>();
  const canManage   = usePermission('fab_erp_grn_manage');

  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState('');

  // ── New GRN tab state ──────────────────────────────────────────────────────
  const [plants,        setPlants]        = useState<FabPlant[]>([]);
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [suppliers,     setSuppliers]     = useState<FabSupplier[]>([]);
  const [catalogItems,  setCatalogItems]  = useState<CatalogOption[]>([]);

  const [grnNumber,  setGrnNumber]  = useState('');
  const [grnDate,    setGrnDate]    = useState(todayStr());
  const [plantId,    setPlantId]    = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [supplier,   setSupplier]   = useState<FabSupplier | null>(null);
  const [supplierRef, setSupplierRef] = useState('');
  const [notes,      setNotes]      = useState('');
  const [lines,      setLines]      = useState<LineDraft[]>([BLANK_LINE()]);

  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [successInfo, setSuccessInfo] = useState<{ grnId: number } | null>(null);

  // Add-supplier dialog (inline, from "+ Add new supplier" option)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);

  // ── Suppliers tab state ────────────────────────────────────────────────────
  const [supDlg,    setSupDlg]    = useState<{ open: boolean; item: FabSupplier | null }>({ open: false, item: null });
  const [supDelete, setSupDelete] = useState<FabSupplier | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchSuppliers = useCallback(async () => {
    const res = await fabQuery<QueryResult<FabSupplier>>('fabErpSupplier', {
      orderBy:    [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 1000 },
    });
    setSuppliers(res.data ?? []);
    return res.data ?? [];
  }, []);

  const fetchInitial = useCallback(async () => {
    try {
      const [plantsRes, catalogRes] = await Promise.all([
        fabQuery<QueryResult<FabPlant>>('fabErpPlant', {
          orderBy:    [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 1000 },
        }),
        fabQuery<QueryResult<FabItemCatalog>>('fabErpItemCatalog', {
          orderBy:    [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 1000 },
        }),
      ]);
      setPlants(plantsRes.data ?? []);
      setCatalogItems((catalogRes.data ?? []).map((c) => ({ id: c.id, name: c.name, code: c.code })));
      await fetchSuppliers();
    } catch (e: any) {
      setFormError(e.message);
    }
  }, [fetchSuppliers]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  // Reset stock location whenever plant changes
  useEffect(() => {
    setLocationId('');
    if (plantId === '') {
      setStockLocations([]);
      return;
    }
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', {
      filters:    { plantId },
      orderBy:    [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 1000 },
    }).then((res) => setStockLocations(res.data ?? []))
      .catch(() => setStockLocations([]));
  }, [plantId]);

  // ── Line item helpers ──────────────────────────────────────────────────────

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines((ls) => [...ls, BLANK_LINE()]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.length <= 1 ? ls : ls.filter((_, idx) => idx !== i));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!grnNumber.trim()) return 'GRN Number is required.';
    if (!grnDate.trim())   return 'GRN Date is required.';
    if (plantId === '')    return 'Plant is required.';
    if (locationId === '') return 'Stock Location is required.';
    if (lines.length === 0) return 'At least one line item is required.';
    for (const [i, l] of lines.entries()) {
      if (!l.catalogItem)       return `Line ${i + 1}: an item must be selected.`;
      if (!l.batchCode.trim())  return `Line ${i + 1}: batch code is required.`;
      const qty = Number(l.qty);
      if (!l.qty || !(qty > 0)) return `Line ${i + 1}: quantity must be greater than 0.`;
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
          grn_number:        grnNumber.trim(),
          grn_date:          grnDate,
          plant_id:          plantId,
          stock_location_id: locationId,
          supplier_id:       supplier?.id ?? null,
          supplier_ref:      supplierRef.trim() || null,
          notes:             notes.trim() || null,
        },
        lines: lines.map((l) => ({
          catalog_item_id: l.catalogItem!.id,
          batch_code:      l.batchCode.trim(),
          qty:             Number(l.qty),
          unit_cost:       l.unitCost.trim() !== '' ? Number(l.unitCost) : null,
        })),
      };
      const res = await api.post(`${API_HOST}/api/${company}/fab_erp/grn/post`, body);
      setSuccessInfo({ grnId: res.data.grnId });
      // Reset form — keep plant/location/supplier selections for convenience
      setGrnNumber('');
      setSupplierRef('');
      setNotes('');
      setLines([BLANK_LINE()]);
      setToast('GRN posted successfully.');
    } catch (e: any) {
      setFormError(e.response?.data?.message ?? e.message);
    } finally { setSubmitting(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Goods Receipt (GRN)</Typography>
        <Typography variant="body2" color="text.secondary">
          Record incoming stock against a supplier delivery
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="New GRN" />
          <Tab label="Suppliers" />
        </Tabs>
      </Box>

      {/* ── New GRN tab ─────────────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!canManage && (
            <Alert severity="warning">You don't have permission to create GRNs.</Alert>
          )}
          {formError && <Alert severity="error" onClose={() => setFormError('')}>{formError}</Alert>}
          {successInfo && (
            <Alert severity="success" onClose={() => setSuccessInfo(null)}>
              GRN posted successfully.{' '}
              <Link href={`/${company}/fab_erp/grn-detail?grnId=${successInfo.grnId}`}>
                View GRN #{successInfo.grnId}
              </Link>
            </Alert>
          )}

          {/* Header form */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>GRN Header</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                label="GRN Number" value={grnNumber} size="small" required
                sx={{ flex: 1, minWidth: 160 }}
                disabled={!canManage}
                onChange={(e) => setGrnNumber(e.target.value)}
              />
              <TextField
                label="GRN Date" type="date" value={grnDate} size="small" required
                sx={{ flex: 1, minWidth: 160 }}
                disabled={!canManage}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setGrnDate(e.target.value)}
              />
              <TextField
                select label="Plant" value={plantId} size="small" required
                sx={{ flex: 1, minWidth: 160 }}
                disabled={!canManage}
                onChange={(e) => setPlantId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">— Select plant —</MenuItem>
                {plants.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                select label="Stock Location" value={locationId} size="small" required
                sx={{ flex: 1, minWidth: 160 }}
                disabled={!canManage || plantId === ''}
                onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">— Select location —</MenuItem>
                {stockLocations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
                ))}
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
                  if (newVal && newVal.id === -1) {
                    setAddSupplierOpen(true);
                    return;
                  }
                  setSupplier(newVal);
                }}
                renderOption={(props, opt) => (
                  <li {...props} key={opt.id}>
                    {opt.id === -1 ? <em>{opt.name}</em> : opt.name}
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Supplier (optional)" size="small" />
                )}
              />
              <TextField
                label="Supplier Ref" value={supplierRef} size="small"
                sx={{ flex: 1, minWidth: 160 }}
                disabled={!canManage}
                onChange={(e) => setSupplierRef(e.target.value)}
              />
              <TextField
                label="Notes" value={notes} size="small" multiline minRows={1}
                sx={{ flex: 2, minWidth: 220 }}
                disabled={!canManage}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Box>
          </Paper>

          {/* Line items */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Line Items</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addLine} disabled={!canManage}>
                Add Line
              </Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 160 }}>Batch Code</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 110 }}>Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 130 }}>Unit Cost</TableCell>
                  <TableCell sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Autocomplete<CatalogOption, false, false, false>
                        options={catalogItems}
                        value={line.catalogItem}
                        getOptionLabel={(o) => `${o.name} (${o.code})`}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        disabled={!canManage}
                        size="small"
                        onChange={(_e, newVal) => setLine(i, { catalogItem: newVal })}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="Select item…" size="small" required />
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={line.batchCode} size="small" fullWidth required
                        disabled={!canManage}
                        onChange={(e) => setLine(i, { batchCode: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number" value={line.qty} size="small" fullWidth required
                        disabled={!canManage}
                        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        onChange={(e) => setLine(i, { qty: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number" value={line.unitCost} size="small" fullWidth
                        disabled={!canManage}
                        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                        onChange={(e) => setLine(i, { unitCost: e.target.value })}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Remove line">
                        <IconButton
                          size="small" color="error"
                          disabled={!canManage || lines.length <= 1}
                          onClick={() => removeLine(i)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="large"
              disabled={!canManage || submitting}
              onClick={submit}
            >
              {submitting ? <CircularProgress size={20} /> : 'Post GRN'}
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Suppliers tab ───────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {canManage && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained" startIcon={<AddIcon />}
                onClick={() => setSupDlg({ open: true, item: null })}
              >
                Add Supplier
              </Button>
            </Box>
          )}

          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 120 }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Contact Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  {canManage && <TableCell sx={{ width: 96 }} align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 6 : 5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No suppliers defined.
                    </TableCell>
                  </TableRow>
                ) : suppliers.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{s.name}</TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.selected', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
                        {s.code}
                      </Typography>
                    </TableCell>
                    <TableCell>{s.contactName ?? '—'}</TableCell>
                    <TableCell>{s.phone ?? '—'}</TableCell>
                    <TableCell>{s.email ?? '—'}</TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setSupDlg({ open: true, item: s })}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setSupDelete(s)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      {/* Suppliers tab CRUD dialog */}
      <SupplierDialog
        open={supDlg.open} initial={supDlg.item}
        onClose={() => setSupDlg({ open: false, item: null })}
        onSaved={() => { setSupDlg({ open: false, item: null }); setToast('Saved.'); fetchSuppliers(); }}
      />
      <SupplierDeleteDialog
        item={supDelete}
        onClose={() => setSupDelete(null)}
        onDeleted={() => { setSupDelete(null); setToast('Deleted.'); fetchSuppliers(); }}
      />

      {/* Inline "+ Add new supplier" dialog from the New GRN tab */}
      <SupplierDialog
        open={addSupplierOpen} initial={null}
        onClose={() => setAddSupplierOpen(false)}
        onSaved={async (newSupplier) => {
          setAddSupplierOpen(false);
          const all = await fetchSuppliers();
          const match = all.find((s) => s.id === newSupplier.id) ?? newSupplier;
          setSupplier(match);
          setToast('Supplier added.');
        }}
      />

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
