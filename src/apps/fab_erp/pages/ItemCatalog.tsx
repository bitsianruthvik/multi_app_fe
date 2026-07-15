/**
 * ItemCatalog — company-wide parts / materials library.
 * Items defined here can be picked when building a project BOM.
 *
 * Page tabs: Items | Category | Group | Sub-group
 * Clicking any taxonomy row opens TaxonomyDetailDialog (description + custom fields).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import AddIcon         from '@mui/icons-material/Add';
import DeleteIcon      from '@mui/icons-material/Delete';
import SearchIcon      from '@mui/icons-material/Search';
import Inventory2Icon  from '@mui/icons-material/Inventory2';
import ListAltIcon     from '@mui/icons-material/ListAlt';
import EditIcon        from '@mui/icons-material/Edit';
import DownloadIcon    from '@mui/icons-material/Download';
import UploadFileIcon  from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon  from '@mui/icons-material/ExpandMore';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import type {
  FabItemCatalog, FabItemCategory, FabItemGroup, FabItemSubgroup, FabCustomField,
} from '../types';
import { usePermission } from '@core/hooks/usePermission';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, EntityList, EntityRow, useToast, type SortableColumn } from '../components';
import { useSortableData } from '../hooks/useSortableData';
import { STANDARD_UOMS } from '../constants/uom';

const TH = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const TD = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

const ITEM_COLUMNS: SortableColumn<FabItemCatalog>[] = [
  { key: 'name',           label: 'Name',        sx: { ...TH, minWidth: 200 } },
  { key: 'code',           label: 'Code',         sx: { ...TH, width: 110 } },
  { key: 'unit',           label: 'Unit',         sx: { ...TH, width: 70 } },
  { key: 'description',    label: 'Description',  sx: { ...TH, minWidth: 180 } },
  { key: 'categoryName',   label: 'Category',     sx: { ...TH, width: 130 } },
  { key: 'groupName',      label: 'Group',        sx: { ...TH, width: 130 } },
  { key: 'subgroupName',   label: 'Sub-group',    sx: { ...TH, width: 130 } },
  { key: 'hsnCode',        label: 'HSN',          sx: { ...TH, width: 100 } },
];

// Default pixel widths per column, used by the virtualized row/header below —
// row virtualization needs deterministic widths (unlike a normal flexible <table>).
// User-adjusted widths (via the drag handle in each header cell) are persisted
// to localStorage under COL_WIDTH_STORAGE_KEY and override these on load.
const DEFAULT_ITEM_COL_WIDTH: Record<string, number> = {
  name: 220, code: 110, unit: 70, description: 220, categoryName: 130, groupName: 130,
  subgroupName: 130, hsnCode: 100,
};
const COL_WIDTH_STORAGE_KEY = 'fab_erp_item_catalog_col_widths';
const MIN_COL_WIDTH = 60;
const BATCHES_COL_WIDTH = 64;
const ACTIONS_COL_WIDTH = 84;
const ROW_HEIGHT = 38;

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────
// INFO_TOOLTIP — update this block whenever features on this page change.
// Each constant below maps to one of the four tabs. Keep the bullets in sync
// with what the UI actually does so hover help stays accurate for users.
// ─────────────────────────────────────────────────────────────────────────────

const INFO_ITEMS: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'Company-wide parts & materials library — every item that can appear in a BOM or order lives here.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Add Item — click the button, fill in Name, Code (auto-generated), and Unit of measure.',
      'Code is unique per company; it is auto-derived from the name but you can override it.',
      'Assign a Category / Group / Sub-group to keep items organised — you can create new taxonomy entries inline.',
      'Click any row to open the full detail view: BOM, stock levels, and custom metrics.',
      'Export Template — downloads a fill-in Excel sheet with dropdown-validated Category/Group/Sub-group columns plus a reference of existing taxonomy names.',
      'Import Items — upload the filled template; any Category/Group/Sub-group name that does not exist yet is created automatically, preserving the parent relationship from the row.',
      'After import, download the import log — an Excel sheet listing every row, whether it was created or skipped, and why.',
    ],
  },
];

const INFO_CATEGORY: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'Top-level classification for items (e.g. Raw Material, Assembly, Packing Material).',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Create a category, then assign items to it from the Items tab or the item form.',
      'Custom fields defined on a category are inherited by all items in that category.',
      'Click a row to edit the description and manage inherited custom fields.',
    ],
  },
];

const INFO_GROUP: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'Sub-division within a Category (e.g. Structural Steel inside Raw Material).',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'A Group must belong to one Category.',
      'Custom fields on a Group override the Category\'s fields for items in this Group.',
      'Click a row to edit and manage its custom fields.',
    ],
  },
];

const INFO_SUBGROUP: InfoContent = [
  {
    heading: 'What it is',
    items: ['Finest level of item taxonomy — sits inside a Group.'],
  },
  {
    heading: 'How to use',
    items: [
      'A Sub-group belongs to one Group.',
      'Custom fields are inherited from both Group and Category; you can override at any level.',
      'Items assigned to a Sub-group automatically inherit all ancestor custom fields.',
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItemDraft {
  name: string; code: string; unit: string; description: string;
  categoryId: number | null; groupId: number | null; subgroupId: number | null;
  hsnCode: string;
}

const BLANK_ITEM = (): ItemDraft => ({
  name: '', code: '', unit: 'pcs', description: '',
  categoryId: null, groupId: null, subgroupId: null,
  hsnCode: '',
});

const ADD_NEW = '__add_new__';

// Monotonic counter for client-only draft row ids — Date.now() can collide
// when two rows are added within the same millisecond, which corrupts the
// React `key` → row mapping for that row's controls (incl. the Type select).
let cfDraftSeq = 0;
function nextCfDraftId(): number {
  cfDraftSeq -= 1;
  return cfDraftSeq;
}

interface CustomFieldDraft {
  id: number;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'date' | 'dropdown';
  fieldValue: string;
}

interface ImportItemsResult {
  itemsCreated: number;
  itemsSkipped: number;
  categoriesCreated: number;
  groupsCreated: number;
  subgroupsCreated: number;
  warnings: { row: number; message: string }[];
  reportBase64?: string;
}

// Convert a base64 .xlsx payload into a downloaded file
function downloadBase64Xlsx(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface InheritedField {
  fieldKey: string;
  fieldType: string;
  fieldValue: string | null;
  source: 'category' | 'group' | 'subgroup';
}

// Extract a human-readable message from an unknown caught error
function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? 'Something went wrong';
}

// Auto-generate a code slug from a name
function autoCode(name: string): string {
  const c = name.trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return c || 'CODE';
}

// ── TaxonomyAddForm (used inline inside CatalogDialog) ────────────────────────

interface TaxonomyAddFormProps {
  level: 'category' | 'group' | 'subgroup';
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  defaultCategoryId?: number | null;
  defaultGroupId?: number | null;
  onCancel: () => void;
  onCreated: (id: number) => void;
}

function TaxonomyAddForm({
  level, categories, groups, defaultCategoryId, defaultGroupId, onCancel, onCreated,
}: TaxonomyAddFormProps) {
  const [name, setName]               = useState('');
  const [code, setCode]               = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId]   = useState<number | ''>(defaultCategoryId ?? '');
  const [groupId, setGroupId]         = useState<number | ''>(defaultGroupId ?? '');
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  const groupOptions = level === 'subgroup'
    ? groups.filter((g) => !categoryId || g.categoryId === categoryId)
    : groups;

  // Auto-generate code from name
  useEffect(() => { setCode(autoCode(name)); }, [name]);

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (level === 'group'    && !categoryId) { setErr('Category is required.'); return; }
    if (level === 'subgroup' && !groupId)    { setErr('Group is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(), code: (code.trim() || autoCode(name)).toUpperCase(),
        description: description.trim() || null,
      };
      let resource = 'fabErpItemCategory';
      if (level === 'group')    { resource = 'fabErpItemGroup';    payload.category_id = categoryId; }
      if (level === 'subgroup') { resource = 'fabErpItemSubgroup'; payload.group_id    = groupId; }
      const res = await fabMutate<{ ok: boolean; id: number }>(resource, 'insert', payload);
      onCreated(res.id);
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1, mt: 1 }}>
      {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
      {level === 'group' && (
        <Select size="small" displayEmpty value={categoryId}
          onChange={(e) => setCategoryId(e.target.value as number | '')}>
          <MenuItem value="" disabled><em>Select category…</em></MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </Select>
      )}
      {level === 'subgroup' && (
        <>
          <Select size="small" displayEmpty value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value as number | ''); setGroupId(''); }}>
            <MenuItem value=""><em>Filter by category (optional)…</em></MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={groupId}
            onChange={(e) => setGroupId(e.target.value as number | '')}>
            <MenuItem value="" disabled><em>Select group…</em></MenuItem>
            {groupOptions.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </Select>
        </>
      )}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField label="Name" value={name} size="small" sx={{ flex: 2 }} autoFocus
          onChange={(e) => setName(e.target.value)} />
        <TextField label="Code" value={code} size="small" sx={{ flex: 1 }}
          onChange={(e) => setCode(e.target.value)} />
      </Box>
      <TextField label="Description (optional)" value={description} size="small" fullWidth multiline minRows={1}
        onChange={(e) => setDescription(e.target.value)} />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={14} /> : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}

// ── AddTaxonomyDialog (standalone modal for tab Add buttons) ──────────────────

function AddTaxonomyDialog({ open, level, categories, groups, onClose, onCreated }: {
  open: boolean;
  level: 'category' | 'group' | 'subgroup';
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName]               = useState('');
  const [code, setCode]               = useState('');
  const [description, setDescription] = useState('');
  const [shortform, setShortform]     = useState('');
  const [categoryId, setCategoryId]   = useState<number | ''>('');
  const [groupId, setGroupId]         = useState<number | ''>('');
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>([]);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  useEffect(() => {
    if (!open) return;
    setName(''); setCode(''); setDescription(''); setShortform('');
    setCategoryId(''); setGroupId('');
    setCustomFields([]); setErr('');
  }, [open]);

  // Auto-generate code from name
  useEffect(() => { setCode(autoCode(name)); }, [name]);

  const availableGroups = groups.filter((g) => !categoryId || g.categoryId === categoryId);
  const levelLabel = level === 'category' ? 'Category' : level === 'group' ? 'Group' : 'Sub-group';

  function addCf() {
    if (customFields.length >= 10) return;
    setCustomFields((d) => [...d, { id: nextCfDraftId(), fieldKey: '', fieldType: 'text', fieldValue: '' }]);
  }
  function updateCf(i: number, k: keyof CustomFieldDraft, v: string) {
    setCustomFields((d) => d.map((r, j) => j === i ? { ...r, [k]: v } : r));
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (level === 'group'    && !categoryId) { setErr('Category is required.'); return; }
    if (level === 'subgroup' && !groupId)    { setErr('Group is required.'); return; }
    setSaving(true); setErr('');
    try {
      const finalCode = (code.trim() || autoCode(name)).toUpperCase();
      const payload: Record<string, unknown> = {
        name: name.trim(), code: finalCode,
        description: description.trim() || null,
        shortform: shortform.trim() || null,
      };
      let resource = 'fabErpItemCategory';
      if (level === 'group')    { resource = 'fabErpItemGroup';    payload.category_id = categoryId; }
      if (level === 'subgroup') { resource = 'fabErpItemSubgroup'; payload.group_id    = groupId; }

      const res = await fabMutate<{ ok: boolean; id: number }>(resource, 'insert', payload);

      for (let i = 0; i < customFields.length; i++) {
        const cf = customFields[i];
        if (!cf.fieldKey.trim()) continue;
        await fabMutate('fabErpCustomField', 'insert', {
          level, level_id: res.id,
          field_key: cf.fieldKey.trim(), field_type: cf.fieldType,
          field_value: cf.fieldValue.trim() || null, sort_order: i,
        });
      }

      await onCreated();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add {levelLabel}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {level === 'group' && (
          <Box>
            <Typography variant="caption" color="text.secondary">Category *</Typography>
            <Select fullWidth size="small" displayEmpty value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as number | '')}>
              <MenuItem value="" disabled><em>Select category…</em></MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </Box>
        )}

        {level === 'subgroup' && (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary">Category (filter)</Typography>
              <Select fullWidth size="small" displayEmpty value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value as number | ''); setGroupId(''); }}>
                <MenuItem value=""><em>All categories</em></MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Group *</Typography>
              <Select fullWidth size="small" displayEmpty value={groupId}
                onChange={(e) => setGroupId(e.target.value as number | '')}>
                <MenuItem value="" disabled><em>Select group…</em></MenuItem>
                {availableGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </Select>
            </Box>
          </>
        )}

        <TextField label={`${levelLabel} Name *`} value={name} size="small" fullWidth autoFocus
          onChange={(e) => setName(e.target.value)} />
        <TextField label="Code (auto-generated, editable)" value={code} size="small" fullWidth
          helperText="Unique identifier — auto-populated from name."
          onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <TextField label="Description" value={description} size="small" fullWidth multiline minRows={2}
          onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Shortform" value={shortform} size="small" fullWidth
          onChange={(e) => setShortform(e.target.value)} />

        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">Custom Fields ({customFields.length}/10)</Typography>
          <Button size="small" startIcon={<AddIcon />} disabled={customFields.length >= 10} onClick={addCf}>
            Add Field
          </Button>
        </Box>

        {customFields.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No custom fields yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 120 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Default Value</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {customFields.map((cf, i) => (
                <TableRow key={cf.id}>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField size="small" fullWidth value={cf.fieldKey} placeholder="e.g. Material Grade"
                      onChange={(e) => updateCf(i, 'fieldKey', e.target.value)} />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField select size="small" fullWidth value={cf.fieldType}
                      onChange={(e) => updateCf(i, 'fieldType', e.target.value)}>
                      <MenuItem value="text">Text</MenuItem>
                      <MenuItem value="number">Number</MenuItem>
                      <MenuItem value="date">Date</MenuItem>
                      <MenuItem value="dropdown">Dropdown</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField size="small" fullWidth value={cf.fieldValue}
                      placeholder={cf.fieldType === 'dropdown' ? 'Option1, Option2, …' : 'Default value…'}
                      onChange={(e) => updateCf(i, 'fieldValue', e.target.value)} />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <IconButton size="small" color="error"
                      onClick={() => setCustomFields((d) => d.filter((_, j) => j !== i))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : `Add ${levelLabel}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── TaxonomyDeleteDialog (cascade delete confirmation) ─────────────────────────

function TaxonomyDeleteDialog({ open, type, entity, groups, subgroups, onClose, onDeleted, setToast }: {
  open: boolean;
  type: 'category' | 'group' | 'subgroup' | null;
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup | null;
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  onClose: () => void;
  onDeleted: () => Promise<void>;
  setToast: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!entity || !type) return null;

  const affectedGroups = type === 'category'
    ? groups.filter((g) => g.categoryId === entity.id)
    : [];
  const affectedGroupIds = new Set(affectedGroups.map((g) => g.id));

  const affectedSubgroups = type === 'category'
    ? subgroups.filter((s) => affectedGroupIds.has(s.groupId))
    : type === 'group'
    ? subgroups.filter((s) => s.groupId === entity.id)
    : [];

  const levelLabel = type === 'category' ? 'Category' : type === 'group' ? 'Group' : 'Sub-group';

  async function handleDelete() {
    if (!entity || !type) return;
    setBusy(true);
    try {
      // Cascade: subgroups first, then groups, then the entity
      for (const s of affectedSubgroups) {
        await fabMutate('fabErpItemSubgroup', 'delete', { id: s.id });
      }
      for (const g of affectedGroups) {
        await fabMutate('fabErpItemGroup', 'delete', { id: g.id });
      }
      const resource = type === 'category' ? 'fabErpItemCategory'
                     : type === 'group'    ? 'fabErpItemGroup'
                                           : 'fabErpItemSubgroup';
      await fabMutate(resource, 'delete', { id: entity.id });
      setToast('Deleted.');
      await onDeleted();
    } catch (e) {
      setToast(errMsg(e));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {levelLabel}?</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete <strong>{entity.name}</strong>?
        </Typography>
        {(affectedGroups.length > 0 || affectedSubgroups.length > 0) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              The following will also be permanently deleted:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {affectedGroups.length > 0 && (
                <li>
                  <Typography variant="body2">
                    {affectedGroups.length} group{affectedGroups.length !== 1 ? 's' : ''}: {affectedGroups.map((g) => g.name).join(', ')}
                  </Typography>
                </li>
              )}
              {affectedSubgroups.length > 0 && (
                <li>
                  <Typography variant="body2">
                    {affectedSubgroups.length} sub-group{affectedSubgroups.length !== 1 ? 's' : ''}: {affectedSubgroups.map((s) => s.name).join(', ')}
                  </Typography>
                </li>
              )}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleDelete} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── CatalogDialog (add/edit catalog item) ─────────────────────────────────────

function CatalogDialog({ open, initial, categories, groups, subgroups, canManageTaxonomy, onClose, onSaved, refetchTaxonomy }: {
  open: boolean; initial: FabItemCatalog | null;
  categories: FabItemCategory[]; groups: FabItemGroup[]; subgroups: FabItemSubgroup[];
  canManageTaxonomy: boolean; onClose: () => void; onSaved: (code?: string) => void;
  refetchTaxonomy: () => Promise<void>;
}) {
  const isNew = !initial;
  const [draft,  setDraft]  = useState<ItemDraft>(BLANK_ITEM());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [addingLevel, setAddingLevel] = useState<'category' | 'group' | 'subgroup' | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>([]);
  useEffect(() => {
    if (!open) return;
    setCustomFields([]);
    setDraft(initial ? {
      name: initial.name, code: initial.code, unit: initial.unit ?? 'pcs',
      description: initial.description ?? '', categoryId: initial.categoryId ?? null,
      groupId: initial.groupId ?? null, subgroupId: initial.subgroupId ?? null,
      hsnCode: initial.hsnCode ?? '',
    } : BLANK_ITEM());
    setErr(''); setCategoryError(''); setAddingLevel(null);
  }, [open, initial]);

  const set = (k: keyof ItemDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const advancedFieldCount = ([draft.hsnCode] as string[]).filter((v) => v.trim() !== '').length;
  const availableGroups    = groups.filter((g) => !draft.categoryId || g.categoryId === draft.categoryId);
  const availableSubgroups = subgroups.filter((s) => !draft.groupId || s.groupId === draft.groupId);

  function onCategoryChange(value: string) {
    if (value === ADD_NEW) { setAddingLevel('category'); return; }
    setCategoryError('');
    const categoryId = value === '' ? null : Number(value);
    setDraft((d) => {
      const groupOk = d.groupId != null && groups.some((g) => g.id === d.groupId && g.categoryId === categoryId);
      return { ...d, categoryId, groupId: groupOk ? d.groupId : null, subgroupId: groupOk ? d.subgroupId : null };
    });
  }
  function onGroupChange(value: string) {
    if (value === ADD_NEW) { setAddingLevel('group'); return; }
    const groupId = value === '' ? null : Number(value);
    setDraft((d) => {
      const sgOk = d.subgroupId != null && subgroups.some((s) => s.id === d.subgroupId && s.groupId === groupId);
      return { ...d, groupId, subgroupId: sgOk ? d.subgroupId : null };
    });
  }
  function onSubgroupChange(value: string) {
    if (value === ADD_NEW) { setAddingLevel('subgroup'); return; }
    setDraft((d) => ({ ...d, subgroupId: value === '' ? null : Number(value) }));
  }
  async function handleTaxonomyCreated(level: 'category' | 'group' | 'subgroup', id: number) {
    await refetchTaxonomy(); setAddingLevel(null);
    if (level === 'category') setDraft((d) => ({ ...d, categoryId: id, groupId: null, subgroupId: null }));
    if (level === 'group')    setDraft((d) => ({ ...d, groupId: id, subgroupId: null }));
    if (level === 'subgroup') setDraft((d) => ({ ...d, subgroupId: id }));
  }

  function addCf() {
    if (customFields.length >= 10) return;
    setCustomFields((d) => [...d, { id: nextCfDraftId(), fieldKey: '', fieldType: 'text', fieldValue: '' }]);
  }
  function updateCf(i: number, k: keyof CustomFieldDraft, v: string) {
    setCustomFields((d) => d.map((r, j) => j === i ? { ...r, [k]: v } : r));
  }

  async function resolveDefaultGroup(categoryId: number): Promise<number> {
    const existing = await fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup', {
      filters: { categoryId, name: 'Default' },
      pagination: { limit: 1 },
    });
    if (existing.data?.[0]) return existing.data[0].id;
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpItemGroup', 'insert', {
        category_id: categoryId, name: 'Default', code: 'default', description: null, is_system: 0,
      });
      return res.id;
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        const retry = await fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup', {
          filters: { categoryId, name: 'Default' },
          pagination: { limit: 1 },
        });
        if (retry.data?.[0]) return retry.data[0].id;
      }
      throw e;
    }
  }

  async function resolveDefaultSubgroup(groupId: number): Promise<number> {
    const existing = await fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', {
      filters: { groupId, name: 'Default' },
      pagination: { limit: 1 },
    });
    if (existing.data?.[0]) return existing.data[0].id;
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpItemSubgroup', 'insert', {
        group_id: groupId, name: 'Default', code: 'default', description: null, is_system: 0,
      });
      return res.id;
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        const retry = await fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', {
          filters: { groupId, name: 'Default' },
          pagination: { limit: 1 },
        });
        if (retry.data?.[0]) return retry.data[0].id;
      }
      throw e;
    }
  }

  async function save() {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    if (!isNew && !draft.code.trim()) { setErr('Code is required.'); return; }
    if (!draft.categoryId) { setCategoryError('Category is required.'); return; }
    setCategoryError('');
    setSaving(true); setErr('');
    try {
      let groupId = draft.groupId;
      let subgroupId = draft.subgroupId;
      if (!groupId) groupId = await resolveDefaultGroup(draft.categoryId);
      if (groupId && !subgroupId) subgroupId = await resolveDefaultSubgroup(groupId);

      let itemCode = draft.code.trim().toUpperCase();
      if (isNew) {
        try {
          const codeRes = await fabPost<{ code: string }>('codegen/next-code', {
            entityType: 'item', context: { categoryId: draft.categoryId },
          });
          itemCode = codeRes.code.toUpperCase();
        } catch {
          setErr('Failed to generate item code. Please try again.');
          setSaving(false);
          return;
        }
      }

      const payload = {
        name: draft.name.trim(), code: itemCode,
        unit: draft.unit.trim() || 'pcs', description: draft.description.trim() || null,
        category_id: draft.categoryId, group_id: groupId, subgroup_id: subgroupId,
        hsn_code: draft.hsnCode.trim() || null,
      };
      let itemId = initial?.id;
      if (isNew) {
        const res = await fabMutate<{ ok: boolean; id: number }>('fabErpItemCatalog', 'insert', payload);
        itemId = res.id;
      } else {
        await fabMutate('fabErpItemCatalog', 'update', { id: initial!.id, ...payload });
      }

      try {
        for (let i = 0; i < customFields.length; i++) {
          const cf = customFields[i];
          if (!cf.fieldKey.trim()) continue;
          await fabMutate('fabErpCustomField', 'insert', {
            level: 'item', level_id: itemId,
            field_key: cf.fieldKey.trim(), field_type: cf.fieldType,
            field_value: cf.fieldValue.trim() || null, sort_order: i,
          });
        }
      } catch (cfErr) {
        setErr(`Item was saved, but a custom field failed to save: ${errMsg(cfErr)}`);
        setSaving(false);
        return;
      }

      onSaved(isNew ? itemCode : undefined);
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isNew ? 'Add Catalog Item' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Item Name" value={draft.name} size="small" required autoFocus sx={{ flex: 3 }}
            onChange={(e) => set('name', e.target.value)} />
          {!isNew && (
            <TextField label="Code" value={draft.code} size="small" sx={{ flex: 1 }}
              slotProps={{ input: { readOnly: true } }} />
          )}
          <Autocomplete freeSolo options={STANDARD_UOMS.map((u) => u.value)} sx={{ flex: 1 }}
            value={draft.unit}
            onInputChange={(_, value) => set('unit', value)}
            renderInput={(params) => <TextField {...params} label="Unit" size="small" placeholder="pcs" />} />
        </Box>
        <TextField label="Description (optional)" value={draft.description} size="small" fullWidth multiline minRows={2}
          onChange={(e) => set('description', e.target.value)} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Category *</Typography>
            <Select fullWidth size="small" displayEmpty value={draft.categoryId ?? ''}
              onChange={(e) => onCategoryChange(String(e.target.value))} error={!!categoryError}>
              <MenuItem value="">None</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              {canManageTaxonomy && <MenuItem value={ADD_NEW}><em>+ Add new…</em></MenuItem>}
            </Select>
            {categoryError && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{categoryError}</Typography>}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Group</Typography>
            <Select fullWidth size="small" displayEmpty value={draft.groupId ?? ''}
              onChange={(e) => onGroupChange(String(e.target.value))}>
              <MenuItem value="">None</MenuItem>
              {availableGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              {canManageTaxonomy && <MenuItem value={ADD_NEW}><em>+ Add new…</em></MenuItem>}
            </Select>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Sub-group</Typography>
            <Select fullWidth size="small" displayEmpty value={draft.subgroupId ?? ''}
              onChange={(e) => onSubgroupChange(String(e.target.value))}>
              <MenuItem value="">None</MenuItem>
              {availableSubgroups.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              {canManageTaxonomy && <MenuItem value={ADD_NEW}><em>+ Add new…</em></MenuItem>}
            </Select>
          </Box>
        </Box>
        {addingLevel === 'category' && (
          <TaxonomyAddForm level="category" categories={categories} groups={groups}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('category', id)} />
        )}
        {addingLevel === 'group' && (
          <TaxonomyAddForm level="group" categories={categories} groups={groups}
            defaultCategoryId={draft.categoryId}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('group', id)} />
        )}
        {addingLevel === 'subgroup' && (
          <TaxonomyAddForm level="subgroup" categories={categories} groups={groups}
            defaultCategoryId={draft.categoryId} defaultGroupId={draft.groupId}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('subgroup', id)} />
        )}

        <Accordion disableGutters elevation={0} variant="outlined" sx={{ '&::before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">
              Additional details
              {(advancedFieldCount + customFields.length) > 0 && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({advancedFieldCount + customFields.length} filled)
                </Typography>
              )}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField label="HSN Code" value={draft.hsnCode} size="small" sx={{ flex: '1 1 120px' }} onChange={(e) => set('hsnCode', e.target.value)} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Need to record weight, dimensions, barcode, or other specs? Add them below as Custom Fields.
            </Typography>

            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">Custom Fields ({customFields.length}/10)</Typography>
              <Button size="small" startIcon={<AddIcon />} disabled={customFields.length >= 10} onClick={addCf}>
                Add Field
              </Button>
            </Box>

            {customFields.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No custom fields yet.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 120 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Default Value</TableCell>
                    <TableCell sx={{ width: 48 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {customFields.map((cf, i) => (
                    <TableRow key={cf.id}>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField size="small" fullWidth value={cf.fieldKey} placeholder="e.g. Material Grade"
                          onChange={(e) => updateCf(i, 'fieldKey', e.target.value)} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField select size="small" fullWidth value={cf.fieldType}
                          onChange={(e) => updateCf(i, 'fieldType', e.target.value)}>
                          <MenuItem value="text">Text</MenuItem>
                          <MenuItem value="number">Number</MenuItem>
                          <MenuItem value="date">Date</MenuItem>
                          <MenuItem value="dropdown">Dropdown</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField size="small" fullWidth value={cf.fieldValue}
                          placeholder={cf.fieldType === 'dropdown' ? 'Option1, Option2, …' : 'Default value…'}
                          onChange={(e) => updateCf(i, 'fieldValue', e.target.value)} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <IconButton size="small" color="error"
                          onClick={() => setCustomFields((d) => d.filter((_, j) => j !== i))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || (!isNew && !draft.code.trim())}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── DeleteDialog (catalog items) ──────────────────────────────────────────────

function DeleteDialog({ item, onClose, onDeleted }: {
  item: FabItemCatalog | null; onClose: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!item) return;
    setBusy(true);
    try { await fabMutate('fabErpItemCatalog', 'delete', { id: item.id }); onDeleted(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Remove from Catalog</DialogTitle>
      <DialogContent>
        <Typography>
          Remove <strong>{item?.name}</strong> from the catalog?
          Existing BOM entries that reference it are unaffected.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── TaxonomyDetailDialog ──────────────────────────────────────────────────────

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: 'Text', number: 'Number', date: 'Date', dropdown: 'Dropdown',
};

function TaxonomyDetailDialog({ level, entity, categories, groups, canEdit, onClose, onSaved }: {
  level: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isSystem = entity.isSystem === 1;

  const [name, setName]               = useState(entity.name);
  const [code, setCode]               = useState(entity.code);
  const [description, setDescription] = useState(entity.description ?? '');
  const [shortform, setShortform]     = useState(entity.shortform ?? '');
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  const asCategory = level === 'category' ? (entity as FabItemCategory) : undefined;
  const [batchRequired, setBatchRequired]   = useState(asCategory?.batchRequired === 1);
  const [serialRequired, setSerialRequired] = useState(asCategory?.serialRequired === 1);
  const [heatRequired, setHeatRequired]     = useState(asCategory?.heatRequired === 1);
  const [markRequired, setMarkRequired]     = useState(asCategory?.markRequired === 1);

  const [ownFields,  setOwnFields]  = useState<FabCustomField[]>([]);
  const [ownDraft,   setOwnDraft]   = useState<CustomFieldDraft[]>([]);
  const [inherited,  setInherited]  = useState<InheritedField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);

  const parentGroup    = level === 'subgroup' ? groups.find((g) => g.id === (entity as FabItemSubgroup).groupId) : undefined;
  const parentCategory = level === 'group'    ? categories.find((c) => c.id === (entity as FabItemGroup).categoryId)
                       : level === 'subgroup'  ? categories.find((c) => c.id === parentGroup?.categoryId)
                       : undefined;

  useEffect(() => {
    setName(entity.name);
    setCode(entity.code);
    setDescription(entity.description ?? '');
    setShortform(entity.shortform ?? '');
    const cat = level === 'category' ? (entity as FabItemCategory) : undefined;
    setBatchRequired(cat?.batchRequired === 1);
    setSerialRequired(cat?.serialRequired === 1);
    setHeatRequired(cat?.heatRequired === 1);
    setMarkRequired(cat?.markRequired === 1);
    setErr('');
    loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  async function loadFields() {
    setLoadingFields(true);
    try {
      const ownRes = await fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', {
        filters: { level, levelId: entity.id },
        orderBy: [{ field: 'sortOrder', direction: 'asc' }],
        pagination: { limit: 100 },
      });
      const own = ownRes.data ?? [];
      setOwnFields(own);
      setOwnDraft(own.map((f) => ({
        id: f.id, fieldKey: f.fieldKey,
        fieldType: f.fieldType as CustomFieldDraft['fieldType'],
        fieldValue: f.fieldValue ?? '',
      })));

      // Load ancestor fields
      let inh: InheritedField[] = [];

      if (level === 'group') {
        const catId = (entity as FabItemGroup).categoryId;
        if (catId) {
          const res = await fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', {
            filters: { level: 'category', levelId: catId },
            orderBy: [{ field: 'sortOrder', direction: 'asc' }],
            pagination: { limit: 100 },
          });
          inh = (res.data ?? []).map((f) => ({
            fieldKey: f.fieldKey, fieldType: f.fieldType,
            fieldValue: f.fieldValue, source: 'category' as const,
          }));
        }
      } else if (level === 'subgroup') {
        const grpId = (entity as FabItemSubgroup).groupId;
        const grp   = groups.find((g) => g.id === grpId);
        const catId = grp?.categoryId;
        const [catRes, grpRes] = await Promise.all([
          catId ? fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', {
            filters: { level: 'category', levelId: catId },
            orderBy: [{ field: 'sortOrder', direction: 'asc' }],
            pagination: { limit: 100 },
          }) : Promise.resolve({ data: [] as FabCustomField[] }),
          grpId ? fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', {
            filters: { level: 'group', levelId: grpId },
            orderBy: [{ field: 'sortOrder', direction: 'asc' }],
            pagination: { limit: 100 },
          }) : Promise.resolve({ data: [] as FabCustomField[] }),
        ]);
        const map = new Map<string, InheritedField>(
          (catRes.data ?? []).map((f) => [f.fieldKey, {
            fieldKey: f.fieldKey, fieldType: f.fieldType, fieldValue: f.fieldValue, source: 'category' as const,
          }])
        );
        for (const gf of (grpRes.data ?? [])) {
          map.set(gf.fieldKey, { fieldKey: gf.fieldKey, fieldType: gf.fieldType, fieldValue: gf.fieldValue, source: 'group' as const });
        }
        inh = Array.from(map.values());
      }
      setInherited(inh);
    } finally {
      setLoadingFields(false);
    }
  }

  function addField() {
    if (ownDraft.length >= 10) return;
    setOwnDraft((d) => [...d, { id: nextCfDraftId(), fieldKey: '', fieldType: 'text', fieldValue: '' }]);
  }

  function updateField(i: number, k: keyof CustomFieldDraft, v: string) {
    setOwnDraft((d) => d.map((r, j) => j === i ? { ...r, [k]: v } : r));
  }

  function removeField(i: number) {
    setOwnDraft((d) => d.filter((_, j) => j !== i));
  }

  // Add or focus override for an inherited field
  function overrideInherited(f: InheritedField) {
    const existing = ownDraft.findIndex((d) => d.fieldKey === f.fieldKey);
    if (existing >= 0) return; // already in own draft
    setOwnDraft((d) => [
      ...d,
      {
        id: nextCfDraftId(),
        fieldKey: f.fieldKey,
        fieldType: f.fieldType as CustomFieldDraft['fieldType'],
        fieldValue: f.fieldValue ?? '',
      },
    ]);
  }

  async function save() {
    setSaving(true); setErr('');
    try {
      const resource = level === 'category' ? 'fabErpItemCategory'
                     : level === 'group'    ? 'fabErpItemGroup'
                                            : 'fabErpItemSubgroup';
      const payload: Record<string, unknown> = {
        id: entity.id,
        description: description.trim() || null,
        shortform: shortform.trim() || null,
      };
      if (!isSystem) {
        if (!name.trim() || !code.trim()) { setErr('Name and Code are required.'); setSaving(false); return; }
        payload.name = name.trim();
        payload.code = code.trim().toUpperCase();
      }
      if (level === 'category') {
        payload.batch_required = batchRequired ? 1 : 0;
        payload.serial_required = serialRequired ? 1 : 0;
        payload.heat_required = heatRequired ? 1 : 0;
        payload.mark_required = markRequired ? 1 : 0;
      }
      await fabMutate(resource, 'update', payload);

      const removedIds = ownFields.filter((f) => !ownDraft.find((d) => d.id === f.id)).map((f) => f.id);
      for (const rid of removedIds) {
        await fabMutate('fabErpCustomField', 'delete', { id: rid });
      }

      for (let i = 0; i < ownDraft.length; i++) {
        const d = ownDraft[i];
        if (!d.fieldKey.trim()) continue;
        if (d.id < 0) {
          await fabMutate('fabErpCustomField', 'insert', {
            level, level_id: entity.id,
            field_key: d.fieldKey.trim(), field_type: d.fieldType,
            field_value: d.fieldValue.trim() || null, sort_order: i,
          });
        } else {
          await fabMutate('fabErpCustomField', 'update', {
            id: d.id, field_key: d.fieldKey.trim(), field_type: d.fieldType,
            field_value: d.fieldValue.trim() || null, sort_order: i,
          });
        }
      }

      await onSaved();
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  const levelLabel = level === 'category' ? 'Category' : level === 'group' ? 'Group' : 'Sub-group';

  // Set of fieldKeys that have a local override in ownDraft
  const overriddenKeys = new Set(
    ownDraft
      .filter((d) => inherited.some((inh) => inh.fieldKey === d.fieldKey))
      .map((d) => d.fieldKey)
  );

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {levelLabel}: {entity.name}
        {isSystem && <Box component="span" sx={{ ml: 1, display: 'inline-block' }}><StatusBadge status="System" family="info" /></Box>}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {/* Parent breadcrumb */}
        {(parentCategory || parentGroup) && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {parentCategory && (
              <Chip label={`Category: ${parentCategory.name}`} size="small" variant="outlined" />
            )}
            {parentGroup && (
              <Chip label={`Group: ${parentGroup.name}`} size="small" variant="outlined" />
            )}
          </Box>
        )}

        {/* Name / Code / Description */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Name" value={name} size="small" sx={{ flex: 2 }}
            disabled={!canEdit || isSystem}
            onChange={(e) => setName(e.target.value)} />
          <TextField label="Code" value={code} size="small" sx={{ flex: 1 }}
            disabled={!canEdit || isSystem}
            onChange={(e) => setCode(e.target.value)} />
        </Box>
        <TextField label="Description" value={description} size="small" fullWidth multiline minRows={2}
          disabled={!canEdit}
          onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Shortform" value={shortform} size="small" fullWidth
          disabled={!canEdit}
          onChange={(e) => setShortform(e.target.value)} />

        {/* Traceability requirements — Category ("Item Type") level only */}
        {level === 'category' && (
          <>
            <Divider />
            <Typography variant="subtitle2">Traceability required for items in this Category</Typography>
            <FormGroup row>
              <FormControlLabel disabled={!canEdit} label="Batch no."
                control={<Checkbox checked={batchRequired} onChange={(e) => setBatchRequired(e.target.checked)} />} />
              <FormControlLabel disabled={!canEdit} label="Serial no."
                control={<Checkbox checked={serialRequired} onChange={(e) => setSerialRequired(e.target.checked)} />} />
              <FormControlLabel disabled={!canEdit} label="Heat no."
                control={<Checkbox checked={heatRequired} onChange={(e) => setHeatRequired(e.target.checked)} />} />
              <FormControlLabel disabled={!canEdit} label="Mark no."
                control={<Checkbox checked={markRequired} onChange={(e) => setMarkRequired(e.target.checked)} />} />
            </FormGroup>
            <Typography variant="caption" color="text.secondary">
              Items in this Category must have these identifiers when received or issued. Each item can override this in its own Item Details.
            </Typography>
          </>
        )}

        {/* Inherited fields from ancestors */}
        {!loadingFields && inherited.length > 0 && (
          <>
            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Inherited from parent ({inherited.length} field{inherited.length !== 1 ? 's' : ''})
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 100 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Effective Default</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 110 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 160 }}>Override at this level</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inherited.map((f) => {
                  const overrideIdx = ownDraft.findIndex((d) => d.fieldKey === f.fieldKey);
                  const isOverridden = overrideIdx >= 0;
                  return (
                    <TableRow key={f.fieldKey}>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{f.fieldKey}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{FIELD_TYPE_LABEL[f.fieldType] ?? f.fieldType}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={isOverridden ? { textDecoration: 'line-through', color: 'text.disabled' } : undefined}
                        >
                          {f.fieldValue ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={f.source === 'category' ? 'Category' : 'Group'}
                          family={f.source === 'category' ? 'neutral' : 'info'}
                        />
                      </TableCell>
                      <TableCell>
                        {isOverridden ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <TextField
                              size="small"
                              value={ownDraft[overrideIdx].fieldValue}
                              disabled={!canEdit}
                              sx={{ flex: 1, minWidth: 80 }}
                              placeholder="Override value…"
                              onChange={(e) => updateField(overrideIdx, 'fieldValue', e.target.value)}
                            />
                            {canEdit && (
                              <Tooltip title="Remove override">
                                <IconButton size="small" color="error" onClick={() => removeField(overrideIdx)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        ) : canEdit ? (
                          <Button size="small" variant="outlined" onClick={() => overrideInherited(f)}>
                            Override
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        {/* Own custom fields */}
        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">
            Custom Fields at this {levelLabel} ({ownDraft.length}/10)
          </Typography>
          {canEdit && (
            <Button size="small" startIcon={<AddIcon />}
              disabled={ownDraft.length >= 10} onClick={addField}>
              Add Field
            </Button>
          )}
        </Box>

        {loadingFields ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
        ) : ownDraft.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No custom fields at this level yet.{canEdit ? ' Add up to 10 or override inherited fields above.' : ''}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 130 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Default Value</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>Note</TableCell>
                {canEdit && <TableCell sx={{ width: 48 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {ownDraft.map((d, i) => (
                <TableRow key={d.id}>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField size="small" fullWidth value={d.fieldKey} disabled={!canEdit}
                      placeholder="e.g. Material Grade"
                      onChange={(e) => updateField(i, 'fieldKey', e.target.value)} />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField select size="small" fullWidth value={d.fieldType} disabled={!canEdit}
                      onChange={(e) => updateField(i, 'fieldType', e.target.value)}>
                      <MenuItem value="text">Text</MenuItem>
                      <MenuItem value="number">Number</MenuItem>
                      <MenuItem value="date">Date</MenuItem>
                      <MenuItem value="dropdown">Dropdown</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField size="small" fullWidth value={d.fieldValue} disabled={!canEdit}
                      placeholder={d.fieldType === 'dropdown' ? 'Option1, Option2, …' : 'Default value…'}
                      onChange={(e) => updateField(i, 'fieldValue', e.target.value)} />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {overriddenKeys.has(d.fieldKey) && (
                      <StatusBadge status="Override" family="warning" />
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell sx={{ py: 0.5 }}>
                      <IconButton size="small" color="error" onClick={() => removeField(i)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {canEdit && (
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────

function CategoriesTab({ categories, onRowClick, onAddClick, onDeleteClick, canEdit }: {
  categories: FabItemCategory[];
  onRowClick: (c: FabItemCategory) => void;
  onAddClick: () => void;
  onDeleteClick: (c: FabItemCategory) => void;
  canEdit: boolean;
}) {
  return (
    <Box>
      {canEdit && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddClick}>
            Add category
          </Button>
        </Box>
      )}
      {categories.length === 0 ? (
        <EmptyState title="No categories yet" />
      ) : (
        <EntityList>
          {categories.map((c) => (
            <EntityRow
              key={c.id}
              code={<Mono chip>{c.code}</Mono>}
              primary={c.name}
              secondary={[c.description, c.shortform ? `Shortform: ${c.shortform}` : undefined].filter(Boolean).join(' · ') || undefined}
              trailing={c.isSystem === 1 ? <StatusBadge status="System" family="info" /> : undefined}
              onClick={() => onRowClick(c)}
              actions={canEdit && c.isSystem === 0 ? (
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDeleteClick(c)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              ) : undefined}
            />
          ))}
        </EntityList>
      )}
    </Box>
  );
}

// ── GroupsTab ─────────────────────────────────────────────────────────────────

function GroupsTab({ categories, groups, onRowClick, onAddClick, onDeleteClick, canEdit }: {
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  onRowClick: (g: FabItemGroup) => void;
  onAddClick: () => void;
  onDeleteClick: (g: FabItemGroup) => void;
  canEdit: boolean;
}) {
  const [filterCatId, setFilterCatId] = useState<number | ''>('');

  const visible = useMemo(
    () => groups.filter((g) => !filterCatId || g.categoryId === filterCatId),
    [groups, filterCatId],
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Box sx={{ width: 220 }}>
          <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>Filter by category</Typography>
          <Select fullWidth size="small" displayEmpty value={filterCatId}
            onChange={(e) => setFilterCatId(e.target.value as number | '')}>
            <MenuItem value="">All categories</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </Box>
        {canEdit && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddClick}>
            Add group
          </Button>
        )}
      </Box>
      {visible.length === 0 ? (
        <EmptyState title="No groups found" />
      ) : (
        <EntityList>
          {visible.map((g) => (
            <EntityRow
              key={g.id}
              code={<Mono chip>{g.code}</Mono>}
              primary={g.name}
              secondary={[g.categoryName, g.description, g.shortform ? `Shortform: ${g.shortform}` : undefined].filter(Boolean).join(' · ') || undefined}
              trailing={g.isSystem === 1 ? <StatusBadge status="System" family="info" /> : undefined}
              onClick={() => onRowClick(g)}
              actions={canEdit && g.isSystem === 0 ? (
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDeleteClick(g)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              ) : undefined}
            />
          ))}
        </EntityList>
      )}
    </Box>
  );
}

// ── SubgroupsTab ──────────────────────────────────────────────────────────────

function SubgroupsTab({ categories, groups, subgroups, onRowClick, onAddClick, onDeleteClick, canEdit }: {
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  onRowClick: (s: FabItemSubgroup) => void;
  onAddClick: () => void;
  onDeleteClick: (s: FabItemSubgroup) => void;
  canEdit: boolean;
}) {
  const [filterCatId, setFilterCatId] = useState<number | ''>('');
  const [filterGrpId, setFilterGrpId] = useState<number | ''>('');

  const visibleGroups = useMemo(
    () => groups.filter((g) => !filterCatId || g.categoryId === filterCatId),
    [groups, filterCatId],
  );

  const visible = useMemo(() => {
    return subgroups.filter((s) => {
      if (filterGrpId && s.groupId !== filterGrpId) return false;
      if (filterCatId) {
        const grp = groups.find((g) => g.id === s.groupId);
        if (!grp || grp.categoryId !== filterCatId) return false;
      }
      return true;
    });
  }, [subgroups, groups, filterCatId, filterGrpId]);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ width: 220 }}>
            <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>Filter by category</Typography>
            <Select fullWidth size="small" displayEmpty value={filterCatId}
              onChange={(e) => { setFilterCatId(e.target.value as number | ''); setFilterGrpId(''); }}>
              <MenuItem value="">All categories</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ width: 220 }}>
            <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>Filter by group</Typography>
            <Select fullWidth size="small" displayEmpty value={filterGrpId}
              onChange={(e) => setFilterGrpId(e.target.value as number | '')}>
              <MenuItem value="">All groups</MenuItem>
              {visibleGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </Box>
        </Box>
        {canEdit && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddClick}>
            Add sub-group
          </Button>
        )}
      </Box>
      {visible.length === 0 ? (
        <EmptyState title="No sub-groups found" />
      ) : (
        <EntityList>
          {visible.map((s) => {
            const grp = groups.find((g) => g.id === s.groupId);
            const cat = grp ? categories.find((c) => c.id === grp.categoryId) : undefined;
            return (
              <EntityRow
                key={s.id}
                code={<Mono chip>{s.code}</Mono>}
                primary={s.name}
                secondary={[cat?.name, s.groupName ?? grp?.name, s.description, s.shortform ? `Shortform: ${s.shortform}` : undefined].filter(Boolean).join(' · ') || undefined}
                trailing={s.isSystem === 1 ? <StatusBadge status="System" family="info" /> : undefined}
                onClick={() => onRowClick(s)}
                actions={canEdit && s.isSystem === 0 ? (
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDeleteClick(s)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                ) : undefined}
              />
            );
          })}
        </EntityList>
      )}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TaxonomyDetailState = {
  level: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
} | null;

type TaxonomyDeleteState = {
  type: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
} | null;

export default function ItemCatalog() {
  const canManage         = usePermission('fab_erp_items_meta_manage');
  const canManageTaxonomy = usePermission('fab_erp_taxonomy_manage');
  const navigate          = useNavigate();
  const { company }       = useParams<{ company: string }>();

  const [items,   setItems]   = useState<FabItemCatalog[]>([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const { toast } = useToast();
  const [pageTab, setPageTab] = useState(0);

  const [dlg,     setDlg]    = useState<{ open: boolean; item: FabItemCatalog | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<FabItemCatalog | null>(null);
  const [taxonomyDetail, setTaxonomyDetail] = useState<TaxonomyDetailState>(null);

  // Add taxonomy dialog
  const [addTaxonomyLevel, setAddTaxonomyLevel] = useState<'category' | 'group' | 'subgroup' | null>(null);

  // Delete taxonomy dialog (with cascade)
  const [taxonomyDelete, setTaxonomyDelete] = useState<TaxonomyDeleteState>(null);

  const [categories, setCategories] = useState<FabItemCategory[]>([]);
  const [groups,     setGroups]     = useState<FabItemGroup[]>([]);
  const [subgroups,  setSubgroups]  = useState<FabItemSubgroup[]>([]);

  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('');
  const [filterGroupId,    setFilterGroupId]    = useState<number | ''>('');
  const [filterSubgroupId, setFilterSubgroupId] = useState<number | ''>('');

  // Per-column text filters shown in a filter row under the table header
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // Drag-to-resize column widths, persisted per browser
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTH_STORAGE_KEY);
      if (saved) return { ...DEFAULT_ITEM_COL_WIDTH, ...JSON.parse(saved) };
    } catch { /* ignore malformed storage */ }
    return { ...DEFAULT_ITEM_COL_WIDTH };
  });
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const next = Math.max(MIN_COL_WIDTH, r.startWidth + (e.clientX - r.startX));
    setColWidths((w) => ({ ...w, [r.key]: next }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    setColWidths((w) => {
      try { localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(w)); } catch { /* ignore */ }
      return w;
    });
  }, [handleResizeMove]);

  const handleResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [colWidths, handleResizeMove, handleResizeEnd]);

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', {
        orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 20000 },
      });
      setItems(res.data ?? []);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, []);

  const refetchTaxonomy = useCallback(async () => {
    try {
      const [catRes, grpRes, subRes] = await Promise.all([
        fabQuery<{ data: FabItemCategory[] }>('fabErpItemCategory', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
        fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup',       { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
        fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 5000 } }),
      ]);
      setCategories(catRes.data ?? []);
      setGroups(grpRes.data ?? []);
      setSubgroups(subRes.data ?? []);
    } catch { /* supplementary — ignore */ }
  }, []);

  useEffect(() => { fetchAll(); refetchTaxonomy(); }, [fetchAll, refetchTaxonomy]);

  const filtered = useMemo(() => items.filter((it) => {
    const matchSearch = !search
      || it.name.toLowerCase().includes(search.toLowerCase())
      || it.code.toLowerCase().includes(search.toLowerCase());
    const matchColFilters = ITEM_COLUMNS.every((col) => {
      const needle = colFilters[col.key as string]?.trim().toLowerCase();
      if (!needle) return true;
      const raw = (it as unknown as Record<string, unknown>)[col.key as string];
      return String(raw ?? '').toLowerCase().includes(needle);
    });
    return matchSearch && matchColFilters
      && (!filterCategoryId || it.categoryId === filterCategoryId)
      && (!filterGroupId    || it.groupId    === filterGroupId)
      && (!filterSubgroupId || it.subgroupId === filterSubgroupId);
  }), [items, search, colFilters, filterCategoryId, filterGroupId, filterSubgroupId]);

  const { sortedRows, sortKey, sortDirection, requestSort } = useSortableData(filtered, 'name');

  const filterGroupOptions    = groups.filter((g) => !filterCategoryId || g.categoryId === filterCategoryId);
  const filterSubgroupOptions = subgroups.filter((s) => !filterGroupId || s.groupId === filterGroupId);

  // ── Import / Export ──────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting]       = useState(false);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<ImportItemsResult | null>(null);
  const [importErr, setImportErr]       = useState('');

  async function downloadTemplate() {
    setExporting(true);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(`${API_HOST}/api/${companySlug}/fab_erp/items/export-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Item_Catalog_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true); setImportErr(''); setImportResult(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportItemsResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/items/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      await Promise.all([fetchAll(), refetchTaxonomy()]);
    } catch (e) {
      setImportErr(errMsg(e));
    } finally {
      setImporting(false);
    }
  }

  function onFilterCategoryChange(value: string) {
    const id = value === '' ? '' : Number(value);
    setFilterCategoryId(id);
    if (filterGroupId && !groups.some((g) => g.id === filterGroupId && g.categoryId === id)) {
      setFilterGroupId(''); setFilterSubgroupId('');
    }
  }
  function onFilterGroupChange(value: string) {
    const id = value === '' ? '' : Number(value);
    setFilterGroupId(id);
    if (filterSubgroupId && !subgroups.some((s) => s.id === filterSubgroupId && s.groupId === id)) {
      setFilterSubgroupId('');
    }
  }

  function onSaved(code?: string) { setDlg({ open: false, item: null }); toast(code ? `Item created — code: ${code}` : 'Saved.'); fetchAll(); }
  function onDeleted() { setDelItem(null); toast('Removed.'); fetchAll(); }

  const handleTaxonomyRowClick = (
    level: 'category' | 'group' | 'subgroup',
    entity: FabItemCategory | FabItemGroup | FabItemSubgroup,
  ) => setTaxonomyDetail({ level, entity });

  const itemsTotalWidth = ITEM_COLUMNS.reduce((sum, col) => sum + colWidths[col.key as string], 0)
    + BATCHES_COL_WIDTH + (canManage ? ACTIONS_COL_WIDTH : 0);

  const renderItemRow = useCallback(({ index, style }: ListChildComponentProps) => {
    const it = sortedRows[index];
    return (
      <Box
        style={style}
        sx={{
          display: 'flex', alignItems: 'center', cursor: 'pointer',
          borderBottom: '1px solid var(--c-divider)', '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => navigate(`/${company}/fab_erp/item-catalog/${it.id}`)}
      >
        <Box sx={{ ...TD, width: colWidths.name, minWidth: colWidths.name, flex: '0 0 auto', boxSizing: 'border-box', px: 2, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</Box>
        <Box sx={{ ...TD, width: colWidths.code, minWidth: colWidths.code, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}><Mono chip>{it.code}</Mono></Box>
        <Box sx={{ ...TD, width: colWidths.unit, minWidth: colWidths.unit, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}>{it.unit ?? 'pcs'}</Box>
        <Box sx={{ ...TD, width: colWidths.description, minWidth: colWidths.description, flex: '0 0 auto', boxSizing: 'border-box', px: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }}>{it.description ?? '—'}</Box>
        <Box sx={{ ...TD, width: colWidths.categoryName, minWidth: colWidths.categoryName, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}>{it.categoryName ?? '—'}</Box>
        <Box sx={{ ...TD, width: colWidths.groupName, minWidth: colWidths.groupName, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}>{it.groupName ?? '—'}</Box>
        <Box sx={{ ...TD, width: colWidths.subgroupName, minWidth: colWidths.subgroupName, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}>{it.subgroupName ?? '—'}</Box>
        <Box sx={{ ...TD, width: colWidths.hsnCode, minWidth: colWidths.hsnCode, flex: '0 0 auto', boxSizing: 'border-box', px: 2 }}>{it.hsnCode ?? '—'}</Box>
        <Box sx={{ width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
          <Tooltip title="View batches">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/${company}/fab_erp/item-batches?itemId=${it.id}`); }}>
              <ListAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        {canManage && (
          <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', justifyContent: 'flex-end', px: 1 }}>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDlg({ open: true, item: it }); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove">
              <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelItem(it); }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    );
  }, [sortedRows, canManage, navigate, company, colWidths]);

  return (
    <Box>
      <PageHeader
        title="Item Catalog"
        subtitle="Reusable parts and materials — pick from here when building a project BOM"
        actions={pageTab === 0 && canManage ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined" size="small" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
              onClick={downloadTemplate} disabled={exporting}
            >
              Export template
            </Button>
            <Button
              variant="outlined" size="small" startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
              onClick={() => importFileRef.current?.click()} disabled={importing}
            >
              Import items
            </Button>
            <input
              ref={importFileRef} type="file" accept=".xlsx" hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={() => setDlg({ open: true, item: null })}>
              Add item
            </Button>
          </Box>
        ) : undefined}
      />

      {importErr && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportErr('')}>{importErr}</Alert>}

      {/* Page tabs */}
      <Tabs value={pageTab} onChange={(_, v) => setPageTab(v)} sx={{ mb: 3, borderBottom: '1px solid var(--c-divider)' }}>
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Items<InfoTooltip content={INFO_ITEMS} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Category<InfoTooltip content={INFO_CATEGORY} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Group<InfoTooltip content={INFO_GROUP} placement="bottom" /></Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>Sub-group<InfoTooltip content={INFO_SUBGROUP} placement="bottom" /></Box>} />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Tab 0: Items ── */}
      {pageTab === 0 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              placeholder="Search by name or code…" value={search} size="small" sx={{ width: 300 }}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            />
            <Box sx={{ width: 180 }}>
              <Typography variant="caption" color="text.secondary">Category</Typography>
              <Select fullWidth size="small" displayEmpty value={filterCategoryId}
                onChange={(e) => onFilterCategoryChange(String(e.target.value))}>
                <MenuItem value="">All</MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </Box>
            <Box sx={{ width: 180 }}>
              <Typography variant="caption" color="text.secondary">Group</Typography>
              <Select fullWidth size="small" displayEmpty value={filterGroupId}
                onChange={(e) => onFilterGroupChange(String(e.target.value))}>
                <MenuItem value="">All</MenuItem>
                {filterGroupOptions.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </Select>
            </Box>
            <Box sx={{ width: 180 }}>
              <Typography variant="caption" color="text.secondary">Sub-group</Typography>
              <Select fullWidth size="small" displayEmpty value={filterSubgroupId}
                onChange={(e) => setFilterSubgroupId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">All</MenuItem>
                {filterSubgroupOptions.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </Box>
          </Box>

          {loading ? (
            <ListSkeleton rows={6} />
          ) : sortedRows.length === 0 ? (
            <EmptyState
              icon={<Inventory2Icon />}
              title={search ? 'No items match your search' : 'Catalog is empty'}
              action={!search && canManage ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, item: null })}>Add first item</Button>
              ) : undefined}
            />
          ) : (
            <Surface e={1} sx={{ overflowX: 'auto', p: 0 }}>
              <Box sx={{ width: itemsTotalWidth, minWidth: itemsTotalWidth }}>
                {/* Header — widths come from colWidths so drag-resize stays aligned with the virtualized rows below */}
                <Box sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-2)' }}>
                  {ITEM_COLUMNS.map((col) => (
                    <Box key={String(col.key)} sx={{
                      ...col.sx, width: colWidths[col.key as string], minWidth: colWidths[col.key as string],
                      flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', alignItems: 'center', position: 'relative',
                      justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start', px: 2, py: 1,
                    }}>
                      <TableSortLabel active={sortKey === col.key} direction={sortDirection} onClick={() => requestSort(col.key)}>
                        {col.label}
                      </TableSortLabel>
                      <Box
                        onMouseDown={(e) => handleResizeStart(col.key as string, e)}
                        sx={{
                          position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize',
                          zIndex: 1, '&:hover': { bgcolor: 'primary.main', opacity: 0.5 },
                        }}
                      />
                    </Box>
                  ))}
                  <Box sx={{ ...TH, width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1, py: 1 }}>Batches</Box>
                  {canManage && <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto' }} />}
                </Box>

                {/* Filter row — one text filter per column, ANDed with the search box and taxonomy filters above */}
                <Box sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-1)', alignItems: 'center' }}>
                  {ITEM_COLUMNS.map((col) => (
                    <Box key={String(col.key)} sx={{
                      width: colWidths[col.key as string], minWidth: colWidths[col.key as string],
                      flex: '0 0 auto', boxSizing: 'border-box', px: 1, py: 0.5,
                    }}>
                      <TextField
                        placeholder="Filter…" value={colFilters[col.key as string] ?? ''} size="small" fullWidth
                        variant="standard"
                        onChange={(e) => setColFilters((f) => ({ ...f, [col.key as string]: e.target.value }))}
                        slotProps={{ input: { sx: { fontSize: 12 } } }}
                      />
                    </Box>
                  ))}
                  <Box sx={{ width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto' }} />
                  {canManage && <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto' }} />}
                </Box>

                {/* Virtualized body — only rows in view are ever mounted, regardless of item count */}
                <FixedSizeList
                  height={Math.min(sortedRows.length * ROW_HEIGHT, 640)}
                  width={itemsTotalWidth}
                  itemCount={sortedRows.length}
                  itemSize={ROW_HEIGHT}
                >
                  {renderItemRow}
                </FixedSizeList>
              </Box>
            </Surface>
          )}
        </>
      )}

      {/* ── Tab 1: Category ── */}
      {pageTab === 1 && (
        <CategoriesTab
          categories={categories}
          canEdit={canManageTaxonomy}
          onRowClick={(c) => handleTaxonomyRowClick('category', c)}
          onAddClick={() => setAddTaxonomyLevel('category')}
          onDeleteClick={(c) => setTaxonomyDelete({ type: 'category', entity: c })}
        />
      )}

      {/* ── Tab 2: Group ── */}
      {pageTab === 2 && (
        <GroupsTab
          categories={categories} groups={groups}
          canEdit={canManageTaxonomy}
          onRowClick={(g) => handleTaxonomyRowClick('group', g)}
          onAddClick={() => setAddTaxonomyLevel('group')}
          onDeleteClick={(g) => setTaxonomyDelete({ type: 'group', entity: g })}
        />
      )}

      {/* ── Tab 3: Sub-group ── */}
      {pageTab === 3 && (
        <SubgroupsTab
          categories={categories} groups={groups} subgroups={subgroups}
          canEdit={canManageTaxonomy}
          onRowClick={(s) => handleTaxonomyRowClick('subgroup', s)}
          onAddClick={() => setAddTaxonomyLevel('subgroup')}
          onDeleteClick={(s) => setTaxonomyDelete({ type: 'subgroup', entity: s })}
        />
      )}

      {/* ── Dialogs ── */}
      <CatalogDialog
        open={dlg.open} initial={dlg.item}
        categories={categories} groups={groups} subgroups={subgroups}
        canManageTaxonomy={canManageTaxonomy}
        onClose={() => setDlg({ open: false, item: null })}
        onSaved={onSaved}
        refetchTaxonomy={refetchTaxonomy}
      />
      <DeleteDialog item={delItem} onClose={() => setDelItem(null)} onDeleted={onDeleted} />

      {taxonomyDetail && (
        <TaxonomyDetailDialog
          level={taxonomyDetail.level}
          entity={taxonomyDetail.entity}
          categories={categories}
          groups={groups}
          canEdit={canManageTaxonomy}
          onClose={() => setTaxonomyDetail(null)}
          onSaved={async () => { await refetchTaxonomy(); toast('Saved.'); }}
        />
      )}

      <AddTaxonomyDialog
        open={addTaxonomyLevel !== null}
        level={addTaxonomyLevel ?? 'category'}
        categories={categories}
        groups={groups}
        onClose={() => setAddTaxonomyLevel(null)}
        onCreated={async () => {
          await refetchTaxonomy();
          setAddTaxonomyLevel(null);
          toast('Added.');
        }}
      />

      <TaxonomyDeleteDialog
        open={taxonomyDelete !== null}
        type={taxonomyDelete?.type ?? null}
        entity={taxonomyDelete?.entity ?? null}
        groups={groups}
        subgroups={subgroups}
        onClose={() => setTaxonomyDelete(null)}
        onDeleted={async () => {
          setTaxonomyDelete(null);
          await refetchTaxonomy();
        }}
        setToast={toast}
      />

      {/* Import result summary */}
      <Dialog open={importResult !== null} onClose={() => setImportResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          Import Complete
        </DialogTitle>
        <DialogContent dividers>
          {importResult && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <StatusBadge status={`${importResult.itemsCreated} item(s) created`} family="success" />
                {importResult.itemsSkipped > 0 && <StatusBadge status={`${importResult.itemsSkipped} skipped (duplicate code)`} family="warning" />}
                {importResult.categoriesCreated > 0 && <StatusBadge status={`${importResult.categoriesCreated} new Category`} family="neutral" />}
                {importResult.groupsCreated > 0 && <StatusBadge status={`${importResult.groupsCreated} new Group`} family="neutral" />}
                {importResult.subgroupsCreated > 0 && <StatusBadge status={`${importResult.subgroupsCreated} new Sub-group`} family="neutral" />}
              </Box>
              {importResult.warnings.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Warnings</Typography>
                  <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto', bgcolor: 'background.default', borderRadius: 1 }}>
                    {importResult.warnings.map((w, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemText
                          primaryTypographyProps={{ variant: 'caption' }}
                          primary={`Row ${w.row}: ${w.message}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {importResult?.reportBase64 && (
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => downloadBase64Xlsx(importResult.reportBase64!, 'Item_Import_Log.xlsx')}
            >
              Download import log
            </Button>
          )}
          <Button onClick={() => setImportResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
