/**
 * BomTemplates — EU-13: BOM template authoring UI.
 *
 * Left pane: master list of `fab_bom_templates` headers (create / select).
 * Right pane: tree editor for the selected template's `fab_bom_template_nodes`
 * (self-referencing via parent_node_id; node_role = assembly / intermediate /
 * raw_material). A raw_material node can optionally carry a parameterized
 * `fab_bom_template_slot` (material choice resolved at project-item creation
 * time — see bomTemplateResolveService.js on the backend).
 *
 * UI structure mirrors BomDesigner.tsx / BomItemEditor (tree rows with inline
 * fields, add/remove, item-catalog Autocomplete search) but adapted to the
 * template schema, which has no free-text item name — display names fall back
 * to the linked catalog item, the slot's param label, or a generic role tag.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import TuneIcon from '@mui/icons-material/Tune';

import { usePermission } from '@core/hooks/usePermission';
import { fabQuery, fabMutate } from '../api/client';
import {
  PageHeader, FilterBar, EntityList, EntityRow, Mono, StatusBadge,
  EmptyState, ListSkeleton, TreeRow, useToast, type SortableField,
} from '../components';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import { STANDARD_UOMS } from '../constants/uom';

// ─── INFO TOOLTIP CONTENT ───────────────────────────────────────────────────

const INFO_TEMPLATES: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'A BOM template is a reusable pattern for building an assembly out of parameterized materials.',
      'Unlike a normal BOM (tied to one catalog item), a template resolves its raw-material slots at project-item creation time.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'Select a template on the left, then build its node tree on the right.',
      'assembly / intermediate nodes group children; raw_material nodes are leaves.',
      'A raw_material node can either point at a fixed catalog item, or define a Slot — a parameterized material choice (category/group/dimensions) resolved later by selection_strategy.',
    ],
  },
];

// ─── Types (local — resourceDef.json is the source of truth for field names) ─

interface BomTemplate {
  id: number;
  companyId: number;
  name: string;
  code: string;
  baseQty: number;
  baseUnit: string | null;
  active: number;
}

interface BomTemplateNode {
  id: number;
  companyId: number;
  templateId: number;
  parentNodeId: number | null;
  nodeRole: 'assembly' | 'intermediate' | 'raw_material';
  refCatalogItemId: number | null;
  qty: number;
  unit: string | null;
  sortOrder: number;
  refCatalogItemName?: string;
  refCatalogItemCode?: string;
}

interface BomTemplateSlot {
  id: number;
  companyId: number;
  templateId: number;
  nodeId: number;
  slotKey: string;
  paramLabel: string;
  catalogCategory: string | null;
  catalogGroup: string | null;
  dimensionParams: string | null; // JSON text
  selectionStrategy: 'available_now' | 'soonest_available' | 'manual';
  defaultCatalogItemId: number | null;
  defaultCatalogItemName?: string;
  defaultCatalogItemCode?: string;
}

interface CatalogOption {
  id: number;
  name: string;
  code: string;
  unit: string | null;
}

const NODE_ROLE_LABEL: Record<BomTemplateNode['nodeRole'], string> = {
  assembly: 'Assembly',
  intermediate: 'Intermediate',
  raw_material: 'Raw material',
};

const SELECTION_STRATEGY_LABEL: Record<BomTemplateSlot['selectionStrategy'], string> = {
  available_now: 'Available now',
  soonest_available: 'Soonest available',
  manual: 'Manual',
};

const TEMPLATE_SORT_FIELDS: SortableField<BomTemplate>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];

const CATALOG_SEARCH_LIMIT = 50;

// ─── Item catalog picker (reuses BomItemEditor's search pattern) ─────────────

function CatalogItemPicker({
  value, label, onChange, disabled,
}: {
  value: CatalogOption | null;
  label: string;
  onChange: (item: CatalogOption | null) => void;
  disabled?: boolean;
}) {
  const [opts, setOpts] = useState<CatalogOption[]>(value ? [value] : []);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
        filters: q ? { 'name.LIKE': `%${q}%` } : undefined,
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: CATALOG_SEARCH_LIMIT },
      });
      setOpts(res.data ?? []);
    }, 200);
  }, []);

  return (
    <Autocomplete
      size="small"
      disabled={disabled}
      options={opts}
      getOptionLabel={(o) => `${o.name}${o.code ? ` (${o.code})` : ''}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={value}
      filterOptions={(x) => x}
      onOpen={() => search('')}
      onInputChange={(_, v, reason) => { if (reason !== 'reset') search(v); }}
      onChange={(_, v) => onChange(v)}
      renderInput={(params) => <TextField {...params} label={label} size="small" />}
      renderOption={(props, o) => (
        <li {...props} key={o.id}>
          <Box>
            <Typography variant="body2">{o.name}</Typography>
            {o.code && <Typography variant="caption" color="text.disabled" fontFamily="monospace">{o.code}</Typography>}
          </Box>
        </li>
      )}
      sx={{ minWidth: 220 }}
    />
  );
}

// ─── Dimension params (JSON key/value) editor ────────────────────────────────

interface KvRow { key: string; value: string }

function parseDimensionParams(raw: string | null): KvRow[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
    }
  } catch { /* ignore malformed JSON */ }
  return [];
}

function serializeDimensionParams(rows: KvRow[]): string | null {
  const entries = rows.filter((r) => r.key.trim());
  if (entries.length === 0) return null;
  const obj: Record<string, string> = {};
  entries.forEach((r) => { obj[r.key.trim()] = r.value; });
  return JSON.stringify(obj);
}

function DimensionParamsEditor({ rows, onChange }: { rows: KvRow[]; onChange: (rows: KvRow[]) => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="caption" fontWeight={500} color="text.secondary">Dimension params</Typography>
      {rows.map((row, idx) => (
        <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small" label="Key" sx={{ flex: 1 }}
            value={row.key}
            onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))}
          />
          <TextField
            size="small" label="Value" sx={{ flex: 1 }}
            value={row.value}
            onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))}
          />
          <IconButton size="small" color="error" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start', fontSize: 11 }}
        onClick={() => onChange([...rows, { key: '', value: '' }])}>
        Add param
      </Button>
    </Box>
  );
}

// ─── Slot editor (raw_material nodes only) ───────────────────────────────────

function SlotEditor({
  templateId, nodeId, canManage, onToast,
}: {
  templateId: number;
  nodeId: number;
  canManage: boolean;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}) {
  const [slot, setSlot] = useState<BomTemplateSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [slotKey, setSlotKey] = useState('');
  const [paramLabel, setParamLabel] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogGroup, setCatalogGroup] = useState('');
  const [dimRows, setDimRows] = useState<KvRow[]>([]);
  const [strategy, setStrategy] = useState<BomTemplateSlot['selectionStrategy']>('available_now');
  const [defaultItem, setDefaultItem] = useState<CatalogOption | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: BomTemplateSlot[] }>('fabErpBomTemplateSlot', {
        filters: { nodeId },
        pagination: { limit: 1 },
      });
      const s = (res.data ?? [])[0] ?? null;
      setSlot(s);
      setSlotKey(s?.slotKey ?? '');
      setParamLabel(s?.paramLabel ?? '');
      setCatalogCategory(s?.catalogCategory ?? '');
      setCatalogGroup(s?.catalogGroup ?? '');
      setDimRows(parseDimensionParams(s?.dimensionParams ?? null));
      setStrategy(s?.selectionStrategy ?? 'available_now');
      setDefaultItem(
        s?.defaultCatalogItemId
          ? { id: s.defaultCatalogItemId, name: s.defaultCatalogItemName ?? '', code: s.defaultCatalogItemCode ?? '', unit: null }
          : null,
      );
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setLoading(false); }
  }, [nodeId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!slotKey.trim() || !paramLabel.trim()) { setError('Slot key and param label are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        template_id: templateId,
        node_id: nodeId,
        slot_key: slotKey.trim(),
        param_label: paramLabel.trim(),
        catalog_category: catalogCategory.trim() || null,
        catalog_group: catalogGroup.trim() || null,
        dimension_params: serializeDimensionParams(dimRows),
        selection_strategy: strategy,
        default_catalog_item_id: defaultItem?.id ?? null,
      };
      if (slot) {
        await fabMutate('fabErpBomTemplateSlot', 'update', { id: slot.id, ...payload });
      } else {
        await fabMutate('fabErpBomTemplateSlot', 'insert', payload);
      }
      onToast('Slot saved');
      await load();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!slot) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpBomTemplateSlot', 'delete', { id: slot.id });
      onToast('Slot removed');
      await load();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}><CircularProgress size={14} /><Typography variant="caption" color="text.disabled">Loading slot…</Typography></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, border: '1px dashed', borderColor: 'divider' }}>
      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField size="small" label="Slot key" value={slotKey} disabled={!canManage}
          onChange={(e) => setSlotKey(e.target.value)} sx={{ flex: '1 1 140px' }} />
        <TextField size="small" label="Param label" value={paramLabel} disabled={!canManage}
          onChange={(e) => setParamLabel(e.target.value)} sx={{ flex: '1 1 160px' }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField size="small" label="Catalog category" value={catalogCategory} disabled={!canManage}
          onChange={(e) => setCatalogCategory(e.target.value)} sx={{ flex: '1 1 140px' }} />
        <TextField size="small" label="Catalog group" value={catalogGroup} disabled={!canManage}
          onChange={(e) => setCatalogGroup(e.target.value)} sx={{ flex: '1 1 140px' }} />
        <TextField
          select size="small" label="Selection strategy" value={strategy} disabled={!canManage}
          onChange={(e) => setStrategy(e.target.value as BomTemplateSlot['selectionStrategy'])}
          sx={{ flex: '1 1 160px' }}
        >
          {(Object.keys(SELECTION_STRATEGY_LABEL) as BomTemplateSlot['selectionStrategy'][]).map((k) => (
            <MenuItem key={k} value={k}>{SELECTION_STRATEGY_LABEL[k]}</MenuItem>
          ))}
        </TextField>
      </Box>
      <CatalogItemPicker
        label="Default catalog item (optional)"
        value={defaultItem}
        disabled={!canManage}
        onChange={setDefaultItem}
      />
      <DimensionParamsEditor rows={dimRows} onChange={setDimRows} />
      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {slot && (
            <Button size="small" color="error" onClick={remove} disabled={saving}>Remove slot</Button>
          )}
          <Button size="small" variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={14} /> : slot ? 'Save slot' : 'Create slot'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

// ─── One tree node row (recursive) ───────────────────────────────────────────

interface NodeRowProps {
  node: BomTemplateNode;
  allNodes: BomTemplateNode[];
  templateId: number;
  depth: number;
  canManage: boolean;
  onChanged: () => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

function NodeRow({ node, allNodes, templateId, depth, canManage, onChanged, onToast }: NodeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const [slotOpen, setSlotOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [nodeRole, setNodeRole] = useState(node.nodeRole);
  const [qty, setQty] = useState(String(node.qty));
  const [unit, setUnit] = useState(node.unit ?? '');
  const [refItem, setRefItem] = useState<CatalogOption | null>(
    node.refCatalogItemId
      ? { id: node.refCatalogItemId, name: node.refCatalogItemName ?? '', code: node.refCatalogItemCode ?? '', unit: null }
      : null,
  );

  const children = allNodes
    .filter((n) => n.parentNodeId === node.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const dirty = nodeRole !== node.nodeRole
    || qty !== String(node.qty)
    || unit !== (node.unit ?? '')
    || (refItem?.id ?? null) !== node.refCatalogItemId;

  async function saveNode() {
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpBomTemplateNode', 'update', {
        id: node.id,
        template_id: templateId,
        parent_node_id: node.parentNodeId,
        node_role: nodeRole,
        ref_catalog_item_id: refItem?.id ?? null,
        qty: parseFloat(qty) || 1,
        unit: unit.trim() || null,
        sort_order: node.sortOrder,
      });
      onToast('Node saved');
      onChanged();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  async function addChild(role: BomTemplateNode['nodeRole']) {
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpBomTemplateNode', 'insert', {
        template_id: templateId,
        parent_node_id: node.id,
        node_role: role,
        ref_catalog_item_id: null,
        qty: 1,
        unit: null,
        sort_order: children.length,
      });
      setExpanded(true);
      onChanged();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  async function removeNode() {
    if (children.length > 0) { setError('Remove child nodes first.'); return; }
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpBomTemplateNode', 'delete', { id: node.id });
      onToast('Node removed');
      onChanged();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  const displayLabel = refItem?.name || (node.nodeRole === 'raw_material' ? 'Raw material (unlinked — see Slot)' : `${NODE_ROLE_LABEL[node.nodeRole]} node`);

  return (
    <Box>
      <TreeRow
        depth={depth}
        expandable={children.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        trailing={
          canManage && (
            <>
              <Tooltip title="Add child node">
                <span>
                  <IconButton size="small" onClick={() => addChild('intermediate')} disabled={saving}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {node.nodeRole === 'raw_material' && (
                <Tooltip title="Slot (parameterized material)">
                  <IconButton size="small" color={slotOpen ? 'primary' : 'default'} onClick={() => setSlotOpen((s) => !s)}>
                    <TuneIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove node">
                <span>
                  <IconButton size="small" color="error" onClick={removeNode} disabled={saving || children.length > 0}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )
        }
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1 }}>
          <Typography variant="body2" fontWeight={500} sx={{ minWidth: 140 }} noWrap>
            {displayLabel}
          </Typography>
          <TextField
            select size="small" value={nodeRole} disabled={!canManage}
            onChange={(e) => setNodeRole(e.target.value as BomTemplateNode['nodeRole'])}
            sx={{ minWidth: 130 }}
          >
            {(Object.keys(NODE_ROLE_LABEL) as BomTemplateNode['nodeRole'][]).map((r) => (
              <MenuItem key={r} value={r}>{NODE_ROLE_LABEL[r]}</MenuItem>
            ))}
          </TextField>
          <CatalogItemPicker
            label="Fixed item (optional)"
            value={refItem}
            disabled={!canManage}
            onChange={(v) => { setRefItem(v); if (v?.unit) setUnit(v.unit); }}
          />
          <TextField
            label="Qty" type="number" size="small" sx={{ width: 80 }} disabled={!canManage}
            value={qty} onChange={(e) => setQty(e.target.value)}
          />
          <TextField
            label="Unit" size="small" sx={{ width: 80 }} disabled={!canManage}
            value={unit} onChange={(e) => setUnit(e.target.value)}
          />
          {canManage && dirty && (
            <Button size="small" variant="outlined" onClick={saveNode} disabled={saving}>
              {saving ? <CircularProgress size={14} /> : 'Save'}
            </Button>
          )}
        </Box>
      </TreeRow>

      {error && <Alert severity="error" sx={{ ml: `${depth * 20 + 30}px`, mr: 1, mt: 0.5 }}>{error}</Alert>}

      {slotOpen && node.nodeRole === 'raw_material' && (
        <Box sx={{ ml: `${depth * 20 + 30}px`, mr: 1, mb: 1 }}>
          <SlotEditor templateId={templateId} nodeId={node.id} canManage={canManage} onToast={onToast} />
        </Box>
      )}

      {expanded && children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          allNodes={allNodes}
          templateId={templateId}
          depth={depth + 1}
          canManage={canManage}
          onChanged={onChanged}
          onToast={onToast}
        />
      ))}
    </Box>
  );
}

// ─── New template dialog ──────────────────────────────────────────────────────

function NewTemplateDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: BomTemplate) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [baseQty, setBaseQty] = useState('1');
  const [baseUnit, setBaseUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setCode(''); setBaseQty('1'); setBaseUnit(''); setError(''); }
  }, [open]);

  async function create() {
    if (!name.trim() || !code.trim()) { setError('Name and code are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        base_qty: parseFloat(baseQty) || 1,
        base_unit: baseUnit.trim() || null,
        active: 1,
      };
      let id: number;
      try {
        const res = await fabMutate<{ id: number }>('fabErpBomTemplate', 'insert', payload);
        id = res.id;
      } catch (e: any) {
        if (e.response?.status === 409) {
          // Duplicate name/code — re-resolve by re-querying, per ItemCatalog.tsx pattern.
          const retry = await fabQuery<{ data: BomTemplate[] }>('fabErpBomTemplate', {
            filters: { code: payload.code },
            pagination: { limit: 1 },
          });
          if (!retry.data?.[0]) throw e;
          onCreated(retry.data[0]);
          onClose();
          return;
        }
        throw e;
      }
      const [created] = await fabQuery<{ data: BomTemplate[] }>('fabErpBomTemplate', {
        filters: { id }, pagination: { limit: 1 },
      }).then((r) => r.data ?? []);
      if (created) onCreated(created);
      onClose();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New BOM Template</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
          <TextField label="Name" size="small" fullWidth autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Code" size="small" fullWidth value={code} onChange={(e) => setCode(e.target.value)}
            inputProps={{ style: { textTransform: 'uppercase' } }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Base qty" type="number" size="small" sx={{ flex: 1 }} value={baseQty} onChange={(e) => setBaseQty(e.target.value)} />
            <Autocomplete freeSolo options={STANDARD_UOMS.map((u) => u.value)} sx={{ flex: 1 }}
              value={baseUnit}
              onInputChange={(_, v) => setBaseUnit(v)}
              renderInput={(params) => <TextField {...params} label="Base unit" size="small" />} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Create Template'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BomTemplates() {
  const canManage = usePermission('fab_erp_bomtemplate_manage');
  const { toast } = useToast();

  const [templates, setTemplates] = useState<BomTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [listError, setListError] = useState('');

  const [nodes, setNodes] = useState<BomTemplateNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [nodesError, setNodesError] = useState('');
  const [nodesKey, setNodesKey] = useState(0);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true); setListError('');
    try {
      const res = await fabQuery<{ data: BomTemplate[] }>('fabErpBomTemplate', {
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      const data = res.data ?? [];
      setTemplates(data);
      if (selectedId === null && data.length > 0) setSelectedId(data[0].id);
    } catch (e: any) { setListError(e.response?.data?.error ?? e.message); }
    finally { setLoadingTemplates(false); }
  }, [selectedId]);

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNodes = useCallback(async () => {
    if (selectedId === null) { setNodes([]); return; }
    setLoadingNodes(true); setNodesError('');
    try {
      const res = await fabQuery<{ data: BomTemplateNode[] }>('fabErpBomTemplateNode', {
        filters: { templateId: selectedId },
        orderBy: [{ field: 'sortOrder', direction: 'asc' }],
        pagination: { limit: 1000 },
      });
      setNodes(res.data ?? []);
    } catch (e: any) { setNodesError(e.response?.data?.error ?? e.message); }
    finally { setLoadingNodes(false); }
  }, [selectedId]);

  useEffect(() => { loadNodes(); }, [loadNodes, nodesKey]);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const rootNodes = nodes.filter((n) => n.parentNodeId === null).sort((a, b) => a.sortOrder - b.sortOrder);

  const filteredTemplates = templates.filter((t) => {
    const s = templateSearch.trim().toLowerCase();
    if (!s) return true;
    return t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s);
  });

  async function addRootNode() {
    if (selectedId === null) return;
    try {
      await fabMutate('fabErpBomTemplateNode', 'insert', {
        template_id: selectedId,
        parent_node_id: null,
        node_role: 'assembly',
        ref_catalog_item_id: null,
        qty: 1,
        unit: null,
        sort_order: rootNodes.length,
      });
      setNodesKey((k) => k + 1);
    } catch (e: any) { setNodesError(e.response?.data?.error ?? e.message); }
  }

  async function toggleActive(t: BomTemplate) {
    try {
      await fabMutate('fabErpBomTemplate', 'update', {
        id: t.id, name: t.name, code: t.code, base_qty: t.baseQty, base_unit: t.baseUnit,
        active: t.active ? 0 : 1,
      });
      loadTemplates();
    } catch (e: any) { setListError(e.response?.data?.error ?? e.message); }
  }

  return (
    <Box>
      <PageHeader
        title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>BOM Templates<InfoTooltip content={INFO_TEMPLATES} placement="bottom-start" /></Box>}
        subtitle="Reusable assembly patterns with parameterized raw-material slots"
        actions={canManage && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreatingTemplate(true)}>
            New Template
          </Button>
        )}
      />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* ── Left pane: template master list ───────────────────────────── */}
        <Box sx={{ flex: '0 0 340px', minWidth: 280 }}>
          <FilterBar search={templateSearch} onSearch={setTemplateSearch} placeholder="Search templates…" />

          {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

          {loadingTemplates ? (
            <ListSkeleton rows={5} />
          ) : filteredTemplates.length === 0 ? (
            <EmptyState title="No templates match" hint="Create a new BOM template to get started." />
          ) : (
            <EntityList
              rows={filteredTemplates}
              sortableFields={TEMPLATE_SORT_FIELDS}
              defaultSortKey="name"
              renderRow={(t) => (
                <EntityRow
                  key={t.id}
                  primary={t.name}
                  secondary={<Mono>{t.code}</Mono>}
                  trailing={<StatusBadge status={t.active ? 'active' : 'inactive'} family={t.active ? 'success' : 'neutral'} />}
                  onClick={() => setSelectedId(t.id)}
                  actions={canManage && (
                    <Tooltip title={t.active ? 'Deactivate' : 'Activate'}>
                      <Switch size="small" checked={!!t.active} onChange={() => toggleActive(t)} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  )}
                />
              )}
            />
          )}
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* ── Right pane: tree editor for the selected template ─────────── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!selectedTemplate ? (
            <EmptyState title="Select a template" hint="Pick a template on the left, or create a new one." />
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>{selectedTemplate.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    <Mono>{selectedTemplate.code}</Mono> · yield {selectedTemplate.baseQty} {selectedTemplate.baseUnit ?? ''}
                  </Typography>
                </Box>
                {canManage && (
                  <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={addRootNode}>
                    Add root node
                  </Button>
                )}
              </Box>

              {nodesError && <Alert severity="error" sx={{ mb: 2 }}>{nodesError}</Alert>}

              {loadingNodes ? (
                <ListSkeleton rows={4} />
              ) : rootNodes.length === 0 ? (
                <EmptyState title="No nodes yet" hint="Add a root node to start building the tree." />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {rootNodes.map((n) => (
                    <NodeRow
                      key={n.id}
                      node={n}
                      allNodes={nodes}
                      templateId={selectedTemplate.id}
                      depth={0}
                      canManage={!!canManage}
                      onChanged={() => setNodesKey((k) => k + 1)}
                      onToast={(msg, tone) => toast(msg, tone)}
                    />
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      <NewTemplateDialog
        open={creatingTemplate}
        onClose={() => setCreatingTemplate(false)}
        onCreated={(t) => {
          setTemplates((prev) => [t, ...prev.filter((x) => x.id !== t.id)]);
          setSelectedId(t.id);
          toast('Template created');
        }}
      />
    </Box>
  );
}
