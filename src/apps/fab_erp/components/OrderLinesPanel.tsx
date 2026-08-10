import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import { fabQuery, fabMutate } from '../api/client';
import { Surface, EmptyState, useToast, DataTable, QtyCell, NumberCell, Mono, backendMessage } from '../components';
import { LINE_TYPES } from '../types';

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
  const [adding, setAdding] = useState(false);
  const [delLine, setDelLine] = useState<FabOrderLine | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
        filters: { orderId },
        orderBy: [{ field: 'lineNo', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setLines(res.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Could not load line items.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

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
      setCode(''); setDescription(''); setQty('1'); setLineType(''); setUnitPrice('');
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
            { key: 'qty', header: 'Qty', width: 100, numeric: true, render: (l) => <QtyCell value={l.qty} />, sortValue: (l) => l.qty },
            { key: 'unitPrice', header: 'Unit price', width: 130, numeric: true, render: (l) => <NumberCell value={l.unitPrice ?? null} />, sortValue: (l) => l.unitPrice ?? null },
          ]}
          rowActions={canManage ? (line) => (
            <Tooltip title="Remove">
              <IconButton size="small" color="error" onClick={() => setDelLine(line)} aria-label={`Remove ${line.code ?? 'line'}`}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined}
        />
      )}

      <Dialog open={!!delLine} onClose={() => setDelLine(null)} maxWidth="xs" fullWidth>
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
    </Box>
  );
}
