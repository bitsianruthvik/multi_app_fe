/**
 * OrderSparesDialog — buy spares for one machine.
 *
 * The mirror image of BuyMachineDialog: that one is raised against the resource
 * TYPE because the machine does not exist yet, this one against the RESOURCE
 * because the whole question is which machine the bearing is for. The purchase
 * order carries `for_resource_id`, so "what has plasma table #2 cost us in
 * spares" has an answer.
 *
 * SPARES COME FROM THE CATALOG, with free text as the fallback. That was the
 * decision on 2026-08-16 — "all spares should come from item catalog with
 * category spares" — and the catalog picker is the default here. But
 * `fab_order_lines.catalog_item_id` is nullable on purpose: nobody wants a
 * catalog item per O-ring, and inventing one to satisfy a foreign key fills the
 * material catalog with things that are not materials, which then show up in
 * every raw-material picker in the app.
 *
 * THE CONSEQUENCE IS STATED IN THE UI, not just in a comment: a free-text line
 * cannot be received into stock, because there is nowhere to put it. Pick the
 * catalog item if you want it on a shelf afterwards.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';

import { fabQuery } from '../api/client';
import { backendMessage, useToast, Mono } from '../components';
import { raiseAssetPurchase, fetchSpareParts, type SparePart } from '../api/assets';
import { DialogCloseButton } from './FormDialog';

interface Supplier { id: number; code: string; name: string }

interface Line {
  key: number;
  /** The catalog row, when this line is a catalogued spare. */
  item: SparePart | null;
  description: string;
  qty: string;
  unitPrice: string;
}

const blankLine = (key: number): Line => ({ key, item: null, description: '', qty: '1', unitPrice: '' });

export default function OrderSparesDialog({ open, resource, onClose, onDone }: {
  open: boolean;
  resource: { id: number; name: string; code: string } | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [spares, setSpares] = useState<SparePart[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(''); setExpectedDate(''); setNotes(''); setSupplierId('');
    setLines([blankLine(1)]);
    fabQuery<{ data: Supplier[] }>('fabErpSupplier', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 500 },
    }).then((r) => setSuppliers(r.data ?? [])).catch(() => setSuppliers([]));
    fetchSpareParts().then((r) => setSpares(r.items ?? [])).catch(() => setSpares([]));
  }, [open]);

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const usable = lines.filter((l) => (l.item || l.description.trim()) && Number(l.qty) > 0);

  async function raise() {
    if (!resource || !supplierId || !usable.length) return;
    setBusy(true); setError('');
    try {
      const res = await raiseAssetPurchase({
        resourceId: resource.id,
        supplierId: Number(supplierId),
        expectedDate: expectedDate || null,
        notes: notes.trim() || null,
        lines: usable.map((l) => ({
          description: l.item ? `${l.item.name}` : l.description.trim(),
          code: l.item?.code,
          unit: l.item?.unit ?? undefined,
          catalogItemId: l.item?.id ?? null,
          qty: Number(l.qty) || 1,
          unitPrice: l.unitPrice.trim() ? Number(l.unitPrice) : null,
        })),
      });
      toast(`${res.order.orderNumber} raised for ${resource.code}`, 'success');
      onDone?.();
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not raise that purchase order.'));
    } finally { setBusy(false); }
  }

  const anyFreeText = usable.some((l) => !l.item);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        Order spares
        {resource && (
          <Typography sx={{ fontSize: 12.5, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.25 }}>
            for {resource.name} (<Mono>{resource.code}</Mono>) — the order is recorded against this machine
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            select size="small" label="Supplier *" value={supplierId} sx={{ minWidth: 240 }}
            onChange={(e) => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <MenuItem value="">— choose a supplier —</MenuItem>
            {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField
            size="small" type="date" label="Expected" sx={{ width: 170 }}
            slotProps={{ inputLabel: { shrink: true } }}
            value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
          />
        </Box>

        <Box>
          <Typography sx={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75,
          }}>
            Lines
          </Typography>
          {lines.map((l) => (
            <Box key={l.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
              <Autocomplete
                size="small" sx={{ flex: 1, minWidth: 220 }}
                options={spares}
                value={l.item}
                getOptionLabel={(o) => `${o.code} — ${o.name}`}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                onChange={(_, v) => setLine(l.key, { item: v })}
                renderInput={(p) => (
                  <TextField {...p} label="Spare (from catalog)" placeholder="Search spares…" />
                )}
              />
              <TextField
                size="small" label="…or describe it" sx={{ flex: 1, minWidth: 180 }}
                value={l.description} disabled={!!l.item}
                onChange={(e) => setLine(l.key, { description: e.target.value })}
                helperText={l.item ? 'Using the catalog item' : 'Cannot be received into stock'}
              />
              <TextField
                size="small" type="number" label="Qty" sx={{ width: 82 }}
                value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })}
              />
              <TextField
                size="small" type="number" label="Unit price" sx={{ width: 110 }}
                value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
              />
              <Tooltip title="Remove line">
                <span>
                  <IconButton
                    size="small" color="error" disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
          <Button
            size="small" startIcon={<AddRounded />}
            onClick={() => setLines((ls) => [...ls, blankLine(Math.max(...ls.map((x) => x.key)) + 1)])}
          >
            Add line
          </Button>
        </Box>

        {anyFreeText && (
          <Alert severity="info">
            A described line records the spend but cannot be received into stock — there is
            nowhere to put it. Pick the catalog item instead if you want it on a shelf afterwards.
          </Alert>
        )}

        <TextField
          size="small" label="Notes" multiline minRows={2}
          value={notes} onChange={(e) => setNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={raise}
          disabled={busy || !supplierId || !usable.length}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Raising…' : `Raise PO${usable.length ? ` (${usable.length} line${usable.length > 1 ? 's' : ''})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
