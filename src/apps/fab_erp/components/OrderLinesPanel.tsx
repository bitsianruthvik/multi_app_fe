import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import LayersRounded from '@mui/icons-material/LayersRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabQuery, fabMutate } from '../api/client';
import { Surface, EmptyState, useToast, DataTable, QtyCell, NumberCell, Mono, backendMessage } from '../components';
import { LINE_TYPES } from '../types';
import { DialogCloseButton } from './FormDialog';

/**
 * Step 1: what this order is selling.
 *
 * A line used to be a catalog item. It cannot be — the item catalog holds raw
 * materials and consumables, and nobody is going to add "42m span composite
 * girder" to it, because every job is one-off and the catalog would be a
 * catalog of one. So a line is free text: a code the user types, a description,
 * a structure type and a quantity.
 *
 * THE CODE IS LOAD-BEARING. It becomes the top level of the BOM sheet, and is
 * how each row of that sheet finds the line it belongs to — which is in turn
 * how a line can report its own progress. Hence required, uppercased, and
 * checked for duplicates before the write rather than after.
 *
 * No date and no plant here. Both belong to the order: two places to answer one
 * question is two chances to disagree, and it is the order's answer that anyone
 * downstream acts on.
 */

/** What a line SAYS its steel is — its own stated values, not resolved ones. */
interface LineSpec { material: string | null; grade: string | null }

export interface FabOrderLine {
  id: number; orderId: number; lineNo: number;
  code?: string | null; description?: string | null; lineType?: string | null;
  qty: number; unit?: string | null; unitPrice?: number | null;
  qtyCompleted?: number | null;
}

export default function OrderLinesPanel({ orderId, canManage, onChanged }: {
  orderId: number;
  canManage: boolean;
  /** Fired after any write, so a wizard rail or order page can catch up. */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [lines, setLines] = useState<FabOrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [lineType, setLineType] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  /**
   * WHAT THE STEEL IS, stated once for the whole line.
   *
   * An order is normally one material and one grade throughout, and every part
   * under this line inherits these; a part that differs overrides them on
   * itself. Stating it here rather than on six hundred BOM rows is the point —
   * copy it onto every row and changing the line stops meaning anything,
   * because each row now overrides it.
   *
   * Two of the three axes nesting matches on; thickness is the part's own.
   * WHICH PLATE a part is cut from is decided later, at nesting.
   */
  const [material, setMaterial] = useState('');
  const [grade, setGrade] = useState('');
  const [spec, setSpec] = useState<Record<number, LineSpec>>({});
  const [editSpec, setEditSpec] = useState<
    { line: FabOrderLine; material: string; grade: string } | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);
  const [adding, setAdding] = useState(false);
  const [delLine, setDelLine] = useState<FabOrderLine | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
        filters: { orderId },
        orderBy: [{ field: 'lineNo', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      const rows = res.data ?? [];
      setLines(rows);
      // One call per line, but there are a handful of lines on an order — and
      // each asks what that LINE states, which no list endpoint answers.
      const specs = await Promise.all(rows.map((l) => api
        .get<LineSpec>(`${specBase()}/spec/lines/${l.id}`)
        .then((r) => [l.id, { material: r.data.material, grade: r.data.grade }] as const)
        .catch(() => [l.id, { material: null, grade: null }] as const)));
      setSpec(Object.fromEntries(specs));
    } catch (e) {
      setError(backendMessage(e, 'Could not load line items.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  /**
   * The spec routes hang off the APP root, not off `/orders/:orderId` — they
   * identify a line by its id alone, the same way the flow route does.
   */
  async function saveLineSpec() {
    if (!editSpec) return;
    setSavingSpec(true); setError('');
    try {
      await api.post(`${specBase()}/spec/lines/${editSpec.line.id}`, {
        material: editSpec.material.trim(),
        grade: editSpec.grade.trim(),
      });
      setEditSpec(null);
      await load();
      onChanged?.();
      toast('Steel set for the line');
    } catch (e) {
      setError(backendMessage(e, 'Could not set the steel.'));
    } finally { setSavingSpec(false); }
  }

  const trimmed = code.trim().toUpperCase();
  const duplicate = trimmed !== '' && lines.some((l) => (l.code ?? '').toUpperCase() === trimmed);

  async function add() {
    if (!trimmed || !qty || duplicate) return;
    setAdding(true); setError('');
    try {
      await fabMutate('fabErpOrderLine', 'insert', {
        order_id: orderId,
        line_no: lines.length + 1,
        code: trimmed,
        description: description.trim() || null,
        qty: Number(qty),
        line_type: lineType || null,
        unit_price: unitPrice ? Number(unitPrice) : null,
      });
      /**
       * The steel is a SECOND call, because a line has to exist before a field
       * value can hang off it. Re-read to find the row just written rather than
       * trusting an insertId the mutate API does not return.
       */
      if (material.trim() || grade.trim()) {
        const fresh = await fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
          filters: { orderId },
          orderBy: [{ field: 'id', direction: 'desc' }],
          pagination: { limit: 1 },
        }).then((r) => r.data?.[0]).catch(() => null);
        if (fresh) {
          await api.post(`${specBase()}/spec/lines/${fresh.id}`, {
            material: material.trim(), grade: grade.trim(),
          }).catch(() => null);
        }
      }
      setCode(''); setDescription(''); setQty('1'); setLineType(''); setUnitPrice('');
      setMaterial(''); setGrade('');
      await load();
      onChanged?.();
      toast('Line item added');
    } catch (e) {
      setError(backendMessage(e, 'Could not add the line.'));
    } finally { setAdding(false); }
  }

  async function remove(line: FabOrderLine) {
    try {
      await fabMutate('fabErpOrderLine', 'delete', { id: line.id });
      setDelLine(null);
      await load();
      onChanged?.();
      toast('Line item removed');
    } catch (e) {
      setError(backendMessage(e, 'Could not remove the line.'));
    }
  }

  if (loading) {
    return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {canManage && (
        <Surface e={1} sx={{ p: 2, mb: 2 }}>
          <Typography sx={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5,
          }}>
            Add line item
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField
              label="Code" size="small" required value={code} sx={{ flex: '0 1 150px' }}
              onChange={(e) => setCode(e.target.value)}
              error={duplicate}
              helperText={duplicate ? 'Already used on this order' : 'Top level of the BOM'}
              slotProps={{ htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 60 } }}
            />
            <TextField
              label="Description" size="small" value={description} sx={{ flex: '2 1 220px' }}
              onChange={(e) => setDescription(e.target.value)}
              helperText="What it is, in your words"
            />
            <TextField
              label="Qty" size="small" type="number" value={qty} sx={{ flex: '0 1 90px' }}
              onChange={(e) => setQty(e.target.value)}
            />
            {/* Decides what the BOM wizard offers for this line — a PEB and a
                composite girder are not built the same way. */}
            <TextField
              select label="Structure type" size="small" value={lineType} sx={{ flex: '1 1 180px' }}
              onChange={(e) => setLineType(e.target.value)}
            >
              <MenuItem value="">— not set —</MenuItem>
              {LINE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField
              label="Unit price" size="small" type="number" value={unitPrice} sx={{ flex: '0 1 120px' }}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
            {/* The steel, stated once for everything under this line. Blank is
                fine — a part can state its own, and nesting will ask for one
                before it can choose a plate. */}
            <TextField
              label="Material" size="small" value={material} sx={{ flex: '0 1 120px' }}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="MS" helperText="Applies to every part"
            />
            <TextField
              label="Grade" size="small" value={grade} sx={{ flex: '0 1 130px' }}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="E350 BO" helperText="Unless a part differs"
            />
            <Button
              variant="contained" sx={{ mt: 0.25 }}
              startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
              disabled={adding || !trimmed || !qty || duplicate}
              onClick={add}
            >
              Add
            </Button>
          </Box>
        </Surface>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={<Inventory2Rounded />}
          title="No line items yet"
          hint="Add what this order is selling — a code, a description and a quantity. The code becomes the top of its BOM."
        />
      ) : (
        <DataTable
          rows={lines}
          getRowId={(l) => l.id}
          storageKey="order-lines"
          exportName="order-lines"
          defaultSortKey="code"
          columns={[
            { key: 'code', header: 'Code', width: 160, render: (l) => (l.code ? <Mono chip>{l.code}</Mono> : '—'), sortValue: (l) => l.code ?? '' },
            { key: 'description', header: 'Description', render: (l) => l.description ?? '—', sortValue: (l) => l.description ?? '' },
            { key: 'lineType', header: 'Structure', width: 160, render: (l) => l.lineType ?? '—', sortValue: (l) => l.lineType ?? '' },
            {
              key: 'steel',
              header: 'Steel',
              width: 170,
              render: (l) => {
                const sp = spec[l.id];
                const txt = [sp?.material, sp?.grade].filter(Boolean).join(' · ');
                return txt ? <Mono>{txt}</Mono> : <span style={{ color: 'var(--c-text-3)' }}>not set</span>;
              },
              sortValue: (l) => [spec[l.id]?.material, spec[l.id]?.grade].filter(Boolean).join(' '),
            },
            { key: 'qty', header: 'Qty', width: 100, numeric: true, render: (l) => <QtyCell value={l.qty} />, sortValue: (l) => l.qty },
            { key: 'unitPrice', header: 'Unit price', width: 130, numeric: true, render: (l) => <NumberCell value={l.unitPrice ?? null} />, sortValue: (l) => l.unitPrice ?? null },
          ]}
          rowActions={canManage ? (line) => (
            <>
            <Tooltip title="Set what this line is made of">
              <IconButton
                size="small"
                onClick={() => setEditSpec({
                  line,
                  material: spec[line.id]?.material ?? '',
                  grade: spec[line.id]?.grade ?? '',
                })}
                aria-label={`Steel for ${line.code ?? 'line'}`}
              >
                <LayersRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove">
              <IconButton size="small" color="error" onClick={() => setDelLine(line)} aria-label={`Remove ${line.code ?? 'line'}`}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <Dialog open={!!delLine} onClose={() => setDelLine(null)} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => (() => setDelLine(null))()} />
        <DialogTitle sx={{ fontWeight: 600 }}>Remove line item</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5 }}>
            Remove <strong>{delLine?.code}</strong> from this order? Any BOM rows under
            that code stay where they are — they simply stop belonging to a line.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelLine(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delLine && remove(delLine)}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/*
        WHAT THIS LINE IS MADE OF.

        Set here rather than on each BOM row because it is one statement about
        the whole line, and every part inherits it. A part that genuinely
        differs — a stainless insert in a mild-steel span — overrides it on
        itself, and nesting refuses any plate that disagrees with either.
      */}
      <Dialog open={!!editSpec} onClose={() => setEditSpec(null)} maxWidth="xs" fullWidth>
        <DialogCloseButton absolute onClose={() => setEditSpec(null)} />
        <DialogTitle sx={{ fontWeight: 600 }}>
          Steel for {editSpec?.line.code}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 2 }}>
            Every part under this line is made of this, unless the part says
            otherwise. Together with each part&apos;s thickness, this is what nesting
            matches against when it picks a plate.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <TextField
              label="Material" size="small" fullWidth autoFocus
              value={editSpec?.material ?? ''} placeholder="MS"
              onChange={(e) => setEditSpec((v) => (v ? { ...v, material: e.target.value } : v))}
            />
            <TextField
              label="Grade" size="small" fullWidth
              value={editSpec?.grade ?? ''} placeholder="E350 BO"
              onChange={(e) => setEditSpec((v) => (v ? { ...v, grade: e.target.value } : v))}
            />
          </Box>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1.5 }}>
            Clearing a box removes it, and the parts stop inheriting that value.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSpec(null)}>Cancel</Button>
          <Button
            variant="contained" disabled={savingSpec}
            startIcon={savingSpec ? <CircularProgress size={14} color="inherit" /> : undefined}
            onClick={saveLineSpec}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** The fab_erp app root, which the spec routes hang off. */
function specBase() {
  return `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;
}
