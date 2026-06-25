import React, { useState, useEffect, useCallback, useRef, Component } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon          from '@mui/icons-material/Add';
import EditIcon         from '@mui/icons-material/Edit';
import OpenInNewIcon    from '@mui/icons-material/OpenInNew';
import DeleteIcon       from '@mui/icons-material/Delete';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StarIcon         from '@mui/icons-material/Star';
import StarBorderIcon   from '@mui/icons-material/StarBorder';
import NoteAddIcon      from '@mui/icons-material/NoteAdd';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';

import { fabQuery, fabMutate, fabGet, fabPost } from '../api/client';
import type { FabMaterialBom, FabMaterialBomItem, FabItemCatalog } from '../types';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────
// INFO_TOOLTIP — update this block whenever features in BomDesigner change.
// Two constants: one for the BOM structure itself, one for the Routing Plans
// sub-section. Keep bullets in sync with what the UI actually does.
// ─────────────────────────────────────────────────────────────────────────────

const INFO_BOM: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'A Bill of Materials (BOM) lists every component or sub-assembly needed to make one unit of this item.',
    ],
  },
  {
    heading: 'Item categories',
    items: [
      'component (blue dot) — purchased input; no further BOM.',
      'mfg (purple dot) — manufactured sub-assembly; has its own BOM — click the row to expand it inline.',
      'co_product / by_product — additional outputs produced alongside the main item.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Tabs at the top = BOM versions. Star icon sets a tab as the default.',
      '+ Version button creates a new revision (e.g. Rev B).',
      'Edit button — enter edit mode to add, change, or remove rows; set qty and unit; Save to commit.',
      'NoteAdd icon (on mfg rows without a BOM) — create a BOM for that sub-item directly from here.',
      '+ icon inside the item picker — create a brand-new catalog item on the fly.',
    ],
  },
];

const INFO_ROUTING: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'A routing plan is the ordered sequence of manufacturing operations for this BOM.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Add Route — type a name and confirm; opens the visual route builder.',
      'Edit button — re-open the builder to add / reorder steps or link resource types.',
      'A BOM can have multiple routes (e.g. Standard, Rework); only Released routes are used in scheduling.',
      'Status badges: Draft → Released → Superseded / Archived.',
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BomDesignerProps {
  catalogItemId:    number;
  catalogItemName:  string;
  catalogItemCode?: string;
  catalogItemUnit?: string;
  mode?: 'edit' | 'readonly';
}

interface EditTarget {
  bomId:            number;
  bom:              FabMaterialBom;
  catalogItemId:    number;
  catalogItemName:  string;
  catalogItemCode?: string;
  catalogItemUnit?: string;
}

interface CatalogOption {
  id:   number;
  name: string;
  code: string;
  unit: string | null;
}

// ─── Visual constants ─────────────────────────────────────────────────────────

const CATEGORY = {
  component:  { bg: '#B5D4F4', border: '#185FA5', label: 'Input material (purchased)'    },
  mfg:        { bg: '#EEEDFE', border: '#534AB7', label: 'Input material (manufactured)' },
  co_product: { bg: '#C0DD97', border: '#3B6D11', label: 'Co-product output'             },
  by_product: { bg: '#FAC775', border: '#854F0B', label: 'By-product output'             },
} as const;

const ITEM_CAT_LABELS: Record<string, string> = {
  component:  'Input material',
  co_product: 'Co-product',
  by_product: 'By-product',
};

function Dot({ type }: { type: string }) {
  const s = CATEGORY[type as keyof typeof CATEGORY] ?? { bg: '#E0E0E0', border: '#9E9E9E' };
  return (
    <Box sx={{
      width: 10, height: 10, borderRadius: '3px', flexShrink: 0,
      bgcolor: s.bg, border: `1.5px solid ${s.border}`,
    }} />
  );
}

function fmt(n: number | string): string {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : parseFloat(num.toFixed(4)).toString();
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      px: 1.5, py: 1, mb: 1.5,
      bgcolor: 'background.default', border: '0.5px solid', borderColor: 'divider', borderRadius: 2,
    }}>
      <Typography variant="caption" fontWeight={500} color="text.secondary">Legend</Typography>
      {(['component', 'mfg', 'co_product', 'by_product'] as const).map(k => (
        <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Dot type={k} />
          <Typography variant="caption" color="text.secondary">{CATEGORY[k].label}</Typography>
        </Box>
      ))}
      <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontStyle: 'italic' }}>
        Italic qty = auto-scaled for this level
      </Typography>
    </Box>
  );
}

// ─── Error boundary for sub-BOM expansion ────────────────────────────────────

interface BomErrorBoundaryState { hasError: boolean; message: string }

class BomErrorBoundary extends Component<
  { children: React.ReactNode },
  BomErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(e: unknown) {
    return { hasError: true, message: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ mx: 2, my: 1 }}>
          Error rendering sub-BOM: {this.state.message}
        </Alert>
      );
    }
    return this.props.children;
  }
}

const MAX_BOM_DEPTH = 8;

// ─── Sub-BOM expander (recursive) ─────────────────────────────────────────────

interface SubBomExpanderProps {
  catalogItemId:    number;
  catalogItemName:  string;
  catalogItemCode:  string;
  catalogItemUnit:  string | null;
  neededQty:        number;
  neededUnit:       string | null;
  allBomCatalogIds: Set<number>;
  treeKey:          number;
  onEdit:           (t: EditTarget) => void;
  mode:             'edit' | 'readonly';
  depth:            number;
  onCreateBom?:     (catalogItemId: number, itemName: string) => void;
}

function SubBomExpander({
  catalogItemId, catalogItemName, catalogItemCode, catalogItemUnit,
  neededQty, neededUnit, allBomCatalogIds, treeKey, onEdit, mode, depth, onCreateBom,
}: SubBomExpanderProps) {
  const [bom,     setBom]     = useState<FabMaterialBom | null>(null);
  const [items,   setItems]   = useState<FabMaterialBomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    (async () => {
      try {
        const res = await fabQuery<{ data: FabMaterialBom[] }>('fabErpMaterialBom', {
          filters:    { catalogItemId },
          orderBy:    [{ field: 'isDefault', direction: 'desc' }, { field: 'id', direction: 'asc' }],
          pagination: { limit: 10 },
        });
        const b = (res.data ?? [])[0] ?? null;
        if (cancelled) return;
        setBom(b);
        if (b) {
          const ir = await fabQuery<{ data: FabMaterialBomItem[] }>('fabErpMaterialBomItem', {
            filters:    { bomId: b.id },
            orderBy:    [{ field: 'id', direction: 'asc' }],
            pagination: { limit: 200 },
          });
          if (!cancelled) setItems(ir.data ?? []);
        }
      } catch (e: any) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [catalogItemId, treeKey]);

  if (depth >= MAX_BOM_DEPTH) {
    return (
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.disabled">Max expansion depth reached</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, py: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.disabled">Loading BOM…</Typography>
      </Box>
    );
  }
  if (error) return <Alert severity="error" sx={{ mx: 2, my: 1 }}>{error}</Alert>;

  const base  = Number(bom?.baseQty ?? 1) || 1;
  const scale = base > 0 ? neededQty / base : 1;

  return (
    <Box sx={{ bgcolor: 'action.hover', borderTop: '0.5px solid', borderColor: 'divider' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75,
        bgcolor: '#EEEDFE', borderBottom: '0.5px solid #AFA9EC',
      }}>
        <Typography variant="caption" color="#534AB7" sx={{ fontStyle: 'italic' }}>
          Quantities auto-scaled for {fmt(neededQty)} {neededUnit ?? ''} of {catalogItemName}
          {bom ? ` (BOM base: ${fmt(base)} ${bom.baseUnit ?? neededUnit ?? ''})` : ''}
        </Typography>
        {bom && mode === 'edit' && (
          <Button
            size="small"
            startIcon={<EditIcon sx={{ fontSize: '12px !important' }} />}
            sx={{ ml: 'auto', fontSize: 11, py: 0.25, minHeight: 0 }}
            onClick={() => onEdit({
              bomId: bom.id, bom,
              catalogItemId, catalogItemName,
              catalogItemCode, catalogItemUnit: catalogItemUnit ?? undefined,
            })}
          >
            Edit BOM
          </Button>
        )}
        {!bom && (
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>No BOM defined</Typography>
        )}
      </Box>

      {bom && items.length > 0 && (
        <BomTreeLevel
          items={items}
          scale={scale}
          allBomCatalogIds={allBomCatalogIds}
          treeKey={treeKey}
          onEdit={onEdit}
          mode={mode}
          depth={depth}
          onCreateBom={onCreateBom}
        />
      )}
      {bom && items.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 3, py: 1.5 }}>
          BOM is empty
        </Typography>
      )}
    </Box>
  );
}

// ─── One row in the tree ───────────────────────────────────────────────────────

interface BomRowProps {
  item:             FabMaterialBomItem;
  scaledQty:        number;
  isExpandable:     boolean;
  allBomCatalogIds: Set<number>;
  treeKey:          number;
  onEdit:           (t: EditTarget) => void;
  mode:             'edit' | 'readonly';
  depth:            number;
  isScaled:         boolean;
  onCreateBom?:     (catalogItemId: number, itemName: string) => void;
}

function BomRow({
  item, scaledQty, isExpandable, allBomCatalogIds, treeKey, onEdit, mode, depth, isScaled, onCreateBom,
}: BomRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { company } = useParams<{ company: string }>();
  const navigate    = useNavigate();

  const isOutput = item.itemCategory === 'co_product' || item.itemCategory === 'by_product';
  const dotType: keyof typeof CATEGORY = isOutput
    ? (item.itemCategory as 'co_product' | 'by_product')
    : (isExpandable ? 'mfg' : 'component');

  return (
    <Box sx={{ borderBottom: '0.5px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
      <Box
        className="bom-row"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          pl: `${6 + depth * 28}px`, pr: 1.5, py: 0.75,
          cursor: isExpandable ? 'pointer' : 'default',
          bgcolor: isOutput ? 'action.hover' : 'background.paper',
          '&:hover': { bgcolor: 'action.hover' },
          '&:hover .bom-actions': { opacity: 1 },
          transition: 'background 0.1s',
        }}
        onClick={() => isExpandable && setExpanded(e => !e)}
      >
        <ChevronRightIcon sx={{
          fontSize: 16, flexShrink: 0,
          color: isExpandable ? 'text.secondary' : 'transparent',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }} />

        <Dot type={dotType} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            fontStyle={isOutput ? 'italic' : 'normal'}
            color={isOutput ? 'text.secondary' : (isExpandable ? '#3C3489' : 'text.primary')}
            fontWeight={isExpandable ? 500 : 400}
            noWrap
          >
            {item.refItemName ?? item.name}
            {isOutput && ` (${ITEM_CAT_LABELS[item.itemCategory]} out)`}
          </Typography>
          {item.refItemCode && (
            <Typography variant="caption" color="text.disabled" fontFamily="monospace">
              {item.refItemCode}
            </Typography>
          )}
        </Box>

        <Typography
          variant="body2"
          color={
            isOutput
              ? (dotType === 'co_product' ? '#3B6D11' : '#854F0B')
              : (isScaled ? '#534AB7' : 'text.secondary')
          }
          fontStyle={isScaled ? 'italic' : 'normal'}
          sx={{ flexShrink: 0, minWidth: 60, textAlign: 'right', mr: 0.5 }}
        >
          {fmt(scaledQty)} {item.unit ?? item.refItemUnit ?? ''}
        </Typography>

        <Box
          className="bom-actions"
          sx={{ display: 'flex', gap: 0.25, flexShrink: 0, opacity: 0, transition: 'opacity 0.1s' }}
          onClick={e => e.stopPropagation()}
        >
          {item.refCatalogItemId && (
            <Tooltip title={`Open ${item.refItemName ?? item.name} item page`}>
              <IconButton
                size="small"
                onClick={() => navigate(`/${company}/fab_erp/item-catalog/${item.refCatalogItemId}`)}
                sx={{ p: 0.25 }}
              >
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {item.refCatalogItemId && !isExpandable && !isOutput && mode === 'edit' && onCreateBom && (
            <Tooltip title={`Create BOM for ${item.refItemName ?? item.name}`}>
              <IconButton
                size="small"
                onClick={() => onCreateBom(item.refCatalogItemId!, item.refItemName ?? item.name)}
                sx={{ p: 0.25, color: 'primary.main' }}
              >
                <NoteAddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {expanded && item.refCatalogItemId && (
        <Box sx={{ ml: `${6 + depth * 28 + 16}px`, borderLeft: '2px solid', borderColor: 'divider' }}>
          <BomErrorBoundary>
            <SubBomExpander
              catalogItemId={item.refCatalogItemId}
              catalogItemName={item.refItemName ?? item.name}
              catalogItemCode={item.refItemCode ?? ''}
              catalogItemUnit={item.refItemUnit ?? item.unit}
              neededQty={scaledQty}
              neededUnit={item.unit ?? item.refItemUnit ?? null}
              allBomCatalogIds={allBomCatalogIds}
              treeKey={treeKey}
              onEdit={onEdit}
              mode={mode}
              depth={depth + 1}
              onCreateBom={onCreateBom}
            />
          </BomErrorBoundary>
        </Box>
      )}
    </Box>
  );
}

// ─── Tree level (inputs first, outputs last) ──────────────────────────────────

interface BomTreeLevelProps {
  items:            FabMaterialBomItem[];
  scale:            number;
  allBomCatalogIds: Set<number>;
  treeKey:          number;
  onEdit:           (t: EditTarget) => void;
  mode:             'edit' | 'readonly';
  depth:            number;
  onCreateBom?:     (catalogItemId: number, itemName: string) => void;
}

function BomTreeLevel({ items, scale, allBomCatalogIds, treeKey, onEdit, mode, depth, onCreateBom }: BomTreeLevelProps) {
  const inputs  = items.filter(i => i.itemCategory === 'component' || i.itemCategory === 'mfg');
  const outputs = items.filter(i => i.itemCategory === 'co_product' || i.itemCategory === 'by_product');
  const isScaled = scale !== 1;

  return (
    <Box>
      {inputs.map(item => (
        <BomRow
          key={item.id}
          item={item}
          scaledQty={item.qty * scale}
          isExpandable={!!item.refCatalogItemId && allBomCatalogIds.has(item.refCatalogItemId)}
          allBomCatalogIds={allBomCatalogIds}
          treeKey={treeKey}
          onEdit={onEdit}
          mode={mode}
          depth={depth}
          isScaled={isScaled}
          onCreateBom={onCreateBom}
        />
      ))}
      {outputs.map(item => (
        <BomRow
          key={item.id}
          item={item}
          scaledQty={item.qty * scale}
          isExpandable={false}
          allBomCatalogIds={allBomCatalogIds}
          treeKey={treeKey}
          onEdit={onEdit}
          mode={mode}
          depth={depth}
          isScaled={isScaled}
          onCreateBom={onCreateBom}
        />
      ))}
    </Box>
  );
}

// ─── New Item dialog (create item on-the-fly from BOM editor) ────────────────

interface NewItemDialogProps {
  open:    boolean;
  onClose: () => void;
  onCreated: (item: CatalogOption) => void;
}

function NewItemDialog({ open, onClose, onCreated }: NewItemDialogProps) {
  const [name, setName]     = useState('');
  const [code, setCode]     = useState('');
  const [unit, setUnit]     = useState('pcs');
  const [procType, setProcType] = useState<'buy' | 'make'>('buy');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => { if (open) { setName(''); setCode(''); setUnit('pcs'); setProcType('buy'); setError(''); } }, [open]);

  async function create() {
    if (!name.trim() || !code.trim()) { setError('Name and code are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fabMutate<{ id: number }>('fabErpItemCatalog', 'insert', {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        unit: unit.trim() || 'pcs',
        procurement_type: procType,
        material_type: procType === 'buy' ? 'component' : 'semi_finished',
      });
      onCreated({ id: res.id, name: name.trim(), code: code.trim().toUpperCase(), unit: unit.trim() || null });
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create New Item</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
          <TextField label="Item name" size="small" fullWidth autoFocus value={name} onChange={e => setName(e.target.value)} />
          <TextField label="Item code" size="small" fullWidth value={code} onChange={e => setCode(e.target.value)} inputProps={{ style: { textTransform: 'uppercase' } }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Unit" size="small" sx={{ flex: 1 }} value={unit} onChange={e => setUnit(e.target.value)} />
            <TextField select label="Type" size="small" sx={{ flex: 1 }} value={procType} onChange={e => setProcType(e.target.value as 'buy' | 'make')}>
              <MenuItem value="buy">Buy (purchased)</MenuItem>
              <MenuItem value="make">Make (manufactured)</MenuItem>
            </TextField>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Create Item'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

interface ItemDraft {
  id?:              number;
  refCatalogItemId: number | null;
  name:             string;
  qty:              string;
  unit:             string;
  itemCategory:     'component' | 'co_product' | 'by_product';
  _new?:            boolean;
  _deleted?:        boolean;
}

// Each row manages its own catalog search state so searches in one row
// never cause other rows to flicker or re-render.
interface BomItemEditorProps {
  row:             ItemDraft;
  showTypePicker:  boolean;
  onChange:        (patch: Partial<ItemDraft>) => void;
  onRemove:        () => void;
  onItemCreated:   (item: CatalogOption) => void;
}

function BomItemEditor({ row, showTypePicker, onChange, onRemove, onItemCreated }: BomItemEditorProps) {
  const [opts, setOpts] = useState<CatalogOption[]>([]);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const res = await fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', {
        filters:    q ? { name: q } : undefined,
        orderBy:    [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 30 },
      });
      setOpts((res.data ?? []).map(c => ({ id: c.id, name: c.name, code: c.code, unit: c.unit ?? null })));
    }, 200);
  }, []);

  // Keep the selected value visible even when opts hasn't loaded yet.
  const selectedOpt = opts.find(o => o.id === row.refCatalogItemId)
    ?? (row.refCatalogItemId ? { id: row.refCatalogItemId, name: row.name, code: '', unit: row.unit || null } : null);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
      <Autocomplete
        sx={{ flex: '2 1 180px' }}
        size="small"
        options={opts}
        getOptionLabel={o => `${o.name}${o.code ? ` (${o.code})` : ''}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={selectedOpt}
        filterOptions={x => x}
        onOpen={() => search(row.refCatalogItemId ? '' : row.name)}
        onInputChange={(_, v, reason) => {
          // Don't trigger a search when MUI resets input after selection ('reset' reason)
          if (reason === 'reset') return;
          onChange({ name: v });
          search(v);
        }}
        onChange={(_, v) => onChange({
          refCatalogItemId: v?.id ?? null,
          name: v?.name ?? '',
          unit: v?.unit ?? row.unit,
        })}
        renderInput={params => <TextField {...params} label="Item" size="small" />}
        renderOption={(props, o) => (
          <li {...props} key={o.id}>
            <Box>
              <Typography variant="body2">{o.name}</Typography>
              {o.code && <Typography variant="caption" color="text.disabled" fontFamily="monospace">{o.code}</Typography>}
            </Box>
          </li>
        )}
      />
      <TextField
        label="Qty" type="number" size="small" sx={{ flex: '0 1 72px' }}
        value={row.qty}
        onChange={e => onChange({ qty: e.target.value })}
      />
      <TextField
        label="Unit" size="small" sx={{ flex: '0 1 64px' }}
        value={row.unit}
        onChange={e => onChange({ unit: e.target.value })}
      />
      {showTypePicker && (
        <TextField
          select size="small" label="Type" sx={{ flex: '0 1 120px' }}
          value={row.itemCategory}
          onChange={e => onChange({ itemCategory: e.target.value as ItemDraft['itemCategory'] })}
        >
          <MenuItem value="co_product">Co-product</MenuItem>
          <MenuItem value="by_product">By-product</MenuItem>
        </TextField>
      )}
      <Tooltip title="Create new item">
        <IconButton size="small" color="primary" onClick={() => setNewItemOpen(true)}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <IconButton size="small" color="error" onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
      <NewItemDialog
        open={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onCreated={item => {
          onChange({ refCatalogItemId: item.id, name: item.name, unit: item.unit ?? row.unit });
          setOpts(prev => [item, ...prev.filter(o => o.id !== item.id)]);
          onItemCreated(item);
          setNewItemOpen(false);
        }}
      />
    </Box>
  );
}

interface BomEditModalProps {
  open:    boolean;
  target:  EditTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

function BomEditModal({ open, target, onClose, onSaved }: BomEditModalProps) {
  const [items,    setItems]    = useState<ItemDraft[]>([]);
  const [baseQty,  setBaseQty]  = useState('1');
  const [baseUnit, setBaseUnit] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!open || !target) return;
    setLoading(true); setError('');
    setBaseQty(String(target.bom.baseQty ?? 1));
    setBaseUnit(target.bom.baseUnit ?? target.catalogItemUnit ?? '');

    fabQuery<{ data: FabMaterialBomItem[] }>('fabErpMaterialBomItem', {
      filters:    { bomId: target.bomId },
      orderBy:    [{ field: 'id', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then(res => {
      setItems((res.data ?? []).map(r => ({
        id:               r.id,
        refCatalogItemId: r.refCatalogItemId,
        name:             r.refItemName ?? r.name,
        qty:              String(r.qty),
        unit:             r.unit ?? r.refItemUnit ?? '',
        itemCategory:     r.itemCategory,
      })));
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, target?.bomId]);

  function addRow(cat: ItemDraft['itemCategory']) {
    setItems(prev => [...prev, { refCatalogItemId: null, name: '', qty: '1', unit: '', itemCategory: cat, _new: true }]);
  }

  function removeRow(idx: number) {
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, _deleted: true } : r));
  }

  function updateRow(idx: number, patch: Partial<ItemDraft>) {
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  async function save() {
    if (!target) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpMaterialBom', 'update', {
        id:          target.bomId,
        name:        target.bom.name,
        description: target.bom.description ?? null,
        is_default:  target.bom.isDefault,
        base_qty:    parseFloat(baseQty) || 1,
        base_unit:   baseUnit.trim() || null,
      });

      const toDelete = items.filter(r => r.id && r._deleted);
      await Promise.all(toDelete.map(r => fabMutate('fabErpMaterialBomItem', 'delete', { id: r.id! })));

      const toInsert = items.filter(r => r._new && !r._deleted && (r.refCatalogItemId || r.name.trim()));
      await Promise.all(toInsert.map(r => fabMutate('fabErpMaterialBomItem', 'insert', {
        bom_id:              target.bomId,
        catalog_item_id:     target.catalogItemId,
        ref_catalog_item_id: r.refCatalogItemId ?? null,
        name:                r.name.trim(),
        qty:                 parseFloat(r.qty) || 1,
        unit:                r.unit.trim() || null,
        item_category:       r.itemCategory,
      })));

      const toUpdate = items.filter(r => r.id && !r._deleted && !r._new);
      await Promise.all(toUpdate.map(r => fabMutate('fabErpMaterialBomItem', 'update', {
        id:                  r.id!,
        bom_id:              target.bomId,
        catalog_item_id:     target.catalogItemId,
        ref_catalog_item_id: r.refCatalogItemId ?? null,
        name:                r.name.trim(),
        qty:                 parseFloat(r.qty) || 1,
        unit:                r.unit.trim() || null,
        item_category:       r.itemCategory,
      })));

      onSaved();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  if (!target) return null;

  const inputIdxs  = items.reduce<number[]>((a, r, i) => { if (!r._deleted && r.itemCategory === 'component') a.push(i); return a; }, []);
  const outputIdxs = items.reduce<number[]>((a, r, i) => { if (!r._deleted && r.itemCategory !== 'component') a.push(i); return a; }, []);
  const visible    = items.filter(r => !r._deleted);

  function renderRows(idxs: number[], showTypePicker: boolean) {
    return idxs.map(idx => (
      <BomItemEditor
        key={idx}
        row={items[idx]}
        showTypePicker={showTypePicker}
        onChange={patch => updateRow(idx, patch)}
        onRemove={() => removeRow(idx)}
        onItemCreated={() => {}}
      />
    ));
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Edit BOM — {target.catalogItemName}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          ({target.bom.name})
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Main output yield */}
            <Typography variant="caption" fontWeight={500} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled', display: 'block', mb: 1 }}>
              Main output (this item)
            </Typography>
            <Box sx={{
              display: 'inline-flex', alignItems: 'center', gap: 1.5,
              border: '1.5px solid #185FA5', borderRadius: 2, px: 2, py: 1, mb: 2, bgcolor: '#E6F1FB',
            }}>
              <Box>
                <Typography variant="body2" fontWeight={500} color="#042C53">{target.catalogItemName}</Typography>
                {target.catalogItemCode && (
                  <Typography variant="caption" fontFamily="monospace" color="#185FA5">{target.catalogItemCode}</Typography>
                )}
              </Box>
              <Divider orientation="vertical" flexItem />
              <Typography variant="caption" color="text.secondary">Yield per run</Typography>
              <TextField
                size="small" type="number" sx={{ width: 72 }}
                value={baseQty}
                onChange={e => setBaseQty(e.target.value)}
              />
              <TextField
                size="small" placeholder="unit" sx={{ width: 64 }}
                value={baseUnit}
                onChange={e => setBaseUnit(e.target.value)}
              />
            </Box>

            <Divider sx={{ my: 2 }}>
              <Typography variant="caption" color="text.disabled">input materials → process → outputs</Typography>
            </Divider>

            {/* Inputs */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" fontWeight={500} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled' }}>
                  Input materials
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addRow('component')} sx={{ fontSize: 11 }}>
                  Add material
                </Button>
              </Box>
              {inputIdxs.length === 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5 }}>None yet</Typography>
              )}
              {renderRows(inputIdxs, false)}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Outputs (co/by-products) */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" fontWeight={500} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled' }}>
                  Co / by-products
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addRow('co_product')} sx={{ fontSize: 11 }}>
                  Add output
                </Button>
              </Box>
              {outputIdxs.length === 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5 }}>None yet</Typography>
              )}
              {renderRows(outputIdxs, true)}
            </Box>

            {visible.length === 0 && inputIdxs.length === 0 && outputIdxs.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                Use the buttons above to add input materials or co/by-products.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || loading}>
          {saving ? <CircularProgress size={16} /> : 'Save BOM'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main BomDesigner ─────────────────────────────────────────────────────────

export default function BomDesigner({
  catalogItemId, catalogItemName, catalogItemCode, catalogItemUnit, mode = 'edit',
}: BomDesignerProps) {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [boms,             setBoms]             = useState<FabMaterialBom[]>([]);
  const [selectedBomIdx,   setSelectedBomIdx]   = useState(0);
  const [topItems,         setTopItems]         = useState<FabMaterialBomItem[]>([]);
  const [allBomCatalogIds, setAllBomCatalogIds] = useState<Set<number>>(new Set());
  const [loading,          setLoading]          = useState(true);
  const [editTarget,       setEditTarget]       = useState<EditTarget | null>(null);
  const [treeKey,          setTreeKey]          = useState(0);
  const [creatingBom,      setCreatingBom]      = useState(false);
  const [newBomName,       setNewBomName]       = useState('');
  const [error,            setError]            = useState('');
  const [toast,            setToast]            = useState('');
  const [routingPlans,     setRoutingPlans]     = useState<any[]>([]);
  const [newRouteName,     setNewRouteName]     = useState('');
  const [addingRoute,      setAddingRoute]      = useState(false);

  const selectedBom = boms[selectedBomIdx] ?? null;

  const loadBoms = useCallback(async () => {
    const res = await fabQuery<{ data: FabMaterialBom[] }>('fabErpMaterialBom', {
      filters:    { catalogItemId },
      orderBy:    [{ field: 'isDefault', direction: 'desc' }, { field: 'id', direction: 'asc' }],
      pagination: { limit: 20 },
    });
    return res.data ?? [];
  }, [catalogItemId]);

  const loadTopItems = useCallback(async (bomId: number) => {
    const res = await fabQuery<{ data: FabMaterialBomItem[] }>('fabErpMaterialBomItem', {
      filters:    { bomId },
      orderBy:    [{ field: 'id', direction: 'asc' }],
      pagination: { limit: 200 },
    });
    return res.data ?? [];
  }, []);

  const loadAllBomCatalogIds = useCallback(async () => {
    const res = await fabQuery<{ data: FabMaterialBom[] }>('fabErpMaterialBom', {
      pagination: { limit: 2000 },
    });
    return new Set((res.data ?? []).map(b => b.catalogItemId));
  }, []);

  // Initial + treeKey-driven load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadBoms(), loadAllBomCatalogIds()])
      .then(async ([bs, ids]) => {
        if (cancelled) return;
        setBoms(bs);
        setAllBomCatalogIds(ids);
        if (bs.length > 0) {
          const items = await loadTopItems(bs[Math.min(selectedBomIdx, bs.length - 1)].id);
          if (!cancelled) setTopItems(items);
        } else {
          if (!cancelled) setTopItems([]);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [treeKey, catalogItemId]);

  // When selected tab changes
  useEffect(() => {
    if (!selectedBom) return;
    loadTopItems(selectedBom.id).then(setTopItems).catch(e => setError(e.message));
    // Load routing plans for this BOM
    fabGet<{ data: any[] }>('routing/plans', { bomId: selectedBom.id })
      .then(r => setRoutingPlans(r.data ?? []))
      .catch(() => setRoutingPlans([]));
  }, [selectedBomIdx, selectedBom?.id]);

  async function createBom() {
    try {
      await fabMutate('fabErpMaterialBom', 'insert', {
        catalog_item_id: catalogItemId,
        name:            newBomName.trim() || 'BOM 1',
        description:     null,
        is_default:      boms.length === 0 ? 1 : 0,
        base_qty:        1,
        base_unit:       catalogItemUnit ?? null,
      });
      setCreatingBom(false); setNewBomName('');
      setTreeKey(k => k + 1);
    } catch (e: any) { setError(e.message); }
  }

  async function setDefaultBom(bom: FabMaterialBom) {
    try {
      await Promise.all(
        boms.filter(b => b.isDefault && b.id !== bom.id)
            .map(b => fabMutate('fabErpMaterialBom', 'update', {
              id: b.id, name: b.name, description: b.description ?? null,
              is_default: 0, base_qty: b.baseQty ?? 1, base_unit: b.baseUnit ?? null,
            })),
      );
      await fabMutate('fabErpMaterialBom', 'update', {
        id: bom.id, name: bom.name, description: bom.description ?? null,
        is_default: 1, base_qty: bom.baseQty ?? 1, base_unit: bom.baseUnit ?? null,
      });
      const bs = await loadBoms();
      setBoms(bs);
    } catch (e: any) { setError(e.message); }
  }

  async function handleCreateBomForItem(itemId: number, itemName: string) {
    try {
      const res = await fabMutate<{ id: number }>('fabErpMaterialBom', 'insert', {
        catalog_item_id: itemId,
        name:            `${itemName} BOM`,
        description:     null,
        is_default:      1,
        base_qty:        1,
        base_unit:       null,
      });
      const newBomId = res.id;
      const [newBom] = await fabQuery<{ data: FabMaterialBom[] }>('fabErpMaterialBom', {
        filters: { id: newBomId }, pagination: { limit: 1 },
      }).then(r => r.data ?? []);
      if (newBom) {
        setEditTarget({
          bomId: newBomId, bom: newBom,
          catalogItemId: itemId, catalogItemName: itemName,
        });
      }
      const ids = await loadAllBomCatalogIds();
      setAllBomCatalogIds(ids);
    } catch (e: any) { setError(e.message); }
  }

  async function handleAddRoute() {
    if (!selectedBom || !newRouteName.trim()) return;
    try {
      const res = await fabPost<{ id: number }>('routing/plans', { bomId: selectedBom.id, name: newRouteName.trim() });
      setAddingRoute(false); setNewRouteName('');
      navigate(`/${company}/fab_erp/routing-plans/${res.id}`);
    } catch (e: any) { setError(e.message); }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (boms.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6 }}>
        <Typography color="text.secondary">No BOMs defined for this item yet.</Typography>
        {mode === 'edit' && (
          creatingBom ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" label="BOM name" value={newBomName}
                onChange={e => setNewBomName(e.target.value)} autoFocus />
              <Button variant="contained" onClick={createBom}>Create</Button>
              <Button onClick={() => { setCreatingBom(false); setNewBomName(''); }}>Cancel</Button>
            </Box>
          ) : (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreatingBom(true)}>
              Create First BOM
            </Button>
          )
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Tab bar + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', px: 1, gap: 1 }}>
        <InfoTooltip content={INFO_BOM} placement="bottom-start" size={15} />
        <Tabs
          value={selectedBomIdx}
          onChange={(_, v) => setSelectedBomIdx(v)}
          variant="scrollable" scrollButtons="auto" sx={{ flex: 1 }}
        >
          {boms.map((bom, idx) => (
            <Tab
              key={bom.id} value={idx}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {bom.isDefault
                    ? <Tooltip title="Default BOM"><StarIcon fontSize="small" color="warning" /></Tooltip>
                    : mode === 'edit' && (
                      <Tooltip title="Set as default">
                        <StarBorderIcon
                          fontSize="small"
                          sx={{ color: 'text.disabled', cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); setDefaultBom(bom); }}
                        />
                      </Tooltip>
                    )
                  }
                  <span>{bom.name}</span>
                </Box>
              }
            />
          ))}
        </Tabs>

        {mode === 'edit' && selectedBom && (
          <Button
            size="small" startIcon={<EditIcon />} variant="outlined"
            sx={{ flexShrink: 0, fontSize: 12 }}
            onClick={() => setEditTarget({
              bomId: selectedBom.id, bom: selectedBom,
              catalogItemId, catalogItemName, catalogItemCode, catalogItemUnit,
            })}
          >
            Edit BOM
          </Button>
        )}

        {mode === 'edit' && (
          creatingBom ? (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
              <TextField size="small" value={newBomName} onChange={e => setNewBomName(e.target.value)}
                placeholder="BOM name" autoFocus sx={{ width: 120 }} />
              <Button size="small" variant="contained" onClick={createBom}>Add</Button>
              <Button size="small" onClick={() => { setCreatingBom(false); setNewBomName(''); }}>×</Button>
            </Box>
          ) : (
            <Tooltip title="Add BOM alternative">
              <IconButton size="small" onClick={() => setCreatingBom(true)}><AddIcon /></IconButton>
            </Tooltip>
          )
        )}
      </Box>

      {/* Tree */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Legend />
        {topItems.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary" gutterBottom>This BOM has no items yet.</Typography>
            {mode === 'edit' && selectedBom && (
              <Button
                variant="outlined" startIcon={<EditIcon />}
                onClick={() => setEditTarget({
                  bomId: selectedBom.id, bom: selectedBom,
                  catalogItemId, catalogItemName, catalogItemCode, catalogItemUnit,
                })}
              >
                Open BOM editor
              </Button>
            )}
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <BomTreeLevel
              items={topItems}
              scale={1}
              allBomCatalogIds={allBomCatalogIds}
              treeKey={treeKey}
              onEdit={setEditTarget}
              mode={mode}
              depth={0}
              onCreateBom={mode === 'edit' ? handleCreateBomForItem : undefined}
            />
          </Paper>
        )}

        {/* Routing Plans section */}
        {selectedBom && (
          <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider',
            }}>
              <AccountTreeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                Routing Plans
              </Typography>
              <InfoTooltip content={INFO_ROUTING} placement="right" size={14} />
              <Box sx={{ flex: 1 }} />
              {mode === 'edit' && (
                addingRoute ? (
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <TextField
                      size="small" value={newRouteName} onChange={e => setNewRouteName(e.target.value)}
                      placeholder="Route name" autoFocus sx={{ width: 160 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddRoute(); if (e.key === 'Escape') { setAddingRoute(false); setNewRouteName(''); } }}
                    />
                    <Button size="small" variant="contained" onClick={handleAddRoute} disabled={!newRouteName.trim()}>Add</Button>
                    <Button size="small" onClick={() => { setAddingRoute(false); setNewRouteName(''); }}>×</Button>
                  </Box>
                ) : (
                  <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingRoute(true)} sx={{ fontSize: 11 }}>
                    Add Route
                  </Button>
                )
              )}
            </Box>
            {routingPlans.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 2, py: 1.5 }}>
                No routing plans defined for this BOM.
              </Typography>
            ) : (
              routingPlans.map((plan: any) => (
                <Box key={plan.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
                  borderBottom: '0.5px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' },
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap fontWeight={500}>{plan.name}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {plan.stepCount ?? 0} step{plan.stepCount !== 1 ? 's' : ''} · {plan.status}
                      {plan.isCurrent ? ' · current' : ''}
                    </Typography>
                  </Box>
                  <Box sx={{
                    px: 1, py: 0.25, borderRadius: 1, fontSize: 11,
                    bgcolor: plan.status === 'released' ? '#DCFCE7' : plan.status === 'draft' ? '#FEF9C3' : '#F3F4F6',
                    color:   plan.status === 'released' ? '#166534' : plan.status === 'draft' ? '#854D0E' : '#6B7280',
                    fontWeight: 500,
                  }}>
                    {plan.status}
                  </Box>
                  <Button
                    size="small" startIcon={<EditIcon sx={{ fontSize: '13px !important' }} />}
                    variant="outlined" sx={{ fontSize: 11, py: 0.25, minHeight: 0 }}
                    onClick={() => navigate(`/${company}/fab_erp/routing-plans/${plan.id}`)}
                  >
                    {mode === 'edit' ? 'Edit' : 'View'}
                  </Button>
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>

      {/* Edit modal */}
      <BomEditModal
        open={!!editTarget}
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          setEditTarget(null);
          setToast('BOM saved');
          const ids = await loadAllBomCatalogIds();
          setAllBomCatalogIds(ids);
          setTreeKey(k => k + 1);
        }}
      />

      {error && (
        <Snackbar open autoHideDuration={5000} onClose={() => setError('')}>
          <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
        </Snackbar>
      )}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
